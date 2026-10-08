"""Local household profiles. The shared PIN still controls access to the device."""
import base64
from contextlib import contextmanager
import io
import json
import math
from pathlib import Path
import re
import sqlite3
import time
import uuid


class ProfileError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def validate_avatar(value):
    if isinstance(value, str) and re.fullmatch(r"avatar-(?:0[1-9]|1[0-9]|2[0-5])", value):
        return value
    if not isinstance(value, str) or len(value) > 750_000:
        raise ProfileError("El avatar es demasiado grande.")
    match = re.fullmatch(r"data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)", value)
    if not match:
        raise ProfileError("Elige un avatar o una foto JPG, PNG o WebP.")
    try:
        from PIL import Image, ImageOps
        with Image.open(io.BytesIO(base64.b64decode(match[2], validate=True))) as photo:
            if photo.width * photo.height > 16_000_000 or photo.format not in {"JPEG", "PNG", "WEBP"}:
                raise ValueError()
            photo = ImageOps.exif_transpose(photo).convert("RGB")
            photo = ImageOps.fit(photo, (256, 256))
            buffer = io.BytesIO()
            photo.save(buffer, format="JPEG", quality=88)
            return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode()
    except (OSError, ValueError, Image.DecompressionBombError):
        raise ProfileError("No se pudo leer la foto.") from None


def validate_marks(value):
    if not isinstance(value, dict) or set(value) - {"watched", "favorite", "episodes"}:
        raise ProfileError("Marcas no válidas.")
    for key in ("watched", "favorite"):
        if key in value and not isinstance(value[key], bool):
            raise ProfileError("Marcas no válidas.")
    if "episodes" in value:
        episodes = value["episodes"]
        if not isinstance(episodes, dict) or len(episodes) > 1000 or any(
            not re.fullmatch(r"\d{1,5}", str(key)) or not isinstance(item, bool) for key, item in episodes.items()
        ):
            raise ProfileError("Episodios no válidos.")
    return value


def validate_progress(value):
    if not isinstance(value, dict) or value.get("kind") not in {"video", "book"}:
        raise ProfileError("Posición no válida.")
    result = {"kind": value["kind"], "opened": True, "updatedAt": int(time.time() * 1000)}
    for key in ("seconds", "duration", "page", "total", "section"):
        if key in value:
            number = value[key]
            if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number) or not 0 <= number <= 100_000_000:
                raise ProfileError("Posición no válida.")
            result[key] = number
    if "cfi" in value:
        cfi = value["cfi"]
        if not isinstance(cfi, str) or len(cfi) > 4096 or (cfi and not cfi.startswith("epubcfi(")):
            raise ProfileError("Posición EPUB no válida.")
        result["cfi"] = cfi
    result["completed"] = value.get("completed") is True
    return result


class ProfileStore:
    def __init__(self, path):
        self.path = str(path)

    @contextmanager
    def connect(self):
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT NOT NULL, created REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS user_state (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                category TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(user_id, category, key));
        """)
        db.execute("INSERT OR IGNORE INTO users VALUES ('default', 'default', 'avatar-01', 0)")
        db.commit()
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def require(db, user_id):
        row = db.execute("SELECT id,name,avatar FROM users WHERE id=?", (user_id,)).fetchone()
        if row is None:
            raise ProfileError("El usuario ya no existe.", 404)
        return dict(row)

    def users(self):
        with self.connect() as db:
            return [dict(row) for row in db.execute("SELECT id,name,avatar FROM users ORDER BY created,id")]

    def save_user(self, data, user_id=None):
        if not isinstance(data, dict) or not isinstance(data.get("name"), str) or not 1 <= len(data["name"].strip()) <= 40:
            raise ProfileError("Escribe un nombre de entre 1 y 40 caracteres.")
        name = data["name"].strip()
        avatar = validate_avatar(data.get("avatar"))
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if user_id:
                self.require(db, user_id)
                db.execute("UPDATE users SET name=?,avatar=? WHERE id=?", (name, avatar, user_id))
            else:
                user_id = uuid.uuid4().hex
                db.execute("INSERT INTO users VALUES (?,?,?,?)", (user_id, name, avatar, time.time()))
            return self.require(db, user_id)

    def delete_user(self, user_id):
        if user_id == "default":
            raise ProfileError("El perfil default se conserva para iniciar la app.")
        with self.connect() as db:
            self.require(db, user_id)
            db.execute("DELETE FROM users WHERE id=?", (user_id,))

    def state(self, user_id):
        with self.connect() as db:
            self.require(db, user_id)
            result = {"marks": {}, "progress": {}}
            for row in db.execute("SELECT category,key,value FROM user_state WHERE user_id=?", (user_id,)):
                result[row["category"]][row["key"]] = json.loads(row["value"])
            return result

    def patch(self, user_id, data):
        if not isinstance(data, dict) or set(data) - {"marks", "progress"}:
            raise ProfileError("Estado no válido.")
        validated = []
        for category, entries in data.items():
            if not isinstance(entries, dict) or len(entries) > 1000:
                raise ProfileError("Estado no válido.")
            for key, value in entries.items():
                if not isinstance(key, str) or not 1 <= len(key) <= 2048:
                    raise ProfileError("Contenido no válido.")
                validated.append((category, key, validate_marks(value) if category == "marks" else validate_progress(value)))
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self.require(db, user_id)
            for category, key, value in validated:
                if category == "marks":
                    row = db.execute("SELECT value FROM user_state WHERE user_id=? AND category=? AND key=?", (user_id, category, key)).fetchone()
                    previous = json.loads(row[0]) if row else {}
                    # Marking a whole season resets its exceptions; a single episode merges them.
                    if "episodes" in value and "watched" not in value:
                        value = {**value, "episodes": {**previous.get("episodes", {}), **value["episodes"]}}
                    value = {**previous, **value}
                db.execute("INSERT INTO user_state VALUES (?,?,?,?) ON CONFLICT(user_id,category,key) DO UPDATE SET value=excluded.value",
                           (user_id, category, key, json.dumps(value, ensure_ascii=False)))
        return {"ok": True}
