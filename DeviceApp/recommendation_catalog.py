"""Local profile marks and strict, bounded verification of suggested TMDB titles."""
from datetime import date
import http.client
import json
import re
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

from ai_catalog import normalize_text
from catalog_ai import AIError


TMDB_SEARCH_ROOT = "https://api.themoviedb.org/3/search/"
MAX_RESPONSE_BYTES = 1024 * 1024
POSTER_PATH = re.compile(r"/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)")
LANGUAGES = {"es": "es-ES", "ca": "ca-ES", "en": "en-US",
             "es-ES": "es-ES", "ca-ES": "ca-ES", "en-US": "en-US"}


def _mapping(value):
    return value if isinstance(value, dict) else {}


def _items(value):
    return value if isinstance(value, list) else []


def _tmdb_id(value):
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        return 0
    if isinstance(value, str) and not value.isascii():
        return 0
    try:
        number = int(value)
        return number if 0 < number < 2**53 else 0
    except ValueError:
        return 0


def _mark_key(kind, item_id):
    # Match JSON.stringify([type, String(id)]), including non-ASCII paths.
    return json.dumps([kind, str(item_id)], ensure_ascii=False, separators=(",", ":"))


def augment_catalog(records, snapshot, section, user_state):
    """Add verified catalog IDs and the chosen user's explicit local marks.

    The only record path is its existing id. Series marks use the same TMDB-id
    fallback as WebApp; episode/season progress is not a whole-series watched mark.
    """
    if section not in ("movies", "series"):
        raise AIError("Las recomendaciones están disponibles para películas y series.", "AI_INVALID_SECTION")
    snapshot = _mapping(snapshot)
    profiles = _mapping(_mapping(snapshot.get("mediaLibrary")).get(section))
    identity = {}
    if section == "movies":
        scanned = [(item, {}) for item in _items(snapshot.get("movieRootFiles"))]
        for directory in _items(snapshot.get("movieDirectories")):
            if isinstance(directory, dict):
                parent = {**directory, **_mapping(profiles.get(directory.get("relativePath")))}
                scanned.extend((item, parent) for item in _items(directory.get("videos")))
    else:
        scanned = [(item, {}) for item in _items(snapshot.get("directories"))]
    for item, parent in scanned:
        if not isinstance(item, dict) or not isinstance(item.get("relativePath"), str):
            continue
        path = item["relativePath"]
        profile = _mapping(profiles.get(path))
        identity[path] = _tmdb_id(profile.get("tmdbId") or item.get("tmdbId") or parent.get("tmdbId"))
    marks = _mapping(_mapping(user_state).get("marks"))
    result = []
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get("id"), str):
            continue
        item_id = record["id"]
        tmdb_id = identity.get(item_id, 0)
        mark_id = (tmdb_id or item_id) if section == "series" else item_id
        mark = _mapping(marks.get(_mark_key("movie" if section == "movies" else "series", mark_id)))
        result.append({**record, "tmdbId": tmdb_id, "watched": mark.get("watched") is True,
                       "favorite": mark.get("favorite") is True})
    return result


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _has_controls(value):
    return any(unicodedata.category(char) in {"Cc", "Cf", "Cs"} for char in value)


def _requested_year(value):
    if value is None or (type(value) is int and value == 0):
        return None
    if isinstance(value, str) and re.fullmatch(r"[0-9]{4}", value):
        value = int(value)
    if type(value) is not int or not 1000 <= value <= 9999:
        raise AIError("El año propuesto no es válido.", "AI_INVALID_RECOMMENDATION")
    return value


def _release_year(value):
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value).year
    except ValueError:
        return None


def resolve_tmdb_title(title, media_type, year, language, credentials):
    """Verify one proposed title against one TMDB search without fuzzy matching.

    A unique title/original-title and requested-year match is required. Unexamined
    additional result pages are conservatively treated as ambiguous. The card
    contains only selected TMDB fields, never request URLs, credentials or paths.
    """
    if (not isinstance(title, str) or not title.strip() or len(title) > 200 or _has_controls(title)
            or media_type not in ("movie", "tv") or not isinstance(language, str) or language not in LANGUAGES):
        raise AIError("La propuesta de recomendación no es válida.", "AI_INVALID_RECOMMENDATION")
    title_key = normalize_text(title)
    if not title_key:
        raise AIError("El título propuesto no es válido.", "AI_INVALID_RECOMMENDATION")
    requested_year = _requested_year(year)
    credentials = _mapping(credentials)
    bearer = credentials.get("bearerToken") or ""
    api_key = credentials.get("apiKey") or ""
    for secret in (bearer, api_key):
        if not isinstance(secret, str) or len(secret) > 4096 or not secret.isascii() or _has_controls(secret):
            raise AIError("Las credenciales de TMDB no son válidas.", "AI_TMDB_AUTH_ERROR", 502)
    bearer, api_key = bearer.strip(), api_key.strip()
    if not (bearer or api_key):
        raise AIError("Configura TMDB en el dashboard para verificar nuevas recomendaciones.", "AI_TMDB_NOT_CONFIGURED", 409)
    params = {"query": title.strip(), "language": LANGUAGES[language], "include_adult": "false", "page": "1"}
    if requested_year is not None:
        params["primary_release_year" if media_type == "movie" else "first_air_date_year"] = str(requested_year)
    headers = {"Accept": "application/json"}
    if bearer:
        headers["Authorization"] = "Bearer " + bearer
    else:
        params["api_key"] = api_key
    request = urllib.request.Request(TMDB_SEARCH_ROOT + media_type + "?" + urllib.parse.urlencode(params), headers=headers)
    try:
        opener = urllib.request.build_opener(_NoRedirect)
        with opener.open(request, timeout=12) as response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
        if not raw or len(raw) > MAX_RESPONSE_BYTES:
            raise AIError("TMDB devolvió una respuesta no válida.", "AI_TMDB_INVALID_RESPONSE", 502)
        payload = json.loads(raw)
    except urllib.error.HTTPError as error:
        status = error.code
        error.close()
        if status in (401, 403):
            raise AIError("TMDB rechazó las credenciales. Revísalas en el dashboard.", "AI_TMDB_AUTH_ERROR", 502) from None
        if status == 429:
            raise AIError("TMDB ha alcanzado su límite de consultas. Inténtalo más tarde.", "AI_TMDB_RATE_LIMIT", 429) from None
        raise AIError("No se pudo verificar la recomendación en TMDB.", "AI_TMDB_UNAVAILABLE", 502) from None
    except (TimeoutError, urllib.error.URLError, OSError, http.client.HTTPException) as error:
        if isinstance(error, TimeoutError) or isinstance(getattr(error, "reason", None), TimeoutError):
            raise AIError("TMDB tardó demasiado en responder. Inténtalo de nuevo.", "AI_TMDB_TIMEOUT", 504) from None
        raise AIError("No se pudo conectar con TMDB para verificar la recomendación.", "AI_TMDB_UNAVAILABLE", 502) from None
    except (ValueError, UnicodeError):
        raise AIError("TMDB devolvió una respuesta no válida.", "AI_TMDB_INVALID_RESPONSE", 502) from None
    if not isinstance(payload, dict) or payload.get("success") is False or not isinstance(payload.get("results"), list):
        raise AIError("TMDB devolvió una respuesta no válida.", "AI_TMDB_INVALID_RESPONSE", 502)
    total_pages = payload.get("total_pages", 1)
    if type(total_pages) is not int or total_pages < 0:
        raise AIError("TMDB devolvió una respuesta no válida.", "AI_TMDB_INVALID_RESPONSE", 502)
    if total_pages > 1:
        return None
    matches = {}
    for item in payload["results"]:
        if not isinstance(item, dict):
            continue
        tmdb_id = item.get("id")
        if type(tmdb_id) is not int or _tmdb_id(tmdb_id) == 0 or item.get("adult") is True:
            continue
        main_field, original_field = ("title", "original_title") if media_type == "movie" else ("name", "original_name")
        aliases = [item.get(main_field), item.get(original_field)]
        if not any(isinstance(alias, str) and normalize_text(alias) == title_key for alias in aliases):
            continue
        actual_year = _release_year(item.get("release_date" if media_type == "movie" else "first_air_date"))
        if requested_year is not None and actual_year != requested_year:
            continue
        verified_title = item.get(main_field) or item.get(original_field)
        if not isinstance(verified_title, str) or not verified_title.strip() or _has_controls(verified_title):
            continue
        overview = item.get("overview")
        poster_path = item.get("poster_path")
        matches[tmdb_id] = {"tmdbId": tmdb_id, "mediaType": media_type, "title": verified_title.strip()[:300],
                            "year": actual_year or 0, "overview": overview.strip()[:4000] if isinstance(overview, str) else "",
                            "posterPath": poster_path if isinstance(poster_path, str) and POSTER_PATH.fullmatch(poster_path) else ""}
    return next(iter(matches.values())) if len(matches) == 1 else None
