import os
import socket
import subprocess
import sys

os.environ.setdefault("SDL_VIDEODRIVER", "fbcon")
os.environ.setdefault("SDL_FBDEV", "/dev/fb0")
os.environ.setdefault("SDL_MOUSE_TOUCH_EVENTS", "1")

import pygame

HAS_FINGERDOWN = hasattr(pygame, "FINGERDOWN")
HAS_FINGERUP = hasattr(pygame, "FINGERUP")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MENU_DIR = os.path.join(BASE_DIR, "menu")
MAIN_SCREEN_PATH = os.path.join(MENU_DIR, "Main_Menu.png")
MORE_OPTIONS_PATH = os.path.join(MENU_DIR, "Screen_MoreOptions.png")
INTRO_VIDEO_PATH = os.path.join(MENU_DIR, "video_intro.mp4")
QR_PNG = "/tmp/simpsonstv_qr.png"
PORT = 5050
BACKGROUND = (245, 245, 245)
TEXT = (10, 10, 10)
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


def ensure_screen_on():
    subprocess.run(["raspi-gpio", "set", "19", "op", "a5"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    subprocess.run(["raspi-gpio", "set", "18", "op", "dh"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


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
    url = f"http://{get_local_ip()}:{PORT}"
    subprocess.run(
        ["qrencode", "-o", QR_PNG, "-s", "12", "-m", "2", url],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return url


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
        self.running = True
        self.state = "main"
        self.pressed_button = None
        self.qr_url = None
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
        }
        self.qr_asset = None

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

    def refresh_qr_asset(self):
        self.qr_url = generate_qr()
        qr = load_image(QR_PNG)
        if qr is None:
            self.qr_asset = None
            return

        qr_size = min(self.width, self.height) // 2
        qr_surface = pygame.Surface((self.width, self.height))
        qr_surface.fill(BACKGROUND)
        qr_scaled = fit_image(qr, (qr_size, qr_size))
        blit_centered(qr_surface, qr_scaled, self.width, self.height - 100)

        title = self.title_font.render("Escanea el QR", True, TEXT)
        subtitle = self.font.render(self.qr_url, True, TEXT)
        hint = self.font.render("Toca abajo a la derecha para volver", True, TEXT)

        qr_surface.blit(title, title.get_rect(center=(self.width // 2, 50)))
        qr_surface.blit(subtitle, subtitle.get_rect(center=(self.width // 2, self.height - 120)))
        qr_surface.blit(hint, hint.get_rect(center=(self.width // 2, self.height - 60)))
        self.qr_asset = qr_surface.convert()

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

    def button_at_pos(self, pos):
        x, y = pos
        for button_id, rect in self.get_button_rects().items():
            if rect.collidepoint(x, y):
                return button_id
        return None

    def handle_button_action(self, button_id):
        if self.state == "main":
            if button_id == "1x2":
                self.refresh_qr_asset()
                self.state = "qr"
            elif button_id == "2x2":
                self.state = "more"
        elif self.state == "more":
            if button_id == "2x2":
                self.state = "main"
        elif self.state == "qr":
            if button_id == "2x2":
                self.state = "main"

    def handle_touch_down(self, pos):
        self.pressed_button = self.button_at_pos(pos)

    def handle_touch_up(self, pos):
        released_button = self.button_at_pos(pos)
        active_button = self.pressed_button
        self.pressed_button = None
        if active_button and active_button == released_button:
            self.handle_button_action(active_button)

    def draw_missing(self, message):
        self.screen.fill((20, 20, 20))
        title = self.title_font.render("Falta un recurso", True, (255, 255, 255))
        subtitle = self.font.render(message, True, (220, 220, 220))
        self.screen.blit(title, title.get_rect(center=(self.width // 2, self.height // 2 - 30)))
        self.screen.blit(subtitle, subtitle.get_rect(center=(self.width // 2, self.height // 2 + 20)))

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

        pygame.display.flip()

    def run(self):
        play_intro()

        while self.running:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False
                elif event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                    self.running = False
                elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    self.handle_touch_down(event.pos)
                elif event.type == pygame.MOUSEBUTTONUP and event.button == 1:
                    self.handle_touch_up(event.pos)
                elif HAS_FINGERDOWN and event.type == pygame.FINGERDOWN:
                    self.handle_touch_down((int(event.x * self.width), int(event.y * self.height)))
                elif HAS_FINGERUP and event.type == pygame.FINGERUP:
                    self.handle_touch_up((int(event.x * self.width), int(event.y * self.height)))

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
