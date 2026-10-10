"""Private household recommendation tastes and bounded conversation memory.

This table shares the existing profile database and user lifecycle, without
adding categories to marks/progress or storing provider requests and candidates.
"""
import json
import unicodedata

from user_profiles import ProfileError, ProfileStore


PREFERENCE_FIELDS = ("genres", "actors", "directors", "likedTitles", "dislikedGenres", "dislikedTitles")
SECTIONS = ("movies", "series")
MAX_PREFERENCES = 12
MAX_HISTORY = 12


def empty_preferences():
    return {field: [] for field in PREFERENCE_FIELDS}


def _controls(value, allow_newlines=False):
    return any(unicodedata.category(char) in {"Cc", "Cf", "Cs"}
               and not (allow_newlines and char == "\n") for char in value)


def _dedup_key(value):
    return "".join(char for char in unicodedata.normalize("NFKD", value).casefold()
                   if not unicodedata.combining(char))


def validate_preferences(value):
    """Return fresh, complete preferences; omitted allowed fields default to [].

    Arrays are bounded before deduplication so duplicate-heavy payloads cannot
    bypass input limits. Display spelling is retained after trimming whitespace.
    """
    if not isinstance(value, dict) or set(value) - set(PREFERENCE_FIELDS):
        raise ProfileError("Los gustos guardados no son válidos.")
    result = empty_preferences()
    for field in PREFERENCE_FIELDS:
        values = value.get(field, [])
        if not isinstance(values, list) or len(values) > MAX_PREFERENCES:
            raise ProfileError("Cada categoría admite hasta 12 gustos.")
        seen = set()
        for item in values:
            if not isinstance(item, str) or not item.strip() or len(item) > 100 or _controls(item):
                raise ProfileError("Cada gusto debe tener entre 1 y 100 caracteres, sin caracteres de control.")
            text = " ".join(item.strip().split())
            key = _dedup_key(text)
            if key not in seen:
                result[field].append(text)
                seen.add(key)
    return result


def validate_history(value):
    if not isinstance(value, list) or len(value) > MAX_HISTORY:
        raise ProfileError("El historial admite hasta 12 mensajes.")
    result = []
    for message in value:
        if not isinstance(message, dict) or set(message) != {"role", "text"}:
            raise ProfileError("El historial de recomendaciones no es válido.")
        role, text = message["role"], message["text"]
        if role not in ("user", "assistant") or not isinstance(text, str) or not text.strip() or len(text) > 2000 or _controls(text, allow_newlines=True):
            raise ProfileError("Cada mensaje necesita un autor válido y entre 1 y 2000 caracteres.")
        result.append({"role": role, "text": text.strip()})
    return result


def _section(section):
    if not isinstance(section, str) or section not in SECTIONS:
        raise ProfileError("Las recomendaciones están disponibles para películas y series.")


def _revision(revision):
    if type(revision) is not int or not 0 <= revision < 9_223_372_036_854_775_807:
        raise ProfileError("La versión de los gustos no es válida.")


def _user_id(user_id):
    if not isinstance(user_id, str) or not 1 <= len(user_id) <= 128 or _controls(user_id):
        raise ProfileError("El usuario no es válido.")


class RecommendationProfiles:
    def __init__(self, path):
        self.profiles = ProfileStore(path)

    @staticmethod
    def _schema(db):
        db.execute("""
            CREATE TABLE IF NOT EXISTS recommendation_profiles (
                user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                preferences TEXT NOT NULL,
                histories TEXT NOT NULL,
                revision INTEGER NOT NULL CHECK(revision >= 1)
            )
        """)

    @staticmethod
    def _read(db, user_id):
        ProfileStore.require(db, user_id)
        row = db.execute("SELECT preferences,histories,revision FROM recommendation_profiles WHERE user_id=?",
                         (user_id,)).fetchone()
        if row is None:
            return empty_preferences(), {section: [] for section in SECTIONS}, 0
        try:
            preferences = validate_preferences(json.loads(row["preferences"]))
            stored = json.loads(row["histories"])
            if not isinstance(stored, dict) or set(stored) != set(SECTIONS):
                raise ValueError()
            histories = {section: validate_history(stored[section]) for section in SECTIONS}
            revision = row["revision"]
            _revision(revision)
            if revision == 0:
                raise ValueError()
        except (ValueError, TypeError):
            raise ProfileError("No se pudieron leer los gustos guardados. Se conservan sin cambios.", 500) from None
        return preferences, histories, revision

    @staticmethod
    def _result(preferences, histories, revision, section):
        return {"preferences": preferences, "history": histories[section], "revision": revision}

    def get(self, user_id, section="movies"):
        _user_id(user_id)
        _section(section)
        with self.profiles.connect() as db:
            self._schema(db)
            preferences, histories, revision = self._read(db, user_id)
            return self._result(preferences, histories, revision, section)

    def _write(self, user_id, section, preferences, expected_revision, history=None, clear_history=False):
        _user_id(user_id)
        _section(section)
        _revision(expected_revision)
        preferences = validate_preferences(preferences)
        if history is not None:
            history = validate_history(history)
        if type(clear_history) is not bool:
            raise ProfileError("La opción para limpiar el historial no es válida.")
        with self.profiles.connect() as db:
            self._schema(db)
            db.execute("BEGIN IMMEDIATE")
            _, histories, current_revision = self._read(db, user_id)
            if current_revision != expected_revision:
                raise ProfileError("Los gustos han cambiado en otra consulta. Actualiza e inténtalo de nuevo.", 409)
            if clear_history:
                histories = {key: [] for key in SECTIONS}
            elif history is not None:
                histories[section] = history
            next_revision = current_revision + 1
            values = (json.dumps(preferences, ensure_ascii=False), json.dumps(histories, ensure_ascii=False), next_revision, user_id)
            if current_revision == 0:
                db.execute("INSERT INTO recommendation_profiles(preferences,histories,revision,user_id) VALUES(?,?,?,?)", values)
            else:
                updated = db.execute("UPDATE recommendation_profiles SET preferences=?,histories=?,revision=? WHERE user_id=? AND revision=?",
                                     (*values, expected_revision))
                if updated.rowcount != 1:
                    raise ProfileError("Los gustos han cambiado en otra consulta. Actualiza e inténtalo de nuevo.", 409)
            # Return this committed update's snapshot, not a racing later read.
            return self._result(preferences, histories, next_revision, section)

    def save(self, user_id, section, preferences, history, expected_revision):
        # None is not an empty conversation; callers must submit an explicit list.
        return self._write(user_id, section, preferences, expected_revision, history=validate_history(history))

    def update_preferences(self, user_id, section, preferences, expected_revision, clear_history=False):
        return self._write(user_id, section, preferences, expected_revision, clear_history=clear_history)
