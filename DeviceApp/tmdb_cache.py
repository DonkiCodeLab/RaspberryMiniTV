"""Persistent TMDB metadata/artwork and a single resumable download worker."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

IMAGE_RE = re.compile(r"/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp|svg)")
DETAIL_RE = re.compile(r"/(?:movie/\d+(?:/images)?|tv/\d+(?:/images|/season/\d+(?:/images|/episode/\d+/images)?)?)")
LANGUAGES = ("es-ES", "ca-ES", "en-US")


class TmdbError(RuntimeError):
    def __init__(self, message, code):
        super().__init__(message)
        self.code = code


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
        self.storage_lock = threading.Lock()
        self.storage_snapshot = None
        self.storage_checked_at = 0
        self.state_lock = threading.RLock()
        self.generations = {}
        self.worker_context = threading.local()
        try:
            self.index = json.loads((self.root / "index.json").read_text())
        except (OSError, ValueError):
            self.index = {}
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
            self._check_worker()
            try:
                with opener.open(urllib.request.Request(url, headers=headers), timeout=30) as response:
                    data = response.read(limit + 1)
                    if not data or len(data) > limit:
                        raise ValueError("Respuesta TMDB vacía o demasiado grande")
                    return data, response.headers.get_content_type()
            except urllib.error.HTTPError as exc:
                if attempt == 2 or exc.code not in (429, 500, 502, 503, 504):
                    raise TmdbError(
                        "TMDB rechazó las credenciales. Revisa la API key o el token en Ajustes."
                        if exc.code in (401, 403) else f"TMDB respondió con HTTP {exc.code}.",
                        "TMDB_AUTH_ERROR" if exc.code in (401, 403) else "TMDB_HTTP_ERROR",
                    ) from None
                delay = exc.headers.get("Retry-After", "")
                time.sleep(min(30, int(delay)) if delay.isdigit() else 2 ** attempt)
            except (OSError, TimeoutError):
                if attempt == 2:
                    raise TmdbError("La Raspberry no puede conectar con TMDB. Revisa su conexión a Internet, DNS y certificados.", "TMDB_CONNECTION_ERROR") from None
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
        owner = "/".join(path.strip("/").split("/")[:2]) if DETAIL_RE.fullmatch(path) else None
        with self.state_lock:
            generation = self.generations.get(owner, 0)
            self._check_worker()
        with self.io_locks[hash(str(target)) % len(self.io_locks)]:
            try:
                if not refresh:
                    data = json.loads(target.read_text())
                    with self.state_lock:
                        self._check_worker()
                        if generation != self.generations.get(owner, 0):
                            raise RuntimeError("Descarga cancelada por borrado del catálogo")
                        self._index_metadata(target.name, owner, data)
                    return data
            except (OSError, ValueError):
                pass
            credentials = self.credentials()
            headers = {"Accept": "application/json"}
            if credentials.get("bearerToken"):
                headers["Authorization"] = "Bearer " + credentials["bearerToken"]
            elif credentials.get("apiKey"):
                params["api_key"] = credentials["apiKey"]
            else:
                raise TmdbError("Faltan las credenciales de TMDB en la Raspberry. Guárdalas en Raspberry → Ajustes → TMDB.", "TMDB_CREDENTIALS_MISSING")
            url = "https://api.themoviedb.org/3" + path + "?" + urllib.parse.urlencode(params)
            raw, _ = self._download(url, headers, 16 * 1024 * 1024)
            data = json.loads(raw)
            if not isinstance(data, dict) or data.get("success") is False:
                raise RuntimeError("Respuesta TMDB inválida")
            with self.state_lock:
                self._check_worker()
                if generation != self.generations.get(owner, 0):
                    raise RuntimeError("Descarga cancelada por borrado del catálogo")
                self._index_metadata(target.name, owner, data)
                atomic_write(target, raw)
            return data

    def image(self, path):
        if not IMAGE_RE.fullmatch(path):
            raise ValueError("Ruta de imagen no permitida")
        target = self.root / "images" / path.lstrip("/")
        with self.state_lock:
            generation = self.generations.get("image:" + path, 0)
            self._check_worker()
        with self.io_locks[hash(str(target)) % len(self.io_locks)]:
            if target.is_file() and target.stat().st_size:
                return target
            raw, content_type = self._download("https://image.tmdb.org/t/p/original" + path, {}, 64 * 1024 * 1024)
            if not content_type.startswith("image/"):
                raise ValueError("TMDB no devolvió una imagen")
            with self.state_lock:
                self._check_worker()
                if generation != self.generations.get("image:" + path, 0):
                    raise RuntimeError("Imagen cancelada por borrado del catálogo")
                atomic_write(target, raw)
        return target

    def _check_worker(self):
        context = getattr(self.worker_context, "job", None)
        if context and self.generations.get(context[0], 0) != context[1]:
            raise RuntimeError("Descarga cancelada por borrado del catálogo")

    def _index_metadata(self, filename, owner, data):
        entry = {"owner": owner, "images": sorted(self._images_in(data) | set(self.index.get(filename, {}).get("images", [])))}
        if self.index.get(filename) != entry:
            self.index[filename] = entry
            atomic_write(self.root / "index.json", json.dumps(self.index).encode())

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
            self._check_worker()
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
            self._check_worker()
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

    def cancel(self):
        # Invalidate in-flight writes; already published cache files remain reusable.
        with self.state_lock, self.jobs_lock:
            for key, job in self.jobs.items():
                if job["state"] in ("pending", "running"):
                    self.generations[key] = self.generations.get(key, 0) + 1
                    job.update(state="cancelled", error="", refresh=False)
            self._save_jobs()
        return self.status()

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
                generation = self.generations.get(key, 0)
                try:
                    self._save_jobs()
                except OSError as exc:
                    job.update(state="failed", error=f"No se pudo guardar la cola: {exc}")
                    continue
            try:
                self.worker_context.job = (key, generation)
                self.warm(job["kind"], job["id"], job["images"], job.get("refresh", False))
                state, error = "complete", ""
            except Exception as exc:
                state, error = "failed", str(exc)
            finally:
                self.worker_context.job = None
            with self.jobs_lock:
                if self.jobs.get(key) is job and job["state"] == "running":
                    job.update(state=state, error=error)
                try:
                    self._save_jobs()
                except OSError as exc:
                    job.update(state="failed", error=f"No se pudo guardar el progreso: {exc}")

    @staticmethod
    def profile_image(value):
        match = re.search(r"(?:https://image\.tmdb\.org/t/p/[^/]+|/tmdb/images)(/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp|svg))(?:\?.*)?$", value or "")
        return match[1] if match else None

    def _legacy_metadata(self, owner):
        """Discover the original hash-only cache without contacting TMDB."""
        base = "/" + owner
        paths = [base, base + "/images"]
        seen = set()
        for path in paths:
            if path in seen:
                continue
            seen.add(path)
            variants = [{}] if path.endswith("/images") else [{}, *({"language": lang} for lang in LANGUAGES)]
            if owner.startswith("movie/") and path == base:
                variants += [{**params, "append_to_response": "external_ids"} for params in list(variants)]
            for params in variants:
                digest = hashlib.sha256((path + "?" + urllib.parse.urlencode(sorted(params.items()))).encode()).hexdigest()
                target = self.root / "metadata" / (digest + ".json")
                if not target.is_file():
                    continue
                data = json.loads(target.read_text())
                self._index_metadata(target.name, owner, data)
                if owner.startswith("tv/"):
                    for season in data.get("seasons", []):
                        number = season.get("season_number")
                        if isinstance(number, int) and number >= 0:
                            paths.extend([base + f"/season/{number}", base + f"/season/{number}/images"])
                    if re.fullmatch(re.escape(base) + r"/season/\d+", path):
                        for episode in data.get("episodes", []):
                            number = episode.get("episode_number")
                            if isinstance(number, int) and number > 0:
                                paths.append(path + f"/episode/{number}/images")

    def remove_unused(self, removed, library):
        """Remove only deleted titles' resources, retaining shared references."""
        with self.state_lock, self.jobs_lock:
            active = set()
            protected_images = set()
            for collection, kind in (("movies", "movie"), ("series", "tv")):
                for item in library.get(collection, {}).values():
                    if item.get("tmdbId"):
                        active.add(f"{kind}/{int(item['tmdbId'])}")
                    image = self.profile_image(item.get("heroImage"))
                    if image:
                        protected_images.add(image)
            owners = {f"{kind}/{int(item['tmdbId'])}" for kind, item in removed if item.get("tmdbId")}
            unused = owners - active
            candidates = {self.profile_image(item.get("heroImage")) for _, item in removed}
            candidates.discard(None)
            # Upgrade ownership information for caches created before index.json existed.
            for owner in unused | active | set(self.jobs):
                self._legacy_metadata(owner)
            for owner in unused:
                self.generations[owner] = self.generations.get(owner, 0) + 1
                job = self.jobs.pop(owner, {})
                candidates.update(job.get("images", []))
            self._save_jobs()
            deleted_metadata = []
            for filename, entry in self.index.items():
                if entry.get("owner") in unused:
                    candidates.update(entry.get("images", []))
                    deleted_metadata.append(filename)
                elif entry.get("owner") is not None:
                    protected_images.update(entry.get("images", []))
            # Unknown legacy files are retained conservatively, including their images.
            for target in (self.root / "metadata").glob("*.json"):
                if target.name not in self.index:
                    data = json.loads(target.read_text())
                    if isinstance(data.get("results"), list):
                        self._index_metadata(target.name, None, data)
                    else:
                        protected_images.update(self._images_in(data))
            for job in self.jobs.values():
                protected_images.update(job.get("images", []))
            for filename in deleted_metadata:
                if re.fullmatch(r"[a-f0-9]{64}\.json", filename):
                    (self.root / "metadata" / filename).unlink(missing_ok=True)
                del self.index[filename]
            count = 0
            for path in candidates - protected_images:
                if IMAGE_RE.fullmatch(path):
                    self.generations["image:" + path] = self.generations.get("image:" + path, 0) + 1
                    target = self.root / "images" / path.lstrip("/")
                    if target.is_file():
                        target.unlink()
                        count += 1
            atomic_write(self.root / "index.json", json.dumps(self.index).encode())
            return {"metadata": len(deleted_metadata), "images": count}

    def storage(self):
        # Limit directory scans while several browsers poll download progress.
        with self.storage_lock:
            now = time.monotonic()
            if self.storage_snapshot is not None and now - self.storage_checked_at < 10:
                return dict(self.storage_snapshot)
            try:
                total_bytes = 0
                def fail(error):
                    raise error
                for directory, _, filenames in (os.walk(self.root, followlinks=False, onerror=fail) if self.root.exists() else []):
                    for filename in filenames:
                        path = Path(directory) / filename
                        try:
                            if not path.is_symlink():
                                total_bytes += path.stat().st_size
                        except FileNotFoundError:
                            pass  # Atomic downloads/deletions can race the scan.
                disk_path = self.root
                while not disk_path.exists() and disk_path != disk_path.parent:
                    disk_path = disk_path.parent
                capacity = shutil.disk_usage(disk_path).total
                snapshot = {"available": True, "bytes": total_bytes, "gb": total_bytes / 1_000_000_000,
                            "diskTotalGb": capacity / 1_000_000_000,
                            "percent": total_bytes / capacity * 100 if capacity else 0}
            except OSError:
                snapshot = {"available": False}
            self.storage_snapshot = snapshot
            self.storage_checked_at = now
            return dict(snapshot)

    def status(self):
        with self.jobs_lock:
            jobs = [dict(job) for job in self.jobs.values()]
        return {"total": len(jobs), **{state: sum(j["state"] == state for j in jobs) for state in ("pending", "running", "complete", "failed", "cancelled")},
                "errors": [{"media": f'{j["kind"]}/{j["id"]}', "error": j["error"]} for j in jobs if j["state"] == "failed"],
                "current": next((f'{j["kind"]}/{j["id"]}' for j in jobs if j["state"] == "running"), "")}
