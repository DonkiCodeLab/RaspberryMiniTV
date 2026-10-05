"""OpenSubtitles lookup for local movies. No video content leaves the device."""

import json
import math
import os
import re
import struct
import tempfile
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

MAX_SUBTITLE_BYTES = 5 * 1024 * 1024
API_HOSTS = {"api.opensubtitles.com", "vip-api.opensubtitles.com"}
LANGUAGES = {"es", "ca", "en"}


class SubtitleError(Exception):
    def __init__(self, code, status=502):
        super().__init__(code)
        self.code = code
        self.status = status


def movie_hash(path):
    with open(path, "rb") as video:
        size = os.fstat(video.fileno()).st_size
        if size < 131072:
            return ""
        total = size
        for offset in (0, size - 65536):
            video.seek(offset)
            block = video.read(65536)
            if len(block) != 65536:
                raise SubtitleError("SUBTITLE_MOVIE_CHANGED", 409)
            total += sum(value[0] for value in struct.iter_unpack("<Q", block))
    return f"{total & 0xffffffffffffffff:016x}"


def atomic_write(path, content, mode=0o600):
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(dir=os.path.dirname(path), prefix=".subtitle-", suffix=".part", delete=False) as temporary:
            temporary_path = temporary.name
            temporary.write(content)
            os.fchmod(temporary.fileno(), mode)
        os.replace(temporary_path, path)
    finally:
        if temporary_path and os.path.exists(temporary_path):
            os.remove(temporary_path)


def validate_srt(content):
    if not content or len(content) > MAX_SUBTITLE_BYTES:
        raise SubtitleError("SUBTITLE_INVALID_DOWNLOAD")
    try:
        text = content.decode("utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")
    except UnicodeDecodeError:
        raise SubtitleError("SUBTITLE_INVALID_DOWNLOAD") from None
    if "\x00" in text or re.search(r"<(?:!doctype|html|script)\b", text, re.I):
        raise SubtitleError("SUBTITLE_INVALID_DOWNLOAD")
    if not re.search(r"(?m)^\d+\s*\n\d{2,}:\d{2}:\d{2}[,.]\d{3} --> \d{2,}:\d{2}:\d{2}[,.]\d{3}[^\n]*\n\S", text):
        raise SubtitleError("SUBTITLE_INVALID_DOWNLOAD")
    return text.encode("utf-8")


def allowed_url(url, api=False):
    try:
        parsed = urllib.parse.urlsplit(url)
        host = parsed.hostname or ""
        trusted = host in API_HOSTS if api else any(host == domain or host.endswith("." + domain) for domain in ("opensubtitles.com", "osdb.link"))
        return parsed.scheme == "https" and trusted and not parsed.username and not parsed.password and parsed.port in (None, 443)
    except ValueError:
        return False


class ProviderRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, api):
        self.api = api

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not allowed_url(newurl, self.api):
            raise SubtitleError("SUBTITLE_PROVIDER_ERROR")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def number(value):
    try:
        parsed = float(value or 0)
        return parsed if math.isfinite(parsed) else 0
    except (TypeError, ValueError):
        return 0


def flag(value):
    return value is True or str(value).lower() in {"1", "true"}


def tokens(value):
    normalized = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode().lower()
    return set(re.findall(r"[a-z0-9]+", normalized)) - {"mkv", "mp4", "avi", "srt"}


def best_candidate(rows, language, filename, metadata, hash_only=False):
    """Reject other films/languages and partial/multipart subs before ranking."""
    ranked = []
    local_tokens = tokens(filename)
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("attributes"), dict):
            continue
        attrs = row["attributes"]
        files = attrs.get("files")
        feature = attrs.get("feature_details") or {}
        if not isinstance(feature, dict) or attrs.get("language") != language:
            continue
        if str(feature.get("feature_type") or "movie").lower() != "movie":
            continue
        if any(flag(attrs.get(key)) for key in ("foreign_parts_only", "machine_translated", "ai_translated")):
            continue
        if not isinstance(files, list) or len(files) != 1 or not isinstance(files[0], dict):
            continue
        if number(attrs.get("nb_cd")) > 1 or number(files[0].get("cd_number")) > 1 or number(files[0].get("file_id")) <= 0:
            continue
        exact = flag(attrs.get("moviehash_match"))
        if hash_only and not exact:
            continue
        tmdb_id = int(number(metadata.get("tmdbId")))
        remote_id = int(number(feature.get("tmdb_id")))
        if tmdb_id and remote_id and tmdb_id != remote_id:
            continue
        if not exact and not (tmdb_id and tmdb_id == remote_id):
            # Filename-only searches can return unrelated films. Require the
            # complete title and, when present, the release year to agree.
            title = tokens(feature.get("title"))
            year = str(int(number(feature.get("year"))))
            local_years = {token for token in local_tokens if re.fullmatch(r"(?:19|20)\d{2}", token)}
            if not title or not title.issubset(local_tokens) or (local_years and year not in local_years):
                continue
        release_tokens = tokens(attrs.get("release") or files[0].get("file_name"))
        overlap = len(local_tokens & release_tokens) / max(1, len(local_tokens | release_tokens))
        score = (exact, overlap, flag(attrs.get("from_trusted")), number(attrs.get("ratings")), number(attrs.get("votes")), number(attrs.get("download_count")))
        ranked.append((score, attrs))
    return max(ranked, key=lambda candidate: candidate[0])[1] if ranked else None


class OpenSubtitles:
    def __init__(self):
        self.session_lock = threading.Lock()
        self.session = None

    def _request(self, url, credentials=None, token="", body=None):
        api = credentials is not None
        if not allowed_url(url, api):
            raise SubtitleError("SUBTITLE_PROVIDER_ERROR")
        headers = {"User-Agent": "MiniTV v1.0", "Accept": "application/json" if api else "text/plain"}
        if api:
            headers["Api-Key"] = credentials["apiKey"]
        if token:
            headers["Authorization"] = "Bearer " + token
        if body is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, headers=headers, data=json.dumps(body).encode() if body is not None else None)
        try:
            with urllib.request.build_opener(ProviderRedirect(api)).open(req, timeout=20) as response:
                content = response.read(MAX_SUBTITLE_BYTES + 1)
            if len(content) > MAX_SUBTITLE_BYTES:
                raise SubtitleError("SUBTITLE_INVALID_DOWNLOAD")
            if not api:
                return content
            payload = json.loads(content)
            if not isinstance(payload, dict):
                raise ValueError("Invalid response")
            return payload
        except urllib.error.HTTPError as error:
            error.close()
            if error.code == 401 or (error.code == 403 and url.endswith("/login")):
                self.session = None
                raise SubtitleError("SUBTITLE_AUTH_FAILED", 422) from None
            if error.code in (406, 429):
                raise SubtitleError("SUBTITLE_LIMIT_REACHED", 429) from None
            if error.code == 403:
                raise SubtitleError("SUBTITLE_ACCESS_DENIED", 422) from None
            raise SubtitleError("SUBTITLE_PROVIDER_ERROR") from None
        except (OSError, ValueError, UnicodeError):
            raise SubtitleError("SUBTITLE_PROVIDER_ERROR") from None

    def _login(self, credentials):
        with self.session_lock:
            if self.session and self.session[0] == credentials and self.session[1] > time.monotonic():
                return self.session[2:]
            response = self._request("https://api.opensubtitles.com/api/v1/login", credentials, body={
                "username": credentials["username"], "password": credentials["password"],
            })
            host = str(response.get("base_url") or "api.opensubtitles.com").removeprefix("https://").rstrip("/")
            token = response.get("token")
            if host not in API_HOSTS or not isinstance(token, str) or not token:
                raise SubtitleError("SUBTITLE_PROVIDER_ERROR")
            base = "https://" + host + "/api/v1"
            self.session = (dict(credentials), time.monotonic() + 20 * 3600, base, token)
            return base, token

    def obtain(self, path, metadata, language, credentials):
        if not all(credentials.get(key) for key in ("apiKey", "username", "password")):
            raise SubtitleError("SUBTITLE_NOT_CONFIGURED", 503)
        base, token = self._login(credentials)
        file_hash = movie_hash(path)
        filename = os.path.basename(path)
        params = {"languages": language, "type": "movie", "machine_translated": "exclude", "ai_translated": "exclude",
                  "foreign_parts_only": "exclude", "order_by": "download_count", "order_direction": "desc"}

        def search(extra, exact=False):
            query = urllib.parse.urlencode(sorted({**params, **extra}.items()))
            response = self._request(base + "/subtitles?" + query, credentials, token)
            rows = response.get("data")
            if not isinstance(rows, list):
                raise SubtitleError("SUBTITLE_PROVIDER_ERROR")
            return best_candidate(rows, language, filename, metadata, hash_only=exact)

        candidate = search({"moviehash": file_hash, "moviehash_match": "only"}, exact=True) if file_hash else None
        if candidate is None:
            tmdb_id = int(number(metadata.get("tmdbId")))
            identity = {"tmdb_id": tmdb_id} if tmdb_id > 0 else {"query": os.path.splitext(filename)[0]}
            if file_hash:
                identity["moviehash"] = file_hash
            candidate = search(identity)
        if candidate is None:
            raise SubtitleError("SUBTITLE_NOT_FOUND", 404)
        download = self._request(base + "/download", credentials, token, body={
            "file_id": int(number(candidate["files"][0]["file_id"])), "sub_format": "srt",
        })
        link = download.get("link")
        if not isinstance(link, str) or not link:
            raise SubtitleError("SUBTITLE_PROVIDER_ERROR")
        content = validate_srt(self._request(link))
        return content, {"provider": "OpenSubtitles", "language": language,
                         "match": "hash" if flag(candidate.get("moviehash_match")) else "metadata",
                         "release": str(candidate.get("release") or candidate["files"][0].get("file_name") or "")[:300]}


def load_credentials(path):
    try:
        with open(path, encoding="utf-8") as handle:
            stored = json.load(handle)
        if not isinstance(stored, dict):
            stored = {}
    except (OSError, ValueError):
        stored = {}
    fields = {"apiKey": "OPENSUBTITLES_API_KEY", "username": "OPENSUBTITLES_USERNAME", "password": "OPENSUBTITLES_PASSWORD"}
    return {key: str(stored.get(key) or os.environ.get(env, "")) for key, env in fields.items()}


def credentials_status(credentials):
    return {"configured": all(credentials.values()), "hasApiKey": bool(credentials["apiKey"]),
            "hasPassword": bool(credentials["password"]), "username": credentials["username"]}


def save_credentials(path, updates):
    credentials = load_credentials(path)
    for key in credentials:
        value = updates.get(key)
        if value is not None:
            if not isinstance(value, str) or len(value) > 1024 or "\n" in value or "\r" in value:
                raise SubtitleError("SUBTITLE_INVALID_SETTINGS", 400)
            credentials[key] = value if key == "password" else value.strip()
    atomic_write(path, json.dumps(credentials).encode())  # tempfile creates a private 0600 file.
    return credentials_status(credentials)
