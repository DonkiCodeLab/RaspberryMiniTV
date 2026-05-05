import os
import re
import socket
import subprocess
import threading
import time
import json

from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(BASE_DIR)
VIDEOS_DIR = os.path.join(BASE_DIR, "videos")
WEB_DIST_DIR = os.path.join(REPO_DIR, "RaspberryPiWEB", "dist")
EP_RE = re.compile(r"(S\d{2}E\d{2})", re.IGNORECASE)
PORT = 5050
QR_PNG = "/tmp/simpsonstv_qr.png"
USER_SETTINGS_PATH = os.path.join(BASE_DIR, "user_settings.json")
SERIES_LIBRARY_PATH = os.path.join(BASE_DIR, "web_series_library.json")
DEFAULT_SETTINGS = {
    "language": "en",
    "web_password": "1234",
}

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


def slugify_series_name(value):
    slug = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")
    return slug or "serie"


def normalize_series_label(value):
    return re.sub(r"[^a-z0-9]+", "", str(value or "").strip().lower())


def load_series_library():
    try:
        with open(SERIES_LIBRARY_PATH, "r", encoding="utf-8") as handle:
            loaded = json.load(handle)
        if not isinstance(loaded, list):
            return []
    except Exception:
        return []

    items = []
    for entry in loaded:
        if not isinstance(entry, dict):
            continue

        tmdb_id = entry.get("tmdbId")
        try:
            tmdb_id = int(tmdb_id)
        except Exception:
            tmdb_id = None

        name = str(entry.get("name") or "").strip()
        relative_path = str(entry.get("relativePath") or "").strip()
        if not tmdb_id or not name or not relative_path:
            continue

        items.append(
            {
                "tmdbId": tmdb_id,
                "name": name,
                "relativePath": relative_path.replace("\\", "/"),
            }
        )

    return items


def save_series_library(items):
    safe_items = []
    for entry in items:
        if not isinstance(entry, dict):
            continue
        try:
            tmdb_id = int(entry.get("tmdbId"))
        except Exception:
            continue

        name = str(entry.get("name") or "").strip()
        relative_path = str(entry.get("relativePath") or "").strip().replace("\\", "/")
        if not name or not relative_path:
            continue

        safe_items.append(
            {
                "tmdbId": tmdb_id,
                "name": name,
                "relativePath": relative_path,
            }
        )

    with open(SERIES_LIBRARY_PATH, "w", encoding="utf-8") as handle:
        json.dump(safe_items, handle, indent=2, ensure_ascii=False)

    return safe_items


def create_unique_series_relative_path(name, existing_paths):
    base_slug = slugify_series_name(name)
    candidate = base_slug
    suffix = 2

    while candidate in existing_paths:
        candidate = f"{base_slug}-{suffix}"
        suffix += 1

    return candidate


def upsert_series_library_entry(name, tmdb_id):
    library = load_series_library()
    existing_paths = {entry["relativePath"] for entry in library}
    normalized_name = normalize_series_label(name)

    for entry in library:
        if entry["tmdbId"] == tmdb_id:
            entry["name"] = name
            return save_series_library(library), entry

    for entry in library:
        if normalize_series_label(entry["name"]) == normalized_name:
            entry["name"] = name
            entry["tmdbId"] = tmdb_id
            return save_series_library(library), entry

    relative_path = create_unique_series_relative_path(name, existing_paths)
    entry = {
        "tmdbId": tmdb_id,
        "name": name,
        "relativePath": relative_path,
    }
    library.append(entry)
    return save_series_library(library), entry


def remove_series_library_entry(relative_path):
    safe_relative_path = str(relative_path or "").strip().replace("\\", "/")
    if not safe_relative_path:
        return load_series_library(), False

    library = load_series_library()
    next_library = [entry for entry in library if entry["relativePath"] != safe_relative_path]
    removed = len(next_library) != len(library)

    if removed:
        save_series_library(next_library)

    return next_library, removed


def current_web_pin():
    return load_settings().get("web_password", DEFAULT_SETTINGS["web_password"])


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


def iter_video_entries():
    if not os.path.isdir(VIDEOS_DIR):
        return []

    items = []

    for entry_name in sorted(os.listdir(VIDEOS_DIR)):
        full_entry = os.path.join(VIDEOS_DIR, entry_name)

        if os.path.isdir(full_entry):
            for root, _dirs, files in os.walk(full_entry):
                rel_root = os.path.relpath(root, VIDEOS_DIR)
                for filename in sorted(files):
                    if not is_video_file(filename):
                        continue

                    full_path = os.path.join(root, filename)
                    relative_path = os.path.relpath(full_path, VIDEOS_DIR)
                    match = EP_RE.search(filename)
                    episode_id = match.group(1).upper() if match else os.path.splitext(filename)[0].upper()
                    season_number = int(episode_id[1:3]) if EP_RE.fullmatch(episode_id) else None
                    episode_number = int(episode_id[4:6]) if EP_RE.fullmatch(episode_id) else None

                    items.append(
                        {
                            "id": episode_id,
                            "file": filename,
                            "directory": entry_name,
                            "directory_path": rel_root.replace("\\", "/"),
                            "relative_path": relative_path.replace("\\", "/"),
                            "full_path": full_path,
                            "season_number": season_number,
                            "episode_number": episode_number,
                        }
                    )
            continue

        if not is_video_file(entry_name):
            continue

        match = EP_RE.search(entry_name)
        episode_id = match.group(1).upper() if match else os.path.splitext(entry_name)[0].upper()
        season_number = int(episode_id[1:3]) if EP_RE.fullmatch(episode_id) else None
        episode_number = int(episode_id[4:6]) if EP_RE.fullmatch(episode_id) else None
        items.append(
            {
                "id": episode_id,
                "file": entry_name,
                "directory": None,
                "directory_path": "",
                "relative_path": entry_name,
                "full_path": os.path.join(VIDEOS_DIR, entry_name),
                "season_number": season_number,
                "episode_number": episode_number,
            }
        )

    return items


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
    grouped = {}
    root_files = []

    for entry in iter_video_entries():
        if not entry["directory"]:
            root_files.append(
                {
                    "id": entry["id"],
                    "file": entry["file"],
                    "relativePath": entry["relative_path"],
                    "seasonNumber": entry["season_number"],
                    "episodeNumber": entry["episode_number"],
                }
            )
            continue

        bucket = grouped.setdefault(
            entry["directory_path"],
            {
                "name": entry["directory"],
                "relativePath": entry["directory_path"],
                "tmdbId": None,
                "videos": [],
            },
        )
        bucket["videos"].append(
            {
                "id": entry["id"],
                "file": entry["file"],
                "relativePath": entry["relative_path"],
                "seasonNumber": entry["season_number"],
                "episodeNumber": entry["episode_number"],
            }
        )

    directories = []
    for relative_path, bucket in sorted(grouped.items()):
        videos = sorted(
            bucket["videos"],
            key=lambda video: (video["seasonNumber"] or 0, video["episodeNumber"] or 0, video["file"]),
        )
        directories.append(
            {
                "name": bucket["name"],
                "relativePath": relative_path,
                "tmdbId": bucket.get("tmdbId"),
                "videoCount": len(videos),
                "episodeCount": len([video for video in videos if EP_RE.fullmatch(video["id"])]),
                "episodeIds": [video["id"] for video in videos if EP_RE.fullmatch(video["id"])],
                "videos": videos,
            }
        )

    buckets_by_label = {
        normalize_series_label(bucket["name"]): bucket
        for bucket in directories
        if normalize_series_label(bucket["name"])
    }

    existing_relative_paths = {bucket["relativePath"] for bucket in directories}

    for entry in load_series_library():
        existing_bucket = None

        if entry["relativePath"] in grouped:
            grouped_entry = grouped[entry["relativePath"]]
            existing_bucket = next(
                (
                    bucket
                    for bucket in directories
                    if bucket["relativePath"] == grouped_entry["relativePath"]
                ),
                None,
            )
        else:
            existing_bucket = buckets_by_label.get(normalize_series_label(entry["name"]))

        if existing_bucket:
            if not existing_bucket.get("tmdbId"):
                existing_bucket["tmdbId"] = entry["tmdbId"]
            continue

        if entry["relativePath"] in existing_relative_paths:
            continue

        directories.append(
            {
                "name": entry["name"],
                "relativePath": entry["relativePath"],
                "tmdbId": entry["tmdbId"],
                "videoCount": 0,
                "episodeCount": 0,
                "episodeIds": [],
                "videos": [],
            }
        )
        existing_relative_paths.add(entry["relativePath"])

    return {
        "ok": True,
        "root": VIDEOS_DIR,
        "directories": sorted(directories, key=lambda item: item["name"].lower()),
        "rootFiles": root_files,
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


def poweroff_locked():
    hide_qr()
    stop_locked()
    subprocess.Popen(
        ["shutdown", "-h", "now"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


@app.route("/episodes", methods=["GET"])
def episodes():
    directory = request.args.get("directory", default="", type=str).strip() or None
    return jsonify(list_episodes(directory=directory))


@app.route("/videos", methods=["GET"])
def videos():
    return jsonify(list_video_directories())


@app.route("/series", methods=["GET"])
def list_series():
    return jsonify({"ok": True, "items": load_series_library()})


@app.route("/series", methods=["POST"])
def add_series():
    data = request.get_json(force=True, silent=True) or {}
    name = str(data.get("name") or "").strip()

    try:
        tmdb_id = int(data.get("tmdbId"))
    except Exception:
        tmdb_id = 0

    if not name:
        return jsonify({"error": "Missing name"}), 400

    if not tmdb_id:
        return jsonify({"error": "Missing tmdbId"}), 400

    items, entry = upsert_series_library_entry(name=name, tmdb_id=tmdb_id)
    return jsonify({"ok": True, "item": entry, "items": items})


@app.route("/series", methods=["DELETE"])
def delete_series():
    relative_path = request.args.get("relativePath", default="", type=str).strip()
    if not relative_path:
        return jsonify({"error": "Missing relativePath"}), 400

    items, removed = remove_series_library_entry(relative_path)
    if not removed:
        return jsonify({"error": "Series not found"}), 404

    return jsonify({"ok": True, "items": items, "relativePath": relative_path})


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


@app.route("/poweroff", methods=["POST"])
def poweroff():
    with lock:
        poweroff_locked()
    return jsonify({"ok": True, "shuttingDown": True})


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


@app.route("/health", methods=["GET"])
def health():
    with lock:
        running = current["proc"] is not None and current["proc"].poll() is None
        return jsonify(
            {
                "ok": True,
                "ts": int(time.time()),
                "playing": current["id"],
                "directory": current["directory"],
                "file": current["file"],
                "running": running,
            }
        )


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def web_app(path):
    if not web_dist_available():
        return (
            jsonify(
                {
                    "error": "Web frontend not built",
                    "hint": "Run `npm install && npm run build` inside RaspberryPiWEB.",
                }
            ),
            503,
        )

    safe_path = os.path.normpath(path or "").lstrip("/")
    if safe_path.startswith(".."):
        safe_path = ""
    requested_file = os.path.join(WEB_DIST_DIR, safe_path)

    if safe_path and os.path.isfile(requested_file):
        return send_from_directory(WEB_DIST_DIR, safe_path)

    return send_from_directory(WEB_DIST_DIR, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT)
