import os
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
INTRO_VIDEO_PATH = os.path.join(MENU_DIR, "video_intro.mp4")
TOUCH_DEVICE_PATH = "/dev/input/event0"
QR_PNG = "/tmp/simpsonstv_qr.png"
PORT = 5050
BACKGROUND = (245, 245, 245)
TEXT = (10, 10, 10)
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
GRAY = (120, 120, 120)
DARK_GRAY = (38, 38, 38)
MID_GRAY = (70, 70, 70)
GREEN = (72, 190, 120)
RED = (210, 80, 80)
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
        return False, "Selecciona una red Wi-Fi"

    nmcli_base = ["nmcli", "dev", "wifi", "connect", ssid]
    if password:
        nmcli_base.extend(["password", password])
    nmcli_result = run_command(nmcli_base)
    if nmcli_result.returncode == 0:
        return True, f"Conectado a {ssid}"

    if password:
        add_result = run_command(["wpa_cli", "-i", "wlan0", "add_network"])
        network_id = add_result.stdout.strip()
        if add_result.returncode == 0 and network_id.isdigit():
            run_command(["wpa_cli", "-i", "wlan0", "set_network", network_id, "ssid", f'"{ssid}"'])
            run_command(["wpa_cli", "-i", "wlan0", "set_network", network_id, "psk", f'"{password}"'])
            run_command(["wpa_cli", "-i", "wlan0", "enable_network", network_id])
            save_result = run_command(["wpa_cli", "-i", "wlan0", "save_config"])
            if save_result.returncode == 0:
                return True, f"Intentando conectar a {ssid}"

    stderr = (nmcli_result.stderr or "").strip()
    stdout = (nmcli_result.stdout or "").strip()
    return False, stderr or stdout or f"No se pudo conectar a {ssid}"


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
        self.font = pygame.font.SysFont("Arial", 28)
        self.title_font = pygame.font.SysFont("Arial", 42, bold=True)
        self.poweroff_title_font = pygame.font.SysFont("Arial", 34, bold=True)
        self.clock_font = pygame.font.SysFont("Arial", 140, bold=True)
        self.small_font = pygame.font.SysFont("Arial", 20)
        self.wifi_font = pygame.font.SysFont("Arial", 24)
        self.wifi_bold_font = pygame.font.SysFont("Arial", 24, bold=True)
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
        }
        self.qr_asset = None
        self.wifi_networks = []
        self.wifi_selected_ssid = None
        self.wifi_password = ""
        self.wifi_status = "Escanea y selecciona una red"
        self.wifi_page_start = 0
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

        title = self.title_font.render("Escanea el QR", True, WHITE)
        subtitle = self.font.render(self.qr_url, True, WHITE)
        wifi_line = self.small_font.render(
            f"Wi-Fi: {connected_wifi}" if connected_wifi else "Wi-Fi: no conectado",
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
        self.wifi_status = f"{len(self.wifi_networks)} redes encontradas" if self.wifi_networks else "No se encontraron redes"

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
        return [
            [("1", "1"), ("2", "2"), ("3", "3"), ("4", "4"), ("5", "5"), ("6", "6"), ("7", "7"), ("8", "8"), ("9", "9"), ("0", "0")],
            [("Q", "Q"), ("W", "W"), ("E", "E"), ("R", "R"), ("T", "T"), ("Y", "Y"), ("U", "U"), ("I", "I"), ("O", "O"), ("P", "P")],
            [("A", "A"), ("S", "S"), ("D", "D"), ("F", "F"), ("G", "G"), ("H", "H"), ("J", "J"), ("K", "K"), ("L", "L"), ("<-", "BACKSPACE")],
            [("Z", "Z"), ("X", "X"), ("C", "C"), ("V", "V"), ("B", "B"), ("N", "N"), ("M", "M"), (".", "."), ("SPACE", " "), ("CLR", "CLEAR")],
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
                        self.wifi_status = f"Ya conectado a {self.wifi_selected_ssid}"
                    else:
                        self.wifi_password = ""
                        self.state = "wifi_password"
                return
            if layout["list"].collidepoint(pos):
                row_height = 62
                row_index = int((pos[1] - layout["list"].y) / row_height)
                index = self.wifi_page_start + row_index
                if 0 <= index < len(self.wifi_networks):
                    self.wifi_selected_ssid = self.wifi_networks[index]["ssid"]
                    self.wifi_status = f"Seleccionada: {self.wifi_selected_ssid}"
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
            elif key_value == "CLEAR":
                self.wifi_password = ""
            else:
                self.wifi_password += key_value

    def handle_touch_down(self, pos):
        normalized_pos = self.normalize_touch_pos(pos)
        self.touch_down_pos = normalized_pos
        if self.state == "clock":
            self.pressed_button = "clock-anywhere"
            log_debug(f"DOWN raw={pos} normalized={normalized_pos} state=clock pressed=clock-anywhere")
            return
        if self.state == "poweroff":
            self.pressed_button = self.poweroff_button_at_pos(normalized_pos)
            log_debug(f"DOWN raw={pos} normalized={normalized_pos} state=poweroff pressed={self.pressed_button}")
            return
        if self.state == "wifi":
            self.handle_wifi_touch_down(normalized_pos)
            return
        if self.state == "wifi_password":
            self.handle_wifi_touch_down(normalized_pos)
            return
        if self.state == "qr":
            self.pressed_button = "qr-anywhere"
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
        if self.state == "clock" and self.pressed_button == "clock-anywhere":
            self.pressed_button = None
            log_debug(f"UP raw={pos} normalized={normalized_pos} state=clock down=clock-anywhere up=clock-anywhere")
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
        if self.state == "wifi":
            self.handle_wifi_touch_up(normalized_pos)
            log_debug(f"UP raw={pos} normalized={normalized_pos} state=wifi")
            return
        if self.state == "wifi_password":
            self.handle_wifi_touch_up(normalized_pos)
            log_debug(f"UP raw={pos} normalized={normalized_pos} state=wifi_password")
            return
        if self.state == "qr" and self.pressed_button == "qr-anywhere":
            self.pressed_button = None
            log_debug(
                f"UP raw={pos} normalized={normalized_pos} state=qr down=qr-anywhere up=qr-anywhere"
            )
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
        title = self.title_font.render("Falta un recurso", True, (255, 255, 255))
        subtitle = self.font.render(message, True, (220, 220, 220))
        self.screen.blit(title, title.get_rect(center=(self.width // 2, self.height // 2 - 30)))
        self.screen.blit(subtitle, subtitle.get_rect(center=(self.width // 2, self.height // 2 + 20)))

    def draw_clock(self):
        self.screen.fill(BLACK)
        time_text = datetime.now().strftime("%H : %M")
        text_surface = self.clock_font.render(time_text, True, WHITE)
        hint_surface = self.small_font.render("Toca cualquier sitio para volver", True, GRAY)
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
            ("Actualizar", layout["refresh"], MID_GRAY),
            ("Conectar", layout["connect"], GREEN if self.wifi_selected_ssid else MID_GRAY),
            ("Volver", layout["back"], RED),
            ("Subir", layout["up"], MID_GRAY),
            ("Bajar", layout["down"], MID_GRAY),
        ):
            pygame.draw.rect(self.screen, color, rect)
            label_font = self.wifi_font if key in {"Actualizar", "Conectar", "Volver"} else self.small_font
            label = label_font.render(key, True, WHITE)
            self.screen.blit(label, label.get_rect(center=rect.center))

    def draw_wifi_password(self):
        layout = self.get_wifi_password_layout()
        self.screen.fill(BLACK)

        title = self.title_font.render("Conectar Wi-Fi", True, WHITE)
        self.screen.blit(title, (20, 10))

        selected_text = self.small_font.render(
            f"Introducir pwd de la red: {self.wifi_selected_ssid or 'ninguna'}",
            True,
            WHITE,
        )
        self.screen.blit(selected_text, (layout["selected"].x, layout["selected"].y))

        pygame.draw.rect(self.screen, WHITE, layout["password"], 2)
        password_text = self.wifi_font.render(self.wifi_password or " ", True, WHITE)
        self.screen.blit(password_text, (layout["password"].x + 10, layout["password"].y + 8))

        for key, rect, color in (
            ("Conectar", layout["connect"], GREEN),
            ("Volver", layout["back"], RED),
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
        title_line_1 = "Realmente quiere"
        title_line_2 = "apagar la Raspberry Pi TV?"
        line_1 = self.poweroff_title_font.render(title_line_1, True, WHITE)
        line_2 = self.poweroff_title_font.render(title_line_2, True, WHITE)
        shadow_1 = self.poweroff_title_font.render(title_line_1, True, BLACK)
        shadow_2 = self.poweroff_title_font.render(title_line_2, True, BLACK)
        self.screen.blit(shadow_1, shadow_1.get_rect(center=(self.width // 2 + 1, 28 + 1)))
        self.screen.blit(shadow_2, shadow_2.get_rect(center=(self.width // 2 + 1, 68 + 1)))
        self.screen.blit(line_1, line_1.get_rect(center=(self.width // 2, 28)))
        self.screen.blit(line_2, line_2.get_rect(center=(self.width // 2, 68)))

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
        elif self.state == "clock":
            self.draw_clock()
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
