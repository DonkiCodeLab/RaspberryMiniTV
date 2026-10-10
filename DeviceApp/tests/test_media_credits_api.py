import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api
from tmdb_cache import TmdbCache


class MediaCreditsApiTests(unittest.TestCase):
    def setUp(self):
        root = tempfile.TemporaryDirectory()
        self.addCleanup(root.cleanup)
        self.cache = TmdbCache(root.name, lambda: {"apiKey": "test"})
        self.library = {"movies": {
            "Movies/a.mp4": {"name": "Film", "tmdbId": 1},
            "Movies/copy.mp4": {"name": "Film copy", "tmdbId": "1"},
            "Movies/unknown.mp4": {"name": "Unknown"},
        }, "series": {"TVShows/show": {"name": "Show", "tmdbId": 2}}}
        for name, value in (("tmdb_artwork", self.cache), ("load_media_library", lambda: self.library),
                            ("current_web_pin", lambda: "test-pin"),
                            ("tmdb_credentials", lambda: {"apiKey": "test"})):
            patcher = patch.object(api, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = api.app.test_client()
        self.headers = {"X-Web-Pin": "test-pin"}

    def test_inventory_is_authenticated_read_only_and_deduplicates_titles(self):
        self.assertEqual(self.client.get("/tmdb/credits").status_code, 401)
        self.assertEqual(self.client.post("/tmdb/credits").status_code, 401)
        with patch.object(self.cache, "_download", side_effect=AssertionError("offline")), patch.object(self.cache, "start") as start:
            response = self.client.get("/tmdb/credits", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual(response.json["total"], 2)
        self.assertEqual(response.json["profiles"], 4)
        self.assertEqual(response.json["missingIds"], ["Movies/unknown.mp4"])
        self.assertEqual(response.json["remaining"], 2)
        start.assert_not_called()

    def test_backfill_queues_only_missing_credits_and_reports_real_coverage(self):
        with patch.object(self.cache, "_download", return_value=(json.dumps({"id": 1, "cast": [], "crew": []}).encode(), "application/json")):
            self.cache.warm_credits("movie", 1)
        with patch.object(self.cache, "start"), patch.object(self.cache, "_download", side_effect=AssertionError("request must only enqueue")):
            first = self.client.post("/tmdb/credits", headers=self.headers)
            second = self.client.post("/tmdb/credits", headers=self.headers)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json["ready"], 1)
        self.assertEqual(second.json["pending"], 1)
        self.assertEqual(list(self.cache.jobs), ["tv/2"])
        self.assertTrue(self.cache.jobs["tv/2"]["creditsOnly"])
        self.cache.jobs["tv/2"].update(state="failed", error="TMDB unavailable")
        failed = self.client.get("/tmdb/credits", headers=self.headers).json
        self.assertEqual(failed["ready"], 1)
        self.assertEqual(failed["failed"], 1)
        self.assertEqual(failed["errors"][0]["name"], "Show")

    def test_missing_credentials_do_not_enqueue_and_invalid_ids_are_reported(self):
        self.library["series"]["TVShows/show"]["tmdbId"] = "broken"
        with patch.object(api, "tmdb_credentials", return_value={}), patch.object(self.cache, "start") as start:
            response = self.client.post("/tmdb/credits", headers=self.headers)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.cache.jobs, {})
        start.assert_not_called()
        response = self.client.get("/tmdb/credits", headers=self.headers)
        self.assertEqual(response.json["missingIds"], ["Movies/unknown.mp4", "TVShows/show"])

    def test_saved_credits_with_missing_portraits_are_pending_and_queue_without_network(self):
        credits = {"id": 1, "cast": [{"id": 1, "name": "Actor", "character": "Hero", "profile_path": "/actor.jpg"}], "crew": []}
        with patch.object(self.cache, "_download", return_value=(json.dumps(credits).encode(), "application/json")):
            self.cache.warm_credits("movie", 1)
        with patch.object(self.cache, "start"), patch.object(self.cache, "_download", side_effect=AssertionError("only enqueue")):
            self.assertEqual(self.client.get("/tmdb/credits", headers=self.headers).json["ready"], 0)
            response = self.client.post("/tmdb/credits", headers=self.headers)
            self.assertEqual(response.json["pending"], 2)
            self.assertTrue(self.cache.jobs["movie/1"]["creditsOnly"])
            self.assertEqual(self.client.get("/tmdb/images/actor.jpg?width=185", headers=self.headers).status_code, 409)

    def test_credit_endpoint_uses_local_cache_and_ignores_ui_language(self):
        credits = {"id": 2, "cast": [{"id": 3, "name": "Actor", "roles": [{"character": "Hero"}]}], "crew": []}
        with patch.object(self.cache, "_download", return_value=(json.dumps(credits).encode(), "application/json")):
            self.cache.warm_credits("tv", 2)
        with patch.object(self.cache, "_download", side_effect=AssertionError("offline")):
            response = self.client.get("/tmdb/json/tv/2/aggregate_credits?language=ca-ES", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, credits)

    def test_unidentified_scanned_files_are_reported_without_creating_profiles(self):
        scanned = {"catalog": api.MEDIA_LIBRARY_PATH,
                   "movies": ["Movies/a.mp4", "Movies/new.mp4"], "series": ["TVShows/new"]}
        with patch.object(api, "scanned_media_paths", scanned):
            response = self.client.get("/tmdb/credits", headers=self.headers)
        self.assertEqual(response.json["profiles"], 6)
        self.assertEqual(response.json["total"], 2)
        self.assertEqual(response.json["missingIds"], ["Movies/new.mp4", "Movies/unknown.mp4", "TVShows/new"])
        self.assertNotIn("Movies/new.mp4", self.library["movies"])
        with patch.object(api, "scanned_media_paths", {**scanned, "catalog": "another-catalog"}):
            response = self.client.get("/tmdb/credits", headers=self.headers)
        self.assertEqual(response.json["profiles"], 4)


if __name__ == "__main__":
    unittest.main()
