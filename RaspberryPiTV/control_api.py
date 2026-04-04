import os
import re
import socket
import subprocess
import threading
import time

from flask import Flask, jsonify, request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VIDEOS_DIR = os.path.join(BASE_DIR, "videos")
EP_RE = re.compile(r"(S\d{2}E\d{2})", re.IGNORECASE)
PORT = 5050
QR_PNG = "/tmp/simpsonstv_qr.png"

app = Flask(__name__)

lock = threading.Lock()
current = {"proc": None, "id": None, "directory": None, "file": None}
qr_proc = {"proc": None}
qr_visible = {"shown": False}


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
                "videoCount": len(videos),
                "episodeCount": len([video for video in videos if EP_RE.fullmatch(video["id"])]),
                "episodeIds": [video["id"] for video in videos if EP_RE.fullmatch(video["id"])],
                "videos": videos,
            }
        )

    return {
        "ok": True,
        "root": VIDEOS_DIR,
        "directories": directories,
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


@app.route("/episodes", methods=["GET"])
def episodes():
    directory = request.args.get("directory", default="", type=str).strip() or None
    return jsonify(list_episodes(directory=directory))


@app.route("/videos", methods=["GET"])
def videos():
    return jsonify(list_video_directories())


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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT)
