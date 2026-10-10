import concurrent.futures
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api
import omdb_ratings as omdb
from omdb_backfill import OmdbBackfill, library_targets


def response(imdb_id="tt0000001", kind="movie", rating="8.0"):
    return {"Response": "True", "imdbID": imdb_id, "Type": kind,
            "imdbRating": rating, "imdbVotes": "1,000", "Metascore": "N/A"}


class BackfillFixture(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.settings = omdb.OmdbSettings(self.root / "private.json")
        self.settings.update({"apiKey": "test-secret"})
        self.tmdb = Mock()
        self.tmdb.json.side_effect = RuntimeError("Not in local cache")
        self.ratings = omdb.OmdbRatings(self.root / "cache", self.settings.credentials, self.tmdb, lambda: {})
        self.library = {"movies": {
            "Movies/A.mkv": {"name": "A", "tmdbId": 1, "imdbUrl": "https://www.imdb.com/title/tt0000001/"},
            "Movies/B.mkv": {"name": "B", "tmdbId": 2, "imdbUrl": "https://www.imdb.com/title/tt0000002/"},
        }, "series": {"TVShows/C": {"name": "C", "tmdbId": 3, "imdbUrl": "https://www.imdb.com/title/tt0000003/"}}}
        self.backfill = self.make_backfill()
        self.addCleanup(self.stop_worker)

    def make_backfill(self):
        return OmdbBackfill(self.root / "cache" / "backfill.json", self.ratings, lambda: self.library, interval=0)

    def stop_worker(self):
        self.backfill.pause()
        if self.backfill.worker:
            self.backfill.worker.join(timeout=3)

    def finish(self, manager=None):
        manager = manager or self.backfill
        self.assertIsNotNone(manager.worker)
        manager.worker.join(timeout=3)
        self.assertFalse(manager.worker.is_alive(), "Worker did not finish")
        status = manager.status()
        job = status["job"]
        self.assertEqual(job["processed"], job["ready"] + job["unavailable"] + job["failed"])
        return status

    def download(self, url, **kwargs):
        from urllib.parse import parse_qs, urlsplit
        query = parse_qs(urlsplit(url).query)
        imdb_id = query["i"][0]
        return response(imdb_id, query.get("type", ["movie"])[0], "N/A" if imdb_id == "tt0000002" else "8.0")


class BackfillTests(BackfillFixture):
    def test_inventory_deduplicates_tmdb_imdb_and_bridge_aliases(self):
        self.library["movies"].update({
            "Movies/A-copy.mkv": {"name": "A copy", "tmdbId": 1},
            "Movies/A-imdb.mkv": {"name": "A IMDb", "imdbUrl": "https://imdb.com/title/tt0000001/"},
            "Movies/A-bridge.mkv": {"name": "A bridge", "tmdbId": 8, "imdbId": "tt0000001"},
            "Movies/unsafe.mkv": {"name": "Unsafe", "imdbUrl": "https://imdb.com.untrusted.test/title/tt0000001/"},
            "Movies/missing.mkv": {"name": "Missing", "tmdbId": -1},
        })
        items, missing = library_targets(self.library)
        self.assertEqual(len(items), 3)
        self.assertEqual({item["title"] for item in missing}, {"Unsafe", "Missing"})
        self.assertTrue(all(set(item) == {"kind", "title", "path"} for item in missing))

    def test_status_is_read_only_and_never_calls_provider_or_creates_job(self):
        with patch.object(omdb, "_download_json") as download, patch.object(self.ratings, "get") as get:
            status = self.backfill.status()
            self.assertTrue(status["configured"])
            self.assertEqual((status["total"], status["ready"]), (3, 0))
            self.assertEqual(status["job"]["state"], "idle")
            self.assertIsNone(self.backfill.worker)
            self.assertFalse(self.backfill.path.exists())
            download.assert_not_called()
            get.assert_not_called()

    def test_all_profiles_processed_and_new_run_reuses_scores_and_negative_cache(self):
        with patch.object(omdb, "_download_json", side_effect=self.download) as download:
            self.backfill.start()
            status = self.finish()
            self.assertEqual(status["ready"], 3)
            self.assertEqual({key: status["job"][key] for key in ("state", "total", "processed", "ready", "unavailable", "failed")},
                             {"state": "completed", "total": 3, "processed": 3, "ready": 2, "unavailable": 1, "failed": 0})
            self.assertEqual(download.call_count, 3)
            self.backfill.start()
            self.assertEqual(self.finish()["job"]["processed"], 3)
            self.assertEqual(download.call_count, 3)
        saved = json.loads(self.backfill.path.read_text())
        self.assertEqual(len(saved["outcomes"]), 3)
        self.assertNotIn("test-secret", self.backfill.path.read_text())

    def test_concurrent_start_creates_only_one_worker(self):
        entered, release = threading.Event(), threading.Event()
        self.addCleanup(release.set)

        def gated(url, **kwargs):
            entered.set()
            self.assertTrue(release.wait(2))
            return self.download(url, **kwargs)

        with patch.object(omdb, "_download_json", side_effect=gated) as download:
            self.backfill.start()
            self.assertTrue(entered.wait(2))
            original = self.backfill.worker
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
                list(pool.map(lambda _: self.backfill.start(), range(5)))
            self.assertIs(self.backfill.worker, original)
            release.set()
            self.assertEqual(self.finish()["job"]["state"], "completed")
            self.assertEqual(download.call_count, 3)

    def test_pause_finishes_inflight_item_and_restart_requires_explicit_resume(self):
        entered, release = threading.Event(), threading.Event()
        self.addCleanup(release.set)

        def gated(url, **kwargs):
            entered.set()
            self.assertTrue(release.wait(2))
            return self.download(url, **kwargs)

        with patch.object(omdb, "_download_json", side_effect=gated) as download:
            self.backfill.start()
            self.assertTrue(entered.wait(2))
            self.backfill.pause()
            self.assertEqual(self.backfill.status()["job"]["state"], "pausing")
            release.set()
            paused = self.finish()
            self.assertEqual((paused["job"]["state"], paused["job"]["processed"]), ("paused", 1))
            self.backfill = self.make_backfill()
            self.assertIsNone(self.backfill.worker)
            self.assertEqual(self.backfill.status()["job"]["processed"], 1)
            self.assertEqual(download.call_count, 1)
            self.backfill.start()
            self.assertEqual(self.finish()["job"]["state"], "completed")
            self.assertEqual(download.call_count, 3)

    def test_interrupted_running_job_restores_paused_without_starting_network(self):
        items, _ = library_targets(self.library)
        persisted = {"version": 1, "items": items, "outcomes": [{"state": "ready"}],
                     "job": {**self.backfill.status()["job"], "state": "running", "startedAt": time.time(), "currentTitle": "B"}}
        omdb._write(self.backfill.path, persisted)
        with patch.object(omdb, "_download_json") as download:
            restarted = self.make_backfill()
            status = restarted.status()
            self.assertEqual((status["job"]["state"], status["job"]["processed"]), ("paused", 1))
            self.assertEqual(status["job"]["currentTitle"], "")
            self.assertIsNone(restarted.worker)
            self.assertEqual(json.loads(self.backfill.path.read_text()), persisted)
            download.assert_not_called()

    def test_quota_pause_preserves_cursor_and_persistent_cooldown_on_resume(self):
        with patch.object(omdb, "_download_json", side_effect=[response(), omdb.OmdbError("OMDB_LIMIT")]) as download:
            self.backfill.start()
            paused = self.finish()["job"]
            self.assertEqual((paused["state"], paused["processed"], paused["code"]), ("paused", 1, "OMDB_LIMIT"))
            cached_path = self.ratings.root / "ratings" / "tt0000001.json"
            cached = json.loads(cached_path.read_text())
            cached.update(rating=None, votes=None)
            omdb._write(cached_path, cached)
            self.backfill.start()
            resumed = self.finish()["job"]
            self.assertEqual((resumed["processed"], resumed["ready"], resumed["unavailable"]), (1, 0, 1))
            self.assertEqual(download.call_count, 2)
        later = time.time() + 3601
        with patch.object(omdb.time, "time", return_value=later), patch.object(omdb, "_download_json", side_effect=self.download) as download:
            self.backfill.start()
            self.assertEqual(self.finish()["job"]["processed"], 3)
            self.assertEqual(download.call_count, 2)

    def test_stale_imdb_migration_fallback_pauses_instead_of_marking_processed(self):
        legacy = {"imdbId": "tt0000001", "rating": 8.0, "votes": 1000, "type": "movie", "updatedAt": time.time()}
        omdb._write(self.ratings.root / "ratings" / "tt0000001.json", legacy)
        with patch.object(omdb, "_download_json", side_effect=omdb.OmdbError("OMDB_CONNECTION_ERROR")) as download:
            self.backfill.start()
            status = self.finish()
            self.assertEqual(status["ready"], 0)
            self.assertEqual((status["job"]["state"], status["job"]["processed"], status["job"]["code"]),
                             ("paused", 0, "OMDB_CONNECTION_ERROR"))
            download.assert_called_once()
        later = time.time() + 61
        with patch.object(omdb.time, "time", return_value=later), patch.object(omdb, "_download_json", side_effect=self.download) as download:
            self.backfill.start()
            self.assertEqual(self.finish()["ready"], 3)
            self.assertEqual(download.call_count, 3)

    def test_missing_provider_identity_is_failed_but_later_titles_continue(self):
        original = self.ratings.get

        def sometimes_missing(**kwargs):
            if kwargs["imdb_id"] == "tt0000002":
                raise omdb.OmdbError("OMDB_ID_MISSING")
            return original(**kwargs)

        with patch.object(self.ratings, "get", side_effect=sometimes_missing), patch.object(omdb, "_download_json", side_effect=self.download):
            self.backfill.start()
            status = self.finish()["job"]
            self.assertEqual((status["state"], status["processed"], status["ready"], status["failed"]), ("completed", 3, 2, 1))

    def test_auth_and_tmdb_configuration_errors_pause_without_completing_title(self):
        for code in ("OMDB_AUTH_ERROR", "OMDB_TMDB_NOT_CONFIGURED", "OMDB_TMDB_ERROR"):
            with self.subTest(code=code), patch.object(self.ratings, "get", side_effect=omdb.OmdbError(code)):
                self.backfill.start()
                job = self.finish()["job"]
                self.assertEqual((job["state"], job["processed"], job["code"]), ("paused", 0, code))

    def test_start_without_key_does_not_create_job(self):
        self.settings.update({"clearApiKey": True})
        with self.assertRaises(omdb.OmdbError) as raised:
            self.backfill.start()
        self.assertEqual(raised.exception.code, "OMDB_NOT_CONFIGURED")
        self.assertFalse(self.backfill.path.exists())
        self.assertIsNone(self.backfill.worker)

    def test_resume_reconciles_corrected_deleted_and_new_profiles(self):
        original = self.ratings.get

        def blocked_title(**kwargs):
            if kwargs["imdb_id"] == "tt0000002":
                raise omdb.OmdbError("OMDB_TMDB_ERROR")
            return original(**kwargs)

        with patch.object(self.ratings, "get", side_effect=blocked_title), patch.object(omdb, "_download_json", side_effect=self.download) as download:
            self.backfill.start()
            self.assertEqual(self.finish()["job"]["processed"], 1)
            self.library["movies"]["Movies/B.mkv"].update(tmdbId=4, imdbUrl="https://imdb.com/title/tt0000004/")
            self.library["series"].clear()
            self.library["movies"]["Movies/D.mkv"] = {"name": "D", "imdbId": "tt0000005"}
            self.backfill.start()
            job = self.finish()["job"]
            self.assertEqual((job["state"], job["processed"], job["total"]), ("completed", 3, 3))
            self.assertEqual(download.call_count, 3)  # Existing A was preserved.
            requested_ids = [call.kwargs["imdb_id"] for call in self.ratings.get.call_args_list]
            self.assertEqual(requested_ids, ["tt0000001", "tt0000002", "tt0000004", "tt0000005"])

    def test_resume_can_remove_the_profile_that_caused_pause(self):
        original = self.ratings.get

        def blocked_title(**kwargs):
            if kwargs["imdb_id"] == "tt0000002":
                raise omdb.OmdbError("OMDB_TMDB_ERROR")
            return original(**kwargs)

        with patch.object(self.ratings, "get", side_effect=blocked_title), patch.object(omdb, "_download_json", side_effect=self.download) as download:
            self.backfill.start()
            self.assertEqual(self.finish()["job"]["state"], "paused")
            del self.library["movies"]["Movies/B.mkv"]
            self.backfill.start()
            job = self.finish()["job"]
            self.assertEqual((job["state"], job["processed"], job["total"]), ("completed", 2, 2))
            self.assertEqual(download.call_count, 2)

    def test_corrected_id_on_a_processed_profile_becomes_pending_on_resume(self):
        original = self.ratings.get

        def blocked_title(**kwargs):
            if kwargs["imdb_id"] == "tt0000002":
                raise omdb.OmdbError("OMDB_TMDB_ERROR")
            return original(**kwargs)

        with patch.object(omdb, "_download_json", side_effect=self.download) as download:
            with patch.object(self.ratings, "get", side_effect=blocked_title):
                self.backfill.start()
                self.assertEqual(self.finish()["job"]["processed"], 1)
            self.library["movies"]["Movies/A.mkv"].update(tmdbId=9, imdbUrl="https://imdb.com/title/tt0000009/")
            self.backfill.start()
            self.assertEqual(self.finish()["job"]["processed"], 3)
            self.assertEqual(download.call_count, 4)
            saved = json.loads(self.backfill.path.read_text())
            self.assertEqual(saved["items"][0]["imdbId"], "tt0000009")

    def test_peek_uses_local_tmdb_identity_without_network_or_writes(self):
        self.tmdb.json.side_effect = None
        self.tmdb.json.return_value = {"imdb_id": "tt0000001"}
        cached = {**omdb._parse_rating(response(rating="N/A"), "tt0000001"), "updatedAt": time.time(), "version": omdb.CACHE_VERSION}
        omdb._write(self.ratings.root / "ratings" / "tt0000001.json", cached)
        with patch.object(omdb, "_download_json") as download:
            peeked = self.ratings.peek(kind="movie", tmdb_id=1)
            self.assertIsNone(peeked["rating"])
            self.assertFalse(peeked["stale"])
            self.assertFalse((self.ratings.root / "ids").exists())
            download.assert_not_called()


class BackfillApiTests(BackfillFixture):
    def setUp(self):
        super().setUp()
        for name, value in (("omdb_backfill", self.backfill), ("current_web_pin", lambda: "test-pin")):
            patcher = patch.object(api, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = api.app.test_client()
        self.headers = {"X-Web-Pin": "test-pin"}

    def test_library_endpoint_requires_pin_and_has_no_store(self):
        for method in ("get", "post"):
            response = getattr(self.client, method)("/omdb/library")
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.headers["Cache-Control"], "no-store")
        response = self.client.get("/omdb/library", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["job"]["state"], "idle")
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertFalse(self.backfill.path.exists())

    def test_invalid_action_is_rejected_and_valid_start_prepares_profiles(self):
        for data in (None, [], {}, {"action": "delete"}, {"action": []}, {"action": "start", "key": "client-key"}):
            response = self.client.post("/omdb/library", headers=self.headers, json=data)
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json["code"], "OMDB_INVALID_ACTION")
        with patch.object(omdb, "_download_json", side_effect=self.download):
            response = self.client.post("/omdb/library", headers=self.headers, json={"action": "start"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            self.assertEqual(self.finish()["job"]["state"], "completed")
        self.assertNotIn("test-secret", json.dumps(response.json))


if __name__ == "__main__":
    unittest.main()
