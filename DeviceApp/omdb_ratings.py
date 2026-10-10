"""Private OMDb credentials and on-demand title ratings with a persistent cache."""
import hashlib
import http.client
import json
import math
import os
from pathlib import Path
import re
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

IMDB_ID = re.compile(r"tt\d{7,12}")
RATING_TTL = 7 * 86400
MISSING_TTL = 86400
MAX_RESPONSE_BYTES = 256 * 1024
CACHE_VERSION = 2
SCORE_FIELDS = ("rating", "rottenTomatoes", "metacritic")
ERRORS = {
    "OMDB_NOT_CONFIGURED": ("Guarda la clave de OMDb en Ajustes.", 503),
    "OMDB_INVALID_SETTINGS": ("La configuración de OMDb no es válida.", 400),
    "OMDB_INVALID_ID": ("El identificador del título no es válido.", 400),
    "OMDB_INVALID_ACTION": ("La acción de actualización de OMDb no es válida.", 400),
    "OMDB_ID_MISSING": ("Este título no tiene un identificador de IMDb disponible.", 404),
    "OMDB_AUTH_ERROR": ("OMDb rechazó la clave. Comprueba que esté activada.", 502),
    "OMDB_LIMIT": ("Se ha alcanzado el límite de consultas de OMDb. Inténtalo más tarde.", 429),
    "OMDB_CONNECTION_ERROR": ("No se pudo conectar con OMDb. Inténtalo más tarde.", 502),
    "OMDB_INVALID_RESPONSE": ("OMDb devolvió una respuesta no válida.", 502),
    "OMDB_TMDB_NOT_CONFIGURED": ("Configura TMDB para encontrar el identificador de IMDb.", 503),
    "OMDB_TMDB_ERROR": ("No se pudo obtener el identificador de IMDb desde TMDB.", 502),
    "OMDB_STORAGE_ERROR": ("No se pudieron leer o guardar los datos locales de OMDb.", 500),
}


class OmdbError(RuntimeError):
    def __init__(self, code):
        message, self.status = ERRORS[code]
        super().__init__(message)
        self.code = code


def _read(path, limit=MAX_RESPONSE_BYTES):
    try:
        with Path(path).open("rb") as handle:
            raw = handle.read(limit + 1)
        if len(raw) > limit:
            return None
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except (OSError, ValueError, UnicodeError):
        return None


def _write(path, data):
    path = Path(path)
    temporary = None
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".omdb-")
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            os.fchmod(handle.fileno(), 0o600)
            json.dump(data, handle, ensure_ascii=False, allow_nan=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except OSError:
        raise OmdbError("OMDB_STORAGE_ERROR") from None
    finally:
        if temporary:
            try:
                os.unlink(temporary)
            except OSError:
                pass


class OmdbSettings:
    def __init__(self, path):
        self.path = Path(path)
        self.lock = threading.RLock()

    def credentials(self):
        with self.lock:
            data = _read(self.path, 4096)
            if data is None:
                if self.path.exists():
                    raise OmdbError("OMDB_STORAGE_ERROR")
                return ""
            key = data.get("apiKey", "")
            if not self._valid_key(key):
                raise OmdbError("OMDB_STORAGE_ERROR")
            return key.strip()

    @staticmethod
    def _valid_key(key):
        return isinstance(key, str) and len(key) <= 256 and (not key.strip() or bool(re.fullmatch(r"[A-Za-z0-9_-]+", key.strip())))

    def public(self):
        return {"configured": bool(self.credentials())}

    def update(self, changes):
        if (not isinstance(changes, dict) or set(changes) - {"apiKey", "clearApiKey"}
                or not self._valid_key(changes.get("apiKey", ""))
                or ("clearApiKey" in changes and type(changes["clearApiKey"]) is not bool)):
            raise OmdbError("OMDB_INVALID_SETTINGS")
        with self.lock:
            key = changes.get("apiKey", "").strip()
            if changes.get("clearApiKey"):
                key = ""
            elif not key:
                key = self.credentials()
            _write(self.path, {"apiKey": key})
            return {"configured": bool(key)}


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _download_json(url, *, headers=None, tmdb=False):
    """Only called with fixed HTTPS hosts, with no redirects or automatic retries."""
    try:
        opener = urllib.request.build_opener(_NoRedirect)
        request = urllib.request.Request(url, headers={"Accept": "application/json", **(headers or {})})
        with opener.open(request, timeout=8) as response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
        if not raw or len(raw) > MAX_RESPONSE_BYTES:
            raise ValueError()
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError()
        return data
    except urllib.error.HTTPError as exc:
        # OMDb also uses HTTP 401 for exhausted quotas. Interpret only the
        # bounded provider error object; never expose its text or request URL.
        if not tmdb and exc.code in (401, 403, 429):
            try:
                raw = exc.read(MAX_RESPONSE_BYTES + 1)
                error = json.loads(raw) if len(raw) <= MAX_RESPONSE_BYTES else None
                if isinstance(error, dict) and error.get("Response") == "False":
                    return error
            except (OSError, ValueError, UnicodeError, http.client.HTTPException):
                pass
        code = ("OMDB_AUTH_ERROR" if exc.code in (401, 403) else
                "OMDB_LIMIT" if exc.code == 429 else "OMDB_CONNECTION_ERROR")
        raise OmdbError("OMDB_TMDB_ERROR" if tmdb else code) from None
    except (OSError, TimeoutError, http.client.HTTPException):
        raise OmdbError("OMDB_TMDB_ERROR" if tmdb else "OMDB_CONNECTION_ERROR") from None
    except (ValueError, UnicodeError):
        raise OmdbError("OMDB_TMDB_ERROR" if tmdb else "OMDB_INVALID_RESPONSE") from None


def _hundred_score(value, suffix=""):
    """Optional scores use exact provider units; malformed values are absent."""
    if not isinstance(value, str):
        return None
    match = re.fullmatch(r"(0|[1-9][0-9]?|100)" + re.escape(suffix), value)
    return int(match.group(1)) if match else None


def _critic_scores(data):
    scores = {"rottenTomatoes": None, "metacritic": None}
    sources = {"Rotten Tomatoes": ("rottenTomatoes", "%"), "Metacritic": ("metacritic", "/100")}
    ratings = data.get("Ratings")
    for entry in ratings if isinstance(ratings, list) else []:
        if not isinstance(entry, dict) or not isinstance(entry.get("Source"), str):
            continue
        source = sources.get(entry["Source"])
        if source and scores[source[0]] is None:
            scores[source[0]] = _hundred_score(entry.get("Value"), source[1])
    if scores["metacritic"] is None:
        scores["metacritic"] = _hundred_score(data.get("Metascore"))
    return scores


def _parse_rating(data, imdb_id, kind=None):
    if data.get("Response") == "False":
        error = str(data.get("Error") or "").lower()
        if "limit" in error:
            raise OmdbError("OMDB_LIMIT")
        if "api key" in error or "apikey" in error or "activat" in error:
            raise OmdbError("OMDB_AUTH_ERROR")
        if "not found" in error:
            return {"imdbId": imdb_id, "rating": None, "votes": None,
                    "rottenTomatoes": None, "metacritic": None, "type": None}
        raise OmdbError("OMDB_INVALID_RESPONSE")
    expected_type = {"movie": "movie", "tv": "series"}.get(kind)
    if (data.get("Response") != "True" or data.get("imdbID") != imdb_id
            or data.get("Type") not in ("movie", "series")
            or (expected_type and data.get("Type") != expected_type)):
        raise OmdbError("OMDB_INVALID_RESPONSE")
    rating, votes = data.get("imdbRating"), data.get("imdbVotes")
    try:
        if isinstance(rating, bool):
            raise ValueError()
        rating = None if rating in (None, "", "N/A") else float(rating)
        if rating is not None and (not math.isfinite(rating) or not 1 <= rating <= 10):
            raise ValueError()
        if votes in (None, "", "N/A"):
            votes = None
        elif not isinstance(votes, str) or not re.fullmatch(r"(?:\d{1,3}(?:,\d{3})+|\d{1,15})", votes):
            raise ValueError()
        else:
            votes = int(votes.replace(",", ""))
    except (ValueError, TypeError, OverflowError):
        raise OmdbError("OMDB_INVALID_RESPONSE") from None
    return {"imdbId": imdb_id, "rating": rating, "votes": votes, "type": data["Type"], **_critic_scores(data)}


class OmdbRatings:
    def __init__(self, root, credentials, tmdb_cache, tmdb_credentials):
        self.root = Path(root)
        self.credentials = credentials
        self.tmdb_cache = tmdb_cache
        self.tmdb_credentials = tmdb_credentials
        # Coalesces concurrent requests for the same title; independent of TMDB's
        # library/cache locks, so ratings never delay local library reads.
        self.lock = threading.RLock()

    @staticmethod
    def _identity(imdb_id, kind, tmdb_id):
        if kind is not None and kind not in ("movie", "tv"):
            raise OmdbError("OMDB_INVALID_ID")
        if imdb_id is not None:
            if not isinstance(imdb_id, str) or not IMDB_ID.fullmatch(imdb_id):
                raise OmdbError("OMDB_INVALID_ID")
        elif (kind is None or not re.fullmatch(r"[1-9]\d{0,15}", str(tmdb_id or ""))
                or int(tmdb_id) > 9007199254740991):
            raise OmdbError("OMDB_INVALID_ID")

    def _resolve_id(self, kind, tmdb_id, now):
        target = self.root / "ids" / f"{kind}-{int(tmdb_id)}.json"
        cached = _read(target) or {}
        imdb_id = cached.get("imdbId")
        if isinstance(imdb_id, str) and IMDB_ID.fullmatch(imdb_id):
            return imdb_id  # TMDB-to-IMDb identities are stable.
        if isinstance(cached.get("retryAt"), (int, float)) and cached["retryAt"] > now:
            raise OmdbError(cached.get("code") if cached.get("code") in ERRORS else "OMDB_ID_MISSING")
        imdb_id = self._local_imdb_id(kind, tmdb_id)
        if imdb_id:
            _write(target, {"imdbId": imdb_id})
            return imdb_id
        credentials = self.tmdb_credentials()
        params, headers = {}, {}
        if credentials.get("bearerToken"):
            headers["Authorization"] = "Bearer " + credentials["bearerToken"]
        elif credentials.get("apiKey"):
            params["api_key"] = credentials["apiKey"]
        else:
            raise OmdbError("OMDB_TMDB_NOT_CONFIGURED")
        url = f"https://api.themoviedb.org/3/{kind}/{int(tmdb_id)}/external_ids?" + urllib.parse.urlencode(params)
        try:
            data = _download_json(url, headers=headers, tmdb=True)
            if data.get("id") != int(tmdb_id):
                raise OmdbError("OMDB_TMDB_ERROR")
            imdb_id = data.get("imdb_id")
            if not isinstance(imdb_id, str) or not IMDB_ID.fullmatch(imdb_id):
                raise OmdbError("OMDB_ID_MISSING")
        except OmdbError as exc:
            _write(target, {"retryAt": now + (MISSING_TTL if exc.code == "OMDB_ID_MISSING" else 60), "code": exc.code})
            raise
        _write(target, {"imdbId": imdb_id})
        return imdb_id

    def _local_imdb_id(self, kind, tmdb_id):
        """Read existing TMDB language variants without a download or write."""
        for language in ("es-ES", "ca-ES", "en-US"):
            params = {"language": language}
            if kind == "movie":
                params["append_to_response"] = "external_ids"
            try:
                data = self.tmdb_cache.json(f"/{kind}/{int(tmdb_id)}", params, local_only=True)
            except (RuntimeError, ValueError, OSError):
                continue
            if not isinstance(data, dict):
                continue
            external = data.get("external_ids")
            imdb_id = ((external or {}).get("imdb_id") if isinstance(external, dict) else None) or data.get("imdb_id")
            if isinstance(imdb_id, str) and IMDB_ID.fullmatch(imdb_id):
                return imdb_id
        return None

    def _cached(self, imdb_id, kind, now):
        cached = _read(self.root / "ratings" / f"{imdb_id}.json")
        if not cached:
            return None
        expected = {"movie": "movie", "tv": "series"}.get(kind)
        rating, votes, updated = cached.get("rating"), cached.get("votes"), cached.get("updatedAt")
        if (cached.get("imdbId") != imdb_id or (expected and cached.get("type") not in (None, expected))
                or (rating is not None and (type(rating) not in (int, float) or not math.isfinite(rating) or not 1 <= rating <= 10))
                or (votes is not None and (type(votes) is not int or votes < 0))
                or type(updated) not in (int, float) or not 0 < updated <= now):
            return None
        for field in ("rottenTomatoes", "metacritic"):
            value = cached.get(field)
            if type(value) is not int or not 0 <= value <= 100:
                cached[field] = None
        return cached

    @staticmethod
    def _current(cached, now):
        if not cached or cached.get("version") != CACHE_VERSION:
            return False
        ttl = RATING_TTL if any(cached.get(field) is not None for field in SCORE_FIELDS) else MISSING_TTL
        return now - cached["updatedAt"] < ttl

    def peek(self, *, imdb_id=None, kind=None, tmdb_id=None):
        """Return a current cached result only; never resolve online or write."""
        self._identity(imdb_id, kind, tmdb_id)
        if not imdb_id:
            data = _read(self.root / "ids" / f"{kind}-{int(tmdb_id)}.json") or {}
            imdb_id = data.get("imdbId")
            if not isinstance(imdb_id, str) or not IMDB_ID.fullmatch(imdb_id):
                imdb_id = self._local_imdb_id(kind, tmdb_id)
        if not imdb_id:
            return None
        now = time.time()
        cached = self._cached(imdb_id, kind, now)
        return self._public(cached) if self._current(cached, now) else None

    def _fetch(self, key, imdb_id, kind=None):
        params = {"apikey": key, "i": imdb_id, "r": "json", "plot": "short"}
        if kind:
            params["type"] = "series" if kind == "tv" else "movie"
        return _parse_rating(_download_json("https://www.omdbapi.com/?" + urllib.parse.urlencode(params)), imdb_id, kind)

    @staticmethod
    def _public(data, *, stale=False, code=None):
        result = {"ok": True, **{name: data.get(name) for name in
                                ("imdbId", "rating", "votes", "rottenTomatoes", "metacritic", "updatedAt")}, "stale": stale}
        if code:
            result["code"] = code
        return result

    def _cooldown(self, key, now, code=None):
        target = self.root / "cooldown.json"
        fingerprint = hashlib.sha256(key.encode()).hexdigest()
        if code:
            delay = 3600 if code == "OMDB_LIMIT" else 300 if code == "OMDB_AUTH_ERROR" else 60
            _write(target, {"fingerprint": fingerprint, "code": code, "retryAt": now + delay})
        else:
            data = _read(target) or {}
            if (data.get("fingerprint") == fingerprint and data.get("code") in ERRORS
                    and isinstance(data.get("retryAt"), (int, float)) and data["retryAt"] > now):
                raise OmdbError(data["code"])

    def get(self, *, imdb_id=None, kind=None, tmdb_id=None):
        self._identity(imdb_id, kind, tmdb_id)
        with self.lock:
            key = self.credentials()
            if not key:
                raise OmdbError("OMDB_NOT_CONFIGURED")
            now = time.time()
            imdb_id = imdb_id or self._resolve_id(kind, tmdb_id, now)
            target = self.root / "ratings" / f"{imdb_id}.json"
            cached = self._cached(imdb_id, kind, now)
            # Old IMDb-only caches get one lazy refresh; retain their IMDb
            # values below if the provider is offline or in cooldown.
            if self._current(cached, now):
                return self._public(cached)
            try:
                self._cooldown(key, now)
                result = {**self._fetch(key, imdb_id, kind), "updatedAt": now, "version": CACHE_VERSION}
                _write(target, result)
                return self._public(result)
            except OmdbError as exc:
                # A cooldown hit keeps its original deadline, rather than extending
                # it every time the user opens another title.
                cooldown = _read(self.root / "cooldown.json") or {}
                retry_at = cooldown.get("retryAt", 0)
                if (not isinstance(retry_at, (int, float)) or retry_at <= now
                        or cooldown.get("fingerprint") != hashlib.sha256(key.encode()).hexdigest()):
                    self._cooldown(key, now, exc.code)
                if cached:
                    return self._public(cached, stale=True, code=exc.code)
                raise

    def test_connection(self):
        with self.lock:
            key = self.credentials()
            if not key:
                raise OmdbError("OMDB_NOT_CONFIGURED")
            # Explicit testing always checks the saved credential once, even if
            # the automatic title refresh is currently in cooldown.
            try:
                result = self._fetch(key, "tt0111161", "movie")
            except OmdbError as exc:
                self._cooldown(key, time.time(), exc.code)
                raise
            if result["type"] != "movie":
                raise OmdbError("OMDB_INVALID_RESPONSE")
            _write(self.root / "cooldown.json", {})
            return {"ok": True}
