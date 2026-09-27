"""Durable catalog storage. Invalid catalogs must never become empty libraries."""
import fcntl
import hashlib
import json
import os
import stat
import tempfile
import threading
from contextlib import contextmanager
from pathlib import Path


COLLECTIONS = ("series", "movies", "games", "books", "bookCollections")
_lock = threading.RLock()
_active = threading.local()


class CatalogError(RuntimeError):
    pass


def normalize(data):
    if not isinstance(data, dict):
        raise CatalogError("El catálogo multimedia no es un objeto JSON; se conserva sin cambios.")
    result = dict(data)
    result.setdefault("version", 1)
    for key in COLLECTIONS:
        items = result.setdefault(key, {})
        if not isinstance(items, dict) or any(not isinstance(item, dict) for item in items.values()):
            raise CatalogError(f"La colección {key} está dañada; se conserva el catálogo sin cambios.")
    return result


def read(path):
    try:
        with open(path, encoding="utf-8") as handle:
            return normalize(json.load(handle))
    except FileNotFoundError:
        return None
    except (OSError, ValueError) as exc:
        raise CatalogError(f"No se puede leer el catálogo {path}; no se sobrescribirá.") from exc


@contextmanager
def transaction(path):
    """Serialize the entire read/modify/write, including separate API processes."""
    key = os.path.abspath(path)
    with _lock:
        held = getattr(_active, "paths", set())
        if key in held:
            yield
            return
        Path(key).parent.mkdir(parents=True, exist_ok=True)
        with open(key + ".lock", "a") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            _active.paths = held | {key}
            try:
                yield
            finally:
                _active.paths = held
                fcntl.flock(handle, fcntl.LOCK_UN)


def _atomic_write(path, payload):
    path = Path(path)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            # The API may run as root while maintenance uses the library owner.
            # An atomic replacement must retain the existing file's access rights.
            if path.exists():
                previous = path.stat()
                os.fchmod(handle.fileno(), stat.S_IMODE(previous.st_mode))
                if os.geteuid() == 0:
                    os.fchown(handle.fileno(), previous.st_uid, previous.st_gid)
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _payload(data):
    return (json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")


def save(path, data):
    current = normalize(data)
    with transaction(path):
        previous = read(path)  # Fail closed if an existing file is corrupt/unreadable.
        if previous == current:
            return current
        recovery = Path(path).parent / "Recovery"
        recovery.mkdir(exist_ok=True)
        # Keep both sides of every real change; repeated reads create no backups.
        for snapshot in (previous, current):
            if snapshot is None:
                continue
            payload = _payload(snapshot)
            backup = recovery / f"media-library-{hashlib.sha256(payload).hexdigest()}.json"
            if not backup.exists():
                _atomic_write(backup, payload)
        _atomic_write(path, _payload(current))
    return current
