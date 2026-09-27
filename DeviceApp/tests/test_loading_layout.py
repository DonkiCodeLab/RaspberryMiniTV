"""Headless regression checks for loading artwork at different display shapes."""
import os
import sys
import unittest
from pathlib import Path

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pygame
from menu_app import DeviceAppMenu, LOADING_VIDEO_PATH, LOADING_VIDEO_SPINNER_PATH


class LoadingLayoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        pygame.font.init()

    def render(self, size, rotation=0, artwork=True):
        menu = DeviceAppMenu.__new__(DeviceAppMenu)
        menu.screen = pygame.Surface(size)
        menu.loading_asset = pygame.image.load(LOADING_VIDEO_PATH) if artwork else None
        menu.loading_spinner_asset = pygame.image.load(LOADING_VIDEO_SPINNER_PATH) if artwork else None
        menu.loading_rotation = rotation
        menu.title_font = pygame.font.Font(None, 36)
        menu.tr = lambda key: "Cargando..."
        menu.draw_loading_video()
        return menu.screen

    def test_wide_display_keeps_original_composition_and_black_side_margins(self):
        reference = self.render((640, 480))
        wide = self.render((800, 480))
        self.assertEqual(pygame.image.tostring(reference, "RGB"),
                         pygame.image.tostring(wide.subsurface((80, 0, 640, 480)), "RGB"))
        for x in (0, 79, 720, 799):
            self.assertTrue(all(wide.get_at((x, y))[:3] == (0, 0, 0) for y in range(480)))

    def test_other_resolutions_use_same_scale_on_both_axes(self):
        reference = self.render((640, 480))
        for size in ((1024, 600), (1280, 720), (480, 800), (320, 240)):
            with self.subTest(size=size):
                scale = min(size[0] / 640, size[1] / 480)
                expected = pygame.transform.smoothscale(reference, (int(640 * scale), int(480 * scale)))
                actual = self.render(size)
                region = actual.subsurface(expected.get_rect(center=actual.get_rect().center))
                self.assertEqual(pygame.image.tostring(expected, "RGB"), pygame.image.tostring(region, "RGB"))

    def test_spinner_still_animates_and_missing_artwork_is_supported(self):
        self.assertNotEqual(pygame.image.tostring(self.render((800, 480)), "RGB"),
                            pygame.image.tostring(self.render((800, 480), rotation=90), "RGB"))
        self.assertEqual(self.render((800, 480), artwork=False).get_at((400, 240))[:3], (0, 0, 0))


if __name__ == "__main__":
    unittest.main()
