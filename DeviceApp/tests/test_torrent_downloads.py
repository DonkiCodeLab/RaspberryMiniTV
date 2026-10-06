import copy
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from torrent_downloads import TorrentDownloads, TorrentError, Transmission, normalize_results, search_torrents, video_file
import control_api as api

INFO_HASH = "a" * 40


class FakeTransmission:
    def __init__(self):
        self.rows = {}
        self.calls = []

    def call(self, method, args=None):
        args = args or {}
        self.calls.append((method, copy.deepcopy(args)))
        if method == "torrent-add":
            key = args["filename"].split(":")[-1]
            if key in self.rows:
                return {"torrent-duplicate": {"hashString": key}}
            self.rows[key] = {"hashString": key, "downloadDir": args["download-dir"], "metadataPercentComplete": 0,
                              "files": [], "percentDone": 0, "leftUntilDone": 100, "status": 4, "error": 0}
            return {"torrent-added": {"hashString": key}}
        if method == "torrent-get":
            return {"torrents": [copy.deepcopy(self.rows[key]) for key in args["ids"] if key in self.rows]}
        if method == "torrent-remove":
            for key in args["ids"]:
                row = self.rows.pop(key, None)
                if row and args.get("delete-local-data"):
                    for entry in row["files"]:
                        file = Path(row["downloadDir"]) / entry["name"]
                        if file.is_file():
                            file.unlink()
        if method in {"torrent-stop", "torrent-start"}:
            for key in args["ids"]:
                if key in self.rows:
                    self.rows[key]["status"] = 0 if method == "torrent-stop" else 4
        return {}


class TorrentTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name).resolve()
        self.rpc = FakeTransmission()
        self.artwork = Mock(return_value={"state": "running"})
        self.prepare = Mock()
        self.importer = Mock(return_value={"relativePath": "Movies/film.mkv"})
        self.manager = self.new_manager()
        self.manager.start = Mock()

    def new_manager(self):
        return TorrentDownloads(self.root / "Torrents", self.importer, self.artwork, self.prepare, self.rpc)

    def add(self, **changes):
        data = {"infoHash": INFO_HASH, "name": "Film release", "sizeBytes": 100,
                "movie": {"id": 123, "name": "Film"}, **changes}
        return self.manager.add(data)

    def ready(self, completed=100, name="Film/movie.mkv"):
        row = self.rpc.rows[INFO_HASH]
        row.update(metadataPercentComplete=1, percentDone=completed / 100, leftUntilDone=100 - completed,
                   files=[{"name": name, "length": 100, "bytesCompleted": completed}])
        source = self.root / "Torrents/downloads" / INFO_HASH / name
        if ".." not in Path(name).parts:
            source.parent.mkdir(parents=True, exist_ok=True)
            source.write_bytes(b"v" * completed)
        return source

    def test_metadata_is_not_prepared_before_completed_video(self):
        self.add()
        self.manager.tick()  # Magnet metadata absent.
        self.ready(30)
        self.manager.tick()  # File selection.
        self.manager.tick()  # Partial video.
        self.importer.assert_not_called()
        self.prepare.assert_not_called()
        self.artwork.assert_not_called()
        self.assertEqual(self.manager.snapshot()["jobs"][0]["progress"], 30)
        source = self.ready()
        self.manager.tick()
        self.importer.assert_called_once()
        self.assertEqual(self.importer.call_args.args[1], source)
        self.assertEqual(self.manager.snapshot()["jobs"][0]["state"], "metadata")
        self.assertFalse(source.exists())
        self.artwork.return_value = {"state": "complete"}
        self.manager.tick()
        self.assertEqual(self.manager.snapshot()["jobs"][0]["state"], "complete")

    def test_restart_preserves_transfer_and_pause(self):
        self.add()
        self.ready(20)
        self.manager.tick()
        self.manager.action(INFO_HASH, "pause")
        restarted = self.new_manager()
        restarted.tick()
        self.assertEqual(restarted.snapshot()["jobs"][0]["state"], "paused")
        self.importer.assert_not_called()
        restarted.action(INFO_HASH, "resume")
        self.ready()
        restarted.tick()
        self.assertEqual(self.importer.call_count, 1)

    def test_restart_preserves_download_sources(self):
        self.add(sources=["The Pirate Bay", "1337x (Knaben)", "The Pirate Bay", None])
        self.assertEqual(self.new_manager().snapshot()["jobs"][0]["sources"], ["The Pirate Bay", "1337x (Knaben)"])

    def test_cancel_never_imports_and_survives_restart(self):
        self.add()
        source = self.ready()
        self.manager.action(INFO_HASH, "cancel")
        self.new_manager().tick()
        self.assertFalse(source.exists())
        self.importer.assert_not_called()
        self.assertEqual(self.new_manager().snapshot()["jobs"][0]["state"], "cancelled")

    def test_duplicate_requests_do_not_add_two_transfers(self):
        first = self.add()
        self.assertEqual(first["id"], self.add()["id"])
        self.assertEqual(len([call for call in self.rpc.calls if call[0] == "torrent-add"]), 1)
        with self.assertRaises(ValueError):
            self.add(infoHash="b" * 40)
        with self.assertRaises(ValueError):
            self.add(movie={"id": 999, "name": "Other movie"})

    def test_redownload_archives_completed_job_and_persists_confirmation(self):
        self.add()
        self.ready()
        self.artwork.return_value = {"state": "complete"}
        self.manager.tick()
        self.manager.tick()
        self.assertEqual(self.manager.jobs[INFO_HASH]["state"], "complete")
        self.add(overwriteExisting=True)
        restarted = self.new_manager()
        self.assertTrue(restarted.jobs[INFO_HASH]["overwriteExisting"])
        history = [job for job in restarted.jobs.values() if job["id"] != INFO_HASH]
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["state"], "complete")
        restarted.action(history[0]["id"], "remove")
        self.assertIn(INFO_HASH, self.rpc.rows)

    def test_confirmed_partial_download_does_not_import(self):
        self.add(overwriteExisting=True)
        self.ready(30)
        self.manager.tick()
        self.manager.tick()
        self.importer.assert_not_called()
        self.manager.action(INFO_HASH, "cancel")
        self.importer.assert_not_called()

    def test_tmdb_can_finish_while_engine_is_offline_and_cleanup_retries(self):
        self.add()
        self.ready()
        self.manager.tick()
        self.manager.tick()
        job = self.manager.jobs[INFO_HASH]
        job["transferRemoved"] = False  # Cleanup had not been acknowledged before an outage.
        self.artwork.return_value = {"state": "complete"}
        with patch.object(self.rpc, "call", side_effect=TorrentError("offline")):
            self.manager.tick()
        self.assertEqual(job["state"], "complete")
        self.assertFalse(job["transferRemoved"])
        self.manager.tick()
        self.assertTrue(job["transferRemoved"])

    def test_cancel_cleanup_recovers_after_lost_acknowledgement(self):
        self.add()
        self.ready()
        self.manager._update(self.manager.jobs[INFO_HASH], state="cancelled")
        restarted = self.new_manager()
        restarted.tick()
        self.assertNotIn(INFO_HASH, self.rpc.rows)
        self.assertTrue(restarted.snapshot()["jobs"][0]["transferRemoved"])
        self.importer.assert_not_called()

    def test_finished_history_persists_until_removed_without_deleting_movie(self):
        library_video = self.root / "library-movie.mkv"
        def import_movie(job, source):
            import os
            os.link(source, library_video)
            return {"relativePath": library_video.name}
        self.manager.import_movie = import_movie
        self.add()
        self.ready()
        self.artwork.return_value = {"state": "complete"}
        self.manager.tick()
        self.manager.tick()
        restarted = self.new_manager()
        restarted.tick()
        self.assertEqual(restarted.snapshot()["jobs"][0]["state"], "complete")
        with patch.object(self.rpc, "call", side_effect=AssertionError("History removal must not touch Transmission")):
            self.assertTrue(restarted.action(INFO_HASH, "remove")["removed"])
        self.assertEqual(self.new_manager().snapshot()["jobs"], [])
        self.assertEqual(library_video.read_bytes(), b"v" * 100)

    def test_cancelled_history_can_be_removed(self):
        self.add()
        self.manager.action(INFO_HASH, "cancel")
        self.manager.action(INFO_HASH, "remove")
        self.assertNotIn(INFO_HASH, json.loads(self.manager.state_path.read_text()))

    def test_history_removal_rejects_active_importing_and_retryable_jobs(self):
        self.add()
        for state in ("queued", "downloading", "paused", "importing", "metadata", "failed"):
            with self.subTest(state=state):
                self.manager._update(self.manager.jobs[INFO_HASH], state=state)
                with self.assertRaises(ValueError):
                    self.manager.action(INFO_HASH, "remove")
                self.assertEqual(len(self.manager.snapshot()["jobs"]), 1)

    def test_hidden_history_keeps_pending_cleanup_after_restart(self):
        self.add()
        source = self.ready()
        self.manager._update(self.manager.jobs[INFO_HASH], state="cancelled")
        with patch.object(self.rpc, "call", side_effect=TorrentError("offline")):
            self.manager.action(INFO_HASH, "remove")
            restarted = self.new_manager()
            restarted.tick()
        self.assertEqual(restarted.snapshot()["jobs"], [])
        self.assertTrue(source.exists())
        self.assertIn(INFO_HASH, restarted.jobs)  # Cleanup must not be orphaned.
        restarted.tick()
        self.assertFalse(source.exists())
        self.assertNotIn(INFO_HASH, self.new_manager().jobs)

    def test_history_is_retained_if_persisting_removal_fails(self):
        self.add()
        self.manager.action(INFO_HASH, "cancel")
        with patch.object(self.manager, "_save", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                self.manager.action(INFO_HASH, "remove")
        self.assertEqual(len(self.manager.snapshot()["jobs"]), 1)
        self.assertEqual(len(self.new_manager().snapshot()["jobs"]), 1)

    def test_invalid_magnet_never_reaches_engine(self):
        with self.assertRaises(ValueError):
            self.add(infoHash="file:///etc/passwd")
        self.assertEqual(self.rpc.calls, [])

    def test_failed_tmdb_retries_without_downloading_again(self):
        self.add()
        self.ready()
        self.manager.tick()
        self.artwork.return_value = {"state": "failed", "error": "TMDB offline"}
        self.manager.tick()
        self.assertEqual(self.manager.snapshot()["jobs"][0]["state"], "failed")
        self.manager.action(INFO_HASH, "retry")
        self.prepare.assert_called_once_with(123)
        self.artwork.return_value = {"state": "complete"}
        self.manager.tick()
        self.assertEqual(len([call for call in self.rpc.calls if call[0] == "torrent-add"]), 1)
        self.importer.assert_called_once()

    def test_video_selection_excludes_samples_archives_and_other_files(self):
        self.assertEqual(video_file([
            {"name": "sample.mkv", "length": 500}, {"name": "movie.mkv", "length": 100},
            {"name": "readme.exe", "length": 600}, {"name": "extras.mkv", "length": 20},
        ])[0], 1)
        with self.assertRaises(TorrentError):
            video_file([{"name": "film.rar", "length": 100}])
        with self.assertRaises(TorrentError):
            video_file([{"name": "../film.mkv", "length": 100}])

    def test_legacy_video_formats_are_selected_and_safe_paths_still_required(self):
        for suffix in (".AVI", ".divx", ".mpg", ".mpeg", ".webm", ".wmv", ".m2ts", ".rmvb"):
            with self.subTest(suffix=suffix):
                files = [{"name": "sample" + suffix, "length": 1000},
                         {"name": "Film/movie" + suffix, "length": 100}]
                self.assertEqual(video_file(files)[0], 1)
                with self.assertRaisesRegex(TorrentError, "ruta"):
                    video_file([{"name": "../movie" + suffix, "length": 100}])

    def test_rejected_torrent_reports_detected_extensions(self):
        for names, expected in ((["film.rar", "film.r00", "info.nfo"], ".rar"),
                                (["film.iso"], ".iso"), (["film"], "sin extensión"),
                                ([], "ningún archivo"), (["sample.avi"], ".avi")):
            with self.subTest(names=names), self.assertRaises(TorrentError) as caught:
                video_file([{"name": name, "length": 100} for name in names])
            self.assertIn(expected, str(caught.exception))

    def test_retry_of_previously_rejected_avi_imports_without_conversion(self):
        self.add()
        source = self.ready(name="Film/movie.avi")
        self.manager._update(self.manager.jobs[INFO_HASH], state="failed", error="Old format filter")
        self.manager.action(INFO_HASH, "retry")
        self.manager.tick()
        self.manager.tick()
        self.importer.assert_called_once_with(self.manager.jobs[INFO_HASH], source)
        self.assertEqual(self.manager.jobs[INFO_HASH]["state"], "metadata")

    def test_incomplete_disk_file_does_not_import_even_if_rpc_says_done(self):
        self.add()
        source = self.ready()
        source.write_bytes(b"partial")
        self.manager.tick()
        self.manager.tick()
        self.assertEqual(self.manager.snapshot()["jobs"][0]["state"], "failed")
        self.importer.assert_not_called()
        self.prepare.assert_not_called()

    def test_symlink_cannot_import_a_file_outside_download(self):
        self.add()
        source = self.ready()
        source.unlink()
        external = self.root / "external.mkv"
        external.write_bytes(b"x" * 100)
        source.symlink_to(external)
        self.manager.tick()
        self.manager.tick()
        self.importer.assert_not_called()
        self.assertEqual(external.read_bytes(), b"x" * 100)

    def test_foreign_transmission_transfer_is_never_stopped_or_deleted(self):
        self.rpc.rows[INFO_HASH] = {"downloadDir": str(self.root / "other"), "files": []}
        with self.assertRaises(TorrentError):
            self.add()
        with self.assertRaises(TorrentError):
            self.manager.action(INFO_HASH, "cancel")
        self.assertFalse(any(method in {"torrent-stop", "torrent-remove"} for method, _ in self.rpc.calls))

    def test_crash_after_intent_recovers_missing_transfer(self):
        self.add()
        self.rpc.rows.clear()
        restarted = self.new_manager()
        restarted.tick()
        self.assertIn(INFO_HASH, self.rpc.rows)
        self.importer.assert_not_called()

    def test_search_orders_seeds_validates_categories_and_sizes(self):
        rows = [
            {"info_hash": "a" * 40, "category": "201", "size": "2000000", "seeders": "3", "name": "Film"},
            {"info_hash": "b" * 40, "category": "207", "size": "3000000", "seeders": "30", "name": "Film HD"},
            {"info_hash": "c" * 40, "category": "500", "size": "99", "seeders": "999", "name": "Wrong category"},
            {"info_hash": "0" * 40, "category": "201", "size": "99", "name": "No results"},
            {"info_hash": "d" * 40, "category": "209", "size": "oops", "name": "Malformed"},
        ]
        results = normalize_results(rows)
        self.assertEqual([entry["seeds"] for entry in results], [30, 3])
        self.assertEqual(results[0]["sizeBytes"], 3000000)

    def test_search_upstream_failure_has_actionable_error(self):
        with patch("torrent_downloads.urllib.request.urlopen", side_effect=TimeoutError):
            with self.assertRaisesRegex(TorrentError, "The Pirate Bay"):
                search_torrents("Public domain")

    def test_rpc_retries_csrf_challenge(self):
        response = Mock()
        response.__enter__ = Mock(return_value=io.BytesIO(json.dumps({"result": "success", "arguments": {"version": "4"}}).encode()))
        response.__exit__ = Mock(return_value=False)
        challenge = urllib.error.HTTPError("http://localhost", 409, "Conflict", {"X-Transmission-Session-Id": "new-session"}, None)
        with patch("torrent_downloads.urllib.request.urlopen", side_effect=[challenge, response]) as opener:
            self.assertEqual(Transmission().call("session-get")["version"], "4")
            self.assertIn("new-session", opener.call_args.args[0].headers.values())


class TorrentApiTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        (self.root / "Movies").mkdir()
        for name, value in {"MOVIES_DIR": str(self.root / "Movies"), "VIDEOS_DIR": str(self.root),
                            "MEDIA_LIBRARY_PATH": str(self.root / "library.json"),
                            "LEGACY_MOVIE_LIBRARY_PATH": str(self.root / "legacy.json")}.items():
            p = patch.object(api, name, value); p.start(); self.addCleanup(p.stop)
        p = patch.object(api, "ensure_media_directories"); p.start(); self.addCleanup(p.stop)
        self.client = api.app.test_client()

    def test_search_exposes_source_status_and_returns_partial_results(self):
        payload = {"results": [{"infoHash": INFO_HASH, "sources": ["1337x (Knaben)"]}],
                   "sources": [{"id": "piratebay", "name": "The Pirate Bay", "status": "error", "count": 0}]}
        with patch.object(api, "is_authorized_request", return_value=True), patch.object(api, "search_torrents", return_value=payload):
            response = self.client.get("/torrents/search?q=Sintel")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, payload)

    def test_search_reports_validation_and_total_failure(self):
        with patch.object(api, "is_authorized_request", return_value=True):
            self.assertEqual(self.client.get("/torrents/search?q=").status_code, 400)
            with patch.object(api, "search_torrents", side_effect=TorrentError("No sources")):
                self.assertEqual(self.client.get("/torrents/search?q=Sintel").status_code, 503)

    def test_endpoints_require_pin(self):
        with patch.object(api, "is_authorized_request", return_value=False), patch.object(api, "get_movie_torrents") as manager:
            for path in ("/torrents", "/torrents/search?q=Film"):
                self.assertEqual(self.client.get(path).status_code, 401)
            self.assertEqual(self.client.post("/torrents", json={}).status_code, 401)
            self.assertEqual(self.client.post("/torrents/abc", json={"action": "cancel"}).status_code, 401)
            self.assertEqual(self.client.post("/torrents/abc", json={"action": "remove"}).status_code, 401)
            manager.assert_not_called()

    def test_remove_history_endpoint_and_active_job_protection(self):
        manager = TorrentDownloads(self.root / "Torrents", Mock(), Mock(), Mock(), FakeTransmission())
        manager.start = Mock()
        manager.add({"infoHash": INFO_HASH, "movie": {"id": 123, "name": "Film"}})
        with patch.object(api, "is_authorized_request", return_value=True), patch.object(api, "get_movie_torrents", return_value=manager):
            self.assertEqual(self.client.post(f"/torrents/{INFO_HASH}", json={"action": "remove"}).status_code, 400)
            manager.action(INFO_HASH, "cancel")
            response = self.client.post(f"/torrents/{INFO_HASH}", json={"action": "remove"})
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json["job"]["removed"])
            self.assertEqual(self.client.get("/torrents").json["jobs"], [])
            self.assertEqual(self.client.post(f"/torrents/{INFO_HASH}", json={"action": "remove"}).status_code, 404)

    def test_atomic_import_and_restart_do_not_duplicate_or_start_tmdb_early(self):
        source = self.root / "movie.mkv"
        source.write_bytes(b"finished")
        job = {"id": INFO_HASH, "movie": {"id": 123, "name": "Film"}}
        def assert_published(kind, item):
            self.assertEqual((self.root / item["relativePath"]).read_bytes(), b"finished")
            self.assertIn(item["relativePath"], api.load_movie_library())
        with patch.object(api, "queue_tmdb_artwork", side_effect=assert_published) as artwork:
            item = api.import_torrent_movie(job, source)
            self.assertEqual(api.import_torrent_movie(job, source), item)
            self.assertEqual(len(api.load_movie_library()), 1)
            self.assertEqual(artwork.call_count, 2)
        source.unlink()
        self.assertEqual((self.root / item["relativePath"]).read_bytes(), b"finished")

    def test_avi_import_is_visible_to_catalog_and_upload_validation(self):
        source = self.root / "movie.AVI"
        source.write_bytes(b"finished")
        with patch.object(api, "queue_tmdb_artwork"):
            item = api.import_torrent_movie({"id": INFO_HASH, "movie": {"id": 123, "name": "Film"}}, source)
        self.assertTrue(item["relativePath"].endswith(".avi"))
        self.assertTrue(api.is_video_file(item["relativePath"]))
        self.assertTrue(api.is_supported_upload_file(source.name))
        self.assertIn(item["relativePath"], api.load_movie_library())
        self.assertEqual((self.root / item["relativePath"]).read_bytes(), b"finished")

    def test_existing_movie_is_not_overwritten(self):
        source = self.root / "movie.mkv"
        source.write_bytes(b"new video")
        existing = self.root / "Movies/existing.mkv"
        existing.write_bytes(b"original video")
        with patch.object(api, "queue_tmdb_artwork"):
            api.upsert_movie_metadata("Movies/existing.mkv", "Film", 123)
            with self.assertRaisesRegex(ValueError, "ya está"):
                api.import_torrent_movie({"id": INFO_HASH, "movie": {"id": 123, "name": "Film"}}, source)
        self.assertEqual(existing.read_bytes(), b"original video")
        self.assertTrue(source.exists())

    def existing_movie(self):
        existing = self.root / "Movies/existing.mkv"
        existing.write_bytes(b"original video")
        with patch.object(api, "queue_tmdb_artwork"):
            api.upsert_movie_metadata("Movies/existing.mkv", "Film", 123)
        return existing

    def test_duplicate_endpoint_requires_explicit_boolean_confirmation(self):
        self.existing_movie()
        manager = Mock()
        manager.add.return_value = {"id": INFO_HASH}
        with patch.object(api, "is_authorized_request", return_value=True), patch.object(api, "get_movie_torrents", return_value=manager):
            for flag in (None, False, "true"):
                response = self.client.post("/torrents", json={"movie": {"id": 123}, "overwriteExisting": flag})
                self.assertEqual(response.status_code, 409)
                self.assertEqual(response.json["code"], "MOVIE_ALREADY_DOWNLOADED")
            manager.add.assert_not_called()
            response = self.client.post("/torrents", json={"movie": {"id": 123}, "overwriteExisting": True})
            self.assertEqual(response.status_code, 202)
            self.assertTrue(manager.add.call_args.args[0]["overwriteExisting"])

    def test_confirmed_import_replaces_video_and_preserves_profile(self):
        for suffix in (".mkv", ".mp4"):
            with self.subTest(suffix=suffix):
                existing = self.existing_movie()
                library = api.load_media_library()
                library["movies"] = {"Movies/existing.mkv": {**library["movies"]["Movies/existing.mkv"], "customField": "keep"}}
                api.save_media_library(library)
                source = self.root / ("new" + suffix)
                source.write_bytes(b"new video")
                with patch.object(api, "queue_tmdb_artwork") as artwork:
                    item = api.import_torrent_movie({"id": INFO_HASH, "movie": {"id": 123, "name": "Film"}, "overwriteExisting": True}, source)
                self.assertEqual((self.root / item["relativePath"]).read_bytes(), b"new video")
                self.assertEqual(item["customField"], "keep")
                self.assertEqual(len(api.load_movie_library()), 1)
                self.assertEqual(existing.exists(), suffix == ".mkv")
                artwork.assert_called_once()

    def test_failed_catalog_save_restores_existing_video(self):
        existing = self.existing_movie()
        source = self.root / "new.mkv"
        source.write_bytes(b"new video")
        with patch.object(api, "save_media_library", side_effect=OSError("disk full")), patch.object(api, "queue_tmdb_artwork") as artwork:
            with self.assertRaises(OSError):
                api.import_torrent_movie({"id": INFO_HASH, "movie": {"id": 123, "name": "Film"}, "overwriteExisting": True}, source)
        self.assertEqual(existing.read_bytes(), b"original video")
        self.assertEqual(source.read_bytes(), b"new video")
        artwork.assert_not_called()


if __name__ == "__main__":
    unittest.main()
