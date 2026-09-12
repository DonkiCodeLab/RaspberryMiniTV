import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from background_stats import BackgroundStats
import control_api as api


class BackgroundStatsTests(unittest.TestCase):
    def test_health_returns_without_waiting_for_disk_scan_and_shares_one_scan(self):
        with tempfile.TemporaryDirectory() as root:
            entered, release, finished = threading.Event(), threading.Event(), threading.Event()
            calls = []
            def calculate():
                calls.append(1)
                entered.set()
                release.wait(3)
                return {'storage': {'usedGb': 7}, 'libraryCounts': {'movies': {'count': 123}}}
            cache = BackgroundStats(Path(root) / 'stats.json', calculate)
            original = cache._refresh
            def refresh():
                try: original()
                finally: finished.set()
            cache._refresh = refresh
            try:
                with patch.object(api, 'library_stats', cache), patch.object(api, 'is_authorized_request', return_value=True), patch.object(api, 'current_playback_status', return_value={'playing': None, 'directory': '', 'file': '', 'running': False}), patch.object(api, '_calculate_storage_stats', return_value={'usedGb': 0}):
                    for _ in range(10):
                        response = api.app.test_client().get('/health')
                        self.assertEqual(response.status_code, 200)
                        self.assertTrue(response.json['storage']['calculating'])
                    self.assertTrue(entered.wait(1))
                    self.assertFalse(finished.is_set(), 'health must respond while calculation is still blocked')
                    self.assertEqual(len(calls), 1)
            finally:
                release.set()
                self.assertTrue(finished.wait(3))
            self.assertEqual(cache.read()['storage']['usedGb'], 7)
            self.assertEqual(len(calls), 1)

    def test_restarts_serve_persisted_statistics_while_refreshing(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'stats.json'
            path.write_text(json.dumps({'storage': {'usedGb': 7}, 'libraryCounts': {}}))
            cache = BackgroundStats(path, lambda: {})
            with patch('background_stats.threading.Thread') as worker:
                self.assertEqual(cache.read()['storage']['usedGb'], 7)
                cache.read()
                worker.assert_called_once()
