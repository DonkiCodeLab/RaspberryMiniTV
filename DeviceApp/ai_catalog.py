"""Read-only catalog projection and deterministic execution of AI filter plans.

The model supplies criteria, never catalog IDs or executable expressions. Every
result is joined back to the current disk scan, using the same paths as WebApp.
"""
import re
import unicodedata

from tmdb_cache import TmdbCache, TmdbError


SECTION_FIELDS = {
    "movies": frozenset(("title", "actor", "director", "writer", "genre", "year", "overview")),
    "series": frozenset(("title", "actor", "director", "writer", "creator", "genre", "year", "overview")),
    "books": frozenset(("title", "author", "genre", "year", "overview", "publisher")),
    "games": frozenset(("title", "genre", "year", "platform", "developer", "publisher", "overview")),
    "pictures": frozenset(("title", "year")),
}
ALL_FIELDS = frozenset().union(*SECTION_FIELDS.values())
LANGUAGES = {"es": "es-ES", "ca": "ca-ES", "en": "en-US"}

# Stable genre vocabulary, also useful when a book/game provider uses English.
GENRE_ALIASES = (
    ("action", "acción", "acció"), ("adventure", "aventura", "aventuras", "aventures"),
    ("animation", "animación", "animació"), ("comedy", "comedia", "comèdia"),
    ("crime", "crimen", "crim"), ("documentary", "documental"), ("drama",),
    ("family", "familia", "familiar"), ("fantasy", "fantasía", "fantasia"),
    ("history", "historia", "història"), ("horror", "terror"),
    ("music", "música"), ("mystery", "misterio", "misteri"),
    ("romance", "romántica", "romàntica"),
    ("science fiction", "ciencia ficción", "ciència ficció", "sci fi"),
    ("tv movie", "película de tv", "pel·lícula de tv"),
    ("thriller", "suspense", "suspens"), ("war", "guerra", "bélica", "bèl·lica"),
    ("western", "oeste"), ("kids", "infantil", "infantiles"),
    ("reality",), ("news", "noticias", "notícies"), ("soap", "telenovela"),
    ("talk", "conversación", "conversa"),
    ("platform", "platformer", "plataformas", "plataformes"),
    ("role playing", "role playing rpg", "rpg", "rol"),
    ("racing", "carreras", "curses"), ("sport", "sports", "deportes", "esports"),
    ("fighting", "lucha", "lluita"), ("puzzle", "puzle", "rompecabezas", "trencaclosques"),
    ("strategy", "estrategia", "estratègia"), ("simulation", "simulación", "simulació"),
    ("shooter", "disparos", "trets"), ("arcade",),
)
TMDB_GENRES = {28: "action", 12: "adventure", 16: "animation", 35: "comedy", 80: "crime",
               99: "documentary", 18: "drama", 10751: "family", 14: "fantasy", 36: "history",
               27: "horror", 10402: "music", 9648: "mystery", 10749: "romance",
               878: "science fiction", 10770: "tv movie", 53: "thriller", 10752: "war",
               37: "western", 10762: "kids", 10763: "news", 10764: "reality", 10766: "soap",
               10767: "talk", 10759: ("action", "adventure"),
               10765: ("science fiction", "fantasy"), 10768: ("war", "politics", "política")}


def normalize_text(value):
    value = unicodedata.normalize("NFKD", str(value or "")).casefold()
    value = "".join(char for char in value if not unicodedata.combining(char))
    return " ".join("".join(char if char.isalnum() else " " for char in value).split())


_GENRE_LOOKUP = {normalize_text(alias): aliases for aliases in GENRE_ALIASES for alias in aliases}


def _mapping(value):
    return value if isinstance(value, dict) else {}


def _items(value):
    return value if isinstance(value, list) else []


def _texts(*values):
    result, seen = [], set()
    for value in values:
        if isinstance(value, (list, tuple)):
            candidates = _texts(*value)
        elif isinstance(value, str) and value.strip():
            candidates = [value.strip()]
        else:
            candidates = []
        for candidate in candidates:
            key = normalize_text(candidate)
            if key and key not in seen:
                result.append(candidate)
                seen.add(key)
    return result


def _names(people):
    return _texts(*[name for person in _items(people) if isinstance(person, dict)
                    for name in (person.get("name"), person.get("original_name"))])


def _genres(value):
    genres = []
    for item in value if isinstance(value, list) else [value]:
        if isinstance(item, dict):
            genres.extend(_texts(item.get("name"), TMDB_GENRES.get(item.get("id"))))
        else:
            genres.extend(_texts(item))
    aliases = [alias for genre in genres for alias in _GENRE_LOOKUP.get(normalize_text(genre), ())]
    return _texts(genres, aliases)


def _year(value):
    # Years are metadata, never guessed from a title or filesystem mtime.
    if isinstance(value, bool):
        return None
    match = re.search(r"(?<!\d)(\d{4})(?!\d)", str(value or ""))
    return int(match.group(1)) if match and 1 <= int(match.group(1)) <= 9999 else None


def _locale(language):
    code = str(language or "es").lower().replace("_", "-").split("-")[0]
    return {"spa": "es", "cat": "ca", "eng": "en"}.get(code, code) if code in (*LANGUAGES, "spa", "cat", "eng") else "es"


class _LocalMetadata:
    """Memoize within one scan; local_only never starts downloads or changes files."""
    def __init__(self, cache, language):
        self.cache = cache
        self.language = LANGUAGES[_locale(language)]
        self.saved = {}

    def read(self, path, params=None):
        key = (path, tuple(sorted((params or {}).items())))
        if key not in self.saved:
            try:
                value = self.cache.json(path, params, local_only=True) if self.cache is not None else {}
                self.saved[key] = value if isinstance(value, dict) and value.get("success") is not False else {}
            except (TmdbError, OSError, ValueError):
                self.saved[key] = {}
        return self.saved[key]

    def details(self, kind, tmdb_id):
        path = f"/{kind}/{tmdb_id}"
        appended = "credits" if kind == "movie" else "aggregate_credits"
        params = {"language": self.language}
        if kind == "movie":
            params["append_to_response"] = "external_ids"
        detail = self.read(path, params)
        if not detail:
            detail = self.read(path, {"language": self.language})
        if not detail:
            # Earlier versions imported a whole detail including credits.
            detail = self.read(path, {"append_to_response": appended})
        if not detail and self.language != "en-US":
            fallback = {**params, "language": "en-US"}
            detail = self.read(path, fallback)
        if detail.get("id") != tmdb_id:
            detail = {}
        credits = self.read(path + "/" + appended)
        if not credits:
            nested = detail.get(appended)
            if isinstance(nested, dict):
                try:
                    candidate = {"id": tmdb_id, **nested}
                    TmdbCache._validate_credits(path + "/" + appended, candidate)
                    credits = candidate
                except ValueError:
                    pass
        if credits.get("id") != tmdb_id:
            credits = {}
        return detail, credits


def _video_fields(section, entry, local):
    fields = {field: [] for field in SECTION_FIELDS[section]}
    fields["year"] = None
    title = entry.get("name") or entry.get("title") or str(entry.get("file") or entry.get("relativePath") or "").rsplit("/", 1)[-1].rsplit(".", 1)[0]
    fields["title"] = _texts(title)
    try:
        tmdb_id = int(entry.get("tmdbId") or 0)
    except (TypeError, ValueError):
        tmdb_id = 0
    detail, credits = local.details("movie" if section == "movies" else "tv", tmdb_id) if tmdb_id > 0 else ({}, {})
    fields["title"] = _texts(title, detail.get("title"), detail.get("name"), detail.get("original_title"), detail.get("original_name"))
    fields["overview"] = _texts(detail.get("overview"))
    fields["year"] = _year(detail.get("release_date") or detail.get("first_air_date"))
    fields["genre"] = _genres(detail.get("genres"))
    fields["actor"] = _names(credits.get("cast"))
    for person in _items(credits.get("crew")):
        if not isinstance(person, dict):
            continue
        jobs = {normalize_text(job.get("job")) for job in [person, *_items(person.get("jobs"))] if isinstance(job, dict)}
        names = _names([person])
        if "director" in jobs:
            fields["director"].extend(names)
        if jobs.intersection({"writer", "screenplay", "story", "teleplay", "adaptation", "dialogue", "novel", "original story", "original film writer", "book", "characters"}):
            fields["writer"].extend(names)
    if section == "series":
        fields["creator"] = _names(detail.get("created_by"))
    fields = {field: _texts(value) if field != "year" else value for field, value in fields.items()}
    complete_credits = isinstance(credits.get("cast"), list) and isinstance(credits.get("crew"), list)
    missing = not (detail and fields["year"] and fields["overview"] and fields["genre"] and complete_credits)
    return fields, missing


def _book_fields(entry, language, collection):
    original = _mapping(entry.get("originalMetadata")) or entry
    localized = _mapping(_mapping(original.get("localizedMetadata")).get(_locale(language)))
    localized = {key: value for key, value in localized.items() if key in ("title", "subtitle", "description", "subjects")}
    current = {**original, **localized}
    subjects = current.get("subjects")
    # Open Library normalizes subject lists to a comma-separated string.
    if isinstance(subjects, str):
        subjects = [value.strip() for value in subjects.split(",")]
    fields = {
        "title": _texts(current.get("title"), current.get("name"), current.get("subtitle"), collection.get("name"), entry.get("collection")),
        "author": _texts(current.get("author"), collection.get("author")),
        "genre": _genres(subjects), "year": _year(current.get("year")),
        "overview": _texts(current.get("description")), "publisher": _texts(current.get("publisher")),
    }
    return fields, not (fields["author"] and fields["year"] and fields["overview"])


def _game_fields(entry):
    metadata = _mapping(entry.get("gameMetadata"))
    fields = {
        "title": _texts(entry.get("name"), metadata.get("name")),
        "genre": _genres(metadata.get("genres")),
        "year": _year(metadata.get("releaseDate") or entry.get("releaseDate") or entry.get("releaseYear") or entry.get("year")),
        "platform": _texts(entry.get("platformName"), entry.get("platform")),
        "developer": _texts(metadata.get("developers")), "publisher": _texts(metadata.get("publishers")),
        "overview": _texts(entry.get("description"), metadata.get("description"), metadata.get("storyline")),
    }
    return fields, not (fields["year"] and fields["genre"] and fields["overview"])


def build_catalog(section, library_snapshot, tmdb_cache, language="es"):
    """Build search records only for items present in the supplied /videos scan.

    missingMetadata counts items missing core details/credits, not unavailable
    optional credits (an empty validated cast is different from missing credits).
    Pictures have no reliable capture-year source; their year remains unknown.
    """
    if section not in SECTION_FIELDS:
        raise ValueError("Sección del catálogo no válida")
    snapshot = _mapping(library_snapshot)
    profiles = _mapping(_mapping(snapshot.get("mediaLibrary")).get(section))
    local = _LocalMetadata(tmdb_cache, language)
    entries = []
    if section == "movies":
        entries.extend((item, {}) for item in _items(snapshot.get("movieRootFiles")))
        for directory in _items(snapshot.get("movieDirectories")):
            if isinstance(directory, dict):
                profile = _mapping(profiles.get(directory.get("relativePath")))
                entries.extend((item, {**directory, **profile}) for item in _items(directory.get("videos")))
    else:
        entries = [(item, {}) for item in _items(snapshot.get("directories" if section == "series" else section))]
    records, seen, missing = [], set(), 0
    collections = _mapping(snapshot.get("bookCollections")) or _mapping(_mapping(snapshot.get("mediaLibrary")).get("bookCollections"))
    for scanned, directory_profile in entries:
        if not isinstance(scanned, dict):
            continue
        path = scanned.get("relativePath")
        if not isinstance(path, str) or not path.strip() or path in seen:
            continue
        seen.add(path)
        profile = _mapping(profiles.get(path))
        entry = {**directory_profile, **scanned, **profile, "relativePath": path}
        if section in ("movies", "series"):
            # A blank file-level field must not erase an available directory profile.
            for key in ("name", "tmdbId"):
                entry[key] = profile.get(key) or scanned.get(key) or directory_profile.get(key)
            fields, incomplete = _video_fields(section, entry, local)
        elif section == "books":
            fields, incomplete = _book_fields(entry, language, _mapping(collections.get(entry.get("collection"))))
        elif section == "games":
            fields, incomplete = _game_fields(entry)
        else:
            fields = {"title": _texts(entry.get("name"), path), "year": None}
            incomplete = True
        records.append({"id": path, "fields": fields})
        missing += int(incomplete)
    return {"records": records, "missingMetadata": missing}


def _compile_plan(plan):
    if not isinstance(plan, dict) or plan.get("intent") not in ("filter", "count", "clarify", "unsupported"):
        raise ValueError("Plan de búsqueda no válido")
    groups = plan.get("groups")
    if not isinstance(groups, list) or len(groups) > 8:
        raise ValueError("Grupos de búsqueda no válidos")
    if plan["intent"] in ("clarify", "unsupported"):
        if groups:
            raise ValueError("La búsqueda necesita aclaración")
        return []
    if not groups and plan["intent"] != "count":
        raise ValueError("Faltan los criterios de búsqueda")
    compiled = []
    for group in groups:
        conditions = group.get("conditions") if isinstance(group, dict) else None
        if not isinstance(conditions, list) or not conditions or len(conditions) > 8:
            raise ValueError("Condiciones de búsqueda no válidas")
        criteria = []
        for condition in conditions:
            if not isinstance(condition, dict):
                raise ValueError("Criterio de búsqueda no válido")
            field, op, value = (condition.get(key) for key in ("field", "op", "value"))
            if not isinstance(field, str) or field not in ALL_FIELDS or not isinstance(value, str) or not value.strip() or len(value) > 160:
                raise ValueError("Campo o valor de búsqueda no válido")
            if field == "year":
                if op not in ("eq", "gte", "lte") or not re.fullmatch(r"[0-9]{1,4}", value.strip()) or not 1 <= int(value) <= 9999:
                    raise ValueError("Filtro de año no válido")
                value = int(value)
            else:
                if op not in ("contains", "not_contains", "eq"):
                    raise ValueError("Operador de búsqueda no válido")
                value = normalize_text(value)
                if not value:
                    raise ValueError("Valor de búsqueda vacío")
            criteria.append((field, op, value))
        compiled.append(criteria)
    return compiled


def _matches(fields, criterion):
    field, op, expected = criterion
    value = fields.get(field)
    if field == "year":
        if type(value) is not int:
            return False
        return value == expected if op == "eq" else value >= expected if op == "gte" else value <= expected
    values = [normalize_text(item) for item in _texts(value)]
    if field == "genre":
        values = [normalize_text(item) for item in _genres(value)]
    if not values:
        # Unknown metadata cannot establish a negative fact.
        return False
    matches = any(expected == item if op == "eq" else expected in item for item in values)
    return not matches if op == "not_contains" else matches


def execute_plan(records, plan):
    """OR of groups, AND within groups; return only existing IDs in scan order.

    Only count accepts an empty groups list (count the whole section). A malformed
    plan raises ValueError even for an empty catalog or an otherwise valid OR arm.
    """
    compiled = _compile_plan(plan)
    if plan["intent"] in ("clarify", "unsupported"):
        return []
    result, seen = [], set()
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get("id"), str) or not record["id"]:
            continue
        fields = _mapping(record.get("fields"))
        if (not compiled or any(all(_matches(fields, criterion) for criterion in group) for group in compiled)) and record["id"] not in seen:
            seen.add(record["id"])
            result.append(record["id"])
    return result
