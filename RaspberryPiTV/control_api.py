import json
import os
import re
import shutil
import socket
import subprocess
import threading
import time

from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(BASE_DIR)
MULTIMEDIA_DIR = os.path.join(REPO_DIR, "MultimediaContent")
VIDEOS_DIR = os.path.join(MULTIMEDIA_DIR, "Videos")
MOVIES_DIR = os.path.join(VIDEOS_DIR, "Movies")
TVSHOWS_DIR = os.path.join(VIDEOS_DIR, "TVShows")
WEB_DIST_DIR = os.path.join(REPO_DIR, "RaspberryPiWEB", "dist")
MEDIA_LIBRARY_PATH = os.path.join(MULTIMEDIA_DIR, "media_library.json")
LEGACY_MOVIE_LIBRARY_PATH = os.path.join(MULTIMEDIA_DIR, "movie_library.json")
EP_RE = re.compile(r"(S\d{2}E\d{2})", re.IGNORECASE)
PORT = 5050
QR_PNG = "/tmp/simpsonstv_qr.png"
USER_SETTINGS_PATH = os.path.join(BASE_DIR, "user_settings.json")
DEFAULT_SETTINGS = {
    "language": "en",
    "web_password": "1234",
}
SUPPORTED_LANGUAGES = {"en", "ca", "es"}

app = Flask(__name__)

lock = threading.Lock()
current = {"proc": None, "id": None, "directory": None, "file": None}
qr_proc = {"proc": None}
qr_visible = {"shown": False}


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
                    if key in settings and isinstance(value, str)
                }
            )
    except Exception:
        pass
    return settings


def current_web_pin():
    return load_settings().get("web_password", DEFAULT_SETTINGS["web_password"])


def current_language():
    language = load_settings().get("language", DEFAULT_SETTINGS["language"])
    return language if language in SUPPORTED_LANGUAGES else DEFAULT_SETTINGS["language"]


def save_settings(settings):
    safe_settings = dict(DEFAULT_SETTINGS)
    if isinstance(settings, dict):
        safe_settings.update(
            {
                key: value
                for key, value in settings.items()
                if key in safe_settings and isinstance(value, str)
            }
        )

    with open(USER_SETTINGS_PATH, "w", encoding="utf-8") as handle:
        json.dump(safe_settings, handle, ensure_ascii=False, indent=2)

    return safe_settings


def empty_media_library():
    return {
        "version": 1,
        "series": {},
        "movies": {},
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


def remove_movie_metadata(relative_path):
    safe_relative_path = str(relative_path or "").strip()
    if not safe_relative_path:
        return

    items = load_movie_library()
    if safe_relative_path in items:
        del items[safe_relative_path]
        save_movie_library(items)


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

    save_media_library(library)
    return library


def get_storage_stats():
    ensure_media_directories()
    target_path = VIDEOS_DIR if os.path.exists(VIDEOS_DIR) else BASE_DIR
    usage = shutil.disk_usage(target_path)
    total_gb = round(usage.total / (1024 ** 3), 1)
    used_gb = round((usage.total - usage.free) / (1024 ** 3), 1)
    percent = round(((usage.total - usage.free) / usage.total) * 100, 1) if usage.total else 0.0

    return {
        "path": target_path,
        "totalGb": total_gb,
        "usedGb": used_gb,
        "freeGb": round(usage.free / (1024 ** 3), 1),
        "percentUsed": percent,
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
    if request.path in {"/web/auth", "/ip"} or is_public_frontend_request():
        return None
    if is_authorized_request():
        return None
    return jsonify({"error": "Unauthorized"}), 401


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
        "mediaLibrary": media_library,
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

    subprocess.run(
        ["pkill", "-f", "omxplayer.bin"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    current["proc"] = None
    current["id"] = None
    current["directory"] = None
    current["file"] = None


def start_play_locked(filepath):
    current["proc"] = subprocess.Popen(
        ["omxplayer", "--no-osd", "--aspect-mode", "fill", filepath],
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def volume_up_locked():
    proc = current.get("proc")
    if proc and proc.poll() is None and proc.stdin:
        try:
            proc.stdin.write(b"+")
            proc.stdin.flush()
        except Exception:
            pass


def volume_down_locked():
    proc = current.get("proc")
    if proc and proc.poll() is None and proc.stdin:
        try:
            proc.stdin.write(b"-")
            proc.stdin.flush()
        except Exception:
            pass


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
        return jsonify({"error": "Missing file"}), 400
    if not is_supported_upload_file(uploaded_file.filename):
        return jsonify({"error": "Unsupported movie file"}), 400

    ensure_media_directories()
    original_filename = os.path.basename(uploaded_file.filename)
    original_extension = os.path.splitext(original_filename)[1]
    desired_base = name or os.path.splitext(original_filename)[0]
    target_filename = unique_media_filename(MOVIES_DIR, f"{desired_base}{original_extension}")
    target_path = os.path.join(MOVIES_DIR, target_filename)
    uploaded_file.save(target_path)

    relative_path = os.path.relpath(target_path, VIDEOS_DIR).replace("\\", "/")
    movie_item = upsert_movie_metadata(
        relative_path,
        name or os.path.splitext(original_filename)[0],
        tmdb_id,
        target_filename,
    )
    return jsonify(
        {
            "ok": True,
            "item": movie_item,
        }
    )


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
        start_play_locked(match["full_path"])
        current["id"] = ep_id
        current["directory"] = match["directory_path"]
        current["file"] = match["relative_path"]

    return jsonify(
        {
            "ok": True,
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
        running = current["proc"] is not None and current["proc"].poll() is None
        return jsonify(
            {
                "playing": current["id"],
                "directory": current["directory"],
                "file": current["file"],
                "running": running,
            }
        )


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
    if language not in SUPPORTED_LANGUAGES:
        return jsonify({"error": "Unsupported language", "supported": sorted(SUPPORTED_LANGUAGES)}), 400

    settings = load_settings()
    settings["language"] = language
    save_settings(settings)
    return jsonify({"ok": True, "language": language})


@app.route("/health", methods=["GET"])
def health():
    with lock:
        running = current["proc"] is not None and current["proc"].poll() is None
        return jsonify(
            {
                "ok": True,
                "ts": int(time.time()),
                "language": current_language(),
                "storage": get_storage_stats(),
                "playing": current["id"],
                "directory": current["directory"],
                "file": current["file"],
                "running": running,
            }
        )


if __name__ == "__main__":
    ensure_media_directories()
    app.run(host="0.0.0.0", port=PORT)
