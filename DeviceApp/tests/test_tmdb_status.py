import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api
from tmdb_cache import TmdbCache


class TmdbStatusTests(unittest.TestCase):
    def setUp(self):
        root = tempfile.TemporaryDirectory()
        self.addCleanup(root.cleanup)
        self.cache = TmdbCache(root.name, lambda: {})
        for name, value in (("tmdb_artwork", self.cache), ("current_web_pin", lambda: "test-pin")):
            patcher = patch.object(api, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = api.app.test_client()
        self.headers = {"X-Web-Pin": "test-pin"}

    def test_slow_checks_respond_immediately_share_work_and_do_not_hold_action_lock(self):
        for endpoint, function, query in (
                ("cache", "tmdb_cache_snapshot", self.cache.cache_status_query),
                ("credits", "tmdb_credits_snapshot", self.cache.credits_status_query)):
            with self.subTest(endpoint=endpoint):
                entered, release = threading.Event(), threading.Event()
                def calculate(*args):
                    entered.set()
                    self.assertTrue(release.wait(3))
                    return {"total": 440, "ready": 440}
                with patch.object(api, function, side_effect=calculate) as calculation, \
                        patch.object(api, "tmdb_credits_inventory", return_value=({}, 0, [])), \
                        api.tmdb_cache_action_lock:
                    try:
                        path = f"/tmdb/{endpoint}?background=1"
                        self.assertEqual(self.client.get(path).status_code, 401)
                        for _ in range(3):
                            response = self.client.get(path + "&refresh=1", headers=self.headers)
                            self.assertEqual(response.status_code, 200)
                            self.assertEqual(response.json, {"calculating": True})
                            self.assertEqual(response.headers["Cache-Control"], "no-store")
                        self.assertTrue(entered.wait(1))
                        calculation.assert_called_once()
                    finally:
                        release.set()
                        query.worker.join(3)
                    response = self.client.get(path, headers=self.headers)
                    self.assertEqual(response.json, {"calculating": False, "total": 440, "ready": 440})
                    calculation.assert_called_once()

    def test_failed_calculation_stops_until_explicit_retry(self):
        path = "/tmdb/credits?background=1"
        query = self.cache.credits_status_query
        with patch.object(api, "tmdb_credits_inventory", side_effect=OSError("disk unavailable")) as calculate:
            with self.assertLogs("background_status", level="ERROR"):
                self.client.get(path + "&refresh=1", headers=self.headers)
                query.worker.join(3)
            for _ in range(3):
                response = self.client.get(path, headers=self.headers)
                self.assertEqual(response.status_code, 500)
                self.assertEqual(response.json["code"], "TMDB_STATUS_ERROR")
                self.assertFalse(response.json["calculating"])
            calculate.assert_called_once()
        with patch.object(api, "tmdb_credits_inventory", return_value=({}, 0, [])):
            retry = self.client.get(path + "&refresh=1", headers=self.headers)
            self.assertEqual(retry.json, {"calculating": True})
            query.worker.join(3)
            result = self.client.get(path, headers=self.headers)
            self.assertEqual(result.status_code, 200)
            self.assertFalse(result.json["calculating"])
            self.assertEqual(result.json["total"], 0)

    def test_slow_storage_scan_is_fresh_when_it_finishes(self):
        with patch("tmdb_cache.time.monotonic", side_effect=[10, 100]):
            self.cache.storage()
        with patch("tmdb_cache.time.monotonic", return_value=101), \
                patch("tmdb_cache.threading.Thread") as worker:
            result = self.cache.storage_background()
            self.assertFalse(result["calculating"])
            worker.assert_not_called()


if __name__ == "__main__":
    unittest.main()
