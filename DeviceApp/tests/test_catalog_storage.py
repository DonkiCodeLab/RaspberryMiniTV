import copy
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import catalog_store
import control_api as api


class CatalogStorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = self.root / "media_library.json"
        for name, value in {
            "MEDIA_LIBRARY_PATH": str(self.path),
            "MULTIMEDIA_DIR": str(self.root),
            "LEGACY_MOVIE_LIBRARY_PATH": str(self.root / "movie_library.json"),
            "GAMES_DIR": str(self.root / "Games"),
            "scanned_media_paths": {},
        }.items():
            mocked = patch.object(api, name, value)
            mocked.start()
            self.addCleanup(mocked.stop)
        for name in ("ensure_media_directories", "queue_tmdb_artwork"):
            mocked = patch.object(api, name)
            mocked.start()
            self.addCleanup(mocked.stop)
        self.library = api.empty_media_library()
        self.library["movies"]["Movies/alien.mp4"] = {
            "relativePath": "Movies/alien.mp4", "tmdbId": 348,
            "name": "Alien: mi título", "heroImage": "custom.jpg",
            "heroImageCrop": {"zoom": 2},
        }
        self.library["series"]["TVShows/test"] = {"tmdbId": 100, "name": "Mi serie"}
        self.path.write_text(json.dumps(self.library))

    def test_corrupt_catalog_is_never_loaded_or_saved_as_empty(self):
        for damaged in ('', '{"movies":', '[]', '{"movies": []}'):
            with self.subTest(damaged=damaged):
                self.path.write_text(damaged)
                with self.assertRaises(catalog_store.CatalogError):
                    api.load_media_library()
                with self.assertRaises(catalog_store.CatalogError):
                    api.upsert_series_metadata("TVShows/new", {"tmdbId": 200})
                with self.assertRaises(catalog_store.CatalogError):
                    api.save_media_library(self.library)
                self.assertEqual(self.path.read_text(), damaged)

    def test_listing_preserves_catalog_bytes_and_custom_profiles(self):
        original = self.path.read_bytes()
        with patch.object(api, "save_media_library", side_effect=AssertionError("read-only")):
            scanned = api.sync_scanned_media_library(
                [{"relativePath": "TVShows/test", "name": "test", "videos": [{"id": "S01E01"}], "episodeIds": ["S01E01"]}],
                [], [{"relativePath": "Movies/alien.mp4", "file": "alien.mp4"},
                     {"relativePath": "Movies/new.mp4", "file": "new.mp4"}],
            )
        self.assertEqual(scanned["movies"]["Movies/alien.mp4"]["name"], "Alien: mi título")
        self.assertEqual(scanned["series"]["TVShows/test"]["tmdbId"], 100)
        self.assertEqual(scanned["series"]["TVShows/test"]["episodeIds"], ["S01E01"])
        self.assertIn("Movies/new.mp4", scanned["movies"])
        self.assertEqual(self.path.read_bytes(), original)
        self.assertEqual(api.tmdb_missing_ids(), ["Movies/new.mp4"])

    def test_atomic_write_keeps_last_catalog_when_publish_fails(self):
        previous = self.path.read_bytes()
        updated = copy.deepcopy(self.library)
        updated["series"]["TVShows/new"] = {"tmdbId": 200}
        replace = catalog_store.os.replace
        def fail_catalog(source, target):
            if Path(target) == self.path:
                self.assertEqual(api.load_media_library(), self.library)
                raise OSError("simulated full disk")
            return replace(source, target)
        with patch.object(catalog_store.os, "replace", side_effect=fail_catalog):
            with self.assertRaises(OSError):
                api.save_media_library(updated)
        self.assertEqual(self.path.read_bytes(), previous)
        self.assertFalse(list(self.root.glob(".media_library.json-*")))

    def test_overlapping_uploads_and_edits_keep_all_changes(self):
        first_loaded, second_started, release_first = (threading.Event() for _ in range(3))
        real_load = api.load_media_library
        def slow_load():
            library = real_load()
            if threading.current_thread().name == "first":
                first_loaded.set()
                self.assertTrue(release_first.wait(5))
            return library
        def upload():
            threading.current_thread().name = "first"
            return api.upsert_movie_metadata("Movies/new.mp4", "New", 123)
        def edit():
            second_started.set()
            return api.upsert_media_profile("series", "TVShows/test", {"name": "Renamed"})
        with patch.object(api, "load_media_library", side_effect=slow_load), ThreadPoolExecutor(2) as pool:
            first = pool.submit(upload)
            self.assertTrue(first_loaded.wait(5))
            second = pool.submit(edit)
            self.assertTrue(second_started.wait(5))
            release_first.set()
            first.result(timeout=5)
            second.result(timeout=5)
        saved = api.load_media_library()
        self.assertEqual(saved["movies"]["Movies/new.mp4"]["tmdbId"], 123)
        self.assertEqual(saved["series"]["TVShows/test"]["name"], "Renamed")
        self.assertEqual(saved["movies"]["Movies/alien.mp4"]["heroImage"], "custom.jpg")

    def test_change_backs_up_old_and_new_values_and_noop_does_not_rewrite(self):
        api.upsert_media_profile("movies", "Movies/alien.mp4", {"name": "Edited"})
        saved = api.load_media_library()
        backups = [json.loads(path.read_text()) for path in (self.root / "Recovery").glob("*.json")]
        self.assertIn(self.library, backups)
        self.assertIn(saved, backups)
        before = self.path.stat().st_mtime_ns
        api.save_media_library(saved)
        self.assertEqual(self.path.stat().st_mtime_ns, before)
        self.assertEqual(len(list((self.root / "Recovery").glob("*.json"))), 2)

    def test_movie_reassociation_preserves_custom_artwork(self):
        api.upsert_movie_metadata("Movies/alien.mp4", "Alien", 348)
        saved = api.load_media_library()["movies"]["Movies/alien.mp4"]
        self.assertEqual(saved["heroImage"], "custom.jpg")
        self.assertEqual(saved["heroImageCrop"], {"zoom": 2})

    def test_empty_current_catalog_does_not_resurrect_legacy_movies(self):
        self.path.write_text(json.dumps(api.empty_media_library()))
        Path(api.LEGACY_MOVIE_LIBRARY_PATH).write_text(json.dumps(self.library["movies"]))
        self.assertEqual(api.load_media_library()["movies"], {})
        self.path.unlink()
        self.assertEqual(api.load_media_library()["movies"], self.library["movies"])

    def test_replacement_preserves_file_permissions_and_owner(self):
        self.path.chmod(0o640)
        before = self.path.stat()
        api.upsert_media_profile("movies", "Movies/alien.mp4", {"name": "Edited"})
        after = self.path.stat()
        self.assertEqual(after.st_mode, before.st_mode)
        self.assertEqual((after.st_uid, after.st_gid), (before.st_uid, before.st_gid))

    def test_separate_processes_do_not_lose_catalog_updates(self):
        script = """
import catalog_store, sys, time
for index in range(5):
    with catalog_store.transaction(sys.argv[1]):
        data = catalog_store.read(sys.argv[1])
        time.sleep(0.003)
        data['movies'][f'Movies/{sys.argv[2]}-{index}.mp4'] = {'tmdbId': index + 1}
        catalog_store.save(sys.argv[1], data)
"""
        env = {**os.environ, "PYTHONPATH": str(Path(api.__file__).parent), "PYTHONDONTWRITEBYTECODE": "1"}
        processes = [subprocess.Popen([sys.executable, "-c", script, str(self.path), str(index)], env=env)
                     for index in range(3)]
        for process in processes:
            self.assertEqual(process.wait(timeout=15), 0)
        saved = api.load_media_library()
        self.assertEqual(len(saved["movies"]), 16)
        self.assertEqual(saved["series"], self.library["series"])

    def test_corruption_is_reported_by_api_without_modifying_catalog(self):
        self.path.write_text('{"movies":')
        with patch.object(api, "is_authorized_request", return_value=True):
            response = api.app.test_client().get('/tmdb/library')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json['code'], 'CATALOG_STORAGE_ERROR')
        self.assertEqual(self.path.read_text(), '{"movies":')

    def test_browser_backup_preserves_series_profiles_without_changing_catalog(self):
        before = self.path.read_bytes()
        payload = {'library': [], 'profiles': {}, 'seriesProfiles': {'TVShows/test': {'heroImage': 'custom.jpg'}}}
        with patch.object(api, 'is_authorized_request', return_value=True):
            client = api.app.test_client()
            first = client.post('/movies/browser-backup', json=payload)
            second = client.post('/movies/browser-backup', json=payload)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json['backup'], second.json['backup'])
        self.assertEqual(json.loads((self.root / 'Recovery' / first.json['backup']).read_text()), payload)
        self.assertEqual(self.path.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
