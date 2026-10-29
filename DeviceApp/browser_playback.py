"""On-demand audio preparation for the web player; originals are never modified."""
import hashlib
import json
import logging
import math
import os
from pathlib import Path
import queue
import shutil
import subprocess
import tempfile
import threading
import time


AUDIO_CODECS = frozenset({"aac", "mp3", "opus", "vorbis", "flac", "ac3", "eac3"})
MP4_VIDEO_CODECS = frozenset({"h264", "hevc", "av1", "vp9"})
ACTIVE = frozenset({"queued", "checking", "converting", "finalizing"})
RECIPE = "aac-stereo-192k-v1"


class PlaybackError(Exception):
    def __init__(self, code, status=422):
        super().__init__(code)
        self.code, self.status = code, status


def fingerprint(path):
    path = Path(path).resolve()
    stat = path.stat()
    return hashlib.sha256(json.dumps([RECIPE, str(path), stat.st_size,
                                     stat.st_mtime_ns, stat.st_ctime_ns, stat.st_ino]).encode()).hexdigest()


def probe(path):
    executable = shutil.which("ffprobe")
    if not executable:
        raise PlaybackError("TOOLS_MISSING", 503)
    try:
        result = subprocess.run([executable, "-v", "error", "-show_streams", "-show_format",
                                 "-of", "json", str(path)], capture_output=True, timeout=30, check=True)
        return json.loads(result.stdout)
    except (subprocess.SubprocessError, ValueError, OSError) as error:
        raise PlaybackError("PROBE_FAILED") from error


def selected_stream(streams, kind):
    candidates = [s for s in streams if s.get("codec_type") == kind
                  and not s.get("disposition", {}).get("attached_pic")]
    return next((s for s in candidates if s.get("disposition", {}).get("default")),
                candidates[0] if candidates else None)


def playback_plan(info, supported, repair_audio=False):
    streams = info.get("streams", [])
    video, audio = selected_stream(streams, "video"), selected_stream(streams, "audio")
    if not video:
        raise PlaybackError("NO_VIDEO")
    if repair_audio and not audio:
        raise PlaybackError("NO_AUDIO")
    formats = set(info.get("format", {}).get("format_name", "").split(","))
    container = "mp4" if "mp4" in formats else "webm" if "webm" in formats else None
    # ffprobe reports Matroska and WebM together. Only WebM codecs can be direct-played.
    if container == "webm" and video.get("codec_name") not in {"vp8", "vp9", "av1"}:
        container = None
    direct = not repair_audio and bool(container) and (not audio or audio.get("codec_name") in supported.get(container, []))
    if not direct and video.get("codec_name") not in MP4_VIDEO_CODECS:
        raise PlaybackError("VIDEO_UNSUPPORTED")
    if not direct and audio and "aac" not in supported.get("mp4", []):
        raise PlaybackError("AAC_UNSUPPORTED")
    try:
        duration = float(video.get("duration") or info.get("format", {}).get("duration") or 0)
    except (ValueError, TypeError):
        duration = 0
    return {"direct": direct, "video": video, "audio": audio,
            "duration": duration if math.isfinite(duration) and duration > 0 else 0}


class BrowserPlayback:
    def __init__(self, cache_dir, max_cache_bytes=20 * 1024 ** 3):
        self.root = Path(cache_dir)
        self.max_cache_bytes = max_cache_bytes
        self.jobs = {}
        self.lock = threading.RLock()
        self.queue = queue.Queue()
        self.check_queue = queue.Queue()
        self.worker = None

    def prepare(self, path, supported, retry=False, repair_audio=False):
        source = fingerprint(path)
        job_id = hashlib.sha256((source + json.dumps([supported, repair_audio], sort_keys=True)).encode()).hexdigest()
        with self.lock:
            existing = self.jobs.get(job_id)
            if existing and not (retry and existing["state"] == "failed"):
                if existing["state"] != "ready" or not existing.get("converted") or self._cached(source):
                    return self.status(job_id)
            if sum(j["state"] in ACTIVE for j in self.jobs.values()) >= 16:
                raise PlaybackError("QUEUE_FULL", 429)
            # Bound memory while retaining active jobs and recently completed status.
            for key in list(self.jobs):
                if len(self.jobs) < 128:
                    break
                if self.jobs[key]["state"] not in ACTIVE:
                    del self.jobs[key]
            self.jobs[job_id] = {"id": job_id, "state": "checking", "percent": None,
                                 "created": time.time(), "path": str(path), "source": source,
                                 "supported": supported, "repair_audio": repair_audio}
            self.check_queue.put_nowait(job_id)
            if self.worker is None:
                self.worker = threading.Thread(target=self._work, daemon=True, name="browser-audio")
                self.worker.start()
                threading.Thread(target=self._work, args=(True,), daemon=True, name="browser-audio-check").start()
            return self.status(job_id)

    def status(self, job_id):
        with self.lock:
            job = self.jobs.get(job_id)
            if not job:
                raise PlaybackError("JOB_NOT_FOUND", 404)
            result = {key: job[key] for key in ("id", "state", "percent", "converted", "cacheKey", "errorCode") if key in job}
            elapsed = max(0, time.time() - job.get("started", job["created"]))
            result["elapsedSeconds"] = round(elapsed)
            percent = job.get("percent") or 0
            result["remainingSeconds"] = round(elapsed * (100 - percent) / percent) if job["state"] == "converting" and percent >= 1 else None
            result["queuePosition"] = 1 + sum(j["state"] in {"queued", "converting", "finalizing"} and j["created"] < job["created"] for j in self.jobs.values()) if job["state"] == "queued" else 0
            return result

    def _update(self, job_id, **values):
        with self.lock:
            self.jobs[job_id].update(values)

    def _cached(self, source):
        with self.lock:
            target = self.root / (source + ".mp4")
            if target.is_file() and not target.is_symlink() and target.stat().st_size > 0:
                os.utime(target, None)  # Keep recently played copies out of eviction.
                return target
        return None

    def cached_path(self, path, key):
        if key != fingerprint(path):
            raise PlaybackError("COPY_EXPIRED", 409)
        target = self._cached(key)
        if not target:
            raise PlaybackError("COPY_EXPIRED", 409)
        return target

    def _make_room(self, estimated):
        self.root.mkdir(parents=True, exist_ok=True)
        files = sorted((p for p in self.root.glob("*.mp4") if not p.is_symlink() and not p.name.endswith(".part.mp4")), key=lambda p: p.stat().st_mtime)
        total = sum(p.stat().st_size for p in files)
        reserve = 256 * 1024 ** 2
        for path in files:
            if total + estimated <= self.max_cache_bytes and shutil.disk_usage(self.root).free >= estimated + reserve:
                break
            # Do not remove copies that may still be open in a web player.
            if time.time() - path.stat().st_mtime < 12 * 3600:
                continue
            total -= path.stat().st_size
            path.unlink()
        if total + estimated > self.max_cache_bytes:
            raise PlaybackError("CACHE_FULL")
        if shutil.disk_usage(self.root).free < estimated + reserve:
            raise PlaybackError("NO_SPACE")

    def _work(self, checking=False):
        work_queue = self.check_queue if checking else self.queue
        while True:
            job_id = work_queue.get()
            try:
                (self._check if checking else self._prepare)(job_id)
            except PlaybackError as error:
                self._update(job_id, state="failed", errorCode=error.code)
            except Exception:
                logging.getLogger(__name__).exception("Browser audio preparation failed")
                self._update(job_id, state="failed", errorCode="CONVERSION_FAILED")
            finally:
                work_queue.task_done()

    def _check(self, job_id):
        job = self.jobs[job_id]
        path, source = Path(job["path"]), job["source"]
        self._update(job_id, state="checking", started=time.time())
        if fingerprint(path) != source:
            raise PlaybackError("SOURCE_CHANGED")
        info = probe(path)
        plan = playback_plan(info, job["supported"], repair_audio=job["repair_audio"])
        if plan["direct"]:
            self._update(job_id, state="ready", percent=100, converted=False)
            return
        if self._cached(source):
            self._update(job_id, state="ready", percent=100, converted=True, cacheKey=source)
            return
        self._update(job_id, state="queued", plan=plan, streams=info.get("streams", []))
        self.queue.put_nowait(job_id)

    def _prepare(self, job_id):
        job = self.jobs[job_id]
        path, source, plan = Path(job["path"]), job["source"], job["plan"]
        if fingerprint(path) != source:
            raise PlaybackError("SOURCE_CHANGED")
        if self._cached(source):
            self._update(job_id, state="ready", percent=100, converted=True, cacheKey=source)
            return
        executable = shutil.which("ffmpeg")
        if not executable:
            raise PlaybackError("TOOLS_MISSING", 503)
        # Video is copied, so source size plus AAC and mux overhead is a conservative estimate.
        estimated = int(path.stat().st_size * 1.05 + plan["duration"] * 24000 + 16 * 1024 ** 2)
        # Only one worker exists in the API service. Remove partial copies left by a restart.
        for orphan in self.root.glob("*.part.mp4"):
            orphan.unlink(missing_ok=True)
        with self.lock:
            self._make_room(estimated)
        temporary = self.root / (source + ".part.mp4")
        command = [executable, "-hide_banner", "-nostdin", "-y", "-v", "error", "-nostats",
                   "-progress", "pipe:1", "-i", str(path), "-map", f"0:{plan['video']['index']}", "-c:v", "copy"]
        if plan["video"]["codec_name"] == "hevc":
            command += ["-tag:v", "hvc1"]
        if plan["audio"]:
            command += ["-map", f"0:{plan['audio']['index']}", "-c:a", "aac", "-ac", "2", "-b:a", "192k", "-threads", "2"]
        # Preserve MP4 text subtitles; external SRT stays attached to the original URL.
        for subtitle in job["streams"]:
            if subtitle.get("codec_type") == "subtitle" and subtitle.get("codec_name") == "mov_text":
                command += ["-map", f"0:{subtitle['index']}"]
        command += ["-c:s", "copy", "-movflags", "+faststart", str(temporary)]
        self._update(job_id, state="converting", percent=0 if plan["duration"] else None, started=time.time())
        process = None
        watchdog = None
        try:
            with tempfile.TemporaryFile() as errors:
                process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=errors, text=True)
                watchdog = threading.Timer(6 * 3600, process.kill)
                watchdog.daemon = True
                watchdog.start()
                for line in process.stdout:
                    name, _, value = line.strip().partition("=")
                    if name == "out_time_us" and plan["duration"]:
                        try:
                            percent = min(99, max(0, float(value) / 10000 / plan["duration"]))
                        except ValueError:
                            continue
                        self._update(job_id, percent=round(percent, 1), state="finalizing" if percent >= 99 else "converting")
                    elif name == "total_size" and value.isdigit() and int(value) > estimated:
                        raise PlaybackError("NO_SPACE")
                if process.wait() != 0:
                    raise PlaybackError("NO_SPACE" if shutil.disk_usage(self.root).free < 256 * 1024 ** 2 else "CONVERSION_FAILED")
            self._update(job_id, state="finalizing", percent=99)
            result = probe(temporary)
            output_audio = selected_stream(result.get("streams", []), "audio")
            output_video = selected_stream(result.get("streams", []), "video")
            if not output_video or (plan["audio"] and (not output_audio or output_audio.get("codec_name") != "aac")):
                raise PlaybackError("CONVERSION_FAILED")
            output_duration = float(result.get("format", {}).get("duration") or 0)
            if plan["duration"] and output_duration < plan["duration"] - max(2, plan["duration"] * .01):
                raise PlaybackError("CONVERSION_FAILED")
            if fingerprint(path) != source:
                raise PlaybackError("SOURCE_CHANGED")
            os.replace(temporary, self.root / (source + ".mp4"))
            self._update(job_id, state="ready", percent=100, converted=True, cacheKey=source)
        finally:
            if watchdog:
                watchdog.cancel()
            if process:
                if process.poll() is None:
                    process.kill()
                process.wait()
                process.stdout.close()
            temporary.unlink(missing_ok=True)
