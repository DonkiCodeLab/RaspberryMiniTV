"""Storage and browsing for downloads that do not belong to the media catalog."""
import copy
import os
from pathlib import Path, PurePosixPath
import shutil
import threading
import time

from safe_archive import extract_archive, is_archive


def safe_path(root, relative="", *, must_exist=True):
    root = Path(root)
    if not isinstance(relative, str) or "\\" in relative or "\0" in relative:
        raise ValueError("Ruta no válida.")
    path = PurePosixPath(relative)
    if path.is_absolute() or ".." in path.parts or any(":" in part for part in path.parts):
        raise ValueError("Ruta no válida.")
    candidate = root.joinpath(*path.parts)
    if root.is_symlink() or any(p.is_symlink() for p in [candidate, *candidate.parents]):
        raise ValueError("No se permiten enlaces en las descargas.")
    if not candidate.resolve().is_relative_to(root.resolve()):
        raise ValueError("La ruta está fuera de la descarga.")
    if must_exist and not candidate.exists():
        raise ValueError("El contenido ya no existe. Actualiza la descarga.")
    return candidate


class FreeDownloadsMixin:
    def _cleanup_free_cancelled(self, job):
        if job.get("mediaType") == "generic" and job["state"] == "cancelled" and job.get("transferRemoved"):
            folder = self.download_folder(job)
            if folder.exists():
                shutil.rmtree(folder)

    def download_folder(self, job):
        # Failed catalog downloads can continue as free downloads in place.
        area = "free" if job.get("mediaType") == "generic" and not job.get("reuseMediaFolder") else "downloads"
        return safe_path(self.root, f"{area}/{job['id']}", must_exist=False)

    def _free_job(self, job_id, *, writable=False):
        job = self.jobs.get(job_id)
        if not job:
            raise KeyError(job_id)
        if job.get("mediaType") != "generic" or job["state"] != "complete" or job.get("deleteRequested"):
            raise ValueError("El contenido solo está disponible en descargas libres terminadas.")
        if writable and job.get("extraction", {}).get("state") == "extracting":
            raise ValueError("Espera a que termine la descompresión.")
        return job

    def _advance_free(self, job, row, folder):
        files = row.get("files", [])
        if not files:
            raise ValueError("El torrent no contiene archivos.")
        for entry in files:
            safe_path(folder, entry["name"], must_exist=False)
        indices = list(range(len(files)))
        if job.get("videoIndices") != indices:
            self.rpc.call("torrent-set", {"ids": [job["id"]], "files-wanted": indices})
            self._update(job, videoIndices=indices)
            return
        length = sum(max(0, int(entry["length"])) for entry in files)
        downloaded = sum(min(max(0, int(entry["length"])), max(0, int(entry.get("bytesCompleted", 0)))) for entry in files)
        status = int(row.get("status", 0))
        self._update(job, state="paused" if status == 0 and downloaded < length else "downloading",
                     sizeBytes=length, downloadedBytes=downloaded,
                     progress=round(downloaded * 100 / length, 1) if length else 0,
                     rateBytes=max(0, int(row.get("rateDownload", 0))), eta=row.get("eta", -1))
        if downloaded != length or row.get("leftUntilDone") != 0 or row.get("percentDone", 0) < 1 or status in {1, 2}:
            return
        for entry in files:
            source = safe_path(folder, entry["name"])
            if not source.is_file() or source.stat().st_size != int(entry["length"]):
                raise ValueError("Un archivo de la descarga está incompleto.")
        self.rpc.call("torrent-stop", {"ids": [job["id"]]})
        # Persist completion before detaching the transfer. Completed free downloads
        # always use delete-local-data=False, including cleanup after a restart.
        self._update(job, state="complete", completedAt=time.time(), progress=100, rateBytes=0, error="")
        self._remove_transfer(job)

    def free_contents(self, job_id, relative=""):
        with self.operation:
            job = self._free_job(job_id)
            folder = self.download_folder(job)
            current = safe_path(folder, relative)
            if not current.is_dir():
                raise ValueError("Selecciona una carpeta.")
            entries = []
            for child in current.iterdir():
                if child.is_symlink() or not (child.is_file() or child.is_dir()):
                    continue
                entries.append({"name": child.name, "path": child.relative_to(folder).as_posix(),
                                "directory": child.is_dir(), "sizeBytes": child.stat().st_size if child.is_file() else None,
                                "archive": child.is_file() and is_archive(child)})
            return {"job": copy.deepcopy(job), "path": relative,
                    "entries": sorted(entries, key=lambda item: (not item["directory"], item["name"].casefold()))}

    def delete_free_download(self, job):
        self._free_job(job["id"], writable=True)
        self._remove_transfer(job)
        if not job.get("transferRemoved"):
            raise ValueError("No se pudo desconectar la descarga del motor. Inténtalo de nuevo.")
        self._update(job, deleteRequested=True)
        return self._finish_free_delete(job)

    def _finish_free_delete(self, job):
        folder = self.download_folder(job)
        if folder.exists():
            shutil.rmtree(folder)
        self._update(job, deleted=True)
        return self._remove_history(job)

    def extract_free_download(self, job_id, relative):
        with self.operation:
            job = self._free_job(job_id, writable=True)
            source = safe_path(self.download_folder(job), relative)
            if not source.is_file() or not is_archive(source):
                raise ValueError("Selecciona un archivo ZIP, RAR, 7z, TAR, GZ, BZ2 o XZ.")
            self._update(job, extraction={"state": "extracting", "path": relative})
            threading.Thread(target=self._extract_free, args=(job, source), name="free-download-extract", daemon=True).start()
            return copy.deepcopy(job)

    def _extract_free(self, job, source):
        staging = safe_path(self.root, f"extractions/{job['id']}", must_exist=False)
        try:
            staging.mkdir(parents=True, exist_ok=True)
            output = extract_archive(source, staging_parent=staging)
            self._update(job, extraction={"state": "complete", "path": output.relative_to(self.download_folder(job)).as_posix()})
        except Exception as exc:
            self._update(job, extraction={"state": "failed", "error": str(exc)})
        finally:
            if staging.exists():
                shutil.rmtree(staging)

    def import_free_download(self, job_id, relative, data, importer):
        with self.operation:
            job = self._free_job(job_id, writable=True)
            # Wait for acknowledgement before moving any data out of the engine's folder.
            self._remove_transfer(job)
            if not job.get("transferRemoved"):
                raise ValueError("No se pudo desconectar la descarga del motor. Inténtalo de nuevo.")
            folder = self.download_folder(job)
            source = safe_path(folder, relative)
            files = [source] if source.is_file() else list(source.rglob("*"))
            files = [safe_path(folder, file.relative_to(folder).as_posix()) for file in files]
            item, moved = importer(job, [file for file in files if file.is_file()], data)
            # Importers publish hard links transactionally. Only remove sources that
            # have a verified library copy; existing/skipped episodes stay here.
            for original, destination in moved:
                original = safe_path(folder, original.relative_to(folder).as_posix())
                if not os.path.samefile(original, destination):
                    raise ValueError("No se pudo verificar el archivo importado; se conserva el original.")
            for original, _ in moved:
                original.unlink()
            for directory in sorted(folder.rglob("*"), key=lambda p: len(p.parts), reverse=True):
                if directory.is_dir() and not directory.is_symlink():
                    try:
                        directory.rmdir()
                    except OSError:
                        pass
            if moved:
                self._update(job, lastImportAt=time.time())
            return {"item": item, "movedFiles": len(moved)}
