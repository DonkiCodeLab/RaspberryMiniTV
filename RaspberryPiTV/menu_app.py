import math
import os
import socket
import subprocess
import sys
import time

os.environ.setdefault("SDL_VIDEODRIVER", "fbcon")
os.environ.setdefault("SDL_FBDEV", "/dev/fb0")
os.environ.setdefault("SDL_MOUSE_TOUCH_EVENTS", "1")

import pygame

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MENU_DIR = os.path.join(BASE_DIR, "menu")
MAIN_SCREEN_PATH = os.path.join(MENU_DIR, "Screen_Main.png")
MORE_OPTIONS_PATH = os.path.join(MENU_DIR, "Screen_MoreOptions.png")
INTRO_VIDEO_PATH = os.path.join(MENU_DIR, "video_intro.mp4")
QR_PNG = "/tmp/simpsonstv_qr.png"
PORT = 5050
BACKGROUND = (245, 245, 245)
ACCENT = (247, 207, 63)
TEXT = (10, 10, 10)


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
        self.qr_url = None
        self.started_at = time.time()
        self.assets = {
            "main": self.prepare_asset(MAIN_SCREEN_PATH),
            "more": self.prepare_asset(MORE_OPTIONS_PATH),
        }
        self.qr_asset = None

    def prepare_asset(self, path):
        image = load_image(path)
        if image is None:
            return None
        return fit_image(image, (self.width, self.height))

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

    def point_to_cell(self, pos):
        x, y = pos
        col = 0 if x < self.width / 2 else 1
        row = 0 if y < self.height / 2 else 1
        return row, col

    def handle_touch(self, pos):
        row, col = self.point_to_cell(pos)

        if self.state == "main":
            if row == 0 and col == 1:
                self.refresh_qr_asset()
                self.state = "qr"
            elif row == 1 and col == 1:
                self.state = "more"
        elif self.state in {"more", "qr"}:
            if row == 1 and col == 1:
                self.state = "main"

    def draw_missing(self, message):
        self.screen.fill((20, 20, 20))
        title = self.title_font.render("Falta un recurso", True, (255, 255, 255))
        subtitle = self.font.render(message, True, (220, 220, 220))
        self.screen.blit(title, title.get_rect(center=(self.width // 2, self.height // 2 - 30)))
        self.screen.blit(subtitle, subtitle.get_rect(center=(self.width // 2, self.height // 2 + 20)))

    def draw_overlay(self):
        # Pequeña animacion para dar vida al menu sin tocar los PNG base.
        elapsed = time.time() - self.started_at
        pulse = 0.5 + 0.5 * math.sin(elapsed * 2.2)
        radius = int(10 + pulse * 8)
        y = self.height - 28
        positions = (self.width // 2 - 26, self.width // 2, self.width // 2 + 26)
        for index, x in enumerate(positions):
            alpha = int(120 + 100 * math.sin(elapsed * 3 + index))
            color = (*ACCENT, max(40, min(220, alpha)))
            circle = pygame.Surface((radius * 2 + 4, radius * 2 + 4), pygame.SRCALPHA)
            pygame.draw.circle(circle, color, (radius + 2, radius + 2), radius)
            self.screen.blit(circle, circle.get_rect(center=(x, y)))

    def draw(self):
        if self.state == "main":
            asset = self.assets["main"]
            if asset is None:
                self.draw_missing("menu/Screen_Main.png")
            else:
                self.screen.blit(asset, (0, 0))
                self.draw_overlay()
        elif self.state == "more":
            asset = self.assets["more"]
            if asset is None:
                self.draw_missing("menu/Screen_MoreOptions.png")
            else:
                self.screen.blit(asset, (0, 0))
                self.draw_overlay()
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
                elif event.type == pygame.MOUSEBUTTONUP and event.button == 1:
                    self.handle_touch(event.pos)
                elif event.type == pygame.FINGERUP:
                    self.handle_touch((int(event.x * self.width), int(event.y * self.height)))

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
