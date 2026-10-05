import io
import sys
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api
import playback_process


class PlaybackStatusTests(unittest.TestCase):
    def test_menu_player_is_detected_without_mpv_socket(self):
        state = {"playing": "FILM", "directory": "Movies", "file": "Movies/film.mp4", "playerPid": 123, "playerStart": "100"}
        with patch.dict(api.current, {"proc": None}), patch.object(api, "read_playback_state", return_value=state), patch.object(playback_process, "process_identity", return_value="100"), patch.object(api, "send_mpv_command") as ipc, patch.object(api, "clear_playback_state") as clear:
            self.assertEqual(api.current_playback_status()["file"], state["file"])
            self.assertTrue(api.current_playback_status()["running"])
            ipc.assert_not_called()
            clear.assert_not_called()

    def test_mpv_path_recovers_missing_state(self):
        with patch.dict(api.current, {"proc": None}), patch.object(api, "read_playback_state", return_value=None), patch.object(api, "send_mpv_command", return_value={"error": "success", "data": "/videos/Movies/film.mp4"}), patch.object(api, "VIDEOS_DIR", "/videos"):
            status = api.current_playback_status()
            self.assertTrue(status["running"])
            self.assertEqual(status["file"], "Movies/film.mp4")
            self.assertEqual(status["playing"], "FILM")

    def test_stopped_or_reused_pid_cannot_report_old_movie(self):
        with patch.dict(api.current, {"proc": None}), patch.object(api, "read_playback_state", return_value={"playerPid": 123, "playerStart": "old"}), patch.object(playback_process, "process_identity", return_value="new"), patch.object(api, "send_mpv_command", return_value=None), patch.object(api, "clear_playback_state") as clear:
            self.assertFalse(api.current_playback_status()["running"])
            clear.assert_called_once()

    def test_ipc_skips_unsolicited_events(self):
        client = MagicMock()
        client.makefile.return_value = io.BytesIO(b'{"event":"start-file"}\n{"request_id":1,"error":"success","data":"/movie.mp4"}\n')
        with patch.object(api.os.path, "exists", return_value=True), patch.object(api.socket, "socket", return_value=client):
            self.assertEqual(api.send_mpv_command("get_property", "path")["data"], "/movie.mp4")

    def test_process_identity_rejects_zombie_and_missing_process(self):
        fields = ["S"] + ["0"] * 18 + ["1234"]
        with patch.object(Path, "read_text", return_value="7 (player name) " + " ".join(fields)):
            self.assertEqual(playback_process.process_identity(7), "1234")
        fields[0] = "Z"
        with patch.object(Path, "read_text", return_value="7 (player) " + " ".join(fields)):
            self.assertIsNone(playback_process.process_identity(7))
        self.assertIsNone(playback_process.process_identity(None))
