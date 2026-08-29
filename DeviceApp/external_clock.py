#!/usr/bin/env python3

import datetime
import os
import time

import pygame


BACKGROUND = (18, 22, 28)
WHITE = (255, 255, 255)
YELLOW = (255, 212, 41)


def main():
    pygame.display.init()
    pygame.font.init()
    if pygame.display.get_num_displays() < 2:
        raise RuntimeError("External display is not available")

    screen = pygame.display.set_mode((0, 0), pygame.FULLSCREEN, display=1)
    width, height = screen.get_size()
    clock_font = pygame.font.SysFont("Montserrat", max(120, height // 4), bold=True)
    date_font = pygame.font.SysFont("Montserrat", max(34, height // 24), bold=True)
    hint_font = pygame.font.SysFont("Montserrat", max(26, height // 34), bold=True)
    ticker = pygame.time.Clock()

    while True:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                return

        now = datetime.datetime.now()
        screen.fill(BACKGROUND)
        date = date_font.render(now.strftime("%A, %d de %B de %Y"), True, WHITE)
        clock = clock_font.render(now.strftime("%H:%M"), True, WHITE)
        hint = hint_font.render("MiniTV · Monitor externo", True, YELLOW)
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
