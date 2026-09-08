"""Persistent TMDB metadata/artwork and a single resumable download worker."""
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

IMAGE_RE = re.compile(r"/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp|svg)")
DETAIL_RE = re.compile(r"/(?:movie/\d+(?:/images)?|tv/\d+(?:/images|/season/\d+(?:/images|/episode/\d+/images)?)?)")
LANGUAGES = ("es-ES", "ca-ES", "en-US")


def atomic_write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".download-")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class TmdbCache:
    def __init__(self, root, credentials):
        self.root = Path(root)
        self.credentials = credentials
        self.io_locks = [threading.RLock() for _ in range(64)]
        self.network_slots = threading.BoundedSemaphore(3)
        self.jobs_lock = threading.RLock()
        self.worker = None
        try:
            self.jobs = json.loads((self.root / "jobs.json").read_text())
        except (OSError, ValueError):
            self.jobs = {}
        for job in self.jobs.values():
            if job["state"] == "running":
                job["state"] = "pending"
                job["refresh"] = False

    def _download(self, url, headers, limit):
        with self.network_slots:
            return self._download_with_retries(url, headers, limit)

    def _download_with_retries(self, url, headers, limit):
        # Fixed upstreams; do not follow redirects to arbitrary hosts.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None
        opener = urllib.request.build_opener(NoRedirect)
        for attempt in range(3):
            try:
                with opener.open(urllib.request.Request(url, headers=headers), timeout=30) as response:
                    data = response.read(limit + 1)
                    if not data or len(data) > limit:
                        raise ValueError("Respuesta TMDB vacía o demasiado grande")
                    return data, response.headers.get_content_type()
            except urllib.error.HTTPError as exc:
                if attempt == 2 or exc.code not in (429, 500, 502, 503, 504):
                    raise RuntimeError(f"TMDB HTTP {exc.code}") from None
                delay = exc.headers.get("Retry-After", "")
                time.sleep(min(30, int(delay)) if delay.isdigit() else 2 ** attempt)
            except (OSError, TimeoutError):
                if attempt == 2:
                    raise RuntimeError("No se pudo conectar con TMDB") from None
                time.sleep(2 ** attempt)

    def json(self, path, params=None, refresh=False):
        if not DETAIL_RE.fullmatch(path) and path not in ("/search/movie", "/search/tv"):
            raise ValueError("Ruta TMDB no permitida")
        params = {k: str(v) for k, v in (params or {}).items()
                  if k in {"language", "query", "page", "include_adult", "append_to_response", "include_image_language"} and v is not None}
        if path.endswith("/images"):
            # One complete image inventory across all languages, shared by every UI language.
            params = {}
        cache_key = hashlib.sha256((path + "?" + urllib.parse.urlencode(sorted(params.items()))).encode()).hexdigest()
        target = self.root / "metadata" / (cache_key + ".json")
        with self.io_locks[hash(str(target)) % len(self.io_locks)]:
            try:
                if not refresh:
                    return json.loads(target.read_text())
            except (OSError, ValueError):
                pass
            credentials = self.credentials()
            headers = {"Accept": "application/json"}
            if credentials.get("bearerToken"):
                headers["Authorization"] = "Bearer " + credentials["bearerToken"]
            elif credentials.get("apiKey"):
                params["api_key"] = credentials["apiKey"]
            else:
                raise RuntimeError("Configura las credenciales de TMDB antes de descargar")
            url = "https://api.themoviedb.org/3" + path + "?" + urllib.parse.urlencode(params)
            raw, _ = self._download(url, headers, 16 * 1024 * 1024)
            data = json.loads(raw)
            if not isinstance(data, dict) or data.get("success") is False:
                raise RuntimeError("Respuesta TMDB inválida")
            atomic_write(target, raw)
            return data

    def image(self, path):
        if not IMAGE_RE.fullmatch(path):
            raise ValueError("Ruta de imagen no permitida")
        target = self.root / "images" / path.lstrip("/")
        with self.io_locks[hash(str(target)) % len(self.io_locks)]:
            if target.is_file() and target.stat().st_size:
                return target
            raw, content_type = self._download("https://image.tmdb.org/t/p/original" + path, {}, 64 * 1024 * 1024)
            if not content_type.startswith("image/"):
                raise ValueError("TMDB no devolvió una imagen")
            atomic_write(target, raw)
        return target

    def _images_in(self, data):
        paths = set()
        if isinstance(data, dict):
            for key, value in data.items():
                if key in {"poster_path", "backdrop_path", "still_path", "profile_path", "file_path", "logo_path"} and isinstance(value, str) and IMAGE_RE.fullmatch(value):
                    paths.add(value)
                else:
                    paths.update(self._images_in(value))
        elif isinstance(data, list):
            for value in data:
                paths.update(self._images_in(value))
        return paths

    def warm(self, kind, tmdb_id, extra_images=(), refresh=False):
        base = f"/{kind}/{tmdb_id}"
        images = set(extra_images)
        errors = []
        collected = {}
        def collect(path, params=None):
            try:
                key = (path, json.dumps(params, sort_keys=True))
                if key in collected:
                    return collected[key]
                data = self.json(path, params, refresh=refresh)
                collected[key] = data
                images.update(self._images_in(data))
                return data
            except Exception as exc:
                errors.append(f"{path}: {exc}")
                return {}
        collect(base + "/images")
        for language in LANGUAGES:
            params = {"language": language}
            if kind == "movie":
                params["append_to_response"] = "external_ids"
            detail = collect(base, params)
            if kind == "tv":
                for season in detail.get("seasons", []):
                    number = season.get("season_number")
                    if not isinstance(number, int) or number < 0:
                        continue
                    season_path = base + f"/season/{number}"
                    season_data = collect(season_path, {"language": language})
                    for episode in season_data.get("episodes", []):
                        episode_number = episode.get("episode_number")
                        if isinstance(episode_number, int) and episode_number > 0:
                            collect(season_path + f"/episode/{episode_number}/images")
                    collect(season_path + "/images")
        for path in sorted(images):
            try:
                self.image(path)
            except Exception as exc:
                errors.append(f"{path}: {exc}")
        if errors:
            raise RuntimeError("; ".join(errors)[:4000])

    def _save_jobs(self):
        atomic_write(self.root / "jobs.json", json.dumps(self.jobs, ensure_ascii=False).encode())

    def enqueue(self, kind, tmdb_id, hero_image="", refresh=False):
        if kind not in ("movie", "tv") or not str(tmdb_id).isdigit() or int(tmdb_id) <= 0:
            return
        extra = []
        match = re.fullmatch(r"https://image\.tmdb\.org/t/p/[^/]+(/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp|svg))", hero_image or "")
        if not match:
            match = re.search(r"/tmdb/images(/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp|svg))(?:\?.*)?$", hero_image or "")
        if match:
            extra = [match[1]]
        key = f"{kind}/{int(tmdb_id)}"
        with self.jobs_lock:
            previous = self.jobs.get(key, {})
            images = sorted(set(previous.get("images", [])) | set(extra))
            if previous.get("state") in ("pending", "running", "complete") and images == previous.get("images", []) and not refresh:
                return
            self.jobs[key] = {"kind": kind, "id": int(tmdb_id), "state": "pending", "error": "", "images": images, "refresh": refresh}
            try:
                self._save_jobs()
            except OSError as exc:
                self.jobs[key].update(state="failed", error=f"No se pudo guardar la cola: {exc}")
                raise
        self.start()

    def start(self):
        with self.jobs_lock:
            if self.worker and self.worker.is_alive():
                return
            self.worker = threading.Thread(target=self._run, name="tmdb-artwork", daemon=True)
            self.worker.start()

    def _run(self):
        while True:
            with self.jobs_lock:
                entry = next(((key, job) for key, job in self.jobs.items() if job["state"] == "pending"), None)
                if entry is None:
                    self.worker = None
                    return
                key, job = entry
                job["state"] = "running"
                try:
                    self._save_jobs()
                except OSError as exc:
                    job.update(state="failed", error=f"No se pudo guardar la cola: {exc}")
                    continue
            try:
                self.warm(job["kind"], job["id"], job["images"], job.get("refresh", False))
                state, error = "complete", ""
            except Exception as exc:
                state, error = "failed", str(exc)
            with self.jobs_lock:
                if self.jobs[key] is job:
                    job.update(state=state, error=error)
                try:
                    self._save_jobs()
                except OSError as exc:
                    job.update(state="failed", error=f"No se pudo guardar el progreso: {exc}")

    def status(self):
        with self.jobs_lock:
            jobs = [dict(job) for job in self.jobs.values()]
        return {"total": len(jobs), **{state: sum(j["state"] == state for j in jobs) for state in ("pending", "running", "complete", "failed")},
                "errors": [{"media": f'{j["kind"]}/{j["id"]}', "error": j["error"]} for j in jobs if j["state"] == "failed"],
                "current": next((f'{j["kind"]}/{j["id"]}' for j in jobs if j["state"] == "running"), "")}
