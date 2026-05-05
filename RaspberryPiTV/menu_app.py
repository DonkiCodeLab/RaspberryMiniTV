import json
import os
import random
import select
import socket
import subprocess
import sys
import tempfile
import time
from datetime import datetime

DESKTOP_PREVIEW = os.environ.get("SIMPSONSTV_DESKTOP_PREVIEW") == "1" or sys.platform == "darwin"

if not DESKTOP_PREVIEW:
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
SETTINGS_MENU_PATH = os.path.join(MENU_DIR, "Settings_Menu.png")
LANGUAGE_MENU_PATH = os.path.join(MENU_DIR, "Language_Menu.png")
PLAY_EXIT_NORMAL_PATH = os.path.join(MENU_DIR, "button_exit_normal.png")
PLAY_EXIT_PRESSED_PATH = os.path.join(MENU_DIR, "button_exit_pressed.png")
LOADING_VIDEO_PATH = os.path.join(MENU_DIR, "Loading_Video_Animation.png")
LOADING_VIDEO_SPINNER_PATH = os.path.join(MENU_DIR, "loading.png")
INTRO_VIDEO_PATH = os.path.join(MENU_DIR, "video_intro.mp4")
CLEAR_ICON_PATH = os.path.join(MENU_DIR, "clear.png")
BACKSPACE_ICON_PATH = os.path.join(MENU_DIR, "backspace.png")
SAVE_PIN_NORMAL_PATH = os.path.join(MENU_DIR, "save_pin_normal.png")
SAVE_PIN_PRESSED_PATH = os.path.join(MENU_DIR, "save_pin_pressed.png")
ARROW_UP_NORMAL_PATH = os.path.join(MENU_DIR, "arrow_up_normal.png")
ARROW_UP_PRESSED_PATH = os.path.join(MENU_DIR, "arrow_up_pressed.png")
ARROW_DOWN_NORMAL_PATH = os.path.join(MENU_DIR, "arrow_down_normal.png")
ARROW_DOWN_PRESSED_PATH = os.path.join(MENU_DIR, "arrow_down_pressed.png")
WIFI_BUTTON_NORMAL_PATH = os.path.join(MENU_DIR, "Wifi_Button_normal.png")
WIFI_BUTTON_PRESSED_PATH = os.path.join(MENU_DIR, "Wifi_Button_pressed.png")
ICON_CONNECT_NORMAL_PATH = os.path.join(MENU_DIR, "icon_connect_normal.png")
ICON_CONNECT_PRESSED_PATH = os.path.join(MENU_DIR, "icon_connect_pressed.png")
ICON_UPDATE_NORMAL_PATH = os.path.join(MENU_DIR, "icon_update_normal.png")
ICON_UPDATE_PRESSED_PATH = os.path.join(MENU_DIR, "icon_update_pressed.png")
FOLDER_EXPLORER_NORMAL_PATH = os.path.join(MENU_DIR, "folder_explorer_normal.png")
FOLDER_EXPLORER_PRESSED_PATH = os.path.join(MENU_DIR, "folder_explorer_pressed.png")
ICON_PLAY_NORMAL_PATH = os.path.join(MENU_DIR, "icon_play_normal.png")
ICON_PLAY_PRESSED_PATH = os.path.join(MENU_DIR, "icon_play_pressed.png")
EMPTY_ICON_PATH = os.path.join(MENU_DIR, "empty.png")
TOUCH_DEVICE_PATH = "/dev/input/event0"
QR_PNG = "/tmp/simpsonstv_qr.png"
TRANSLATIONS_PATH = os.path.join(BASE_DIR, "translations.json")
USER_SETTINGS_PATH = os.path.join(BASE_DIR, "user_settings.json")
WIFI_DEBUG_LOG_PATH = os.path.join(BASE_DIR, "wifi_debug.log")
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
BACK_BUTTON_SCALE = 1.3
BROWSE_VISIBLE_ITEMS = 5
LOADING_MIN_DURATION_MS = 1000
MPV_SOCKET_PATH = os.path.join(tempfile.gettempdir(), "simpsonstv-mpv.sock")
MPV_SCREENSHOT_PATH = os.path.join(tempfile.gettempdir(), "simpsonstv-video-preview.png")
MPV_DEBUG_LOG_PATH = os.path.join(tempfile.gettempdir(), "raspberrypitv-mpv.log")
DEFAULT_SETTINGS = {
    "language": "en",
    "web_password": "1234",
}
LANGUAGE_BUTTON_MAP = {
    "1x1": "en",
    "1x2": "ca",
    "2x1": "es",
}


def ensure_screen_on():
    if DESKTOP_PREVIEW:
        return
    subprocess.run(["raspi-gpio", "set", "19", "op", "a5"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    subprocess.run(["raspi-gpio", "set", "18", "op", "dh"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


def log_debug(message):
    print(f"[menu-debug] {message}", flush=True)


def log_wifi_debug(event, **fields):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    parts = [f"{key}={value}" for key, value in fields.items() if value not in (None, "")]
    line = f"[{timestamp}] {event}"
    if parts:
        line += " | " + " | ".join(parts)
    try:
        with open(WIFI_DEBUG_LOG_PATH, "a", encoding="utf-8") as handle:
            handle.write(line + "\n")
    except Exception:
        pass
    log_debug(line)


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
    if DESKTOP_PREVIEW:
        return
    if not os.path.isfile(INTRO_VIDEO_PATH):
        return

    subprocess.run(
        ["omxplayer", "--no-osd", "--aspect-mode", "fill", INTRO_VIDEO_PATH],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )


def generate_qr():
    url = f"http://{get_local_ip()}:{PORT}"
    if DESKTOP_PREVIEW:
        return url
    subprocess.run(
        ["qrencode", "-o", QR_PNG, "-s", "12", "-m", "2", url],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return url


def run_command(command):
    try:
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False)
        return result
    except FileNotFoundError as exc:
        return subprocess.CompletedProcess(command, 127, "", str(exc))


def get_wifi_ipv4(interface="wlan0"):
    result = run_command(["ip", "-4", "addr", "show", interface])
    if result.returncode != 0:
        return None
    for line in result.stdout.splitlines():
        line = line.strip()
        if line.startswith("inet "):
            return line.split()[1].split("/", 1)[0]
    return None


def load_json_file(path, fallback):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, type(fallback)) else fallback
    except Exception:
        return fallback


def save_json_file(path, payload):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)


def is_video_file(filename):
    return filename.lower().endswith((".mp4", ".m4v", ".mov", ".mkv"))


def remove_path_if_exists(path):
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
    except Exception:
        pass


def append_debug_log(path, message):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(f"[{timestamp}] {message}\n")
    except Exception:
        pass


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


def classify_wifi_error(stdout, stderr):
    combined = f"{stdout}\n{stderr}".lower()
    if any(token in combined for token in ["secrets were required", "wrong password", "bad password", "authentication", "802-11-wireless-security.key-mgmt"]):
        return "Contrasena incorrecta o autenticacion fallida."
    if any(token in combined for token in ["no network with ssid", "network not found", "not found"]):
        return "La red Wi-Fi ya no esta disponible."
    if any(token in combined for token in ["timeout", "timed out"]):
        return "Tiempo de espera agotado al conectar."
    if any(token in combined for token in ["failed to activate", "could not activate", "activation failed"]):
        return "La Raspberry no pudo activar la conexion Wi-Fi."
    if any(token in combined for token in ["networkmanager", "nmcli"]) and "not found" in combined:
        return "NetworkManager no esta disponible."
    return "No se pudo conectar a la red Wi-Fi."


def connect_wifi(ssid, password):
    if not ssid:
        return False, "Selecciona una red Wi-Fi primero."

    nmcli_base = ["nmcli", "dev", "wifi", "connect", ssid]
    if password:
        nmcli_base.extend(["password", password])
    log_wifi_debug("wifi_connect_start", ssid=ssid, has_password=bool(password))
    nmcli_result = run_command(nmcli_base)
    log_wifi_debug(
        "wifi_connect_nmcli",
        ssid=ssid,
        returncode=nmcli_result.returncode,
        stdout=(nmcli_result.stdout or "").strip(),
        stderr=(nmcli_result.stderr or "").strip(),
    )
    if nmcli_result.returncode == 0:
        return wait_for_wifi_connection(ssid)

    if password:
        add_result = run_command(["wpa_cli", "-i", "wlan0", "add_network"])
        network_id = add_result.stdout.strip()
        log_wifi_debug(
            "wifi_connect_wpa_add_network",
            ssid=ssid,
            returncode=add_result.returncode,
            stdout=(add_result.stdout or "").strip(),
            stderr=(add_result.stderr or "").strip(),
            network_id=network_id,
        )
        if add_result.returncode == 0 and network_id.isdigit():
            run_command(["wpa_cli", "-i", "wlan0", "set_network", network_id, "ssid", f'"{ssid}"'])
            run_command(["wpa_cli", "-i", "wlan0", "set_network", network_id, "psk", f'"{password}"'])
            run_command(["wpa_cli", "-i", "wlan0", "enable_network", network_id])
            save_result = run_command(["wpa_cli", "-i", "wlan0", "save_config"])
            log_wifi_debug(
                "wifi_connect_wpa_save",
                ssid=ssid,
                returncode=save_result.returncode,
                stdout=(save_result.stdout or "").strip(),
                stderr=(save_result.stderr or "").strip(),
            )
            if save_result.returncode == 0:
                return wait_for_wifi_connection(ssid)

    stderr = (nmcli_result.stderr or "").strip()
    stdout = (nmcli_result.stdout or "").strip()
    return False, classify_wifi_error(stdout, stderr)


def wait_for_wifi_connection(expected_ssid, timeout_seconds=12, interval_seconds=1):
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        current_ssid = get_connected_wifi_info()
        current_ip = get_wifi_ipv4()
        log_wifi_debug("wifi_connect_poll", expected_ssid=expected_ssid, current_ssid=current_ssid, current_ip=current_ip)
        if current_ssid == expected_ssid:
            if current_ip:
                return True, f"Conectado a {expected_ssid} ({current_ip})"
            return False, f"Conectado a {expected_ssid}, pero sin direccion IP."
        time.sleep(interval_seconds)
    return False, f"No se pudo confirmar la conexion a {expected_ssid}."


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


def fit_image_contain(image, size):
    if image is None:
        return None
    src_width, src_height = image.get_size()
    max_width, max_height = size
    if src_width <= 0 or src_height <= 0 or max_width <= 0 or max_height <= 0:
        return None
    scale = min(max_width / src_width, max_height / src_height)
    target_size = (max(1, int(src_width * scale)), max(1, int(src_height * scale)))
    return pygame.transform.smoothscale(image, target_size)


def draw_rect_compat(surface, color, rect, width=0, border_radius=0):
    try:
        if border_radius:
            pygame.draw.rect(surface, color, rect, width, border_radius)
        else:
            pygame.draw.rect(surface, color, rect, width)
    except TypeError:
        pygame.draw.rect(surface, color, rect, width)


def blit_centered(surface, image, width, height):
    rect = image.get_rect(center=(width // 2, height // 2))
    surface.blit(image, rect)


class RaspberryPiTVMenu:
    def __init__(self):
        ensure_screen_on()
        pygame.display.init()
        pygame.font.init()
        if DESKTOP_PREVIEW:
            self.screen = pygame.display.set_mode((BASE_WIDTH, BASE_HEIGHT))
        else:
            self.screen = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)
        pygame.mouse.set_visible(DESKTOP_PREVIEW)
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
        self.translations = load_json_file(TRANSLATIONS_PATH, {})
        self.config = self.load_settings()
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
            "settings": self.prepare_screen_assets(
                SETTINGS_MENU_PATH,
                {
                    "1x1": os.path.join(MENU_DIR, "Settings_Menu_Button_1x1_Pressed.png"),
                    "1x2": os.path.join(MENU_DIR, "Settings_Menu_Button_1x2_Pressed.png"),
                    "2x1": os.path.join(MENU_DIR, "Settings_Menu_Button_2x1_Pressed.png"),
                    "2x2": os.path.join(MENU_DIR, "Settings_Menu_Button_2x2_Pressed.png"),
                },
            ),
            "language": self.prepare_named_fullscreen_assets(
                {
                    "1x1": {
                        "normal": os.path.join(MENU_DIR, "Language_Menu_Button_1x1_Normal.png"),
                        "pressed": os.path.join(MENU_DIR, "Language_Menu_Button_1x1_Pressed.png"),
                        "selected": os.path.join(MENU_DIR, "Language_Menu_Button_1x1_Selected.png"),
                    },
                    "1x2": {
                        "normal": os.path.join(MENU_DIR, "Language_Menu_Button_1x2_Normal.png"),
                        "pressed": os.path.join(MENU_DIR, "Language_Menu_Button_1x2_Pressed.png"),
                        "selected": os.path.join(MENU_DIR, "Language_Menu_Button_1x2_Selected.png"),
                    },
                    "2x1": {
                        "normal": os.path.join(MENU_DIR, "Language_Menu_Button_2x1_Normal.png"),
                        "pressed": os.path.join(MENU_DIR, "Language_Menu_Button_2x1_Pressed.png"),
                        "selected": os.path.join(MENU_DIR, "Language_Menu_Button_2x1_Selected.png"),
                    },
                    "2x2": {
                        "normal": os.path.join(MENU_DIR, "Language_Menu_Button_2x2_Normal.png"),
                        "pressed": os.path.join(MENU_DIR, "Language_Menu_Button_2x2_Pressed.png"),
                    },
                }
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
        self.wifi_selected_index = 0
        self.current_wifi_ssid = None
        self.wifi_password = ""
        self.wifi_status = ""
        self.wifi_dialog_message = ""
        self.wifi_dialog_is_error = False
        self.wifi_page_start = 0
        self.wifi_keyboard_upper = True
        self.web_pin_value = self.config.get("web_password", DEFAULT_SETTINGS["web_password"])
        self.play_status = ""
        self.browser_path = VIDEOS_DIR
        self.browser_selected_index = 0
        self.browser_page_start = 0
        self.browser_entries = []
        self.browser_status = ""
        self.loading_asset = self.prepare_asset(LOADING_VIDEO_PATH)
        self.loading_spinner_asset = load_image(LOADING_VIDEO_SPINNER_PATH)
        self.web_pin_icons = {
            "CLEAR": load_image(CLEAR_ICON_PATH),
            "BACKSPACE": load_image(BACKSPACE_ICON_PATH),
        }
        wifi_layout = self.get_wifi_layout()
        self.wifi_assets = {
            "up": {
                "normal": self.prepare_button_asset(ARROW_UP_NORMAL_PATH, wifi_layout["up"]),
                "pressed": self.prepare_button_asset(ARROW_UP_PRESSED_PATH, wifi_layout["up"]),
            },
            "down": {
                "normal": self.prepare_button_asset(ARROW_DOWN_NORMAL_PATH, wifi_layout["down"]),
                "pressed": self.prepare_button_asset(ARROW_DOWN_PRESSED_PATH, wifi_layout["down"]),
            },
            "refresh": {
                "normal": self.prepare_button_asset(WIFI_BUTTON_NORMAL_PATH, wifi_layout["refresh"]),
                "pressed": self.prepare_button_asset(WIFI_BUTTON_PRESSED_PATH, wifi_layout["refresh"]),
            },
            "connect": {
                "normal": self.prepare_button_asset(WIFI_BUTTON_NORMAL_PATH, wifi_layout["connect"]),
                "pressed": self.prepare_button_asset(WIFI_BUTTON_PRESSED_PATH, wifi_layout["connect"]),
            },
        }
        self.wifi_arrow_icons = {
            "up": {
                "normal": load_image(ARROW_UP_NORMAL_PATH),
                "pressed": load_image(ARROW_UP_PRESSED_PATH),
            },
            "down": {
                "normal": load_image(ARROW_DOWN_NORMAL_PATH),
                "pressed": load_image(ARROW_DOWN_PRESSED_PATH),
            },
        }
        self.wifi_button_icons = {
            "refresh": {
                "normal": load_image(ICON_UPDATE_NORMAL_PATH),
                "pressed": load_image(ICON_UPDATE_PRESSED_PATH),
            },
            "connect": {
                "normal": load_image(ICON_CONNECT_NORMAL_PATH),
                "pressed": load_image(ICON_CONNECT_PRESSED_PATH),
            },
        }
        browser_layout = self.get_browser_layout()
        self.browser_assets = {
            "up": {
                "normal": self.prepare_button_asset(ARROW_UP_NORMAL_PATH, browser_layout["up"]),
                "pressed": self.prepare_button_asset(ARROW_UP_PRESSED_PATH, browser_layout["up"]),
            },
            "down": {
                "normal": self.prepare_button_asset(ARROW_DOWN_NORMAL_PATH, browser_layout["down"]),
                "pressed": self.prepare_button_asset(ARROW_DOWN_PRESSED_PATH, browser_layout["down"]),
            },
            "action": {
                "normal": self.prepare_button_asset(WIFI_BUTTON_NORMAL_PATH, browser_layout["action"]),
                "pressed": self.prepare_button_asset(WIFI_BUTTON_PRESSED_PATH, browser_layout["action"]),
            },
        }
        self.browser_icons = {
            "browse": {
                "normal": load_image(FOLDER_EXPLORER_NORMAL_PATH),
                "pressed": load_image(FOLDER_EXPLORER_PRESSED_PATH),
            },
            "view": {
                "normal": load_image(ICON_PLAY_NORMAL_PATH),
                "pressed": load_image(ICON_PLAY_PRESSED_PATH),
            },
            "empty": load_image(EMPTY_ICON_PATH),
        }
        web_pin_layout = self.get_web_pin_layout()
        self.save_pin_assets = {
            "normal": self.prepare_button_asset(SAVE_PIN_NORMAL_PATH, web_pin_layout["save"]),
            "pressed": self.prepare_button_asset(SAVE_PIN_PRESSED_PATH, web_pin_layout["save"]),
        }
        self.loading_video_path = None
        self.loading_video_start_seconds = 0.0
        self.loading_return_state = "play"
        self.loading_started_at = 0
        self.loading_rotation = 0
        self.video_proc = None
        self.video_log_handle = None
        self.video_current_path = ""
        self.video_return_state = "play"
        self.video_now_playing = ""
        self.video_preview_seconds = 0.0
        self.video_preview_asset = None
        self.video_preview_path = ""
        self.video_preview_available = False
        self.refresh_translated_state_texts()
        log_debug(f"SCREEN size={self.width}x{self.height}")
        for button_id, rect in self.get_button_rects().items():
            log_debug(f"BUTTON {button_id} rect={rect}")
        self.setup_touch_input()

    def load_settings(self):
        loaded = load_json_file(USER_SETTINGS_PATH, {})
        settings = dict(DEFAULT_SETTINGS)
        if isinstance(loaded, dict):
            settings.update({key: value for key, value in loaded.items() if key in settings and isinstance(value, str)})
        if not os.path.isfile(USER_SETTINGS_PATH):
            save_json_file(USER_SETTINGS_PATH, settings)
        return settings

    def save_settings(self):
        save_json_file(USER_SETTINGS_PATH, self.config)

    def tr(self, key, **kwargs):
        language = self.config.get("language", "en")
        table = self.translations.get(language) or self.translations.get("en") or {}
        value = table.get(key) or key
        try:
            return value.format(**kwargs)
        except Exception:
            return value

    def refresh_translated_state_texts(self):
        self.wifi_status = self.tr("wifi.scan_prompt")
        self.play_status = self.tr("play.choose")
        self.browser_status = self.tr("browser.select")

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

    def prepare_named_button_assets(self, asset_paths):
        assets = {}
        button_rects = self.get_button_rects()
        for button_id, states in asset_paths.items():
            rect = button_rects[button_id]
            assets[button_id] = {
                state_name: self.prepare_button_asset(path, rect) for state_name, path in states.items()
            }
        return assets

    def prepare_named_fullscreen_assets(self, asset_paths):
        assets = {}
        for button_id, states in asset_paths.items():
            assets[button_id] = {
                state_name: self.prepare_asset(path) for state_name, path in states.items()
            }
        return assets

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
        qr_surface = pygame.Surface((self.width, self.height))
        qr_surface.fill(BLACK)

        title = self.title_font.render(self.tr("qr.title"), True, WHITE)
        subtitle = self.font.render(self.qr_url, True, WHITE)
        wifi_line = self.small_font.render(
            self.tr("qr.wifi_connected", ssid=connected_wifi) if connected_wifi else self.tr("qr.wifi_not_connected"),
            True,
            WHITE,
        )

        qr = load_image(QR_PNG)
        if qr is not None:
            qr_size = min(self.width, self.height) // 2
            qr_scaled = fit_image(qr, (qr_size, qr_size))
            qr_rect = qr_scaled.get_rect(center=(self.width // 2, self.height // 2 + 5))
            qr_surface.blit(qr_scaled, qr_rect)
            subtitle_y = qr_rect.bottom + 44
            wifi_y = qr_rect.bottom + 78
        else:
            fallback_box = pygame.Rect(110, 120, self.width - 220, 150)
            draw_rect_compat(qr_surface, DARK_GRAY, fallback_box, 0, 24)
            draw_rect_compat(qr_surface, MID_GRAY, fallback_box, 2, 24)
            fallback_label = self.font.render(self.qr_url, True, WHITE)
            qr_surface.blit(fallback_label, fallback_label.get_rect(center=fallback_box.center))
            subtitle_y = fallback_box.bottom + 38
            wifi_y = fallback_box.bottom + 68

        qr_surface.blit(title, title.get_rect(center=(self.width // 2, 42)))
        qr_surface.blit(subtitle, subtitle.get_rect(center=(self.width // 2, subtitle_y)))
        qr_surface.blit(wifi_line, wifi_line.get_rect(center=(self.width // 2, wifi_y)))
        self.qr_asset = qr_surface.convert()

    def refresh_wifi_networks(self):
        self.wifi_networks = scan_wifi_networks()
        self.current_wifi_ssid = get_connected_wifi_info()
        self.wifi_page_start = 0
        if self.wifi_selected_ssid and not any(item["ssid"] == self.wifi_selected_ssid for item in self.wifi_networks):
            self.wifi_selected_ssid = None
        if self.wifi_selected_ssid:
            for index, item in enumerate(self.wifi_networks):
                if item["ssid"] == self.wifi_selected_ssid:
                    self.wifi_selected_index = index
                    break
        elif self.wifi_networks:
            self.wifi_selected_index = 0
            self.wifi_selected_ssid = self.wifi_networks[0]["ssid"]
        else:
            self.wifi_selected_index = 0
        self.wifi_status = self.tr("wifi.networks_found", count=len(self.wifi_networks)) if self.wifi_networks else self.tr("wifi.no_networks")

    def get_wifi_layout(self):
        list_rect = pygame.Rect(20, 108, 490, 236)
        arrow_width = 81
        arrow_height = 55
        arrow_gap = 18
        group_height = (arrow_height * 2) + arrow_gap
        group_top = int(list_rect.centery - group_height / 2)
        arrow_x = list_rect.right + 18
        button_height = 56
        bottom_y = int(list_rect.bottom + ((self.height - list_rect.bottom - button_height) / 2))
        refresh_width = 238
        connect_width = 238
        return {
            "list": list_rect,
            "up": pygame.Rect(arrow_x, group_top, arrow_width, arrow_height),
            "down": pygame.Rect(arrow_x, group_top + arrow_height + arrow_gap, arrow_width, arrow_height),
            "refresh": pygame.Rect(list_rect.x, bottom_y, refresh_width, button_height),
            "connect": pygame.Rect(list_rect.right - connect_width, bottom_y, connect_width, button_height),
        }

    def get_wifi_password_layout(self):
        return {
            "selected": pygame.Rect(20, 70, self.width - 40, 34),
            "password": pygame.Rect(20, 112, self.width - 40, 48),
            "connect": pygame.Rect((self.width - 238) // 2, 180, 238, 56),
            "keyboard": pygame.Rect(20, 252, self.width - 40, self.height - 272),
            "dialog": pygame.Rect(66, 138, self.width - 132, 150),
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
            [(char, char) for char in letters[2]] + [(".", "."), ("Aa" if self.wifi_keyboard_upper else "aA", "TOGGLE_CASE"), (self.tr("common.clear"), "CLEAR")],
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

    def inflate_rect(self, rect, scale):
        center = rect.center
        width = int(rect.width * scale)
        height = int(rect.height * scale)
        inflated = pygame.Rect(0, 0, width, height)
        inflated.center = center
        return inflated

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
        exit_rect = self.inflate_rect(self.scale_rect(*PLAY_EXIT_LAYOUT), BACK_BUTTON_SCALE)
        return {
            "exit": exit_rect,
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
        list_rect = pygame.Rect(20, 108, 490, 236)
        arrow_width = 81
        arrow_height = 55
        arrow_gap = 18
        group_height = (arrow_height * 2) + arrow_gap
        group_top = int(list_rect.centery - group_height / 2)
        arrow_x = list_rect.right + 18
        button_width = 238
        button_height = 56
        action_y = int(list_rect.bottom + ((self.height - list_rect.bottom - button_height) / 2))
        return {
            "path": pygame.Rect(132, 24, self.width - 152, 34),
            "list": list_rect,
            "up": pygame.Rect(arrow_x, group_top, arrow_width, arrow_height),
            "down": pygame.Rect(arrow_x, group_top + arrow_height + arrow_gap, arrow_width, arrow_height),
            "action": pygame.Rect((self.width - button_width) // 2, action_y, button_width, button_height),
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
            self.browser_status = self.tr("browser.no_videos")
            return

        self.browser_selected_index = max(0, min(self.browser_selected_index, len(self.browser_entries) - 1))
        max_start = max(0, len(self.browser_entries) - BROWSE_VISIBLE_ITEMS)
        self.browser_page_start = min(self.browser_page_start, max_start)
        if self.browser_selected_index < self.browser_page_start:
            self.browser_page_start = self.browser_selected_index
        if self.browser_selected_index >= self.browser_page_start + BROWSE_VISIBLE_ITEMS:
            self.browser_page_start = self.browser_selected_index - BROWSE_VISIBLE_ITEMS + 1
        self.browser_status = self.tr("browser.select")

    def move_browser_selection(self, delta):
        if not self.browser_entries:
            return
        self.browser_selected_index = max(0, min(len(self.browser_entries) - 1, self.browser_selected_index + delta))
        if self.browser_selected_index < self.browser_page_start:
            self.browser_page_start = self.browser_selected_index
        if self.browser_selected_index >= self.browser_page_start + BROWSE_VISIBLE_ITEMS:
            self.browser_page_start = self.browser_selected_index - BROWSE_VISIBLE_ITEMS + 1

    def can_move_browser_up(self):
        return bool(self.browser_entries) and self.browser_selected_index > 0

    def can_move_browser_down(self):
        return bool(self.browser_entries) and self.browser_selected_index < len(self.browser_entries) - 1

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
        self.loading_video_start_seconds = 0.0
        self.loading_started_at = pygame.time.get_ticks()
        self.video_current_path = full_path
        self.video_now_playing = os.path.basename(full_path)
        self.state = "loading_video"

    def start_random_video(self):
        all_videos = self.get_entry_video_files(VIDEOS_DIR)
        if not all_videos:
            self.play_status = self.tr("browser.no_videos")
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
        log_debug(f"VIDEO DOWN pos={pos}")

    def handle_video_touch_up(self, pos):
        self.pressed_button = None
        log_debug(f"VIDEO TOUCH pos={pos} -> preview")
        self.capture_video_preview()

    def get_video_preview_layout(self):
        button_width = 168
        button_height = 58
        button_gap = 28
        total_width = (button_width * 2) + button_gap
        start_x = (self.width - total_width) // 2
        button_y = self.height - 88
        return {
            "play": pygame.Rect(start_x, button_y, button_width, button_height),
            "stop": pygame.Rect(start_x + button_width + button_gap, button_y, button_width, button_height),
        }

    def handle_video_preview_touch_down(self, pos):
        layout = self.get_video_preview_layout()
        if layout["play"].collidepoint(pos):
            self.pressed_button = "video-preview-play"
        elif layout["stop"].collidepoint(pos):
            self.pressed_button = "video-preview-stop"
        else:
            self.pressed_button = None

    def handle_video_preview_touch_up(self, pos):
        layout = self.get_video_preview_layout()
        active_button = self.pressed_button
        self.pressed_button = None
        if active_button == "video-preview-play" and layout["play"].collidepoint(pos):
            self.resume_video_from_preview()
            return
        if active_button == "video-preview-stop" and layout["stop"].collidepoint(pos):
            self.clear_video_preview()
            self.state = self.video_return_state

    def build_mpv_command(self, filepath, start_seconds=0.0):
        remove_path_if_exists(MPV_SOCKET_PATH)
        command = [
            "mpv",
            "--fullscreen",
            "--no-config",
            "--osc=no",
            "--osd-level=0",
            "--audio-display=no",
            "--input-default-bindings=no",
            "--input-vo-keyboard=no",
            "--input-cursor=no",
            "--really-quiet",
            f"--input-ipc-server={MPV_SOCKET_PATH}",
        ]
        if start_seconds > 0:
            command.append(f"--start={max(0.0, float(start_seconds)):.3f}")
        command.append(filepath)
        return command

    def close_video_log_handle(self):
        if self.video_log_handle is None:
            return
        try:
            self.video_log_handle.flush()
            self.video_log_handle.close()
        except Exception:
            pass
        self.video_log_handle = None

    def send_mpv_command(self, *command_parts):
        if not os.path.exists(MPV_SOCKET_PATH):
            return None
        payload = json.dumps({"command": list(command_parts)}).encode("utf-8") + b"\n"
        client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        client.settimeout(1.5)
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
        except Exception as exc:
            log_debug(f"MPV IPC failed command={command_parts}: {exc}")
            return None
        finally:
            client.close()

    def wait_for_mpv_ipc(self, timeout_seconds=2.0):
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            if os.path.exists(MPV_SOCKET_PATH):
                return True
            time.sleep(0.05)
        return False

    def get_mpv_time_pos(self):
        response = self.send_mpv_command("get_property", "time-pos")
        if not isinstance(response, dict):
            return 0.0
        value = response.get("data")
        try:
            return max(0.0, float(value or 0.0))
        except Exception:
            return 0.0

    def request_mpv_screenshot(self):
        remove_path_if_exists(MPV_SCREENSHOT_PATH)
        response = self.send_mpv_command("screenshot-to-file", MPV_SCREENSHOT_PATH, "video")
        if not isinstance(response, dict) or response.get("error") != "success":
            return False
        deadline = time.time() + 2.0
        while time.time() < deadline:
            if os.path.isfile(MPV_SCREENSHOT_PATH) and os.path.getsize(MPV_SCREENSHOT_PATH) > 0:
                return True
            time.sleep(0.05)
        return False

    def load_video_preview_asset(self):
        self.video_preview_asset = None
        if not os.path.isfile(MPV_SCREENSHOT_PATH):
            return
        image = load_image(MPV_SCREENSHOT_PATH)
        if image is None:
            return
        self.video_preview_asset = fit_image(image, (self.width, self.height))

    def clear_video_preview(self):
        self.video_preview_seconds = 0.0
        self.video_preview_asset = None
        self.video_preview_available = False
        self.video_preview_path = ""
        remove_path_if_exists(MPV_SCREENSHOT_PATH)

    def capture_video_preview(self):
        if not self.video_proc or self.video_proc.poll() is not None:
            return
        preview_seconds = self.get_mpv_time_pos()
        screenshot_ok = self.request_mpv_screenshot()
        self.send_mpv_command("quit")
        try:
            self.video_proc.wait(timeout=2.0)
        except Exception:
            try:
                self.video_proc.terminate()
            except Exception:
                pass
        self.video_proc = None
        self.close_video_log_handle()
        remove_path_if_exists(MPV_SOCKET_PATH)
        self.video_preview_seconds = preview_seconds
        self.video_preview_path = self.video_current_path
        self.video_preview_available = screenshot_ok
        self.load_video_preview_asset()
        self.state = "video_preview"

    def resume_video_from_preview(self):
        if not self.video_preview_path:
            self.state = self.video_return_state
            return
        self.loading_video_path = self.video_preview_path
        self.loading_video_start_seconds = self.video_preview_seconds
        self.loading_started_at = pygame.time.get_ticks()
        self.video_current_path = self.video_preview_path
        self.video_now_playing = os.path.basename(self.video_preview_path)
        self.clear_video_preview()
        self.state = "loading_video"

    def stop_video_playback(self, silent=False):
        proc = self.video_proc
        if proc and proc.poll() is None:
            self.send_mpv_command("quit")
            try:
                proc.wait(timeout=2.0)
            except Exception:
                try:
                    proc.terminate()
                except Exception:
                    pass
        self.close_video_log_handle()
        run_command(["pkill", "-f", "mpv"])
        remove_path_if_exists(MPV_SOCKET_PATH)
        self.video_proc = None
        self.video_current_path = ""
        self.loading_video_path = None
        self.loading_video_start_seconds = 0.0
        self.clear_video_preview()
        if not silent:
            self.state = self.video_return_state

    def maybe_start_pending_video(self):
        if self.state != "loading_video" or not self.loading_video_path:
            return
        if pygame.time.get_ticks() - self.loading_started_at < LOADING_MIN_DURATION_MS:
            return
        self.video_return_state = self.loading_return_state
        command = self.build_mpv_command(self.loading_video_path, self.loading_video_start_seconds)
        log_debug(f"VIDEO start via mpv file={self.loading_video_path} start={self.loading_video_start_seconds:.3f}")
        append_debug_log(MPV_DEBUG_LOG_PATH, f"Launching mpv: {' '.join(command)}")
        self.close_video_log_handle()
        try:
            self.video_log_handle = open(MPV_DEBUG_LOG_PATH, "a", encoding="utf-8")
            self.video_proc = subprocess.Popen(command, stdout=self.video_log_handle, stderr=self.video_log_handle)
        except Exception as exc:
            append_debug_log(MPV_DEBUG_LOG_PATH, f"Failed to launch mpv: {exc}")
            log_debug(f"VIDEO failed to launch mpv: {exc}")
            self.close_video_log_handle()
            self.video_proc = None
            self.loading_video_path = None
            self.loading_video_start_seconds = 0.0
            self.state = self.video_return_state
            return

        ipc_ready = self.wait_for_mpv_ipc()
        if not ipc_ready:
            append_debug_log(MPV_DEBUG_LOG_PATH, "mpv IPC socket was not created within 2.0s")
        time.sleep(0.15)
        if self.video_proc.poll() is not None:
            return_code = self.video_proc.returncode
            append_debug_log(MPV_DEBUG_LOG_PATH, f"mpv exited immediately with return code {return_code}")
            log_debug(f"VIDEO mpv exited immediately returncode={return_code}")
            self.close_video_log_handle()
            self.video_proc = None
            remove_path_if_exists(MPV_SOCKET_PATH)
            self.loading_video_path = None
            self.loading_video_start_seconds = 0.0
            self.state = self.video_return_state
            return
        self.loading_video_path = None
        self.loading_video_start_seconds = 0.0
        self.state = "video"

    def update_video_state(self):
        if self.state == "loading_video":
            self.maybe_start_pending_video()
            return
        if self.state == "video" and self.video_proc and self.video_proc.poll() is not None:
            return_code = self.video_proc.returncode
            append_debug_log(MPV_DEBUG_LOG_PATH, f"mpv exited with return code {return_code}")
            log_debug(f"VIDEO mpv exited returncode={return_code}")
            self.video_proc = None
            self.close_video_log_handle()
            remove_path_if_exists(MPV_SOCKET_PATH)
            self.state = self.video_return_state

    def normalize_touch_pos(self, pos):
        if DESKTOP_PREVIEW or self.touch_device is None:
            return pos
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

    def get_selected_language_code(self):
        return self.config.get("language", DEFAULT_SETTINGS["language"])

    def get_selected_language_button(self):
        selected_language = self.get_selected_language_code()
        for button_id, language_code in LANGUAGE_BUTTON_MAP.items():
            if language_code == selected_language:
                return button_id
        return "1x1"

    def set_language(self, language_code):
        if language_code == self.get_selected_language_code():
            return
        self.config["language"] = language_code
        self.save_settings()
        self.refresh_translated_state_texts()
        self.qr_asset = None

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
                self.state = "settings"
            elif button_id == "1x2":
                self.refresh_qr_asset()
                self.state = "qr"
            elif button_id == "2x1":
                self.state = "play"
            elif button_id == "2x2":
                self.state = "more"
        elif self.state == "settings":
            if button_id == "1x1":
                self.refresh_wifi_networks()
                self.state = "wifi"
            elif button_id == "1x2":
                self.web_pin_value = self.config.get("web_password", DEFAULT_SETTINGS["web_password"])
                self.state = "web_pin"
            elif button_id == "2x1":
                self.pressed_button = None
                self.state = "language"
            elif button_id == "2x2":
                self.state = "main"
        elif self.state == "language":
            if button_id == "1x1":
                self.set_language("en")
            elif button_id == "1x2":
                self.set_language("ca")
            elif button_id == "2x1":
                self.set_language("es")
            elif button_id == "2x2":
                self.state = "settings"
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
        layout = self.get_browser_layout()
        selected_entry = self.get_selected_browser_entry()
        if self.top_back_at_pos(pos):
            self.pressed_button = "top-back"
        elif self.can_move_browser_up() and layout["up"].collidepoint(pos):
            self.pressed_button = "browser-up"
        elif self.can_move_browser_down() and layout["down"].collidepoint(pos):
            self.pressed_button = "browser-down"
        elif selected_entry and layout["action"].collidepoint(pos):
            self.pressed_button = "browser-action"
        else:
            self.pressed_button = "browse-touch"
        log_debug(f"BROWSE DOWN pos={pos} path={self.rel_browser_path()} selected={self.browser_selected_index}")

    def handle_browser_touch_up(self, pos):
        active_button = self.pressed_button
        self.pressed_button = None
        layout = self.get_browser_layout()
        if active_button == "top-back" and self.top_back_at_pos(pos):
            if os.path.abspath(self.browser_path) == os.path.abspath(VIDEOS_DIR):
                self.state = "play"
            else:
                self.browser_path = os.path.dirname(self.browser_path)
                self.browser_selected_index = 0
                self.browser_page_start = 0
                self.refresh_browser_entries()
            return
        if active_button == "browser-up" and layout["up"].collidepoint(pos):
            self.move_browser_selection(-1)
            return
        if active_button == "browser-down" and layout["down"].collidepoint(pos):
            self.move_browser_selection(1)
            return

        selected_entry = self.get_selected_browser_entry()
        if active_button == "browser-action" and layout["action"].collidepoint(pos):
            self.activate_browser_entry(selected_entry)
            return

        entry_index = self.browser_entry_at_pos(pos)
        if entry_index is not None:
            self.browser_selected_index = entry_index

    def handle_wifi_touch_down(self, pos):
        if self.state == "wifi_password":
            layout = self.get_wifi_password_layout()
            if self.top_back_at_pos(pos):
                self.pressed_button = "top-back"
            elif layout["connect"].collidepoint(pos):
                self.pressed_button = "wifi-password-connect"
            else:
                key_value = self.get_keyboard_key_at(pos)
                self.pressed_button = f"wifi-password-key:{key_value}" if key_value else "wifi-touch"
            log_debug(f"WIFI DOWN pos={pos} selected={self.wifi_selected_ssid} state={self.state}")
            return

        layout = self.get_wifi_layout()
        connect_enabled = bool(self.wifi_selected_ssid) and self.wifi_selected_ssid != self.current_wifi_ssid
        if self.top_back_at_pos(pos):
            self.pressed_button = "top-back"
        elif layout["refresh"].collidepoint(pos):
            self.pressed_button = "wifi-refresh"
        elif connect_enabled and layout["connect"].collidepoint(pos):
            self.pressed_button = "wifi-connect"
        elif self.can_move_wifi_up() and layout["up"].collidepoint(pos):
            self.pressed_button = "wifi-up"
        elif self.can_move_wifi_down() and layout["down"].collidepoint(pos):
            self.pressed_button = "wifi-down"
        else:
            self.pressed_button = "wifi-touch"
        log_debug(f"WIFI DOWN pos={pos} selected={self.wifi_selected_ssid} state={self.state}")

    def move_wifi_page(self, delta):
        if not self.wifi_networks:
            return
        max_start = max(0, len(self.wifi_networks) - 4)
        self.wifi_page_start = max(0, min(max_start, self.wifi_page_start + delta))

    def can_move_wifi_up(self):
        return bool(self.wifi_networks) and self.wifi_selected_index > 0

    def can_move_wifi_down(self):
        return bool(self.wifi_networks) and self.wifi_selected_index < len(self.wifi_networks) - 1

    def move_wifi_selection(self, delta):
        if not self.wifi_networks:
            return
        self.wifi_selected_index = max(0, min(len(self.wifi_networks) - 1, self.wifi_selected_index + delta))
        self.wifi_selected_ssid = self.wifi_networks[self.wifi_selected_index]["ssid"]
        if self.wifi_selected_index < self.wifi_page_start:
            self.wifi_page_start = self.wifi_selected_index
        if self.wifi_selected_index >= self.wifi_page_start + 4:
            self.wifi_page_start = self.wifi_selected_index - 3
        self.wifi_status = self.tr("wifi.selected", ssid=self.wifi_selected_ssid)

    def handle_wifi_touch_up(self, pos):
        active_button = self.pressed_button
        self.pressed_button = None
        if self.state == "wifi":
            if self.wifi_dialog_message:
                self.wifi_dialog_message = ""
                self.wifi_dialog_is_error = False
                return
            layout = self.get_wifi_layout()
            if active_button == "top-back" and self.top_back_at_pos(pos):
                self.state = "settings"
                return
            if active_button == "wifi-refresh" and layout["refresh"].collidepoint(pos):
                self.refresh_wifi_networks()
                return
            if active_button == "wifi-up" and layout["up"].collidepoint(pos):
                self.move_wifi_selection(-1)
                return
            if active_button == "wifi-down" and layout["down"].collidepoint(pos):
                self.move_wifi_selection(1)
                return
            if active_button == "wifi-connect" and layout["connect"].collidepoint(pos):
                if self.wifi_selected_ssid:
                    if self.wifi_selected_ssid == self.current_wifi_ssid:
                        self.wifi_status = self.tr("wifi.already_connected", ssid=self.wifi_selected_ssid)
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
                    self.wifi_selected_index = index
                    self.wifi_selected_ssid = self.wifi_networks[index]["ssid"]
                    self.wifi_status = self.tr("wifi.selected", ssid=self.wifi_selected_ssid)
                return

        if self.state == "wifi_password":
            if self.wifi_dialog_message:
                was_error = self.wifi_dialog_is_error
                self.wifi_dialog_message = ""
                self.wifi_dialog_is_error = False
                if not was_error and self.current_wifi_ssid == self.wifi_selected_ssid:
                    self.state = "wifi"
                return
            layout = self.get_wifi_password_layout()
            if active_button == "top-back" and self.top_back_at_pos(pos):
                self.state = "wifi"
                return
            if active_button == "wifi-password-connect" and layout["connect"].collidepoint(pos):
                success, message = connect_wifi(self.wifi_selected_ssid, self.wifi_password)
                resolved_message = message
                self.wifi_status = resolved_message
                self.wifi_dialog_message = resolved_message
                self.wifi_dialog_is_error = not success
                if success:
                    self.refresh_wifi_networks()
                    self.refresh_qr_asset()
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

    def get_web_pin_layout(self):
        return {
            "title": pygame.Rect(20, 18, self.width - 40, 40),
            "value": pygame.Rect(104, 86, self.width - 208, 72),
            "save": pygame.Rect((self.width - 200) // 2, 176, 200, 52),
            "keyboard": pygame.Rect(80, 246, self.width - 160, self.height - 264),
        }

    def get_web_pin_rows(self):
        return [
            [("1", "1"), ("2", "2"), ("3", "3")],
            [("4", "4"), ("5", "5"), ("6", "6")],
            [("7", "7"), ("8", "8"), ("9", "9")],
            [(self.tr("common.clear"), "CLEAR"), ("0", "0"), (self.tr("common.delete"), "BACKSPACE")],
        ]

    def get_web_pin_key_at(self, pos):
        layout = self.get_web_pin_layout()
        keyboard_rect = layout["keyboard"]
        if not keyboard_rect.collidepoint(pos):
            return None
        rows = self.get_web_pin_rows()
        row_height = keyboard_rect.height / len(rows)
        row_index = max(0, min(len(rows) - 1, int((pos[1] - keyboard_rect.y) / row_height)))
        row = rows[row_index]
        key_width = keyboard_rect.width / len(row)
        col_index = max(0, min(len(row) - 1, int((pos[0] - keyboard_rect.x) / key_width)))
        return row[col_index][1]

    def handle_web_pin_touch_down(self, pos):
        if self.top_back_at_pos(pos):
            self.pressed_button = "top-back"
        else:
            layout = self.get_web_pin_layout()
            if layout["save"].collidepoint(pos) and len(self.web_pin_value) == 4:
                self.pressed_button = "web-pin-save"
                log_debug(f"WEB PIN DOWN pos={pos} value={self.web_pin_value}")
                return
            key_value = self.get_web_pin_key_at(pos)
            self.pressed_button = f"web-pin-key:{key_value}" if key_value else "web-pin-touch"
        log_debug(f"WEB PIN DOWN pos={pos} value={self.web_pin_value}")

    def handle_web_pin_touch_up(self, pos):
        active_button = self.pressed_button
        self.pressed_button = None
        layout = self.get_web_pin_layout()
        if active_button == "top-back" and self.top_back_at_pos(pos):
            self.web_pin_value = self.config.get("web_password", DEFAULT_SETTINGS["web_password"])
            self.state = "settings"
            return
        if active_button == "web-pin-save" and layout["save"].collidepoint(pos):
            if len(self.web_pin_value) == 4:
                self.config["web_password"] = self.web_pin_value
                self.save_settings()
                self.state = "settings"
            return
        key_value = self.get_web_pin_key_at(pos)
        if key_value is None:
            return
        if key_value == "CLEAR":
            self.web_pin_value = ""
        elif key_value == "BACKSPACE":
            self.web_pin_value = self.web_pin_value[:-1]
        elif len(self.web_pin_value) < 4:
            self.web_pin_value += key_value

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
        if self.state == "settings":
            self.pressed_button = self.button_at_pos(normalized_pos)
            log_debug(f"DOWN raw={pos} normalized={normalized_pos} state=settings pressed={self.pressed_button}")
            return
        if self.state == "language":
            selected_button = self.get_selected_language_button()
            next_button = self.button_at_pos(normalized_pos)
            self.pressed_button = next_button if next_button != selected_button else None
            log_debug(f"DOWN raw={pos} normalized={normalized_pos} state=language pressed={self.pressed_button}")
            return
        if self.state == "video":
            self.handle_video_touch_down(normalized_pos)
            return
        if self.state == "video_preview":
            self.handle_video_preview_touch_down(normalized_pos)
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
        if self.state == "web_pin":
            self.handle_web_pin_touch_down(normalized_pos)
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
        if self.state == "settings":
            released_button = self.button_at_pos(normalized_pos)
            active_button = self.pressed_button
            self.pressed_button = None
            log_debug(f"UP raw={pos} normalized={normalized_pos} state=settings down={active_button} up={released_button}")
            if active_button and active_button == released_button:
                self.handle_button_action(active_button)
            return
        if self.state == "language":
            released_button = self.button_at_pos(normalized_pos)
            active_button = self.pressed_button
            self.pressed_button = None
            log_debug(f"UP raw={pos} normalized={normalized_pos} state=language down={active_button} up={released_button}")
            if active_button and active_button == released_button:
                self.handle_button_action(active_button)
            return
        if self.state == "video":
            self.handle_video_touch_up(normalized_pos)
            log_debug(f"UP raw={pos} normalized={normalized_pos} state=video")
            return
        if self.state == "video_preview":
            self.handle_video_preview_touch_up(normalized_pos)
            log_debug(f"UP raw={pos} normalized={normalized_pos} state=video_preview second={self.video_preview_seconds:.3f}")
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
        if self.state == "web_pin":
            self.handle_web_pin_touch_up(normalized_pos)
            log_debug(f"UP raw={pos} normalized={normalized_pos} state=web_pin value={self.web_pin_value}")
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
        title = self.title_font.render(self.tr("common.missing_asset"), True, (255, 255, 255))
        subtitle = self.font.render(message, True, (220, 220, 220))
        self.screen.blit(title, title.get_rect(center=(self.width // 2, self.height // 2 - 30)))
        self.screen.blit(subtitle, subtitle.get_rect(center=(self.width // 2, self.height // 2 + 20)))

    def draw_clock(self):
        self.screen.fill(BLACK)
        hours_text = datetime.now().strftime("%H")
        minutes_text = datetime.now().strftime("%M")
        separator_text = ":"
        gap = 18

        hours_surface = self.clock_font.render(hours_text, True, WHITE)
        separator_surface = self.clock_font.render(separator_text, True, WHITE)
        minutes_surface = self.clock_font.render(minutes_text, True, WHITE)

        total_width = (
            hours_surface.get_width()
            + separator_surface.get_width()
            + minutes_surface.get_width()
            + (gap * 2)
        )
        start_x = (self.width - total_width) // 2
        center_y = self.height // 2 - 10

        hours_rect = hours_surface.get_rect(midleft=(start_x, center_y))
        separator_rect = separator_surface.get_rect(
            midleft=(hours_rect.right + gap, center_y)
        )
        minutes_rect = minutes_surface.get_rect(
            midleft=(separator_rect.right + gap, center_y)
        )

        self.screen.blit(hours_surface, hours_rect)
        self.screen.blit(separator_surface, separator_rect)
        self.screen.blit(minutes_surface, minutes_rect)

    def draw_wifi(self):
        layout = self.get_wifi_layout()
        self.screen.fill(BLACK)

        title = self.title_font.render(self.tr("wifi.title"), True, WHITE)
        title_y = self.get_top_back_rect().centery
        self.screen.blit(title, title.get_rect(center=(layout["list"].centerx, title_y)))

        list_rect = layout["list"]
        pygame.draw.rect(self.screen, DARK_GRAY, list_rect)
        row_height = 62
        visible_networks = self.wifi_networks[self.wifi_page_start:self.wifi_page_start + 4]

        current_ssid = self.current_wifi_ssid
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

        for key_name, rect, enabled in (
            ("up", layout["up"], self.can_move_wifi_up()),
            ("down", layout["down"], self.can_move_wifi_down()),
        ):
            state = "pressed" if self.pressed_button == f"wifi-{key_name}" else "normal"
            icon = self.wifi_arrow_icons[key_name][state]
            if icon is not None:
                scaled_icon = fit_image_contain(icon, rect.size)
                if scaled_icon is not None:
                    if not enabled:
                        scaled_icon = scaled_icon.copy()
                        scaled_icon.set_alpha(70)
                    self.screen.blit(scaled_icon, scaled_icon.get_rect(center=rect.center))
                    if not enabled:
                        overlay = pygame.Surface(rect.size, pygame.SRCALPHA)
                        overlay.fill((0, 0, 0, 96))
                        self.screen.blit(overlay, rect.topleft)

        connect_enabled = bool(self.wifi_selected_ssid) and self.wifi_selected_ssid != current_ssid
        for key_name, label_text, enabled in (
            ("refresh", self.tr("common.refresh"), True),
            ("connect", self.tr("common.connect"), connect_enabled),
        ):
            rect = layout[key_name]
            is_pressed = self.pressed_button == f"wifi-{key_name}"
            asset = self.wifi_assets[key_name]["pressed"] if is_pressed else self.wifi_assets[key_name]["normal"]
            if asset is not None:
                surface = asset.copy()
                if not enabled:
                    surface.set_alpha(128)
                self.screen.blit(surface, rect)
                if not enabled:
                    overlay = pygame.Surface(rect.size, pygame.SRCALPHA)
                    overlay.fill((0, 0, 0, 96))
                    self.screen.blit(overlay, rect.topleft)

            icon = self.wifi_button_icons[key_name]["pressed"] if is_pressed else self.wifi_button_icons[key_name]["normal"]
            if icon is not None:
                icon_size = (rect.height - 18, rect.height - 18)
                scaled_icon = fit_image_contain(icon, icon_size)
                if scaled_icon is not None:
                    icon_rect = scaled_icon.get_rect()
                    icon_rect.left = rect.x + 16
                    icon_rect.centery = rect.centery
                    if not enabled:
                        scaled_icon = scaled_icon.copy()
                        scaled_icon.set_alpha(128)
                    self.screen.blit(scaled_icon, icon_rect)
                    text_left = icon_rect.right + 14
                else:
                    text_left = rect.x + 20
            else:
                text_left = rect.x + 20

            label = self.wifi_font.render(label_text, True, WHITE)
            if not enabled:
                label.set_alpha(80)
            label_rect = label.get_rect()
            label_rect.left = text_left
            label_rect.centery = rect.centery
            self.screen.blit(label, label_rect)

    def draw_wifi_password(self):
        layout = self.get_wifi_password_layout()
        self.screen.fill(BLACK)

        title = self.title_font.render("Password de", True, WHITE)
        title_y = self.get_top_back_rect().centery
        self.screen.blit(title, title.get_rect(center=(self.width // 2, title_y)))

        selected_text = self.wifi_font.render(
            self.wifi_selected_ssid or self.tr("common.none"),
            True,
            WHITE,
        )
        self.screen.blit(selected_text, selected_text.get_rect(center=layout["selected"].center))

        pygame.draw.rect(self.screen, WHITE, layout["password"], 2)
        password_text = self.wifi_font.render(self.wifi_password or " ", True, WHITE)
        self.screen.blit(password_text, (layout["password"].x + 10, layout["password"].y + 8))

        connect_asset = self.wifi_assets["connect"]["pressed"] if self.pressed_button == "wifi-password-connect" else self.wifi_assets["connect"]["normal"]
        if connect_asset is not None:
            self.screen.blit(connect_asset, layout["connect"])
        connect_icon = self.wifi_button_icons["connect"]["pressed"] if self.pressed_button == "wifi-password-connect" else self.wifi_button_icons["connect"]["normal"]
        if connect_icon is not None:
            scaled_icon = fit_image_contain(connect_icon, (layout["connect"].height - 18, layout["connect"].height - 18))
            if scaled_icon is not None:
                icon_rect = scaled_icon.get_rect()
                icon_rect.left = layout["connect"].x + 16
                icon_rect.centery = layout["connect"].centery
                self.screen.blit(scaled_icon, icon_rect)
                text_left = icon_rect.right + 14
            else:
                text_left = layout["connect"].x + 20
        else:
            text_left = layout["connect"].x + 20
        connect_label = self.wifi_font.render(self.tr("common.connect"), True, WHITE)
        connect_label_rect = connect_label.get_rect()
        connect_label_rect.left = text_left
        connect_label_rect.centery = layout["connect"].centery
        self.screen.blit(connect_label, connect_label_rect)

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

        if self.wifi_dialog_message:
            overlay = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 150))
            self.screen.blit(overlay, (0, 0))
            dialog_rect = layout["dialog"]
            dialog_color = (110, 38, 38) if self.wifi_dialog_is_error else (38, 72, 44)
            draw_rect_compat(self.screen, dialog_color, dialog_rect, 0, 18)
            draw_rect_compat(self.screen, WHITE, dialog_rect, 2, 18)
            title_text = "Error de connexio" if self.wifi_dialog_is_error else "Wi-Fi connectada"
            title_surface = self.wifi_bold_font.render(title_text, True, WHITE)
            body_surface = self.small_font.render(self.wifi_dialog_message, True, WHITE)
            hint_surface = self.small_font.render("Toca per continuar", True, WHITE)
            self.screen.blit(title_surface, title_surface.get_rect(center=(dialog_rect.centerx, dialog_rect.y + 32)))
            self.screen.blit(body_surface, body_surface.get_rect(center=(dialog_rect.centerx, dialog_rect.centery)))
            self.screen.blit(hint_surface, hint_surface.get_rect(center=(dialog_rect.centerx, dialog_rect.bottom - 24)))

    def draw_poweroff(self):
        asset_pack = self.assets["poweroff"]
        asset = asset_pack["pressed"].get(self.pressed_button) if self.pressed_button else asset_pack["default"]
        if asset is None:
            self.draw_missing("menu/PowerOff_Menu.png")
            return
        self.screen.blit(asset, (0, 0))
        title_line_1 = self.tr("poweroff.line1")
        title_line_2 = self.tr("poweroff.line2")
        line_1 = self.poweroff_title_font.render(title_line_1, True, WHITE)
        line_2 = self.poweroff_title_font.render(title_line_2, True, WHITE)
        shadow_1 = self.poweroff_title_font.render(title_line_1, True, BLACK)
        shadow_2 = self.poweroff_title_font.render(title_line_2, True, BLACK)
        self.screen.blit(shadow_1, shadow_1.get_rect(center=(self.width // 2 + 1, 78 + 1)))
        self.screen.blit(shadow_2, shadow_2.get_rect(center=(self.width // 2 + 1, 118 + 1)))
        self.screen.blit(line_1, line_1.get_rect(center=(self.width // 2, 78)))
        self.screen.blit(line_2, line_2.get_rect(center=(self.width // 2, 118)))

    def draw_loading_video(self):
        if self.loading_asset is not None:
            self.screen.blit(self.loading_asset, (0, 0))
        else:
            self.screen.fill(BLACK)
        if self.loading_spinner_asset is not None:
            self.loading_rotation = (self.loading_rotation + 2) % 360
            rotated = pygame.transform.rotozoom(self.loading_spinner_asset, -self.loading_rotation, 0.924)
            rotated_rect = rotated.get_rect(center=(self.width // 2, self.height // 2))
            self.screen.blit(rotated, rotated_rect)

        title = self.title_font.render(self.tr("loading.title"), True, WHITE)
        self.screen.blit(title, title.get_rect(center=(self.width // 2, self.height - 64)))

    def draw_video_preview(self):
        if self.video_preview_asset is not None:
            self.screen.blit(self.video_preview_asset, (0, 0))
        else:
            self.screen.fill(BLACK)

        overlay = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 92))
        self.screen.blit(overlay, (0, 0))

        info_text = self.small_font.render(
            f"{self.video_now_playing} @ {self.video_preview_seconds:.1f}s",
            True,
            WHITE,
        )
        self.screen.blit(info_text, info_text.get_rect(center=(self.width // 2, 34)))

        layout = self.get_video_preview_layout()
        for key, label, color in (
            ("play", "Play", GREEN),
            ("stop", "Stop", RED),
        ):
            rect = layout[key]
            pressed = self.pressed_button == f"video-preview-{key}"
            draw_rect_compat(self.screen, color if pressed else MID_GRAY, rect, 0, 18)
            draw_rect_compat(self.screen, WHITE, rect, 2, 18)
            text_surface = self.wifi_bold_font.render(label, True, WHITE)
            self.screen.blit(text_surface, text_surface.get_rect(center=rect.center))

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

        title = self.play_title_font.render(self.tr("play.title"), True, WHITE)
        random_text = self.play_label_font.render(self.tr("play.random"), True, WHITE)
        browse_text = self.play_label_font.render(self.tr("play.browse"), True, WHITE)

        self.screen.blit(title, title.get_rect(center=(self.width // 2 + 6, 106)))
        self.screen.blit(random_text, random_text.get_rect(center=(372, 258)))
        self.screen.blit(browse_text, browse_text.get_rect(center=(372, 387)))

    def draw_settings(self):
        asset_pack = self.assets["settings"]
        asset = asset_pack["pressed"].get(self.pressed_button) if self.pressed_button else asset_pack["default"]
        if asset is None:
            self.draw_missing("menu/Settings_Menu.png")
            return
        self.screen.blit(asset, (0, 0))

    def draw_language(self):
        asset_pack = self.assets["language"]
        selected_button = self.get_selected_language_button()
        self.screen.fill(BLACK)

        for button_id in ("1x1", "1x2", "2x1", "2x2"):
            button_assets = asset_pack.get(button_id, {})
            if button_id == "2x2":
                asset = button_assets.get("pressed") if self.pressed_button == "2x2" else button_assets.get("normal")
            elif button_id == selected_button and "selected" in button_assets:
                asset = button_assets.get("selected")
            elif button_id == self.pressed_button:
                asset = button_assets.get("pressed")
            else:
                asset = button_assets.get("normal")

            if asset is not None:
                self.screen.blit(asset, (0, 0))

    def draw_web_pin(self):
        layout = self.get_web_pin_layout()
        self.screen.fill(BLACK)
        title = self.title_font.render(self.tr("web_pin.title"), True, WHITE)
        title_y = self.get_top_back_rect().centery
        self.screen.blit(title, title.get_rect(center=(self.width // 2, title_y)))
        value_rect = layout["value"]
        cell_gap = 10
        cell_width = (value_rect.width - (cell_gap * 3)) // 4
        cell_height = value_rect.height
        for index in range(4):
            cell_rect = pygame.Rect(
                value_rect.x + index * (cell_width + cell_gap),
                value_rect.y,
                cell_width,
                cell_height,
            )
            draw_rect_compat(self.screen, WHITE, cell_rect, 2, 10)
            digit = self.web_pin_value[index] if index < len(self.web_pin_value) else "_"
            digit_surface = self.title_font.render(digit, True, WHITE)
            self.screen.blit(digit_surface, digit_surface.get_rect(center=cell_rect.center))

        save_enabled = len(self.web_pin_value) == 4
        save_asset = self.save_pin_assets["pressed"] if self.pressed_button == "web-pin-save" else self.save_pin_assets["normal"]
        if save_asset is not None:
            save_surface = save_asset.copy()
            if not save_enabled:
                save_surface.set_alpha(128)
            self.screen.blit(save_surface, layout["save"])
        else:
            save_color = GREEN if save_enabled else MID_GRAY
            draw_rect_compat(self.screen, save_color, layout["save"], 0, 16)

        save_label = self.wifi_font.render(self.tr("common.save"), True, WHITE)
        if not save_enabled:
            save_label.set_alpha(128)
        save_label_rect = save_label.get_rect(center=layout["save"].center)
        save_label_rect.x += 8
        self.screen.blit(save_label, save_label_rect)

        keyboard_rect = layout["keyboard"]
        rows = self.get_web_pin_rows()
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
                is_pressed = self.pressed_button == f"web-pin-key:{_value}"
                key_color = (98, 98, 98) if is_pressed else MID_GRAY
                draw_rect_compat(self.screen, key_color, rect, 0, 12)
                icon = self.web_pin_icons.get(_value)
                if icon is not None:
                    icon_size = (rect.width - 24, rect.height - 24)
                    scaled_icon = fit_image_contain(icon, icon_size)
                    if scaled_icon is not None:
                        self.screen.blit(scaled_icon, scaled_icon.get_rect(center=rect.center))
                else:
                    text_surface = self.small_font.render(label, True, WHITE)
                    self.screen.blit(text_surface, text_surface.get_rect(center=rect.center))

    def draw_browser(self):
        layout = self.get_browser_layout()
        self.screen.fill(BLACK)

        selected_entry = self.get_selected_browser_entry()
        action_label = self.tr("browser.view")
        action_key = "view"
        if selected_entry:
            action_label = self.tr("browser.view") if selected_entry["action"] == "view" else self.tr("browser.browse")
            action_key = "view" if selected_entry["action"] == "view" else "browse"

        for key_name, rect, enabled in (
            ("up", layout["up"], self.can_move_browser_up()),
            ("down", layout["down"], self.can_move_browser_down()),
        ):
            state = "pressed" if self.pressed_button == f"browser-{key_name}" else "normal"
            icon = self.wifi_arrow_icons[key_name][state]
            if icon is not None:
                scaled_icon = fit_image_contain(icon, rect.size)
                if scaled_icon is not None:
                    if not enabled:
                        scaled_icon = scaled_icon.copy()
                        scaled_icon.set_alpha(70)
                    self.screen.blit(scaled_icon, scaled_icon.get_rect(center=rect.center))
                    if not enabled:
                        overlay = pygame.Surface(rect.size, pygame.SRCALPHA)
                        overlay.fill((0, 0, 0, 96))
                        self.screen.blit(overlay, rect.topleft)

        path_text = self.truncate_text(self.tr("browser.path", path=self.rel_browser_path()), self.small_font, layout["path"].width)
        path_surface = self.small_font.render(path_text, True, WHITE)
        path_rect = path_surface.get_rect()
        path_rect.x = layout["path"].x
        path_rect.centery = self.get_top_back_rect().centery
        self.screen.blit(path_surface, path_rect)

        pygame.draw.rect(self.screen, DARK_GRAY, layout["list"])
        if not self.browser_entries:
            empty_icon = self.browser_icons["empty"]
            if empty_icon is not None:
                scaled_empty = fit_image_contain(empty_icon, (120, 120))
                if scaled_empty is not None:
                    empty_rect = scaled_empty.get_rect(center=(layout["list"].centerx, layout["list"].centery - 30))
                    self.screen.blit(scaled_empty, empty_rect)
                    text_y = empty_rect.bottom + 20
                else:
                    text_y = layout["list"].centery + 18
            else:
                text_y = layout["list"].centery
            empty_line_1 = self.wifi_font.render("No hi ha videos", True, WHITE)
            empty_line_2 = self.wifi_font.render("en aquesta carpeta", True, WHITE)
            self.screen.blit(empty_line_1, empty_line_1.get_rect(center=(layout["list"].centerx, text_y)))
            self.screen.blit(empty_line_2, empty_line_2.get_rect(center=(layout["list"].centerx, text_y + 32)))
        else:
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
                    meta_label = self.tr("browser.go_up")
                else:
                    prefix = f"[{self.tr('browser.dir_prefix')}] " if entry["type"] == "directory" else f"[{self.tr('browser.file_prefix')}] "
                    entry_label = prefix + entry["label"]
                    if entry["type"] == "directory":
                        noun = self.tr("browser.video") if entry["video_count"] == 1 else self.tr("browser.videos")
                        next_action_label = self.tr("browser.view") if entry["action"] == "view" else self.tr("browser.browse")
                        meta_label = f"{entry['video_count']} {noun} · {next_action_label}"
                    else:
                        meta_label = self.tr("browser.single_video")

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

        action_enabled = bool(selected_entry)
        if action_enabled:
            action_asset = self.browser_assets["action"]["pressed"] if self.pressed_button == "browser-action" else self.browser_assets["action"]["normal"]
            if action_asset is not None:
                self.screen.blit(action_asset, layout["action"])

            icon_state = "pressed" if self.pressed_button == "browser-action" else "normal"
            action_icon = self.browser_icons[action_key][icon_state]
            if action_icon is not None:
                scaled_icon = fit_image_contain(action_icon, (layout["action"].height - 18, layout["action"].height - 18))
                if scaled_icon is not None:
                    icon_rect = scaled_icon.get_rect()
                    icon_rect.left = layout["action"].x + 16
                    icon_rect.centery = layout["action"].centery
                    self.screen.blit(scaled_icon, icon_rect)
                    text_left = icon_rect.right + 14
                else:
                    text_left = layout["action"].x + 20
            else:
                text_left = layout["action"].x + 20

            action_surface = self.wifi_font.render(action_label, True, WHITE)
            action_rect = action_surface.get_rect()
            action_rect.left = text_left
            action_rect.centery = layout["action"].centery
            self.screen.blit(action_surface, action_rect)

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
        elif self.state == "settings":
            self.draw_settings()
        elif self.state == "language":
            self.draw_language()
        elif self.state == "loading_video":
            self.draw_loading_video()
        elif self.state == "video":
            return
        elif self.state == "video_preview":
            self.draw_video_preview()
        elif self.state == "play":
            self.draw_play()
        elif self.state == "browse":
            self.draw_browser()
            self.draw_top_back_button()
        elif self.state == "wifi":
            self.draw_wifi()
            self.draw_top_back_button()
        elif self.state == "wifi_password":
            self.draw_wifi_password()
            self.draw_top_back_button()
        elif self.state == "web_pin":
            self.draw_web_pin()
            self.draw_top_back_button()
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
