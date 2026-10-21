#!/usr/bin/env python3

import datetime
import json
from pathlib import Path
import os
import time

import pygame
from menu_fonts import MenuFont
from languages import normalize_language
from ui_translations import translate, format_long_date


BACKGROUND = (18, 22, 28)
WHITE = (255, 255, 255)
YELLOW = (255, 212, 41)


SETTINGS_PATH = Path(__file__).with_name('user_settings.json')


def current_language():
    try:
        settings = json.loads(SETTINGS_PATH.read_text(encoding='utf-8'))
        return normalize_language(settings.get('language')) if isinstance(settings, dict) else 'en'
    except (OSError, ValueError):
        return 'en'


def main():
    pygame.display.init()
    pygame.font.init()
    if pygame.display.get_num_displays() < 2:
        raise RuntimeError("External display is not available")

    screen = pygame.display.set_mode((0, 0), pygame.FULLSCREEN, display=1)
    width, height = screen.get_size()
    clock_font = MenuFont(max(120, height // 4), bold=True)
    date_font = MenuFont(max(34, height // 24), bold=True)
    hint_font = MenuFont(max(26, height // 34), bold=True)
    ticker = pygame.time.Clock()

    while True:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                return

        now = datetime.datetime.now()
        screen.fill(BACKGROUND)
        language = current_language()
        date = date_font.render(format_long_date(now, language), True, WHITE)
        clock = clock_font.render(now.strftime("%H:%M"), True, WHITE)
        hint = hint_font.render("MiniTV · " + translate("external.title", language), True, YELLOW)
        screen.blit(date, date.get_rect(center=(width // 2, height // 7)))
        screen.blit(clock, clock.get_rect(center=(width // 2, height // 2)))
        screen.blit(hint, hint.get_rect(center=(width // 2, height - height // 8)))
        pygame.display.flip()
        ticker.tick(2)


if __name__ == "__main__":
    while True:
        try:
            main()
        except (pygame.error, RuntimeError):
            pygame.quit()
            time.sleep(3)
