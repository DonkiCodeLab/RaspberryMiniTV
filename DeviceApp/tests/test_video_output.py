"""Video output must not depend on mpv's reversed display enumeration."""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from menu_app import DeviceAppMenu, is_video_file


class VideoOutputTests(unittest.TestCase):
    def test_menu_discovers_legacy_videos_and_passes_them_to_player(self):
        for filename in ("/movie.AVI", "/movie.mpg", "/movie.webm", "/movie.wmv"):
            with self.subTest(filename=filename):
                self.assertTrue(is_video_file(filename))
                with patch("menu_app.remove_path_if_exists"), patch("menu_app.get_alsa_device", return_value="default"):
                    command = DeviceAppMenu.__new__(DeviceAppMenu).build_mpv_command(filename)
                self.assertEqual(command[-1], filename)
        self.assertFalse(is_video_file("/movie.avi.exe"))

    def command(self, output, env):
        with patch.dict(os.environ, env, clear=True), patch("menu_app.remove_path_if_exists"), patch("menu_app.get_alsa_device", return_value="default"):
            return DeviceAppMenu.__new__(DeviceAppMenu).build_mpv_command("/video.mp4", 12.5, output)

    def test_wayland_uses_connectors_for_both_outputs(self):
        for output, connector in (("minitv", "HDMI-A-1"), ("external", "HDMI-A-2")):
            with self.subTest(output=output):
                command = self.command(output, {"WAYLAND_DISPLAY": "test"})
                self.assertIn(f"--screen-name={connector}", command)
                self.assertIn(f"--fs-screen-name={connector}", command)
                self.assertFalse(any(arg.startswith(("--screen=", "--fs-screen=")) for arg in command))
                self.assertIn("--start=12.500", command)
                self.assertEqual(command[-1], "/video.mp4")

    def test_custom_connector_and_empty_setting_fallback(self):
        self.assertIn("--fs-screen-name=DSI-1", self.command("minitv", {"WAYLAND_DISPLAY": "test", "MINITV_DRM_CONNECTOR": "DSI-1"}))
        self.assertIn("--fs-screen-name=HDMI-A-2", self.command("external", {"WAYLAND_DISPLAY": "test", "MINITV_EXTERNAL_DRM_CONNECTOR": " "}))

    def test_direct_drm_external_output_is_preserved(self):
        command = self.command("external", {})
        self.assertIn("--gpu-context=drm", command)
        self.assertIn("--drm-connector=HDMI-A-2", command)


if __name__ == "__main__":
    unittest.main()
