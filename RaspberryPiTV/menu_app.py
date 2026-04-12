import os
import random
import select
import socket
import subprocess
import sys
from datetime import datetime

os.environ.setdefault("SDL_VIDEODRIVER", "fbcon")
os.environ.setdefault("SDL_FBDEV", "/dev/fb0")
os.environ.setdefault("SDL_MOUSE_TOUCH_EVENTS", "1")

import pygame

try:
    from evdev import InputDevice, ecodes
except ImportError:
    InputDevice = None
    ecodes = None

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MENU_DIR = os.path.join(BASE_DIR, "menu")
MAIN_SCREEN_PATH = os.path.join(MENU_DIR, "Main_Menu.png")
MORE_OPTIONS_PATH = os.path.join(MENU_DIR, "Screen_MoreOptions.png")
POWEROFF_PATH = os.path.join(MENU_DIR, "PowerOff_Menu.png")
PLAYMENU_PATH = os.path.join(MENU_DIR, "PlayMenu.png")
PLAY_EXIT_NORMAL_PATH = os.path.join(MENU_DIR, "button_exit_normal.png")
PLAY_EXIT_PRESSED_PATH = os.path.join(MENU_DIR, "button_exit_pressed.png")
LOADING_VIDEO_PATH = os.path.join(MENU_DIR, "Loading_Video_Animation.png")
LOADING_VIDEO_SPINNER_PATH = os.path.join(MENU_DIR, "loading.png")
INTRO_VIDEO_PATH = os.path.join(MENU_DIR, "video_intro.mp4")
TOUCH_DEVICE_PATH = "/dev/input/event0"
QR_PNG = "/tmp/simpsonstv_qr.png"
PORT = 5050
VIDEOS_DIR = os.path.join(BASE_DIR, "videos")
BACKGROUND = (245, 245, 245)
TEXT = (10, 10, 10)
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
GRAY = (120, 120, 120)
DARK_GRAY = (38, 38, 38)
MID_GRAY = (70, 70, 70)
GREEN = (72, 190, 120)
RED = (210, 80, 80)
FONT_FAMILY = "DejaVu Sans"
BASE_WIDTH = 640
BASE_HEIGHT = 480
BUTTON_WIDTH = 186
BUTTON_HEIGHT = 177
BUTTON_LAYOUT = {
    "1x1": (124, 52),
    "1x2": (330, 52),
    "2x1": (124, 250),
    "2x2": (330, 250),
}
POWEROFF_BUTTON_WIDTH = 185
POWEROFF_BUTTON_HEIGHT = 180
POWEROFF_BUTTON_LAYOUT = {
    "1x1": (117, 248),
    "1x2": (335, 248),
}
PLAY_EXIT_LAYOUT = (22, 23, 60, 55)
PLAY_RANDOM_LAYOUT = (183, 207, 272, 103)
PLAY_BROWSE_LAYOUT = (183, 336, 272, 103)
BROWSE_VISIBLE_ITEMS = 5


def ensure_screen_on():
    subprocess.run(["raspi-gpio", "set", "19", "op", "a5"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    subprocess.run(["raspi-gpio", "set", "18", "op", "dh"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


def log_debug(message):
    print(f"[menu-debug] {message}", flush=True)


def get_local_ip():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        sock.close()


def play_intro():
    if not os.path.isfile(INTRO_VIDEO_PATH):
        return

    subprocess.run(
        ["omxplayer", "--no-osd", "--aspect-mode", "fill", INTRO_VIDEO_PATH],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )


def generate_qr():
    url = get_local_ip()
    subprocess.run(
        ["qrencode", "-o", QR_PNG, "-s", "12", "-m", "2", url],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return url


def run_command(command):
    return subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False)


def is_video_file(filename):
    return filename.lower().endswith((".mp4", ".m4v", ".mov", ".mkv"))


def scan_wifi_networks():
    nmcli_result = run_command(["nmcli", "-t", "-f", "SSID,SIGNAL,SECURITY", "dev", "wifi", "list", "--rescan", "yes"])
    if nmcli_result.returncode == 0:
        networks = []
        seen = set()
        for line in nmcli_result.stdout.splitlines():
            if not line.strip():
                continue
            parts = line.split(":")
            if len(parts) < 3:
                continue
            ssid = parts[0].strip()
            signal = parts[1].strip() or "0"
            security = ":".join(parts[2:]).strip()
            if not ssid or ssid in seen:
                continue
            seen.add(ssid)
            networks.append({"ssid": ssid, "signal": int(signal or 0), "security": security or "open"})
        if networks:
            return sorted(networks, key=lambda item: (-item["signal"], item["ssid"].lower()))
        log_debug("WIFI nmcli returned no networks, falling back to iwlist")

    iw_result = run_command(["iwlist", "wlan0", "scan"])
    networks = []
    current = None
    for raw_line in iw_result.stdout.splitlines():
        line = raw_line.strip()
        if "ESSID:" in line:
            ssid = line.split("ESSID:", 1)[1].strip().strip('"')
            if current and current["ssid"]:
                networks.append(current)
            current = {"ssid": ssid, "signal": 0, "security": "unknown"}
        elif current and "Quality=" in line:
            try:
                quality_part = line.split("Quality=", 1)[1].split(" ", 1)[0]
                quality_value, quality_max = quality_part.split("/")
                current["signal"] = int(int(quality_value) * 100 / int(quality_max))
            except Exception:
                pass
        elif current and "Encryption key:" in line and line.endswith("off"):
            current["security"] = "open"
    if current and current["ssid"]:
        networks.append(current)
    unique = {}
    for network in networks:
        unique.setdefault(network["ssid"], network)
    return sorted(unique.values(), key=lambda item: (-item["signal"], item["ssid"].lower()))


def connect_wifi(ssid, password):
    if not ssid:
        return False, "Select a Wi-Fi network"

    nmcli_base = ["nmcli", "dev", "wifi", "connect", ssid]
    if password:
        nmcli_base.extend(["password", password])
    nmcli_result = run_command(nmcli_base)
    if nmcli_result.returncode == 0:
        return True, f"Connected to {ssid}"

    if password:
        add_result = run_command(["wpa_cli", "-i", "wlan0", "add_network"])
        network_id = add_result.stdout.strip()
        if add_result.returncode == 0 and network_id.isdigit():
            run_command(["wpa_cli", "-i", "wlan0", "set_network", network_id, "ssid", f'"{ssid}"'])
            run_command(["wpa_cli", "-i", "wlan0", "set_network", network_id, "psk", f'"{password}"'])
            run_command(["wpa_cli", "-i", "wlan0", "enable_network", network_id])
            save_result = run_command(["wpa_cli", "-i", "wlan0", "save_config"])
            if save_result.returncode == 0:
                return True, f"Trying to connect to {ssid}"

    stderr = (nmcli_result.stderr or "").strip()
    stdout = (nmcli_result.stdout or "").strip()
    return False, stderr or stdout or f"Could not connect to {ssid}"


def get_connected_wifi_info():
    nmcli_result = run_command(["nmcli", "-t", "-f", "ACTIVE,SSID", "dev", "wifi"])
    if nmcli_result.returncode == 0:
        for line in nmcli_result.stdout.splitlines():
            if not line.strip():
                continue
            parts = line.split(":", 1)
            if len(parts) == 2 and parts[0] == "yes":
                ssid = parts[1].strip()
                if ssid:
                    return ssid

    iwgetid_result = run_command(["iwgetid", "-r"])
    ssid = iwgetid_result.stdout.strip()
    return ssid or None


def load_image(path):
    if not os.path.isfile(path):
        return None
    return pygame.image.load(path).convert_alpha()


def fit_image(image, size):
    return pygame.transform.smoothscale(image, size)


def blit_centered(surface, image, width, height):
    rect = image.get_rect(center=(width // 2, height // 2))
    surface.blit(image, rect)


class RaspberryPiTVMenu:
    def __init__(self):
        ensure_screen_on()
        pygame.display.init()
        pygame.font.init()
        self.screen = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)
        pygame.mouse.set_visible(False)
        self.clock = pygame.time.Clock()
        self.width, self.height = self.screen.get_size()
        self.font = pygame.font.SysFont(FONT_FAMILY, 28)
        self.title_font = pygame.font.SysFont(FONT_FAMILY, 42, bold=True)
        self.poweroff_title_font = pygame.font.SysFont(FONT_FAMILY, 34, bold=True)
        self.clock_font = pygame.font.SysFont(FONT_FAMILY, 140, bold=True)
        self.small_font = pygame.font.SysFont(FONT_FAMILY, 20)
        self.wifi_font = pygame.font.SysFont(FONT_FAMILY, 24)
        self.wifi_bold_font = pygame.font.SysFont(FONT_FAMILY, 24, bold=True)
        self.play_title_font = pygame.font.SysFont(FONT_FAMILY, 34, bold=True)
        self.play_label_font = pygame.font.SysFont(FONT_FAMILY, 26, bold=True)
        self.browser_font = pygame.font.SysFont(FONT_FAMILY, 24)
        self.browser_bold_font = pygame.font.SysFont(FONT_FAMILY, 24, bold=True)
        self.video_button_font = pygame.font.SysFont(FONT_FAMILY, 30, bold=True)
        self.running = True
        self.state = "main"
        self.pressed_button = None
        self.qr_url = None
        self.touch_device = None
        self.touch_position = (0, 0)
        self.touch_is_down = False
        self.touch_down_pos = None
        self.assets = {
            "main": self.prepare_screen_assets(
                MAIN_SCREEN_PATH,
                {
                    "1x1": os.path.join(MENU_DIR, "Main_Menu_Button_1x1_Pressed.png"),
                    "1x2": os.path.join(MENU_DIR, "Main_Menu_Button_1x2_Pressed.png"),
                    "2x1": os.path.join(MENU_DIR, "Main_Menu_Button_2x1_Pressed.png"),
                    "2x2": os.path.join(MENU_DIR, "Main_Menu_Button_2x2_Pressed.png"),
                },
            ),
            "more": self.prepare_screen_assets(
                MORE_OPTIONS_PATH,
                {
                    "1x1": os.path.join(MENU_DIR, "Screen_MoreOptions_Button_1x1_Pressed.png"),
                    "1x2": os.path.join(MENU_DIR, "Screen_MoreOptions_Button_1x2_Pressed.png"),
                    "2x1": os.path.join(MENU_DIR, "Screen_MoreOptions_Button_2x1_Pressed.png"),
                    "2x2": os.path.join(MENU_DIR, "Screen_MoreOptions_Button_2x2_Pressed.png"),
                },
            ),
            "poweroff": self.prepare_screen_assets(
                POWEROFF_PATH,
                {
                    "1x1": os.path.join(MENU_DIR, "PowerOff_Menu_Button_1x1_Pressed.png"),
                    "1x2": os.path.join(MENU_DIR, "PowerOff_Menu_Button_1x2_Pressed.png"),
                },
            ),
            "play": self.prepare_screen_assets(
                PLAYMENU_PATH,
                {
                    "random": os.path.join(MENU_DIR, "PlayMenu_ButtonRandom_Pressed.png"),
                    "browse": os.path.join(MENU_DIR, "PlayMenu_ButtonBrowse_Pressed.png"),
                },
            ),
        }
        play_exit_rect = self.get_play_button_rects()["exit"]
        self.play_exit_assets = {
            "default": self.prepare_button_asset(PLAY_EXIT_NORMAL_PATH, play_exit_rect),
            "pressed": self.prepare_button_asset(PLAY_EXIT_PRESSED_PATH, play_exit_rect),
        }
        self.qr_asset = None
        self.wifi_networks = []
        self.wifi_selected_ssid = None
        self.wifi_password = ""
        self.wifi_status = "Scan and select a network"
        self.wifi_page_start = 0
        self.wifi_keyboard_upper = True
        self.play_status = "Choose how you want to start watching"
        self.browser_path = VIDEOS_DIR
        self.browser_selected_index = 0
        self.browser_page_start = 0
        self.browser_entries = []
        self.browser_status = "Select a video or folder"
        self.loading_asset = self.prepare_asset(LOADING_VIDEO_PATH)
        self.loading_spinner_asset = load_image(LOADING_VIDEO_SPINNER_PATH)
        self.loading_video_path = None
        self.loading_return_state = "play"
        self.loading_started_at = 0
        self.loading_rotation = 0
        self.video_proc = None
        self.video_paused = False
        self.video_return_state = "play"
        self.video_now_playing = ""
        self.last_video_tap_at = 0
        self.video_double_tap_ms = 450
        log_debug(f"SCREEN size={self.width}x{self.height}")
        for button_id, rect in self.get_button_rects().items():
            log_debug(f"BUTTON {button_id} rect={rect}")
        self.setup_touch_input()

    def prepare_asset(self, path):
        image = load_image(path)
        if image is None:
            return None
        return fit_image(image, (self.width, self.height))

    def prepare_screen_assets(self, default_path, pressed_paths):
        return {
            "default": self.prepare_asset(default_path),
            "pressed": {button_id: self.prepare_asset(path) for button_id, path in pressed_paths.items()},
        }

    def prepare_button_asset(self, path, rect):
        image = load_image(path)
        if image is None:
            return None
        return fit_image(image, rect.size)

    def setup_touch_input(self):
        if InputDevice is None:
            log_debug("TOUCH evdev unavailable, falling back to pygame mouse events")
            return

        try:
            self.touch_device = InputDevice(TOUCH_DEVICE_PATH)
            log_debug(f"TOUCH device={TOUCH_DEVICE_PATH} name={self.touch_device.name}")
        except Exception as exc:
            self.touch_device = None
            log_debug(f"TOUCH failed to open {TOUCH_DEVICE_PATH}: {exc}")

    def refresh_qr_asset(self):
        self.qr_url = generate_qr()
        connected_wifi = get_connected_wifi_info()
        qr = load_image(QR_PNG)
        if qr is None:
            self.qr_asset = None
            return

        qr_size = min(self.width, self.height) // 2
        qr_surface = pygame.Surface((self.width, self.height))
        qr_surface.fill(BLACK)
        qr_scaled = fit_image(qr, (qr_size, qr_size))
        qr_rect = qr_scaled.get_rect(center=(self.width // 2, self.height // 2 + 5))
        qr_surface.blit(qr_scaled, qr_rect)

        title = self.title_font.render("Scan the QR", True, WHITE)
        subtitle = self.font.render(self.qr_url, True, WHITE)
        wifi_line = self.small_font.render(
            f"Wi-Fi: {connected_wifi}" if connected_wifi else "Wi-Fi: not connected",
            True,
            WHITE,
        )

        qr_surface.blit(title, title.get_rect(center=(self.width // 2, 42)))
        qr_surface.blit(subtitle, subtitle.get_rect(center=(self.width // 2, qr_rect.bottom + 44)))
        qr_surface.blit(wifi_line, wifi_line.get_rect(center=(self.width // 2, qr_rect.bottom + 78)))
        self.qr_asset = qr_surface.convert()

    def refresh_wifi_networks(self):
        self.wifi_networks = scan_wifi_networks()
        self.wifi_page_start = 0
        if self.wifi_selected_ssid and not any(item["ssid"] == self.wifi_selected_ssid for item in self.wifi_networks):
            self.wifi_selected_ssid = None
        self.wifi_status = f"{len(self.wifi_networks)} networks found" if self.wifi_networks else "No networks found"

    def get_wifi_layout(self):
        return {
            "list": pygame.Rect(20, 70, 470, 260),
            "up": pygame.Rect(505, 90, 115, 80),
            "down": pygame.Rect(505, 185, 115, 80),
            "refresh": pygame.Rect(20, 350, 180, 56),
            "connect": pygame.Rect(210, 350, 200, 56),
            "back": pygame.Rect(420, 350, 180, 56),
        }

    def get_wifi_password_layout(self):
        return {
            "selected": pygame.Rect(20, 56, self.width - 40, 34),
            "password": pygame.Rect(20, 102, self.width - 40, 48),
            "connect": pygame.Rect(20, 164, 220, 52),
            "back": pygame.Rect(252, 164, 180, 52),
            "keyboard": pygame.Rect(20, 232, self.width - 40, self.height - 252),
        }

    def get_wifi_rows(self):
        letters = [
            list("QWERTYUIOP"),
            list("ASDFGHJKL"),
            list("ZXCVBNM"),
        ]
        if not self.wifi_keyboard_upper:
            letters = [[char.lower() for char in row] for row in letters]

        return [
            [("1", "1"), ("2", "2"), ("3", "3"), ("4", "4"), ("5", "5"), ("6", "6"), ("7", "7"), ("8", "8"), ("9", "9"), ("0", "0")],
            [(char, char) for char in letters[0]],
            [(char, char) for char in letters[1]] + [("<-", "BACKSPACE")],
            [(char, char) for char in letters[2]] + [(".", "."), ("Aa" if self.wifi_keyboard_upper else "aA", "TOGGLE_CASE"), ("CLR", "CLEAR")],
        ]

    def get_keyboard_key_at(self, pos):
        layout = self.get_wifi_password_layout()
        keyboard_rect = layout["keyboard"]
        if not keyboard_rect.collidepoint(pos):
            return None

        rows = self.get_wifi_rows()
        row_height = keyboard_rect.height / len(rows)
        row_index = int((pos[1] - keyboard_rect.y) / row_height)
        row_index = max(0, min(len(rows) - 1, row_index))
        row = rows[row_index]
        key_width = keyboard_rect.width / len(row)
        column_index = int((pos[0] - keyboard_rect.x) / key_width)
        column_index = max(0, min(len(row) - 1, column_index))
        return row[column_index][1]

    def scale_rect(self, x, y, width, height):
        scale_x = self.width / BASE_WIDTH
        scale_y = self.height / BASE_HEIGHT
        return pygame.Rect(
            int(x * scale_x),
            int(y * scale_y),
            int(width * scale_x),
            int(height * scale_y),
        )

    def get_button_rects(self):
        return {
            button_id: self.scale_rect(x, y, BUTTON_WIDTH, BUTTON_HEIGHT)
            for button_id, (x, y) in BUTTON_LAYOUT.items()
        }

    def get_poweroff_button_rects(self):
        return {
            button_id: self.scale_rect(x, y, POWEROFF_BUTTON_WIDTH, POWEROFF_BUTTON_HEIGHT)
            for button_id, (x, y) in POWEROFF_BUTTON_LAYOUT.items()
        }

    def get_play_button_rects(self):
        return {
            "exit": self.scale_rect(*PLAY_EXIT_LAYOUT),
            "random": self.scale_rect(*PLAY_RANDOM_LAYOUT),
            "browse": self.scale_rect(*PLAY_BROWSE_LAYOUT),
        }

    def get_top_back_rect(self):
        return self.get_play_button_rects()["exit"]

    def top_back_at_pos(self, pos):
        return self.get_top_back_rect().collidepoint(pos)

    def play_button_at_pos(self, pos):
        x, y = pos
        for button_id, rect in self.get_play_button_rects().items():
            if rect.collidepoint(x, y):
                return button_id
        return None

    def get_browser_layout(self):
        return {
            "back": pygame.Rect(20, 18, 100, 44),
            "path": pygame.Rect(130, 18, self.width - 150, 44),
            "list": pygame.Rect(20, 80, 470, 300),
            "up": pygame.Rect(505, 100, 115, 70),
            "down": pygame.Rect(505, 185, 115, 70),
            "action": pygame.Rect(20, 400, 260, 56),
            "close": pygame.Rect(320, 400, 260, 56),
        }

    def rel_browser_path(self):
        rel_path = os.path.relpath(self.browser_path, VIDEOS_DIR)
        return "/" if rel_path == "." else f"/{rel_path.replace(os.sep, '/')}"

    def get_entry_video_files(self, entry_path):
        if os.path.isfile(entry_path) and is_video_file(entry_path):
            return [entry_path]

        videos = []
        if os.path.isdir(entry_path):
            for root, _dirs, files in os.walk(entry_path):
                for filename in sorted(files):
                    full_path = os.path.join(root, filename)
                    if is_video_file(full_path):
                        videos.append(full_path)
        return sorted(videos)

    def refresh_browser_entries(self):
        entries = []
        if os.path.abspath(self.browser_path) != os.path.abspath(VIDEOS_DIR):
            entries.append(
                {
                    "label": "..",
                    "path": os.path.dirname(self.browser_path),
                    "type": "parent",
                    "action": "up",
                    "video_count": 0,
                }
            )

        if os.path.isdir(self.browser_path):
            for name in sorted(os.listdir(self.browser_path), key=lambda item: item.lower()):
                full_path = os.path.join(self.browser_path, name)
                if os.path.isdir(full_path):
                    videos = self.get_entry_video_files(full_path)
                    if not videos:
                        continue
                    entries.append(
                        {
                            "label": name,
                            "path": full_path,
                            "type": "directory",
                            "action": "view" if len(videos) == 1 else "browse",
                            "video_count": len(videos),
                            "videos": videos,
                        }
                    )
                elif is_video_file(full_path):
                    entries.append(
                        {
                            "label": name,
                            "path": full_path,
                            "type": "file",
                            "action": "view",
                            "video_count": 1,
                            "videos": [full_path],
                        }
                    )

        self.browser_entries = entries
        if not self.browser_entries:
            self.browser_selected_index = 0
            self.browser_page_start = 0
            self.browser_status = "No videos found in this folder"
            return

        self.browser_selected_index = max(0, min(self.browser_selected_index, len(self.browser_entries) - 1))
        max_start = max(0, len(self.browser_entries) - BROWSE_VISIBLE_ITEMS)
        self.browser_page_start = min(self.browser_page_start, max_start)
        if self.browser_selected_index < self.browser_page_start:
            self.browser_page_start = self.browser_selected_index
        if self.browser_selected_index >= self.browser_page_start + BROWSE_VISIBLE_ITEMS:
            self.browser_page_start = self.browser_selected_index - BROWSE_VISIBLE_ITEMS + 1
        self.browser_status = "Select a video or folder"

    def move_browser_selection(self, delta):
        if not self.browser_entries:
            return
        self.browser_selected_index = max(0, min(len(self.browser_entries) - 1, self.browser_selected_index + delta))
        if self.browser_selected_index < self.browser_page_start:
            self.browser_page_start = self.browser_selected_index
        if self.browser_selected_index >= self.browser_page_start + BROWSE_VISIBLE_ITEMS:
            self.browser_page_start = self.browser_selected_index - BROWSE_VISIBLE_ITEMS + 1

    def browser_entry_at_pos(self, pos):
        layout = self.get_browser_layout()
        if not layout["list"].collidepoint(pos):
            return None
        row_height = layout["list"].height / BROWSE_VISIBLE_ITEMS
        row_index = int((pos[1] - layout["list"].y) / row_height)
        index = self.browser_page_start + row_index
        if 0 <= index < len(self.browser_entries):
            return index
        return None

    def get_selected_browser_entry(self):
        if not self.browser_entries:
            return None
        if 0 <= self.browser_selected_index < len(self.browser_entries):
            return self.browser_entries[self.browser_selected_index]
        return None

    def truncate_text(self, text, font, max_width):
        if font.size(text)[0] <= max_width:
            return text
        candidate = text
        while candidate and font.size(candidate + "...")[0] > max_width:
            candidate = candidate[:-1]
        return candidate + "..."

    def play_video_path(self, full_path):
        relative_path = os.path.relpath(full_path, VIDEOS_DIR).replace(os.sep, "/")
        log_debug(f"PLAY file={relative_path}")
        self.stop_video_playback(silent=True)
        self.loading_video_path = full_path
        self.loading_started_at = pygame.time.get_ticks()
        self.video_paused = False
        self.video_now_playing = os.path.basename(full_path)
        self.state = "loading_video"

    def start_random_video(self):
        all_videos = self.get_entry_video_files(VIDEOS_DIR)
        if not all_videos:
            self.play_status = "No videos found"
            return
        self.loading_return_state = "play"
        self.play_video_path(random.choice(all_videos))

    def activate_browser_entry(self, entry):
        if entry is None:
            return
        if entry["type"] == "parent":
            self.browser_path = entry["path"]
            self.browser_selected_index = 0
            self.browser_page_start = 0
            self.refresh_browser_entries()
            return
        if entry["action"] == "browse":
            self.browser_path = entry["path"]
            self.browser_selected_index = 0
            self.browser_page_start = 0
            self.refresh_browser_entries()
            return
        videos = entry.get("videos") or []
        if videos:
            self.loading_return_state = "browse"
            self.play_video_path(videos[0])

    def handle_video_touch_down(self, pos):
        self.pressed_button = "video-touch"
        log_debug(f"VIDEO DOWN pos={pos} paused={self.video_paused}")

    def handle_video_touch_up(self, pos):
        self.pressed_button = None
        now_ms = pygame.time.get_ticks()
        if self.last_video_tap_at and now_ms - self.last_video_tap_at <= self.video_double_tap_ms:
            log_debug(f"VIDEO double tap pos={pos} -> quit")
            self.last_video_tap_at = 0
            self.stop_video_playback()
            return

        self.last_video_tap_at = now_ms
        self.toggle_video_pause()

    def toggle_video_pause(self):
        if self.video_proc and self.video_proc.poll() is None and self.video_proc.stdin:
            try:
                self.video_proc.stdin.write(b"p")
                self.video_proc.stdin.flush()
                self.video_paused = not self.video_paused
            except Exception as exc:
                log_debug(f"VIDEO pause toggle failed: {exc}")

    def stop_video_playback(self, silent=False):
        proc = self.video_proc
        if proc and proc.poll() is None:
            try:
                if proc.stdin:
                    proc.stdin.write(b"q")
                    proc.stdin.flush()
            except Exception:
                pass
            try:
                proc.terminate()
            except Exception:
                pass
        run_command(["pkill", "-f", "omxplayer.bin"])
        self.video_proc = None
        self.video_paused = False
        self.loading_video_path = None
        self.last_video_tap_at = 0
        if not silent:
            self.state = self.video_return_state

    def maybe_start_pending_video(self):
        if self.state != "loading_video" or not self.loading_video_path:
            return
        if pygame.time.get_ticks() - self.loading_started_at < 220:
            return
        self.video_return_state = self.loading_return_state
        self.video_proc = subprocess.Popen(
            ["omxplayer", "--no-osd", "--aspect-mode", "fill", self.loading_video_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.loading_video_path = None
        self.video_paused = False
        self.last_video_tap_at = 0
        self.state = "video"

    def update_video_state(self):
        if self.state == "loading_video":
            self.maybe_start_pending_video()
            return
        if self.state == "video" and self.video_proc and self.video_proc.poll() is not None:
            self.video_proc = None
            self.video_paused = False
            self.last_video_tap_at = 0
            self.state = self.video_return_state

    def normalize_touch_pos(self, pos):
        raw_x, raw_y = pos
        normalized_x = int(raw_y * self.width / self.height)
        normalized_y = int(self.height - (raw_x * self.height / self.width))
        normalized_x = max(0, min(self.width - 1, normalized_x))
        normalized_y = max(0, min(self.height - 1, normalized_y))
        return normalized_x, normalized_y

    def button_at_pos(self, pos):
        x, y = pos
        for button_id, rect in self.get_button_rects().items():
            if rect.collidepoint(x, y):
                return button_id
        return None

    def poweroff_button_at_pos(self, pos):
        x, y = pos
        for button_id, rect in self.get_poweroff_button_rects().items():
            if rect.collidepoint(x, y):
                return button_id
        return None

    def handle_button_action(self, button_id):
        log_debug(f"ACTION state={self.state} button={button_id}")
        if self.state == "main":
            if button_id == "1x1":
                self.refresh_wifi_networks()
                self.state = "wifi"
            elif button_id == "1x2":
                self.refresh_qr_asset()
                self.state = "qr"
            elif button_id == "2x1":
                self.state = "play"
            elif button_id == "2x2":
                self.state = "more"
        elif self.state == "more":
            if button_id == "1x2":
                self.state = "clock"
            elif button_id == "2x1":
                self.state = "poweroff"
            elif button_id == "2x2":
                self.state = "main"
        elif self.state == "qr":
            self.state = "main"

    def handle_poweroff_action(self, button_id):
        log_debug(f"POWEROFF action button={button_id}")
        if button_id == "1x1":
            run_command(["shutdown", "-h", "now"])
        elif button_id == "1x2":
            self.state = "more"

    def handle_play_action(self, button_id):
        log_debug(f"PLAYMENU action button={button_id}")
        if button_id == "exit":
            self.state = "main"
        elif button_id == "random":
            self.start_random_video()
        elif button_id == "browse":
            self.browser_path = VIDEOS_DIR
            self.browser_selected_index = 0
            self.browser_page_start = 0
            self.refresh_browser_entries()
            self.state = "browse"

    def handle_browser_touch_down(self, pos):
        self.pressed_button = "browse-touch"
        log_debug(f"BROWSE DOWN pos={pos} path={self.rel_browser_path()} selected={self.browser_selected_index}")

    def handle_browser_touch_up(self, pos):
        self.pressed_button = None
        layout = self.get_browser_layout()
        if layout["back"].collidepoint(pos):
            if os.path.abspath(self.browser_path) == os.path.abspath(VIDEOS_DIR):
                self.state = "play"
            else:
                self.browser_path = os.path.dirname(self.browser_path)
                self.browser_selected_index = 0
                self.browser_page_start = 0
                self.refresh_browser_entries()
            return
        if layout["up"].collidepoint(pos):
            self.move_browser_selection(-1)
            return
        if layout["down"].collidepoint(pos):
            self.move_browser_selection(1)
            return
        if layout["close"].collidepoint(pos):
            self.state = "play"
            return

        selected_entry = self.get_selected_browser_entry()
        if layout["action"].collidepoint(pos):
            self.activate_browser_entry(selected_entry)
            return

        entry_index = self.browser_entry_at_pos(pos)
        if entry_index is not None:
            self.browser_selected_index = entry_index

    def handle_wifi_touch_down(self, pos):
        self.pressed_button = "wifi-touch"
        log_debug(f"WIFI DOWN pos={pos} selected={self.wifi_selected_ssid} state={self.state}")

    def move_wifi_page(self, delta):
        if not self.wifi_networks:
            return
        max_start = max(0, len(self.wifi_networks) - 4)
        self.wifi_page_start = max(0, min(max_start, self.wifi_page_start + delta))

    def handle_wifi_touch_up(self, pos):
        self.pressed_button = None
        if self.state == "wifi":
            layout = self.get_wifi_layout()
            if layout["refresh"].collidepoint(pos):
                self.refresh_wifi_networks()
                return
            if layout["up"].collidepoint(pos):
                self.move_wifi_page(-1)
                return
            if layout["down"].collidepoint(pos):
                self.move_wifi_page(1)
                return
            if layout["back"].collidepoint(pos):
                self.state = "main"
                return
            if layout["connect"].collidepoint(pos):
                if self.wifi_selected_ssid:
                    current_ssid = get_connected_wifi_info()
                    if self.wifi_selected_ssid == current_ssid:
                        self.wifi_status = f"Already connected to {self.wifi_selected_ssid}"
                    else:
                        self.wifi_password = ""
                        self.wifi_keyboard_upper = True
                        self.state = "wifi_password"
                return
            if layout["list"].collidepoint(pos):
                row_height = 62
                row_index = int((pos[1] - layout["list"].y) / row_height)
                index = self.wifi_page_start + row_index
                if 0 <= index < len(self.wifi_networks):
                    self.wifi_selected_ssid = self.wifi_networks[index]["ssid"]
                    self.wifi_status = f"Selected: {self.wifi_selected_ssid}"
                return

        if self.state == "wifi_password":
            layout = self.get_wifi_password_layout()
            if layout["back"].collidepoint(pos):
                self.state = "wifi"
                return
            if layout["connect"].collidepoint(pos):
                success, message = connect_wifi(self.wifi_selected_ssid, self.wifi_password)
                self.wifi_status = message
                if success:
                    self.state = "wifi"
                    self.refresh_wifi_networks()
                return

            key_value = self.get_keyboard_key_at(pos)
            if key_value is None:
                return
            if key_value == "BACKSPACE":
                self.wifi_password = self.wifi_password[:-1]
            elif key_value == "TOGGLE_CASE":
                self.wifi_keyboard_upper = not self.wifi_keyboard_upper
            elif key_value == "CLEAR":
                self.wifi_password = ""
            else:
                self.wifi_password += key_value

    def handle_touch_down(self, pos):
        normalized_pos = self.normalize_touch_pos(pos)
        self.touch_down_pos = normalized_pos
        if self.state == "clock":
            self.pressed_button = "top-back" if self.top_back_at_pos(normalized_pos) else None
            log_debug(f"DOWN raw={pos} normalized={normalized_pos} state=clock pressed={self.pressed_button}")
            return
        if self.state == "poweroff":
            self.pressed_button = self.poweroff_button_at_pos(normalized_pos)
            log_debug(f"DOWN raw={pos} normalized={normalized_pos} state=poweroff pressed={self.pressed_button}")
            return
        if self.state == "video":
            self.handle_video_touch_down(normalized_pos)
            return
        if self.state == "play":
            self.pressed_button = self.play_button_at_pos(normalized_pos)
            log_debug(f"DOWN raw={pos} normalized={normalized_pos} state=play pressed={self.pressed_button}")
            return
        if self.state == "browse":
            self.handle_browser_touch_down(normalized_pos)
            return
        if self.state == "wifi":
            self.handle_wifi_touch_down(normalized_pos)
            return
        if self.state == "wifi_password":
            self.handle_wifi_touch_down(normalized_pos)
            return
        if self.state == "qr":
            self.pressed_button = "top-back" if self.top_back_at_pos(normalized_pos) else None
            log_debug(
                f"DOWN raw={pos} normalized={normalized_pos} state={self.state} pressed={self.pressed_button}"
            )
            return
        self.pressed_button = self.button_at_pos(normalized_pos)
        log_debug(
            f"DOWN raw={pos} normalized={normalized_pos} state={self.state} pressed={self.pressed_button}"
        )

    def handle_touch_up(self, pos):
        normalized_pos = self.normalize_touch_pos(pos)
        if self.state == "clock":
            active_button = self.pressed_button
            released_button = "top-back" if self.top_back_at_pos(normalized_pos) else None
            self.pressed_button = None
            log_debug(f"UP raw={pos} normalized={normalized_pos} state=clock down={active_button} up={released_button}")
            if active_button == "top-back" and released_button == "top-back":
                self.state = "more"
            return
        if self.state == "poweroff":
            released_button = self.poweroff_button_at_pos(normalized_pos)
            active_button = self.pressed_button
            self.pressed_button = None
            log_debug(
                f"UP raw={pos} normalized={normalized_pos} state=poweroff down={active_button} up={released_button}"
            )
            if active_button and active_button == released_button:
                self.handle_poweroff_action(active_button)
            return
        if self.state == "video":
            self.handle_video_touch_up(normalized_pos)
            log_debug(f"UP raw={pos} normalized={normalized_pos} state=video paused={self.video_paused}")
            return
        if self.state == "play":
            released_button = self.play_button_at_pos(normalized_pos)
            active_button = self.pressed_button
            self.pressed_button = None
            log_debug(
                f"UP raw={pos} normalized={normalized_pos} state=play down={active_button} up={released_button}"
            )
            if active_button and active_button == released_button:
                self.handle_play_action(active_button)
            return
        if self.state == "browse":
            self.handle_browser_touch_up(normalized_pos)
            log_debug(f"UP raw={pos} normalized={normalized_pos} state=browse")
            return
        if self.state == "wifi":
            self.handle_wifi_touch_up(normalized_pos)
            log_debug(f"UP raw={pos} normalized={normalized_pos} state=wifi")
            return
        if self.state == "wifi_password":
            self.handle_wifi_touch_up(normalized_pos)
            log_debug(f"UP raw={pos} normalized={normalized_pos} state=wifi_password")
            return
        if self.state == "qr":
            active_button = self.pressed_button
            released_button = "top-back" if self.top_back_at_pos(normalized_pos) else None
            self.pressed_button = None
            log_debug(
                f"UP raw={pos} normalized={normalized_pos} state=qr down={active_button} up={released_button}"
            )
            if active_button == "top-back" and released_button == "top-back":
                self.state = "main"
            return
        released_button = self.button_at_pos(normalized_pos)
        active_button = self.pressed_button
        self.pressed_button = None
        log_debug(
            f"UP raw={pos} normalized={normalized_pos} state={self.state} down={active_button} up={released_button}"
        )
        if active_button and active_button == released_button:
            self.handle_button_action(active_button)

    def poll_native_touch(self):
        if self.touch_device is None or ecodes is None:
            return

        ready, _, _ = select.select([self.touch_device.fd], [], [], 0)
        if not ready:
            return

        for event in self.touch_device.read():
            if event.type == ecodes.EV_ABS:
                if event.code in (ecodes.ABS_X, ecodes.ABS_MT_POSITION_X):
                    self.touch_position = (event.value, self.touch_position[1])
                elif event.code in (ecodes.ABS_Y, ecodes.ABS_MT_POSITION_Y):
                    self.touch_position = (self.touch_position[0], event.value)
            elif event.type == ecodes.EV_KEY and event.code == ecodes.BTN_TOUCH:
                if event.value == 1 and not self.touch_is_down:
                    self.touch_is_down = True
                    self.handle_touch_down(self.touch_position)
                elif event.value == 0 and self.touch_is_down:
                    self.touch_is_down = False
                    self.handle_touch_up(self.touch_position)

    def draw_missing(self, message):
        self.screen.fill((20, 20, 20))
        title = self.title_font.render("Missing asset", True, (255, 255, 255))
        subtitle = self.font.render(message, True, (220, 220, 220))
        self.screen.blit(title, title.get_rect(center=(self.width // 2, self.height // 2 - 30)))
        self.screen.blit(subtitle, subtitle.get_rect(center=(self.width // 2, self.height // 2 + 20)))

    def draw_clock(self):
        self.screen.fill(BLACK)
        time_text = datetime.now().strftime("%H : %M")
        text_surface = self.clock_font.render(time_text, True, WHITE)
        hint_surface = self.small_font.render("Tap anywhere to go back", True, GRAY)
        self.screen.blit(text_surface, text_surface.get_rect(center=(self.width // 2, self.height // 2 - 10)))
        self.screen.blit(hint_surface, hint_surface.get_rect(center=(self.width // 2, self.height - 32)))

    def draw_wifi(self):
        layout = self.get_wifi_layout()
        self.screen.fill(BLACK)

        title = self.title_font.render("Wi-Fi", True, WHITE)
        self.screen.blit(title, (20, 10))

        list_rect = layout["list"]
        pygame.draw.rect(self.screen, DARK_GRAY, list_rect)
        row_height = 62
        visible_networks = self.wifi_networks[self.wifi_page_start:self.wifi_page_start + 4]

        current_ssid = get_connected_wifi_info()
        for row_offset, network in enumerate(visible_networks):
            index = self.wifi_page_start + row_offset
            if index >= len(self.wifi_networks):
                break
            row_rect = pygame.Rect(list_rect.x + 6, list_rect.y + 6 + row_offset * row_height, list_rect.width - 12, row_height - 6)
            selected = network["ssid"] == self.wifi_selected_ssid
            pygame.draw.rect(self.screen, MID_GRAY if selected else DARK_GRAY, row_rect)
            prefix = "> " if network["ssid"] == current_ssid else "  "
            ssid = network["ssid"]
            max_len = 24
            if len(ssid) > max_len:
                ssid = ssid[: max_len - 3] + "..."
            label_font = self.wifi_bold_font if network["ssid"] == current_ssid else self.wifi_font
            label = label_font.render(f"{prefix}{ssid}", True, WHITE)
            power = self.small_font.render(f"{network['signal']}%", True, WHITE)
            security = self.small_font.render(network["security"], True, GRAY)
            self.screen.blit(label, (row_rect.x + 10, row_rect.y + 5))
            self.screen.blit(security, (row_rect.x + 10, row_rect.y + 33))
            self.screen.blit(power, power.get_rect(midright=(row_rect.right - 10, row_rect.y + row_rect.height / 2)))

        for key, rect, color in (
            ("Refresh", layout["refresh"], MID_GRAY),
            ("Connect", layout["connect"], GREEN if self.wifi_selected_ssid else MID_GRAY),
            ("Back", layout["back"], RED),
            ("Up", layout["up"], MID_GRAY),
            ("Down", layout["down"], MID_GRAY),
        ):
            pygame.draw.rect(self.screen, color, rect)
            label_font = self.wifi_font if key in {"Refresh", "Connect", "Back"} else self.small_font
            label = label_font.render(key, True, WHITE)
            self.screen.blit(label, label.get_rect(center=rect.center))

    def draw_wifi_password(self):
        layout = self.get_wifi_password_layout()
        self.screen.fill(BLACK)

        title = self.title_font.render("Connect Wi-Fi", True, WHITE)
        self.screen.blit(title, (20, 10))

        selected_text = self.small_font.render(
            f"Enter password for: {self.wifi_selected_ssid or 'none'}",
            True,
            WHITE,
        )
        self.screen.blit(selected_text, (layout["selected"].x, layout["selected"].y))

        pygame.draw.rect(self.screen, WHITE, layout["password"], 2)
        password_text = self.wifi_font.render(self.wifi_password or " ", True, WHITE)
        self.screen.blit(password_text, (layout["password"].x + 10, layout["password"].y + 8))

        for key, rect, color in (
            ("Connect", layout["connect"], GREEN),
            ("Back", layout["back"], RED),
        ):
            pygame.draw.rect(self.screen, color, rect)
            label = self.wifi_font.render(key, True, WHITE)
            self.screen.blit(label, label.get_rect(center=rect.center))

        keyboard_rect = layout["keyboard"]
        rows = self.get_wifi_rows()
        row_height = keyboard_rect.height / len(rows)
        for row_index, row in enumerate(rows):
            key_width = keyboard_rect.width / len(row)
            for col_index, (label, _value) in enumerate(row):
                rect = pygame.Rect(
                    int(keyboard_rect.x + col_index * key_width + 2),
                    int(keyboard_rect.y + row_index * row_height + 2),
                    int(key_width - 4),
                    int(row_height - 4),
                )
                pygame.draw.rect(self.screen, MID_GRAY, rect)
                text_surface = self.small_font.render(label, True, WHITE)
                self.screen.blit(text_surface, text_surface.get_rect(center=rect.center))

    def draw_poweroff(self):
        asset_pack = self.assets["poweroff"]
        asset = asset_pack["pressed"].get(self.pressed_button) if self.pressed_button else asset_pack["default"]
        if asset is None:
            self.draw_missing("menu/PowerOff_Menu.png")
            return
        self.screen.blit(asset, (0, 0))
        title_line_1 = "Do you really want to"
        title_line_2 = "turn off Raspberry Pi TV?"
        line_1 = self.poweroff_title_font.render(title_line_1, True, WHITE)
        line_2 = self.poweroff_title_font.render(title_line_2, True, WHITE)
        shadow_1 = self.poweroff_title_font.render(title_line_1, True, BLACK)
        shadow_2 = self.poweroff_title_font.render(title_line_2, True, BLACK)
        self.screen.blit(shadow_1, shadow_1.get_rect(center=(self.width // 2 + 1, 38 + 1)))
        self.screen.blit(shadow_2, shadow_2.get_rect(center=(self.width // 2 + 1, 78 + 1)))
        self.screen.blit(line_1, line_1.get_rect(center=(self.width // 2, 38)))
        self.screen.blit(line_2, line_2.get_rect(center=(self.width // 2, 78)))

    def draw_loading_video(self):
        if self.loading_asset is not None:
            self.screen.blit(self.loading_asset, (0, 0))
        else:
            self.screen.fill(BLACK)
        if self.loading_spinner_asset is not None:
            self.loading_rotation = (self.loading_rotation + 2) % 360
            rotated = pygame.transform.rotozoom(self.loading_spinner_asset, -self.loading_rotation, 0.42)
            rotated_rect = rotated.get_rect(center=(self.width // 2, self.height // 2))
            self.screen.blit(rotated, rotated_rect)

        title = self.title_font.render("Loading...", True, WHITE)
        self.screen.blit(title, title.get_rect(center=(self.width // 2, self.height - 64)))

    def draw_top_back_button(self):
        back_rect = self.get_top_back_rect()
        back_asset = self.play_exit_assets["pressed"] if self.pressed_button == "top-back" else self.play_exit_assets["default"]
        if back_asset is not None:
            self.screen.blit(back_asset, back_rect)

    def draw_play(self):
        asset_pack = self.assets["play"]
        asset = asset_pack["pressed"].get(self.pressed_button) if self.pressed_button in {"random", "browse"} else asset_pack["default"]
        if asset is None:
            self.draw_missing("menu/PlayMenu.png")
            return
        self.screen.blit(asset, (0, 0))

        exit_rect = self.get_play_button_rects()["exit"]
        exit_asset = self.play_exit_assets["pressed"] if self.pressed_button == "exit" else self.play_exit_assets["default"]
        if exit_asset is not None:
            self.screen.blit(exit_asset, exit_rect)

        title = self.play_title_font.render("What to Watch", True, WHITE)
        random_text = self.play_label_font.render("Random", True, WHITE)
        browse_text = self.play_label_font.render("Browse", True, WHITE)

        self.screen.blit(title, title.get_rect(center=(self.width // 2 + 6, 106)))
        self.screen.blit(random_text, random_text.get_rect(center=(372, 258)))
        self.screen.blit(browse_text, browse_text.get_rect(center=(372, 387)))

    def draw_browser(self):
        layout = self.get_browser_layout()
        self.screen.fill(BLACK)

        selected_entry = self.get_selected_browser_entry()
        action_label = "View"
        if selected_entry:
            action_label = "View" if selected_entry["action"] == "view" else "Browse"

        for key, rect, color in (
            ("Back", layout["back"], RED),
            ("Up", layout["up"], MID_GRAY),
            ("Down", layout["down"], MID_GRAY),
            ("Close", layout["close"], RED),
        ):
            pygame.draw.rect(self.screen, color, rect)
            label = self.small_font.render(key, True, WHITE)
            self.screen.blit(label, label.get_rect(center=rect.center))

        for key, rect, color in ((action_label, layout["action"], GREEN if selected_entry else MID_GRAY),):
            pygame.draw.rect(self.screen, color, rect)
            label = self.wifi_font.render(key, True, WHITE)
            self.screen.blit(label, label.get_rect(center=rect.center))

        path_text = self.truncate_text(f"Path: {self.rel_browser_path()}", self.small_font, layout["path"].width)
        path_surface = self.small_font.render(path_text, True, WHITE)
        self.screen.blit(path_surface, (layout["path"].x, layout["path"].y + 11))

        pygame.draw.rect(self.screen, DARK_GRAY, layout["list"])
        row_height = layout["list"].height / BROWSE_VISIBLE_ITEMS
        visible_entries = self.browser_entries[self.browser_page_start:self.browser_page_start + BROWSE_VISIBLE_ITEMS]
        for row_offset, entry in enumerate(visible_entries):
            index = self.browser_page_start + row_offset
            row_rect = pygame.Rect(
                layout["list"].x + 6,
                int(layout["list"].y + 6 + row_offset * row_height),
                layout["list"].width - 12,
                int(row_height - 8),
            )
            selected = index == self.browser_selected_index
            pygame.draw.rect(self.screen, MID_GRAY if selected else DARK_GRAY, row_rect)
            if entry["type"] == "parent":
                entry_label = ".."
                meta_label = "Go up"
            else:
                prefix = "[DIR] " if entry["type"] == "directory" else "[VID] "
                entry_label = prefix + entry["label"]
                if entry["type"] == "directory":
                    noun = "video" if entry["video_count"] == 1 else "videos"
                    meta_label = f"{entry['video_count']} {noun} · {entry['action'].title()}"
                else:
                    meta_label = "Single video"

            entry_surface = self.browser_bold_font.render(
                self.truncate_text(entry_label, self.browser_bold_font, row_rect.width - 20),
                True,
                WHITE,
            )
            meta_surface = self.small_font.render(
                self.truncate_text(meta_label, self.small_font, row_rect.width - 20),
                True,
                GRAY,
            )
            self.screen.blit(entry_surface, (row_rect.x + 10, row_rect.y + 6))
            self.screen.blit(meta_surface, (row_rect.x + 10, row_rect.y + 35))

        status_surface = self.small_font.render(self.browser_status, True, GRAY)
        self.screen.blit(status_surface, (20, self.height - 18))

    def draw(self):
        if self.state == "main":
            asset_pack = self.assets["main"]
            asset = asset_pack["pressed"].get(self.pressed_button) if self.pressed_button else asset_pack["default"]
            if asset is None:
                self.draw_missing("menu/Main_Menu.png")
            else:
                self.screen.blit(asset, (0, 0))
        elif self.state == "more":
            asset_pack = self.assets["more"]
            asset = asset_pack["pressed"].get(self.pressed_button) if self.pressed_button else asset_pack["default"]
            if asset is None:
                self.draw_missing("menu/Screen_MoreOptions.png")
            else:
                self.screen.blit(asset, (0, 0))
        elif self.state == "qr":
            if self.qr_asset is None:
                self.refresh_qr_asset()
            if self.qr_asset is None:
                self.draw_missing("QR")
            else:
                self.screen.blit(self.qr_asset, (0, 0))
                self.draw_top_back_button()
        elif self.state == "clock":
            self.draw_clock()
            self.draw_top_back_button()
        elif self.state == "loading_video":
            self.draw_loading_video()
        elif self.state == "video":
            return
        elif self.state == "play":
            self.draw_play()
        elif self.state == "browse":
            self.draw_browser()
        elif self.state == "wifi":
            self.draw_wifi()
        elif self.state == "wifi_password":
            self.draw_wifi_password()
        elif self.state == "poweroff":
            self.draw_poweroff()

        pygame.display.flip()

    def run(self):
        play_intro()

        while self.running:
            self.update_video_state()
            self.poll_native_touch()
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False
                elif event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                    self.running = False
                elif self.touch_device is None and event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    self.handle_touch_down(event.pos)
                elif self.touch_device is None and event.type == pygame.MOUSEBUTTONUP and event.button == 1:
                    self.handle_touch_up(event.pos)

            self.draw()
            self.clock.tick(30)

        pygame.quit()


if __name__ == "__main__":
    try:
        RaspberryPiTVMenu().run()
    except KeyboardInterrupt:
        pygame.quit()
        sys.exit(0)
    except pygame.error as exc:
        print(f"pygame failed to initialize the display: {exc}", file=sys.stderr)
        pygame.quit()
        sys.exit(1)
