"""Persistent movie downloads. Transmission owns transfers; this worker owns imports."""
import base64
import copy
import json
import os
from pathlib import Path
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from tmdb_cache import atomic_write

VIDEO_EXTENSIONS = {".mp4", ".m4v", ".mov", ".mkv"}
HASH_RE = re.compile(r"[a-fA-F0-9]{40}")
TERMINAL = {"complete", "cancelled", "failed"}


class TorrentError(RuntimeError):
    pass


def positive_int(value):
    try:
        return max(0, int(value))
    except (TypeError, ValueError, OverflowError):
        return 0


def normalize_results(rows):
    if not isinstance(rows, list):
        raise TorrentError("The Pirate Bay ha devuelto una respuesta no válida.")
    results = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        info_hash = str(row.get("info_hash") or "").lower()
        # Movies, HD movies and UHD movies only; exclude TV, porn and software.
        if not HASH_RE.fullmatch(info_hash) or info_hash == "0" * 40 or str(row.get("category")) not in {"201", "207", "209"}:
            continue
        size = positive_int(row.get("size"))
        if not size or not str(row.get("name") or "").strip():
            continue
        results[info_hash] = {"infoHash": info_hash, "name": str(row["name"])[:500],
                              "sizeBytes": size, "seeds": positive_int(row.get("seeders")),
                              "leechers": positive_int(row.get("leechers"))}
    return sorted(results.values(), key=lambda row: (-row["seeds"], row["name"]))[:100]


def search_torrents(query):
    query = str(query or "").strip()
    if not query or len(query) > 200:
        raise ValueError("Escribe un título de hasta 200 caracteres.")
    url = "https://apibay.org/q.php?" + urllib.parse.urlencode({"q": query, "cat": "200"})
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "MiniTV/1.0", "Accept": "application/json"}), timeout=15) as response:
            raw = response.read(4 * 1024 * 1024 + 1)
        if len(raw) > 4 * 1024 * 1024:
            raise ValueError("response too large")
        return normalize_results(json.loads(raw))
    except (OSError, ValueError) as exc:
        raise TorrentError("No se pudo consultar The Pirate Bay. Inténtalo de nuevo más tarde.") from exc


class Transmission:
    def __init__(self):
        self.url = os.environ.get("MINITV_TRANSMISSION_URL", "http://127.0.0.1:9092/transmission/rpc")
        self.session = ""

    def call(self, method, arguments=None):
        headers = {"Content-Type": "application/json"}
        username = os.environ.get("MINITV_TRANSMISSION_USER", "")
        if username:
            credentials = username + ":" + os.environ.get("MINITV_TRANSMISSION_PASSWORD", "")
            headers["Authorization"] = "Basic " + base64.b64encode(credentials.encode()).decode()
        for attempt in range(2):
            headers["X-Transmission-Session-Id"] = self.session
            req = urllib.request.Request(self.url, data=json.dumps({"method": method, "arguments": arguments or {}}).encode(), headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=10) as response:
                    payload = json.load(response)
                if payload.get("result") != "success":
                    raise TorrentError("Transmission: " + str(payload.get("result", "respuesta no válida")))
                return payload.get("arguments", {})
            except urllib.error.HTTPError as exc:
                if exc.code == 409 and attempt == 0:
                    self.session = exc.headers.get("X-Transmission-Session-Id", "")
                    continue
                raise TorrentError(f"Transmission respondió con HTTP {exc.code}.") from exc
            except (OSError, ValueError) as exc:
                raise TorrentError("No se puede conectar con Transmission. Comprueba el servicio minitv-torrents en la Raspberry.") from exc


def video_file(files):
    candidates = []
    for index, item in enumerate(files):
        name = str(item.get("name", ""))
        path = Path(name)
        if path.suffix.lower() not in VIDEO_EXTENSIONS or re.search(r"(^|[\W_])sample([\W_]|$)", name, re.I):
            continue
        if path.is_absolute() or ".." in path.parts or "\\" in name:
            raise TorrentError("El torrent contiene una ruta de vídeo no permitida.")
        if positive_int(item.get("length")):
            candidates.append((index, item))
    if not candidates:
        raise TorrentError("El torrent no contiene un vídeo compatible (MP4, MKV, M4V o MOV).")
    return max(candidates, key=lambda entry: positive_int(entry[1]["length"]))


class TorrentDownloads:
    def __init__(self, root, import_movie, artwork_status, prepare_artwork, rpc=None):
        self.root = Path(root).resolve()
        self.state_path = self.root / "jobs.json"
        self.rpc = rpc or Transmission()
        self.import_movie = import_movie
        self.artwork_status = artwork_status
        self.prepare_artwork = prepare_artwork
        self.lock = threading.RLock()
        self.operation = threading.Lock()
        self.worker = None
        self.service_error = ""
        self.last_health = 0
        try:
            self.jobs = json.loads(self.state_path.read_text())
            if not isinstance(self.jobs, dict):
                raise ValueError("Invalid jobs")
        except FileNotFoundError:
            self.jobs = {}
        # Do not silently discard an unreadable queue and orphan its transfers.

    def _save(self):
        atomic_write(self.state_path, json.dumps(self.jobs, ensure_ascii=False).encode())

    def _update(self, job, **updates):
        with self.lock:
            job.update(updates, updatedAt=time.time())
            self._save()

    def snapshot(self):
        with self.lock:
            return {"jobs": sorted(copy.deepcopy([job for job in self.jobs.values() if not job.get("hidden")]), key=lambda j: -j["createdAt"]),
                    "serviceError": self.service_error}

    def _remove_history(self, job):
        if job["state"] not in {"complete", "cancelled"}:
            raise ValueError("Solo puedes quitar del historial descargas finalizadas o canceladas.")
        with self.lock:
            previous = copy.deepcopy(job)
            if job.get("transferRemoved"):
                del self.jobs[job["id"]]
            else:
                # Keep a hidden cleanup record if Transmission has not acknowledged removal yet.
                job["hidden"] = True
            try:
                self._save()
            except OSError:
                self.jobs[job["id"]] = previous
                raise
        return {"id": job["id"], "removed": True}

    def add(self, data):
        info_hash = str(data.get("infoHash", "")).lower()
        movie = data.get("movie")
        if not isinstance(movie, dict) or not HASH_RE.fullmatch(info_hash) or info_hash == "0" * 40:
            raise ValueError("Selecciona un torrent y una película válidos.")
        tmdb_id = positive_int(movie.get("id"))
        name = str(movie.get("name") or "").strip()[:250]
        if not tmdb_id or not name:
            raise ValueError("Falta la ficha TMDB de la película.")
        overwrite = data.get("overwriteExisting") is True
        with self.operation:
            archive = None
            for existing in self.jobs.values():
                if existing["id"] == info_hash:
                    if existing["movie"]["id"] != tmdb_id:
                        raise ValueError("Este torrent ya está asociado a otra película.")
                    if existing["state"] in {"complete", "cancelled"}:
                        self._remove_transfer(existing)
                        if not existing.get("transferRemoved"):
                            raise TorrentError("La descarga anterior sigue finalizando. Inténtalo de nuevo en unos segundos.")
                        archive = copy.deepcopy(existing)
                        archive["id"] = f"{info_hash}-history-{time.time_ns()}"
                    else:
                        if overwrite and not existing.get("overwriteExisting"):
                            self._update(existing, overwriteExisting=True)
                        return copy.deepcopy(existing)
                if existing["movie"]["id"] == tmdb_id and existing["state"] not in TERMINAL:
                    raise ValueError("Esta película ya tiene una descarga en curso.")
            self.rpc.call("session-get")
            folder = self.root / "downloads" / info_hash
            folder.mkdir(parents=True, exist_ok=True)
            job = {"id": info_hash, "name": str(data.get("name") or name)[:500],
                   "movie": {"id": tmdb_id, "name": name}, "state": "queued", "error": "",
                   "sizeBytes": positive_int(data.get("sizeBytes")), "downloadedBytes": 0,
                   "progress": 0, "rateBytes": 0, "eta": -1, "createdAt": time.time()}
            job["overwriteExisting"] = overwrite
            with self.lock:
                if archive:
                    self.jobs[archive["id"]] = archive
                self.jobs[info_hash] = job
                self._save()  # Journal the intent before sending the magnet; restart can recover it.
            try:
                self._add_transfer(job)
            except TorrentError as exc:
                self._update(job, state="failed", error=str(exc))
                raise
            self.start()
            return copy.deepcopy(job)

    def _add_transfer(self, job):
        folder = self.root / "downloads" / job["id"]
        result = self.rpc.call("torrent-add", {"filename": "magnet:?xt=urn:btih:" + job["id"],
                                               "download-dir": str(folder), "paused": False})
        if result.get("torrent-duplicate"):
            self._check_ownership(job)
        else:
            self._update(job, videoIndex=None)

    def _check_ownership(self, job):
        rows = self.rpc.call("torrent-get", {"ids": [job["id"]], "fields": ["downloadDir"]}).get("torrents", [])
        if rows and Path(rows[0].get("downloadDir", "")).resolve() != self.root / "downloads" / job["id"]:
            raise TorrentError("Este torrent existe en Transmission fuera de MiniTV; no se modificará.")

    def action(self, job_id, action):
        if not isinstance(action, str) or action not in {"pause", "resume", "cancel", "retry", "remove"}:
            raise ValueError("Acción no válida.")
        with self.operation:
            job = self.jobs.get(job_id)
            if not job:
                raise KeyError(job_id)
            if action == "remove":
                return self._remove_history(job)
            if job["state"] in {"complete", "cancelled", "importing", "metadata"}:
                raise ValueError("Esta descarga ya no admite esa acción.")
            if action == "retry" and job["state"] != "failed":
                raise ValueError("Solo se pueden reintentar descargas con error.")
            if job.get("item"):
                if action != "retry":
                    raise ValueError("El vídeo ya está importado; solo puedes reintentar TMDB.")
                self.prepare_artwork(job["movie"]["id"])
                self._update(job, state="metadata", error="")
            elif action == "cancel":
                self._check_ownership(job)
                # Persist cancellation before removing data so an API restart cannot re-import it.
                self.rpc.call("torrent-stop", {"ids": [job_id]})
                self._update(job, state="cancelled", error="", rateBytes=0)
                self.rpc.call("torrent-remove", {"ids": [job_id], "delete-local-data": True})
                self._update(job, transferRemoved=True)
            elif action == "pause":
                self._check_ownership(job)
                self.rpc.call("torrent-stop", {"ids": [job_id]})
                self._update(job, state="paused", rateBytes=0)
            else:
                self._check_ownership(job)
                if action == "retry":
                    self._add_transfer(job)
                self.rpc.call("torrent-start", {"ids": [job_id]})
                self._update(job, state="queued", error="")
            return copy.deepcopy(job)

    def start(self):
        with self.lock:
            if self.worker and self.worker.is_alive():
                return
            self.worker = threading.Thread(target=self._run, name="movie-torrents", daemon=True)
            self.worker.start()

    def _run(self):
        while True:
            try:
                self.tick()
            except Exception as exc:
                with self.lock:
                    self.service_error = str(exc)
            time.sleep(5)

    def tick(self):
        with self.operation:
            if time.time() - self.last_health > 30:
                self.last_health = time.time()
                try:
                    self.rpc.call("session-get")
                    self.service_error = ""
                except TorrentError as exc:
                    self.service_error = str(exc)
            for job in list(self.jobs.values()):
                if job["state"] in {"cancelled", "complete"} or (job["state"] == "failed" and job.get("item")):
                    self._remove_transfer(job)
                    if job.get("hidden") and job.get("transferRemoved"):
                        self._remove_history(job)
            active = [job for job in self.jobs.values() if job["state"] not in TERMINAL]
            if not active:
                return
            fields = ["hashString", "status", "error", "errorString", "metadataPercentComplete", "percentDone",
                      "sizeWhenDone", "leftUntilDone", "rateDownload", "eta", "peersConnected", "files", "downloadDir"]
            # Metadata preparation can finish even if Transmission is temporarily unavailable.
            for job in active:
                if job["state"] == "metadata":
                    self._finish_artwork(job)
            transfers = [job for job in active if job["state"] not in TERMINAL | {"metadata", "paused"}]
            if not transfers:
                return
            rows = self.rpc.call("torrent-get", {"ids": [j["id"] for j in transfers], "fields": fields}).get("torrents", [])
            self.service_error = ""
            by_hash = {row["hashString"].lower(): row for row in rows}
            for job in transfers:
                try:
                    row = by_hash.get(job["id"])
                    if not row:
                        self._add_transfer(job)
                        continue
                    self._advance(job, row)
                except (OSError, TorrentError, ValueError) as exc:
                    self._update(job, state="failed", error=str(exc), rateBytes=0)
                    try:
                        self._check_ownership(job)
                        self.rpc.call("torrent-stop", {"ids": [job["id"]]})
                    except TorrentError:
                        pass

    def _advance(self, job, row):
        folder = self.root / "downloads" / job["id"]
        if Path(row.get("downloadDir", "")).resolve() != folder:
            raise TorrentError("La carpeta de descarga no pertenece a MiniTV.")
        if row.get("error"):
            raise TorrentError(row.get("errorString") or "Transmission no pudo descargar el torrent.")
        if row.get("metadataPercentComplete", 0) < 1:
            self._update(job, state="queued", peers=positive_int(row.get("peersConnected")))
            return
        index, selected = video_file(row.get("files", []))
        if job.get("videoIndex") != index:
            unwanted = [i for i in range(len(row["files"])) if i != index]
            args = {"ids": [job["id"]], "files-wanted": [index]}
            if unwanted:
                args["files-unwanted"] = unwanted
            self.rpc.call("torrent-set", args)
            self._update(job, videoIndex=index, videoName=selected["name"])
            return  # Wait for Transmission to report the new wanted size and verified completion.
        length = positive_int(selected["length"])
        downloaded = min(length, positive_int(selected.get("bytesCompleted")))
        status = int(row.get("status", 0))
        self._update(job, state="paused" if status == 0 and downloaded < length else "downloading",
                     sizeBytes=length, downloadedBytes=downloaded, progress=round(downloaded * 100 / length, 1),
                     rateBytes=positive_int(row.get("rateDownload")), eta=row.get("eta", -1),
                     peers=positive_int(row.get("peersConnected")))
        if downloaded != length or row.get("leftUntilDone") != 0 or row.get("percentDone", 0) < 1 or status in {1, 2}:
            return
        source = folder / selected["name"]
        resolved = source.resolve()
        if not resolved.is_relative_to(folder) or any(p.is_symlink() for p in [source, *source.parents] if p != self.root.parent):
            raise TorrentError("La ruta del vídeo descargado no es segura.")
        if not source.is_file() or source.stat().st_size != length:
            raise TorrentError("El fichero de vídeo descargado está incompleto o no existe.")
        self.rpc.call("torrent-stop", {"ids": [job["id"]]})
        self._update(job, state="importing", rateBytes=0)
        item = self.import_movie(job, source)
        self._update(job, state="metadata", item=item, progress=100)
        self._finish_artwork(job)

    def _finish_artwork(self, job):
        self._remove_transfer(job)
        try:
            status = self.artwork_status(job["movie"]["id"])
            if not status:
                self.prepare_artwork(job["movie"]["id"])
            elif status.get("state") == "complete":
                self._update(job, state="complete", completedAt=time.time(), error="")
            elif status.get("state") in {"failed", "cancelled"}:
                self._update(job, state="failed", error=status.get("error") or "No se completaron los recursos de TMDB.")
        except Exception as exc:
            self._update(job, state="failed", error=str(exc))

    def _remove_transfer(self, job):
        # The library has its own hard link; deleting staging data preserves the video.
        if job.get("transferRemoved"):
            return
        try:
            self._check_ownership(job)
            self.rpc.call("torrent-remove", {"ids": [job["id"]], "delete-local-data": True})
            self._update(job, transferRemoved=True)
        except TorrentError as exc:
            # Retry cleanup on later ticks without blocking TMDB completion.
            self.service_error = str(exc)
