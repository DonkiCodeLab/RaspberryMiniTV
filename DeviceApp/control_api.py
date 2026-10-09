from game_platforms import GAME_SYSTEMS, SYSTEMS, EXTENSIONS, resolve_platform
from tmdb_cache import TmdbCache, TmdbError
from torrent_downloads import TorrentDownloads, TorrentError, search_torrents
from video_formats import is_video_file
import movie_subtitles
import system_update
from oscar_catalog import OscarCatalog
from background_stats import BackgroundStats
import catalog_store
import book_metadata
import youtube_search
from user_profiles import ProfileStore, ProfileError
from profile_playback import ProfilePlayback
from game_metadata import GameMetadata, MetadataError, title_key
from epub_cover import extract_epub_cover
from comic_reader import ComicError, comic_pdf, comic_cover
from functools import wraps
import json
import gzip
import io
import os
from pathlib import Path
import re
import shutil
from playback_process import player_is_running

import socket
import subprocess
import threading
import time
import tempfile
import urllib.parse
import urllib.request
import zipfile
import datetime
import hashlib
import html

from werkzeug.exceptions import HTTPException
from flask import Flask, Response, jsonify, request, send_file, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def resolve_repo_dir():
    candidates = [
        os.environ.get("MINITV_REPO_DIR"),
        "/home/donkicodelab/RaspberryMiniTV",
        os.path.join(os.path.expanduser("~"), "RaspberryMiniTV"),
        os.path.dirname(BASE_DIR),
    ]
    for candidate in candidates:
        safe_candidate = str(candidate or "").strip()
        if safe_candidate and os.path.isdir(safe_candidate):
            return safe_candidate
    return os.path.dirname(BASE_DIR)


REPO_DIR = resolve_repo_dir()
MULTIMEDIA_DIR = os.path.join(REPO_DIR, "MultimediaContent")
VIDEOS_DIR = os.path.join(MULTIMEDIA_DIR, "Videos")
MOVIES_DIR = os.path.join(VIDEOS_DIR, "Movies")
TVSHOWS_DIR = os.path.join(VIDEOS_DIR, "TVShows")
GAMES_DIR = os.path.join(MULTIMEDIA_DIR, "Games")
BOOKS_DIR = os.path.join(MULTIMEDIA_DIR, "Books")
PICTURES_DIR = os.path.join(MULTIMEDIA_DIR, "Pictures")
BOOK_COVERS_DIR = os.path.join(MULTIMEDIA_DIR, "BookCovers")
GAME_COVERS_DIR = os.path.join(MULTIMEDIA_DIR, "GameCovers")
WEB_DIST_DIR = os.path.join(REPO_DIR, "WebApp", "dist")
EMULATORJS_DIR = os.path.join(REPO_DIR, "WebApp", "node_modules", "@emulatorjs", "emulatorjs", "data")
EMULATORJS_PACKAGES_DIR = os.path.join(REPO_DIR, "WebApp", "node_modules", "@emulatorjs")
# Legacy path anchors the one-time import; catalog_store uses media_library.sqlite3.
MEDIA_LIBRARY_PATH = os.path.join(MULTIMEDIA_DIR, "media_library.json")
LEGACY_MOVIE_LIBRARY_PATH = os.path.join(MULTIMEDIA_DIR, "movie_library.json")
USER_PROFILES_PATH = os.path.join(MULTIMEDIA_DIR, "user_profiles.sqlite3")
EP_RE = re.compile(r"(S(\d{2})E(\d{2,}))", re.IGNORECASE)
PORT = 5050
QR_PNG = "/tmp/minitv_qr.png"
MPV_SOCKET_PATH = os.path.join(tempfile.gettempdir(), "minitv-mpv.sock")
MPV_DEBUG_LOG_PATH = os.path.join(tempfile.gettempdir(), "minitv-mpv.log")
PLAYBACK_STATE_PATH = os.path.join(tempfile.gettempdir(), "minitv-playback.json")
MENU_COMMAND_PATH = os.path.join(tempfile.gettempdir(), "minitv-menu-command.json")
UPLOAD_DEBUG_LOG_PATH = os.path.join(tempfile.gettempdir(), "minitv-upload.log")
USER_SETTINGS_PATH = os.path.join(BASE_DIR, "user_settings.json")
ALARM_SOUNDS_DIR = os.path.join(BASE_DIR, "alarm_sounds")
ALARM_SOUND_EXTENSIONS = {".mp3"}
GAME_ROM_EXTENSIONS = EXTENSIONS
GAME_COVER_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
BOOK_EXTENSIONS = {".pdf", ".epub", ".cbz", ".cbr"}
BOOK_COVER_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
PICTURE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif", ".heic", ".heif"}
DEFAULT_GAME_COVER_FILENAME = "default-game-cover.svg"
DEFAULT_ALARMS = [
    {"id": 1, "enabled": False, "time": "07:30", "sound": ""},
    {"id": 2, "enabled": False, "time": "08:00", "sound": ""},
    {"id": 3, "enabled": False, "time": "08:30", "sound": ""},
]


def normalize_birthdays(entries):
    normalized = []
    seen_ids = set()
    for index, entry in enumerate(entries if isinstance(entries, list) else []):
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "").strip()[:80]
        event_type = "saint" if entry.get("type") == "saint" else "birthday"
        date = str(entry.get("date") or "").strip()
        match = re.fullmatch(r"(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])", date)
        if not name or not match:
            continue
        try:
            datetime.datetime(2000, int(match.group(1)), int(match.group(2)))
        except ValueError:
            continue
        birth_year = entry.get("birthYear")
        try:
            birth_year = int(birth_year) if birth_year not in (None, "") else None
        except (TypeError, ValueError):
            birth_year = None
        if event_type != "birthday" or birth_year is None or birth_year < 1900 or birth_year > datetime.datetime.now().year:
            birth_year = None
        entry_id = re.sub(r"[^a-zA-Z0-9_-]", "", str(entry.get("id") or ""))[:64]
        if not entry_id or entry_id in seen_ids:
            entry_id = f"event-{int(time.time() * 1000)}-{index}"
        seen_ids.add(entry_id)
        normalized.append({"id": entry_id, "type": event_type, "name": name, "date": date, "birthYear": birth_year})
    return normalized


DEFAULT_SETTINGS = {
    "language": "en",
    "web_password": "1234",
    "alarms": DEFAULT_ALARMS,
    "weather_location": "",
    "weather_location_details": None,
    "birthdays": [],
    "tmdb_api_key": "",
    "tmdb_bearer_token": "",
}
SUPPORTED_LANGUAGES = {"en", "ca", "es"}

app = Flask(__name__)

lock = threading.Lock()
current = {"proc": None, "id": None, "directory": None, "file": None}
qr_proc = {"proc": None}
qr_visible = {"shown": False}
camera_lock = threading.Lock()
# Last directory listing, used to report files without profiles without saving
# scan placeholders or rescanning the disk on every TMDB progress poll.
scanned_media_paths = {}
subtitle_provider = movie_subtitles.OpenSubtitles()
subtitle_download_lock = threading.Lock()
SUBTITLE_SETTINGS_PATH = os.path.join(BASE_DIR, "subtitle_settings.json")
GAME_SETTINGS_PATH = os.path.join(BASE_DIR, "game_settings.json")
GAME_SETTING_KEYS = (
    "IGDB_CLIENT_ID", "IGDB_CLIENT_SECRET", "SCREENSCRAPER_DEV_ID",
    "SCREENSCRAPER_DEV_PASSWORD", "SCREENSCRAPER_SOFTNAME",
    "SCREENSCRAPER_USER", "SCREENSCRAPER_PASSWORD", "YOUTUBE_API_KEY",
)
game_settings_lock = threading.Lock()


def load_game_settings():
    try:
        with open(GAME_SETTINGS_PATH, encoding="utf-8") as handle:
            data = json.load(handle)
        return {key: value for key, value in data.items()
                if key in GAME_SETTING_KEYS and isinstance(value, str)}
    except FileNotFoundError:
        return {}


def game_config_value(key):
    saved = load_game_settings()
    return saved[key] if key in saved else get_config_value(key)


@app.route("/settings/games", methods=["GET", "POST"])
def game_settings():
    try:
        with game_settings_lock:
            if request.method == "POST":
                data = request.get_json(silent=True)
                if (not isinstance(data, dict) or any(
                    key not in GAME_SETTING_KEYS or not isinstance(value, str) or len(value) > 1024
                    for key, value in data.items()
                )):
                    return jsonify({"error": "Invalid game settings"}), 400
                saved = load_game_settings()
                saved.update({key: value.strip() for key, value in data.items()})
                movie_subtitles.atomic_write(GAME_SETTINGS_PATH, json.dumps(saved).encode())
            values = {key: game_config_value(key) for key in GAME_SETTING_KEYS}
            response = jsonify({"ok": True,
                "values": values,
                "present": {key: bool(value) for key, value in values.items()},
                "igdb": bool(values["IGDB_CLIENT_ID"] and values["IGDB_CLIENT_SECRET"]),
                "youtube": bool(values["YOUTUBE_API_KEY"]),
                "screenscraper": bool(values["SCREENSCRAPER_DEV_ID"] and values["SCREENSCRAPER_DEV_PASSWORD"]),
            })
            response.headers["Cache-Control"] = "no-store"
            return response
    except (OSError, ValueError, AttributeError):
        return jsonify({"error": "Cannot read or save game settings"}), 500


def normalize_language_code(language):
    language = str(language or "").strip().lower()
    if language == "cat":
        return "ca"
    return language if language in SUPPORTED_LANGUAGES else DEFAULT_SETTINGS["language"]


def load_settings():
    settings = dict(DEFAULT_SETTINGS)
    try:
        with open(USER_SETTINGS_PATH, "r", encoding="utf-8") as handle:
            loaded = json.load(handle)
        if isinstance(loaded, dict):
            settings.update(
                {
                    key: value
                    for key, value in loaded.items()
                    if key in {"language", "web_password", "weather_location", "tmdb_api_key", "tmdb_bearer_token"} and isinstance(value, str)
                }
            )
            settings["alarms"] = normalize_alarms(loaded.get("alarms"))
            settings["birthdays"] = normalize_birthdays(loaded.get("birthdays"))
            details = loaded.get("weather_location_details")
            settings["weather_location_details"] = details if isinstance(details, dict) else None
    except Exception:
        pass
    settings["language"] = normalize_language_code(settings.get("language"))
    return settings


def current_web_pin():
    return load_settings().get("web_password", DEFAULT_SETTINGS["web_password"])


def current_language():
    return normalize_language_code(load_settings().get("language"))


def resolve_weather_location(location, language=None):
    safe_location = str(location or "").strip()
    if not safe_location:
        return None

    geocoding_query = urllib.parse.urlencode(
        {
            "name": safe_location,
            "count": 1,
            "language": normalize_language_code(language or current_language()),
            "format": "json",
        }
    )
    with urllib.request.urlopen(
        f"https://geocoding-api.open-meteo.com/v1/search?{geocoding_query}",
        timeout=10,
    ) as response:
        results = json.load(response).get("results") or []
    if not results:
        return None

    place = results[0]
    forecast_query = urllib.parse.urlencode(
        {
            "latitude": place["latitude"],
            "longitude": place["longitude"],
            "current": "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
            "timezone": "auto",
        }
    )
    with urllib.request.urlopen(
        f"https://api.open-meteo.com/v1/forecast?{forecast_query}",
        timeout=10,
    ) as response:
        forecast = json.load(response)

    return {
        "query": safe_location,
        "name": place.get("name") or safe_location,
        "postalCode": place.get("postcodes", [None])[0] if place.get("postcodes") else place.get("postcode"),
        "admin1": place.get("admin1") or "",
        "admin2": place.get("admin2") or "",
        "admin3": place.get("admin3") or "",
        "country": place.get("country") or "",
        "countryCode": place.get("country_code") or "",
        "latitude": place.get("latitude"),
        "longitude": place.get("longitude"),
        "elevation": place.get("elevation"),
        "timezone": forecast.get("timezone") or place.get("timezone") or "",
        "current": forecast.get("current") or {},
        "currentUnits": forecast.get("current_units") or {},
    }


def save_settings(settings):
    safe_settings = dict(DEFAULT_SETTINGS)
    if isinstance(settings, dict):
        safe_settings.update(
            {
                key: value
                for key, value in settings.items()
                if key in {"language", "web_password", "weather_location", "tmdb_api_key", "tmdb_bearer_token"} and isinstance(value, str)
            }
        )
        safe_settings["alarms"] = normalize_alarms(settings.get("alarms"))
        safe_settings["birthdays"] = normalize_birthdays(settings.get("birthdays"))
    safe_settings["language"] = normalize_language_code(safe_settings.get("language"))
    details = settings.get("weather_location_details") if isinstance(settings, dict) else None
    safe_settings["weather_location_details"] = details if isinstance(details, dict) else None

    with open(USER_SETTINGS_PATH, "w", encoding="utf-8") as handle:
        json.dump(safe_settings, handle, ensure_ascii=False, indent=2)

    return safe_settings


def normalize_alarm_sound(sound):
    filename = os.path.basename(str(sound or "").strip())
    extension = os.path.splitext(filename)[1].lower()
    if not filename or extension not in ALARM_SOUND_EXTENSIONS:
        return ""
    return filename


def list_alarm_sounds():
    try:
        entries = os.listdir(ALARM_SOUNDS_DIR)
    except OSError:
        return []

    return sorted(
        [
            entry
            for entry in entries
            if os.path.isfile(os.path.join(ALARM_SOUNDS_DIR, entry))
            and os.path.splitext(entry)[1].lower() in ALARM_SOUND_EXTENSIONS
        ],
        key=str.lower,
    )


def default_alarm_sound():
    sounds = list_alarm_sounds()
    return sounds[0] if sounds else ""


def normalize_alarms(value):
    source = value if isinstance(value, list) else []
    fallback_sound = default_alarm_sound()
    alarms = []
    for index in range(3):
        entry = source[index] if index < len(source) and isinstance(source[index], dict) else {}
        time_value = str(entry.get("time") or DEFAULT_ALARMS[index]["time"]).strip()
        if not re.match(r"^([01]\d|2[0-3]):[0-5]\d$", time_value):
            time_value = DEFAULT_ALARMS[index]["time"]
        sound = normalize_alarm_sound(entry.get("sound") or entry.get("soundFile") or entry.get("filename"))
        alarms.append(
            {
                "id": index + 1,
                "enabled": bool(entry.get("enabled")),
                "time": time_value,
                "sound": sound or fallback_sound,
            }
        )
    return alarms


def empty_media_library():
    return {
        "version": 1,
        "series": {},
        "movies": {},
        "games": {},
        "books": {},
        "bookCollections": {},
    }


def media_library_transaction(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        with catalog_store.transaction(MEDIA_LIBRARY_PATH, LEGACY_MOVIE_LIBRARY_PATH):
            return function(*args, **kwargs)
    return wrapped


@app.errorhandler(catalog_store.CatalogError)
def catalog_storage_error(error):
    app.logger.error("Catalog storage error: %s", error)
    return jsonify({"error": str(error), "code": "CATALOG_STORAGE_ERROR"}), 503


def load_media_library():
    return catalog_store.read(MEDIA_LIBRARY_PATH, LEGACY_MOVIE_LIBRARY_PATH)


def save_media_library(library):
    ensure_media_directories()
    return catalog_store.save(MEDIA_LIBRARY_PATH, library)


def load_movie_library():
    return load_media_library().get("movies", {})


@media_library_transaction
def save_movie_library(items):
    library = load_media_library()
    safe_items = {}
    if isinstance(items, dict):
        for relative_path, item in items.items():
            safe_relative_path = str(relative_path or "").strip()
            if not safe_relative_path or not isinstance(item, dict):
                continue
            safe_items[safe_relative_path] = {
                **item,
                "relativePath": safe_relative_path,
                "name": str(item.get("name") or "").strip(),
                "tmdbId": int(item.get("tmdbId") or 0),
                "file": str(item.get("file") or "").strip(),
                "heroImage": str(item.get("heroImage") or "").strip(),
                "heroImageCrop": item.get("heroImageCrop") if isinstance(item.get("heroImageCrop"), dict) else None,
                "imdbUrl": str(item.get("imdbUrl") or "").strip(),
                "rottenTomatoesUrl": str(item.get("rottenTomatoesUrl") or "").strip(),
            }

    library["movies"] = safe_items
    save_media_library(library)
    return safe_items


@media_library_transaction
def upsert_movie_metadata(relative_path, name, tmdb_id, filename=""):
    safe_relative_path = str(relative_path or "").strip()
    if not safe_relative_path:
        return None

    library = load_media_library()
    items = library["movies"]
    item = {
        **items.get(safe_relative_path, {}),
        "relativePath": safe_relative_path,
        "name": str(name or "").strip(),
        "tmdbId": int(tmdb_id or 0),
        "file": str(filename or os.path.basename(safe_relative_path)).strip(),
    }
    items[safe_relative_path] = item
    save_media_library(library)
    queue_tmdb_artwork('movie', item)
    return item


@media_library_transaction
def upsert_series_metadata(relative_path, updates):
    safe_relative_path = str(relative_path or "").strip()
    if not safe_relative_path:
        return None

    library = load_media_library()
    series_items = library.setdefault("series", {})
    current_item = series_items.get(safe_relative_path) if isinstance(series_items.get(safe_relative_path), dict) else {}
    item = {
        **current_item,
        "relativePath": safe_relative_path,
    }

    if "name" in updates:
        item["name"] = str(updates.get("name") or "").strip()
    if "tmdbId" in updates:
        item["tmdbId"] = int(updates.get("tmdbId") or 0)
    if "episodes" in updates:
        item["episodes"] = updates.get("episodes") if isinstance(updates.get("episodes"), list) else []
    if "episodeIds" in updates:
        item["episodeIds"] = updates.get("episodeIds") if isinstance(updates.get("episodeIds"), list) else []
    if "heroImage" in updates:
        item["heroImage"] = str(updates.get("heroImage") or "").strip()
    if "heroImageCrop" in updates:
        item["heroImageCrop"] = updates.get("heroImageCrop") if isinstance(updates.get("heroImageCrop"), dict) else None
    series_items[safe_relative_path] = item
    save_media_library(library)
    queue_tmdb_artwork('tv', item, refresh="episodes" in updates)
    return item


def get_series_directory_videos(target_dir):
    videos = []
    if not os.path.isdir(target_dir):
        return videos

    for entry_name in os.listdir(target_dir):
        target_path = os.path.join(target_dir, entry_name)
        if not os.path.isfile(target_path) or not is_supported_upload_file(entry_name):
            continue

        media_id, season_number, episode_number = parse_video_entry(entry_name)
        if not media_id:
            continue

        relative_path = os.path.relpath(target_path, VIDEOS_DIR).replace("\\", "/")
        videos.append(
            {
                "id": media_id,
                "file": entry_name,
                "relativePath": relative_path,
                "seasonNumber": season_number,
                "episodeNumber": episode_number,
            }
        )

    return sorted(
        videos,
        key=lambda video: (video["seasonNumber"] or 0, video["episodeNumber"] or 0, video["file"]),
    )


@media_library_transaction
def refresh_series_metadata_from_disk(relative_path):
    safe_relative_path = str(relative_path or "").strip()
    series_path = resolve_relative_video_path(safe_relative_path, TVSHOWS_DIR)
    if not safe_relative_path or not series_path:
        return None

    library = load_media_library()
    series_items = library.setdefault("series", {})
    current_item = series_items.get(safe_relative_path) if isinstance(series_items.get(safe_relative_path), dict) else {}
    videos = get_series_directory_videos(series_path) if os.path.isdir(series_path) else []
    series_items[safe_relative_path] = {
        **current_item,
        "relativePath": safe_relative_path,
        "episodes": videos,
        "episodeIds": [video["id"] for video in videos],
    }
    save_media_library(library)
    return series_items[safe_relative_path]


def remove_movie_metadata(relative_path):
    return remove_catalog_metadata("movies", "movie", relative_path)


def remove_series_metadata(relative_path):
    return remove_catalog_metadata("series", "tv", relative_path)


@media_library_transaction
def remove_catalog_metadata(collection, kind, relative_path):
    safe_path = str(relative_path or "").strip().rstrip("/")
    if not safe_path:
        return
    library = load_media_library()
    items = library.setdefault(collection, {})
    paths = [path for path in items if path == safe_path or path.startswith(safe_path + "/")]
    removed = [(kind, items.pop(path)) for path in paths]
    if removed:
        # Retain metadata on a cleanup failure so a repeated DELETE can retry safely.
        tmdb_artwork.remove_unused(removed, library)
        save_media_library(library)


def normalize_game_platform(filename_or_extension):
    return resolve_platform(filename_or_extension)


def is_game_rom_file(filename):
    return os.path.splitext(filename)[1].lower() in EXTENSIONS


def game_relative_path(filename):
    safe_filename = os.path.basename(str(filename or "").strip())
    return f"Games/{safe_filename}" if safe_filename else ""


def resolve_game_path(relative_path):
    normalized_path = os.path.normpath(str(relative_path or "").strip().strip("/\\"))
    if not normalized_path or normalized_path.startswith("..") or os.path.isabs(normalized_path):
        return None

    if normalized_path == "Games":
        return None
    if normalized_path.startswith(f"Games{os.sep}"):
        normalized_path = normalized_path.split(os.sep, 1)[1]
    elif normalized_path.startswith("Games/"):
        normalized_path = normalized_path.split("/", 1)[1]

    target_path = os.path.abspath(os.path.join(GAMES_DIR, normalized_path))
    games_root_abs = os.path.abspath(GAMES_DIR)
    if target_path == games_root_abs or os.path.commonpath([target_path, games_root_abs]) != games_root_abs:
        return None

    return target_path


def game_cover_url(filename):
    safe_filename = os.path.basename(str(filename or "").strip())
    if not safe_filename:
        return f"/game-covers/{DEFAULT_GAME_COVER_FILENAME}"
    return f"/game-covers/{urllib.parse.quote(safe_filename)}"


def ensure_default_game_cover():
    os.makedirs(GAME_COVERS_DIR, exist_ok=True)
    target_path = os.path.join(GAME_COVERS_DIR, DEFAULT_GAME_COVER_FILENAME)
    if os.path.exists(target_path):
        return
    with open(target_path, "w", encoding="utf-8") as handle:
        handle.write(
            """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 420">
<rect width="320" height="420" rx="18" fill="#202832"/>
<rect x="28" y="28" width="264" height="364" rx="14" fill="#2e3a46" stroke="#ffd429" stroke-width="8"/>
<rect x="62" y="74" width="196" height="146" rx="8" fill="#111820"/>
<path d="M96 274h128M160 238v72" stroke="#ffd429" stroke-width="20" stroke-linecap="round"/>
<circle cx="222" cy="306" r="20" fill="#f05a4f"/>
<circle cx="266" cy="278" r="20" fill="#4fb5f0"/>
<text x="160" y="370" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff">GAME</text>
</svg>
"""
        )


def is_game_cover_file(filename):
    return os.path.splitext(str(filename or "").strip())[1].lower() in GAME_COVER_EXTENSIONS


def save_uploaded_game_image(uploaded_image, relative_path, suffix="cover"):
    if not uploaded_image or not uploaded_image.filename or not is_game_cover_file(uploaded_image.filename):
        return ""

    ensure_media_directories()
    image_extension = os.path.splitext(uploaded_image.filename)[1].lower()
    if image_extension == ".jpeg":
        image_extension = ".jpg"
    image_slug = slugify(os.path.splitext(os.path.basename(relative_path))[0], "game") + "-" + hashlib.sha256(relative_path.encode()).hexdigest()[:12]
    safe_suffix = slugify(suffix, "image")
    target_filename = f"{image_slug}-{safe_suffix}{image_extension}"
    target_path = os.path.join(GAME_COVERS_DIR, target_filename)
    uploaded_image.save(target_path)
    return game_cover_url(target_filename)


def save_uploaded_game_cover(uploaded_cover, relative_path):
    if not uploaded_cover or not uploaded_cover.filename or not is_game_cover_file(uploaded_cover.filename):
        return ""

    return save_uploaded_game_image(uploaded_cover, relative_path, "cover")


def unique_ordered_urls(urls):
    safe_urls = []
    seen = set()
    for url in urls if isinstance(urls, list) else []:
        safe_url = str(url or "").strip()
        if not safe_url or safe_url in seen:
            continue
        seen.add(safe_url)
        safe_urls.append(safe_url)
    return safe_urls


def remove_local_game_image_url(image_url):
    safe_image_url = str(image_url or "").strip()
    cover_prefix = "/game-covers/"
    if not safe_image_url.startswith(cover_prefix):
        return

    cover_filename = urllib.parse.unquote(safe_image_url[len(cover_prefix) :])
    if not cover_filename or cover_filename == DEFAULT_GAME_COVER_FILENAME:
        return

    cover_path = os.path.abspath(os.path.join(GAME_COVERS_DIR, os.path.basename(cover_filename)))
    covers_root_abs = os.path.abspath(GAME_COVERS_DIR)
    try:
        if os.path.commonpath([cover_path, covers_root_abs]) != covers_root_abs:
            return
    except ValueError:
        return

    if os.path.isfile(cover_path):
        try:
            os.remove(cover_path)
        except OSError:
            pass


@media_library_transaction
def upsert_game_metadata(relative_path, updates):
    safe_relative_path = str(relative_path or "").strip()
    if not safe_relative_path:
        return None

    library = load_media_library()
    game_items = library.setdefault("games", {})
    current_item = game_items.get(safe_relative_path) if isinstance(game_items.get(safe_relative_path), dict) else {}
    filename = os.path.basename(safe_relative_path)
    platform = resolve_platform(filename, updates.get("platform") or current_item.get("platform")) or {}
    item = {
        **current_item,
        "relativePath": safe_relative_path,
        "file": filename,
        "platform": platform.get("id", ""),
        "platformName": platform.get("name", ""),
    }
    if "name" in updates:
        item["name"] = str(updates.get("name") or "").strip() or os.path.splitext(filename)[0]
    if "description" in updates:
        item["description"] = str(updates.get("description") or "").strip()
    if "screenScraperId" in updates:
        try:
            item["screenScraperId"] = int(updates.get("screenScraperId") or 0)
        except Exception:
            item["screenScraperId"] = 0
    if "coverImage" in updates:
        item["coverImage"] = str(updates.get("coverImage") or "").strip()
    if "imageOptions" in updates:
        item["imageOptions"] = unique_ordered_urls(updates.get("imageOptions"))
    if "source" in updates:
        item["source"] = str(updates.get("source") or "").strip()
    for key in ("gameMetadata", "metadataSource", "metadataId", "metadataStatus", "metadataFailedImages", "metadataWarnings", "screenshots"):
        if key in updates:
            item[key] = updates[key]
    if "imageOptions" in updates and item.get("gameMetadata"):
        # Keep normalized media references consistent after a user removes an image.
        item["gameMetadata"] = dict(item["gameMetadata"])
        for key in ("media", "covers", "screenshots"):
            item["gameMetadata"][key] = [entry for entry in item["gameMetadata"].get(key, [])
                                         if entry.get("url") in item["imageOptions"]]

    game_items[safe_relative_path] = item
    save_media_library(library)
    return item


@media_library_transaction
def remove_game_metadata(relative_path):
    safe_relative_path = str(relative_path or "").strip()
    if not safe_relative_path:
        return None

    library = load_media_library()
    game_items = library.setdefault("games", {})
    item = game_items.get(safe_relative_path) if isinstance(game_items.get(safe_relative_path), dict) else None
    if safe_relative_path in game_items:
        del game_items[safe_relative_path]
        save_media_library(library)
    return item


@media_library_transaction
def upsert_media_profile(collection, key, updates):
    safe_collection = "movies" if collection == "movies" else "series"
    safe_key = str(key or "").strip()
    if not safe_key:
        return None

    library = load_media_library()
    collection_items = library.setdefault(safe_collection, {})
    current_item = collection_items.get(safe_key) if isinstance(collection_items.get(safe_key), dict) else {}
    item = dict(current_item)
    item["relativePath"] = safe_key
    if "name" in updates:
        item["name"] = str(updates.get("name") or "").strip()
    if "tmdbId" in updates:
        item["tmdbId"] = int(updates.get("tmdbId") or 0)
    if "file" in updates:
        item["file"] = str(updates.get("file") or "").strip()
    if "heroImage" in updates:
        item["heroImage"] = str(updates.get("heroImage") or "").strip()
    if "heroImageCrop" in updates:
        item["heroImageCrop"] = updates.get("heroImageCrop") if isinstance(updates.get("heroImageCrop"), dict) else None
    if "imdbUrl" in updates:
        item["imdbUrl"] = str(updates.get("imdbUrl") or "").strip()
    if "rottenTomatoesUrl" in updates:
        item["rottenTomatoesUrl"] = str(updates.get("rottenTomatoesUrl") or "").strip()

    collection_items[safe_key] = item
    save_media_library(library)
    queue_tmdb_artwork(("movie" if safe_collection == "movies" else "tv"), item)
    return item


def sync_scanned_media_library(tvshow_directories, movie_directories, movie_root_files):
    global scanned_media_paths
    library = load_media_library()
    series_items = library.setdefault("series", {})
    movie_items = library.setdefault("movies", {})
    game_items = library.setdefault("games", {})

    for directory in tvshow_directories:
        relative_path = directory.get("relativePath")
        if not relative_path:
            continue
        current_item = series_items.get(relative_path) if isinstance(series_items.get(relative_path), dict) else {}
        series_items[relative_path] = {
            **current_item,
            "relativePath": relative_path,
            "name": current_item.get("name") or directory.get("name") or "",
            "tmdbId": int(current_item.get("tmdbId") or directory.get("tmdbId") or 0),
            "episodes": directory.get("videos") if isinstance(directory.get("videos"), list) else [],
            "episodeIds": directory.get("episodeIds") if isinstance(directory.get("episodeIds"), list) else [],
        }

    movie_entries = list(movie_root_files)
    for directory in movie_directories:
        for video in directory.get("videos") if isinstance(directory.get("videos"), list) else []:
            movie_entries.append(video)

    for movie in movie_entries:
        relative_path = movie.get("relativePath")
        if not relative_path:
            continue
        current_item = movie_items.get(relative_path) if isinstance(movie_items.get(relative_path), dict) else {}
        movie_items[relative_path] = {
            **current_item,
            "relativePath": relative_path,
            "name": current_item.get("name") or movie.get("name") or os.path.splitext(movie.get("file") or "")[0],
            "tmdbId": int(current_item.get("tmdbId") or movie.get("tmdbId") or 0),
            "file": current_item.get("file") or movie.get("file") or os.path.basename(relative_path),
        }

    if os.path.isdir(GAMES_DIR):
        for entry_name in sorted(os.listdir(GAMES_DIR)):
            if not is_game_rom_file(entry_name):
                continue
            full_entry = os.path.join(GAMES_DIR, entry_name)
            if not os.path.isfile(full_entry):
                continue
            relative_path = game_relative_path(entry_name)
            current_item = game_items.get(relative_path) if isinstance(game_items.get(relative_path), dict) else {}
            platform = normalize_game_platform(entry_name) or {}
            game_items[relative_path] = {
                **current_item,
                "relativePath": relative_path,
                "file": entry_name,
                "name": current_item.get("name") or os.path.splitext(entry_name)[0],
                "description": current_item.get("description") or "",
                "platform": current_item.get("platform") or platform.get("id", ""),
                "platformName": current_item.get("platformName") or platform.get("name", ""),
                "coverImage": current_item.get("coverImage") or game_cover_url(DEFAULT_GAME_COVER_FILENAME),
                "imageOptions": unique_ordered_urls(
                    current_item.get("imageOptions")
                    if isinstance(current_item.get("imageOptions"), list)
                    else [current_item.get("coverImage")]
                ),
                "source": current_item.get("source") or "scan",
            }

    # Directory listings are read-only. A scan must never replace saved profiles.
    scanned_media_paths = {
        "catalog": MEDIA_LIBRARY_PATH,
        "series": tuple(directory["relativePath"] for directory in tvshow_directories if directory.get("relativePath")),
        "movies": tuple(movie["relativePath"] for movie in movie_entries if movie.get("relativePath")),
    }
    return library


def _calculate_storage_stats(multimedia_bytes=None):
    ensure_media_directories()
    target_path = VIDEOS_DIR if os.path.exists(VIDEOS_DIR) else BASE_DIR
    usage = shutil.disk_usage(target_path)
    if multimedia_bytes is None:
        multimedia_bytes = get_directory_size(MULTIMEDIA_DIR)
    total_gb = round(usage.total / (1024 ** 3), 1)
    used_gb = round((usage.total - usage.free) / (1024 ** 3), 1)
    percent = round(((usage.total - usage.free) / usage.total) * 100, 1) if usage.total else 0.0
    multimedia_percent = round((multimedia_bytes / usage.total) * 100, 1) if usage.total else 0.0

    return {
        "path": target_path,
        "totalGb": total_gb,
        "usedGb": used_gb,
        "freeGb": round(usage.free / (1024 ** 3), 1),
        "percentUsed": percent,
        "multimediaUsedGb": round(multimedia_bytes / (1024 ** 3), 1),
        "multimediaPercentUsed": multimedia_percent,
    }


library_stats = BackgroundStats(
    os.path.join(MULTIMEDIA_DIR, "library_stats.json"),
    lambda: {"storage": _calculate_storage_stats(), "libraryCounts": _calculate_library_counts()},
)


def get_storage_stats():
    snapshot = library_stats.read()
    return {**(snapshot["storage"] if snapshot else _calculate_storage_stats(0)), "calculating": snapshot is None}


def get_library_counts():
    snapshot = library_stats.read()
    return {**(snapshot["libraryCounts"] if snapshot else {}), "calculating": snapshot is None}


def web_dist_available():
    return os.path.isdir(WEB_DIST_DIR) and os.path.isfile(os.path.join(WEB_DIST_DIR, "index.html"))


def send_web_index():
    response = send_from_directory(WEB_DIST_DIR, "index.html", max_age=0)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response


def is_public_frontend_request():
    if request.method != "GET":
        return False
    if not web_dist_available():
        return False

    path = request.path or "/"
    if path in {"/", "/index.html"}:
        return True

    candidate = os.path.normpath(path.lstrip("/"))
    if candidate.startswith(".."):
        return False

    return os.path.isfile(os.path.join(WEB_DIST_DIR, candidate))


def is_authorized_request():
    submitted_pin = request.headers.get("X-Web-Pin", "").strip()
    if request.path in {"/media/stream", "/books/content", "/books/cover", "/pictures/content", "/games/browser", "/games/content", "/games/metadata/image"} and not submitted_pin:
        submitted_pin = str(request.args.get("pin") or "").strip()
    if (request.path.startswith(("/tmdb/images/", "/tmdb/import/images/", "/oscars/images/")) or
            re.fullmatch(r"/awards/(palme|goya|oscars)/images/[^/]+", request.path)) and not submitted_pin:
        submitted_pin = str(request.args.get("pin") or "").strip()
    return submitted_pin == current_web_pin()


@app.before_request
def time_local_library_request():
    if request.path == "/videos" or request.path.startswith(("/tmdb/json/", "/tmdb/library")):
        request.environ["minitv.local_started"] = time.perf_counter()
        print(f"[Biblioteca local] Inicio {request.path}", flush=True)


@app.after_request
def log_local_library_request(response):
    started = request.environ.get("minitv.local_started")
    if started is not None:
        elapsed = (time.perf_counter() - started) * 1000
        response.headers["Server-Timing"] = f"local;dur={elapsed:.1f}"
        print(f"[Biblioteca local] Fin {request.path}: {response.status_code}, {elapsed:.1f} ms", flush=True)
    return response


@app.after_request
def compress_video_catalog(response):
    if (request.path == "/videos" and request.method == "GET" and response.status_code == 200
            and response.mimetype == "application/json" and not response.is_streamed
            and not response.headers.get("Content-Encoding")):
        response.vary.add("Accept-Encoding")
        if request.accept_encodings["gzip"] > 0:
            content = response.get_data()
            if len(content) >= 1024:
                compressed = gzip.compress(content, compresslevel=5)
                if len(compressed) < len(content):
                    response.set_data(compressed)
                    response.headers["Content-Encoding"] = "gzip"
    return response


@app.before_request
def require_web_pin():
    if request.path in {"/movies/upload", "/movies/upload/raw", "/series/upload"}:
        log_upload_event(
            f"request start path={request.path} method={request.method} contentLength={request.content_length} remote={request.remote_addr}"
        )
    if (
        request.path in {"/web/auth", "/ip", "/favicon.ico"}
        or request.path.startswith("/alarm-sounds")
        or request.path.startswith("/emulatorjs/")
        or request.path.startswith("/game-covers")
        or request.path.startswith("/book-covers")
        or is_public_frontend_request()
    ):
        return None
    if is_authorized_request():
        return None
    return jsonify({"error": "Unauthorized"}), 401


@app.route("/favicon.ico", methods=["GET"])
def favicon():
    return ("", 204)


@app.errorhandler(ProfileError)
def profile_error(error):
    return jsonify({"error": str(error)}), error.status


@app.route("/users", methods=["GET", "POST"])
def users_route():
    store = ProfileStore(USER_PROFILES_PATH)
    payload = ({"users": store.users()} if request.method == "GET" else
               {"user": store.save_user(request.get_json(silent=True))})
    response = jsonify({"ok": True, **payload})
    response.headers["Cache-Control"] = "no-store"
    return response, 201 if request.method == "POST" else 200


@app.route("/users/<user_id>", methods=["PATCH", "DELETE"])
def user_route(user_id):
    store = ProfileStore(USER_PROFILES_PATH)
    if request.method == "DELETE":
        store.delete_user(user_id)
        return jsonify({"ok": True})
    return jsonify({"ok": True, "user": store.save_user(request.get_json(silent=True), user_id)})


@app.route("/users/<user_id>/state", methods=["GET", "PATCH"])
def user_state_route(user_id):
    store = ProfileStore(USER_PROFILES_PATH)
    payload = store.state(user_id) if request.method == "GET" else store.patch(user_id, request.get_json(silent=True))
    response = jsonify(payload)
    response.headers["Cache-Control"] = "no-store"
    return response


def playback_profile(data, relative_path, kind="video"):
    """Bind a command to the user who launched it, regardless of later switches."""
    user_id = str(data.get("userId") or "default")
    ProfileStore(USER_PROFILES_PATH).state(user_id)
    key = json.dumps([kind, relative_path], separators=(",", ":"), ensure_ascii=False)
    mark_key = data.get("markKey")
    if mark_key is not None and (not isinstance(mark_key, str) or len(mark_key) > 2048):
        raise ProfileError("Contenido no válido.")
    episode = data.get("episodeNumber")
    if episode is not None and (not isinstance(episode, int) or not 0 <= episode <= 99999):
        raise ProfileError("Episodio no válido.")
    return {"userId": user_id, "key": key, "markKey": mark_key, "episodeNumber": episode}


@app.route("/system/update", methods=["GET", "POST"])
def system_update_route():
    try:
        payload = system_update.start_update() if request.method == "POST" else system_update.update_status()
        response = jsonify(payload)
        response.headers["Cache-Control"] = "no-store"
        return response, 202 if request.method == "POST" else 200
    except (OSError, subprocess.SubprocessError, RuntimeError):
        return jsonify({"error": "No se pudo acceder al servicio de actualización. Revisa su instalación en la Raspberry."}), 503


def get_local_ip():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        sock.close()


def is_supported_upload_file(filename):
    return is_video_file(filename)


def is_book_file(filename):
    return os.path.splitext(str(filename or ""))[1].lower() in BOOK_EXTENSIONS


def ensure_media_directories():
    os.makedirs(MOVIES_DIR, exist_ok=True)
    os.makedirs(TVSHOWS_DIR, exist_ok=True)
    os.makedirs(GAMES_DIR, exist_ok=True)
    os.makedirs(BOOKS_DIR, exist_ok=True)
    os.makedirs(PICTURES_DIR, exist_ok=True)
    os.makedirs(GAME_COVERS_DIR, exist_ok=True)
    ensure_default_game_cover()


def count_direct_files(path):
    if not os.path.isdir(path):
        return 0
    return len(
        [
            entry_name
            for entry_name in os.listdir(path)
            if os.path.isfile(os.path.join(path, entry_name))
        ]
    )


def count_direct_directories(path):
    if not os.path.isdir(path):
        return 0
    return len(
        [
            entry_name
            for entry_name in os.listdir(path)
            if os.path.isdir(os.path.join(path, entry_name))
        ]
    )


def get_directory_size(path):
    if not os.path.exists(path):
        return 0
    if os.path.isfile(path):
        try:
            return os.path.getsize(path)
        except OSError:
            return 0

    total = 0
    for root, _dirs, files in os.walk(path):
        for filename in files:
            full_path = os.path.join(root, filename)
            try:
                total += os.path.getsize(full_path)
            except OSError:
                pass
    return total


def _calculate_library_counts():
    ensure_media_directories()
    usage = shutil.disk_usage(VIDEOS_DIR if os.path.exists(VIDEOS_DIR) else BASE_DIR)
    multimedia_bytes = get_directory_size(MULTIMEDIA_DIR)
    multimedia_capacity_bytes = (usage.free or 0) + multimedia_bytes
    series_bytes = get_directory_size(TVSHOWS_DIR)
    movies_bytes = get_directory_size(MOVIES_DIR)
    games_bytes = get_directory_size(GAMES_DIR)
    books_bytes = get_directory_size(BOOKS_DIR)
    pictures_bytes = get_directory_size(PICTURES_DIR)

    def usage_item(count, used_bytes):
        return {
            "count": count,
            "usedGb": round(used_bytes / (1024 ** 3), 1),
            "percentUsed": round((used_bytes / multimedia_capacity_bytes) * 100, 1) if multimedia_capacity_bytes else 0.0,
        }

    return {
        "multimediaCapacityGb": round(multimedia_capacity_bytes / (1024 ** 3), 1),
        "series": usage_item(count_direct_directories(TVSHOWS_DIR), series_bytes),
        "movies": usage_item(count_direct_files(MOVIES_DIR), movies_bytes),
        "games": usage_item(
            len(
                [
                    entry_name
                    for entry_name in os.listdir(GAMES_DIR)
                    if os.path.isfile(os.path.join(GAMES_DIR, entry_name)) and is_game_rom_file(entry_name)
                ]
            )
            if os.path.isdir(GAMES_DIR)
            else 0,
            games_bytes,
        ),
        "books": usage_item(len(list_book_entries()), books_bytes),
        "pictures": usage_item(len(list_picture_entries()), pictures_bytes),
    }


def slugify(value, fallback="media"):
    slug = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")
    return slug or fallback


def join_video_relative_path(*parts):
    return "/".join(str(part).strip("/\\") for part in parts if str(part or "").strip("/\\"))


def unique_media_filename(target_dir, desired_filename):
    base, extension = os.path.splitext(desired_filename)
    safe_base = slugify(base, "movie")
    safe_extension = extension.lower() if extension else ".mp4"
    candidate = f"{safe_base}{safe_extension}"
    index = 2

    while os.path.exists(os.path.join(target_dir, candidate)):
        candidate = f"{safe_base}-{index}{safe_extension}"
        index += 1

    return candidate


def resolve_book_path(relative_path):
    normalized = str(relative_path or "").replace("\\", "/").strip("/")
    if normalized == "Books":
        return BOOKS_DIR
    if normalized.startswith("Books/"):
        normalized = normalized[len("Books/"):]
    candidate = os.path.abspath(os.path.join(BOOKS_DIR, normalized))
    books_root = os.path.abspath(BOOKS_DIR)
    if candidate != books_root and not candidate.startswith(books_root + os.sep):
        return None
    return candidate


def list_book_entries():
    ensure_media_directories()
    library = load_media_library()
    book_profiles = library.get("books") if isinstance(library.get("books"), dict) else {}
    items = []
    for root, _dirs, files in os.walk(BOOKS_DIR):
        for filename in sorted(files, key=str.lower):
            if not is_book_file(filename):
                continue
            full_path = os.path.join(root, filename)
            relative = os.path.relpath(full_path, BOOKS_DIR).replace("\\", "/")
            collection = os.path.dirname(relative).replace("\\", "/")
            relative_path = f"Books/{relative}"
            metadata = book_profiles.get(relative_path) if isinstance(book_profiles.get(relative_path), dict) else {}
            items.append({
                **book_metadata.normalize_profile(metadata),
                "isGraphicNovel": book_metadata.is_graphic_novel(metadata, filename),
                "name": str(metadata.get("title") or os.path.splitext(filename)[0]).strip(),
                "file": filename,
                "format": os.path.splitext(filename)[1].lower().lstrip("."),
                "collection": "" if collection == "." else collection,
                "relativePath": relative_path,
                "sizeBytes": os.path.getsize(full_path),
                "author": str(metadata.get("author") or "").strip(),
                "year": str(metadata.get("year") or "").strip(),
                "isbn": str(metadata.get("isbn") or "").strip(),
                "description": str(metadata.get("description") or "").strip(),
                "coverUrl": str(metadata.get("coverUrl") or "").strip(),
                "openLibraryKey": str(metadata.get("openLibraryKey") or "").strip(),
            })
    return items


def extract_book_cover(book_path):
    if os.path.splitext(book_path)[1].lower() == ".epub":
        return extract_epub_cover(book_path, BOOK_COVERS_DIR)
    if os.path.splitext(book_path)[1].lower() in {".cbr", ".cbz"}:
        return comic_cover(book_path, os.path.join(BOOK_COVERS_DIR, "comics"))
    os.makedirs(BOOK_COVERS_DIR, exist_ok=True)
    stat = os.stat(book_path)
    cache_key = f"{os.path.relpath(book_path, BOOKS_DIR)}-{stat.st_mtime_ns}-{stat.st_size}"
    cache_name = re.sub(r"[^a-zA-Z0-9_.-]+", "-", cache_key).strip("-") + ".jpg"
    cache_path = os.path.join(BOOK_COVERS_DIR, cache_name)
    if os.path.isfile(cache_path):
        return cache_path

    extension = os.path.splitext(book_path)[1].lower()
    if extension == ".pdf":
        output_root = os.path.join(BOOK_COVERS_DIR, cache_name[:-4])
        converter = shutil.which("pdftoppm")
        if converter:
            try:
                subprocess.run(
                    [converter, "-f", "1", "-singlefile", "-jpeg", "-scale-to", "720", book_path, output_root],
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=30,
                )
                generated = output_root + ".jpg"
                if os.path.isfile(generated):
                    return generated
            except (OSError, subprocess.SubprocessError):
                pass

        # Raspberry Pi OS normally includes MuPDF's `mutool` even when
        # poppler-utils is absent. It can still rasterize page one, so PDFs
        # always get their real first-page artwork instead of a generic cover.
        mutool = shutil.which("mutool")
        if mutool:
            generated = output_root + ".png"
            try:
                subprocess.run(
                    [mutool, "draw", "-q", "-F", "png", "-o", generated, "-w", "720", book_path, "1"],
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=30,
                )
                if os.path.isfile(generated):
                    return generated
            except (OSError, subprocess.SubprocessError):
                try:
                    os.remove(generated)
                except OSError:
                    pass

    if extension in {".cbz", ".epub"}:
        try:
            with zipfile.ZipFile(book_path) as archive:
                images = [
                    name for name in archive.namelist()
                    if not name.endswith("/") and os.path.splitext(name)[1].lower() in {".jpg", ".jpeg", ".png", ".webp"}
                ]
                images.sort(key=lambda name: ("cover" not in name.lower(), name.lower()))
                if images:
                    data = archive.read(images[0])
                    image_extension = os.path.splitext(images[0])[1].lower()
                    extracted_path = os.path.join(BOOK_COVERS_DIR, cache_name[:-4] + image_extension)
                    with open(extracted_path, "wb") as handle:
                        handle.write(data)
                    return extracted_path
        except (OSError, zipfile.BadZipFile, KeyError):
            pass
    return None


def list_game_entries():
    ensure_media_directories()
    library = load_media_library()
    game_items = library.get("games") if isinstance(library.get("games"), dict) else {}
    items = []
    if not os.path.isdir(GAMES_DIR):
        return items

    for entry_name in sorted(os.listdir(GAMES_DIR), key=str.lower):
        full_entry = os.path.join(GAMES_DIR, entry_name)
        if not os.path.isfile(full_entry) or not is_game_rom_file(entry_name):
            continue
        relative_path = game_relative_path(entry_name)
        metadata = game_items.get(relative_path) if isinstance(game_items.get(relative_path), dict) else {}
        platform = normalize_game_platform(entry_name) or {}
        cover_image = str(metadata.get("coverImage") or "").strip() or game_cover_url(DEFAULT_GAME_COVER_FILENAME)
        image_options = unique_ordered_urls(
            metadata.get("imageOptions") if isinstance(metadata.get("imageOptions"), list) else [cover_image]
        )
        if cover_image not in image_options:
            image_options.insert(0, cover_image)
        items.append(
            {
                "name": str(metadata.get("name") or os.path.splitext(entry_name)[0]).strip(),
                "file": entry_name,
                "relativePath": relative_path,
                "platform": str(metadata.get("platform") or platform.get("id", "")).strip(),
                "platformName": str(metadata.get("platformName") or platform.get("name", "")).strip(),
                "description": str(metadata.get("description") or "").strip(),
                "coverImage": cover_image,
                "imageOptions": image_options,
                "screenshots": metadata.get("screenshots", []),
                "metadataSource": metadata.get("metadataSource", ""),
                "metadataId": metadata.get("metadataId", 0),
                "metadataStatus": metadata.get("metadataStatus", ""),
                "metadataFailedImages": metadata.get("metadataFailedImages", 0),
                "gameMetadata": {key: value for key, value in (metadata.get("gameMetadata") or {}).items()
                                 if key not in {"raw", "media", "covers", "screenshots"}},
                "sizeBytes": os.path.getsize(full_entry),
            }
        )
    return items


def read_env_file_value(key):
    env_path = os.path.join(REPO_DIR, ".env")
    try:
        with open(env_path, "r", encoding="utf-8") as handle:
            for line in handle:
                stripped = line.strip()
                if not stripped or stripped.startswith("#") or "=" not in stripped:
                    continue
                name, value = stripped.split("=", 1)
                if name.strip() == key:
                    return value.strip().strip('"').strip("'")
    except Exception:
        pass
    return ""


def get_config_value(key, default=""):
    return os.environ.get(key, "").strip() or read_env_file_value(key) or default


def game_metadata_service():
    return GameMetadata(MULTIMEDIA_DIR, GAME_COVERS_DIR, game_config_value, current_language())


def enrich_game_metadata(relative_path, name, platform, source="", game_id=0):
    service = game_metadata_service()
    identity = {"metadataSource": source, "metadataId": game_id}
    try:
        if not source or not game_id:
            search = service.search(name, platform)
            if not search["configured"]:
                return {"metadataStatus": "not_configured"}
            # A direct upload may identify an exact title; ambiguous names need a user selection.
            matches = [item for item in search["results"] if title_key(item["name"]) == title_key(name)]
            preferred = [item for item in matches if item["source"] == "screenscraper"] or matches
            if len(preferred) != 1:
                return {"metadataStatus": "needs_selection" if search["results"] else "error" if search["warnings"] else "not_found",
                        "metadataWarnings": search["warnings"]}
            source, game_id = preferred[0]["source"], preferred[0]["id"]
            identity = {"metadataSource": source, "metadataId": game_id}
        details = service.details(source, game_id, platform)
        return service.localize(details, relative_path)
    except (MetadataError, OSError, ValueError, TypeError, KeyError):
        return {**identity, "metadataStatus": "error"}


def download_game_cover(cover_url, relative_path):
    try:
        return game_metadata_service().download_image(cover_url, relative_path) if cover_url else ""
    except (MetadataError, OSError, ValueError):
        return ""


def resolve_relative_video_path(relative_path, required_root):
    normalized_path = os.path.normpath(str(relative_path or "").strip().strip("/\\"))
    if not normalized_path or normalized_path.startswith("..") or os.path.isabs(normalized_path):
        return None

    target_path = os.path.abspath(os.path.join(VIDEOS_DIR, normalized_path))
    required_root_abs = os.path.abspath(required_root)
    if target_path == required_root_abs or os.path.commonpath([target_path, required_root_abs]) != required_root_abs:
        return None

    return target_path


def parse_video_entry(filename):
    match = EP_RE.search(filename)
    media_id = match.group(1).upper() if match else os.path.splitext(filename)[0].upper()
    season_number = int(match.group(2)) if match else None
    episode_number = int(match.group(3)) if match else None
    return media_id, season_number, episode_number


def playback_state_for_path(filepath):
    try:
        relative_path = os.path.relpath(filepath, VIDEOS_DIR).replace("\\", "/")
    except ValueError:
        relative_path = os.path.basename(filepath)

    filename = os.path.basename(filepath)
    media_id, _season_number, _episode_number = parse_video_entry(filename)
    directory_path = os.path.dirname(relative_path).replace("\\", "/")
    return {
        "playing": media_id,
        "directory": directory_path,
        "file": relative_path,
        "updatedAt": int(time.time()),
    }


def write_playback_state(filepath):
    state = playback_state_for_path(filepath)
    try:
        with open(PLAYBACK_STATE_PATH, "w", encoding="utf-8") as handle:
            json.dump(state, handle, ensure_ascii=False)
    except Exception:
        pass
    return state


def write_menu_command(payload):
    command_payload = {
        **payload,
        "createdAt": int(time.time()),
    }
    temp_path = f"{MENU_COMMAND_PATH}.{os.getpid()}.tmp"
    with open(temp_path, "w", encoding="utf-8") as handle:
        json.dump(command_payload, handle, ensure_ascii=False)
    os.replace(temp_path, MENU_COMMAND_PATH)


def clear_playback_state():
    try:
        os.remove(PLAYBACK_STATE_PATH)
    except FileNotFoundError:
        pass
    except Exception:
        pass


def read_playback_state():
    try:
        with open(PLAYBACK_STATE_PATH, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except Exception:
        return None

    if not isinstance(data, dict):
        return None
    return {
        "playing": str(data.get("playing") or "").strip().upper() or None,
        "directory": str(data.get("directory") or "").strip(),
        "file": str(data.get("file") or "").strip(),
        "playerPid": data.get("playerPid"),
        "playerStart": data.get("playerStart"),
        "profile": data.get("profile") if isinstance(data.get("profile"), dict) else None,
        "backend": data.get("backend"),
    }


def send_mpv_command(*command_parts):
    if not os.path.exists(MPV_SOCKET_PATH):
        return None

    payload = json.dumps({"command": list(command_parts), "request_id": 1}).encode("utf-8") + b"\n"
    client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    client.settimeout(1.0)
    try:
        client.connect(MPV_SOCKET_PATH)
        client.sendall(payload)
        # mpv may emit events before the reply; only consume our command response.
        with client.makefile("rb") as stream:
            for line in stream:
                response = json.loads(line)
                if response.get("request_id") == 1:
                    return response
        return None
    except Exception:
        return None
    finally:
        client.close()


def mpv_is_running():
    response = send_mpv_command("get_property", "path")
    return isinstance(response, dict) and response.get("error") == "success"


def current_playback_status():
    omx_running = current["proc"] is not None and current["proc"].poll() is None
    if omx_running:
        return {
            "playing": current["id"],
            "directory": current["directory"],
            "file": current["file"],
            "running": True,
        }

    state = read_playback_state() or {}
    if player_is_running(state):
        return {"playing": state.get("playing"), "directory": state.get("directory") or "",
                "file": state.get("file") or "", "running": True}

    response = send_mpv_command("get_property", "path")
    if isinstance(response, dict) and response.get("error") == "success" and response.get("data"):
        # Recover identity even when the menu state file is missing or outdated.
        state = playback_state_for_path(response["data"])
        return {"playing": state.get("playing"), "directory": state.get("directory") or "",
                "file": state.get("file") or "", "running": True}

    clear_playback_state()
    return {
        "playing": None,
        "directory": None,
        "file": None,
        "running": False,
    }


def iter_video_entries():
    if not os.path.isdir(VIDEOS_DIR):
        return []

    items = []

    for category, category_dir, category_name in (
        ("movies", MOVIES_DIR, "Movies"),
        ("tvshows", TVSHOWS_DIR, "TVShows"),
    ):
        if not os.path.isdir(category_dir):
            continue

        for entry_name in sorted(os.listdir(category_dir)):
            full_entry = os.path.join(category_dir, entry_name)

            if os.path.isdir(full_entry):
                for root, _dirs, files in os.walk(full_entry):
                    directory_path = join_video_relative_path(category_name, entry_name)

                    for filename in sorted(files):
                        if not is_video_file(filename):
                            continue

                        full_path = os.path.join(root, filename)
                        relative_path = os.path.relpath(full_path, VIDEOS_DIR)
                        media_id, season_number, episode_number = parse_video_entry(filename)

                        items.append(
                            {
                                "id": media_id,
                                "file": filename,
                                "category": category,
                                "directory": entry_name,
                                "directory_path": directory_path.replace("\\", "/"),
                                "relative_path": relative_path.replace("\\", "/"),
                                "full_path": full_path,
                                "season_number": season_number,
                                "episode_number": episode_number,
                            }
                        )
                continue

            if not is_video_file(entry_name):
                continue

            media_id, season_number, episode_number = parse_video_entry(entry_name)
            items.append(
                {
                    "id": media_id,
                    "file": entry_name,
                    "category": category,
                    "directory": None,
                    "directory_path": category_name,
                    "relative_path": os.path.relpath(full_entry, VIDEOS_DIR).replace("\\", "/"),
                    "full_path": full_entry,
                    "season_number": season_number,
                    "episode_number": episode_number,
                }
            )

    return items


def build_media_buckets(category):
    grouped = {}
    root_files = []
    root_directory = "Movies" if category == "movies" else "TVShows"
    category_dir = MOVIES_DIR if category == "movies" else TVSHOWS_DIR
    media_library = load_media_library()
    metadata_items = media_library.get("movies" if category == "movies" else "series", {})

    def with_movie_metadata(video):
        metadata = metadata_items.get(video.get("relativePath") or "") if category == "movies" else None
        if not isinstance(metadata, dict):
            return video

        enriched = dict(video)
        if metadata.get("name"):
            enriched["name"] = metadata.get("name")
        if metadata.get("tmdbId"):
            enriched["tmdbId"] = int(metadata.get("tmdbId") or 0)
        return enriched

    if os.path.isdir(category_dir):
        for entry_name in sorted(os.listdir(category_dir)):
            full_entry = os.path.join(category_dir, entry_name)
            if not os.path.isdir(full_entry):
                continue
            directory_path = join_video_relative_path(root_directory, entry_name)
            grouped.setdefault(
                directory_path,
                {
                    "name": entry_name,
                    "relativePath": directory_path,
                    "videos": [],
                },
            )

    for entry in iter_video_entries():
        if entry.get("category") != category:
            continue

        if entry["directory_path"] == root_directory:
            root_files.append(
                with_movie_metadata(
                    {
                        "id": entry["id"],
                        "file": entry["file"],
                        "relativePath": entry["relative_path"],
                        "seasonNumber": entry["season_number"],
                        "episodeNumber": entry["episode_number"],
                    }
                )
            )
            continue

        bucket = grouped.setdefault(
            entry["directory_path"],
            {
                "name": entry["directory"],
                "relativePath": entry["directory_path"],
                "videos": [],
            },
        )
        bucket["videos"].append(
            with_movie_metadata(
                {
                    "id": entry["id"],
                    "file": entry["file"],
                    "relativePath": entry["relative_path"],
                    "seasonNumber": entry["season_number"],
                    "episodeNumber": entry["episode_number"],
                }
            )
        )

    directories = []
    for relative_path, bucket in sorted(grouped.items()):
        videos = sorted(
            bucket["videos"],
            key=lambda video: (video["seasonNumber"] or 0, video["episodeNumber"] or 0, video["file"]),
        )
        metadata = metadata_items.get(relative_path) if category == "tvshows" else None
        directory_item = {
            "name": metadata.get("name") if isinstance(metadata, dict) and metadata.get("name") else bucket["name"],
            "relativePath": relative_path,
            "videoCount": len(videos),
            "episodeCount": len([video for video in videos if EP_RE.fullmatch(video["id"])]),
            "episodeIds": [video["id"] for video in videos if EP_RE.fullmatch(video["id"])],
            "videos": videos,
        }
        if isinstance(metadata, dict) and metadata.get("tmdbId"):
            directory_item["tmdbId"] = int(metadata.get("tmdbId") or 0)
        directories.append(directory_item)

    return directories, sorted(root_files, key=lambda video: video["file"])


def list_episodes(directory=None):
    normalized_directory = (directory or "").strip()
    items = []

    for entry in iter_video_entries():
        if normalized_directory and entry["directory_path"] != normalized_directory:
            continue

        items.append(
            {
                "id": entry["id"],
                "file": entry["file"],
                "directory": entry["directory"],
                "directoryPath": entry["directory_path"],
                "relativePath": entry["relative_path"],
                "seasonNumber": entry["season_number"],
                "episodeNumber": entry["episode_number"],
            }
        )

    return items


def list_video_directories():
    ensure_media_directories()
    tvshow_directories, tvshow_root_files = build_media_buckets("tvshows")
    movie_directories, movie_root_files = build_media_buckets("movies")
    media_library = sync_scanned_media_library(tvshow_directories, movie_directories, movie_root_files)

    book_collections = load_media_library().get("bookCollections", {})
    return {
        "ok": True,
        "root": VIDEOS_DIR,
        "moviesRoot": MOVIES_DIR,
        "tvShowsRoot": TVSHOWS_DIR,
        "gamesRoot": GAMES_DIR,
        "booksRoot": BOOKS_DIR,
        "picturesRoot": PICTURES_DIR,
        "libraryCounts": get_library_counts(),
        "mediaLibrary": media_library,
        "games": list_game_entries(),
        "books": list_book_entries(),
        "pictures": list_picture_entries(),
        "bookCollections": book_collections,
        "directories": tvshow_directories,
        "rootFiles": tvshow_root_files,
        "movieDirectories": movie_directories,
        "movieRootFiles": movie_root_files,
    }


def is_picture_file(filename):
    return os.path.splitext(str(filename or ""))[1].lower() in PICTURE_EXTENSIONS


def list_picture_entries():
    ensure_media_directories()
    pictures = []
    for root, directories, files in os.walk(PICTURES_DIR):
        directories.sort()
        for filename in sorted(files):
            if not is_picture_file(filename):
                continue
            full_path = os.path.join(root, filename)
            relative_path = os.path.relpath(full_path, PICTURES_DIR).replace("\\", "/")
            pictures.append({
                "name": filename,
                "relativePath": relative_path,
                "directory": os.path.dirname(relative_path).replace("\\", "/"),
                "size": os.path.getsize(full_path),
                "modifiedAt": int(os.path.getmtime(full_path)),
            })
    return pictures


def show_qr_if_needed():
    if qr_visible["shown"]:
        return

    ip = get_local_ip()
    url = f"http://{ip}:{PORT}"

    subprocess.run(
        ["qrencode", "-o", QR_PNG, "-s", "12", "-m", "2", url],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        qr_proc["proc"] = subprocess.Popen(
            ["fbi", "-T", "1", "-a", "-noverbose", QR_PNG],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        qr_visible["shown"] = True
    except Exception:
        qr_visible["shown"] = True


def hide_qr():
    proc = qr_proc.get("proc")
    if proc and proc.poll() is None:
        try:
            proc.terminate()
        except Exception:
            pass

    subprocess.run(
        ["pkill", "-f", "fbi"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    qr_proc["proc"] = None


def stop_locked():
    state = read_playback_state() or {}
    if state.get("profile"):
        try:
            ProfilePlayback(USER_PROFILES_PATH, state["profile"]).sample(send_mpv_command, force=True)
        except (ProfileError, OSError):
            pass
    proc = current["proc"]
    if proc and proc.poll() is None:
        try:
            proc.terminate()
        except Exception:
            pass

    send_mpv_command("quit")

    subprocess.run(
        ["pkill", "-f", "omxplayer.bin"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    subprocess.run(
        ["pkill", "-f", "mpv"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    current["proc"] = None
    current["id"] = None
    current["directory"] = None
    current["file"] = None
    clear_playback_state()


def remove_path_if_exists(path):
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
    except Exception:
        pass


def append_debug_log(path, message):
    try:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {message}\n")
    except Exception:
        pass


def log_upload_event(message):
    append_debug_log(UPLOAD_DEBUG_LOG_PATH, message)


def tail_file(path, max_lines=20):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as handle:
            return "".join(handle.readlines()[-max_lines:]).strip()
    except Exception:
        return ""


def build_mpv_command(filepath):
    remove_path_if_exists(MPV_SOCKET_PATH)
    return [
        "mpv",
        "--fullscreen",
        "--sub-auto=exact",
        f"--input-ipc-server={MPV_SOCKET_PATH}",
        filepath,
    ]


def start_play_locked(filepath):
    if shutil.which("mpv"):
        command = build_mpv_command(filepath)
        append_debug_log(MPV_DEBUG_LOG_PATH, f"Launching mpv from API: {' '.join(command)}")
        try:
            log_handle = open(MPV_DEBUG_LOG_PATH, "a", encoding="utf-8")
            current["proc"] = subprocess.Popen(command, stdout=log_handle, stderr=log_handle)
            time.sleep(0.25)
            if current["proc"].poll() is not None:
                log_handle.close()
                current["proc"] = None
                details = tail_file(MPV_DEBUG_LOG_PATH)
                raise RuntimeError(details or "mpv exited immediately")
            return
        except Exception as exc:
            current["proc"] = None
            raise RuntimeError(f"mpv failed to start: {exc}") from exc

    if shutil.which("omxplayer"):
        current["proc"] = subprocess.Popen(
            ["omxplayer", "--no-osd", "--aspect-mode", "fill", filepath],
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return

    raise RuntimeError("No video player found. Install mpv or omxplayer.")


def volume_up_locked():
    proc = current.get("proc")
    if proc and proc.poll() is None and proc.stdin:
        try:
            proc.stdin.write(b"+")
            proc.stdin.flush()
        except Exception:
            pass
        return

    send_mpv_command("add", "volume", 5)


def volume_down_locked():
    proc = current.get("proc")
    if proc and proc.poll() is None and proc.stdin:
        try:
            proc.stdin.write(b"-")
            proc.stdin.flush()
        except Exception:
            pass
        return

    send_mpv_command("add", "volume", -5)


@app.route("/", methods=["GET"])
def web_index():
    if not web_dist_available():
        return jsonify({"error": "Web dist not found", "path": WEB_DIST_DIR}), 404
    return send_web_index()


@app.route("/<path:asset_path>", methods=["GET"])
def web_assets(asset_path):
    if not web_dist_available():
        return jsonify({"error": "Web dist not found", "path": WEB_DIST_DIR}), 404

    normalized_path = os.path.normpath(asset_path)
    if normalized_path.startswith(".."):
        return jsonify({"error": "Invalid path"}), 400

    full_path = os.path.join(WEB_DIST_DIR, normalized_path)
    if os.path.isfile(full_path):
        directory = os.path.dirname(full_path)
        filename = os.path.basename(full_path)
        return send_from_directory(directory, filename)

    return send_web_index()


@app.route("/episodes", methods=["GET"])
def episodes():
    directory = request.args.get("directory", default="", type=str).strip() or None
    return jsonify(list_episodes(directory=directory))


@app.route("/videos", methods=["GET"])
def videos():
    return jsonify(list_video_directories())


@app.route("/pictures/upload", methods=["POST"])
def upload_pictures():
    ensure_media_directories()
    uploaded_files = request.files.getlist("files")
    if not uploaded_files:
        return jsonify({"error": "Missing pictures"}), 400

    saved = []
    rejected = []
    for uploaded in uploaded_files:
        source_path = str(uploaded.filename or "").replace("\\", "/").strip("/")
        path_parts = [part for part in source_path.split("/") if part not in {"", ".", ".."}]
        if not path_parts or not is_picture_file(path_parts[-1]):
            rejected.append(source_path or "unnamed")
            continue
        # Keep a selected folder's relative hierarchy, without trusting absolute/traversal paths.
        relative_path = os.path.join(*path_parts)
        target_path = os.path.abspath(os.path.join(PICTURES_DIR, relative_path))
        pictures_root = os.path.abspath(PICTURES_DIR)
        if os.path.commonpath([target_path, pictures_root]) != pictures_root:
            rejected.append(source_path)
            continue
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        uploaded.save(target_path)
        saved.append(os.path.relpath(target_path, PICTURES_DIR).replace("\\", "/"))

    if not saved:
        return jsonify({"error": "No supported pictures", "supported": sorted(PICTURE_EXTENSIONS), "rejected": rejected}), 400
    return jsonify({"ok": True, "saved": saved, "rejected": rejected, "pictures": list_picture_entries()})


@app.route("/pictures/content", methods=["GET"])
def picture_content():
    relative_path = str(request.args.get("relativePath") or "").strip().strip("/\\")
    normalized_path = os.path.normpath(relative_path)
    if not normalized_path or normalized_path.startswith("..") or os.path.isabs(normalized_path):
        return jsonify({"error": "Invalid picture path"}), 400
    target_path = os.path.abspath(os.path.join(PICTURES_DIR, normalized_path))
    pictures_root = os.path.abspath(PICTURES_DIR)
    if os.path.commonpath([target_path, pictures_root]) != pictures_root or not os.path.isfile(target_path) or not is_picture_file(target_path):
        return jsonify({"error": "Picture not found"}), 404
    return send_file(target_path, conditional=True)


@app.route("/game-covers/<path:filename>", methods=["GET"])
def game_cover_file(filename):
    ensure_media_directories()
    safe_filename = os.path.basename(str(filename or "").strip())
    if not safe_filename or safe_filename != filename:
        return jsonify({"error": "Invalid cover filename"}), 400
    target_path = os.path.join(GAME_COVERS_DIR, safe_filename)
    if not os.path.isfile(target_path):
        safe_filename = DEFAULT_GAME_COVER_FILENAME
    return send_from_directory(GAME_COVERS_DIR, safe_filename)


@app.route("/books/upload", methods=["POST"])
def upload_books():
    saved = []
    rejected = []
    original_path = ""
    partial_path = None
    log_upload_event(f"books request bytes={request.content_length}")
    try:
        uploaded_files = request.files.getlist("files")
        requested_collection = str(request.form.get("collection") or "").strip()
        requested_title = str(request.form.get("title") or "").strip()
        try:
            profile = json.loads(request.form.get("metadata") or "{}")
            if not isinstance(profile, dict):
                raise ValueError("Invalid metadata")
            profile = book_metadata.normalize_profile(profile)
        except (ValueError, TypeError):
            return jsonify({"error": "La ficha del libro no es válida."}), 400
        if profile and len(uploaded_files) != 1:
            return jsonify({"error": "Confirma una ficha para cada libro."}), 400
        if not uploaded_files:
            return jsonify({"error": "Missing book files"}), 400

        ensure_media_directories()
        for uploaded in uploaded_files:
            original_path = str(uploaded.filename or "").replace("\\", "/").strip("/")
            filename = os.path.basename(original_path)
            if not filename or not is_book_file(filename):
                rejected.append(original_path or filename)
                continue
            file_parent = os.path.dirname(original_path)
            collection = requested_collection or (file_parent if file_parent not in {"", "."} else "")
            safe_parts = [slugify(part, "collection") for part in collection.split("/") if part and part not in {".", ".."}]
            target_dir = os.path.join(BOOKS_DIR, *safe_parts)
            os.makedirs(target_dir, exist_ok=True)
            desired_filename = filename
            if requested_title and len(uploaded_files) == 1:
                desired_filename = os.path.basename(requested_title.replace("\\", "/")) + os.path.splitext(filename)[1].lower()
            target_path = upload_target("books", filename, requested_title, collection)
            replacing = os.path.isfile(target_path)
            if replacing and request.form.get("overwriteExisting") != "true":
                return jsonify({"error": "El libro ya existe. Confirma si quieres sobrescribirlo."}), 409
            target_dir = os.path.dirname(target_path)
            target_name = os.path.basename(target_path)
            log_upload_event(f"book saving source={original_path!r} target={target_path!r}")
            with tempfile.NamedTemporaryFile(dir=target_dir, prefix=".upload-", suffix=".part", delete=False) as temporary:
                partial_path = temporary.name
                uploaded.save(temporary)
            if os.path.getsize(partial_path) == 0:
                raise ValueError("El archivo recibido está vacío")
            relative = os.path.relpath(target_path, BOOKS_DIR).replace("\\", "/")
            relative_path = f"Books/{relative}"
            item = prepare_book_profile(relative_path, {"title": requested_title or os.path.splitext(filename)[0],
                "isGraphicNovel": book_metadata.is_graphic_novel(profile, filename), **profile})
            persist_book_profile(relative_path, item)
            os.replace(partial_path, target_path)
            partial_path = None
            saved.append({**item, "name": item["title"], "file": target_name, "relativePath": relative_path})
            log_upload_event(f"book saved relative={relative!r} bytes={os.path.getsize(target_path)}")
    except Exception as exc:
        if partial_path and os.path.isfile(partial_path):
            try:
                os.remove(partial_path)
            except OSError:
                pass
        status = exc.code if isinstance(exc, HTTPException) else 500
        if isinstance(exc, OSError) and exc.errno == 28:
            status = 507
            reason = "No queda espacio disponible para guardar el cómic"
        else:
            reason = str(exc)
        log_upload_event(f"books failed file={original_path!r} saved={len(saved)} error={exc!r}")
        return jsonify({"error": reason, "file": original_path, "items": saved, "rejected": rejected}), status

    if not saved:
        log_upload_event(f"books rejected files={rejected!r}")
        return jsonify({"error": "No supported books", "supported": sorted(BOOK_EXTENSIONS), "rejected": rejected}), 400
    return jsonify({"ok": True, "items": saved, "rejected": rejected})


@app.route("/books", methods=["DELETE"])
@media_library_transaction
def delete_book():
    relative_path = str(request.args.get("relativePath") or "").strip()
    target_path = resolve_book_path(relative_path)
    if not target_path or target_path == BOOKS_DIR or not os.path.isfile(target_path) or not is_book_file(target_path):
        return jsonify({"error": "Book not found"}), 404
    os.remove(target_path)
    library = load_media_library()
    previous = library.setdefault("books", {}).pop(relative_path, None)
    previous_cover = str(previous.get("coverUrl") or "") if isinstance(previous, dict) else ""
    if previous_cover.startswith("/book-covers/"):
        cover_path = os.path.join(BOOK_COVERS_DIR, os.path.basename(urllib.parse.unquote(urllib.parse.urlsplit(previous_cover).path)))
        if os.path.isfile(cover_path):
            os.remove(cover_path)
    save_media_library(library)
    parent = os.path.dirname(target_path)
    while parent != BOOKS_DIR and os.path.isdir(parent) and not os.listdir(parent):
        os.rmdir(parent)
        parent = os.path.dirname(parent)
    return jsonify({"ok": True, "relativePath": relative_path, "removed": True})


def prepare_book_profile(relative_path, data):
    item = book_metadata.normalize_profile(data)
    uploaded_cover = request.files.get("coverFile")
    if uploaded_cover and uploaded_cover.filename:
        extension = os.path.splitext(uploaded_cover.filename)[1].lower()
        if extension not in BOOK_COVER_EXTENSIONS:
            raise ValueError("Unsupported cover image")
        os.makedirs(BOOK_COVERS_DIR, exist_ok=True)
        cover_name = f"manual-{hashlib.sha256(relative_path.encode('utf-8')).hexdigest()[:24]}{extension}"
        uploaded_cover.save(os.path.join(BOOK_COVERS_DIR, cover_name))
        item["coverUrl"] = f"/book-covers/{urllib.parse.quote(cover_name)}?v={time.time_ns()}"
    elif item.get("coverUrl"):
        item["coverUrl"] = book_metadata.cache_cover(item["coverUrl"], BOOK_COVERS_DIR, relative_path)
    return item


@media_library_transaction
def persist_book_profile(relative_path, updates):
    library = load_media_library()
    previous = library.setdefault("books", {}).get(relative_path, {})
    item = {**previous, **updates}
    library["books"][relative_path] = item
    save_media_library(library)
    return item


@app.route("/books/profile", methods=["POST"])
def save_book_profile():
    data = request.form if request.form else (request.get_json(silent=True) or {})
    relative_path = str(data.get("relativePath") or "").strip()
    target_path = resolve_book_path(relative_path)
    if not target_path or not os.path.isfile(target_path) or not is_book_file(target_path):
        return jsonify({"error": "Book not found"}), 404
    # Canonicalize the key, so alternate path spellings cannot create invisible profiles.
    relative_path = "Books/" + os.path.relpath(target_path, BOOKS_DIR).replace("\\", "/")
    try:
        item = prepare_book_profile(relative_path, data)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        return jsonify({"error": "No se pudo guardar la portada de Open Library. Reintenta o usa la portada del archivo."}), 502
    item["title"] = item.get("title") or os.path.splitext(os.path.basename(target_path))[0]
    item = persist_book_profile(relative_path, item)
    return jsonify({"ok": True, "item": {**item, "relativePath": relative_path}})


@app.route("/book-covers/<path:filename>", methods=["GET"])
def custom_book_cover(filename):
    safe_filename = os.path.basename(urllib.parse.unquote(filename))
    if safe_filename != urllib.parse.unquote(filename):
        return jsonify({"error": "Invalid cover filename"}), 400
    return send_from_directory(BOOK_COVERS_DIR, safe_filename, conditional=True)


@app.route("/books/collection/profile", methods=["POST"])
@media_library_transaction
def save_book_collection_profile():
    data = request.form
    collection = str(data.get("collection") or "").strip().strip("/")
    target_path = resolve_book_path(collection)
    if not collection or not target_path or target_path == os.path.abspath(BOOKS_DIR) or not os.path.isdir(target_path):
        return jsonify({"error": "Book collection not found"}), 404
    collection = os.path.relpath(target_path, BOOKS_DIR).replace("\\", "/")
    try:
        type_update = book_metadata.normalize_profile({"isGraphicNovel": data["isGraphicNovel"]}) if "isGraphicNovel" in data else {}
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    library = load_media_library()
    previous = library.setdefault("bookCollections", {}).get(collection, {})
    cover_url = str(data.get("coverUrl") or previous.get("coverUrl") or "").strip()
    uploaded_cover = request.files.get("coverFile")
    if uploaded_cover and uploaded_cover.filename:
        extension = os.path.splitext(uploaded_cover.filename)[1].lower()
        if extension not in BOOK_COVER_EXTENSIONS:
            return jsonify({"error": "Unsupported cover image"}), 400
        os.makedirs(BOOK_COVERS_DIR, exist_ok=True)
        cover_name = f"collection-{hashlib.sha256(collection.encode('utf-8')).hexdigest()[:24]}{extension}"
        uploaded_cover.save(os.path.join(BOOK_COVERS_DIR, cover_name))
        cover_url = f"/book-covers/{urllib.parse.quote(cover_name)}?v={time.time_ns()}"
    item = {**previous, "name": str(data.get("name") or collection).strip(), "coverUrl": cover_url}
    if "author" in data:
        item["author"] = str(data.get("author") or "").strip()[:1000]
    library["bookCollections"][collection] = item
    if type_update:
        profiles = library.setdefault("books", {})
        for root, _dirs, files in os.walk(target_path):
            for filename in files:
                if is_book_file(filename):
                    key = "Books/" + os.path.relpath(os.path.join(root, filename), BOOKS_DIR).replace("\\", "/")
                    profiles[key] = {**profiles.get(key, {}), **type_update}
    save_media_library(library)
    return jsonify({"ok": True, "item": {**item, "collection": collection}})


@app.route("/books/collection", methods=["DELETE"])
@media_library_transaction
def delete_book_collection():
    collection = str(request.args.get("collection") or "").strip().strip("/")
    target_path = resolve_book_path(collection)
    if not collection or not target_path or not os.path.isdir(target_path):
        return jsonify({"error": "Book collection not found"}), 404
    library = load_media_library()
    prefix = f"Books/{collection}/"
    library["books"] = {key: value for key, value in library.get("books", {}).items() if not key.startswith(prefix)}
    metadata = library.setdefault("bookCollections", {}).pop(collection, None)
    cover_url = str(metadata.get("coverUrl") or "") if isinstance(metadata, dict) else ""
    if cover_url.startswith("/book-covers/"):
        cover_path = os.path.join(BOOK_COVERS_DIR, os.path.basename(urllib.parse.unquote(urllib.parse.urlsplit(cover_url).path)))
        if os.path.isfile(cover_path):
            os.remove(cover_path)
    shutil.rmtree(target_path)
    save_media_library(library)
    return jsonify({"ok": True, "collection": collection, "removed": True})


@app.route("/books/search", methods=["GET"])
def search_open_library_books():
    try:
        return jsonify({"items": book_metadata.search(str(request.args.get("query") or ""), normalize_language_code(request.args.get("language")))})
    except Exception:
        return jsonify({"error": "Open Library no está disponible. Puedes reintentar o completar la ficha manualmente."}), 502


@app.route("/books/metadata", methods=["GET"])
def open_library_book_details():
    try:
        return jsonify({"item": book_metadata.details(request.args.get("workKey"), request.args.get("editionKey"),
            normalize_language_code(request.args.get("language")))})
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        return jsonify({"error": "No se pudo obtener la ficha completa de Open Library. Vuelve a seleccionar el resultado para reintentar."}), 502


@app.route("/books/content", methods=["GET"])
def stream_book():
    relative_path = str(request.args.get("relativePath") or "").strip()
    target_path = resolve_book_path(relative_path)
    if not target_path or not os.path.isfile(target_path) or not is_book_file(target_path):
        return jsonify({"error": "Book not found"}), 404
    if request.args.get("render") == "pdf" and os.path.splitext(target_path)[1].lower() in {".cbr", ".cbz"}:
        try:
            rendered = comic_pdf(target_path, os.path.join(BOOK_COVERS_DIR, "comics"))
        except ComicError as error:
            return jsonify({"error": str(error)}), 422
        return send_file(rendered, mimetype="application/pdf", conditional=True,
                         download_name=os.path.splitext(os.path.basename(target_path))[0] + ".pdf")
    return send_file(
        target_path,
        mimetype={".pdf": "application/pdf", ".epub": "application/epub+zip"}.get(os.path.splitext(target_path)[1].lower()),
        conditional=True,
        as_attachment=False,
        download_name=os.path.basename(target_path),
    )


@app.route("/books/open", methods=["POST"])
def open_book():
    data = request.get_json(force=True, silent=True) or {}
    relative_path = str(data.get("relativePath") or "").strip()
    target_path = resolve_book_path(relative_path)
    if not target_path or not os.path.isfile(target_path) or not is_book_file(target_path):
        return jsonify({"error": "Book not found"}), 404
    if not data.get("userId"):
        write_menu_command({"action": "open_book", "path": target_path})
        return jsonify({"ok": True, "relativePath": relative_path})
    profile = playback_profile(data, relative_path, "book")
    # Use the same reader on the MiniTV to share EPUB CFIs and PDF page numbers.
    browser = next((shutil.which(name) for name in ("chromium", "chromium-browser", "google-chrome") if shutil.which(name)), None)
    if not browser:
        return jsonify({"error": "Instala Chromium en la MiniTV para leer con progreso por usuario: sudo apt install chromium. Puedes leer en el navegador mientras tanto."}), 503
    query = urllib.parse.urlencode({"readerBook": relative_path, "profile": profile["userId"],
                                   "resume": "1" if data.get("resume") is True else "0"})
    # PIN travels in the fragment, not the server's URL/access log.
    url = f"http://127.0.0.1:{PORT}/?{query}#readerPin={urllib.parse.quote(current_web_pin())}"
    write_menu_command({"action": "open_book", "path": target_path, "readerUrl": url, "browser": browser})
    return jsonify({"ok": True, "relativePath": relative_path})


@app.route("/books/cover", methods=["GET"])
def book_cover():
    relative_path = str(request.args.get("relativePath") or "").strip()
    target_path = resolve_book_path(relative_path)
    if not target_path or not os.path.isfile(target_path) or not is_book_file(target_path):
        return jsonify({"error": "Book not found"}), 404
    try:
        cover_path = extract_book_cover(target_path)
    except ComicError as error:
        return jsonify({"error": str(error)}), 422
    if not cover_path:
        return jsonify({"error": "Book cover not found"}), 404
    return send_file(cover_path, conditional=True)


@app.route("/games/systems/<system_id>/artwork", methods=["GET", "POST"])
def game_system_artwork(system_id):
    if system_id not in SYSTEMS:
        return jsonify({"error": "Unknown console"}), 404
    ensure_media_directories()
    record = os.path.join(GAME_COVERS_DIR, "system-" + system_id + ".json")
    previous = ""
    try:
        with open(record, encoding="utf-8") as handle:
            previous = json.load(handle).get("filename", "")
    except (OSError, ValueError):
        pass
    if request.method == "POST":
        filename = ""
        if request.form.get("reset") != "1":
            upload = request.files.get("image")
            if not upload:
                return jsonify({"error": "Missing image"}), 400
            data = upload.stream.read(8 * 1024 * 1024 + 1)
            if len(data) > 8 * 1024 * 1024:
                return jsonify({"error": "Maximum image size: 8 MB"}), 400
            ext = ".png" if data.startswith(b"\x89PNG\r\n\x1a\n") else ".jpg" if data.startswith(b"\xff\xd8\xff") else ".webp" if data[:4] == b"RIFF" and data[8:12] == b"WEBP" else None
            if not ext:
                return jsonify({"error": "Use PNG, JPEG or WebP"}), 400
            filename = "system-" + system_id + "-" + str(time.time_ns()) + ext
            with open(os.path.join(GAME_COVERS_DIR, filename), "wb") as handle:
                handle.write(data)
        with open(record, "w", encoding="utf-8") as handle:
            json.dump({"filename": filename}, handle)
        if previous and os.path.basename(previous) == previous and previous.startswith("system-" + system_id + "-"):
            try:
                os.remove(os.path.join(GAME_COVERS_DIR, previous))
            except OSError:
                pass
        previous = filename
    return jsonify({"image": game_cover_url(previous) if previous else ""})


@app.route("/games/youtube", methods=["GET"])
def game_youtube_search():
    query = str(request.args.get("query") or "").strip()
    if not query or len(query) > 200:
        return jsonify({"error": "Invalid search query"}), 400
    try:
        return jsonify(youtube_search.search(query, game_config_value("YOUTUBE_API_KEY"), current_language()))
    except youtube_search.SearchError as error:
        return jsonify({"error": str(error), "code": str(error)}), 502
    except (OSError, ValueError, AttributeError):
        return jsonify({"error": "YOUTUBE_CONFIG_ERROR", "code": "YOUTUBE_CONFIG_ERROR"}), 500


@app.route("/games/search", methods=["GET"])
def search_games():
    query = str(request.args.get("query") or "").strip()
    extension = str(request.args.get("extension") or "").strip().lower()
    platform = resolve_platform(extension if extension.startswith(".") else f".{extension}", request.args.get("platform"))
    service = game_metadata_service()
    if not query:
        return jsonify({"ok": True, "configured": any(service.providers().values()), "providers": service.providers(), "results": []})
    if not platform:
        return jsonify({"error": "Unsupported game platform"}), 400
    return jsonify({**service.search(query, platform), "platform": platform,
                    "defaultCover": game_cover_url(DEFAULT_GAME_COVER_FILENAME)})


@app.route("/games/metadata", methods=["GET", "POST"])
def game_metadata_profile():
    data = request.args if request.method == "GET" else request.get_json(silent=True) or {}
    relative_path = str(data.get("relativePath") or "")
    if relative_path:
        path = resolve_game_path(relative_path)
        if not path or not os.path.isfile(path) or not is_game_rom_file(path):
            return jsonify({"error": "Game not found"}), 404
        relative_path = game_relative_path(os.path.basename(path))
        current_item = (load_media_library().get("games") or {}).get(relative_path, {})
        if request.method == "GET":
            return jsonify({"ok": True, "item": current_item})
        platform = resolve_platform(os.path.basename(path), current_item.get("platform"))
        if not platform:
            return jsonify({"error": "Select a compatible console"}), 400
        try:
            game_id = int(data.get("id") or current_item.get("metadataId") or 0)
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid game identifier"}), 400
        updates = enrich_game_metadata(relative_path, current_item.get("name") or os.path.basename(path), platform,
                                       data.get("source") or current_item.get("metadataSource", ""), game_id)
        # Retrying downloads must keep custom text, artwork and any previously saved provider data.
        for key in ("name", "description"):
            if current_item.get(key):
                updates[key] = current_item[key]
        if updates.get("imageOptions"):
            previous_cover = current_item.get("coverImage")
            if previous_cover and previous_cover != game_cover_url(DEFAULT_GAME_COVER_FILENAME):
                updates["coverImage"] = previous_cover
            elif not updates.get("coverImage"):
                updates["coverImage"] = previous_cover or game_cover_url(DEFAULT_GAME_COVER_FILENAME)
            updates["imageOptions"] = unique_ordered_urls([updates["coverImage"], *updates["imageOptions"],
                *[url for url in current_item.get("imageOptions", []) if url != game_cover_url(DEFAULT_GAME_COVER_FILENAME)]])
        elif "coverImage" in updates:
            updates.pop("coverImage")
            updates.pop("imageOptions", None)
        return jsonify({"ok": True, "item": upsert_game_metadata(relative_path, updates)})
    if request.method == "POST":
        return jsonify({"error": "Missing relativePath"}), 400
    extension = str(data.get("extension") or "").lstrip(".")
    platform = resolve_platform("." + extension, data.get("platform"))
    if not platform:
        return jsonify({"error": "Unsupported game platform"}), 400
    try:
        item = game_metadata_service().details(str(data.get("source") or ""), int(data.get("id") or 0), platform)
        return jsonify({"ok": True, "item": {key: value for key, value in item.items() if key != "raw"}})
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid game identifier"}), 400
    except (MetadataError, OSError, KeyError):
        return jsonify({"error": "Could not load game metadata"}), 502


@app.route("/games/metadata/image", methods=["GET"])
def game_metadata_image():
    try:
        local_url = game_metadata_service().download_image(str(request.args.get("url") or ""), "preview")
        return send_from_directory(GAME_COVERS_DIR, os.path.basename(local_url), conditional=True)
    except (MetadataError, OSError, ValueError):
        return jsonify({"error": "Game image unavailable"}), 502


@app.route("/series", methods=["POST"])
def create_series():
    data = request.get_json(force=True, silent=True) or {}
    name = str(data.get("name") or "").strip()
    tmdb_id = int(data.get("tmdbId") or 0)
    if not name:
        return jsonify({"error": "Missing name"}), 400

    ensure_media_directories()
    base_slug = slugify(name, "serie")
    slug = base_slug
    index = 2
    while os.path.exists(os.path.join(TVSHOWS_DIR, slug)):
        slug = f"{base_slug}-{index}"
        index += 1

    series_dir = os.path.join(TVSHOWS_DIR, slug)
    os.makedirs(series_dir, exist_ok=True)
    item = {
        "name": name,
        "relativePath": join_video_relative_path("TVShows", slug),
        "tmdbId": tmdb_id,
    }
    upsert_series_metadata(item["relativePath"], item)
    return jsonify({"ok": True, "item": item})


@app.route("/series", methods=["DELETE"])
def delete_series():
    relative_path = str(request.args.get("relativePath") or "").strip().strip("/\\")
    if not relative_path:
        return jsonify({"error": "Missing relativePath"}), 400

    series_path = resolve_relative_video_path(relative_path, TVSHOWS_DIR)
    if not series_path:
        return jsonify({"error": "Series must be inside TVShows"}), 400

    if not os.path.exists(series_path):
        remove_series_metadata(relative_path)
        return jsonify({"ok": True, "relativePath": relative_path, "removed": False})

    shutil.rmtree(series_path)
    remove_series_metadata(relative_path)
    return jsonify({"ok": True, "relativePath": relative_path, "removed": True})


@app.route("/series/episode", methods=["DELETE"])
def delete_series_episode():
    relative_path = str(request.args.get("relativePath") or "").strip().strip("/\\")
    if not relative_path:
        return jsonify({"error": "Missing relativePath"}), 400

    episode_path = resolve_relative_video_path(relative_path, TVSHOWS_DIR)
    if not episode_path:
        return jsonify({"error": "Episode must be inside TVShows"}), 400

    removed = False
    if os.path.exists(episode_path):
        if os.path.isdir(episode_path):
            return jsonify({"error": "Episode path must be a file"}), 400
        os.remove(episode_path)
        removed = True

    series_relative_path = os.path.dirname(relative_path).replace("\\", "/")
    item = refresh_series_metadata_from_disk(series_relative_path)
    return jsonify(
        {
            "ok": True,
            "relativePath": relative_path,
            "seriesRelativePath": series_relative_path,
            "removed": removed,
            "item": item,
        }
    )


@app.route("/series/season", methods=["DELETE"])
def delete_series_season():
    relative_path = str(request.args.get("relativePath") or "").strip().strip("/\\")
    season_number = int(request.args.get("seasonNumber") or 0)
    if not relative_path:
        return jsonify({"error": "Missing relativePath"}), 400
    if not season_number:
        return jsonify({"error": "Missing seasonNumber"}), 400

    series_path = resolve_relative_video_path(relative_path, TVSHOWS_DIR)
    if not series_path:
        return jsonify({"error": "Series must be inside TVShows"}), 400

    removed = []
    if os.path.isdir(series_path):
        for video in get_series_directory_videos(series_path):
            if int(video.get("seasonNumber") or 0) != season_number:
                continue
            episode_path = resolve_relative_video_path(video.get("relativePath"), TVSHOWS_DIR)
            if episode_path and os.path.isfile(episode_path):
                os.remove(episode_path)
                removed.append(video.get("relativePath"))

    item = refresh_series_metadata_from_disk(relative_path)
    return jsonify(
        {
            "ok": True,
            "relativePath": relative_path,
            "seasonNumber": season_number,
            "removed": len(removed),
            "removedPaths": removed,
            "item": item,
        }
    )


def upload_target(media_type, filename, title="", collection="", tmdb_id=0):
    """Use the same identity for preflight checks and the actual write."""
    filename = os.path.basename(str(filename).replace("\\", "/"))
    base, extension = os.path.splitext(filename)
    root = MOVIES_DIR if media_type == "movies" else BOOKS_DIR
    parts = [] if media_type == "movies" else [slugify(part, "collection") for part in collection.split("/") if part and part not in {".", ".."}]
    directory = os.path.join(root, *parts)
    candidate = os.path.join(directory, f"{slugify(title or base, 'movie')}{extension.lower()}")
    for relative, item in load_media_library().get(media_type, {}).items():
        if not isinstance(item, dict):
            continue
        path = os.path.abspath(os.path.join(VIDEOS_DIR, relative)) if media_type == "movies" else resolve_book_path(relative)
        if not path or not os.path.realpath(path).startswith(os.path.realpath(root) + os.sep) or not os.path.isfile(path):
            continue
        same_id = media_type == "movies" and tmdb_id and str(item.get("tmdbId")) == str(tmdb_id)
        same_title = slugify(item.get("name") or item.get("title"), "") == slugify(title or base, "")
        if same_id or (same_title and os.path.dirname(path) == os.path.abspath(directory)):
            return path
    return candidate


def import_torrent_movie(job, source):
    """Publish the finished video atomically before adding its profile or queuing artwork."""
    ensure_media_directories()
    movie = job["movie"]
    filename = f"{slugify(movie['name'], 'movie')[:120]}-{movie['id']}-{job['id'][:12]}{source.suffix.lower()}"
    target = os.path.join(MOVIES_DIR, filename)
    previous_path = None
    published = False
    with tempfile.TemporaryDirectory(dir=MOVIES_DIR, prefix=".torrent-import-") as temporary:
        backup = os.path.join(temporary, "previous")
        try:
            with catalog_store.transaction(MEDIA_LIBRARY_PATH, LEGACY_MOVIE_LIBRARY_PATH):
                library = load_media_library()
                previous = {}
                for entry in library["movies"].values():
                    if int(entry.get("tmdbId") or 0) != movie["id"]:
                        continue
                    existing = resolve_relative_video_path(entry.get("relativePath"), MOVIES_DIR)
                    if not existing or not os.path.isfile(existing):
                        continue
                    if not job.get("overwriteExisting") and not os.path.samefile(source, existing):
                        raise ValueError("Esta película ya está en la biblioteca. El vídeo descargado se conserva para reintentar.")
                    previous, previous_path = entry, existing
                    break
                # Keep the existing path when the container matches, and its profile in either case.
                if previous_path and os.path.splitext(previous_path)[1].lower() == source.suffix.lower():
                    target = previous_path
                relative = os.path.relpath(target, VIDEOS_DIR).replace("\\", "/")
                if os.path.lexists(target) and not os.path.samefile(source, target):
                    if os.path.islink(target) or target != previous_path or not job.get("overwriteExisting"):
                        raise ValueError("Ya existe otro fichero con el nombre de destino.")
                    os.link(target, backup)
                if not os.path.exists(target) or not os.path.samefile(source, target):
                    staged = os.path.join(temporary, "finished")
                    os.link(source, staged)
                    os.replace(staged, target)
                    published = True
                item = {**previous, "relativePath": relative, "name": movie["name"],
                        "tmdbId": movie["id"], "file": os.path.basename(target)}
                if previous.get("relativePath") != relative:
                    library["movies"].pop(previous.get("relativePath"), None)
                library["movies"][relative] = item
                save_media_library(library)
        except Exception:
            if published:
                if os.path.exists(backup):
                    os.replace(backup, target)
                else:
                    os.unlink(target)
            raise
        if previous_path and previous_path != target:
            os.unlink(previous_path)
    queue_tmdb_artwork("movie", item)
    return item


def import_torrent_series(job, episodes):
    """Import each identified episode, keeping existing videos and rolling back failed publication."""
    ensure_media_directories()
    series = job["series"]
    root = Path(TVSHOWS_DIR).resolve()
    published = []
    imported_ids, skipped_ids = [], []
    try:
        with catalog_store.transaction(MEDIA_LIBRARY_PATH, LEGACY_MOVIE_LIBRARY_PATH):
            library = load_media_library()
            previous = next((entry for entry in library["series"].values()
                             if int(entry.get("tmdbId") or 0) == series["id"]), {})
            if previous:
                directory = resolve_relative_video_path(previous.get("relativePath"), TVSHOWS_DIR)
                if not directory:
                    raise ValueError("La carpeta de la serie no es válida.")
                target_dir = Path(directory)
            else:
                target_dir = root / f"{slugify(series['name'], 'serie')[:120]}-{series['id']}"
                relative = os.path.relpath(target_dir, VIDEOS_DIR).replace("\\", "/")
                # Preserve any unassociated profile in this same directory; never take another series' folder.
                previous = library["series"].get(relative, {})
                if previous.get("tmdbId") and int(previous["tmdbId"]) != series["id"]:
                    raise ValueError("La carpeta de destino pertenece a otra serie.")
            if not target_dir.resolve().is_relative_to(root) or target_dir.resolve() == root:
                raise ValueError("La carpeta de la serie no es segura.")
            if any(path.is_symlink() for path in [target_dir, *target_dir.parents] if path != root and root in path.parents):
                raise ValueError("La carpeta de la serie no es segura.")
            target_dir.mkdir(parents=True, exist_ok=True)
            existing = {video["id"]: video for video in get_series_directory_videos(str(target_dir))}
            for episode in episodes:
                source, episode_id = episode["source"], episode["id"]
                if episode_id in existing:
                    current = target_dir / existing[episode_id]["file"]
                    if current.is_symlink():
                        raise ValueError("El capítulo existente no es un fichero seguro.")
                    # Recognize our own hard links when recovering an interrupted import.
                    (imported_ids if os.path.samefile(source, current) else skipped_ids).append(episode_id)
                    continue
                target = target_dir / f"{episode_id}-{job['id'][:12]}{source.suffix.lower()}"
                if os.path.lexists(target):
                    raise ValueError("Ya existe otro fichero con el nombre del capítulo.")
                os.link(source, target)
                published.append(target)
                imported_ids.append(episode_id)
                existing[episode_id] = {"id": episode_id, "file": target.name}
            videos = get_series_directory_videos(str(target_dir))
            relative = os.path.relpath(target_dir, VIDEOS_DIR).replace("\\", "/")
            item = {**previous, "relativePath": relative, "name": previous.get("name") or series["name"],
                    "tmdbId": series["id"], "episodes": videos, "episodeIds": [video["id"] for video in videos]}
            library["series"][relative] = item
            save_media_library(library)
    except Exception:
        for target in reversed(published):
            target.unlink()
        raise
    queue_tmdb_artwork("tv", item, refresh=True)
    return {**item, "importedEpisodeIds": imported_ids, "skippedEpisodeIds": skipped_ids}


movie_torrents = None
movie_torrents_lock = threading.Lock()


def get_movie_torrents():
    global movie_torrents
    with movie_torrents_lock:
        if movie_torrents is None:
            movie_torrents = TorrentDownloads(
                os.path.join(MULTIMEDIA_DIR, "Torrents"), import_torrent_movie,
                lambda tmdb_id: tmdb_artwork.status().get("jobs", {}).get(f"movie/{tmdb_id}"),
                lambda tmdb_id: tmdb_artwork.enqueue("movie", tmdb_id),
                import_series=import_torrent_series,
                series_artwork_status=lambda tmdb_id: tmdb_artwork.status().get("jobs", {}).get(f"tv/{tmdb_id}"),
                prepare_series_artwork=lambda tmdb_id: tmdb_artwork.enqueue("tv", tmdb_id, refresh=True),
            )
        movie_torrents.start()
        return movie_torrents


@app.errorhandler(TorrentError)
def torrent_error(error):
    return jsonify({"error": str(error)}), 503


@app.route("/torrents/search", methods=["GET"])
def find_movie_torrents():
    try:
        return jsonify(search_torrents(request.args.get("q"), media_type=request.args.get("mediaType", "movies"),
                                       imdb_id=request.args.get("imdbId"), season=request.args.get("seasonNumber"),
                                       episode=request.args.get("episodeNumber"), eztv_page=request.args.get("eztvPage", 1)))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@app.route("/torrents", methods=["GET", "POST"])
def movie_torrent_jobs():
    manager = get_movie_torrents()
    if request.method == "GET":
        return jsonify(manager.snapshot())
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Solicitud de descarga no válida."}), 400
    movie = data.get("movie")
    if data.get("mediaType", "movies") == "movies" and isinstance(movie, dict) and data.get("overwriteExisting") is not True:
        for entry in load_movie_library().values():
            if str(entry.get("tmdbId")) == str(movie.get("id")):
                path = resolve_relative_video_path(entry.get("relativePath"), MOVIES_DIR)
                if path and os.path.isfile(path):
                    return jsonify({"error": "Esta película ya está descargada. ¿Quieres sobrescribirla o cancelar la descarga?",
                                    "code": "MOVIE_ALREADY_DOWNLOADED"}), 409
    try:
        return jsonify({"job": manager.add(data)}), 202
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@app.route("/torrents/<job_id>", methods=["POST"])
def control_movie_torrent(job_id):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Solicitud no válida."}), 400
    try:
        return jsonify({"job": get_movie_torrents().action(job_id, data.get("action"))})
    except KeyError:
        return jsonify({"error": "Descarga no encontrada."}), 404
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@app.route("/uploads/check", methods=["POST"])
def check_upload_conflicts():
    data = request.get_json(silent=True) or {}
    media_type = data.get("mediaType")
    if media_type not in {"movies", "books"}:
        return jsonify({"error": "Unsupported media type"}), 400
    conflicts = []
    for filename in data.get("files", []):
        normalized = str(filename).replace("\\", "/").strip("/")
        collection = data.get("collection") or os.path.dirname(normalized)
        target = upload_target(media_type, normalized, data.get("title") or "", collection, data.get("tmdbId") or 0)
        if os.path.isfile(target):
            conflicts.append(filename)
    return jsonify({"conflicts": conflicts})


@app.route("/movies/upload", methods=["POST"])
def upload_movie():
    uploaded_file = request.files.get("file")
    name = str(request.form.get("name") or "").strip()
    tmdb_id = int(request.form.get("tmdbId") or 0)
    if not uploaded_file or not uploaded_file.filename:
        log_upload_event("movie rejected missing file")
        return jsonify({"error": "Missing file"}), 400
    if not is_supported_upload_file(uploaded_file.filename):
        log_upload_event(f"movie rejected unsupported filename={uploaded_file.filename}")
        return jsonify({"error": "Unsupported movie file"}), 400

    ensure_media_directories()
    original_filename = os.path.basename(uploaded_file.filename)
    original_extension = os.path.splitext(original_filename)[1]
    desired_base = name or os.path.splitext(original_filename)[0]
    target_path = upload_target("movies", original_filename, desired_base, tmdb_id=tmdb_id)
    if os.path.exists(target_path) and request.form.get("overwriteExisting") != "true":
        return jsonify({"error": "La película ya existe. Confirma si quieres sobrescribirla."}), 409
    target_filename = os.path.basename(target_path)
    log_upload_event(
        f"movie start original={original_filename} name={name} tmdbId={tmdb_id} target={target_path} moviesRoot={MOVIES_DIR}"
    )
    try:
        uploaded_file.save(target_path)
    except Exception as exc:
        log_upload_event(f"movie save failed target={target_path} error={exc}")
        return jsonify({"error": "Movie save failed", "details": str(exc), "targetPath": target_path}), 500
    saved_size = os.path.getsize(target_path) if os.path.exists(target_path) else 0
    if saved_size <= 0:
        log_upload_event(f"movie save empty target={target_path} size={saved_size}")
        return (
            jsonify(
                {
                    "error": "Movie file was not saved",
                    "targetPath": target_path,
                    "moviesRoot": MOVIES_DIR,
                }
            ),
            500,
        )

    relative_path = os.path.relpath(target_path, VIDEOS_DIR).replace("\\", "/")
    movie_item = upsert_movie_metadata(
        relative_path,
        name or os.path.splitext(original_filename)[0],
        tmdb_id,
        target_filename,
    )
    log_upload_event(f"movie saved relative={relative_path} target={target_path} size={saved_size}")
    return jsonify(
        {
            "ok": True,
            "item": movie_item,
            "saved": {
                "path": target_path,
                "relativePath": relative_path,
                "size": saved_size,
                "moviesRoot": MOVIES_DIR,
            },
        }
    )


@app.route("/movies/upload/raw", methods=["POST"])
def upload_movie_raw():
    original_filename = os.path.basename(str(request.args.get("filename") or "movie.mp4"))
    name = str(request.args.get("name") or "").strip()
    tmdb_id = int(request.args.get("tmdbId") or 0)
    if not original_filename:
        log_upload_event("movie raw rejected missing filename")
        return jsonify({"error": "Missing filename"}), 400
    if not is_supported_upload_file(original_filename):
        log_upload_event(f"movie raw rejected unsupported filename={original_filename}")
        return jsonify({"error": "Unsupported movie file"}), 400

    ensure_media_directories()
    original_extension = os.path.splitext(original_filename)[1]
    desired_base = name or os.path.splitext(original_filename)[0]
    target_path = upload_target("movies", original_filename, desired_base, tmdb_id=tmdb_id)
    if os.path.exists(target_path) and request.args.get("overwriteExisting") != "true":
        return jsonify({"error": "La película ya existe. Confirma si quieres sobrescribirla."}), 409
    target_filename = os.path.basename(target_path)
    partial_path = f"{target_path}.part"
    expected_size = int(request.content_length or 0)
    log_upload_event(
        f"movie raw start original={original_filename} name={name} tmdbId={tmdb_id} "
        f"target={target_path} partial={partial_path} expected={expected_size} moviesRoot={MOVIES_DIR}"
    )

    saved_size = 0
    next_log_at = 32 * 1024 * 1024
    try:
        with open(partial_path, "wb") as handle:
            while True:
                chunk = request.stream.read(1024 * 1024)
                if not chunk:
                    break
                handle.write(chunk)
                saved_size += len(chunk)
                if saved_size >= next_log_at:
                    percent = round((saved_size / expected_size) * 100, 1) if expected_size else 0
                    log_upload_event(
                        f"movie raw progress target={target_path} written={saved_size} expected={expected_size} percent={percent}"
                    )
                    next_log_at += 32 * 1024 * 1024
        if expected_size and saved_size != expected_size:
            raise ValueError(f"Incomplete upload: wrote {saved_size} of {expected_size} bytes")
        os.replace(partial_path, target_path)
    except Exception as exc:
        log_upload_event(f"movie raw save failed target={target_path} partial={partial_path} written={saved_size} error={exc}")
        try:
            if os.path.exists(partial_path):
                os.remove(partial_path)
        except Exception:
            pass
        return (
            jsonify(
                {
                    "error": "Movie save failed",
                    "details": str(exc),
                    "targetPath": target_path,
                    "partialPath": partial_path,
                    "written": saved_size,
                    "expected": expected_size,
                }
            ),
            500,
        )

    if saved_size <= 0:
        log_upload_event(f"movie raw save empty target={target_path} size={saved_size}")
        return (
            jsonify(
                {
                    "error": "Movie file was not saved",
                    "targetPath": target_path,
                    "moviesRoot": MOVIES_DIR,
                }
            ),
            500,
        )

    relative_path = os.path.relpath(target_path, VIDEOS_DIR).replace("\\", "/")
    movie_item = upsert_movie_metadata(
        relative_path,
        name or os.path.splitext(original_filename)[0],
        tmdb_id,
        target_filename,
    )
    log_upload_event(f"movie raw saved relative={relative_path} target={target_path} size={saved_size}")
    return jsonify(
        {
            "ok": True,
            "item": movie_item,
            "saved": {
                "path": target_path,
                "relativePath": relative_path,
                "size": saved_size,
                "moviesRoot": MOVIES_DIR,
            },
        }
    )


@app.route("/series/upload", methods=["POST"])
def upload_series():
    uploaded_files = request.files.getlist("files")
    name = str(request.form.get("name") or "").strip()
    directory_name = str(request.form.get("directoryName") or name).strip()
    tmdb_id = int(request.form.get("tmdbId") or 0)
    hero_image = str(request.form.get("heroImage") or "").strip()
    overwrite_existing = str(request.form.get("overwriteExisting") or "false").strip().lower() not in {"0", "false", "no"}
    hero_image_crop = None
    try:
        parsed_crop = json.loads(request.form.get("heroImageCrop") or "null")
        if isinstance(parsed_crop, dict):
            hero_image_crop = parsed_crop
    except Exception:
        hero_image_crop = None

    if not uploaded_files:
        log_upload_event("series rejected missing files")
        return jsonify({"error": "Missing files"}), 400
    if not name:
        log_upload_event("series rejected missing name")
        return jsonify({"error": "Missing name"}), 400
    if not tmdb_id:
        log_upload_event(f"series rejected missing tmdbId name={name}")
        return jsonify({"error": "Missing tmdbId"}), 400

    normalized_files = []
    detected_roots = set()
    invalid_names = []
    nested_files = []
    unsupported_files = []

    for uploaded_file in uploaded_files:
        original_path = str(uploaded_file.filename or "").replace("\\", "/").strip("/")
        if not original_path:
            invalid_names.append("")
            continue

        parts = [part for part in original_path.split("/") if part and part not in {".", ".."}]
        if len(parts) > 2:
            nested_files.append(original_path)
            continue
        if len(parts) == 2:
            detected_roots.add(parts[0])
        filename = os.path.basename(parts[-1] if parts else original_path)

        if not is_supported_upload_file(filename):
            unsupported_files.append(filename)
            continue
        if not EP_RE.search(filename):
            invalid_names.append(filename)
            continue

        media_id, season_number, episode_number = parse_video_entry(filename)
        normalized_files.append(
            {
                "upload": uploaded_file,
                "filename": filename,
                "id": media_id,
                "seasonNumber": season_number,
                "episodeNumber": episode_number,
            }
        )

    if len(detected_roots) != 1:
        log_upload_event(f"series rejected roots={sorted(detected_roots)} name={name}")
        return jsonify({"error": "Series upload must contain a single directory"}), 400
    if nested_files:
        log_upload_event(f"series rejected nested files={nested_files[:8]} name={name}")
        return jsonify({"error": "Series directory cannot contain subdirectories", "files": nested_files}), 400
    if unsupported_files:
        log_upload_event(f"series rejected unsupported files={unsupported_files[:8]} name={name}")
        return jsonify({"error": "Unsupported series files", "files": unsupported_files}), 400
    if invalid_names:
        log_upload_event(f"series rejected invalid names={invalid_names[:8]} name={name}")
        return jsonify({"error": "All files must include SxxExx in their name", "files": invalid_names}), 400
    if not normalized_files:
        log_upload_event(f"series rejected no valid episodes name={name}")
        return jsonify({"error": "No valid episode files found"}), 400

    ensure_media_directories()
    target_slug = slugify(name or directory_name, "serie")
    target_dir = os.path.join(TVSHOWS_DIR, target_slug)
    os.makedirs(target_dir, exist_ok=True)
    existing_episode_ids = {
        video.get("id") for video in get_series_directory_videos(target_dir) if video.get("id")
    }
    skipped_episode_ids = []

    for entry in normalized_files:
        if not overwrite_existing and entry["id"] in existing_episode_ids:
            skipped_episode_ids.append(entry["id"])
            log_upload_event(f"series episode skipped existing id={entry['id']} name={name}")
            continue
        target_filename = os.path.basename(entry["filename"])
        target_path = os.path.join(target_dir, target_filename)
        if overwrite_existing and entry["id"] in existing_episode_ids:
            for existing_video in get_series_directory_videos(target_dir):
                if existing_video.get("id") != entry["id"]:
                    continue
                existing_path = os.path.join(target_dir, os.path.basename(existing_video.get("file") or ""))
                if existing_path != target_path and os.path.isfile(existing_path):
                    os.remove(existing_path)
                    log_upload_event(f"series episode replaced old={existing_path} id={entry['id']}")
        log_upload_event(
            f"series episode start id={entry['id']} filename={target_filename} target={target_path} tvShowsRoot={TVSHOWS_DIR}"
        )
        try:
            entry["upload"].save(target_path)
        except Exception as exc:
            log_upload_event(f"series episode save failed target={target_path} error={exc}")
            return jsonify({"error": "Series episode save failed", "details": str(exc), "targetPath": target_path}), 500
        saved_size = os.path.getsize(target_path) if os.path.exists(target_path) else 0
        log_upload_event(f"series episode saved id={entry['id']} target={target_path} size={saved_size}")

    videos = get_series_directory_videos(target_dir)
    relative_path = join_video_relative_path("TVShows", target_slug)
    item = upsert_series_metadata(
        relative_path,
        {
            "name": name,
            "tmdbId": tmdb_id,
            "episodes": videos,
            "episodeIds": [video["id"] for video in videos],
            "heroImage": hero_image,
            "heroImageCrop": hero_image_crop,
        },
    )
    return jsonify({"ok": True, "item": item, "skippedEpisodeIds": skipped_episode_ids})


@app.route("/games/upload", methods=["POST"])
def upload_game():
    uploaded_file = request.files.get("file")
    uploaded_cover = request.files.get("coverFile")
    uploaded_images = request.files.getlist("imageFiles")
    name = str(request.form.get("name") or "").strip()
    description = str(request.form.get("description") or "").strip()
    cover_url = str(request.form.get("coverUrl") or "").strip()
    source = str(request.form.get("source") or "manual").strip()
    try:
        screen_scraper_id = int(request.form.get("screenScraperId") or 0)
    except Exception:
        screen_scraper_id = 0
    metadata_source = str(request.form.get("metadataSource") or ("screenscraper" if screen_scraper_id else ""))
    try:
        metadata_id = int(request.form.get("metadataId") or screen_scraper_id or 0)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid game identifier"}), 400
    if metadata_source and metadata_source not in {"screenscraper", "igdb"}:
        return jsonify({"error": "Unsupported metadata source"}), 400

    if not uploaded_file or not uploaded_file.filename:
        return jsonify({"error": "Missing file"}), 400
    if not is_game_rom_file(uploaded_file.filename):
        return jsonify({"error": "Unsupported game file"}), 400

    extension = os.path.splitext(uploaded_file.filename)[1].lower().lstrip(".")
    if not request.form.get("platform") and sum(extension in item["extensions"] for item in GAME_SYSTEMS) > 1:
        return jsonify({"error": "Select a console for this file format"}), 400
    platform = resolve_platform(os.path.basename(uploaded_file.filename), request.form.get("platform"))
    if not platform:
        return jsonify({"error": "Select a compatible console for this ROM"}), 400

    ensure_media_directories()
    original_filename = os.path.basename(uploaded_file.filename)
    original_extension = os.path.splitext(original_filename)[1].lower()
    desired_base = os.path.splitext(original_filename)[0] if original_extension == ".zip" else name or os.path.splitext(original_filename)[0]
    if original_extension == ".zip" and os.path.exists(os.path.join(GAMES_DIR, original_filename)):
        return jsonify({"error": "This arcade ROM set already exists"}), 409
    target_filename = original_filename if original_extension == ".zip" else unique_media_filename(GAMES_DIR, f"{desired_base}{original_extension}")
    target_path = os.path.join(GAMES_DIR, target_filename)
    uploaded_file.save(target_path)

    relative_path = game_relative_path(target_filename)
    # Save the ROM profile before network work so a failed provider never loses the upload.
    upsert_game_metadata(relative_path, {"name": name or os.path.splitext(original_filename)[0],
        "platform": platform["id"], "description": description, "source": source,
        "coverImage": game_cover_url(DEFAULT_GAME_COVER_FILENAME), "metadataStatus": "pending"})
    metadata = enrich_game_metadata(relative_path, name or os.path.splitext(original_filename)[0],
                                   platform, metadata_source, metadata_id)
    cover_image = save_uploaded_game_cover(uploaded_cover, relative_path)
    if not cover_image:
        cover_image = download_game_cover(cover_url, relative_path) if cover_url else ""
    if not cover_image:
        cover_image = metadata.get("coverImage", "")
    if not cover_image:
        cover_image = game_cover_url(DEFAULT_GAME_COVER_FILENAME)
    extra_images = [
        save_uploaded_game_image(uploaded_image, relative_path, f"image-{index + 1}")
        for index, uploaded_image in enumerate(uploaded_images)
    ]
    image_options = unique_ordered_urls([cover_image, *metadata.get("imageOptions", []), *extra_images])
    item = upsert_game_metadata(
        relative_path,
        {
            **metadata,
            "name": name or os.path.splitext(original_filename)[0],
            "platform": platform["id"],
            "description": description or metadata.get("description", ""),
            "coverImage": cover_image,
            "imageOptions": image_options,
            "screenScraperId": screen_scraper_id,
            "source": metadata.get("source") or source,
        },
    )
    return jsonify({"ok": True, "item": item, "libraryCounts": get_library_counts()})


@app.route("/games/profile", methods=["POST"])
def save_game_profile():
    relative_path = str(request.form.get("relativePath") or "").strip().strip("/\\")
    name = str(request.form.get("name") or "").strip()
    description = str(request.form.get("description") or "").strip()
    cover_image = str(request.form.get("coverImage") or "").strip()
    uploaded_cover = request.files.get("coverFile")
    uploaded_images = request.files.getlist("imageFiles")
    try:
        kept_image_options = json.loads(request.form.get("imageOptions") or "[]")
    except Exception:
        kept_image_options = []

    if not relative_path:
        return jsonify({"error": "Missing relativePath"}), 400

    game_path = resolve_game_path(relative_path)
    if not game_path or not os.path.isfile(game_path) or not is_game_rom_file(game_path):
        return jsonify({"error": "Game not found", "relativePath": relative_path}), 404

    normalized_relative_path = game_relative_path(os.path.basename(game_path))
    library = load_media_library()
    game_items = library.setdefault("games", {})
    current_item = (
        game_items.get(normalized_relative_path)
        if isinstance(game_items.get(normalized_relative_path), dict)
        else {}
    )
    previous_urls = unique_ordered_urls(
        [
            str(current_item.get("coverImage") or ""),
            *(
                current_item.get("imageOptions")
                if isinstance(current_item.get("imageOptions"), list)
                else []
            ),
        ]
    )

    uploaded_cover_image = save_uploaded_game_cover(uploaded_cover, normalized_relative_path)
    if uploaded_cover_image:
        cover_image = uploaded_cover_image

    new_extra_images = [
        save_uploaded_game_image(uploaded_image, normalized_relative_path, f"image-{index + int(time.time())}")
        for index, uploaded_image in enumerate(uploaded_images)
    ]
    final_image_options = unique_ordered_urls([cover_image, *kept_image_options, *new_extra_images])
    if cover_image and cover_image not in final_image_options:
        final_image_options.insert(0, cover_image)
    if not cover_image:
        cover_image = final_image_options[0] if final_image_options else game_cover_url(DEFAULT_GAME_COVER_FILENAME)
        final_image_options = unique_ordered_urls([cover_image, *final_image_options])

    item = upsert_game_metadata(
        normalized_relative_path,
        {
            "name": name or os.path.splitext(os.path.basename(game_path))[0],
            "description": description,
            "coverImage": cover_image,
            "imageOptions": final_image_options,
            "screenshots": [url for url in current_item.get("screenshots", []) if url in final_image_options],
        },
    )

    for previous_url in previous_urls:
        if previous_url not in final_image_options and previous_url != cover_image:
            remove_local_game_image_url(previous_url)

    return jsonify({"ok": True, "item": item, "libraryCounts": get_library_counts()})


@app.route("/games", methods=["DELETE"])
def delete_game():
    relative_path = str(request.args.get("relativePath") or "").strip().strip("/\\")
    if not relative_path:
        return jsonify({"error": "Missing relativePath"}), 400

    game_path = resolve_game_path(relative_path)
    if not game_path:
        return jsonify({"error": "Game must be inside Games"}), 400

    metadata = remove_game_metadata(game_relative_path(os.path.basename(game_path)))
    removed = False
    if os.path.exists(game_path):
        if os.path.isdir(game_path):
            return jsonify({"error": "Game path must be a file"}), 400
        os.remove(game_path)
        removed = True

    cover_image = str(metadata.get("coverImage") or "") if isinstance(metadata, dict) else ""
    image_options = (
        metadata.get("imageOptions")
        if isinstance(metadata, dict) and isinstance(metadata.get("imageOptions"), list)
        else []
    )
    for image_url in unique_ordered_urls([cover_image, *image_options]):
        remove_local_game_image_url(image_url)

    return jsonify({"ok": True, "relativePath": relative_path, "removed": removed, "libraryCounts": get_library_counts()})


WEB_EMULATOR_CORES = {
    "gb": "gb", "gbc": "gb", "gba": "gba", "nes": "nes", "snes": "snes",
    "mastersystem": "segaMS", "megadrive": "segaMD", "gamegear": "segaGG",
    "segacd": "segaCD", "pcengine": "pce", "pcenginecd": "pce",
    "neogeo": "arcade", "ngp": "ngp", "ngpc": "ngp", "wonderswan": "ws",
    "wonderswancolor": "ws", "atari2600": "atari2600", "atari7800": "atari7800",
    "atarilynx": "lynx", "psx": "psx", "arcade": "arcade", "n64": "n64",
}


@app.route("/emulatorjs/<path:filename>", methods=["GET"])
def emulatorjs_asset(filename):
    safe_name = os.path.normpath(str(filename or "").lstrip("/"))
    if safe_name.startswith(".."):
        return jsonify({"error": "Invalid emulator asset"}), 400

    if safe_name.startswith("cores/"):
        core_filename = os.path.basename(safe_name)
        if core_filename != safe_name.split("/", 1)[1]:
            return jsonify({"error": "Invalid emulator core"}), 400
        if os.path.isdir(EMULATORJS_PACKAGES_DIR):
            for package_name in os.listdir(EMULATORJS_PACKAGES_DIR):
                if not package_name.startswith("core-"):
                    continue
                candidate = os.path.join(EMULATORJS_PACKAGES_DIR, package_name, core_filename)
                if os.path.isfile(candidate):
                    return send_file(candidate, conditional=True)
        return jsonify({"error": "Emulator core not installed"}), 404

    return send_from_directory(EMULATORJS_DIR, safe_name, conditional=True)


@app.route("/games/content", methods=["GET"])
def browser_game_content():
    relative_path = str(request.args.get("relativePath") or "").strip().strip("/\\")
    game_path = resolve_game_path(relative_path)
    if not game_path or not os.path.isfile(game_path) or not is_game_rom_file(game_path):
        return jsonify({"error": "Game not found"}), 404
    return send_file(game_path, conditional=True, as_attachment=request.args.get("download") == "1")


@app.route("/games/browser", methods=["GET"])
def browser_game_player():
    relative_path = str(request.args.get("relativePath") or "").strip().strip("/\\")
    system_id = str(request.args.get("system") or "").strip().lower()
    game_path = resolve_game_path(relative_path)
    core = WEB_EMULATOR_CORES.get(system_id)
    if not game_path or not os.path.isfile(game_path) or not is_game_rom_file(game_path):
        return jsonify({"error": "Game not found"}), 404
    if not core:
        return jsonify({"error": "This system is not supported in the browser"}), 400
    if not os.path.isfile(os.path.join(EMULATORJS_DIR, "loader.js")):
        return jsonify({"error": "EmulatorJS is not installed. Run npm install in WebApp."}), 503

    pin = str(request.args.get("pin") or "")
    content_url = "/games/content?" + urllib.parse.urlencode({"relativePath": relative_path, "pin": pin})
    config = {
        "name": os.path.splitext(os.path.basename(game_path))[0],
        "url": content_url,
        "core": core,
    }
    config_json = json.dumps(config).replace("</", "<\\/")
    page = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{html.escape(os.path.basename(game_path))}</title>
<style>html,body,#game{{width:100%;height:100%;margin:0;background:#050505;overflow:hidden}}#game{{position:absolute;inset:0}}</style>
</head><body><div id="game"></div><script>
const game={config_json};
window.EJS_player="#game"; window.EJS_gameName=game.name; window.EJS_gameUrl=game.url;
window.EJS_core=game.core; window.EJS_pathtodata="/emulatorjs/"; window.EJS_startOnLoaded=true;
window.EJS_disableDatabases=false; window.EJS_threads=false; window.EJS_language="es-ES";
</script><script src="/emulatorjs/loader.js"></script></body></html>"""
    return Response(page, mimetype="text/html", headers={"Cache-Control": "no-store"})


@app.route("/games/play", methods=["POST"])
def play_game():
    data = request.get_json(force=True, silent=True) or {}
    relative_path = str(data.get("relativePath") or "").strip().strip("/\\")
    if not relative_path:
        return jsonify({"error": "Missing relativePath"}), 400

    game_path = resolve_game_path(relative_path)
    if not game_path or not os.path.isfile(game_path) or not is_game_rom_file(game_path):
        return jsonify({"error": "Game not found", "relativePath": relative_path}), 404

    with lock:
        hide_qr()
        stop_locked()
        write_menu_command(
            {
                "action": "play_game",
                "path": game_path,
            }
        )
        clear_playback_state()
        current["proc"] = None
        current["id"] = os.path.basename(game_path)
        current["directory"] = "Games"
        current["file"] = game_relative_path(os.path.basename(game_path))

    return jsonify(
        {
            "ok": True,
            "playing": os.path.basename(game_path),
            "directory": "Games",
            "file": game_relative_path(os.path.basename(game_path)),
        }
    )


@app.route("/media/subtitles", methods=["GET"])
def media_subtitle_info():
    target = resolve_relative_video_path(request.args.get("relativePath"), VIDEOS_DIR)
    root = os.path.realpath(VIDEOS_DIR)
    if (not target or not os.path.isfile(target) or not is_video_file(target)
            or os.path.commonpath([root, os.path.realpath(target)]) != root):
        return jsonify({"error": "Video not found"}), 404
    response = jsonify(movie_subtitles.inspect_subtitles(target, root))
    response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/movies/subtitles", methods=["POST"])
def upload_movie_subtitles():
    relative_path = str(request.form.get("relativePath") or "").strip()
    movie_path = resolve_relative_video_path(relative_path, MOVIES_DIR)
    if not movie_path or os.path.commonpath([os.path.realpath(movie_path), os.path.realpath(MOVIES_DIR)]) != os.path.realpath(MOVIES_DIR):
        return jsonify({"error": "Invalid movie path"}), 400
    if not is_supported_upload_file(movie_path) or not os.path.isfile(movie_path):
        return jsonify({"error": "Movie file not found"}), 404
    subtitle = request.files.get("file")
    if not subtitle or not str(subtitle.filename or "").lower().endswith(".srt"):
        return jsonify({"error": "Select an .srt subtitle file"}), 400
    content = subtitle.stream.read(5 * 1024 * 1024 + 1)
    if not content.strip() or len(content) > 5 * 1024 * 1024:
        return jsonify({"error": "Subtitle must be non-empty and no larger than 5 MB"}), 400
    subtitle_path = os.path.splitext(movie_path)[0] + ".srt"
    movie_subtitles.atomic_write(subtitle_path, content, mode=0o644)
    return jsonify({"ok": True, "file": os.path.basename(subtitle_path)})


@app.route("/settings/subtitles", methods=["GET", "POST"])
def subtitle_settings():
    try:
        if request.method == "POST":
            data = request.get_json(silent=True)
            if not isinstance(data, dict):
                return jsonify({"error": "Invalid settings"}), 400
            result = movie_subtitles.save_credentials(SUBTITLE_SETTINGS_PATH, data)
        else:
            result = movie_subtitles.credentials_status(movie_subtitles.load_credentials(SUBTITLE_SETTINGS_PATH))
        response = jsonify({"ok": True, **result, **movie_subtitles.load_credentials(SUBTITLE_SETTINGS_PATH)})
        response.headers["Cache-Control"] = "no-store"
        return response
    except movie_subtitles.SubtitleError as error:
        return jsonify({"error": error.code, "code": error.code}), error.status
    except OSError:
        return jsonify({"error": "Cannot save subtitle settings", "code": "SUBTITLE_SAVE_FAILED"}), 500


@app.route("/movies/subtitles/obtain", methods=["POST"])
def obtain_movie_subtitles():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid request"}), 400
    relative_path = str(data.get("relativePath") or "").strip()
    language = data.get("language", "es")
    if not isinstance(language, str) or language not in movie_subtitles.LANGUAGES:
        return jsonify({"error": "Unsupported subtitle language"}), 400
    movie_path = resolve_relative_video_path(relative_path, MOVIES_DIR)
    root = os.path.realpath(MOVIES_DIR)
    if not movie_path or os.path.commonpath([os.path.realpath(movie_path), root]) != root:
        return jsonify({"error": "Invalid movie path"}), 400
    if not is_supported_upload_file(movie_path) or not os.path.isfile(movie_path):
        return jsonify({"error": "Movie file not found", "code": "SUBTITLE_MOVIE_CHANGED"}), 404
    if not subtitle_download_lock.acquire(blocking=False):
        return jsonify({"error": "Subtitle download in progress", "code": "SUBTITLE_BUSY"}), 409
    try:
        # Use the saved profile for this file, never a client-supplied film ID.
        canonical_path = os.path.relpath(movie_path, VIDEOS_DIR).replace(os.sep, "/")
        metadata = load_movie_library().get(canonical_path, {})
        before = os.stat(movie_path)
        content, result = subtitle_provider.obtain(movie_path, metadata, language, movie_subtitles.load_credentials(SUBTITLE_SETTINGS_PATH))
        after = os.stat(movie_path)
        identity = lambda stat: (stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns)
        if identity(before) != identity(after) or os.path.commonpath([os.path.realpath(movie_path), root]) != root:
            raise movie_subtitles.SubtitleError("SUBTITLE_MOVIE_CHANGED", 409)
        subtitle_path = os.path.splitext(movie_path)[0] + ".srt"
        # Kodi may run as the desktop user while the API runs as root.
        movie_subtitles.atomic_write(subtitle_path, content, mode=0o644)
        return jsonify({"ok": True, "file": os.path.basename(subtitle_path), **result})
    except movie_subtitles.SubtitleError as error:
        return jsonify({"error": error.code, "code": error.code}), error.status
    except FileNotFoundError:
        return jsonify({"error": "Movie file not found", "code": "SUBTITLE_MOVIE_CHANGED"}), 409
    except OSError:
        return jsonify({"error": "Cannot save subtitle", "code": "SUBTITLE_SAVE_FAILED"}), 500
    finally:
        subtitle_download_lock.release()


@app.route("/movies", methods=["POST"])
def save_movie():
    data = request.get_json(force=True, silent=True) or {}
    relative_path = str(data.get("relativePath") or "").strip().strip("/\\")
    name = str(data.get("name") or "").strip()
    tmdb_id = int(data.get("tmdbId") or 0)
    if not relative_path:
        return jsonify({"error": "Missing relativePath"}), 400
    if not name:
        return jsonify({"error": "Missing name"}), 400
    if not tmdb_id:
        return jsonify({"error": "Missing tmdbId"}), 400

    movie_path = resolve_relative_video_path(relative_path, MOVIES_DIR)
    if not movie_path:
        return jsonify({"error": "Movie must be inside Movies"}), 400
    if not os.path.exists(movie_path):
        return jsonify({"error": "Movie file not found"}), 404

    item = upsert_movie_metadata(relative_path, name, tmdb_id, os.path.basename(movie_path))
    return jsonify({"ok": True, "item": item})


@app.route("/media/profile", methods=["POST"])
def save_media_profile():
    data = request.get_json(force=True, silent=True) or {}
    collection = str(data.get("collection") or "").strip().lower()
    relative_path = str(data.get("relativePath") or "").strip().strip("/\\")
    if collection not in {"series", "movies"}:
        return jsonify({"error": "Unsupported collection"}), 400
    if not relative_path:
        return jsonify({"error": "Missing relativePath"}), 400

    required_root = MOVIES_DIR if collection == "movies" else TVSHOWS_DIR
    media_path = resolve_relative_video_path(relative_path, required_root)
    if not media_path:
        return jsonify({"error": "Invalid media path"}), 400

    fields = ("name", "tmdbId", "file", "heroImage", "heroImageCrop", "imdbUrl", "rottenTomatoesUrl")
    item = upsert_media_profile(collection, relative_path, {key: data[key] for key in fields if key in data})
    return jsonify({"ok": True, "item": item})


@app.route("/movies/browser-backup", methods=["POST"])
def backup_browser_movie_library():
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict) or not isinstance(data.get("library"), list) or not isinstance(data.get("profiles"), dict):
        return jsonify({"error": "Invalid browser movie library"}), 400
    snapshot = {"library": data["library"], "profiles": data["profiles"]}
    if "seriesProfiles" in data:
        if not isinstance(data["seriesProfiles"], dict):
            return jsonify({"error": "Invalid browser series profiles"}), 400
        snapshot["seriesProfiles"] = data["seriesProfiles"]
    payload = json.dumps(snapshot, ensure_ascii=False, sort_keys=True)
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    backup_dir = os.path.join(MULTIMEDIA_DIR, "Recovery")
    os.makedirs(backup_dir, exist_ok=True)
    backup_path = os.path.join(backup_dir, f"browser-movies-{digest}.json")
    try:
        with open(backup_path, "x", encoding="utf-8") as handle:
            handle.write(payload)
    except FileExistsError:
        pass
    return jsonify({"ok": True, "backup": os.path.basename(backup_path), "movies": len(data["library"]), "profiles": len(data["profiles"])})


@app.route("/movies", methods=["DELETE"])
def delete_movie():
    relative_path = str(request.args.get("relativePath") or "").strip().strip("/\\")
    if not relative_path:
        return jsonify({"error": "Missing relativePath"}), 400

    movie_path = resolve_relative_video_path(relative_path, MOVIES_DIR)
    if not movie_path:
        return jsonify({"error": "Movie must be inside Movies"}), 400

    if not os.path.exists(movie_path):
        remove_movie_metadata(relative_path)
        return jsonify({"ok": True, "relativePath": relative_path, "removed": False})

    if os.path.isdir(movie_path):
        shutil.rmtree(movie_path)
    else:
        os.remove(movie_path)
        subtitle_path = os.path.splitext(movie_path)[0] + ".srt"
        if os.path.isfile(subtitle_path):
            os.remove(subtitle_path)
    remove_movie_metadata(relative_path)
    return jsonify({"ok": True, "relativePath": relative_path, "removed": True})


@app.route("/play", methods=["POST"])
def play():
    data = request.get_json(force=True, silent=True) or {}
    ep_id = (data.get("id") or "").upper().strip()
    directory = (data.get("directory") or "").strip()
    output = str(data.get("output") or "minitv").strip().lower()
    if not ep_id:
        return jsonify({"error": "Missing id"}), 400
    if output not in ("minitv", "external"):
        return jsonify({"error": "Invalid output"}), 400

    matches = []
    for entry in iter_video_entries():
        if entry["id"].upper() != ep_id:
            continue
        if directory and entry["directory_path"] != directory:
            continue
        matches.append(entry)

    if not directory and len(matches) > 1:
        return (
            jsonify(
                {
                    "error": "Episode is ambiguous, specify directory",
                    "id": ep_id,
                    "matches": [
                        {
                            "directory": match["directory"],
                            "directoryPath": match["directory_path"],
                            "relativePath": match["relative_path"],
                        }
                        for match in matches
                    ],
                }
            ),
            409,
        )

    match = matches[0] if matches else None
    if not match:
        payload = {"error": "Episode not found", "id": ep_id}
        if directory:
            payload["directory"] = directory
        return jsonify(payload), 404

    profile = playback_profile(data, match["relative_path"])
    start_seconds = data.get("startSeconds", 0)
    if isinstance(start_seconds, bool) or not isinstance(start_seconds, (int, float)) or not 0 <= start_seconds <= 100_000_000:
        raise ProfileError("Posición de reproducción no válida.")

    with lock:
        hide_qr()
        stop_locked()
        write_menu_command(
            {
                "action": "play",
                "path": match["full_path"],
                "id": ep_id,
                "directory": match["directory_path"],
                "file": match["relative_path"],
                "output": output,
                "startSeconds": start_seconds,
                "profile": profile,
            }
        )
        current["id"] = ep_id
        current["directory"] = match["directory_path"]
        current["file"] = match["relative_path"]

    return jsonify(
        {
            "ok": True,
            "queued": True,
            "playing": ep_id,
            "directory": match["directory_path"],
            "file": match["relative_path"],
            "output": output,
        }
    )


@app.route("/media/stream", methods=["GET"])
def stream_media():
    relative_path = str(request.args.get("relativePath") or "").strip().strip("/\\")
    if not relative_path:
        return jsonify({"error": "Missing relativePath"}), 400

    target_path = resolve_relative_video_path(relative_path, VIDEOS_DIR)
    if not target_path or not os.path.isfile(target_path) or not is_video_file(target_path):
        return jsonify({"error": "Video not found"}), 404

    if request.args.get("subtitles") == "1":
        subtitle_path = os.path.splitext(target_path)[0] + ".srt"
        root = os.path.realpath(VIDEOS_DIR)
        if os.path.commonpath([root, os.path.realpath(subtitle_path)]) != root:
            return jsonify({"error": "Subtitle not found"}), 404
        try:
            with open(subtitle_path, "rb") as subtitle:
                content = subtitle.read(movie_subtitles.MAX_SUBTITLE_BYTES + 1)
            vtt = movie_subtitles.srt_to_vtt(content)
        except FileNotFoundError:
            return jsonify({"error": "Subtitle not found"}), 404
        except (movie_subtitles.SubtitleError, UnicodeError):
            return jsonify({"error": "Invalid subtitle"}), 422
        return Response(vtt, content_type="text/vtt; charset=utf-8", headers={"Cache-Control": "no-store"})

    # conditional=True enables HTTP range requests, which browsers need for seeking.
    download = str(request.args.get("download") or "").strip().lower() in {"1", "true", "yes"}
    return send_file(
        target_path,
        conditional=True,
        as_attachment=download,
        download_name=os.path.basename(target_path),
    )


@app.route("/camera/capture", methods=["GET"])
def capture_camera():
    camera_command = shutil.which("rpicam-still") or shutil.which("libcamera-still")
    if not camera_command:
        return jsonify({"error": "Camera capture command is not available"}), 503

    capture_fd, capture_path = tempfile.mkstemp(prefix="minitv-camera-", suffix=".jpg")
    os.close(capture_fd)
    try:
        with camera_lock:
            completed = subprocess.run(
                [
                    camera_command,
                    "--nopreview",
                    "--timeout",
                    "800",
                    "--width",
                    "1280",
                    "--height",
                    "720",
                    "--output",
                    capture_path,
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                timeout=12,
                check=False,
            )
            if completed.returncode != 0 or not os.path.isfile(capture_path):
                return jsonify({"error": "Could not capture an image from the camera"}), 503
            with open(capture_path, "rb") as handle:
                image_data = handle.read()
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Camera capture timed out"}), 504
    except OSError:
        return jsonify({"error": "Could not capture an image from the camera"}), 503
    finally:
        try:
            os.remove(capture_path)
        except OSError:
            pass

    return send_file(
        io.BytesIO(image_data),
        mimetype="image/jpeg",
        download_name="camera.jpg",
        max_age=0,
    )


@app.route("/stop", methods=["POST"])
def stop():
    with lock:
        stop_locked()
        write_menu_command({"action": "stop"})
        current["proc"] = None
        current["id"] = None
        current["directory"] = None
        current["file"] = None
    return jsonify({"ok": True})


def checked_subtitle_command(*parts):
    response = send_mpv_command(*parts)
    if not isinstance(response, dict) or response.get("error") != "success":
        raise RuntimeError("subtitle_control_failed")
    return response.get("data")


@app.route("/playback/subtitles", methods=["POST"])
def control_playback_subtitles():
    data = request.get_json(silent=True) or {}
    action = data.get("action") if isinstance(data, dict) else None
    if action not in {"toggle", "next"}:
        return jsonify({"error": "Invalid subtitle action"}), 400
    with lock:
        tracks_response = send_mpv_command("get_property", "track-list")
        if isinstance(tracks_response, dict) and tracks_response.get("error") == "success":
            tracks = [track for track in tracks_response.get("data", []) if track.get("type") == "sub"]
            if not tracks:
                return jsonify({"error": "No selectable subtitles", "code": "subtitle_none"}), 409
            try:
                selected_id = checked_subtitle_command("get_property", "sid")
                visible = checked_subtitle_command("get_property", "sub-visibility")
                selected = next((track for track in tracks if track["id"] == selected_id), None)
                if action == "next":
                    index = tracks.index(selected) if selected else -1
                    selected = tracks[(index + 1) % len(tracks)]
                    checked_subtitle_command("set_property", "sid", selected["id"])
                    enabled = True
                else:
                    enabled = not (visible and selected is not None)
                    if enabled and selected is None:
                        selected = tracks[0]
                        checked_subtitle_command("set_property", "sid", selected["id"])
                checked_subtitle_command("set_property", "sub-visibility", enabled)
            except RuntimeError:
                return jsonify({"error": "Subtitle command failed", "code": "subtitle_control_failed"}), 503
            label = " · ".join(str(value) for value in (selected.get("lang"), selected.get("title")) if value) if selected else ""
            return jsonify({"ok": True, "enabled": enabled, "track": {
                "id": selected["id"], "label": label, "external": bool(selected.get("external"))
            } if selected else None})

        state = read_playback_state() or {}
        if state.get("backend") != "kodi" or not player_is_running(state):
            return jsonify({"error": "No controllable video playing", "code": "subtitle_not_playing"}), 409
        kodi_send = shutil.which("kodi-send")
        if not kodi_send:
            return jsonify({"error": "kodi-send not installed", "code": "subtitle_control_failed"}), 503
        # Kodi shows the selected language/visibility in its own on-screen display.
        kodi_action = "ShowSubtitles" if action == "toggle" else "NextSubtitle"
        try:
            result = subprocess.run([kodi_send, f"--action={kodi_action}"], capture_output=True, timeout=3, check=False)
        except (OSError, subprocess.TimeoutExpired):
            return jsonify({"error": "Kodi command failed", "code": "subtitle_control_failed"}), 503
        if result.returncode:
            return jsonify({"error": "Kodi command failed", "code": "subtitle_control_failed"}), 503
        return jsonify({"ok": True, "queued": True, "backend": "kodi"})


@app.route("/volume/up", methods=["POST"])
def volume_up():
    with lock:
        volume_up_locked()
    return jsonify({"ok": True})


@app.route("/volume/down", methods=["POST"])
def volume_down():
    with lock:
        volume_down_locked()
    return jsonify({"ok": True})


@app.route("/now", methods=["GET"])
def now():
    with lock:
        return jsonify(current_playback_status())


@app.route("/poweroff", methods=["POST"])
def poweroff():
    with lock:
        stop_locked()
    subprocess.Popen(
        ["shutdown", "-h", "now"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return jsonify({"ok": True, "shuttingDown": True})


@app.route("/ip", methods=["GET"])
def ip():
    return jsonify({"ip": get_local_ip(), "port": PORT})


@app.route("/web/auth", methods=["POST"])
def web_auth():
    data = request.get_json(force=True, silent=True) or {}
    submitted_pin = str(data.get("pin") or "").strip()
    if submitted_pin == current_web_pin():
        return jsonify({"ok": True})
    return jsonify({"error": "Invalid PIN"}), 401


@app.route("/settings/language", methods=["GET"])
def get_language():
    return jsonify({"ok": True, "language": current_language()})


@app.route("/settings/language", methods=["POST"])
def update_language():
    data = request.get_json(force=True, silent=True) or {}
    language = str(data.get("language") or "").strip().lower()
    if language == "cat":
        language = "ca"
    if language not in SUPPORTED_LANGUAGES:
        return jsonify({"error": "Unsupported language", "supported": sorted(SUPPORTED_LANGUAGES)}), 400

    settings = load_settings()
    settings["language"] = language
    save_settings(settings)
    return jsonify({"ok": True, "language": language})


@app.route("/settings/alarms", methods=["GET"])
def get_alarms():
    settings = load_settings()
    sounds = list_alarm_sounds()
    return jsonify({"ok": True, "alarms": normalize_alarms(settings.get("alarms")), "sounds": sounds})


@app.route("/settings/alarms", methods=["POST"])
def update_alarms():
    data = request.get_json(force=True, silent=True) or {}
    settings = load_settings()
    settings["alarms"] = normalize_alarms(data.get("alarms"))
    saved_settings = save_settings(settings)
    return jsonify({"ok": True, "alarms": saved_settings["alarms"], "sounds": list_alarm_sounds()})


@app.route("/settings/weather", methods=["GET"])
def get_weather_settings():
    settings = load_settings()
    location = settings.get("weather_location", "")
    details = settings.get("weather_location_details")
    if not isinstance(details, dict) or details.get("query") != location:
        details = None
    return jsonify({"ok": True, "location": location, "details": details})


@app.route("/settings/weather", methods=["POST"])
def update_weather_settings():
    data = request.get_json(force=True, silent=True) or {}
    location = str(data.get("location") or "").strip()[:120]
    settings = load_settings()
    settings["weather_location"] = location
    details = None
    if location:
        try:
            details = resolve_weather_location(location, settings.get("language"))
        except Exception:
            pass
    settings["weather_location_details"] = details
    saved_settings = save_settings(settings)
    return jsonify({"ok": True, "location": saved_settings["weather_location"], "details": details})


def tmdb_credentials():
    settings = load_settings()
    return {
        "apiKey": settings.get("tmdb_api_key") or os.environ.get("TMDB_API_KEY", "") or os.environ.get("VITE_TMDB_API_KEY", ""),
        "bearerToken": settings.get("tmdb_bearer_token") or os.environ.get("TMDB_BEARER_TOKEN", "") or os.environ.get("VITE_TMDB_BEARER_TOKEN", ""),
    }


tmdb_artwork = TmdbCache(os.path.join(MULTIMEDIA_DIR, "TmdbCache"), tmdb_credentials)
oscar_artwork = OscarCatalog(os.path.join(MULTIMEDIA_DIR, "TmdbCache", "Oscars"), tmdb_credentials)
award_artwork = {
    name: OscarCatalog(os.path.join(MULTIMEDIA_DIR, "TmdbCache", "Awards", name), tmdb_credentials,
                       os.path.join(BASE_DIR, "data", filename), cards_only=True)
    for name, filename in (("palme", "palme_dor.json"), ("goya", "goya_best_picture.json"))
}


def award_catalog(name):
    return oscar_artwork if name == "oscars" else award_artwork.get(name)


@app.route("/awards/<award>", methods=["GET"])
def awards_library(award):
    catalog = award_catalog(award)
    if catalog is None:
        return jsonify({"error": "Premio no encontrado"}), 404
    try:
        return jsonify(catalog.snapshot(request.args.get("language", "es-ES")))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@app.route("/awards/<award>/prepare", methods=["POST"])
def prepare_awards_library(award):
    catalog = award_catalog(award)
    if catalog is None:
        return jsonify({"error": "Premio no encontrado"}), 404
    try:
        return jsonify(catalog.prepare())
    except TmdbError as exc:
        return jsonify({"error": str(exc), "code": exc.code}), 503
    except OSError:
        return jsonify({"error": "No se pudo guardar la colección de premios."}), 500


@app.route("/awards/<award>/images/<filename>", methods=["GET"])
def award_image(award, filename):
    catalog = award_catalog(award)
    if catalog is None:
        return jsonify({"error": "Premio no encontrado"}), 404
    try:
        width = request.args.get("width")
        path = catalog.display_image("/" + filename, int(width) if width else None, local_only=True)
        return send_file(path, max_age=31536000, conditional=True)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except TmdbError as exc:
        return jsonify({"error": str(exc), "code": exc.code}), 409
    except OSError:
        return jsonify({"error": "No se pudo leer la imagen del premio."}), 500


@app.route("/oscars", methods=["GET"])
def oscar_library():
    try:
        return jsonify(oscar_artwork.snapshot(request.args.get("language", "es-ES")))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@app.route("/oscars/prepare", methods=["POST"])
def prepare_oscar_library():
    try:
        return jsonify(oscar_artwork.prepare())
    except TmdbError as exc:
        return jsonify({"error": str(exc), "code": exc.code}), 503
    except OSError:
        return jsonify({"error": "No se pudo guardar la colección Óscar. Revisa el espacio y los permisos del disco."}), 500


@app.route("/oscars/images/<filename>", methods=["GET"])
def oscar_image(filename):
    try:
        width = request.args.get("width")
        path = oscar_artwork.display_image("/" + filename, int(width) if width else None, local_only=True)
        return send_file(path, max_age=31536000, conditional=True)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except TmdbError as exc:
        return jsonify({"error": str(exc), "code": exc.code}), 409
    except OSError:
        return jsonify({"error": "No se pudo leer la imagen de la colección Óscar."}), 500


def queue_tmdb_artwork(kind, item, refresh=False):
    # A disk/network failure in artwork must not turn a successful video upload into a failure.
    try:
        tmdb_artwork.enqueue(kind, item.get("tmdbId"), item.get("heroImage", ""), refresh=refresh)
    except Exception:
        app.logger.exception("No se pudo encolar la descarga de imágenes TMDB")


@app.route("/tmdb/library", methods=["GET"])
def cached_tmdb_library():
    language = request.args.get("language", "es-ES")
    if language not in ("es-ES", "ca-ES", "en-US"):
        return jsonify({"error": "Idioma no permitido"}), 400
    library = load_media_library()
    result = {}
    for collection, kind in (("movies", "movie"), ("series", "tv")):
        ids = {int(item["tmdbId"]) for item in library.get(collection, {}).values() if item.get("tmdbId")}
        result[collection] = {}
        for tmdb_id in ids:
            summary = tmdb_artwork.library_summary(kind, tmdb_id, language)
            if kind == "movie" and not summary.get("name"):
                summary = oscar_artwork.library_summary(kind, tmdb_id, language)
            result[collection][str(tmdb_id)] = summary
    return jsonify(result)


@app.route("/tmdb/import/json/<path:tmdb_path>", methods=["GET"])
@app.route("/tmdb/json/<path:tmdb_path>", methods=["GET"])
def cached_tmdb_json(tmdb_path):
    try:
        try:
            data = tmdb_artwork.json("/" + tmdb_path, request.args.to_dict(), local_only=not (tmdb_path.startswith("search/") or request.path.startswith("/tmdb/import/")))
        except TmdbError as exc:
            if exc.code != "TMDB_LOCAL_MISSING" or not tmdb_path.startswith("movie/"):
                raise
            data = oscar_artwork.json("/" + tmdb_path, request.args.to_dict(), local_only=True)
        if request.args.get("level") == "cards" and re.fullmatch(r"tv/\d+/season/\d+", tmdb_path):
            data = {**data, "episodes": [{key: episode.get(key) for key in ("id", "episode_number", "name", "still_path", "air_date", "runtime")} for episode in data.get("episodes", [])]}
        return jsonify(data)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except TmdbError as exc:
        return jsonify({"error": str(exc), "code": exc.code}), 409 if exc.code == "TMDB_LOCAL_MISSING" else 503 if exc.code == "TMDB_CREDENTIALS_MISSING" else 502
    except OSError as exc:
        app.logger.warning("TMDB cache storage failed: %s errno=%s", type(exc).__name__, exc.errno)
        return jsonify({"error": "No se pudo leer o guardar la caché TMDB en la Raspberry. Revisa espacio y permisos del disco.", "code": "TMDB_STORAGE_ERROR"}), 500
    except Exception as exc:
        app.logger.warning("TMDB cache failed: %s", type(exc).__name__)
        return jsonify({"error": "No se pudo procesar la ficha TMDB en la Raspberry.", "code": "TMDB_CACHE_ERROR"}), 502


@app.route("/tmdb/images/<filename>", methods=["GET"])
def cached_tmdb_image(filename):
    try:
        width = request.args.get("width")
        try:
            path = tmdb_artwork.display_image("/" + filename, int(width) if width is not None else None, local_only=True)
        except TmdbError as exc:
            if exc.code != "TMDB_LOCAL_MISSING":
                raise
            path = oscar_artwork.display_image("/" + filename, int(width) if width is not None else None, local_only=True)
        return send_file(path, max_age=31536000, conditional=True)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except TmdbError as exc:
        return jsonify({"error": str(exc), "code": exc.code}), 409
    except Exception:
        return jsonify({"error": "No se pudo descargar la imagen de TMDB"}), 502


@app.route("/tmdb/import/images/<filename>", methods=["GET"])
def import_tmdb_preview(filename):
    """Explicit import/search previews, never used by library navigation."""
    try:
        return send_file(tmdb_artwork.display_image("/" + filename, int(request.args.get("width", 342))), max_age=31536000, conditional=True)
    except Exception:
        return jsonify({"error": "No se pudo preparar la vista previa"}), 502


def tmdb_missing_ids():
    library = load_media_library()
    scanned = scanned_media_paths
    if scanned.get("catalog") != MEDIA_LIBRARY_PATH:
        scanned = {}
    return [path for collection in ("movies", "series")
            for path in sorted(set(library.get(collection, {})) | set(scanned.get(collection, ())))
            if not library.get(collection, {}).get(path, {}).get("tmdbId")]


tmdb_cache_action_lock = threading.Lock()


@app.route("/tmdb/prepare", methods=["POST"])
def prepare_tmdb_title():
    data = request.get_json(silent=True) or {}
    kind, tmdb_id = data.get("kind"), data.get("id")
    if kind not in ("movie", "tv") or not str(tmdb_id).isdigit() or int(tmdb_id) <= 0:
        return jsonify({"error": "Título no válido"}), 400
    tmdb_artwork.enqueue(kind, tmdb_id)
    return jsonify(tmdb_artwork.status())


@app.route("/tmdb/cache", methods=["GET", "POST", "DELETE"])
def tmdb_cache_status():
    with tmdb_cache_action_lock:
        if request.method == "DELETE":
            tmdb_artwork.cancel()
        elif request.method == "POST":
            status = tmdb_artwork.status()
            if not (status["pending"] or status["running"]):
                library = load_media_library()
                for collection, kind in (("movies", "movie"), ("series", "tv")):
                    for item in library.get(collection, {}).values():
                        queue_tmdb_artwork(kind, item)
        tmdb_artwork.start()
        return jsonify({**tmdb_artwork.status(), "missingIds": tmdb_missing_ids(), "storage": tmdb_artwork.storage_background()})


@app.route("/settings/services/<provider>/test", methods=["POST"])
def test_service_credentials(provider):
    keys = {
        "tmdb": ("apiKey", "bearerToken"),
        "opensubtitles": ("apiKey", "username", "password"),
        "igdb": ("IGDB_CLIENT_ID", "IGDB_CLIENT_SECRET"),
        "screenscraper": tuple(key for key in GAME_SETTING_KEYS if key.startswith("SCREENSCRAPER_")),
        "youtube": ("YOUTUBE_API_KEY",),
    }
    data = request.get_json(silent=True)
    if provider not in keys or not isinstance(data, dict) or any(
        key not in keys[provider] or not isinstance(value, str) or len(value) > 2048
        for key, value in data.items()
    ):
        return jsonify({"error": "Invalid service credentials"}), 400
    try:
        if provider == "opensubtitles":
            credentials = {**movie_subtitles.load_credentials(SUBTITLE_SETTINGS_PATH), **data}
            if not credentials.get("apiKey") or (credentials.get("password") and not credentials.get("username")):
                return jsonify({"error": "Incomplete credentials"}), 400
            client = movie_subtitles.OpenSubtitles()
            base, token = client._login(credentials) if credentials.get("password") else ("https://api.opensubtitles.com/api/v1", "")
            payload = client._request(base + "/subtitles?tmdb_id=550&languages=en", credentials, token)
            valid = isinstance(payload.get("data"), list)
        elif provider == "tmdb":
            credentials = {**tmdb_credentials(), **data}
            if not any(credentials.values()):
                return jsonify({"error": "Incomplete credentials"}), 400
            headers = {"Accept": "application/json"}
            url = "https://api.themoviedb.org/3/movie/550"
            if credentials.get("bearerToken"):
                headers["Authorization"] = "Bearer " + credentials["bearerToken"]
            else:
                url += "?" + urllib.parse.urlencode({"api_key": credentials["apiKey"]})
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=20) as response:
                payload = json.load(response)
            valid = isinstance(payload, dict) and payload.get("id") == 550
        elif provider == "youtube":
            key = data.get("YOUTUBE_API_KEY", game_config_value("YOUTUBE_API_KEY"))
            if not key:
                return jsonify({"error": "Incomplete credentials"}), 400
            payload = youtube_search.search("The Simpsons official trailer", key, "en", use_cache=False)
            valid = payload.get("configured") and isinstance(payload.get("results"), list)
        else:
            config = lambda key: data[key] if key in data else game_config_value(key)
            service = GameMetadata(MULTIMEDIA_DIR, GAME_COVERS_DIR, config, "en")
            if not service.providers().get(provider):
                return jsonify({"error": "Incomplete credentials"}), 400
            if provider == "igdb":
                payload = service.request_json(provider, "games", 'search "Super Mario Bros"; fields id,name; limit 1;')
                valid = isinstance(payload, list)
            else:
                payload = service.request_json(provider, "jeuRecherche", {"recherche": "Super Mario Bros", "systemeid": 3})
                valid = isinstance(payload, dict) and isinstance(payload.get("response"), dict) and "jeux" in payload["response"]
        if not valid:
            return jsonify({"error": "Invalid service response"}), 502
        response = jsonify({"ok": True})
        response.headers["Cache-Control"] = "no-store"
        return response
    except (OSError, ValueError, TypeError, KeyError, MetadataError, movie_subtitles.SubtitleError, youtube_search.SearchError):
        # Never expose upstream URLs, which may contain API keys.
        return jsonify({"error": "Service test failed"}), 502


@app.route("/settings/tmdb", methods=["GET"])
def get_tmdb_settings():
    settings = load_settings()
    return jsonify({
        "ok": True,
        "apiKey": settings.get("tmdb_api_key") or os.environ.get("TMDB_API_KEY", "") or os.environ.get("VITE_TMDB_API_KEY", ""),
        "bearerToken": settings.get("tmdb_bearer_token") or os.environ.get("TMDB_BEARER_TOKEN", "") or os.environ.get("VITE_TMDB_BEARER_TOKEN", ""),
    })


@app.route("/settings/birthdays", methods=["GET"])
def get_birthdays_settings():
    return jsonify({"ok": True, "birthdays": normalize_birthdays(load_settings().get("birthdays"))})


@app.route("/settings/birthdays", methods=["POST"])
def update_birthdays_settings():
    data = request.get_json(force=True, silent=True) or {}
    settings = load_settings()
    settings["birthdays"] = normalize_birthdays(data.get("birthdays"))
    saved_settings = save_settings(settings)
    return jsonify({"ok": True, "birthdays": saved_settings["birthdays"]})


@app.route("/settings/tmdb", methods=["POST"])
def update_tmdb_settings():
    data = request.get_json(force=True, silent=True) or {}
    api_key = str(data.get("apiKey") or "").strip()[:256]
    bearer_token = str(data.get("bearerToken") or "").strip()[:2048]
    settings = load_settings()
    settings["tmdb_api_key"] = api_key
    settings["tmdb_bearer_token"] = bearer_token
    saved_settings = save_settings(settings)
    return jsonify({
        "ok": True,
        "apiKey": saved_settings["tmdb_api_key"],
        "bearerToken": saved_settings["tmdb_bearer_token"],
    })


@app.route("/alarm-sounds", methods=["GET"])
def alarm_sounds():
    return jsonify({"ok": True, "sounds": list_alarm_sounds()})


@app.route("/alarm-sounds/<path:filename>", methods=["GET"])
def alarm_sound_file(filename):
    safe_filename = normalize_alarm_sound(filename)
    if not safe_filename or safe_filename != filename:
        return jsonify({"error": "Invalid alarm sound"}), 400
    if safe_filename not in list_alarm_sounds():
        return jsonify({"error": "Alarm sound not found"}), 404
    return send_from_directory(ALARM_SOUNDS_DIR, safe_filename, mimetype="audio/mpeg")


@app.route("/health", methods=["GET"])
def health():
    with lock:
        playback = current_playback_status()
    return jsonify(
        {
            "ok": True,
            "ts": int(time.time()),
            "language": current_language(),
            "storage": get_storage_stats(),
            "libraryCounts": get_library_counts(),
            "playing": playback["playing"],
            "directory": playback["directory"],
            "file": playback["file"],
            "running": playback["running"],
        }
    )

if __name__ == "__main__":
    import faulthandler
    import signal
    faulthandler.register(signal.SIGUSR1, all_threads=True)
    ensure_media_directories()
    tmdb_artwork.start()
    oscar_artwork.start()
    for catalog in award_artwork.values():
        catalog.start()
    try:
        get_movie_torrents()
    except Exception:
        app.logger.exception("No se pudo recuperar la cola de torrents")
    app.run(host="0.0.0.0", port=PORT)
