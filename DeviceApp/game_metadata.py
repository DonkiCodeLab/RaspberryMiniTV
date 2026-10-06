"""Game metadata and artwork stored locally, with server-only API credentials."""
import datetime
from contextlib import nullcontext
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request


class MetadataError(Exception):
    pass


PROVIDERS = {"screenscraper", "igdb"}
_locks = {source: threading.Lock() for source in PROVIDERS}
_token = {}
_last_igdb_request = 0
SECRET_FIELDS = {"devid", "devpassword", "ssid", "sspassword", "client_secret", "access_token", "authorization"}
PLATFORM_ALIASES = {
    "gameboy": ["Game Boy"], "gameboy_color": ["Game Boy Color"],
    "gameboy_advance": ["Game Boy Advance"], "nes": ["Nintendo Entertainment System"],
    "snes": ["Super Nintendo Entertainment System"], "mastersystem": ["Sega Master System"],
    "megadrive": ["Sega Mega Drive/Genesis"], "segacd": ["Sega CD"], "gamegear": ["Sega Game Gear", "Game Gear"],
    "pcengine": ["TurboGrafx-16/PC Engine"], "pcenginecd": ["Turbografx-16/PC Engine CD"],
    "neogeo": ["Neo Geo MVS", "Neo Geo AES"], "neo_geo_cd": ["Neo Geo CD"],
    "ngp": ["Neo Geo Pocket"], "ngpc": ["Neo Geo Pocket Color"],
    "atarilynx": ["Atari Lynx"], "psx": ["PlayStation"], "psp": ["PlayStation Portable"],
    "n64": ["Nintendo 64"], "dreamcast": ["Dreamcast"], "arcade": ["Arcade"],
}
IGDB_FIELDS = ("*,cover.*,screenshots.*,artworks.*,genres.*,themes.*,game_modes.*,"
               "player_perspectives.*,platforms.*,involved_companies.*,involved_companies.company.*,"
               "release_dates.*,alternative_names.*,websites.*,videos.*,age_ratings.*,"
               "franchises.*,collections.*,game_engines.*,language_supports.*")


def clean_query(value):
    value = Path(str(value or "")).stem if re.search(r"\.(gb|gbc|gba|nes|sfc|smc|zip|chd|iso)$", str(value), re.I) else str(value or "")
    return re.sub(r"\s+", " ", re.sub(r"\([^)]*\)|\[[^]]*\]", " ", value).replace("_", " ")).strip()


def title_key(value):
    value = unicodedata.normalize("NFKD", clean_query(value)).casefold()
    return "".join(char for char in value if char.isalnum())


def safe_data(value):
    """Do not persist credentials embedded in ScreenScraper media URLs."""
    if isinstance(value, dict):
        return {key: safe_data(item) for key, item in value.items() if key.lower() not in SECRET_FIELDS}
    if isinstance(value, list):
        return [safe_data(item) for item in value]
    if isinstance(value, str) and value.startswith(("https://", "http://")):
        parsed = urllib.parse.urlsplit(value)
        query = urllib.parse.urlencode([(key, item) for key, item in urllib.parse.parse_qsl(parsed.query)
                                       if key.lower() not in SECRET_FIELDS])
        return urllib.parse.urlunsplit(parsed._replace(query=query))
    return value


def atomic_write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".game-")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def localized(values, language="en"):
    if isinstance(values, dict):
        return str(values.get("text") or values.get("nom") or "")
    if not isinstance(values, list):
        return str(values or "")
    entries = [entry for entry in values if isinstance(entry, dict)]
    for preference in (language, "es", "en", "wor", "eu", "us", "fr", "jp"):
        for entry in entries:
            if preference in (entry.get("langue"), entry.get("region")) and entry.get("text"):
                return str(entry["text"])
    return next((str(entry["text"]) for entry in entries if entry.get("text")), "")


def normalize_screenscraper(raw, language):
    media = []
    for entry in raw.get("medias", []):
        kind = str(entry.get("type") or "").lower()
        category = ("screenshot" if kind in {"ss", "sstitle", "screenshot"} else
                    "cover" if kind.startswith("box-") or kind.startswith("mix") else
                    "artwork" if kind in {"fanart", "wheel", "wheel-hd", "marquee", "screenmarquee", "steamgrid"} else "")
        url = entry.get("url") or entry.get("url2")
        if category and url:
            media.append({**entry, "url": safe_data(url), "kind": category, "label": kind})
    media.sort(key=lambda entry: (entry["kind"] != "cover", entry.get("type", "").lower() != "box-2d"))
    dates = raw.get("dates") or []
    genres = raw.get("genres") or []
    return {
        "id": int(raw.get("id") or raw.get("idjeu") or 0), "source": "screenscraper",
        "name": localized(raw.get("noms"), language) or raw.get("nom") or raw.get("name") or "",
        "description": localized(raw.get("synopsis"), language), "storyline": "",
        "releaseDate": localized(dates, language), "releaseDates": dates,
        "developers": [localized(raw.get("developpeur"))] if raw.get("developpeur") else [],
        "publishers": [localized(raw.get("editeur"))] if raw.get("editeur") else [],
        "genres": list(dict.fromkeys(filter(None, (localized(genre.get("noms") or genre, language) for genre in genres)))),
        "players": localized(raw.get("joueurs")), "rating": localized(raw.get("note")), "ratingScale": 20,
        "ageRatings": raw.get("classifications") or [], "media": media,
        "covers": [entry for entry in media if entry["kind"] == "cover"],
        "screenshots": [entry for entry in media if entry["kind"] == "screenshot"],
        "raw": safe_data(raw),
    }


def normalize_igdb(raw):
    media = []
    for field, kind in (("cover", "cover"), ("screenshots", "screenshot"), ("artworks", "artwork")):
        entries = [raw[field]] if field == "cover" and raw.get(field) else raw.get(field, [])
        for entry in entries:
            if not isinstance(entry, dict) or not entry.get("image_id"):
                continue
            image_id = str(entry["image_id"])
            if not re.fullmatch(r"[\w-]+", image_id):
                continue
            media.append({**entry, "kind": kind, "label": kind,
                          "url": f"https://images.igdb.com/igdb/image/upload/t_original/{image_id}.jpg"})
    companies = raw.get("involved_companies", [])
    released = raw.get("first_release_date")
    return {
        "id": raw["id"], "source": "igdb", "name": raw.get("name", ""),
        "description": raw.get("summary", ""), "storyline": raw.get("storyline", ""),
        "releaseDate": datetime.datetime.fromtimestamp(released, datetime.timezone.utc).date().isoformat() if released else "",
        "releaseDates": raw.get("release_dates", []),
        "developers": [entry["company"]["name"] for entry in companies if entry.get("developer") and isinstance(entry.get("company"), dict) and entry["company"].get("name")],
        "publishers": [entry["company"]["name"] for entry in companies if entry.get("publisher") and isinstance(entry.get("company"), dict) and entry["company"].get("name")],
        "genres": [entry["name"] for entry in raw.get("genres", []) if isinstance(entry, dict) and entry.get("name")],
        "gameModes": [entry["name"] for entry in raw.get("game_modes", []) if isinstance(entry, dict) and entry.get("name")],
        "rating": raw.get("total_rating"), "ratingScale": 100,
        "ageRatings": raw.get("age_ratings", []), "websites": raw.get("websites", []),
        "videos": raw.get("videos", []), "media": media,
        "covers": [entry for entry in media if entry["kind"] == "cover"],
        "screenshots": [entry for entry in media if entry["kind"] == "screenshot"], "raw": raw,
    }


def valid_image_url(url):
    parsed = urllib.parse.urlsplit(url)
    host = parsed.hostname or ""
    return (parsed.scheme == "https" and not parsed.username and not parsed.password
            and parsed.port in (None, 443)
            and (host == "images.igdb.com" or host == "screenscraper.fr" or host.endswith(".screenscraper.fr")))


class ImageRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not valid_image_url(newurl):
            raise MetadataError("Unsupported image redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class GameMetadata:
    def __init__(self, root, covers, config, language="en"):
        self.root = Path(root) / "GameMetadata"
        self.covers = Path(covers)
        self.config = config
        self.language = language

    def providers(self):
        return {"screenscraper": bool(self.config("SCREENSCRAPER_DEV_ID") and self.config("SCREENSCRAPER_DEV_PASSWORD")),
                "igdb": bool(self.config("IGDB_CLIENT_ID") and self.config("IGDB_CLIENT_SECRET"))}

    def ss_credentials(self):
        return {"devid": self.config("SCREENSCRAPER_DEV_ID"), "devpassword": self.config("SCREENSCRAPER_DEV_PASSWORD"),
                "softname": self.config("SCREENSCRAPER_SOFTNAME") or "MiniTV", "output": "json",
                "ssid": self.config("SCREENSCRAPER_USER"), "sspassword": self.config("SCREENSCRAPER_PASSWORD")}

    def request_json(self, source, endpoint, params):
        global _last_igdb_request
        if not self.providers().get(source):
            raise MetadataError(f"{source}: API credentials are not configured")
        with _locks[source]:
            try:
                if source == "screenscraper":
                    url = f"https://api.screenscraper.fr/api2/{endpoint}.php?" + urllib.parse.urlencode({**self.ss_credentials(), **params})
                    req = urllib.request.Request(url, headers={"User-Agent": "MiniTV/1.0"})
                else:
                    client = self.config("IGDB_CLIENT_ID")
                    identity = hashlib.sha256((client + self.config("IGDB_CLIENT_SECRET")).encode()).hexdigest()
                    if _token.get("identity") != identity or _token.get("expires", 0) <= time.time():
                        body = urllib.parse.urlencode({"client_id": client, "client_secret": self.config("IGDB_CLIENT_SECRET"), "grant_type": "client_credentials"}).encode()
                        with urllib.request.urlopen(urllib.request.Request("https://id.twitch.tv/oauth2/token", data=body), timeout=20) as response:
                            auth = json.load(response)
                        _token.update(identity=identity, value=auth["access_token"], expires=time.time() + max(0, int(auth["expires_in"]) - 60))
                    time.sleep(max(0, 0.26 - (time.monotonic() - _last_igdb_request)))
                    _last_igdb_request = time.monotonic()
                    req = urllib.request.Request(f"https://api.igdb.com/v4/{endpoint}", data=params.encode(),
                        headers={"Client-ID": client, "Authorization": "Bearer " + _token["value"], "Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=20) as response:
                    return json.load(response)
            except Exception as exc:
                if source == "igdb" and isinstance(exc, urllib.error.HTTPError) and exc.code == 401:
                    _token.clear()
                # urllib error messages can contain URLs with credentials.
                code = f" (HTTP {exc.code})" if isinstance(exc, urllib.error.HTTPError) else ""
                raise MetadataError(f"{source}: metadata request failed{code}") from None

    def platform_ids(self, platform):
        path = self.root / "igdb-platforms.json"
        try:
            entries = json.loads(path.read_text())
        except (OSError, ValueError):
            entries = self.request_json("igdb", "platforms", "fields id,name,alternative_name; limit 500;")
            atomic_write(path, json.dumps(entries).encode())
        names = {name.casefold() for name in PLATFORM_ALIASES.get(platform["id"], [platform["name"]])}
        return [int(entry["id"]) for entry in entries if entry.get("name", "").casefold() in names or entry.get("alternative_name", "").casefold() in names]

    def search(self, query, platform):
        results, warnings = [], []
        for source, enabled in self.providers().items():
            if not enabled:
                continue
            try:
                if source == "screenscraper":
                    payload = self.request_json(source, "jeuRecherche", {"recherche": clean_query(query), "systemeid": platform["screenScraperSystemId"]})
                    entries = payload.get("response", {}).get("jeux", [])
                    entries = [entries] if isinstance(entries, dict) else entries
                    found = [normalize_screenscraper(raw, self.language) for raw in entries]
                else:
                    ids = self.platform_ids(platform)
                    if not ids:
                        warnings.append("igdb: platform not found")
                        continue
                    query_text = json.dumps(clean_query(query)[:160], ensure_ascii=False)
                    entries = self.request_json(source, "games", f"search {query_text}; fields {IGDB_FIELDS}; where platforms = ({','.join(map(str, ids))}); limit 20;")
                    found = [normalize_igdb(raw) for raw in entries]
                for item in found:
                    if item.get("name") and item.get("id"):
                        results.append({key: value for key, value in item.items() if key != "raw"})
            except (MetadataError, KeyError, TypeError, ValueError):
                warnings.append(f"{source}: search unavailable")
        return {"ok": True, "configured": any(self.providers().values()), "providers": self.providers(), "results": results, "warnings": warnings}

    def details(self, source, game_id, platform):
        if source not in PROVIDERS or int(game_id) <= 0:
            raise MetadataError("Invalid game identifier")
        key = f"{source}-{int(game_id)}-{platform['screenScraperSystemId']}-{self.language}"
        path = self.root / (key + ".json")
        try:
            return json.loads(path.read_text())
        except (OSError, ValueError):
            pass
        if source == "screenscraper":
            payload = self.request_json(source, "jeuInfos", {"gameid": int(game_id), "systemeid": platform["screenScraperSystemId"]})
            raw = payload.get("response", {}).get("jeu")
            if not isinstance(raw, dict) or int((raw.get("systeme") or {}).get("id") or 0) != platform["screenScraperSystemId"]:
                raise MetadataError("Game does not match the selected console")
            item = normalize_screenscraper(raw, self.language)
        else:
            ids = self.platform_ids(platform)
            if not ids:
                raise MetadataError("IGDB platform not found")
            entries = self.request_json(source, "games", f"fields {IGDB_FIELDS}; where id = {int(game_id)} & platforms = ({','.join(map(str, ids))}); limit 1;")
            if not entries:
                raise MetadataError("Game does not match the selected console")
            item = normalize_igdb(entries[0])
        if not item.get("name") or int(item.get("id") or 0) != int(game_id):
            raise MetadataError("Game metadata not found")
        item["fetchedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        atomic_write(path, json.dumps(item, ensure_ascii=False).encode())
        return item

    def download_image(self, url, relative_path):
        if not valid_image_url(url):
            raise MetadataError("Unsupported game image URL")
        # Include the ROM's full path and remote URL so games never share mutable files.
        key = hashlib.sha256((relative_path + "\n" + safe_data(url)).encode()).hexdigest()
        for extension in ("jpg", "png", "webp"):
            if (self.covers / f"{key}.{extension}").is_file():
                return f"/game-covers/{key}.{extension}"
        if relative_path != "preview":
            preview_key = hashlib.sha256(("preview\n" + safe_data(url)).encode()).hexdigest()
            for extension in ("jpg", "png", "webp"):
                preview = self.covers / f"{preview_key}.{extension}"
                if preview.is_file():
                    atomic_write(self.covers / f"{key}.{extension}", preview.read_bytes())
                    return f"/game-covers/{key}.{extension}"
        fetch_url = url
        parsed = urllib.parse.urlsplit(url)
        if parsed.hostname == "api.screenscraper.fr" and parsed.path.endswith("mediaJeu.php"):
            params = dict(urllib.parse.parse_qsl(parsed.query))
            fetch_url = urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode({**params, **self.ss_credentials()})))
        try:
            opener = urllib.request.build_opener(ImageRedirect())
            # ScreenScraper's default account permits only one concurrent request.
            provider_lock = _locks["screenscraper"] if parsed.hostname != "images.igdb.com" else nullcontext()
            with provider_lock:
                with opener.open(urllib.request.Request(fetch_url, headers={"User-Agent": "MiniTV/1.0"}), timeout=20) as response:
                    data = response.read(16 * 1024 * 1024 + 1)
            if len(data) > 16 * 1024 * 1024:
                raise MetadataError("Game image exceeds 16 MiB")
            extension = ("png" if data.startswith(b"\x89PNG\r\n\x1a\n") else "jpg" if data.startswith(b"\xff\xd8\xff") else
                         "webp" if data.startswith(b"RIFF") and data[8:12] == b"WEBP" else "")
            if not extension:
                raise MetadataError("Invalid game image")
            atomic_write(self.covers / f"{key}.{extension}", data)
            return f"/game-covers/{key}.{extension}"
        except (OSError, ValueError):
            raise MetadataError("Game image download failed") from None

    def localize(self, item, relative_path):
        images, failed = [], 0
        seen = set()
        for entry in item.get("media", []):
            if entry["url"] in seen:
                continue
            seen.add(entry["url"])
            try:
                url = self.download_image(entry["url"], relative_path)
                images.append({**entry, "remoteUrl": entry["url"], "url": url})
            except (MetadataError, OSError, ValueError):
                failed += 1
        covers = [entry["url"] for entry in images if entry["kind"] == "cover"]
        screenshots = [entry["url"] for entry in images if entry["kind"] == "screenshot"]
        # Full provider response is retained in SQLite; only local URLs are used by the UI.
        return {"gameMetadata": {**item, "media": images,
                "covers": [entry for entry in images if entry["kind"] == "cover"],
                "screenshots": [entry for entry in images if entry["kind"] == "screenshot"]}, "metadataSource": item["source"],
                "metadataId": item["id"], "metadataStatus": "partial" if failed else "complete",
                "metadataFailedImages": failed, "coverImage": next(iter(covers), ""),
                "imageOptions": [entry["url"] for entry in images], "screenshots": screenshots,
                "name": item["name"], "description": item.get("description", ""), "source": item["source"]}
