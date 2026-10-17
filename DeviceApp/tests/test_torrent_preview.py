import sys
from concurrent.futures import Future
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import torrent_preview as preview
from torrent_downloads import TorrentError

HASH = "a" * 40


class PreviewTests(unittest.TestCase):
    def tearDown(self):
        preview._CACHE.clear()

    def files(self):
        names = ["Show/Show.S01E02-E03.mkv", "Show/readme.txt", "padding"]
        return SimpleNamespace(num_files=lambda: 3, pad_file_at=lambda i: i == 2,
                               file_path=lambda i: names[i], file_size=lambda i: 100)

    def test_file_inventory_detects_combined_episodes_and_excludes_padding(self):
        files = preview.describe_files(self.files())
        self.assertEqual(len(files), 2)
        self.assertEqual(files[0]["episodes"], [{"season": 1, "episode": 2}, {"season": 1, "episode": 3}])
        self.assertFalse(files[1]["video"])
        self.assertEqual(files[1]["episodes"], [])

    def engine(self):
        params = SimpleNamespace(flags=6)
        handle = Mock()
        handle.has_metadata.return_value = True
        handle.torrent_file.return_value = SimpleNamespace(files=self.files, name=lambda: "Show")
        session = Mock()
        session.add_torrent.return_value = handle
        lt = SimpleNamespace(session=Mock(return_value=session), parse_magnet_uri=Mock(return_value=params),
                             torrent_flags=SimpleNamespace(upload_mode=1, auto_managed=2, paused=4))
        return lt, params, session, handle

    def test_metadata_only_flags_and_cleanup(self):
        lt, params, session, handle = self.engine()
        with patch.dict(sys.modules, libtorrent=lt):
            result = preview.read_metadata(HASH)
        self.assertEqual(params.flags, 1)  # upload-only, never auto-managed or initially paused
        self.assertEqual(result["sizeBytes"], 200)
        self.assertEqual(result["status"], "ready")
        session.remove_torrent.assert_called_once_with(handle)
        session.pause.assert_called_once()
        self.assertFalse(Path(params.save_path).exists())

    def test_timeout_also_cleans_up(self):
        lt, params, session, handle = self.engine()
        with patch.dict(sys.modules, libtorrent=lt), self.assertRaises(TorrentError):
            preview.read_metadata(HASH, timeout=0)
        session.remove_torrent.assert_called_once_with(handle)
        self.assertFalse(Path(params.save_path).exists())

    def test_validation_pending_cache_and_retry(self):
        with self.assertRaises(ValueError):
            preview.preview("not-a-hash")
        future = Future()
        with patch.object(preview._POOL, 'submit', return_value=future) as submit:
            self.assertEqual(preview.preview(HASH), {"status": "loading"})
            self.assertEqual(preview.preview(HASH.upper()), {"status": "loading"})
            submit.assert_called_once()
            future.set_result({"status": "ready", "files": []})
            self.assertEqual(preview.preview(HASH)["status"], "ready")
            submit.assert_called_once()
        failed = Future()
        failed.set_exception(TorrentError("No peers"))
        preview._CACHE[HASH] = (0, failed)
        with patch('torrent_preview.time.monotonic', return_value=1), self.assertRaises(TorrentError):
            preview.preview(HASH)
        self.assertNotIn(HASH, preview._CACHE)

    def test_concurrency_is_bounded(self):
        with patch.object(preview._POOL, 'submit', side_effect=lambda *args: Future()):
            preview.preview("a" * 40)
            preview.preview("b" * 40)
            with self.assertRaises(TorrentError):
                preview.preview("c" * 40)


class PreviewApiTests(unittest.TestCase):
    def test_requires_pin_and_handles_pending_ready_and_errors(self):
        import control_api as api
        client = api.app.test_client()
        url = "/torrents/preview?infoHash=" + HASH
        with patch.object(api, "is_authorized_request", return_value=False), patch.object(api, "preview_torrent") as inspect:
            self.assertEqual(client.get(url).status_code, 401)
            inspect.assert_not_called()
        with patch.object(api, "is_authorized_request", return_value=True):
            self.assertEqual(client.get("/torrents/preview?infoHash=invalid").status_code, 400)
            for payload in ({"status": "loading"}, {"status": "ready", "files": []}):
                with patch.object(api, "preview_torrent", return_value=payload):
                    self.assertEqual(client.get(url).json, payload)
            with patch.object(api, "preview_torrent", side_effect=TorrentError("No peers")):
                self.assertEqual(client.get(url).status_code, 503)


if __name__ == '__main__':
    unittest.main()
