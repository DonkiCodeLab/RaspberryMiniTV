import json
import os
import re
import shutil
import socket
import subprocess
import threading
import time
import tempfile
import urllib.parse
import urllib.request

from flask import Flask, jsonify, request, send_from_directory

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
GAME_COVERS_DIR = os.path.join(MULTIMEDIA_DIR, "GameCovers")
WEB_DIST_DIR = os.path.join(REPO_DIR, "WebApp", "dist")
MEDIA_LIBRARY_PATH = os.path.join(MULTIMEDIA_DIR, "media_library.json")
LEGACY_MOVIE_LIBRARY_PATH = os.path.join(MULTIMEDIA_DIR, "movie_library.json")
EP_RE = re.compile(r"(S\d{2}E\d{2})", re.IGNORECASE)
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
GAME_ROM_EXTENSIONS = {".gb", ".gbc", ".gba"}
GAME_PLATFORM_BY_EXTENSION = {
    ".gb": {"id": "gameboy", "name": "Game Boy", "screenScraperSystemId": 9},
    ".gbc": {"id": "gameboy_color", "name": "Game Boy Color", "screenScraperSystemId": 10},
    ".gba": {"id": "gameboy_advance", "name": "Game Boy Advance", "screenScraperSystemId": 12},
}
DEFAULT_GAME_COVER_FILENAME = "default-game-cover.svg"
DEFAULT_ALARMS = [
    {"id": 1, "enabled": False, "time": "07:30", "sound": ""},
    {"id": 2, "enabled": False, "time": "08:00", "sound": ""},
    {"id": 3, "enabled": False, "time": "08:30", "sound": ""},
]
DEFAULT_SETTINGS = {
    "language": "en",
    "web_password": "1234",
    "alarms": DEFAULT_ALARMS,
}
SUPPORTED_LANGUAGES = {"en", "ca", "es"}

app = Flask(__name__)

lock = threading.Lock()
current = {"proc": None, "id": None, "directory": None, "file": None}
qr_proc = {"proc": None}
qr_visible = {"shown": False}


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
                    if key in {"language", "web_password"} and isinstance(value, str)
                }
            )
            settings["alarms"] = normalize_alarms(loaded.get("alarms"))
    except Exception:
        pass
    settings["language"] = normalize_language_code(settings.get("language"))
    return settings


def current_web_pin():
    return load_settings().get("web_password", DEFAULT_SETTINGS["web_password"])


def current_language():
    return normalize_language_code(load_settings().get("language"))


def save_settings(settings):
    safe_settings = dict(DEFAULT_SETTINGS)
    if isinstance(settings, dict):
        safe_settings.update(
            {
                key: value
                for key, value in settings.items()
                if key in {"language", "web_password"} and isinstance(value, str)
            }
        )
        safe_settings["alarms"] = normalize_alarms(settings.get("alarms"))
    safe_settings["language"] = normalize_language_code(safe_settings.get("language"))

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
    }


def load_media_library():
    library = empty_media_library()
    try:
        with open(MEDIA_LIBRARY_PATH, "r", encoding="utf-8") as handle:
            loaded = json.load(handle)
        if isinstance(loaded, dict):
            library.update(
                {
                    "version": int(loaded.get("version") or 1),
                    "series": loaded.get("series") if isinstance(loaded.get("series"), dict) else {},
                    "movies": loaded.get("movies") if isinstance(loaded.get("movies"), dict) else {},
                    "games": loaded.get("games") if isinstance(loaded.get("games"), dict) else {},
                }
            )
    except Exception:
        pass

    if not library.get("movies") and os.path.exists(LEGACY_MOVIE_LIBRARY_PATH):
        try:
            with open(LEGACY_MOVIE_LIBRARY_PATH, "r", encoding="utf-8") as handle:
                legacy_movies = json.load(handle)
            if isinstance(legacy_movies, dict):
                library["movies"] = legacy_movies
        except Exception:
            pass
    return library


def save_media_library(library):
    ensure_media_directories()
    current = empty_media_library()
    if isinstance(library, dict):
        current.update(
            {
                "version": int(library.get("version") or 1),
                "series": library.get("series") if isinstance(library.get("series"), dict) else {},
                "movies": library.get("movies") if isinstance(library.get("movies"), dict) else {},
                "games": library.get("games") if isinstance(library.get("games"), dict) else {},
            }
        )

    with open(MEDIA_LIBRARY_PATH, "w", encoding="utf-8") as handle:
        json.dump(current, handle, ensure_ascii=False, indent=2)

    return current


def load_movie_library():
    return load_media_library().get("movies", {})


def save_movie_library(items):
    library = load_media_library()
    safe_items = {}
    if isinstance(items, dict):
        for relative_path, item in items.items():
            safe_relative_path = str(relative_path or "").strip()
            if not safe_relative_path or not isinstance(item, dict):
                continue
            safe_items[safe_relative_path] = {
                "relativePath": safe_relative_path,
                "name": str(item.get("name") or "").strip(),
                "tmdbId": int(item.get("tmdbId") or 0),
                "file": str(item.get("file") or "").strip(),
                "heroImage": str(item.get("heroImage") or "").strip(),
                "heroImageCrop": item.get("heroImageCrop") if isinstance(item.get("heroImageCrop"), dict) else None,
            }

    library["movies"] = safe_items
    save_media_library(library)
    return safe_items


def upsert_movie_metadata(relative_path, name, tmdb_id, filename=""):
    safe_relative_path = str(relative_path or "").strip()
    if not safe_relative_path:
        return None

    items = load_movie_library()
    item = {
        "relativePath": safe_relative_path,
        "name": str(name or "").strip(),
        "tmdbId": int(tmdb_id or 0),
        "file": str(filename or os.path.basename(safe_relative_path)).strip(),
    }
    items[safe_relative_path] = item
    save_movie_library(items)
    return item


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


def remove_movie_metadata(relative_path):
    safe_relative_path = str(relative_path or "").strip()
    if not safe_relative_path:
        return

    items = load_movie_library()
    if safe_relative_path in items:
        del items[safe_relative_path]
        save_movie_library(items)


def normalize_game_platform(filename_or_extension):
    extension = os.path.splitext(str(filename_or_extension or "").strip())[1].lower()
    if not extension and str(filename_or_extension or "").startswith("."):
        extension = str(filename_or_extension).lower()
    return GAME_PLATFORM_BY_EXTENSION.get(extension)


def is_game_rom_file(filename):
    return normalize_game_platform(filename) is not None


def game_relative_path(filename):
    safe_filename = os.path.basename(str(filename or "").strip())
    return f"Games/{safe_filename}" if safe_filename else ""


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


def normalize_cover_filename(relative_path):
    slug = slugify(os.path.splitext(os.path.basename(relative_path))[0], "game")
    return f"{slug}.jpg"


def upsert_game_metadata(relative_path, updates):
    safe_relative_path = str(relative_path or "").strip()
    if not safe_relative_path:
        return None

    library = load_media_library()
    game_items = library.setdefault("games", {})
    current_item = game_items.get(safe_relative_path) if isinstance(game_items.get(safe_relative_path), dict) else {}
    filename = os.path.basename(safe_relative_path)
    platform = normalize_game_platform(filename) or {}
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
    if "source" in updates:
        item["source"] = str(updates.get("source") or "").strip()

    game_items[safe_relative_path] = item
    save_media_library(library)
    return item


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

    collection_items[safe_key] = item
    save_media_library(library)
    return item


def sync_scanned_media_library(tvshow_directories, movie_directories, movie_root_files):
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
                "source": current_item.get("source") or "scan",
            }

    save_media_library(library)
    return library


def get_storage_stats():
    ensure_media_directories()
    target_path = VIDEOS_DIR if os.path.exists(VIDEOS_DIR) else BASE_DIR
    usage = shutil.disk_usage(target_path)
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


def web_dist_available():
    return os.path.isdir(WEB_DIST_DIR) and os.path.isfile(os.path.join(WEB_DIST_DIR, "index.html"))


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
    return submitted_pin == current_web_pin()


@app.before_request
def require_web_pin():
    if (
        request.path in {"/web/auth", "/ip", "/favicon.ico"}
        or request.path.startswith("/alarm-sounds")
        or request.path.startswith("/game-covers")
        or is_public_frontend_request()
    ):
        return None
    if is_authorized_request():
        return None
    return jsonify({"error": "Unauthorized"}), 401


@app.route("/favicon.ico", methods=["GET"])
def favicon():
    return ("", 204)


def get_local_ip():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        sock.close()


def is_video_file(filename):
    return filename.lower().endswith((".mp4", ".m4v", ".mov", ".mkv"))


def is_supported_upload_file(filename):
    return is_video_file(filename)


def ensure_media_directories():
    os.makedirs(MOVIES_DIR, exist_ok=True)
    os.makedirs(TVSHOWS_DIR, exist_ok=True)
    os.makedirs(GAMES_DIR, exist_ok=True)
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


def get_library_counts():
    ensure_media_directories()
    usage = shutil.disk_usage(VIDEOS_DIR if os.path.exists(VIDEOS_DIR) else BASE_DIR)
    multimedia_bytes = get_directory_size(MULTIMEDIA_DIR)
    multimedia_capacity_bytes = (usage.free or 0) + multimedia_bytes
    series_bytes = get_directory_size(TVSHOWS_DIR)
    movies_bytes = get_directory_size(MOVIES_DIR)
    games_bytes = get_directory_size(GAMES_DIR)

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
        items.append(
            {
                "name": str(metadata.get("name") or os.path.splitext(entry_name)[0]).strip(),
                "file": entry_name,
                "relativePath": relative_path,
                "platform": str(metadata.get("platform") or platform.get("id", "")).strip(),
                "platformName": str(metadata.get("platformName") or platform.get("name", "")).strip(),
                "description": str(metadata.get("description") or "").strip(),
                "coverImage": cover_image,
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


def screen_scraper_credentials():
    dev_id = get_config_value("SCREENSCRAPER_DEV_ID")
    dev_password = get_config_value("SCREENSCRAPER_DEV_PASSWORD")
    softname = get_config_value("SCREENSCRAPER_SOFTNAME", "MiniTV")
    username = get_config_value("SCREENSCRAPER_USER")
    password = get_config_value("SCREENSCRAPER_PASSWORD")
    if not dev_id or not dev_password:
        return None
    credentials = {
        "devid": dev_id,
        "devpassword": dev_password,
        "softname": softname,
        "output": "json",
    }
    if username and password:
        credentials["ssid"] = username
        credentials["sspassword"] = password
    return credentials


def pick_localized_value(values, language=None):
    if not isinstance(values, list):
        return ""
    language = language or current_language()
    preferred = [language, "es", "en", "fr"]
    for preferred_language in preferred:
        for entry in values:
            if not isinstance(entry, dict):
                continue
            if str(entry.get("region") or entry.get("langue") or "").lower() == preferred_language:
                return str(entry.get("text") or "").strip()
    for entry in values:
        if isinstance(entry, dict) and entry.get("text"):
            return str(entry.get("text") or "").strip()
    return ""


def extract_screen_scraper_media(medias):
    covers = []
    if not isinstance(medias, list):
        return covers
    preferred_types = {"box-2D", "box-2d", "box-texture", "mixrbv2", "screenshot"}
    for media in medias:
        if not isinstance(media, dict):
            continue
        media_type = str(media.get("type") or "").strip()
        url = str(media.get("url") or media.get("url2") or "").strip()
        if not url:
            continue
        if preferred_types and media_type not in preferred_types:
            continue
        covers.append(
            {
                "id": f"{media_type}:{len(covers)}",
                "type": media_type or "image",
                "url": url,
                "label": media_type or "Cover",
            }
        )
    return covers[:8]


def normalize_screen_scraper_game(raw_game):
    if not isinstance(raw_game, dict):
        return None
    game_id = raw_game.get("id") or raw_game.get("idjeu") or 0
    names = raw_game.get("noms") if isinstance(raw_game.get("noms"), list) else []
    name = pick_localized_value(names) or str(raw_game.get("nom") or raw_game.get("name") or "").strip()
    if not name:
        return None
    description = pick_localized_value(raw_game.get("synopsis"))
    covers = extract_screen_scraper_media(raw_game.get("medias"))
    return {
        "id": int(game_id or 0),
        "name": name,
        "description": description,
        "covers": covers,
        "source": "screenscraper",
    }


def search_screen_scraper_games(query, platform):
    credentials = screen_scraper_credentials()
    if not credentials:
        return [], False
    params = dict(credentials)
    params.update(
        {
            "recherche": query,
            "systemeid": str(platform.get("screenScraperSystemId")),
        }
    )
    url = "https://api.screenscraper.fr/api2/jeuRecherche.php?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=12) as response:
        payload = json.loads(response.read().decode("utf-8"))
    raw_games = payload.get("response", {}).get("jeux", [])
    if isinstance(raw_games, dict):
        raw_games = [raw_games]
    games = [normalize_screen_scraper_game(game) for game in raw_games if isinstance(game, dict)]
    return [game for game in games if game], True


def download_game_cover(cover_url, relative_path):
    if not cover_url:
        return ""
    ensure_media_directories()
    target_filename = normalize_cover_filename(relative_path)
    target_path = os.path.join(GAME_COVERS_DIR, target_filename)
    try:
        request_object = urllib.request.Request(cover_url, headers={"User-Agent": "MiniTV/1.0"})
        with urllib.request.urlopen(request_object, timeout=20) as response:
            data = response.read()
        if not data:
            return ""
        with open(target_path, "wb") as handle:
            handle.write(data)
        return game_cover_url(target_filename)
    except Exception:
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
    season_number = int(media_id[1:3]) if EP_RE.fullmatch(media_id) else None
    episode_number = int(media_id[4:6]) if EP_RE.fullmatch(media_id) else None
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
    }


def send_mpv_command(*command_parts):
    if not os.path.exists(MPV_SOCKET_PATH):
        return None

    payload = json.dumps({"command": list(command_parts)}).encode("utf-8") + b"\n"
    client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    client.settimeout(1.0)
    try:
        client.connect(MPV_SOCKET_PATH)
        client.sendall(payload)
        data = b""
        while not data.endswith(b"\n"):
            chunk = client.recv(65536)
            if not chunk:
                break
            data += chunk
        if not data:
            return None
        return json.loads(data.decode("utf-8").strip())
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

    if mpv_is_running():
        state = read_playback_state() or {}
        return {
            "playing": state.get("playing"),
            "directory": state.get("directory") or "",
            "file": state.get("file") or "",
            "running": True,
        }

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

    return {
        "ok": True,
        "root": VIDEOS_DIR,
        "moviesRoot": MOVIES_DIR,
        "tvShowsRoot": TVSHOWS_DIR,
        "gamesRoot": GAMES_DIR,
        "libraryCounts": get_library_counts(),
        "mediaLibrary": media_library,
        "games": list_game_entries(),
        "directories": tvshow_directories,
        "rootFiles": tvshow_root_files,
        "movieDirectories": movie_directories,
        "movieRootFiles": movie_root_files,
    }


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
    return send_from_directory(WEB_DIST_DIR, "index.html")


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

    return send_from_directory(WEB_DIST_DIR, "index.html")


@app.route("/episodes", methods=["GET"])
def episodes():
    directory = request.args.get("directory", default="", type=str).strip() or None
    return jsonify(list_episodes(directory=directory))


@app.route("/videos", methods=["GET"])
def videos():
    return jsonify(list_video_directories())


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


@app.route("/games/search", methods=["GET"])
def search_games():
    query = str(request.args.get("query") or "").strip()
    extension = str(request.args.get("extension") or "").strip().lower()
    platform = normalize_game_platform(extension if extension.startswith(".") else f".{extension}")
    if not query:
        return jsonify({"ok": True, "configured": bool(screen_scraper_credentials()), "results": []})
    if not platform:
        return jsonify({"error": "Unsupported game platform"}), 400

    try:
        results, configured = search_screen_scraper_games(query, platform)
    except Exception as exc:
        return jsonify(
            {
                "ok": False,
                "configured": bool(screen_scraper_credentials()),
                "results": [],
                "error": str(exc),
            }
        ), 502

    return jsonify(
        {
            "ok": True,
            "configured": configured,
            "platform": platform,
            "results": results,
            "defaultCover": game_cover_url(DEFAULT_GAME_COVER_FILENAME),
        }
    )


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
        return jsonify({"ok": True, "relativePath": relative_path, "removed": False})

    shutil.rmtree(series_path)
    library = load_media_library()
    series_items = library.setdefault("series", {})
    if relative_path in series_items:
        del series_items[relative_path]
        save_media_library(library)
    return jsonify({"ok": True, "relativePath": relative_path, "removed": True})


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
    target_filename = unique_media_filename(MOVIES_DIR, f"{desired_base}{original_extension}")
    target_path = os.path.join(MOVIES_DIR, target_filename)
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


@app.route("/series/upload", methods=["POST"])
def upload_series():
    uploaded_files = request.files.getlist("files")
    name = str(request.form.get("name") or "").strip()
    directory_name = str(request.form.get("directoryName") or name).strip()
    tmdb_id = int(request.form.get("tmdbId") or 0)
    hero_image = str(request.form.get("heroImage") or "").strip()
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

    for entry in normalized_files:
        target_filename = os.path.basename(entry["filename"])
        target_path = os.path.join(target_dir, target_filename)
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
    return jsonify({"ok": True, "item": item})


@app.route("/games/upload", methods=["POST"])
def upload_game():
    uploaded_file = request.files.get("file")
    name = str(request.form.get("name") or "").strip()
    description = str(request.form.get("description") or "").strip()
    cover_url = str(request.form.get("coverUrl") or "").strip()
    source = str(request.form.get("source") or "manual").strip()
    try:
        screen_scraper_id = int(request.form.get("screenScraperId") or 0)
    except Exception:
        screen_scraper_id = 0

    if not uploaded_file or not uploaded_file.filename:
        return jsonify({"error": "Missing file"}), 400
    if not is_game_rom_file(uploaded_file.filename):
        return jsonify({"error": "Unsupported game file"}), 400

    ensure_media_directories()
    original_filename = os.path.basename(uploaded_file.filename)
    original_extension = os.path.splitext(original_filename)[1].lower()
    desired_base = name or os.path.splitext(original_filename)[0]
    target_filename = unique_media_filename(GAMES_DIR, f"{desired_base}{original_extension}")
    target_path = os.path.join(GAMES_DIR, target_filename)
    uploaded_file.save(target_path)

    relative_path = game_relative_path(target_filename)
    cover_image = download_game_cover(cover_url, relative_path) if cover_url else ""
    if not cover_image:
        cover_image = game_cover_url(DEFAULT_GAME_COVER_FILENAME)
    item = upsert_game_metadata(
        relative_path,
        {
            "name": name or os.path.splitext(original_filename)[0],
            "description": description,
            "coverImage": cover_image,
            "screenScraperId": screen_scraper_id,
            "source": source,
        },
    )
    return jsonify({"ok": True, "item": item, "libraryCounts": get_library_counts()})


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

    item = upsert_media_profile(
        collection,
        relative_path,
        {
            "name": data.get("name"),
            "tmdbId": data.get("tmdbId"),
            "file": data.get("file"),
            "heroImage": data.get("heroImage"),
            "heroImageCrop": data.get("heroImageCrop"),
        },
    )
    return jsonify({"ok": True, "item": item})


@app.route("/movies", methods=["DELETE"])
def delete_movie():
    relative_path = str(request.args.get("relativePath") or "").strip().strip("/\\")
    if not relative_path:
        return jsonify({"error": "Missing relativePath"}), 400

    movie_path = resolve_relative_video_path(relative_path, MOVIES_DIR)
    if not movie_path:
        return jsonify({"error": "Movie must be inside Movies"}), 400

    if not os.path.exists(movie_path):
        return jsonify({"ok": True, "relativePath": relative_path, "removed": False})

    if os.path.isdir(movie_path):
        shutil.rmtree(movie_path)
    else:
        os.remove(movie_path)
    remove_movie_metadata(relative_path)
    return jsonify({"ok": True, "relativePath": relative_path, "removed": True})


@app.route("/play", methods=["POST"])
def play():
    data = request.get_json(force=True, silent=True) or {}
    ep_id = (data.get("id") or "").upper().strip()
    directory = (data.get("directory") or "").strip()
    if not ep_id:
        return jsonify({"error": "Missing id"}), 400

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
        }
    )


@app.route("/stop", methods=["POST"])
def stop():
    with lock:
        stop_locked()
    return jsonify({"ok": True})


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
    ensure_media_directories()
    app.run(host="0.0.0.0", port=PORT)
