import io
from pathlib import Path
import stat
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import Mock, patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from torrent_downloads import TorrentDownloads, TorrentError, normalize_results, normalize_knaben_results, normalize_torznab_results, search_torrents
from safe_archive import extract_archive
from test_torrent_downloads import FakeTransmission, INFO_HASH
import control_api as api


class FreeTorrentFixture(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.rpc = FakeTransmission()
        self.importer = Mock()
        self.manager = self.new_manager()

    def new_manager(self):
        manager = TorrentDownloads(self.root / "Torrents", self.importer, Mock(), Mock(), self.rpc)
        manager.start = Mock()
        return manager

    def add(self):
        return self.manager.add({"infoHash": INFO_HASH, "mediaType": "generic", "name": "Free files"})

    def ready(self, files=None):
        self.add()
        folder = self.manager.download_folder(self.manager.jobs[INFO_HASH])
        files = files or {"Pack/subfolder/file.txt": b"hello", "Pack/archive.zip": b"zip"}
        rows = []
        for name, data in files.items():
            path = folder / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            rows.append({"name": name, "length": len(data), "bytesCompleted": len(data)})
        self.rpc.rows[INFO_HASH].update(metadataPercentComplete=1, percentDone=1, leftUntilDone=0, files=rows)
        self.manager.tick()
        self.manager.tick()
        return folder


class FreeTorrentTests(FreeTorrentFixture):
    def catalog_attempt(self):
        self.manager.import_series = Mock()
        self.manager.series_artwork_status = Mock()
        self.manager.prepare_series_artwork = Mock()
        return self.manager.add({"infoHash": INFO_HASH, "name": "Nature pack", "mediaType": "series",
                                 "series": {"id": 123, "name": "Nature"}})

    def test_cancelled_catalog_attempt_does_not_block_free_download(self):
        self.catalog_attempt()
        self.manager.action(INFO_HASH, "cancel")
        job = self.add()
        self.assertEqual(job["mediaType"], "generic")
        self.assertEqual(job["state"], "queued")
        history = [item for item in self.manager.snapshot()["jobs"] if item["id"] != INFO_HASH]
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["state"], "cancelled")
        self.assertEqual(history[0]["series"]["id"], 123)
        self.assertEqual(Path(self.rpc.rows[INFO_HASH]["downloadDir"]), self.manager.root / "free" / INFO_HASH)
        self.assertEqual(self.add()["createdAt"], job["createdAt"])

    def test_failed_series_can_continue_as_free_in_place_and_download_every_file(self):
        self.catalog_attempt()
        folder = self.manager.download_folder(self.manager.jobs[INFO_HASH])
        (folder / "episode-one.mkv").write_bytes(b"abc")
        (folder / "readme.txt").write_bytes(b"text")
        rows = [{"name": "episode-one.mkv", "length": 6, "bytesCompleted": 3},
                {"name": "readme.txt", "length": 4, "bytesCompleted": 4}]
        self.rpc.rows[INFO_HASH].update(metadataPercentComplete=1, files=rows)
        self.manager.tick()  # No episode numbers: catalog import fails before downloading.
        self.assertEqual(self.manager.jobs[INFO_HASH]["state"], "failed")
        self.assertEqual(self.rpc.rows[INFO_HASH]["status"], 0)
        self.manager._update(self.manager.jobs[INFO_HASH], videoIndices=[0], allowCombinedEpisodes=True)
        self.rpc.calls.clear()
        job = self.add()
        self.assertEqual(job["state"], "queued")
        self.assertEqual(job["mediaType"], "generic")
        self.assertNotIn("series", job)
        self.assertNotIn("videoIndices", job)
        self.assertNotIn("allowCombinedEpisodes", job)
        self.assertEqual(self.manager.download_folder(job), folder)
        self.assertEqual((folder / "episode-one.mkv").read_bytes(), b"abc")
        self.assertEqual(self.rpc.rows[INFO_HASH]["status"], 4)
        self.assertFalse(any(method == "torrent-remove" for method, _ in self.rpc.calls))
        self.manager.tick()
        self.assertIn(("torrent-set", {"ids": [INFO_HASH], "files-wanted": [0, 1]}), self.rpc.calls)
        self.manager.import_series.assert_not_called()
        self.importer.assert_not_called()
        (folder / "episode-one.mkv").write_bytes(b"abcdef")
        rows[0]["bytesCompleted"] = 6
        self.rpc.rows[INFO_HASH].update(leftUntilDone=0, percentDone=1)
        self.manager.tick()
        self.assertEqual(self.manager.jobs[INFO_HASH]["state"], "complete")
        self.assertIn(("torrent-remove", {"ids": [INFO_HASH], "delete-local-data": False}), self.rpc.calls)
        self.manager = self.new_manager()
        self.assertEqual(len(self.manager.free_contents(INFO_HASH)["entries"]), 2)
        self.manager.action(INFO_HASH, "delete")
        self.assertFalse(folder.exists())

    def test_free_conversion_preserves_foreign_and_imported_or_active_jobs(self):
        self.catalog_attempt()
        for state in ("queued", "downloading", "paused", "importing", "metadata"):
            with self.subTest(state=state):
                self.manager._update(self.manager.jobs[INFO_HASH], state=state)
                with self.assertRaisesRegex(ValueError, "Nature.*Ver descargas"):
                    self.add()
        self.manager._update(self.manager.jobs[INFO_HASH], state="failed", item={"relativePath": "TVShows/nature"})
        with self.assertRaises(ValueError):
            self.add()
        self.manager.jobs[INFO_HASH].pop("item")
        self.rpc.rows[INFO_HASH]["downloadDir"] = str(self.root / "foreign")
        self.rpc.calls.clear()
        with self.assertRaises(TorrentError):
            self.add()
        self.assertEqual(self.manager.jobs[INFO_HASH]["mediaType"], "series")
        self.assertEqual([method for method, _ in self.rpc.calls], ["torrent-get"])

    def test_interrupted_conversion_remains_retryable_after_restart(self):
        self.catalog_attempt()
        self.manager._update(self.manager.jobs[INFO_HASH], state="failed")
        folder = self.manager.download_folder(self.manager.jobs[INFO_HASH])
        (folder / "partial.txt").write_bytes(b"keep")
        call = self.rpc.call
        def offline_on_start(method, args=None):
            if method == "torrent-start":
                raise TorrentError("offline")
            return call(method, args)
        with patch.object(self.rpc, "call", side_effect=offline_on_start), self.assertRaises(TorrentError):
            self.add()
        self.manager = self.new_manager()
        job = self.manager.jobs[INFO_HASH]
        self.assertEqual((job["mediaType"], job["state"]), ("generic", "failed"))
        self.assertEqual(self.manager.download_folder(job), folder)
        self.assertEqual(self.manager.action(INFO_HASH, "retry")["state"], "queued")
        self.assertEqual((folder / "partial.txt").read_bytes(), b"keep")
        self.manager.action(INFO_HASH, "cancel")
        self.assertFalse(folder.exists())

    def test_completed_free_contents_cannot_be_replaced_by_catalog_request(self):
        folder = self.ready()
        self.rpc.calls.clear()
        with self.assertRaisesRegex(ValueError, "Abre su contenido"):
            self.manager.add({"infoHash": INFO_HASH, "movie": {"id": 123, "name": "Nature"}})
        self.assertEqual(self.rpc.calls, [])
        self.assertEqual((folder / "Pack/subfolder/file.txt").read_bytes(), b"hello")

    def test_repeated_start_keeps_one_active_transfer_and_its_progress(self):
        original = self.add()
        for state in ("queued", "downloading", "paused", "failed"):
            with self.subTest(state=state):
                self.manager._update(self.manager.jobs[INFO_HASH], state=state, downloadedBytes=45, progress=45)
                for _ in range(3):
                    job = self.add()
                    self.assertEqual(job["createdAt"], original["createdAt"])
                    self.assertEqual(job["state"], state)
                    self.assertEqual(job["progress"], 45)
                snapshot = self.manager.snapshot()["jobs"]
                self.assertEqual(len(snapshot), 1)
                self.assertEqual(snapshot[0]["id"], INFO_HASH)
        self.assertEqual(sum(method == "torrent-add" for method, _ in self.rpc.calls), 1)

    def test_all_files_complete_without_media_import_and_survive_restart(self):
        folder = self.ready()
        self.importer.assert_not_called()
        self.assertEqual(self.manager.jobs[INFO_HASH]["state"], "complete")
        self.assertEqual((folder / "Pack/subfolder/file.txt").read_bytes(), b"hello")
        removal = [args for method, args in self.rpc.calls if method == "torrent-remove"]
        self.assertEqual(removal, [{"ids": [INFO_HASH], "delete-local-data": False}])
        self.manager = self.new_manager()
        self.manager.tick()
        self.assertEqual(self.manager.free_contents(INFO_HASH)["entries"][0]["name"], "Pack")
        self.assertEqual(self.manager.free_contents(INFO_HASH, "Pack/subfolder")["entries"][0]["name"], "file.txt")
        self.assertTrue(self.manager.free_contents(INFO_HASH, "Pack")["entries"][1]["archive"])
        self.add()  # A duplicate does not restart or overwrite the stored content.
        self.assertEqual(sum(method == "torrent-add" for method, _ in self.rpc.calls), 1)

    def test_pause_resume_cancel_remove_and_retry(self):
        self.add()
        folder = self.manager.download_folder(self.manager.jobs[INFO_HASH])
        (folder / "partial.txt").write_bytes(b"partial")
        self.assertEqual(self.manager.action(INFO_HASH, "pause")["state"], "paused")
        self.assertEqual(self.manager.action(INFO_HASH, "resume")["state"], "queued")
        self.manager._update(self.manager.jobs[INFO_HASH], state="failed")
        self.assertEqual(self.manager.action(INFO_HASH, "retry")["state"], "queued")
        self.assertEqual(self.manager.action(INFO_HASH, "cancel")["state"], "cancelled")
        self.assertFalse(folder.exists())
        self.manager.action(INFO_HASH, "remove")
        self.assertEqual(self.manager.snapshot()["jobs"], [])

    def test_completed_files_require_delete_and_pending_delete_recovers(self):
        folder = self.ready()
        with self.assertRaises(ValueError):
            self.manager.action(INFO_HASH, "remove")
        with patch("free_downloads.shutil.rmtree", side_effect=OSError("disk busy")):
            with self.assertRaises(OSError):
                self.manager.action(INFO_HASH, "delete")
        self.assertTrue(folder.exists())
        self.manager = self.new_manager()
        self.manager.tick()
        self.assertFalse(folder.exists())
        self.assertEqual(self.manager.snapshot()["jobs"], [])

    def test_incomplete_and_foreign_downloads_are_not_exposed(self):
        self.add()
        with self.assertRaises(ValueError):
            self.manager.free_contents(INFO_HASH)
        with self.assertRaises(ValueError):
            self.manager.action(INFO_HASH, "delete")
        self.rpc.rows[INFO_HASH]["downloadDir"] = str(self.root / "foreign")
        with self.assertRaises(TorrentError):
            self.manager.action(INFO_HASH, "cancel")

    def test_browsing_extraction_and_import_reject_traversal_and_links(self):
        folder = self.ready()
        outside = self.root / "private"
        outside.mkdir()
        (outside / "secret.txt").write_text("private")
        (folder / "linked").symlink_to(outside)
        for path in ("../private", "/etc", "Pack/../../private", "linked", "Pack\\..\\private"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                self.manager.free_contents(INFO_HASH, path)
            with self.subTest(path=path), self.assertRaises(ValueError):
                self.manager.import_free_download(INFO_HASH, path, {}, Mock())
        self.assertNotIn("linked", [entry["name"] for entry in self.manager.free_contents(INFO_HASH)["entries"]])
        self.manager.action(INFO_HASH, "delete")
        self.assertEqual((outside / "secret.txt").read_text(), "private")

    def test_deferred_engine_cleanup_preserves_completed_files(self):
        self.add()
        with patch.object(self.manager, "_remove_transfer"):
            folder = self.ready()
        self.assertFalse(self.manager.jobs[INFO_HASH].get("transferRemoved"))
        self.manager = self.new_manager()
        self.manager.tick()
        self.assertTrue((folder / "Pack/subfolder/file.txt").exists())
        self.assertTrue(self.manager.jobs[INFO_HASH]["transferRemoved"])

    def test_extraction_is_background_and_rejects_conflicting_mutations(self):
        self.ready()
        with patch("free_downloads.threading.Thread") as worker:
            job = self.manager.extract_free_download(INFO_HASH, "Pack/archive.zip")
            self.assertEqual(job["extraction"]["state"], "extracting")
            worker.return_value.start.assert_called_once()
        for action in (lambda: self.manager.action(INFO_HASH, "delete"),
                       lambda: self.manager.extract_free_download(INFO_HASH, "Pack/archive.zip"),
                       lambda: self.manager.rename_free_download(INFO_HASH, "Pack", "Renamed"),
                       lambda: self.manager.import_free_download(INFO_HASH, "Pack", {}, Mock())):
            with self.assertRaises(ValueError):
                action()
        self.assertEqual(self.new_manager().jobs[INFO_HASH]["extraction"]["state"], "failed")

    def test_extraction_worker_publishes_nested_files_and_cleans_staging(self):
        contents = io.BytesIO()
        with zipfile.ZipFile(contents, "w") as archive:
            archive.writestr("Nested/film.mkv", b"video")
        folder = self.ready({"pack.zip": contents.getvalue()})
        with patch("free_downloads.threading.Thread") as worker:
            self.manager.extract_free_download(INFO_HASH, "pack.zip")
        invocation = worker.call_args.kwargs
        invocation["target"](*invocation["args"])
        result = self.manager.free_contents(INFO_HASH)
        self.assertEqual(result["job"]["extraction"]["state"], "complete")
        output = folder / result["job"]["extraction"]["path"]
        self.assertEqual((output / "Nested/film.mkv").read_bytes(), b"video")
        self.assertTrue((folder / "pack.zip").exists())
        self.assertFalse((self.manager.root / "extractions" / INFO_HASH).exists())


class FreeRenameTests(FreeTorrentFixture):
    def test_rename_file_and_directory_preserves_contents_and_full_path_after_restart(self):
        folder = self.ready()
        result = self.manager.rename_free_download(INFO_HASH, "Pack/subfolder/file.txt", "Capítulo ñ.txt")
        self.assertEqual(result["path"], "Pack/subfolder/Capítulo ñ.txt")
        self.assertEqual((folder / result["path"]).read_bytes(), b"hello")
        self.assertFalse((folder / "Pack/subfolder/file.txt").exists())
        self.manager.rename_free_download(INFO_HASH, "Pack/subfolder", "Temporada 1")
        listing = self.new_manager().free_contents(INFO_HASH, "Pack/Temporada 1")
        self.assertEqual(listing["fullPath"], str(folder / "Pack/Temporada 1"))
        self.assertEqual(listing["entries"][0]["path"], "Pack/Temporada 1/Capítulo ñ.txt")
        self.assertEqual((folder / listing["entries"][0]["path"]).read_bytes(), b"hello")

    def test_rename_to_same_name_and_case_only_changes_work(self):
        folder = self.ready({"film.mkv": b"video"})
        self.manager.rename_free_download(INFO_HASH, "film.mkv", "film.mkv")
        self.manager.rename_free_download(INFO_HASH, "film.mkv", "Film.mkv")
        self.assertIn("Film.mkv", [entry.name for entry in folder.iterdir()])
        self.assertEqual((folder / "Film.mkv").read_bytes(), b"video")

    def test_rename_rejects_invalid_names_root_and_existing_entries(self):
        folder = self.ready({"film.mkv": b"original", "other.mkv": b"other", "Pack/readme.txt": b"readme"})
        for name in (None, 123, "", " ", ".", "..", "../escape", "/tmp/escape", "sub/file", "sub\\file", "file:stream", "nul\0", "line\nbreak"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.manager.rename_free_download(INFO_HASH, "film.mkv", name)
        (folder / "linked-copy.mkv").hardlink_to(folder / "film.mkv")
        for name in ("other.mkv", "Pack", "linked-copy.mkv"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.manager.rename_free_download(INFO_HASH, "film.mkv", name)
        for path in ("", ".", "../", "Pack/../../", "missing"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                self.manager.rename_free_download(INFO_HASH, path, "new")
        (folder / "Empty").mkdir()
        with self.assertRaises(ValueError):
            self.manager.rename_free_download(INFO_HASH, "Pack", "Empty")
        self.assertEqual((folder / "film.mkv").read_bytes(), b"original")
        self.assertEqual((folder / "other.mkv").read_bytes(), b"other")
        self.assertEqual((folder / "Pack/readme.txt").read_bytes(), b"readme")

    def test_rename_rejects_source_and_destination_symlinks(self):
        folder = self.ready()
        outside = self.root / "outside"
        outside.mkdir()
        (outside / "file.txt").write_bytes(b"private")
        (folder / "linked").symlink_to(outside)
        (folder / "Pack/subfolder/link.txt").symlink_to(outside / "file.txt")
        (folder / "Pack/subfolder/broken.txt").symlink_to(outside / "missing")
        for path, name in (("linked/file.txt", "new.txt"), ("linked", "new"),
                           ("Pack/subfolder/link.txt", "new.txt"),
                           ("Pack/subfolder/file.txt", "link.txt"),
                           ("Pack/subfolder/file.txt", "broken.txt")):
            with self.subTest(path=path, name=name), self.assertRaises(ValueError):
                self.manager.rename_free_download(INFO_HASH, path, name)
        self.assertEqual((outside / "file.txt").read_bytes(), b"private")
        self.assertEqual((folder / "Pack/subfolder/file.txt").read_bytes(), b"hello")

    def test_rename_waits_for_engine_detach_and_rejects_incomplete_jobs(self):
        self.add()
        with self.assertRaises(ValueError):
            self.manager.rename_free_download(INFO_HASH, "Pack", "New")
        with patch.object(self.manager, "_remove_transfer"):
            folder = self.ready()
            with self.assertRaises(ValueError):
                self.manager.rename_free_download(INFO_HASH, "Pack", "New")
        self.assertTrue((folder / "Pack").is_dir())
        self.manager.rename_free_download(INFO_HASH, "Pack", "New")
        self.assertEqual((folder / "New/subfolder/file.txt").read_bytes(), b"hello")
        self.assertTrue(self.manager.jobs[INFO_HASH]["transferRemoved"])

    def test_rename_updates_extraction_location_for_nested_content(self):
        self.ready()
        self.manager._update(self.manager.jobs[INFO_HASH], extraction={"state": "complete", "path": "Pack/subfolder"})
        self.manager.rename_free_download(INFO_HASH, "Pack", "New pack")
        self.assertEqual(self.new_manager().jobs[INFO_HASH]["extraction"]["path"], "New pack/subfolder")


class FreeImportApiTests(FreeTorrentFixture):
    def setUp(self):
        super().setUp()
        for name in ("Movies", "TVShows"):
            (self.root / name).mkdir()
        for key, value in {"VIDEOS_DIR": str(self.root), "MOVIES_DIR": str(self.root / "Movies"),
                           "TVSHOWS_DIR": str(self.root / "TVShows"), "MEDIA_LIBRARY_PATH": str(self.root / "library.json"),
                           "LEGACY_MOVIE_LIBRARY_PATH": str(self.root / "legacy.json")}.items():
            patched = patch.object(api, key, value); patched.start(); self.addCleanup(patched.stop)
        for key, value in {"is_authorized_request": True, "get_movie_torrents": self.manager,
                           "ensure_media_directories": None, "queue_tmdb_artwork": None}.items():
            patched = patch.object(api, key, return_value=value); patched.start(); self.addCleanup(patched.stop)
        self.client = api.app.test_client()

    def import_selection(self, path, media_type="movies", **options):
        return self.client.post(f"/torrents/{INFO_HASH}/contents", json={"action": "import", "path": path,
                                "mediaType": media_type, "media": {"id": 123, "name": "Test title"}, **options})

    def test_hidden_cancelled_record_absent_from_list_no_longer_blocks_free_start(self):
        self.manager.add({"infoHash": INFO_HASH, "movie": {"id": 123, "name": "Old title"}})
        self.manager._update(self.manager.jobs[INFO_HASH], state="cancelled")
        # Removing history while the engine is offline retains a hidden cleanup record.
        with patch.object(self.rpc, "call", side_effect=TorrentError("offline")):
            self.manager.action(INFO_HASH, "remove")
        self.assertEqual(self.client.get("/torrents").json["jobs"], [])
        payload = {"infoHash": INFO_HASH, "mediaType": "generic", "name": "Free files"}
        with patch.object(self.rpc, "call", side_effect=TorrentError("offline")):
            response = self.client.post("/torrents", json=payload)
        self.assertEqual(response.status_code, 503)
        self.assertIn("sigue finalizando", response.json["error"])
        response = self.client.post("/torrents", json=payload)
        self.assertEqual(response.status_code, 202, response.json)
        self.assertEqual(response.json["job"]["state"], "queued")
        jobs = self.client.get("/torrents").json["jobs"]
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["mediaType"], "generic")
        self.manager.tick()
        self.assertEqual(len(self.new_manager().snapshot()["jobs"]), 1)

    def test_movie_import_moves_only_selected_video_and_delete_keeps_library_copy(self):
        folder = self.ready({"Pack/film.mkv": b"video", "Pack/readme.txt": b"readme"})
        response = self.import_selection("Pack")
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json["movedFiles"], 1)
        target = self.root / response.json["item"]["relativePath"]
        self.assertEqual(target.read_bytes(), b"video")
        self.assertFalse((folder / "Pack/film.mkv").exists())
        self.assertTrue((folder / "Pack/readme.txt").exists())
        self.manager.action(INFO_HASH, "delete")
        self.assertEqual(target.read_bytes(), b"video")

    def test_series_import_recurses_and_keeps_duplicate_episodes_in_download(self):
        folder = self.ready({"Show/Season 1/S01E01.mkv": b"one", "Show/Season 2/S02E01.avi": b"two"})
        response = self.import_selection("Show", "series")
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json["movedFiles"], 2)
        self.assertEqual(set(response.json["item"]["importedEpisodeIds"]), {"S01E01", "S02E01"})
        (folder / "S01E01.mkv").write_bytes(b"different version")
        response = self.import_selection("S01E01.mkv", "series")
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json["movedFiles"], 0)
        self.assertTrue((folder / "S01E01.mkv").exists())

    def test_failed_catalog_save_preserves_source(self):
        folder = self.ready({"film.mkv": b"original"})
        with patch.object(api, "save_media_library", side_effect=OSError("disk full")), self.assertLogs(api.app.logger, level="ERROR"):
            response = self.import_selection("film.mkv")
        self.assertEqual(response.status_code, 503)
        self.assertEqual((folder / "film.mkv").read_bytes(), b"original")
        self.assertFalse(list((self.root / "Movies").glob("*.mkv")))

    def test_movie_replacement_requires_boolean_confirmation(self):
        folder = self.ready({"film.mkv": b"first"})
        response = self.import_selection("film.mkv")
        self.assertEqual(response.status_code, 200)
        (folder / "film.mkv").write_bytes(b"replacement")
        for value in (False, "true"):
            response = self.import_selection("film.mkv", overwriteExisting=value)
            self.assertEqual(response.status_code, 409)
            self.assertEqual(response.json["code"], "MOVIE_ALREADY_DOWNLOADED")
        response = self.import_selection("film.mkv", overwriteExisting=True)
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual((self.root / response.json["item"]["relativePath"]).read_bytes(), b"replacement")

    def test_contents_routes_require_pin_and_validate_requests(self):
        self.ready()
        endpoint = f"/torrents/{INFO_HASH}/contents"
        with patch.object(api, "is_authorized_request", return_value=False):
            self.assertEqual(self.client.get(endpoint).status_code, 401)
            for action in ("extract", "import", "rename"):
                self.assertEqual(self.client.post(endpoint, json={"action": action}).status_code, 401)
        self.assertEqual(self.client.get(endpoint + "?path=../").status_code, 400)
        self.assertEqual(self.client.post(endpoint, json=[]).status_code, 400)
        self.assertEqual(self.client.post(endpoint, json={"action": "oops"}).status_code, 400)
        self.assertEqual(self.client.get("/torrents/missing/contents").status_code, 404)

    def test_rename_api_refreshes_listing_and_allows_import_with_new_name(self):
        folder = self.ready({"Pack/film.mkv": b"video", "Pack/other.mkv": b"other"})
        endpoint = f"/torrents/{INFO_HASH}/contents"
        response = self.client.post(endpoint, json={"action": "rename", "path": "Pack/film.mkv", "name": "Película.mkv"})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json["path"], "Pack/Película.mkv")
        listing = self.client.get(endpoint, query_string={"path": "Pack"}).json
        self.assertEqual(listing["fullPath"], str(folder / "Pack"))
        self.assertIn("Película.mkv", [entry["name"] for entry in listing["entries"]])
        response = self.client.post(endpoint, json={"action": "rename", "path": "Pack/Película.mkv", "name": "other.mkv"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("Ya existe", response.json["error"])
        self.assertEqual(self.client.post(endpoint, json={"action": "rename", "path": "Pack/Película.mkv"}).status_code, 400)
        self.assertEqual(self.import_selection("Pack/Película.mkv").status_code, 200)
        self.assertEqual((folder / "Pack/other.mkv").read_bytes(), b"other")


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()

    def test_zip_and_tar_extract_nested_files_keep_archive_and_avoid_overwrites(self):
        for extension in ("zip", "tar.gz"):
            archive = self.root / ("content." + extension)
            if extension == "zip":
                with zipfile.ZipFile(archive, "w") as handle:
                    handle.writestr("nested/folder/hello.txt", b"hello")
            else:
                with tarfile.open(archive, "w:gz") as handle:
                    info = tarfile.TarInfo("nested/folder/hello.txt")
                    info.size = 5
                    handle.addfile(info, io.BytesIO(b"hello"))
            output = extract_archive(archive)
            self.assertEqual((output / "nested/folder/hello.txt").read_bytes(), b"hello")
            self.assertTrue(archive.exists())
            self.assertNotEqual(output, extract_archive(archive))

    def test_traversal_symlinks_and_hardlinks_leave_no_partial_output(self):
        for name, kind in (("../escape", "file"), ("/absolute", "file"), ("linked", "symlink"), ("hard", "hardlink")):
            archive = self.root / "bad.tar"
            with tarfile.open(archive, "w") as handle:
                info = tarfile.TarInfo(name)
                if kind != "file":
                    info.type = tarfile.SYMTYPE if kind == "symlink" else tarfile.LNKTYPE
                    info.linkname = "../../escape"
                handle.addfile(info)
            with self.subTest(name=name), self.assertRaises(ValueError):
                extract_archive(archive)
            self.assertEqual(list(self.root.iterdir()), [archive])

    def test_zip_symlinks_and_space_limits_are_rejected(self):
        archive = self.root / "bad.zip"
        with zipfile.ZipFile(archive, "w") as handle:
            info = zipfile.ZipInfo("linked")
            info.create_system = 3
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            handle.writestr(info, "../outside")
        with self.assertRaises(ValueError):
            extract_archive(archive)
        with zipfile.ZipFile(archive, "w") as handle:
            handle.writestr("large.txt", b"test")
        with patch("safe_archive.MAX_BYTES", 1), self.assertRaises(ValueError):
            extract_archive(archive)
        self.assertEqual(list(self.root.iterdir()), [archive])


class FreeSearchTests(unittest.TestCase):
    def test_generic_search_accepts_non_media_categories_without_weakening_other_searches(self):
        row = {"info_hash": INFO_HASH, "category": "400", "size": 100, "name": "Dataset", "seeders": 8}
        self.assertEqual(len(normalize_results([row], "generic")), 1)
        self.assertEqual(normalize_results([row], "movies"), [])
        payload = {"hits": [{"hash": INFO_HASH, "bytes": 100, "title": "Dataset", "categoryId": [1000000]}]}
        self.assertEqual(len(normalize_knaben_results(payload, "generic")), 1)
        self.assertEqual(normalize_knaben_results(payload, "series"), [])
        xml = f'<rss><channel><item><title>Dataset</title><size>100</size><category>1000</category><attr name="infohash" value="{INFO_HASH}"/></item></channel></rss>'.encode()
        self.assertEqual(len(normalize_torznab_results(xml, "Source", "generic")), 1)
        self.assertEqual(normalize_torznab_results(xml, "Source", "books"), [])
        with patch("torrent_downloads.search_pirate_bay", return_value=[]) as pirate, patch("torrent_downloads.search_knaben", return_value=[]) as knaben:
            result = search_torrents("Dataset-free-test", "generic")
            self.assertEqual(result["results"], [])
            pirate.assert_called_once_with("Dataset-free-test", "generic")
            knaben.assert_called_once_with("Dataset-free-test", "generic")


if __name__ == "__main__":
    unittest.main()
