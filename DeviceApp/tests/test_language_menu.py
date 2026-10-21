import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock

os.environ.setdefault('SDL_VIDEODRIVER', 'dummy')
os.environ.setdefault('SDL_AUDIODRIVER', 'dummy')
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pygame
from languages import LANGUAGES
from menu_app import DeviceAppMenu, classify_wifi_error
from menu_fonts import MenuFont


class LanguageMenuTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        pygame.font.init()

    def menu(self, size=(640, 480)):
        menu = DeviceAppMenu.__new__(DeviceAppMenu)
        menu.width, menu.height = size
        menu.screen = pygame.Surface(size)
        menu.state = 'language'
        menu.config = {'language': 'es'}
        menu.language_dropdown_open = False
        menu.language_scroll = menu.language_active = 0
        menu.language_return_state = 'more'
        menu.pressed_button = None
        menu.wifi_font = MenuFont(26)
        menu.wifi_bold_font = MenuFont(26, bold=True)
        menu.small_font = MenuFont(20)
        menu.main_title_font = MenuFont(32, bold=True)
        menu.menu_button_backgrounds = menu.menu_tile_assets = {}
        menu.translations = json.loads((Path(__file__).resolve().parents[1] / 'translations.json').read_text())
        menu.save_settings = Mock()
        menu.refresh_translated_state_texts = Mock()
        menu.play_ui_click_sound = Mock()
        return menu

    def test_every_language_can_be_reached_and_selected_by_keyboard(self):
        menu = self.menu()
        for index, language in enumerate(LANGUAGES):
            menu.handle_language_key(pygame.K_RETURN)
            menu.handle_language_key(pygame.K_HOME)
            for _ in range(index):
                menu.handle_language_key(pygame.K_DOWN)
            self.assertIn('language:' + language['id'], menu.get_language_button_rects())
            menu.handle_language_key(pygame.K_RETURN)
            self.assertEqual(menu.config['language'], language['id'])
            self.assertFalse(menu.language_dropdown_open)
        menu.handle_language_key(pygame.K_ESCAPE)
        self.assertEqual(menu.state, 'more')

    def test_touch_scroll_reaches_last_language_and_rows_fit_small_displays(self):
        for size in [(320, 240), (640, 480), (800, 480)]:
            menu = self.menu(size)
            menu.handle_button_action('language-toggle')
            for _ in range(len(LANGUAGES)):
                menu.handle_button_action('language-down')
            rects = menu.get_language_button_rects()
            self.assertIn('language:ca', rects)
            self.assertTrue(all(menu.screen.get_rect().contains(rect) for rect in rects.values()))
            menu.draw_language()
            menu.handle_button_action('language:ca')
            self.assertEqual(menu.config['language'], 'ca')
            menu.save_settings.assert_called_once()

    def test_unicode_labels_render_and_wifi_errors_follow_the_menu_language(self):
        font = MenuFont(28)
        for language in LANGUAGES:
            surface = font.render(language['nativeName'], True, 'white')
            self.assertGreater(surface.get_width(), 0)
            self.assertGreater(surface.get_height(), 0)
        self.assertEqual(classify_wifi_error('', 'wrong password', 'es'), 'Contraseña incorrecta o autenticación fallida.')

