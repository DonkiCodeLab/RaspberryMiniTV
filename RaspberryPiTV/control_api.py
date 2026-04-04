import os
import re
import socket
import subprocess
import threading
import time
import tkinter as tk

from flask import Flask, jsonify, request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VIDEOS_DIR = os.path.join(BASE_DIR, "videos")
MENU_DIR = os.path.join(BASE_DIR, "menu")
MAIN_SCREEN_PATH = os.path.join(MENU_DIR, "Screen_Main.png")
MORE_OPTIONS_PATH = os.path.join(MENU_DIR, "Screen_MoreOptions.png")
INTRO_VIDEO_PATH = os.path.join(MENU_DIR, "video_intro.mp4")
QR_PNG = "/tmp/simpsonstv_qr.png"
EP_RE = re.compile(r"(S\d{2}E\d{2})", re.IGNORECASE)
PORT = 5050

app = Flask(__name__)

lock = threading.Lock()
current = {"proc": None, "id": None, "directory": None, "file": None}


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


class MenuController:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("RaspberryPiTV")
        self.root.configure(bg="black")
        self.root.attributes("-fullscreen", True)
        self.root.config(cursor="none")

        self.label = tk.Label(self.root, bg="black")
        self.label.pack(fill="both", expand=True)
        self.label.bind("<Button-1>", self.handle_touch)

        self.photos = {
            "main": self.load_photo(MAIN_SCREEN_PATH),
            "more": self.load_photo(MORE_OPTIONS_PATH),
        }
        self.qr_photo = None
        self.current_screen = "main"

        self.root.bind("<Escape>", lambda _event: self.root.destroy())
        self.root.after(100, self.play_intro)

    def load_photo(self, path):
        if not os.path.isfile(path):
            return None
        return tk.PhotoImage(file=path)

    def show_photo(self, photo, screen_name):
        if photo is None:
            self.label.configure(image="", text=f"Missing asset: {screen_name}", fg="white", bg="black")
        else:
            self.label.configure(image=photo, text="", bg="black")
            self.label.image = photo
        self.current_screen = screen_name
        self.root.deiconify()
        self.root.lift()

    def show_main_menu(self):
        self.show_photo(self.photos["main"], "main")

    def show_more_options(self):
        self.show_photo(self.photos["more"], "more")

    def show_qr(self):
        url = f"http://{get_local_ip()}:{PORT}"
        subprocess.run(
            ["qrencode", "-o", QR_PNG, "-s", "12", "-m", "2", url],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.qr_photo = self.load_photo(QR_PNG)
        self.show_photo(self.qr_photo, "qr")

    def hide_menu(self):
        self.root.withdraw()

    def schedule_main_menu(self):
        self.root.after(0, self.show_main_menu)

    def schedule_hide_menu(self):
        self.root.after(0, self.hide_menu)

    def schedule_qr(self):
        self.root.after(0, self.show_qr)

    def play_intro(self):
        if os.path.isfile(INTRO_VIDEO_PATH):
            self.hide_menu()
            play_media_locked(INTRO_VIDEO_PATH, player_id="INTRO", directory=None, file_path="menu/video_intro.mp4")
        else:
            self.show_main_menu()

    def handle_touch(self, event):
        width = max(self.label.winfo_width(), 1)
        height = max(self.label.winfo_height(), 1)
        column = 0 if event.x < width / 2 else 1
        row = 0 if event.y < height / 2 else 1

        if self.current_screen == "main":
            if row == 0 and column == 1:
                self.show_qr()
            elif row == 1 and column == 1:
                self.show_more_options()
        elif self.current_screen in {"more", "qr"}:
            if row == 1 and column == 1:
                self.show_main_menu()

    def run(self):
        self.show_main_menu()
        self.root.mainloop()


menu_controller = None


def schedule_main_menu():
    if menu_controller is not None:
        menu_controller.schedule_main_menu()


def schedule_hide_menu():
    if menu_controller is not None:
        menu_controller.schedule_hide_menu()


def monitor_current_process():
    proc = None
    should_show_main_menu = False

    with lock:
        proc = current["proc"]
        if proc is None:
            return

    proc.wait()

    with lock:
        if current["proc"] is proc:
            should_show_main_menu = current["id"] is not None
            current["proc"] = None
            current["id"] = None
            current["directory"] = None
            current["file"] = None

    if should_show_main_menu:
        schedule_main_menu()


def stop_locked():
    proc = current["proc"]
    if proc and proc.poll() is None:
        try:
            proc.terminate()
            proc.wait(timeout=2)
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


def play_media_locked(filepath, player_id, directory, file_path):
    stop_locked()
    schedule_hide_menu()

    proc = subprocess.Popen(
        ["omxplayer", "--no-osd", "--aspect-mode", "fill", filepath],
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    current["proc"] = proc
    current["id"] = player_id
    current["directory"] = directory
    current["file"] = file_path

    monitor_thread = threading.Thread(target=monitor_current_process, daemon=True)
    monitor_thread.start()


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
        play_media_locked(
            match["full_path"],
            player_id=ep_id,
            directory=match["directory_path"],
            file_path=match["relative_path"],
        )

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
    schedule_main_menu()
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


def run_api():
    app.run(host="0.0.0.0", port=PORT, threaded=True, use_reloader=False)


if __name__ == "__main__":
    api_thread = threading.Thread(target=run_api, daemon=True)
    api_thread.start()

    menu_controller = MenuController()
    menu_controller.run()
