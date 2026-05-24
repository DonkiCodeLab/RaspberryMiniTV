import json
import os
import random
import re
import select
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from datetime import datetime

DESKTOP_PREVIEW = os.environ.get("MINITV_DESKTOP_PREVIEW") == "1" or sys.platform == "darwin"


def env_flag(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def env_int(name, default):
    value = os.environ.get(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default

if not DESKTOP_PREVIEW:
    if "SDL_VIDEODRIVER" not in os.environ:
        if os.path.exists("/dev/dri/card0"):
            os.environ["SDL_VIDEODRIVER"] = "kmsdrm"
            os.environ.setdefault("SDL_RENDER_DRIVER", "software")
        else:
            os.environ["SDL_VIDEODRIVER"] = "fbcon"
            os.environ.setdefault("SDL_FBDEV", "/dev/fb0")
if DESKTOP_PREVIEW:
    os.environ["SDL_MOUSE_TOUCH_EVENTS"] = "0"
    os.environ["SDL_TOUCH_MOUSE_EVENTS"] = "0"
else:
    os.environ.setdefault("SDL_MOUSE_TOUCH_EVENTS", "1")

import pygame

try:
    from evdev import InputDevice, ecodes, list_devices
except ImportError:
    InputDevice = None
    ecodes = None
    list_devices = None

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MENU_DIR = os.path.join(BASE_DIR, "menu")
FONTS_DIR = os.path.join(BASE_DIR, "fonts")
MONTSERRAT_BLACK_PATH = os.path.join(FONTS_DIR, "Montserrat-Black.ttf")
MAIN_SCREEN_PATH = os.path.join(MENU_DIR, "Main_Menu.png")
MORE_OPTIONS_PATH = os.path.join(MENU_DIR, "Screen_MoreOptions.png")
POWEROFF_PATH = os.path.join(MENU_DIR, "PowerOff_Menu.png")
PLAYMENU_PATH = os.path.join(MENU_DIR, "PlayMenu.png")
SETTINGS_MENU_PATH = os.path.join(MENU_DIR, "Settings_Menu.png")
LANGUAGE_ICON_EN_NORMAL_PATH = os.path.join(MENU_DIR, "language_en_normal.png")
LANGUAGE_ICON_EN_SELECTED_PATH = os.path.join(MENU_DIR, "language_en_selected.png")
LANGUAGE_ICON_CAT_NORMAL_PATH = os.path.join(MENU_DIR, "language_cat_normal.png")
LANGUAGE_ICON_CAT_SELECTED_PATH = os.path.join(MENU_DIR, "language_cat_selected.png")
LANGUAGE_ICON_ES_NORMAL_PATH = os.path.join(MENU_DIR, "language_es_normal.png")
LANGUAGE_ICON_ES_SELECTED_PATH = os.path.join(MENU_DIR, "language_es_selected.png")
MENU_BUTTON_BACKGROUND_NORMAL_PATH = os.path.join(MENU_DIR, "background_button_normal.png")
MENU_BUTTON_BACKGROUND_PRESSED_PATH = os.path.join(MENU_DIR, "background_button_pressed.png")
MENU_BUTTON_BACKGROUND_RED_PRESSED_PATH = os.path.join(MENU_DIR, "background_button_red_pressed.png")
MENU_BUTTON_2X_BACKGROUND_NORMAL_PATH = os.path.join(MENU_DIR, "background_2x_button_normal.png")
MENU_BUTTON_2X_BACKGROUND_PRESSED_PATH = os.path.join(MENU_DIR, "background_2x_button_pressed.png")
MENU_BUTTON_BACK_NORMAL_PATH = os.path.join(MENU_DIR, "button_back_normal.png")
MENU_BUTTON_BACK_PRESSED_PATH = os.path.join(MENU_DIR, "button_back_pressed.png")
MENU_BUTTON_CLOCK_NORMAL_PATH = os.path.join(MENU_DIR, "button_clock_normal.png")
MENU_BUTTON_CLOCK_PRESSED_PATH = os.path.join(MENU_DIR, "button_clock_pressed.png")
MENU_BUTTON_GAME_NORMAL_PATH = os.path.join(MENU_DIR, "button_game_normal.png")
MENU_BUTTON_GAME_PRESSED_PATH = os.path.join(MENU_DIR, "button_game_pressed.png")
MENU_BUTTON_MORE_NORMAL_PATH = os.path.join(MENU_DIR, "button_moreOptions_normal.png")
MENU_BUTTON_MORE_PRESSED_PATH = os.path.join(MENU_DIR, "button_moreOptions_pressed.png")
MENU_BUTTON_PLAY_NORMAL_PATH = os.path.join(MENU_DIR, "button_play_normal.png")
MENU_BUTTON_PLAY_PRESSED_PATH = os.path.join(MENU_DIR, "button_play_pressed.png")
MENU_BUTTON_RANDOM_NORMAL_PATH = os.path.join(MENU_DIR, "button_random_normal.png")
MENU_BUTTON_RANDOM_PRESSED_PATH = os.path.join(MENU_DIR, "button_random_pressed.png")
MENU_BUTTON_BROWSE_NORMAL_PATH = os.path.join(MENU_DIR, "button_browse_normal.png")
MENU_BUTTON_BROWSE_PRESSED_PATH = os.path.join(MENU_DIR, "button_browse_pressed.png")
MENU_BUTTON_POWEROFF_NORMAL_PATH = os.path.join(MENU_DIR, "button_poweroff_normal.png")
MENU_BUTTON_POWEROFF_PRESSED_PATH = os.path.join(MENU_DIR, "button_poweroff_pressed.png")
MENU_BUTTON_QR_NORMAL_PATH = os.path.join(MENU_DIR, "button_qr_normal.png")
MENU_BUTTON_QR_PRESSED_PATH = os.path.join(MENU_DIR, "button_qr_pressed.png")
MENU_BUTTON_SETTINGS_NORMAL_PATH = os.path.join(MENU_DIR, "button_settings_normal.png")
MENU_BUTTON_SETTINGS_PRESSED_PATH = os.path.join(MENU_DIR, "button_settings_pressed.png")
MENU_BUTTON_WIFI_NORMAL_PATH = os.path.join(MENU_DIR, "button_wifi_normal.png")
MENU_BUTTON_WIFI_PRESSED_PATH = os.path.join(MENU_DIR, "button_wifi_pressed.png")
MENU_BUTTON_LANGUAGE_NORMAL_PATH = os.path.join(MENU_DIR, "button_language_normal.png")
MENU_BUTTON_LANGUAGE_PRESSED_PATH = os.path.join(MENU_DIR, "button_language_pressed.png")
MENU_BUTTON_PWD_NORMAL_PATH = os.path.join(MENU_DIR, "button_pwd_normal.png")
MENU_BUTTON_PWD_PRESSED_PATH = os.path.join(MENU_DIR, "button_pwd_pressed.png")
MENU_BUTTON_PWD_WEB_NORMAL_PATH = os.path.join(MENU_DIR, "button_pwd_web_normal.png")
MENU_BUTTON_PWD_WEB_PRESSED_PATH = os.path.join(MENU_DIR, "button_pwd_web_pressed.png")
MENU_BUTTON_PWD_RASPBERRY_NORMAL_PATH = os.path.join(MENU_DIR, "button_pwd_raspberry_normal.png")
MENU_BUTTON_PWD_RASPBERRY_PRESSED_PATH = os.path.join(MENU_DIR, "button_pwd_raspberry_pressed.png")
MENU_BUTTON_INFORMATION_NORMAL_PATH = os.path.join(MENU_DIR, "button_information_normal.png")
MENU_BUTTON_INFORMATION_PRESSED_PATH = os.path.join(MENU_DIR, "button_information_pressed.png")
NO_WIFI_PATH = os.path.join(MENU_DIR, "no_wifi.png")
MINI_LOGO_PATH = os.path.join(MENU_DIR, "miniLogo_donkicodeLab.png")
LOADING_VIDEO_PATH = os.path.join(MENU_DIR, "Loading_Video_Animation.png")
LOADING_VIDEO_SPINNER_PATH = os.path.join(MENU_DIR, "loading.png")
INTRO_VIDEO_PATH = os.path.join(MENU_DIR, "video_intro.mp4")
CLEAR_ICON_PATH = os.path.join(MENU_DIR, "clear.png")
BACKSPACE_ICON_PATH = os.path.join(MENU_DIR, "backspace.png")
BUTTON_CLEAR_PATH = os.path.join(MENU_DIR, "button_clear.png")
BUTTON_BACKSPACE_PATH = os.path.join(MENU_DIR, "button_backspace.png")
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
QR_PNG = "/tmp/minitv_qr.png"
TRANSLATIONS_PATH = os.path.join(BASE_DIR, "translations.json")
USER_SETTINGS_PATH = os.path.join(BASE_DIR, "user_settings.json")
ALARM_SOUNDS_DIR = os.path.join(BASE_DIR, "alarm_sounds")
ALARM_SOUND_EXTENSIONS = {".mp3"}
WIFI_DEBUG_LOG_PATH = os.path.join(BASE_DIR, "wifi_debug.log")
PORT = 5050
REPO_DIR = os.path.dirname(BASE_DIR)
MULTIMEDIA_DIR = os.path.join(REPO_DIR, "MultimediaContent")
VIDEOS_DIR = os.path.join(MULTIMEDIA_DIR, "Videos")
MOVIES_DIR = os.path.join(VIDEOS_DIR, "Movies")
TVSHOWS_DIR = os.path.join(VIDEOS_DIR, "TVShows")
GAMES_DIR = os.path.join(MULTIMEDIA_DIR, "Games")
BACKGROUND = (245, 245, 245)
TEXT = (10, 10, 10)
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
HEADER_BACKGROUND = (232, 232, 232)
GRAY = (120, 120, 120)
DARK_GRAY = (38, 38, 38)
MID_GRAY = (70, 70, 70)
DISABLED_ARROW_COLOR = (70, 74, 82)
GREEN = (72, 190, 120)
RED = (210, 80, 80)
FONT_FAMILY = "DejaVu Sans"
BASE_WIDTH = 640
BASE_HEIGHT = 480
DESKTOP_PREVIEW_WIDTH = env_int("MINITV_DESKTOP_PREVIEW_WIDTH", 800)
DESKTOP_PREVIEW_HEIGHT = env_int("MINITV_DESKTOP_PREVIEW_HEIGHT", 480)
MAIN_HEADER_HEIGHT = 82
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
PLAY_EXIT_LAYOUT = (24, 12, 58, 58)
PLAY_RANDOM_LAYOUT = (183, 207, 272, 103)
PLAY_BROWSE_LAYOUT = (183, 336, 272, 103)
BROWSE_VISIBLE_ITEMS = 4
BROWSE_DOUBLE_TAP_MS = 450
RASPBERRY_PASSWORD_USER = "donkicodelab"
LOADING_MIN_DURATION_MS = 1000
MPV_SOCKET_PATH = os.path.join(tempfile.gettempdir(), "minitv-mpv.sock")
MPV_SCREENSHOT_PATH = os.path.join(tempfile.gettempdir(), "minitv-video-preview.png")
MPV_DEBUG_LOG_PATH = os.path.join(tempfile.gettempdir(), "minitv-mpv.log")
INTRO_DEBUG_LOG_PATH = os.path.join(tempfile.gettempdir(), "minitv-intro.log")
RETROARCH_CONFIG_PATH = os.path.join(tempfile.gettempdir(), "minitv-retroarch.cfg")
RETROARCH_DEBUG_LOG_PATH = os.path.join(tempfile.gettempdir(), "minitv-retroarch.log")
PLAYBACK_STATE_PATH = os.path.join(tempfile.gettempdir(), "minitv-playback.json")
GAME_PLATFORM_BY_EXTENSION = {
    ".gb": {
        "name": "Game Boy",
        "core": "/usr/lib/arm-linux-gnueabihf/libretro/gambatte_libretro.so",
    },
    ".gbc": {
        "name": "Game Boy Color",
        "core": "/usr/lib/arm-linux-gnueabihf/libretro/gambatte_libretro.so",
    },
    ".gba": {
        "name": "Game Boy Advance",
        "core": "/usr/lib/arm-linux-gnueabihf/libretro/mgba_libretro.so",
    },
}
DEFAULT_SETTINGS = {
    "language": "en",
    "web_password": "1234",
    "alarms": [
        {"id": 1, "enabled": False, "time": "07:30", "sound": ""},
        {"id": 2, "enabled": False, "time": "08:00", "sound": ""},
        {"id": 3, "enabled": False, "time": "08:30", "sound": ""},
    ],
}
SUPPORTED_LANGUAGES = {"en", "ca", "es"}
LANGUAGE_BUTTON_MAP = {
    "1x1": "en",
    "1x2": "ca",
    "2x1": "es",
}


def ensure_screen_on():
    if DESKTOP_PREVIEW:
        return
    raspi_gpio = shutil.which("raspi-gpio")
    if not raspi_gpio:
        log_debug("raspi-gpio not found; skipping display GPIO setup")
        return
    subprocess.run([raspi_gpio, "set", "19", "op", "a5"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    subprocess.run([raspi_gpio, "set", "18", "op", "dh"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


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

    alsa_device = os.environ.get("MINITV_ALSA_DEVICE", "plughw:1,0")
    command = [
        "mpv",
        "--fullscreen",
        "--no-osd-bar",
        "--keep-open=no",
        "--audio-display=no",
    ]
    if alsa_device.lower() not in ("", "auto", "default"):
        command.append(f"--audio-device=alsa/{alsa_device}")
    if not os.environ.get("DISPLAY") and not os.environ.get("WAYLAND_DISPLAY"):
        command.extend(["--vo=gpu", "--gpu-context=drm"])
    command.append(INTRO_VIDEO_PATH)

    append_debug_log(INTRO_DEBUG_LOG_PATH, f"Launching intro: {' '.join(command)}")
    try:
        with open(INTRO_DEBUG_LOG_PATH, "a", encoding="utf-8") as log_handle:
            result = subprocess.run(
                command,
                stdout=log_handle,
                stderr=log_handle,
                check=False,
            )
        append_debug_log(INTRO_DEBUG_LOG_PATH, f"Intro exited with return code {result.returncode}")
    except Exception as exc:
        append_debug_log(INTRO_DEBUG_LOG_PATH, f"Intro failed to launch: {exc}")


def generate_qr():
    url = f"http://{get_local_ip()}:{PORT}"
    if DESKTOP_PREVIEW:
        return url
    qrencode_path = shutil.which("qrencode")
    if not qrencode_path:
        log_debug("QR qrencode not found; showing URL fallback")
        try:
            if os.path.exists(QR_PNG):
                os.remove(QR_PNG)
        except OSError:
            pass
        return url
    try:
        result = subprocess.run(
            [qrencode_path, "-o", QR_PNG, "-s", "12", "-m", "2", url],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        if result.returncode != 0:
            log_debug(f"QR qrencode exited with return code {result.returncode}")
    except Exception as exc:
        log_debug(f"QR failed to launch qrencode: {exc}")
    return url


def run_command(command):
    try:
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False)
        return result
    except FileNotFoundError as exc:
        return subprocess.CompletedProcess(command, 127, "", str(exc))


def change_raspberry_password(current_password, new_password):
    if not current_password or not new_password:
        return False, "password.empty"
    if DESKTOP_PREVIEW:
        return True, "password.raspberry_changed"

    if os.geteuid() == 0:
        command = ["chpasswd"]
        command_input = f"{RASPBERRY_PASSWORD_USER}:{new_password}\n"
    else:
        command = ["sudo", "-k", "-S", "chpasswd"]
        command_input = f"{current_password}\n{RASPBERRY_PASSWORD_USER}:{new_password}\n"
    try:
        result = subprocess.run(
            command,
            input=command_input,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
    except FileNotFoundError:
        return False, "password.command_missing"

    if result.returncode == 0:
        return True, "password.raspberry_changed"
    return False, "password.raspberry_failed"


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


def normalize_language_code(language):
    language = str(language or "").strip().lower()
    if language == "cat":
        return "ca"
    return language if language in SUPPORTED_LANGUAGES else DEFAULT_SETTINGS["language"]


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


def normalize_alarms(value):
    source = value if isinstance(value, list) else []
    fallback_sound = list_alarm_sounds()[0] if list_alarm_sounds() else ""
    alarms = []
    defaults = DEFAULT_SETTINGS["alarms"]
    for index in range(3):
        entry = source[index] if index < len(source) and isinstance(source[index], dict) else {}
        time_value = str(entry.get("time") or defaults[index]["time"]).strip()
        if not re.match(r"^([01]\d|2[0-3]):[0-5]\d$", time_value):
            time_value = defaults[index]["time"]
        alarms.append(
            {
                "id": index + 1,
                "enabled": bool(entry.get("enabled")),
                "time": time_value,
                "sound": normalize_alarm_sound(entry.get("sound") or entry.get("soundFile") or entry.get("filename"))
                or fallback_sound,
            }
        )
    return alarms


def is_video_file(filename):
    return filename.lower().endswith((".mp4", ".m4v", ".mov", ".mkv"))


def is_game_rom_file(filename):
    return os.path.splitext(str(filename or ""))[1].lower() in GAME_PLATFORM_BY_EXTENSION


def ensure_media_directories():
    os.makedirs(MOVIES_DIR, exist_ok=True)
    os.makedirs(TVSHOWS_DIR, exist_ok=True)
    os.makedirs(GAMES_DIR, exist_ok=True)


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


def parse_video_entry(filename):
    match = re.search(r"(S\d{2}E\d{2})", filename, re.IGNORECASE)
    return match.group(1).upper() if match else os.path.splitext(filename)[0].upper()


def write_playback_state(filepath):
    try:
        relative_path = os.path.relpath(filepath, VIDEOS_DIR).replace(os.sep, "/")
    except ValueError:
        relative_path = os.path.basename(filepath)

    payload = {
        "playing": parse_video_entry(os.path.basename(filepath)),
        "directory": os.path.dirname(relative_path).replace(os.sep, "/"),
        "file": relative_path,
        "updatedAt": int(time.time()),
    }
    try:
        with open(PLAYBACK_STATE_PATH, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False)
    except Exception:
        pass


def clear_playback_state():
    try:
        os.remove(PLAYBACK_STATE_PATH)
    except FileNotFoundError:
        pass
    except Exception:
        pass


def score_touch_device(device):
    try:
        capabilities = device.capabilities(absinfo=False)
    except Exception:
        return -1

    abs_codes = set(capabilities.get(ecodes.EV_ABS, []))
    key_codes = set(capabilities.get(ecodes.EV_KEY, []))
    name = (device.name or "").lower()
    score = 0
    has_touch_marker = False

    if ecodes.BTN_TOUCH in key_codes:
        score += 10
        has_touch_marker = True
    if ecodes.ABS_MT_POSITION_X in abs_codes and ecodes.ABS_MT_POSITION_Y in abs_codes:
        score += 8
        has_touch_marker = True
    if ecodes.ABS_X in abs_codes and ecodes.ABS_Y in abs_codes:
        score += 4
    if "touch" in name:
        score += 6
        has_touch_marker = True
    if "goodix" in name:
        score += 6
        has_touch_marker = True
    if any(token in name for token in ("gamepad", "joystick", "controller", "nacon", "xbox", "playstation")):
        score -= 12
    if "mouse" in name:
        score -= 8
    if "keyboard" in name:
        score -= 8
    if not has_touch_marker:
        score -= 6

    return score


def detect_touch_device():
    if InputDevice is None or list_devices is None or ecodes is None:
        return None, "evdev unavailable"

    candidates = []
    for path in list_devices():
        try:
            device = InputDevice(path)
            score = score_touch_device(device)
            candidates.append((score, path, device.name or "unknown"))
            device.close()
        except Exception as exc:
            log_debug(f"TOUCH skip path={path} reason={exc}")

    if not candidates:
        return None, "no input devices discovered"

    candidates.sort(key=lambda item: item[0], reverse=True)
    best_score, best_path, best_name = candidates[0]
    summary = ", ".join(f"{path}:{name}:score={score}" for score, path, name in candidates)
    log_debug(f"TOUCH candidates {summary}")

    if best_score < 8:
        return None, f"no touchscreen-like device found ({summary})"
    return best_path, f"{best_name} score={best_score}"


def get_abs_range(device, primary_code, fallback_code):
    for code in (primary_code, fallback_code):
        try:
            info = device.absinfo(code)
        except Exception:
            continue
        if info and info.max > info.min:
            return info.min, info.max
    return None


def get_touch_abs_ranges(device):
    if ecodes is None:
        return None

    x_range = get_abs_range(device, ecodes.ABS_MT_POSITION_X, ecodes.ABS_X)
    y_range = get_abs_range(device, ecodes.ABS_MT_POSITION_Y, ecodes.ABS_Y)
    if not x_range or not y_range:
        return None
    return {
        "x_min": x_range[0],
        "x_max": x_range[1],
        "y_min": y_range[0],
        "y_max": y_range[1],
    }


def split_nmcli_terse_line(line):
    parts = []
    current = []
    escaped = False
    for char in line:
        if escaped:
            current.append(char)
            escaped = False
        elif char == "\\":
            escaped = True
        elif char == ":":
            parts.append("".join(current))
            current = []
        else:
            current.append(char)
    if escaped:
        current.append("\\")
    parts.append("".join(current))
    return parts


def clamp_wifi_signal(value):
    try:
        return max(0, min(100, int(float(value))))
    except (TypeError, ValueError):
        return 0


def signal_dbm_to_percent(dbm):
    try:
        dbm = float(dbm)
    except (TypeError, ValueError):
        return 0
    if dbm <= -100:
        return 0
    if dbm >= -50:
        return 100
    return int(2 * (dbm + 100))


def merge_wifi_networks(networks):
    unique = {}
    for network in networks:
        ssid = (network.get("ssid") or "").strip()
        if not ssid:
            continue
        signal = clamp_wifi_signal(network.get("signal", 0))
        security = (network.get("security") or "open").strip() or "open"
        existing = unique.get(ssid)
        if existing is None or signal > existing["signal"]:
            unique[ssid] = {"ssid": ssid, "signal": signal, "security": security}
        elif existing["security"] in ("unknown", "open") and security not in ("unknown", "open"):
            existing["security"] = security
    return sorted(unique.values(), key=lambda item: (-item["signal"], item["ssid"].lower()))


def parse_nmcli_wifi_list(output):
    networks = []
    for line in output.splitlines():
        if not line.strip():
            continue
        parts = split_nmcli_terse_line(line)
        if len(parts) >= 4:
            ssid = parts[1].strip()
            signal = parts[2].strip()
            security = ":".join(parts[3:]).strip()
        elif len(parts) >= 3:
            ssid = parts[0].strip()
            signal = parts[1].strip()
            security = ":".join(parts[2:]).strip()
        else:
            continue
        if ssid:
            networks.append({"ssid": ssid, "signal": signal, "security": security or "open"})
    return merge_wifi_networks(networks)


def parse_iw_wifi_scan(output):
    networks = []
    current = None
    for raw_line in output.splitlines():
        line = raw_line.strip()
        if line.startswith("BSS "):
            if current and current["ssid"]:
                networks.append(current)
            current = {"ssid": "", "signal": 0, "security": "open"}
        elif current is not None and line.startswith("SSID:"):
            current["ssid"] = line.split("SSID:", 1)[1].strip()
        elif current is not None and line.startswith("signal:"):
            signal_value = line.split("signal:", 1)[1].strip().split(" ", 1)[0]
            current["signal"] = signal_dbm_to_percent(signal_value)
        elif current is not None and (line.startswith("RSN:") or line.startswith("WPA:")):
            current["security"] = "WPA/WPA2"
    if current and current["ssid"]:
        networks.append(current)
    return merge_wifi_networks(networks)


def parse_iwlist_wifi_scan(output):
    networks = []
    current = None
    for raw_line in output.splitlines():
        line = raw_line.strip()
        if "Cell " in line and "Address:" in line:
            if current and current["ssid"]:
                networks.append(current)
            current = {"ssid": "", "signal": 0, "security": "unknown"}
        elif current is not None and "ESSID:" in line:
            current["ssid"] = line.split("ESSID:", 1)[1].strip().strip('"')
        elif current is not None and "Quality=" in line:
            try:
                quality_part = line.split("Quality=", 1)[1].split(" ", 1)[0]
                quality_value, quality_max = quality_part.split("/")
                current["signal"] = int(int(quality_value) * 100 / int(quality_max))
            except Exception:
                pass
        elif current is not None and "Encryption key:" in line:
            current["security"] = "open" if line.endswith("off") else "encrypted"
    if current and current["ssid"]:
        networks.append(current)
    return merge_wifi_networks(networks)


def scan_wifi_networks():
    run_command(["nmcli", "radio", "wifi", "on"])
    rescan_result = run_command(["nmcli", "dev", "wifi", "rescan", "ifname", "wlan0"])
    log_wifi_debug(
        "wifi_scan_nmcli_rescan",
        returncode=rescan_result.returncode,
        stderr=(rescan_result.stderr or "").strip(),
    )
    time.sleep(2)

    nmcli_commands = [
        ["nmcli", "-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY", "dev", "wifi", "list", "ifname", "wlan0"],
        ["nmcli", "-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY", "dev", "wifi", "list", "--rescan", "yes"],
    ]
    collected_networks = []
    for command in nmcli_commands:
        nmcli_result = run_command(command)
        parsed_networks = parse_nmcli_wifi_list(nmcli_result.stdout) if nmcli_result.returncode == 0 else []
        log_wifi_debug(
            "wifi_scan_nmcli_list",
            command=" ".join(command),
            returncode=nmcli_result.returncode,
            count=len(parsed_networks),
            stderr=(nmcli_result.stderr or "").strip(),
        )
        collected_networks.extend(parsed_networks)

    iw_result = run_command(["iw", "dev", "wlan0", "scan"])
    iw_networks = parse_iw_wifi_scan(iw_result.stdout) if iw_result.returncode == 0 else []
    log_wifi_debug(
        "wifi_scan_iw",
        returncode=iw_result.returncode,
        count=len(iw_networks),
        stderr=(iw_result.stderr or "").strip(),
    )
    collected_networks.extend(iw_networks)

    iwlist_result = run_command(["iwlist", "wlan0", "scanning"])
    iwlist_networks = parse_iwlist_wifi_scan(iwlist_result.stdout) if iwlist_result.returncode == 0 else []
    log_wifi_debug(
        "wifi_scan_iwlist",
        returncode=iwlist_result.returncode,
        count=len(iwlist_networks),
        stderr=(iwlist_result.stderr or "").strip(),
    )
    return merge_wifi_networks(collected_networks)


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


def clean_transparent_pixels(image, matte=BLACK):
    if image is None:
        return None
    cleaned = image.copy()
    try:
        cleaned.lock()
        width, height = cleaned.get_size()
        for y in range(height):
            for x in range(width):
                red, green, blue, alpha = cleaned.get_at((x, y))
                if alpha == 0 and (red, green, blue) != matte:
                    cleaned.set_at((x, y), (*matte, 0))
    finally:
        try:
            cleaned.unlock()
        except pygame.error:
            pass
    return cleaned


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


def tint_icon(image, color):
    if image is None:
        return None
    tinted = image.copy()
    tinted.fill((*color, 255), special_flags=pygame.BLEND_RGBA_MULT)
    return tinted


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


class DeviceAppMenu:
    def __init__(self):
        ensure_media_directories()
        ensure_screen_on()
        pygame.font.init()
        self.display_suspended = False
        self.initialize_display()
        self.audio_available = self.initialize_audio()
        self.clock = pygame.time.Clock()
        self.width, self.height = self.screen.get_size()
        self.font = pygame.font.SysFont(FONT_FAMILY, 28)
        self.title_font = pygame.font.SysFont(FONT_FAMILY, 42, bold=True)
        self.main_title_font = self.load_font(MONTSERRAT_BLACK_PATH, 42, self.title_font)
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
        self.settings_mtime = self.get_settings_mtime()
        self.next_settings_poll = 0
        self.running = True
        self.state = "main"
        self.pressed_button = None
        self.qr_url = None
        self.touch_device = None
        self.touch_position = (0, 0)
        self.touch_is_down = False
        self.touch_down_pos = None
        self.touch_abs_ranges = None
        self.touch_swap_axes = env_flag("MINITV_TOUCH_SWAP_AXES")
        self.touch_invert_x = env_flag("MINITV_TOUCH_INVERT_X")
        self.touch_invert_y = env_flag("MINITV_TOUCH_INVERT_Y")
        self.last_mouse_event_ticks = 0
        self.language_return_state = "settings"
        self.password_menu_return_state = "more"
        self.web_pin_return_state = "settings"
        self.clock_return_state = "main"
        self.alarm_playing = False
        self.alarm_active_until = 0
        self.alarm_triggered_keys = set()
        self.alarm_triggered_date = datetime.now().date().isoformat()
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
        }
        self.menu_button_backgrounds = {
            "normal": load_image(MENU_BUTTON_BACKGROUND_NORMAL_PATH),
            "pressed": load_image(MENU_BUTTON_BACKGROUND_PRESSED_PATH),
            "red_pressed": load_image(MENU_BUTTON_BACKGROUND_RED_PRESSED_PATH),
        }
        self.menu_button_2x_backgrounds = {
            "normal": load_image(MENU_BUTTON_2X_BACKGROUND_NORMAL_PATH),
            "pressed": load_image(MENU_BUTTON_2X_BACKGROUND_PRESSED_PATH),
        }
        self.menu_tile_assets = self.prepare_menu_tile_assets()
        self.language_icon_assets = self.prepare_language_icon_assets()
        self.play_button_assets = self.prepare_play_button_assets()
        self.password_menu_assets = self.prepare_password_menu_assets()
        self.password_information_assets = {
            "normal": load_image(MENU_BUTTON_INFORMATION_NORMAL_PATH),
            "pressed": load_image(MENU_BUTTON_INFORMATION_PRESSED_PATH),
        }
        self.no_wifi_asset = load_image(NO_WIFI_PATH)
        self.mini_logo_asset = load_image(MINI_LOGO_PATH)
        self.qr_asset = None
        self.wifi_networks = []
        self.wifi_selected_ssid = None
        self.wifi_selected_index = 0
        self.current_wifi_ssid = None
        self.wifi_password = ""
        self.password_keyboard_upper = True
        self.wifi_status = ""
        self.wifi_dialog_message = ""
        self.wifi_dialog_is_error = False
        self.wifi_page_start = 0
        self.web_pin_value = self.config.get("web_password", DEFAULT_SETTINGS["web_password"])
        self.raspberry_current_password = ""
        self.raspberry_new_password = ""
        self.raspberry_password_field = "current"
        self.raspberry_password_message = ""
        self.raspberry_password_is_error = False
        self.play_status = ""
        self.browser_path = VIDEOS_DIR
        self.browser_selected_index = 0
        self.browser_page_start = 0
        self.browser_entries = []
        self.browser_status = ""
        self.browser_last_touch_index = None
        self.browser_last_touch_ticks = 0
        self.games_selected_index = 0
        self.games_page_start = 0
        self.games_entries = []
        self.games_status = ""
        self.games_return_state = "main"
        self.loading_asset = self.prepare_asset(LOADING_VIDEO_PATH)
        self.loading_spinner_asset = load_image(LOADING_VIDEO_SPINNER_PATH)
        self.web_pin_icons = {
            "CLEAR": load_image(CLEAR_ICON_PATH),
            "BACKSPACE": load_image(BACKSPACE_ICON_PATH),
        }
        self.password_keyboard_icons = {
            "CLEAR": load_image(BUTTON_CLEAR_PATH),
            "BACKSPACE": load_image(BUTTON_BACKSPACE_PATH),
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
        self.game_proc = None
        self.game_log_handle = None
        self.game_return_state = "games"
        self.game_current_path = ""
        self.refresh_translated_state_texts()
        log_debug(f"SCREEN size={self.width}x{self.height}")
        for button_id, rect in self.get_button_rects().items():
            log_debug(f"BUTTON {button_id} rect={rect}")
        self.setup_touch_input()

    def load_font(self, path, size, fallback):
        try:
            if os.path.exists(path):
                return pygame.font.Font(path, size)
        except Exception as exc:
            log_debug(f"FONT failed to load path={path}: {exc}")
        return fallback

    def initialize_display(self):
        log_debug(f"DISPLAY init start suspended={self.display_suspended}")
        pygame.display.init()
        if DESKTOP_PREVIEW:
            self.screen = pygame.display.set_mode((DESKTOP_PREVIEW_WIDTH, DESKTOP_PREVIEW_HEIGHT))
        else:
            self.screen = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)
        pygame.mouse.set_visible(DESKTOP_PREVIEW)
        self.display_suspended = False
        log_debug("DISPLAY init complete")

    def suspend_display_for_video(self):
        if self.display_suspended:
            log_debug("DISPLAY suspend skipped: already suspended")
            return
        log_debug("DISPLAY suspend start for video playback")
        try:
            pygame.display.quit()
            self.display_suspended = True
            log_debug("DISPLAY suspend complete")
        except Exception as exc:
            log_debug(f"DISPLAY suspend failed: {exc}")

    def resume_display_after_video(self):
        if not self.display_suspended:
            log_debug("DISPLAY resume skipped: display already active")
            return
        log_debug("DISPLAY resume start after video playback")
        try:
            self.initialize_display()
            self.width, self.height = self.screen.get_size()
            log_debug(f"DISPLAY resume complete size={self.width}x{self.height}")
        except Exception as exc:
            log_debug(f"DISPLAY resume failed: {exc}")
            raise

    def suspend_display_for_external_app(self, reason):
        if self.display_suspended:
            log_debug(f"DISPLAY suspend skipped: already suspended reason={reason}")
            return
        log_debug(f"DISPLAY suspend start reason={reason}")
        try:
            pygame.display.quit()
            self.display_suspended = True
            log_debug("DISPLAY suspend complete")
        except Exception as exc:
            log_debug(f"DISPLAY suspend failed reason={reason}: {exc}")

    def resume_display_after_external_app(self, reason):
        if not self.display_suspended:
            log_debug(f"DISPLAY resume skipped: display already active reason={reason}")
            return
        log_debug(f"DISPLAY resume start reason={reason}")
        try:
            self.initialize_display()
            self.width, self.height = self.screen.get_size()
            log_debug(f"DISPLAY resume complete reason={reason} size={self.width}x{self.height}")
        except Exception as exc:
            log_debug(f"DISPLAY resume failed reason={reason}: {exc}")
            raise

    def initialize_audio(self):
        try:
            pygame.mixer.init()
            log_debug("AUDIO init complete")
            return True
        except Exception as exc:
            log_debug(f"AUDIO init failed: {exc}")
            return False

    def load_settings(self):
        loaded = load_json_file(USER_SETTINGS_PATH, {})
        settings = dict(DEFAULT_SETTINGS)
        if isinstance(loaded, dict):
            settings.update(
                {
                    key: value
                    for key, value in loaded.items()
                    if key in {"language", "web_password"} and isinstance(value, str)
                }
            )
            settings["alarms"] = normalize_alarms(loaded.get("alarms"))
        else:
            settings["alarms"] = normalize_alarms(settings.get("alarms"))
        settings["language"] = normalize_language_code(settings.get("language"))
        if not os.path.isfile(USER_SETTINGS_PATH):
            save_json_file(USER_SETTINGS_PATH, settings)
        return settings

    def save_settings(self):
        self.config["alarms"] = normalize_alarms(self.config.get("alarms"))
        save_json_file(USER_SETTINGS_PATH, self.config)
        self.settings_mtime = self.get_settings_mtime()

    def get_settings_mtime(self):
        try:
            return os.path.getmtime(USER_SETTINGS_PATH)
        except OSError:
            return None

    def poll_external_settings(self):
        now = time.monotonic()
        if now < self.next_settings_poll:
            return
        self.next_settings_poll = now + 0.5

        current_mtime = self.get_settings_mtime()
        if current_mtime == self.settings_mtime:
            return

        next_config = self.load_settings()
        self.settings_mtime = current_mtime
        if next_config == self.config:
            return

        previous_language = self.config.get("language")
        self.config = next_config
        self.web_pin_value = self.config.get("web_password", DEFAULT_SETTINGS["web_password"])
        if self.config.get("language") != previous_language:
            self.refresh_translated_state_texts()
            self.qr_asset = None

    def stop_alarm_sound(self):
        if not self.alarm_playing:
            return
        try:
            pygame.mixer.music.stop()
        except Exception as exc:
            log_debug(f"ALARM stop failed: {exc}")
        self.alarm_playing = False
        self.alarm_active_until = 0
        log_debug("ALARM stopped")

    def start_alarm_sound(self, alarm):
        if self.alarm_playing:
            return
        sound_filename = normalize_alarm_sound(alarm.get("sound"))
        if not sound_filename:
            log_debug(f"ALARM skipped id={alarm.get('id')} missing sound")
            return

        sound_path = os.path.join(ALARM_SOUNDS_DIR, sound_filename)
        if not os.path.isfile(sound_path):
            log_debug(f"ALARM skipped id={alarm.get('id')} file not found: {sound_path}")
            return
        if not self.audio_available:
            log_debug(f"ALARM skipped id={alarm.get('id')} audio unavailable")
            return

        try:
            pygame.mixer.music.load(sound_path)
            pygame.mixer.music.play(loops=-1)
            self.alarm_playing = True
            self.alarm_active_until = time.monotonic() + 120
            log_debug(f"ALARM started id={alarm.get('id')} sound={sound_filename}")
        except Exception as exc:
            self.alarm_playing = False
            self.alarm_active_until = 0
            log_debug(f"ALARM start failed id={alarm.get('id')} sound={sound_filename}: {exc}")

    def update_clock_alarms(self):
        today = datetime.now().date().isoformat()
        if today != self.alarm_triggered_date:
            self.alarm_triggered_date = today
            self.alarm_triggered_keys.clear()

        if self.alarm_playing:
            if self.state != "clock" or time.monotonic() >= self.alarm_active_until:
                self.stop_alarm_sound()
            return

        if self.state != "clock":
            return

        now = datetime.now()
        current_time = now.strftime("%H:%M")
        for alarm in normalize_alarms(self.config.get("alarms")):
            if not alarm.get("enabled") or alarm.get("time") != current_time:
                continue
            trigger_key = f"{today}:{alarm.get('id')}:{alarm.get('time')}"
            if trigger_key in self.alarm_triggered_keys:
                continue
            self.alarm_triggered_keys.add(trigger_key)
            self.start_alarm_sound(alarm)
            break

    def tr(self, key, **kwargs):
        language = normalize_language_code(self.config.get("language"))
        table = self.translations.get(language) or self.translations.get("en") or {}
        value = table.get(key) or key
        try:
            return value.format(**kwargs)
        except Exception:
            return value

    def format_long_date(self, value):
        language = normalize_language_code(self.config.get("language"))
        if language == "ca":
            months = [
                "gener",
                "febrer",
                "març",
                "abril",
                "maig",
                "juny",
                "juliol",
                "agost",
                "setembre",
                "octubre",
                "novembre",
                "desembre",
            ]
            month = months[value.month - 1]
            prefix = "d'" if month[0] in "aeiou" else "de "
            return f"{value.day} {prefix}{month} del {value.year}"
        if language == "es":
            months = [
                "enero",
                "febrero",
                "marzo",
                "abril",
                "mayo",
                "junio",
                "julio",
                "agosto",
                "septiembre",
                "octubre",
                "noviembre",
                "diciembre",
            ]
            return f"{value.day} de {months[value.month - 1]} de {value.year}"

        months = [
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December",
        ]
        return f"{months[value.month - 1]} {value.day}, {value.year}"

    def refresh_translated_state_texts(self):
        self.wifi_status = self.tr("wifi.scan_prompt")
        self.play_status = self.tr("play.choose")
        self.browser_status = self.tr("browser.select")
        self.games_status = self.tr("games.select")

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

    def prepare_menu_tile_asset(self, normal_path, pressed_path=None):
        normal_image = clean_transparent_pixels(load_image(normal_path)) if normal_path else None
        pressed_image = clean_transparent_pixels(load_image(pressed_path)) if pressed_path else None
        return {
            "normal": normal_image,
            "pressed": pressed_image or normal_image,
        }

    def prepare_menu_tile_assets(self):
        return {
            "play": self.prepare_menu_tile_asset(
                MENU_BUTTON_PLAY_NORMAL_PATH,
                MENU_BUTTON_PLAY_PRESSED_PATH,
            ),
            "games": self.prepare_menu_tile_asset(
                MENU_BUTTON_GAME_NORMAL_PATH,
                MENU_BUTTON_GAME_PRESSED_PATH,
            ),
            "clock": self.prepare_menu_tile_asset(
                MENU_BUTTON_CLOCK_NORMAL_PATH,
                MENU_BUTTON_CLOCK_PRESSED_PATH,
            ),
            "qr": self.prepare_menu_tile_asset(
                MENU_BUTTON_QR_NORMAL_PATH,
                MENU_BUTTON_QR_PRESSED_PATH,
            ),
            "wifi": self.prepare_menu_tile_asset(
                MENU_BUTTON_WIFI_NORMAL_PATH,
                MENU_BUTTON_WIFI_PRESSED_PATH,
            ),
            "more": self.prepare_menu_tile_asset(
                MENU_BUTTON_MORE_NORMAL_PATH,
                MENU_BUTTON_MORE_PRESSED_PATH,
            ),
            "language": self.prepare_menu_tile_asset(MENU_BUTTON_LANGUAGE_NORMAL_PATH, MENU_BUTTON_LANGUAGE_PRESSED_PATH),
            "web_pin": self.prepare_menu_tile_asset(MENU_BUTTON_PWD_NORMAL_PATH, MENU_BUTTON_PWD_PRESSED_PATH),
            "poweroff": self.prepare_menu_tile_asset(
                MENU_BUTTON_POWEROFF_NORMAL_PATH,
                MENU_BUTTON_POWEROFF_PRESSED_PATH,
            ),
            "back": self.prepare_menu_tile_asset(MENU_BUTTON_BACK_NORMAL_PATH, MENU_BUTTON_BACK_PRESSED_PATH),
        }

    def prepare_language_icon_assets(self):
        return {
            "1x1": {
                "normal": load_image(LANGUAGE_ICON_EN_NORMAL_PATH),
                "selected": load_image(LANGUAGE_ICON_EN_SELECTED_PATH),
            },
            "1x2": {
                "normal": load_image(LANGUAGE_ICON_CAT_NORMAL_PATH),
                "selected": load_image(LANGUAGE_ICON_CAT_SELECTED_PATH),
            },
            "2x1": {
                "normal": load_image(LANGUAGE_ICON_ES_NORMAL_PATH),
                "selected": load_image(LANGUAGE_ICON_ES_SELECTED_PATH),
            },
        }

    def prepare_play_button_assets(self):
        return {
            "random": {
                "normal": clean_transparent_pixels(load_image(MENU_BUTTON_RANDOM_NORMAL_PATH)),
                "pressed": clean_transparent_pixels(load_image(MENU_BUTTON_RANDOM_PRESSED_PATH)),
            },
            "browse": {
                "normal": clean_transparent_pixels(load_image(MENU_BUTTON_BROWSE_NORMAL_PATH)),
                "pressed": clean_transparent_pixels(load_image(MENU_BUTTON_BROWSE_PRESSED_PATH)),
            },
        }

    def prepare_password_menu_assets(self):
        return {
            "web": {
                "normal": clean_transparent_pixels(load_image(MENU_BUTTON_PWD_WEB_NORMAL_PATH)),
                "pressed": clean_transparent_pixels(load_image(MENU_BUTTON_PWD_WEB_PRESSED_PATH)),
            },
            "raspberry": {
                "normal": clean_transparent_pixels(load_image(MENU_BUTTON_PWD_RASPBERRY_NORMAL_PATH)),
                "pressed": clean_transparent_pixels(load_image(MENU_BUTTON_PWD_RASPBERRY_PRESSED_PATH)),
            },
        }

    def setup_touch_input(self):
        if InputDevice is None:
            log_debug("TOUCH evdev unavailable, falling back to pygame mouse events")
            return

        try:
            touch_path, reason = detect_touch_device()
            if not touch_path:
                self.touch_device = None
                log_debug(f"TOUCH autodetect failed: {reason}. Falling back to pygame mouse events")
                return
            self.touch_device = InputDevice(touch_path)
            self.touch_abs_ranges = get_touch_abs_ranges(self.touch_device)
            log_debug(
                "TOUCH device="
                f"{touch_path} name={self.touch_device.name} autodetect={reason} "
                f"ranges={self.touch_abs_ranges} swap={self.touch_swap_axes} "
                f"invert_x={self.touch_invert_x} invert_y={self.touch_invert_y}"
            )
        except Exception as exc:
            self.touch_device = None
            self.touch_abs_ranges = None
            log_debug(f"TOUCH failed to initialize autodetected device: {exc}")

    def refresh_qr_asset(self):
        self.qr_url = generate_qr()
        connected_wifi = get_connected_wifi_info()
        qr_surface = pygame.Surface((self.width, self.height))
        qr_surface.fill(BLACK)

        wifi_line = self.small_font.render(
            self.tr("qr.wifi_connected", ssid=connected_wifi) if connected_wifi else self.tr("qr.wifi_not_connected"),
            True,
            WHITE,
        )

        if not connected_wifi:
            if self.no_wifi_asset is not None:
                icon_size = min(170, max(110, self.height // 3))
                no_wifi = fit_image_contain(self.no_wifi_asset, (icon_size, icon_size))
                if no_wifi is not None:
                    no_wifi_rect = no_wifi.get_rect(center=(self.width // 2, self.height // 2 - 6))
                    qr_surface.blit(no_wifi, no_wifi_rect)
                    wifi_y = no_wifi_rect.bottom + 34
                else:
                    wifi_y = self.height // 2 + 76
            else:
                wifi_y = self.height // 2 + 76
        else:
            qr = load_image(QR_PNG)
            qr_size = min(self.width, self.height) // 2
            if qr is not None:
                qr_scaled = fit_image(qr, (qr_size, qr_size))
                qr_rect = qr_scaled.get_rect(center=(self.width // 2, self.height // 2 + 5))
                qr_surface.blit(qr_scaled, qr_rect)
                wifi_y = qr_rect.bottom + 44
            else:
                fallback_box = pygame.Rect(110, 120, self.width - 220, 150)
                draw_rect_compat(qr_surface, DARK_GRAY, fallback_box, 0, 24)
                draw_rect_compat(qr_surface, MID_GRAY, fallback_box, 2, 24)
                fallback_label = self.font.render(self.qr_url, True, WHITE)
                qr_surface.blit(fallback_label, fallback_label.get_rect(center=fallback_box.center))
                wifi_y = fallback_box.bottom + 38

        qr_surface.blit(wifi_line, wifi_line.get_rect(center=(self.width // 2, wifi_y)))
        self.qr_asset = qr_surface.convert()

    def refresh_wifi_networks(self):
        if DESKTOP_PREVIEW:
            self.wifi_networks = [
                {"ssid": "Test1Wifi", "signal": 86, "security": "WPA2"},
                {"ssid": "Test2Wifi", "signal": 64, "security": "WPA2"},
            ]
            self.current_wifi_ssid = None
        else:
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
        arrow_width = 81
        arrow_height = 55
        arrow_gap = 18
        side_margin = 20
        arrow_gap_x = 14
        list_rect = pygame.Rect(
            side_margin,
            108,
            self.width - (side_margin * 2) - arrow_gap_x - arrow_width,
            236,
        )
        group_height = (arrow_height * 2) + arrow_gap
        group_top = int(list_rect.centery - group_height / 2)
        arrow_x = list_rect.right + arrow_gap_x
        button_height = 56
        bottom_y = int(list_rect.bottom + ((self.height - list_rect.bottom - button_height) / 2))
        button_gap = 14
        refresh_width = (list_rect.width - button_gap) // 2
        connect_width = list_rect.width - button_gap - refresh_width
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

    def get_password_keyboard_rows(self):
        letters = [
            list("QWERTYUIOP"),
            list("ASDFGHJKL"),
            list("ZXCVBNM"),
        ]
        if not self.password_keyboard_upper:
            letters = [[char.lower() for char in row] for row in letters]

        return [
            [("1", "1"), ("2", "2"), ("3", "3"), ("4", "4"), ("5", "5"), ("6", "6"), ("7", "7"), ("8", "8"), ("9", "9"), ("0", "0")],
            [(char, char) for char in letters[0]],
            [(char, char) for char in letters[1]] + [("<-", "BACKSPACE")],
            [(char, char) for char in letters[2]] + [(".", "."), ("Aa" if self.password_keyboard_upper else "aA", "TOGGLE_CASE"), (self.tr("common.clear"), "CLEAR")],
        ]

    def get_password_keyboard_key_at(self, pos, keyboard_rect):
        if not keyboard_rect.collidepoint(pos):
            return None

        rows = self.get_password_keyboard_rows()
        row_height = keyboard_rect.height / len(rows)
        row_index = int((pos[1] - keyboard_rect.y) / row_height)
        row_index = max(0, min(len(rows) - 1, row_index))
        row = rows[row_index]
        key_width = keyboard_rect.width / len(row)
        column_index = int((pos[0] - keyboard_rect.x) / key_width)
        column_index = max(0, min(len(row) - 1, column_index))
        return row[column_index][1]

    def get_keyboard_key_at(self, pos):
        return self.get_password_keyboard_key_at(pos, self.get_wifi_password_layout()["keyboard"])

    def apply_password_keyboard_key(self, value, key_value):
        if key_value == "BACKSPACE":
            return value[:-1]
        if key_value == "TOGGLE_CASE":
            self.password_keyboard_upper = not self.password_keyboard_upper
            return value
        if key_value == "CLEAR":
            return ""
        return value + key_value

    def get_password_menu_layout(self):
        button_width = 272
        button_height = 103
        center_x = (self.width - button_width) // 2
        info_size = 58
        info_gap = 50
        web_rect = pygame.Rect(center_x, 162, button_width, button_height)
        raspberry_rect = pygame.Rect(center_x, 322, button_width, button_height)
        return {
            "web": web_rect,
            "web_info": pygame.Rect(web_rect.right + info_gap, web_rect.centery - info_size // 2, info_size, info_size),
            "raspberry": raspberry_rect,
            "raspberry_info": pygame.Rect(raspberry_rect.right + info_gap, raspberry_rect.centery - info_size // 2, info_size, info_size),
            "back": self.get_more_back_rect(),
        }

    def password_menu_button_at_pos(self, pos):
        for button_id, rect in self.get_password_menu_layout().items():
            if rect.collidepoint(pos):
                return button_id
        return None

    def get_raspberry_password_layout(self):
        return {
            "current": pygame.Rect(28, 96, self.width - 56, 44),
            "new": pygame.Rect(28, 158, self.width - 56, 44),
            "save": pygame.Rect((self.width - 238) // 2, 218, 238, 56),
            "keyboard": pygame.Rect(20, 292, self.width - 40, self.height - 312),
            "dialog": pygame.Rect(66, 138, self.width - 132, 150),
        }

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
        if self.state == "main":
            return self.get_main_button_rects()
        if self.state == "more":
            return self.get_more_button_rects()
        if self.state == "language":
            return self.get_language_button_rects()
        return {
            button_id: self.scale_rect(x, y, BUTTON_WIDTH, BUTTON_HEIGHT)
            for button_id, (x, y) in BUTTON_LAYOUT.items()
        }

    def get_menu_grid_rects(self, rows, top):
        gap_x = 34
        gap_y = 26
        side_margin = 44
        row_count = max(1, len(rows))
        max_columns = max((len(row) for row in rows), default=1)
        available_width = self.width - (side_margin * 2) - (gap_x * max(0, max_columns - 1))
        available_height = self.height - top - 28 - (gap_y * (row_count - 1))
        tile_size = max(92, min(156, available_width // max_columns, available_height // row_count))
        rects = {}
        for row_index, row in enumerate(rows):
            y = top + row_index * (tile_size + gap_y)
            row_width = (tile_size * len(row)) + (gap_x * max(0, len(row) - 1))
            start_x = (self.width - row_width) // 2
            for column_index, button_id in enumerate(row):
                x = start_x + column_index * (tile_size + gap_x)
                rects[button_id] = pygame.Rect(x, y, tile_size, tile_size)
        return rects

    def get_centered_menu_grid_rects(self, rows, area_top, area_bottom):
        gap_x = 34
        gap_y = 26
        side_margin = 44
        row_count = max(1, len(rows))
        max_columns = max((len(row) for row in rows), default=1)
        available_width = self.width - (side_margin * 2) - (gap_x * max(0, max_columns - 1))
        available_height = area_bottom - area_top - (gap_y * (row_count - 1))
        tile_size = max(92, min(156, available_width // max_columns, available_height // row_count))
        grid_height = (tile_size * row_count) + (gap_y * (row_count - 1))
        top = area_top + max(0, (area_bottom - area_top - grid_height) // 2)
        return self.get_menu_grid_rects(rows, top)

    def get_main_button_rects(self):
        return self.get_centered_menu_grid_rects(
            (
                ("play", "games", "clock"),
                ("qr", "wifi", "more"),
            ),
            MAIN_HEADER_HEIGHT,
            self.height,
        )

    def get_more_button_rects(self):
        return {
            **self.get_centered_menu_grid_rects((("language", "web_pin", "poweroff"),), MAIN_HEADER_HEIGHT, self.height),
            "back": self.get_more_back_rect(),
        }

    def get_more_back_rect(self):
        size = 58
        return pygame.Rect(24, (MAIN_HEADER_HEIGHT - size) // 2, size, size)

    def get_poweroff_button_rects(self):
        button_rects = self.get_centered_menu_grid_rects((("poweroff",),), 210, self.height)
        return {
            **button_rects,
            "back": self.get_more_back_rect(),
        }

    def get_language_button_rects(self):
        button_rects = self.get_centered_menu_grid_rects((("1x1", "1x2", "2x1"),), MAIN_HEADER_HEIGHT, self.height)
        return {
            **button_rects,
            "back": self.get_more_back_rect(),
        }

    def get_play_button_rects(self):
        return {
            "exit": self.get_more_back_rect(),
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
        arrow_width = 81
        arrow_height = 55
        arrow_gap = 18
        side_margin = 20
        arrow_gap_x = 14
        list_rect = pygame.Rect(
            side_margin,
            108,
            self.width - (side_margin * 2) - arrow_gap_x - arrow_width,
            236,
        )
        group_height = (arrow_height * 2) + arrow_gap
        group_top = int(list_rect.centery - group_height / 2)
        arrow_x = list_rect.right + arrow_gap_x
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
                    entries.append(
                        {
                            "label": name,
                            "path": full_path,
                            "type": "directory",
                            "action": "browse",
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

    def draw_browser_empty_state(self, area_rect):
        empty_icon = self.browser_icons["empty"]
        text_y = area_rect.centery + 18
        if empty_icon is not None:
            icon_size = min(110, max(70, area_rect.height - 70))
            scaled_empty = fit_image_contain(empty_icon, (icon_size, icon_size))
            if scaled_empty is not None:
                empty_rect = scaled_empty.get_rect(center=(area_rect.centerx, area_rect.centery - 18))
                self.screen.blit(scaled_empty, empty_rect)
                text_y = empty_rect.bottom + 14

        empty_text = self.truncate_text(self.tr("browser.no_videos"), self.wifi_font, area_rect.width - 24)
        empty_surface = self.wifi_font.render(empty_text, True, WHITE)
        self.screen.blit(empty_surface, empty_surface.get_rect(center=(area_rect.centerx, text_y)))

    def refresh_games_entries(self):
        entries = []
        if os.path.isdir(GAMES_DIR):
            for name in sorted(os.listdir(GAMES_DIR), key=lambda item: item.lower()):
                full_path = os.path.join(GAMES_DIR, name)
                if os.path.isfile(full_path) and is_game_rom_file(name):
                    extension = os.path.splitext(name)[1].lower()
                    platform = GAME_PLATFORM_BY_EXTENSION.get(extension, {})
                    entries.append(
                        {
                            "label": name,
                            "path": full_path,
                            "platform": platform.get("name", "Game Boy"),
                            "core": platform.get("core", ""),
                        }
                    )

        self.games_entries = entries
        if not self.games_entries:
            self.games_selected_index = 0
            self.games_page_start = 0
            self.games_status = self.tr("games.no_games")
            return

        self.games_selected_index = max(0, min(self.games_selected_index, len(self.games_entries) - 1))
        max_start = max(0, len(self.games_entries) - BROWSE_VISIBLE_ITEMS)
        self.games_page_start = min(self.games_page_start, max_start)
        if self.games_selected_index < self.games_page_start:
            self.games_page_start = self.games_selected_index
        if self.games_selected_index >= self.games_page_start + BROWSE_VISIBLE_ITEMS:
            self.games_page_start = self.games_selected_index - BROWSE_VISIBLE_ITEMS + 1
        self.games_status = self.tr("games.select")

    def move_games_selection(self, delta):
        if not self.games_entries:
            return
        self.games_selected_index = max(0, min(len(self.games_entries) - 1, self.games_selected_index + delta))
        if self.games_selected_index < self.games_page_start:
            self.games_page_start = self.games_selected_index
        if self.games_selected_index >= self.games_page_start + BROWSE_VISIBLE_ITEMS:
            self.games_page_start = self.games_selected_index - BROWSE_VISIBLE_ITEMS + 1

    def can_move_games_up(self):
        return bool(self.games_entries) and self.games_selected_index > 0

    def can_move_games_down(self):
        return bool(self.games_entries) and self.games_selected_index < len(self.games_entries) - 1

    def games_entry_at_pos(self, pos):
        layout = self.get_browser_layout()
        if not layout["list"].collidepoint(pos):
            return None
        row_height = layout["list"].height / BROWSE_VISIBLE_ITEMS
        row_index = int((pos[1] - layout["list"].y) / row_height)
        index = self.games_page_start + row_index
        if 0 <= index < len(self.games_entries):
            return index
        return None

    def get_selected_games_entry(self):
        if not self.games_entries:
            return None
        if 0 <= self.games_selected_index < len(self.games_entries):
            return self.games_entries[self.games_selected_index]
        return None

    def write_retroarch_config(self):
        config = "\n".join(
            [
                'video_driver = "sdl2"',
                'input_driver = "sdl2"',
                'joypad_driver = "udev"',
                'menu_driver = "rgui"',
                'audio_driver = "null"',
                'audio_enable = "false"',
                'pause_nonactive = "false"',
                "",
            ]
        )
        with open(RETROARCH_CONFIG_PATH, "w", encoding="utf-8") as handle:
            handle.write(config)

    def build_retroarch_command(self, entry):
        return [
            "retroarch",
            "--appendconfig",
            RETROARCH_CONFIG_PATH,
            "-f",
            "-L",
            entry["core"],
            entry["path"],
        ]

    def close_game_log_handle(self):
        if self.game_log_handle is None:
            return
        try:
            self.game_log_handle.flush()
            self.game_log_handle.close()
        except Exception:
            pass
        self.game_log_handle = None

    def play_game_entry(self, entry):
        if not entry:
            return
        if not entry.get("core") or not os.path.isfile(entry["core"]):
            self.games_status = self.tr("games.missing_core")
            return

        self.stop_video_playback(silent=True)
        self.stop_game_playback(silent=True)
        self.write_retroarch_config()
        command = self.build_retroarch_command(entry)
        log_debug(f"GAME start via retroarch file={entry['path']} core={entry['core']}")
        append_debug_log(RETROARCH_DEBUG_LOG_PATH, f"Launching RetroArch: {' '.join(command)}")
        self.close_game_log_handle()
        try:
            self.suspend_display_for_external_app("game")
            game_env = os.environ.copy()
            game_env["SDL_RENDER_DRIVER"] = "software"
            self.game_log_handle = open(RETROARCH_DEBUG_LOG_PATH, "a", encoding="utf-8")
            self.game_proc = subprocess.Popen(
                command,
                stdout=self.game_log_handle,
                stderr=self.game_log_handle,
                env=game_env,
            )
        except Exception as exc:
            append_debug_log(RETROARCH_DEBUG_LOG_PATH, f"Failed to launch RetroArch: {exc}")
            log_debug(f"GAME failed to launch retroarch: {exc}")
            self.close_game_log_handle()
            self.resume_display_after_external_app("game")
            self.game_proc = None
            self.games_status = self.tr("games.launch_failed")
            self.state = self.game_return_state
            return

        time.sleep(0.15)
        if self.game_proc.poll() is not None:
            return_code = self.game_proc.returncode
            append_debug_log(RETROARCH_DEBUG_LOG_PATH, f"RetroArch exited immediately with return code {return_code}")
            log_debug(f"GAME retroarch exited immediately returncode={return_code}")
            self.close_game_log_handle()
            self.game_proc = None
            self.resume_display_after_external_app("game")
            self.games_status = self.tr("games.launch_failed")
            self.state = self.game_return_state
            return

        self.game_current_path = entry["path"]
        self.state = "game"

    def stop_game_playback(self, silent=False):
        proc = self.game_proc
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=2.0)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        self.close_game_log_handle()
        self.game_proc = None
        self.game_current_path = ""
        if self.display_suspended:
            self.resume_display_after_external_app("game")
        if not silent:
            self.state = self.game_return_state

    def update_game_state(self):
        if self.state == "game" and self.game_proc and self.game_proc.poll() is not None:
            return_code = self.game_proc.returncode
            append_debug_log(RETROARCH_DEBUG_LOG_PATH, f"RetroArch exited with return code {return_code}")
            log_debug(f"GAME retroarch exited returncode={return_code}")
            self.game_proc = None
            self.close_game_log_handle()
            self.resume_display_after_external_app("game")
            self.refresh_games_entries()
            self.state = self.game_return_state

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
        self.browser_last_touch_index = None
        self.browser_last_touch_ticks = 0
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
            f"--input-ipc-server={MPV_SOCKET_PATH}",
        ]
        alsa_device = os.environ.get("MINITV_ALSA_DEVICE", "plughw:1,0")
        if alsa_device.lower() not in ("", "auto", "default"):
            command.append(f"--audio-device=alsa/{alsa_device}")
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
        clear_playback_state()
        self.resume_display_after_video()
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
        self.resume_display_after_video()
        remove_path_if_exists(MPV_SOCKET_PATH)
        self.video_proc = None
        self.video_current_path = ""
        self.loading_video_path = None
        self.loading_video_start_seconds = 0.0
        clear_playback_state()
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
            self.suspend_display_for_video()
            mpv_env = os.environ.copy()
            for env_key in ("SDL_VIDEODRIVER", "SDL_FBDEV", "SDL_MOUSE_TOUCH_EVENTS"):
                mpv_env.pop(env_key, None)
            append_debug_log(
                MPV_DEBUG_LOG_PATH,
                "Launching mpv with sanitized env (removed SDL_VIDEODRIVER, SDL_FBDEV, SDL_MOUSE_TOUCH_EVENTS)",
            )
            self.video_log_handle = open(MPV_DEBUG_LOG_PATH, "a", encoding="utf-8")
            self.video_proc = subprocess.Popen(
                command,
                stdout=self.video_log_handle,
                stderr=self.video_log_handle,
                env=mpv_env,
            )
        except Exception as exc:
            append_debug_log(MPV_DEBUG_LOG_PATH, f"Failed to launch mpv: {exc}")
            log_debug(f"VIDEO failed to launch mpv: {exc}")
            self.close_video_log_handle()
            self.resume_display_after_video()
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
            self.resume_display_after_video()
            remove_path_if_exists(MPV_SOCKET_PATH)
            self.loading_video_path = None
            self.loading_video_start_seconds = 0.0
            clear_playback_state()
            self.state = self.video_return_state
            return
        self.loading_video_path = None
        self.loading_video_start_seconds = 0.0
        write_playback_state(self.video_current_path)
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
            self.resume_display_after_video()
            remove_path_if_exists(MPV_SOCKET_PATH)
            clear_playback_state()
            self.state = self.video_return_state

    def normalize_touch_pos(self, pos):
        if DESKTOP_PREVIEW or self.touch_device is None:
            return pos
        raw_x, raw_y = pos

        x_min = 0
        x_max = max(1, self.width - 1)
        y_min = 0
        y_max = max(1, self.height - 1)
        if self.touch_abs_ranges:
            x_min = self.touch_abs_ranges["x_min"]
            x_max = self.touch_abs_ranges["x_max"]
            y_min = self.touch_abs_ranges["y_min"]
            y_max = self.touch_abs_ranges["y_max"]

        if self.touch_swap_axes:
            normalized_x = int((raw_y - y_min) * (self.width - 1) / (y_max - y_min))
            normalized_y = int((raw_x - x_min) * (self.height - 1) / (x_max - x_min))
        else:
            normalized_x = int((raw_x - x_min) * (self.width - 1) / (x_max - x_min))
            normalized_y = int((raw_y - y_min) * (self.height - 1) / (y_max - y_min))

        if self.touch_invert_x:
            normalized_x = self.width - 1 - normalized_x
        if self.touch_invert_y:
            normalized_y = self.height - 1 - normalized_y

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
        return normalize_language_code(self.config.get("language"))

    def get_selected_language_button(self):
        selected_language = self.get_selected_language_code()
        for button_id, language_code in LANGUAGE_BUTTON_MAP.items():
            if language_code == selected_language:
                return button_id
        return "1x1"

    def set_language(self, language_code):
        language_code = normalize_language_code(language_code)
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
            if button_id in ("play", "2x1"):
                self.state = "play"
            elif button_id in ("games",):
                self.games_selected_index = 0
                self.games_page_start = 0
                self.games_return_state = self.state
                self.refresh_games_entries()
                self.state = "games"
            elif button_id in ("clock",):
                self.clock_return_state = "main"
                self.state = "clock"
            elif button_id in ("qr", "1x2"):
                self.refresh_qr_asset()
                self.state = "qr"
            elif button_id in ("wifi",):
                self.refresh_wifi_networks()
                self.state = "wifi"
            elif button_id in ("more", "2x2"):
                self.state = "more"
            elif button_id == "1x1":
                self.state = "settings"
        elif self.state == "settings":
            if button_id == "1x1":
                self.refresh_wifi_networks()
                self.state = "wifi"
            elif button_id == "1x2":
                self.password_menu_return_state = "settings"
                self.state = "password_menu"
            elif button_id == "2x1":
                self.pressed_button = None
                self.language_return_state = "settings"
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
            elif button_id in ("back", "2x2"):
                self.state = self.language_return_state
        elif self.state == "more":
            if button_id in ("language",):
                self.pressed_button = None
                self.language_return_state = "more"
                self.state = "language"
            elif button_id in ("web_pin",):
                self.password_menu_return_state = "more"
                self.state = "password_menu"
            elif button_id in ("poweroff", "2x1"):
                self.state = "poweroff"
            elif button_id in ("back", "2x2"):
                self.state = "main"
        elif self.state == "qr":
            self.state = "main"

    def handle_poweroff_action(self, button_id):
        log_debug(f"POWEROFF action button={button_id}")
        if button_id in ("poweroff", "1x1"):
            run_command(["shutdown", "-h", "now"])
        elif button_id in ("back", "1x2"):
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
            self.browser_last_touch_index = None
            self.browser_last_touch_ticks = 0
            if os.path.abspath(self.browser_path) == os.path.abspath(VIDEOS_DIR):
                self.state = "play"
            else:
                self.browser_path = os.path.dirname(self.browser_path)
                self.browser_selected_index = 0
                self.browser_page_start = 0
                self.refresh_browser_entries()
            return
        if active_button == "browser-up" and layout["up"].collidepoint(pos):
            self.browser_last_touch_index = None
            self.browser_last_touch_ticks = 0
            self.move_browser_selection(-1)
            return
        if active_button == "browser-down" and layout["down"].collidepoint(pos):
            self.browser_last_touch_index = None
            self.browser_last_touch_ticks = 0
            self.move_browser_selection(1)
            return

        selected_entry = self.get_selected_browser_entry()
        if active_button == "browser-action" and layout["action"].collidepoint(pos):
            self.activate_browser_entry(selected_entry)
            return

        entry_index = self.browser_entry_at_pos(pos)
        if entry_index is not None:
            now = pygame.time.get_ticks()
            is_double_touch = (
                active_button == "browse-touch"
                and entry_index == self.browser_last_touch_index
                and now - self.browser_last_touch_ticks <= BROWSE_DOUBLE_TAP_MS
            )
            self.browser_selected_index = entry_index
            if is_double_touch:
                self.activate_browser_entry(self.get_selected_browser_entry())
                return
            self.browser_last_touch_index = entry_index
            self.browser_last_touch_ticks = now

    def handle_games_touch_down(self, pos):
        layout = self.get_browser_layout()
        selected_entry = self.get_selected_games_entry()
        if self.top_back_at_pos(pos):
            self.pressed_button = "top-back"
        elif self.can_move_games_up() and layout["up"].collidepoint(pos):
            self.pressed_button = "games-up"
        elif self.can_move_games_down() and layout["down"].collidepoint(pos):
            self.pressed_button = "games-down"
        elif selected_entry and layout["action"].collidepoint(pos):
            self.pressed_button = "games-action"
        else:
            self.pressed_button = "games-touch"
        log_debug(f"GAMES DOWN pos={pos} selected={self.games_selected_index}")

    def handle_games_touch_up(self, pos):
        active_button = self.pressed_button
        self.pressed_button = None
        layout = self.get_browser_layout()
        if active_button == "top-back" and self.top_back_at_pos(pos):
            self.state = self.games_return_state
            return
        if active_button == "games-up" and layout["up"].collidepoint(pos):
            self.move_games_selection(-1)
            return
        if active_button == "games-down" and layout["down"].collidepoint(pos):
            self.move_games_selection(1)
            return

        selected_entry = self.get_selected_games_entry()
        if active_button == "games-action" and layout["action"].collidepoint(pos):
            self.game_return_state = "games"
            self.play_game_entry(selected_entry)
            return

        entry_index = self.games_entry_at_pos(pos)
        if entry_index is not None:
            self.games_selected_index = entry_index

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
                self.state = "main"
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
                        self.password_keyboard_upper = True
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
            self.wifi_password = self.apply_password_keyboard_key(self.wifi_password, key_value)

    def reset_raspberry_password_form(self):
        self.raspberry_current_password = ""
        self.raspberry_new_password = ""
        self.raspberry_password_field = "current"
        self.raspberry_password_message = ""
        self.raspberry_password_is_error = False
        self.password_keyboard_upper = True

    def handle_password_menu_touch_down(self, pos):
        self.pressed_button = self.password_menu_button_at_pos(pos)
        log_debug(f"PASSWORD MENU DOWN pos={pos} pressed={self.pressed_button}")

    def handle_password_menu_touch_up(self, pos):
        active_button = self.pressed_button
        released_button = self.password_menu_button_at_pos(pos)
        self.pressed_button = None
        log_debug(f"PASSWORD MENU UP pos={pos} down={active_button} up={released_button}")
        if not active_button or active_button != released_button:
            return
        if active_button in ("web_info", "raspberry_info"):
            return
        if active_button == "back":
            self.state = self.password_menu_return_state
            return
        if active_button == "web":
            self.web_pin_return_state = "password_menu"
            self.web_pin_value = self.config.get("web_password", DEFAULT_SETTINGS["web_password"])
            self.state = "web_pin"
            return
        if active_button == "raspberry":
            self.reset_raspberry_password_form()
            self.state = "raspberry_password"

    def handle_raspberry_password_touch_down(self, pos):
        if self.raspberry_password_message:
            self.pressed_button = "raspberry-password-dialog"
            return
        layout = self.get_raspberry_password_layout()
        if self.top_back_at_pos(pos):
            self.pressed_button = "top-back"
        elif layout["save"].collidepoint(pos) and self.can_save_raspberry_password():
            self.pressed_button = "raspberry-password-save"
        elif layout["current"].collidepoint(pos):
            self.pressed_button = "raspberry-password-field:current"
        elif layout["new"].collidepoint(pos):
            self.pressed_button = "raspberry-password-field:new"
        else:
            key_value = self.get_password_keyboard_key_at(pos, layout["keyboard"])
            self.pressed_button = f"raspberry-password-key:{key_value}" if key_value else "raspberry-password-touch"
        log_debug(f"RASPBERRY PASSWORD DOWN pos={pos} field={self.raspberry_password_field}")

    def handle_raspberry_password_touch_up(self, pos):
        active_button = self.pressed_button
        self.pressed_button = None
        if self.raspberry_password_message:
            if active_button == "raspberry-password-dialog":
                success = not self.raspberry_password_is_error
                self.raspberry_password_message = ""
                self.raspberry_password_is_error = False
                if success:
                    self.state = "password_menu"
            return

        layout = self.get_raspberry_password_layout()
        if active_button == "top-back" and self.top_back_at_pos(pos):
            self.state = "password_menu"
            return
        if active_button == "raspberry-password-field:current" and layout["current"].collidepoint(pos):
            self.raspberry_password_field = "current"
            return
        if active_button == "raspberry-password-field:new" and layout["new"].collidepoint(pos):
            self.raspberry_password_field = "new"
            return
        if active_button == "raspberry-password-save" and layout["save"].collidepoint(pos):
            success, message_key = change_raspberry_password(
                self.raspberry_current_password,
                self.raspberry_new_password,
            )
            self.raspberry_password_message = self.tr(message_key)
            self.raspberry_password_is_error = not success
            if success:
                self.raspberry_current_password = ""
                self.raspberry_new_password = ""
            return

        key_value = self.get_password_keyboard_key_at(pos, layout["keyboard"])
        if key_value is None:
            return
        if self.raspberry_password_field == "current":
            self.raspberry_current_password = self.apply_password_keyboard_key(
                self.raspberry_current_password,
                key_value,
            )
        else:
            self.raspberry_new_password = self.apply_password_keyboard_key(
                self.raspberry_new_password,
                key_value,
            )

    def can_save_raspberry_password(self):
        return bool(self.raspberry_current_password and self.raspberry_new_password)

    def get_web_pin_layout(self):
        return {
            "value": pygame.Rect(104, 112, self.width - 208, 62),
            "save": pygame.Rect((self.width - 200) // 2, 188, 200, 48),
            "keyboard": pygame.Rect(96, 254, self.width - 192, self.height - 298),
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
            self.state = self.web_pin_return_state
            return
        if active_button == "web-pin-save" and layout["save"].collidepoint(pos):
            if len(self.web_pin_value) == 4:
                self.config["web_password"] = self.web_pin_value
                self.save_settings()
                self.state = self.web_pin_return_state
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
            if self.alarm_playing:
                self.stop_alarm_sound()
                self.pressed_button = None
                log_debug(f"DOWN raw={pos} normalized={normalized_pos} state=clock alarm_stopped=True")
                return
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
        if self.state == "password_menu":
            self.handle_password_menu_touch_down(normalized_pos)
            return
        if self.state == "raspberry_password":
            self.handle_raspberry_password_touch_down(normalized_pos)
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
        if self.state == "games":
            self.handle_games_touch_down(normalized_pos)
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
                self.state = self.clock_return_state
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
        if self.state == "password_menu":
            self.handle_password_menu_touch_up(normalized_pos)
            log_debug(f"UP raw={pos} normalized={normalized_pos} state=password_menu")
            return
        if self.state == "raspberry_password":
            self.handle_raspberry_password_touch_up(normalized_pos)
            log_debug(f"UP raw={pos} normalized={normalized_pos} state=raspberry_password")
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
        if self.state == "games":
            self.handle_games_touch_up(normalized_pos)
            log_debug(f"UP raw={pos} normalized={normalized_pos} state=games")
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

    def finger_event_pos(self, event):
        return (int(event.x * self.width), int(event.y * self.height))

    def should_ignore_finger_event(self):
        return pygame.time.get_ticks() - self.last_mouse_event_ticks < 250

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
        self.screen.fill((18, 22, 28))
        now = datetime.now()
        self.draw_submenu_header(self.format_long_date(now))

        hours_text = now.strftime("%H")
        minutes_text = now.strftime("%M")
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
        center_y = self.height // 2 + 16

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

        alarms = normalize_alarms(self.config.get("alarms"))
        active_alarms = [alarm for alarm in alarms if alarm.get("enabled")]
        alarm_lines = (
            [self.tr("clock.alarm", id=alarm.get("id"), time=alarm.get("time")) for alarm in active_alarms]
            if active_alarms
            else [self.tr("clock.no_alarms")]
        )
        first_line_y = minutes_rect.bottom + 22
        line_gap = 30
        for index, line in enumerate(alarm_lines[:3]):
            surface = self.font.render(line, True, (210, 210, 210))
            rect = surface.get_rect(center=(self.width // 2, first_line_y + (index * line_gap)))
            self.screen.blit(surface, rect)

    def draw_wifi(self):
        layout = self.get_wifi_layout()
        self.screen.fill((18, 22, 28))
        self.draw_submenu_header(self.tr("wifi.title"))

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
            self.draw_arrow_control(key_name, rect, enabled, f"wifi-{key_name}")

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

            label = self.wifi_font.render(label_text, True, WHITE)
            if not enabled:
                label.set_alpha(80)
            label_rect = label.get_rect(center=rect.center)
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

        self.draw_wifi_connect_button(layout["connect"], self.pressed_button == "wifi-password-connect")

        self.draw_password_keyboard(layout["keyboard"], "wifi-password-key")

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

    def draw_wifi_connect_button(self, rect, pressed=False):
        connect_asset = self.wifi_assets["connect"]["pressed"] if pressed else self.wifi_assets["connect"]["normal"]
        if connect_asset is not None:
            self.screen.blit(connect_asset, rect)
        label_center_x = rect.centerx
        connect_icon = self.wifi_button_icons["connect"]["pressed"] if pressed else self.wifi_button_icons["connect"]["normal"]
        if connect_icon is not None:
            scaled_icon = fit_image_contain(connect_icon, (rect.height - 18, rect.height - 18))
            if scaled_icon is not None:
                icon_rect = scaled_icon.get_rect()
                icon_rect.left = rect.x + 16
                icon_rect.centery = rect.centery
                self.screen.blit(scaled_icon, icon_rect)
                label_center_x = (icon_rect.right + rect.right) // 2
        connect_label = self.wifi_font.render(self.tr("common.connect"), True, WHITE)
        connect_label_rect = connect_label.get_rect(center=(label_center_x, rect.centery))
        self.screen.blit(connect_label, connect_label_rect)

    def draw_poweroff(self):
        self.screen.fill((18, 22, 28))
        self.draw_submenu_header(self.tr("more.poweroff"))
        line1 = self.poweroff_title_font.render(self.tr("poweroff.line1"), True, WHITE)
        line2 = self.poweroff_title_font.render(self.tr("poweroff.line2"), True, WHITE)
        self.screen.blit(line1, line1.get_rect(center=(self.width // 2, 128)))
        self.screen.blit(line2, line2.get_rect(center=(self.width // 2, 168)))
        for button_id, rect in self.get_poweroff_button_rects().items():
            if button_id == "back":
                continue
            self.draw_menu_tile(button_id, rect, self.tr("more.poweroff"), self.pressed_button == button_id, RED)

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

    def draw_top_back_button(self, pressed=None):
        back_rect = self.get_top_back_rect()
        is_pressed = self.pressed_button == "top-back" if pressed is None else pressed
        self.draw_menu_tile("back", back_rect, self.tr("common.back"), is_pressed)

    def draw_arrow_control(self, key_name, rect, enabled, pressed_button):
        state = "pressed" if self.pressed_button == pressed_button else "normal"
        icon = self.wifi_arrow_icons[key_name][state]
        if icon is None:
            return

        scaled_icon = fit_image_contain(icon, rect.size)
        if scaled_icon is None:
            return

        if not enabled:
            scaled_icon = tint_icon(scaled_icon, DISABLED_ARROW_COLOR)
        self.screen.blit(scaled_icon, scaled_icon.get_rect(center=rect.center))

    def draw_menu_tile(self, button_id, rect, label, pressed=False, color=MID_GRAY):
        background_key = "red_pressed" if pressed and color == RED else "pressed" if pressed else "normal"
        background = self.menu_button_backgrounds.get(background_key)
        if background is not None:
            self.screen.blit(fit_image(background, rect.size), rect)
        else:
            fill = color if pressed else DARK_GRAY
            draw_rect_compat(self.screen, fill, rect, 0, 8)
            draw_rect_compat(self.screen, WHITE, rect, 3 if pressed else 2, 8)

        asset_pack = self.menu_tile_assets.get(button_id, {})
        asset = asset_pack.get("pressed" if pressed else "normal")
        if asset is not None:
            fitted = fit_image_contain(asset, (rect.width, rect.height))
            if fitted is not None:
                self.screen.blit(fitted, fitted.get_rect(center=rect.center))
                return

        label_surface = self.wifi_bold_font.render(label, True, WHITE)
        if label_surface.get_width() > rect.width - 18:
            label = self.truncate_text(label, self.wifi_bold_font, rect.width - 18)
            label_surface = self.wifi_bold_font.render(label, True, WHITE)
        label_rect = label_surface.get_rect(center=(rect.centerx, rect.bottom - 24))
        if asset is None:
            label_rect = label_surface.get_rect(center=rect.center)
        self.screen.blit(label_surface, label_rect)

    def draw_language_tile(self, button_id, rect, selected=False, pressed=False):
        background = self.menu_button_backgrounds.get("pressed" if pressed else "normal")
        if background is not None:
            self.screen.blit(fit_image(background, rect.size), rect)
        else:
            draw_rect_compat(self.screen, DARK_GRAY, rect, 0, 8)
            draw_rect_compat(self.screen, WHITE, rect, 2, 8)

        icon_state = "selected" if selected else "normal"
        icon = self.language_icon_assets.get(button_id, {}).get(icon_state)
        if icon is None:
            fallback_labels = {"1x1": "EN", "1x2": "CAT", "2x1": "ES"}
            label_surface = self.wifi_bold_font.render(fallback_labels.get(button_id, ""), True, WHITE)
            self.screen.blit(label_surface, label_surface.get_rect(center=rect.center))
            return

        fitted = fit_image_contain(icon, (rect.width - 22, rect.height - 22))
        if fitted is not None:
            self.screen.blit(fitted, fitted.get_rect(center=rect.center))

    def draw_play_choice_button(self, button_id, rect, label, pressed=False):
        state = "pressed" if pressed else "normal"
        background = self.menu_button_2x_backgrounds.get(state)
        if background is not None:
            self.screen.blit(fit_image(background, rect.size), rect)
        else:
            draw_rect_compat(self.screen, DARK_GRAY, rect, 0, 8)
            draw_rect_compat(self.screen, WHITE, rect, 2, 8)

        icon = self.play_button_assets.get(button_id, {}).get(state)
        if icon is None:
            icon = self.play_button_assets.get(button_id, {}).get("normal")
        if icon is not None:
            self.screen.blit(fit_image(icon, rect.size), rect)

        label_surface = self.play_label_font.render(label, True, WHITE)
        label_rect = label_surface.get_rect()
        label_rect.left = rect.x + int(rect.width * 0.48)
        label_rect.centery = rect.centery
        self.screen.blit(label_surface, label_rect)

    def draw_password_choice_button(self, button_id, rect, label, pressed=False):
        state = "pressed" if pressed else "normal"
        background = self.menu_button_2x_backgrounds.get(state)
        background_rect = rect.inflate(int(rect.width * 0.25), 0)
        background_rect.center = rect.center
        if background is not None:
            self.screen.blit(fit_image(background, background_rect.size), background_rect)
        else:
            draw_rect_compat(self.screen, DARK_GRAY, background_rect, 0, 8)
            draw_rect_compat(self.screen, WHITE, background_rect, 2, 8)

        icon = self.password_menu_assets.get(button_id, {}).get(state)
        if icon is None:
            icon = self.password_menu_assets.get(button_id, {}).get("normal")
        if icon is not None:
            fitted_icon = fit_image(icon, rect.size)
            icon_rect = fitted_icon.get_rect()
            icon_rect.left = background_rect.left + 18
            icon_rect.centery = rect.centery
            self.screen.blit(fitted_icon, icon_rect)

        label_surface = self.play_label_font.render(label, True, WHITE)
        label_rect = label_surface.get_rect()
        label_rect.left = rect.x + int(rect.width * 0.48)
        label_rect.centery = rect.centery
        self.screen.blit(label_surface, label_rect)

    def draw_password_choice_description(self, text, button_rect):
        description = self.truncate_text(text, self.small_font, self.width - 96)
        description_surface = self.small_font.render(description, True, WHITE)
        description_rect = description_surface.get_rect(center=(self.width // 2, button_rect.y - 20))
        self.screen.blit(description_surface, description_rect)

    def draw_password_information_button(self, rect, pressed=False):
        state = "pressed" if pressed else "normal"
        icon = self.password_information_assets.get(state) or self.password_information_assets.get("normal")
        if icon is not None:
            fitted = fit_image_contain(icon, rect.size)
            if fitted is not None:
                self.screen.blit(fitted, fitted.get_rect(center=rect.center))
                return
        draw_rect_compat(self.screen, MID_GRAY if pressed else DARK_GRAY, rect, 0, 12)
        draw_rect_compat(self.screen, WHITE, rect, 2, 12)
        label = self.wifi_bold_font.render("i", True, WHITE)
        self.screen.blit(label, label.get_rect(center=rect.center))

    def draw_password_keyboard(self, keyboard_rect, pressed_prefix):
        rows = self.get_password_keyboard_rows()
        row_height = keyboard_rect.height / len(rows)
        for row_index, row in enumerate(rows):
            key_width = keyboard_rect.width / len(row)
            for col_index, (label, value) in enumerate(row):
                rect = pygame.Rect(
                    int(keyboard_rect.x + col_index * key_width + 2),
                    int(keyboard_rect.y + row_index * row_height + 2),
                    int(key_width - 4),
                    int(row_height - 4),
                )
                is_pressed = self.pressed_button == f"{pressed_prefix}:{value}"
                key_color = (98, 98, 98) if is_pressed else MID_GRAY
                draw_rect_compat(self.screen, key_color, rect, 0, 10)
                icon = self.password_keyboard_icons.get(value)
                if icon is not None:
                    icon_size = (int(rect.width * 0.52), int(rect.height * 0.52))
                    scaled_icon = fit_image_contain(icon, icon_size)
                    if scaled_icon is not None:
                        self.screen.blit(scaled_icon, scaled_icon.get_rect(center=rect.center))
                        continue
                text_surface = self.small_font.render(label, True, WHITE)
                self.screen.blit(text_surface, text_surface.get_rect(center=rect.center))

    def draw_password_field(self, rect, label, value, active=False):
        border_color = GREEN if active else WHITE
        draw_rect_compat(self.screen, DARK_GRAY, rect, 0, 12)
        draw_rect_compat(self.screen, border_color, rect, 2, 12)
        label_surface = self.small_font.render(label, True, GRAY)
        self.screen.blit(label_surface, (rect.x + 12, rect.y + 4))
        masked = self.truncate_text("*" * len(value), self.wifi_font, rect.width - 24)
        value_surface = self.wifi_font.render(masked or " ", True, WHITE)
        self.screen.blit(value_surface, (rect.x + 12, rect.y + 20))

    def draw_main_header(self):
        header_rect = pygame.Rect(0, 0, self.width, MAIN_HEADER_HEIGHT)
        self.screen.fill((18, 22, 28))
        draw_rect_compat(self.screen, HEADER_BACKGROUND, header_rect, 0, 0)
        pygame.draw.line(self.screen, (220, 220, 220), (0, header_rect.bottom - 1), (self.width, header_rect.bottom - 1), 2)

        logo_left = 24
        logo_size = 70
        if self.mini_logo_asset is not None:
            logo = fit_image_contain(self.mini_logo_asset, (logo_size, logo_size))
            if logo is not None:
                self.screen.blit(logo, logo.get_rect(midleft=(logo_left, header_rect.centery)))

        title = self.main_title_font.render(self.tr("main.title"), True, BLACK)
        title_rect = title.get_rect(center=(self.width // 2, header_rect.centery))
        self.screen.blit(title, title_rect)

    def draw_submenu_header(self, title_text):
        header_rect = pygame.Rect(0, 0, self.width, MAIN_HEADER_HEIGHT)
        draw_rect_compat(self.screen, HEADER_BACKGROUND, header_rect, 0, 0)
        pygame.draw.line(self.screen, (220, 220, 220), (0, header_rect.bottom - 1), (self.width, header_rect.bottom - 1), 2)

        back_pressed = self.pressed_button in ("back", "top-back", "exit")
        self.draw_menu_tile("back", self.get_more_back_rect(), self.tr("common.back"), back_pressed)

        title_text = self.truncate_text(title_text, self.main_title_font, self.width - 150)
        title = self.main_title_font.render(title_text, True, BLACK)
        title_rect = title.get_rect(center=(self.width // 2, header_rect.centery))
        self.screen.blit(title, title_rect)

    def draw_main_menu(self):
        self.draw_main_header()

        labels = {
            "play": self.tr("main.play"),
            "games": self.tr("main.games"),
            "clock": self.tr("main.clock"),
            "qr": self.tr("main.qr"),
            "wifi": self.tr("main.wifi"),
            "more": self.tr("main.more"),
        }
        colors = {
            "play": (59, 130, 246),
            "games": (72, 190, 120),
            "clock": (168, 85, 247),
            "qr": (245, 158, 11),
            "wifi": (20, 184, 166),
            "more": (239, 68, 68),
        }
        for button_id, rect in self.get_main_button_rects().items():
            self.draw_menu_tile(button_id, rect, labels[button_id], self.pressed_button == button_id, colors[button_id])

    def draw_more_menu(self):
        self.screen.fill((18, 22, 28))
        self.draw_submenu_header(self.tr("more.title"))

        labels = {
            "language": self.tr("more.language"),
            "web_pin": self.tr("more.web_pin"),
            "poweroff": self.tr("more.poweroff"),
        }
        colors = {
            "language": (59, 130, 246),
            "web_pin": (245, 158, 11),
            "poweroff": (239, 68, 68),
        }
        for button_id, rect in self.get_more_button_rects().items():
            if button_id == "back":
                continue
            self.draw_menu_tile(button_id, rect, labels[button_id], self.pressed_button == button_id, colors[button_id])

    def draw_play(self):
        self.screen.fill((18, 22, 28))
        self.draw_submenu_header(self.tr("play.title"))
        button_rects = self.get_play_button_rects()
        self.draw_play_choice_button(
            "random",
            button_rects["random"],
            self.tr("play.random"),
            self.pressed_button == "random",
        )
        self.draw_play_choice_button(
            "browse",
            button_rects["browse"],
            self.tr("play.browse"),
            self.pressed_button == "browse",
        )

    def draw_settings(self):
        asset_pack = self.assets["settings"]
        asset = asset_pack["pressed"].get(self.pressed_button) if self.pressed_button else asset_pack["default"]
        if asset is None:
            self.draw_missing("menu/Settings_Menu.png")
            return
        self.screen.blit(asset, (0, 0))

    def draw_language(self):
        selected_button = self.get_selected_language_button()
        self.screen.fill((18, 22, 28))
        self.draw_submenu_header(self.tr("language.title"))
        for button_id, rect in self.get_language_button_rects().items():
            if button_id == "back":
                continue
            self.draw_language_tile(
                button_id,
                rect,
                selected=button_id == selected_button,
                pressed=self.pressed_button == button_id,
            )

    def draw_password_menu(self):
        layout = self.get_password_menu_layout()
        self.screen.fill((18, 22, 28))
        self.draw_submenu_header(self.tr("password.title"))
        if self.pressed_button == "web_info":
            self.draw_password_choice_description(self.tr("password.web_description"), layout["web"])
        self.draw_password_choice_button(
            "web",
            layout["web"],
            self.tr("password.web"),
            self.pressed_button == "web",
        )
        self.draw_password_information_button(layout["web_info"], self.pressed_button == "web_info")
        if self.pressed_button == "raspberry_info":
            self.draw_password_choice_description(self.tr("password.raspberry_description"), layout["raspberry"])
        self.draw_password_choice_button(
            "raspberry",
            layout["raspberry"],
            self.tr("password.raspberry"),
            self.pressed_button == "raspberry",
        )
        self.draw_password_information_button(layout["raspberry_info"], self.pressed_button == "raspberry_info")

    def draw_raspberry_password(self):
        layout = self.get_raspberry_password_layout()
        self.screen.fill((18, 22, 28))
        self.draw_submenu_header(self.tr("password.raspberry_title"))

        self.draw_password_field(
            layout["current"],
            self.tr("password.current"),
            self.raspberry_current_password,
            self.raspberry_password_field == "current",
        )
        self.draw_password_field(
            layout["new"],
            self.tr("password.new"),
            self.raspberry_new_password,
            self.raspberry_password_field == "new",
        )

        save_enabled = self.can_save_raspberry_password()
        save_asset = self.browser_assets["action"]["pressed"] if self.pressed_button == "raspberry-password-save" else self.browser_assets["action"]["normal"]
        if save_asset is not None:
            save_surface = save_asset.copy()
            if not save_enabled:
                save_surface.set_alpha(128)
            self.screen.blit(save_surface, layout["save"])
        else:
            draw_rect_compat(self.screen, GREEN if save_enabled else MID_GRAY, layout["save"], 0, 16)

        save_label = self.wifi_font.render(self.tr("common.save"), True, WHITE)
        if not save_enabled:
            save_label.set_alpha(128)
        self.screen.blit(save_label, save_label.get_rect(center=layout["save"].center))

        self.draw_password_keyboard(layout["keyboard"], "raspberry-password-key")

        if self.raspberry_password_message:
            overlay = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 150))
            self.screen.blit(overlay, (0, 0))
            dialog_rect = layout["dialog"]
            dialog_color = (110, 38, 38) if self.raspberry_password_is_error else (38, 72, 44)
            draw_rect_compat(self.screen, dialog_color, dialog_rect, 0, 18)
            draw_rect_compat(self.screen, WHITE, dialog_rect, 2, 18)
            title_text = self.tr("password.error") if self.raspberry_password_is_error else self.tr("password.saved")
            title_surface = self.wifi_bold_font.render(title_text, True, WHITE)
            body_surface = self.small_font.render(
                self.truncate_text(self.raspberry_password_message, self.small_font, dialog_rect.width - 24),
                True,
                WHITE,
            )
            hint_surface = self.small_font.render(self.tr("common.close"), True, WHITE)
            self.screen.blit(title_surface, title_surface.get_rect(center=(dialog_rect.centerx, dialog_rect.y + 32)))
            self.screen.blit(body_surface, body_surface.get_rect(center=(dialog_rect.centerx, dialog_rect.centery)))
            self.screen.blit(hint_surface, hint_surface.get_rect(center=(dialog_rect.centerx, dialog_rect.bottom - 24)))

    def draw_web_pin(self):
        layout = self.get_web_pin_layout()
        self.screen.fill((18, 22, 28))
        self.draw_submenu_header(self.tr("web_pin.title"))
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
        self.screen.fill((18, 22, 28))
        self.draw_submenu_header(self.tr("browser.path", path=self.rel_browser_path()))

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
            self.draw_arrow_control(key_name, rect, enabled, f"browser-{key_name}")

        pygame.draw.rect(self.screen, DARK_GRAY, layout["list"])
        if not self.browser_entries:
            self.draw_browser_empty_state(layout["list"])
        else:
            row_height = layout["list"].height / BROWSE_VISIBLE_ITEMS
            visible_entries = self.browser_entries[self.browser_page_start:self.browser_page_start + BROWSE_VISIBLE_ITEMS]
            for row_offset, entry in enumerate(visible_entries):
                index = self.browser_page_start + row_offset
                row_rect = pygame.Rect(
                    layout["list"].x + 6,
                    int(layout["list"].y + 4 + row_offset * row_height),
                    layout["list"].width - 12,
                    int(row_height - 6),
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
                self.screen.blit(entry_surface, (row_rect.x + 10, row_rect.y + 4))
                self.screen.blit(meta_surface, (row_rect.x + 10, row_rect.y + 32))

            if len(self.browser_entries) == 1 and self.browser_entries[0]["type"] == "parent":
                empty_area = pygame.Rect(
                    layout["list"].x + 12,
                    int(layout["list"].y + row_height + 10),
                    layout["list"].width - 24,
                    int(layout["list"].height - row_height - 18),
                )
                self.draw_browser_empty_state(empty_area)

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

    def draw_games(self):
        layout = self.get_browser_layout()
        self.screen.fill((18, 22, 28))
        self.draw_submenu_header(self.tr("games.path", path="/Games"))

        selected_entry = self.get_selected_games_entry()
        action_label = self.tr("games.play")

        for key_name, rect, enabled in (
            ("up", layout["up"], self.can_move_games_up()),
            ("down", layout["down"], self.can_move_games_down()),
        ):
            self.draw_arrow_control(key_name, rect, enabled, f"games-{key_name}")

        pygame.draw.rect(self.screen, DARK_GRAY, layout["list"])
        if not self.games_entries:
            empty_icon = self.browser_icons["empty"]
            text_y = layout["list"].centery + 18
            if empty_icon is not None:
                icon_size = min(110, max(70, layout["list"].height - 70))
                scaled_empty = fit_image_contain(empty_icon, (icon_size, icon_size))
                if scaled_empty is not None:
                    empty_rect = scaled_empty.get_rect(center=(layout["list"].centerx, layout["list"].centery - 18))
                    self.screen.blit(scaled_empty, empty_rect)
                    text_y = empty_rect.bottom + 14
            empty_text = self.truncate_text(self.tr("games.no_games"), self.wifi_font, layout["list"].width - 24)
            empty_surface = self.wifi_font.render(empty_text, True, WHITE)
            self.screen.blit(empty_surface, empty_surface.get_rect(center=(layout["list"].centerx, text_y)))
        else:
            row_height = layout["list"].height / BROWSE_VISIBLE_ITEMS
            visible_entries = self.games_entries[self.games_page_start:self.games_page_start + BROWSE_VISIBLE_ITEMS]
            for row_offset, entry in enumerate(visible_entries):
                index = self.games_page_start + row_offset
                row_rect = pygame.Rect(
                    layout["list"].x + 6,
                    int(layout["list"].y + 4 + row_offset * row_height),
                    layout["list"].width - 12,
                    int(row_height - 6),
                )
                selected = index == self.games_selected_index
                pygame.draw.rect(self.screen, MID_GRAY if selected else DARK_GRAY, row_rect)
                entry_label = f"[ROM] {entry['label']}"
                meta_label = entry.get("platform") or self.tr("media.games")
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
                self.screen.blit(entry_surface, (row_rect.x + 10, row_rect.y + 4))
                self.screen.blit(meta_surface, (row_rect.x + 10, row_rect.y + 32))

        if selected_entry:
            action_asset = self.browser_assets["action"]["pressed"] if self.pressed_button == "games-action" else self.browser_assets["action"]["normal"]
            if action_asset is not None:
                self.screen.blit(action_asset, layout["action"])

            icon_state = "pressed" if self.pressed_button == "games-action" else "normal"
            action_icon = self.browser_icons["view"][icon_state]
            text_left = layout["action"].x + 20
            if action_icon is not None:
                scaled_icon = fit_image_contain(action_icon, (layout["action"].height - 18, layout["action"].height - 18))
                if scaled_icon is not None:
                    icon_rect = scaled_icon.get_rect()
                    icon_rect.left = layout["action"].x + 16
                    icon_rect.centery = layout["action"].centery
                    self.screen.blit(scaled_icon, icon_rect)
                    text_left = icon_rect.right + 14

            action_surface = self.wifi_font.render(action_label, True, WHITE)
            action_rect = action_surface.get_rect()
            action_rect.left = text_left
            action_rect.centery = layout["action"].centery
            self.screen.blit(action_surface, action_rect)

    def draw(self):
        if self.state == "main":
            self.draw_main_menu()
        elif self.state == "more":
            self.draw_more_menu()
        elif self.state == "qr":
            if self.qr_asset is None:
                self.refresh_qr_asset()
            if self.qr_asset is None:
                self.draw_missing("QR")
            else:
                self.screen.blit(self.qr_asset, (0, 0))
            self.draw_submenu_header(self.tr("qr.title"))
        elif self.state == "clock":
            self.draw_clock()
        elif self.state == "settings":
            self.draw_settings()
        elif self.state == "language":
            self.draw_language()
        elif self.state == "password_menu":
            self.draw_password_menu()
        elif self.state == "raspberry_password":
            self.draw_raspberry_password()
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
        elif self.state == "games":
            self.draw_games()
        elif self.state == "game":
            return
        elif self.state == "wifi":
            self.draw_wifi()
        elif self.state == "wifi_password":
            self.draw_wifi_password()
            self.draw_top_back_button()
        elif self.state == "web_pin":
            self.draw_web_pin()
        elif self.state == "poweroff":
            self.draw_poweroff()

        pygame.display.flip()

    def run(self):
        while self.running:
            self.update_video_state()
            self.update_game_state()
            self.poll_external_settings()
            self.update_clock_alarms()
            self.poll_native_touch()
            if self.display_suspended:
                time.sleep(0.05)
                continue
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False
                elif event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                    self.running = False
                elif self.touch_device is None and event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    self.last_mouse_event_ticks = pygame.time.get_ticks()
                    self.handle_touch_down(event.pos)
                    self.draw()
                elif self.touch_device is None and event.type == pygame.MOUSEBUTTONUP and event.button == 1:
                    self.last_mouse_event_ticks = pygame.time.get_ticks()
                    self.handle_touch_up(event.pos)
                elif self.touch_device is None and event.type == pygame.FINGERDOWN:
                    if self.should_ignore_finger_event():
                        continue
                    self.handle_touch_down(self.finger_event_pos(event))
                    self.draw()
                elif self.touch_device is None and event.type == pygame.FINGERUP:
                    if self.should_ignore_finger_event():
                        continue
                    self.handle_touch_up(self.finger_event_pos(event))

            self.draw()
            self.clock.tick(30)

        pygame.quit()


if __name__ == "__main__":
    try:
        play_intro()
        DeviceAppMenu().run()
    except KeyboardInterrupt:
        pygame.quit()
        sys.exit(0)
    except pygame.error as exc:
        print(f"pygame failed to initialize the display: {exc}", file=sys.stderr)
        pygame.quit()
        sys.exit(1)
