import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import browser_playback as playback
import control_api as api

SUPPORT = {"mp4": ["aac", "mp3"], "webm": ["opus", "vorbis"]}


def wait(manager, job):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        result = manager.status(job["id"])
        if result["state"] in {"ready", "failed"}:
            return result
        time.sleep(.02)
    raise AssertionError(manager.status(job["id"]))


def info(codec="ac3", video="h264", duration="2.0"):
    return {"format": {"format_name": "mov,mp4,m4a,3gp,3g2,mj2", "duration": duration},
            "streams": [{"index": 0, "codec_type": "video", "codec_name": video},
                        {"index": 1, "codec_type": "audio", "codec_name": codec}]}


class PlanTests(unittest.TestCase):
    def test_manual_repair_converts_even_declared_compatible_audio(self):
        self.assertFalse(playback.playback_plan(info("aac"), SUPPORT, repair_audio=True)["direct"])
        with self.assertRaisesRegex(playback.PlaybackError, "VIDEO_UNSUPPORTED"):
            playback.playback_plan(info("aac", video="mpeg2video"), SUPPORT, repair_audio=True)
        with self.assertRaisesRegex(playback.PlaybackError, "AAC_UNSUPPORTED"):
            playback.playback_plan(info(), {"mp4": ["ac3"]}, repair_audio=True)
        silent = info()
        silent["streams"].pop()
        with self.assertRaisesRegex(playback.PlaybackError, "NO_AUDIO"):
            playback.playback_plan(silent, SUPPORT, repair_audio=True)

    def test_compatible_audio_and_silent_video_do_not_convert(self):
        self.assertTrue(playback.playback_plan(info("aac"), SUPPORT)["direct"])
        silent = info()
        silent["streams"].pop()
        self.assertTrue(playback.playback_plan(silent, SUPPORT)["direct"])

    def test_actual_browser_support_and_default_language_are_respected(self):
        self.assertFalse(playback.playback_plan(info(), SUPPORT)["direct"])
        self.assertTrue(playback.playback_plan(info(), {"mp4": ["ac3"]})["direct"])
        data = info("aac")
        data["streams"].append({"index": 3, "codec_type": "audio", "codec_name": "ac3", "tags": {"language": "spa"}, "disposition": {"default": 1}})
        plan = playback.playback_plan(data, SUPPORT)
        self.assertFalse(plan["direct"])
        self.assertEqual(plan["audio"]["index"], 3)

    def test_webm_remains_direct_and_unsupported_video_is_not_transcoded(self):
        webm = info("opus", "vp9")
        webm["format"]["format_name"] = "matroska,webm"
        self.assertTrue(playback.playback_plan(webm, SUPPORT)["direct"])
        with self.assertRaisesRegex(playback.PlaybackError, "VIDEO_UNSUPPORTED"):
            playback.playback_plan(info(video="mpeg2video"), SUPPORT)
        with self.assertRaisesRegex(playback.PlaybackError, "AAC_UNSUPPORTED"):
            playback.playback_plan(info(), {"mp4": []})


class JobTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.source = self.root / "movie.mp4"
        self.source.write_bytes(b"original")
        self.manager = playback.BrowserPlayback(self.root / "cache")

    def test_manual_repair_does_not_reuse_a_direct_play_decision_but_reuses_a_copy(self):
        key = playback.fingerprint(self.source)
        self.manager.root.mkdir()
        (self.manager.root / (key + ".mp4")).write_bytes(b"compatible movie")
        with patch.object(playback, "probe", return_value=info("aac")), patch.object(self.manager, "_prepare", side_effect=AssertionError("must reuse completed copy")):
            direct = wait(self.manager, self.manager.prepare(self.source, SUPPORT))
            repaired = wait(self.manager, self.manager.prepare(self.source, SUPPORT, repair_audio=True))
            duplicate = self.manager.prepare(self.source, SUPPORT, repair_audio=True)
        self.assertFalse(direct["converted"])
        self.assertNotEqual(direct["id"], repaired["id"])
        self.assertEqual(repaired["id"], duplicate["id"])
        self.assertTrue(repaired["converted"])
        self.assertEqual(repaired["cacheKey"], key)

    def test_failures_are_retriable_and_do_not_modify_original(self):
        with patch.object(playback, "probe", side_effect=playback.PlaybackError("TOOLS_MISSING")):
            first = wait(self.manager, self.manager.prepare(self.source, SUPPORT))
        self.assertEqual(first["errorCode"], "TOOLS_MISSING")
        self.assertEqual(self.manager.prepare(self.source, SUPPORT)["state"], "failed")
        with patch.object(playback, "probe", return_value=info("aac")):
            second = wait(self.manager, self.manager.prepare(self.source, SUPPORT, retry=True))
        self.assertEqual(second["state"], "ready")
        self.assertEqual(self.source.read_bytes(), b"original")

    def test_deduplication_and_direct_play_during_another_conversion(self):
        entered, release = threading.Event(), threading.Event()
        def conversion(job_id):
            entered.set()
            release.wait(5)
            self.manager._update(job_id, state="ready", converted=True, percent=100)
        with patch.object(playback, "probe", side_effect=lambda path: info("aac" if Path(path).name == "direct.mp4" else "ac3")), patch.object(self.manager, "_prepare", side_effect=conversion):
            job = self.manager.prepare(self.source, SUPPORT)
            self.assertTrue(entered.wait(3))
            self.assertEqual(self.manager.prepare(self.source, SUPPORT)["id"], job["id"])
            direct = self.root / "direct.mp4"
            direct.write_bytes(b"compatible")
            try:
                result = wait(self.manager, self.manager.prepare(direct, SUPPORT))
                self.assertFalse(result["converted"])
            finally:
                release.set()
                self.manager.queue.join()

    def test_cache_limit_space_and_recent_playback_protection(self):
        self.manager.max_cache_bytes = 100
        self.manager.root.mkdir()
        recent = self.manager.root / "recent.mp4"
        recent.write_bytes(b"x" * 80)
        with self.assertRaisesRegex(playback.PlaybackError, "CACHE_FULL"):
            self.manager._make_room(40)
        self.assertTrue(recent.exists())
        os.utime(recent, (0, 0))
        self.manager._make_room(40)
        self.assertFalse(recent.exists())
        with patch.object(playback.shutil, "disk_usage", return_value=shutil._ntuple_diskusage(100, 99, 1)):
            with self.assertRaisesRegex(playback.PlaybackError, "NO_SPACE"):
                self.manager._make_room(10)

    def test_failed_conversion_does_not_publish_partial_copy(self):
        class FailedProcess:
            def __init__(self, command, **kwargs):
                Path(command[-1]).write_bytes(b"unfinished mp4")
                self.stdout = io.StringIO("out_time_us=1000000\nprogress=continue\n")
            def wait(self): return 1
            def poll(self): return 1
            def kill(self): pass
        with patch.object(playback, "probe", return_value=info()), patch.object(playback.subprocess, "Popen", FailedProcess):
            result = wait(self.manager, self.manager.prepare(self.source, SUPPORT))
        self.assertEqual(result["state"], "failed")
        self.assertEqual(result["errorCode"], "CONVERSION_FAILED")
        self.assertEqual(list(self.manager.root.glob("*.mp4")), [])
        self.assertEqual(self.source.read_bytes(), b"original")


class ApiTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.video_root = self.root / "videos"
        self.video_root.mkdir()
        self.source = self.video_root / "movie.mp4"
        self.source.write_bytes(b"original movie")
        self.manager = playback.BrowserPlayback(self.root / "cache")
        for name, value in [("VIDEOS_DIR", str(self.video_root)), ("browser_playback_store", self.manager)]:
            mocked = patch.object(api, name, value)
            mocked.start()
            self.addCleanup(mocked.stop)
        mocked = patch.object(api, "current_web_pin", return_value="test-pin")
        mocked.start()
        self.addCleanup(mocked.stop)
        self.client = api.app.test_client()
        self.headers = {"X-Web-Pin": "test-pin"}

    def post(self, **values):
        return self.client.post("/media/playback", json={"relativePath": "movie.mp4", "supportedAudio": SUPPORT, **values}, headers=self.headers)

    def test_auth_validation_and_source_boundaries(self):
        self.assertEqual(self.client.post("/media/playback", json={}).status_code, 401)
        self.assertEqual(self.client.get("/media/playback?id=test").status_code, 401)
        self.assertEqual(self.post(supportedAudio={"mp4": ["bad"], "webm": []}).status_code, 400)
        self.assertEqual(self.post(repairAudio="true").status_code, 400)
        self.assertEqual(self.post(relativePath="../escape.mp4").status_code, 404)
        external = self.root / "external.mp4"
        external.write_bytes(b"private")
        (self.video_root / "linked.mp4").symlink_to(external)
        self.assertEqual(self.post(relativePath="linked.mp4").status_code, 404)
        self.assertEqual(self.client.get("/media/stream?relativePath=linked.mp4", headers=self.headers).status_code, 404)
        self.assertEqual(self.post(relativePath="bad\x00.mp4").status_code, 400)

    def test_ready_cache_supports_ranges_downloads_original_and_invalidates(self):
        key = playback.fingerprint(self.source)
        self.manager.root.mkdir()
        (self.manager.root / (key + ".mp4")).write_bytes(b"compatible movie")
        url = f"/media/stream?relativePath=movie.mp4&browserCopy={key}&pin=test-pin"
        response = self.client.get(url, headers={"Range": "bytes=0-3"})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.data, b"comp")
        self.assertEqual(response.mimetype, "video/mp4")
        response.close()
        response = self.client.get(url + "&download=1")
        self.assertEqual(response.data, b"original movie")
        response.close()
        self.source.write_bytes(b"replacement movie")
        self.assertEqual(self.client.get(url).status_code, 409)

    def test_status_is_private_and_unknown_jobs_allow_restart_recovery(self):
        with patch.object(playback, "probe", return_value=info("aac")):
            response = self.post()
            self.assertEqual(response.status_code, 200)
            job = wait(self.manager, response.json)
        response = self.client.get("/media/playback?id=" + job["id"], headers=self.headers)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertNotIn("path", response.json)
        self.assertEqual(response.json["state"], "ready")
        self.assertEqual(self.client.get("/media/playback?id=unknown", headers=self.headers).json["errorCode"], "JOB_NOT_FOUND")

    def test_manual_repair_option_reaches_the_conversion_manager(self):
        key = playback.fingerprint(self.source)
        self.manager.root.mkdir()
        (self.manager.root / (key + ".mp4")).write_bytes(b"compatible movie")
        with patch.object(playback, "probe", return_value=info("aac")):
            response = self.post(repairAudio=True)
            self.assertEqual(response.status_code, 200)
            result = wait(self.manager, response.json)
        self.assertTrue(result["converted"])
        self.assertEqual(result["cacheKey"], key)


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg integration requires installed tools")
class RealConversionTests(unittest.TestCase):
    def test_ac3_to_aac_video_original_subtitles_and_restart_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "alien-fixture.mp4"
            subtitles = root / "fixture.srt"
            subtitles.write_text("1\n00:00:00,000 --> 00:00:01,500\nTest subtitle\n")
            subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=160x90:r=24:d=2",
                            "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-i", str(subtitles),
                            "-c:v", "libx264", "-c:a", "ac3", "-ac", "6", "-c:s", "mov_text",
                            "-metadata:s:a:0", "language=spa", str(source)], check=True, capture_output=True)
            original = hashlib.sha256(source.read_bytes()).hexdigest()
            manager = playback.BrowserPlayback(root / "cache")
            updates = []
            real_update = manager._update
            def update(job_id, **values):
                updates.append(values.copy())
                real_update(job_id, **values)
            with patch.object(manager, "_update", side_effect=update):
                # Even a browser claiming AC-3 support must honor manual repair.
                result = wait(manager, manager.prepare(source, {**SUPPORT, "mp4": ["aac", "ac3"]}, repair_audio=True))
            self.assertEqual(result["state"], "ready", result)
            target = manager.cached_path(source, result["cacheKey"])
            output = playback.probe(target)
            audio = playback.selected_stream(output["streams"], "audio")
            self.assertEqual((audio["codec_name"], audio["channels"], audio["tags"]["language"]), ("aac", 2, "spa"))
            self.assertTrue(any(s["codec_name"] == "mov_text" for s in output["streams"]))
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), original)
            def video_hashes(path):
                result = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_packets", "-show_data_hash", "sha256", "-show_entries", "packet=data_hash", "-of", "json", str(path)], capture_output=True, check=True)
                return json.loads(result.stdout)["packets"]
            self.assertEqual(video_hashes(source), video_hashes(target))
            self.assertTrue(any(u.get("state") == "converting" and u.get("percent") == 0 for u in updates))
            self.assertTrue(any(u.get("state") == "finalizing" and u.get("percent") == 99 for u in updates))
            restarted = playback.BrowserPlayback(root / "cache")
            with patch.object(restarted, "_prepare", side_effect=AssertionError("must reuse completed copy")):
                cached = wait(restarted, restarted.prepare(source, SUPPORT, repair_audio=True))
            self.assertEqual(cached["cacheKey"], result["cacheKey"])
            self.assertFalse(list(manager.root.glob("*.part.mp4")))


if __name__ == "__main__":
    unittest.main()
