"""Transactional SQLite catalog, with a verified, one-time JSON migration."""
import fcntl
import hashlib
import json
import os
import sqlite3
import stat
import tempfile
import threading
from contextlib import contextmanager
from pathlib import Path


COLLECTIONS = ("series", "movies", "games", "books", "bookCollections")
SCHEMA_VERSION = 1
_migration_lock = threading.RLock()
_active = threading.local()


class CatalogError(RuntimeError):
    pass


class Catalog(dict):
    """The revision prevents an old snapshot from overwriting newer edits."""
    def __init__(self, data, revision, database):
        super().__init__(data)
        self.revision = revision
        self.database = str(database)


def normalize(data):
    if not isinstance(data, dict):
        raise CatalogError("El catálogo multimedia no es un objeto; se conserva sin cambios.")
    result = dict(data)
    result.setdefault("version", 1)
    for key in COLLECTIONS:
        items = result.setdefault(key, {})
        if not isinstance(items, dict) or any(not isinstance(item, dict) for item in items.values()):
            raise CatalogError(f"La colección {key} está dañada; se conserva el catálogo sin cambios.")
        if any(not isinstance(key, str) or not key for key in items):
            raise CatalogError("El catálogo contiene claves vacías o no válidas.")
    for item in result["series"].values():
        if "episodes" in item and (not isinstance(item["episodes"], list)
                                   or any(not isinstance(ep, dict) for ep in item["episodes"])):
            raise CatalogError("La lista de capítulos está dañada; se conserva el catálogo sin cambios.")
    return result


def database_path(path):
    return Path(path).absolute().with_suffix(".sqlite3")


def _json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def _payload(data):
    return (json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False) + "\n").encode("utf-8")


def _sync_directory(path):
    directory = os.open(path, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def _copy_permissions(source, target):
    if Path(source).exists():
        previous = Path(source).stat()
        os.chmod(target, stat.S_IMODE(previous.st_mode))
        if os.geteuid() == 0:
            os.chown(target, previous.st_uid, previous.st_gid)


def _atomic_write(path, payload):
    path = Path(path)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            _copy_permissions(path, temporary)
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        _sync_directory(path.parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _snapshot(path, data):
    recovery = database_path(path).parent / "Recovery"
    recovery.mkdir(exist_ok=True)
    payload = _payload(data)
    backup = recovery / f"media-library-{hashlib.sha256(payload).hexdigest()}.json"
    if not backup.exists():
        _atomic_write(backup, payload)
    return backup


def _legacy_seed(path, legacy_movie_path=None):
    source = Path(path).with_suffix(".json")
    try:
        if source.exists():
            return normalize(json.loads(source.read_text(encoding="utf-8")))
        movies = Path(legacy_movie_path) if legacy_movie_path else source.with_name("movie_library.json")
        if movies.exists():
            return normalize({"movies": json.loads(movies.read_text(encoding="utf-8"))})
        return normalize({})
    except (OSError, ValueError) as exc:
        raise CatalogError("No se puede leer el catálogo antiguo; no se importará como vacío.") from exc


def _connect(database, readonly=False):
    # mode=rw forbids accidental creation but lets SQLite recover a hot journal
    # after a killed process. query_only blocks application writes on read calls.
    connection = sqlite3.connect(Path(database).as_uri() + "?mode=rw",
                                 uri=True, timeout=30, isolation_level=None)
    try:
        connection.execute("PRAGMA foreign_keys=ON")
        # Rollback journal + EXTRA also syncs the directory after deleting the journal.
        # No WAL sidecars need to be managed by the API/menu's different processes.
        connection.execute("PRAGMA synchronous=EXTRA")
        if readonly:
            connection.execute("PRAGMA query_only=ON")
        return connection
    except Exception:
        connection.close()
        raise


def _validate_schema(connection):
    if connection.execute("PRAGMA user_version").fetchone()[0] != SCHEMA_VERSION:
        raise CatalogError("Versión de base de datos no compatible; no se modificará.")
    if connection.execute("SELECT count(*) FROM catalog_state WHERE id=1").fetchone()[0] != 1:
        raise CatalogError("Falta el estado del catálogo SQLite; no se modificará.")


def _create_schema(connection):
    connection.executescript("""
        PRAGMA journal_mode=DELETE;
        PRAGMA synchronous=EXTRA;
        PRAGMA foreign_keys=ON;
        CREATE TABLE catalog_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
        INSERT INTO catalog_state VALUES (1, 0);
        CREATE TABLE catalog_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK(json_valid(value)));
        CREATE TABLE media_items (
            collection TEXT NOT NULL CHECK(collection IN ('movies','series','games','books','bookCollections')),
            item_key TEXT NOT NULL CHECK(length(item_key)>0),
            payload TEXT NOT NULL CHECK(json_valid(payload) AND json_type(payload)='object'),
            has_episodes INTEGER NOT NULL DEFAULT 0 CHECK(has_episodes IN (0,1)),
            PRIMARY KEY(collection, item_key),
            CHECK(has_episodes=0 OR collection='series')
        );
        CREATE INDEX media_tmdb_id ON media_items(collection, json_extract(payload, '$.tmdbId'));
        CREATE TABLE episodes (
            collection TEXT NOT NULL DEFAULT 'series' CHECK(collection='series'),
            series_key TEXT NOT NULL,
            position INTEGER NOT NULL CHECK(position>=0),
            payload TEXT NOT NULL CHECK(json_valid(payload) AND json_type(payload)='object'),
            PRIMARY KEY(series_key, position),
            FOREIGN KEY(collection, series_key) REFERENCES media_items(collection, item_key) ON DELETE CASCADE
        );
        CREATE TABLE catalog_changes (
            change_id INTEGER PRIMARY KEY,
            revision INTEGER NOT NULL,
            changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            collection TEXT NOT NULL,
            item_key TEXT NOT NULL,
            before_json TEXT CHECK(before_json IS NULL OR json_valid(before_json)),
            after_json TEXT CHECK(after_json IS NULL OR json_valid(after_json))
        );
        PRAGMA user_version=1;
    """)


def _read_connection(connection, database):
    _validate_schema(connection)
    data = {key: json.loads(value) for key, value in connection.execute("SELECT key,value FROM catalog_meta")}
    for collection in COLLECTIONS:
        data[collection] = {}
    for collection, key, payload, has_episodes in connection.execute(
            "SELECT collection,item_key,payload,has_episodes FROM media_items ORDER BY collection,item_key"):
        item = json.loads(payload)
        if has_episodes:
            item["episodes"] = []
        data[collection][key] = item
    for key, payload in connection.execute("SELECT series_key,payload FROM episodes ORDER BY series_key,position"):
        data["series"][key]["episodes"].append(json.loads(payload))
    revision = connection.execute("SELECT revision FROM catalog_state WHERE id=1").fetchone()[0]
    return Catalog(normalize(data), revision, database)


def _write_diff(connection, previous, current, revision, audit=True):
    def record(collection, key, before, after):
        if audit:
            connection.execute("INSERT INTO catalog_changes(revision,collection,item_key,before_json,after_json) VALUES(?,?,?,?,?)",
                               (revision, collection, key, None if before is None else _json(before),
                                None if after is None else _json(after)))

    old_meta = {key: value for key, value in previous.items() if key not in COLLECTIONS}
    new_meta = {key: value for key, value in current.items() if key not in COLLECTIONS}
    for key in old_meta.keys() | new_meta.keys():
        if key in old_meta and key in new_meta and old_meta[key] == new_meta[key]:
            continue
        if key in new_meta:
            connection.execute("INSERT INTO catalog_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                               (key, _json(new_meta[key])))
        else:
            connection.execute("DELETE FROM catalog_meta WHERE key=?", (key,))
        record("@meta", key, old_meta.get(key), new_meta.get(key))
    for collection in COLLECTIONS:
        old, new = previous.get(collection, {}), current[collection]
        for key in old.keys() | new.keys():
            if key in old and key in new and old[key] == new[key]:
                continue
            record(collection, key, old.get(key), new.get(key))
            if key not in new:
                connection.execute("DELETE FROM media_items WHERE collection=? AND item_key=?", (collection, key))
                continue
            body = dict(new[key])
            has_episodes = collection == "series" and "episodes" in body
            episodes = body.pop("episodes") if has_episodes else []
            connection.execute("""INSERT INTO media_items VALUES(?,?,?,?)
                ON CONFLICT(collection,item_key) DO UPDATE SET payload=excluded.payload,has_episodes=excluded.has_episodes""",
                               (collection, key, _json(body), int(has_episodes)))
            if collection == "series":
                previous_episodes = old.get(key, {}).get("episodes", [])
                for position, episode in enumerate(episodes):
                    if position >= len(previous_episodes) or previous_episodes[position] != episode:
                        connection.execute("""INSERT INTO episodes(series_key,position,payload) VALUES(?,?,?)
                            ON CONFLICT(series_key,position) DO UPDATE SET payload=excluded.payload""",
                                           (key, position, _json(episode)))
                connection.execute("DELETE FROM episodes WHERE series_key=? AND position>=?", (key, len(episodes)))
    connection.execute("UPDATE catalog_state SET revision=? WHERE id=1", (revision,))


def _ensure_database(path, legacy_movie_path=None):
    database = database_path(path)
    marker = database.with_suffix(".sqlite3.migrated")
    if database.exists() and marker.exists():
        return database
    with _migration_lock:
        database.parent.mkdir(parents=True, exist_ok=True)
        with open(str(database.with_suffix(".json")) + ".lock", "a") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            try:
                if not database.exists():
                    if marker.exists():
                        raise CatalogError("Falta la base de datos migrada; no se restaurará automáticamente un JSON antiguo.")
                    seed = _legacy_seed(path, legacy_movie_path)
                    _snapshot(path, seed)
                    fd, temporary = tempfile.mkstemp(prefix=f".{database.name}-", dir=database.parent)
                    os.close(fd)
                    try:
                        connection = sqlite3.connect(temporary, isolation_level=None)
                        try:
                            _create_schema(connection)
                            connection.execute("BEGIN IMMEDIATE")
                            _write_diff(connection, {}, seed, 1, audit=False)
                            connection.commit()
                            if _read_connection(connection, database) != seed:
                                raise CatalogError("La importación SQLite no coincide exactamente con el catálogo original.")
                            if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                                raise CatalogError("La importación SQLite no supera la comprobación de integridad.")
                            if connection.execute("PRAGMA foreign_key_check").fetchall():
                                raise CatalogError("La importación SQLite contiene referencias inválidas.")
                        finally:
                            connection.close()
                        _copy_permissions(Path(path).with_suffix(".json"), temporary)
                        with open(temporary, "rb") as database_file:
                            os.fsync(database_file.fileno())
                        os.replace(temporary, database)
                        _sync_directory(database.parent)
                    finally:
                        if os.path.exists(temporary):
                            os.unlink(temporary)
                if not marker.exists():
                    connection = _connect(database, readonly=True)
                    try:
                        _validate_schema(connection)
                    finally:
                        connection.close()
                    _atomic_write(marker, b"SQLite catalog schema 1. Do not fall back to the legacy JSON.\n")
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)
    return database


def _connections():
    if not hasattr(_active, "connections"):
        _active.connections = {}
    return _active.connections


@contextmanager
def transaction(path, legacy_movie_path=None):
    """BEGIN IMMEDIATE covers the complete read/modify/write, across processes."""
    key = str(database_path(path))
    if key in _connections():
        connection = _connections()[key]
        _active.savepoint_id = getattr(_active, "savepoint_id", 0) + 1
        savepoint = f"catalog_nested_{_active.savepoint_id}"
        connection.execute(f"SAVEPOINT {savepoint}")
        try:
            yield
        except BaseException:
            connection.execute(f"ROLLBACK TO {savepoint}")
            raise
        finally:
            connection.execute(f"RELEASE {savepoint}")
        return
    connection = None
    try:
        try:
            database = _ensure_database(path, legacy_movie_path)
        except OSError as exc:
            raise CatalogError("No se puede preparar el catálogo SQLite; se cancela la operación.") from exc
        connection = _connect(database)
        _validate_schema(connection)
        connection.execute("BEGIN IMMEDIATE")
        _connections()[key] = connection
        yield
        connection.commit()
    except sqlite3.Error as exc:
        raise CatalogError(f"No se puede modificar el catálogo SQLite; la operación no se ha confirmado: {exc}") from exc
    finally:
        _connections().pop(key, None)
        if connection is not None:
            connection.close()  # Rolls back any transaction that did not commit.


def read(path, legacy_movie_path=None):
    connection = _connections().get(str(database_path(path)))
    own_connection = connection is None
    try:
        if own_connection:
            database = _ensure_database(path, legacy_movie_path)
            connection = _connect(database, readonly=True)
            connection.execute("BEGIN")  # All tables belong to the same snapshot.
        return _read_connection(connection, database_path(path))
    except (sqlite3.Error, OSError, ValueError, KeyError, TypeError) as exc:
        raise CatalogError(f"No se puede leer el catálogo SQLite; no se sustituirá por uno vacío: {exc}") from exc
    finally:
        if own_connection and connection is not None:
            connection.close()


def save(path, data):
    current = normalize(data)
    with transaction(path):
        previous = read(path)
        if isinstance(data, Catalog) and (data.database != previous.database or data.revision != previous.revision):
            raise CatalogError("El catálogo ha cambiado desde la lectura; vuelve a cargarlo antes de guardar.")
        if previous == current:
            return previous
        # Recovery exports are independent of the DB, including its change history.
        try:
            _snapshot(path, previous)
            _snapshot(path, current)
        except OSError as exc:
            raise CatalogError("No se puede guardar la copia de recuperación; se cancela el cambio.") from exc
        revision = previous.revision + 1
        _write_diff(_connections()[str(database_path(path))], previous, current, revision)
        return Catalog(current, revision, database_path(path))


def read_item(path, collection, key):
    """Read a single menu entry without loading all movies and episode rows."""
    connection = None
    try:
        database = _ensure_database(path)
        connection = _connect(database, readonly=True)
        connection.execute("BEGIN")
        _validate_schema(connection)
        row = connection.execute("SELECT payload,has_episodes FROM media_items WHERE collection=? AND item_key=?",
                                 (collection, key)).fetchone()
        if row is None:
            return None
        item = json.loads(row[0])
        if row[1]:
            item["episodes"] = [json.loads(payload) for (payload,) in connection.execute(
                "SELECT payload FROM episodes WHERE series_key=? ORDER BY position", (key,))]
        return item
    except (sqlite3.Error, OSError, ValueError) as exc:
        raise CatalogError(f"No se puede leer la ficha SQLite: {exc}") from exc
    finally:
        if connection is not None:
            connection.close()


def check(path):
    read(path)
    connection = _connect(database_path(path), readonly=True)
    try:
        connection.execute("BEGIN")
        if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise CatalogError("La base de datos no supera la comprobación de integridad.")
        if connection.execute("PRAGMA foreign_key_check").fetchall():
            raise CatalogError("La base de datos contiene referencias inválidas.")
        data = _read_connection(connection, database_path(path))
        return {"database": str(database_path(path)), "schema": SCHEMA_VERSION, "revision": data.revision,
                "integrity": "ok", "counts": {key: len(data[key]) for key in COLLECTIONS},
                "episodes": connection.execute("SELECT count(*) FROM episodes").fetchone()[0]}
    finally:
        connection.close()


def export_json(path, target):
    target = Path(target)
    if target.exists():
        raise CatalogError("La exportación no sobrescribe archivos existentes; elige un nombre nuevo.")
    _atomic_write(target, _payload(read(path)))
    return target


def backup(path, target):
    """SQLite's backup API produces a consistent copy, even while the API runs."""
    read(path)
    target = Path(target)
    if target.exists():
        raise CatalogError("La copia no sobrescribe archivos existentes; elige un nombre nuevo.")
    fd, temporary = tempfile.mkstemp(prefix=f".{target.name}-", dir=target.parent)
    os.close(fd)
    try:
        source = _connect(database_path(path), readonly=True)
        destination = sqlite3.connect(temporary)
        try:
            source.backup(destination)
            if destination.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                raise CatalogError("La copia SQLite no supera la comprobación de integridad.")
        finally:
            destination.close()
            source.close()
        with open(temporary, "rb") as handle:
            os.fsync(handle.fileno())
        os.replace(temporary, target)
        _sync_directory(target.parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return target
