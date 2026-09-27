import copy
import json
import os
import sqlite3
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

    def test_sqlite_failure_rolls_back_all_changes_and_history(self):
        before = api.load_media_library()
        original = catalog_store._write_diff
        def fail_after_writes(*args, **kwargs):
            original(*args, **kwargs)
            raise sqlite3.OperationalError("simulated full disk")
        with patch.object(catalog_store, "_write_diff", side_effect=fail_after_writes):
            with self.assertRaises(catalog_store.CatalogError):
                api.upsert_media_profile("movies", "Movies/alien.mp4", {"name": "Edited"})
        self.assertEqual(api.load_media_library(), before)
        self.assertEqual(api.load_media_library().revision, before.revision)
        with sqlite3.connect(catalog_store.database_path(self.path)) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM catalog_changes").fetchone()[0], 0)

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
        database = catalog_store.database_path(self.path)
        before = database.stat().st_mtime_ns
        api.save_media_library(saved)
        self.assertEqual(database.stat().st_mtime_ns, before)
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
        self.assertEqual(api.load_media_library()["movies"], {})

    def test_replacement_preserves_file_permissions_and_owner(self):
        self.path.chmod(0o640)
        before = self.path.stat()
        api.upsert_media_profile("movies", "Movies/alien.mp4", {"name": "Edited"})
        after = catalog_store.database_path(self.path).stat()
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

    def test_migration_preserves_every_field_and_separates_episode_rows(self):
        self.library["customRoot"] = {"extra": [1, "é"]}
        self.library["movies"]["Movies/duplicate.mp4"] = {"tmdbId": 348, "extra": {"unknown": True}}
        self.library["series"]["TVShows/test"]["episodes"] = [
            {"id": "S01E01", "relativePath": "TVShows/test/1.mp4", "extra": "á"},
            {"id": "S01E02", "relativePath": "TVShows/test/2.mp4"},
        ]
        self.library["series"]["TVShows/test"]["episodeIds"] = ["S01E01", "S01E02"]
        self.library["games"]["Games/test.chd"] = {"platform": "psx"}
        self.library["books"]["Books/a.pdf"] = {"name": "Libro", "collectionId": "shelf"}
        self.library["bookCollections"]["shelf"] = {"name": "Estante"}
        self.path.write_text(json.dumps(self.library))
        before = self.path.read_bytes()
        self.assertEqual(api.load_media_library(), self.library)
        self.assertEqual(self.path.read_bytes(), before)
        with sqlite3.connect(catalog_store.database_path(self.path)) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM episodes").fetchone()[0], 2)
            payload = db.execute("SELECT payload FROM media_items WHERE collection='series'").fetchone()[0]
            self.assertNotIn('episodes', json.loads(payload))
        self.assertEqual(catalog_store.check(self.path)["integrity"], "ok")

    def test_json_is_never_reimported_after_migration(self):
        self.assertEqual(api.load_media_library(), self.library)
        self.path.write_text('{"movies":')
        self.assertEqual(api.load_media_library(), self.library)
        self.path.unlink()
        self.assertEqual(api.load_media_library(), self.library)

    def test_missing_or_corrupt_database_never_falls_back_to_json(self):
        api.load_media_library()
        database = catalog_store.database_path(self.path)
        database.unlink()
        with self.assertRaises(catalog_store.CatalogError):
            api.load_media_library()
        self.assertFalse(database.exists())
        database.write_bytes(b'corrupt sqlite file')
        with self.assertRaises(catalog_store.CatalogError):
            api.load_media_library()
        self.assertEqual(database.read_bytes(), b'corrupt sqlite file')

    def test_migration_failure_leaves_original_and_can_be_retried(self):
        before = self.path.read_bytes()
        original = catalog_store.os.replace
        def fail_publish(source, target):
            if Path(target) == catalog_store.database_path(self.path):
                raise OSError("simulated full disk")
            return original(source, target)
        with patch.object(catalog_store.os, "replace", side_effect=fail_publish):
            with self.assertRaises(catalog_store.CatalogError):
                api.load_media_library()
        self.assertEqual(self.path.read_bytes(), before)
        self.assertFalse(catalog_store.database_path(self.path).exists())
        self.assertEqual(api.load_media_library(), self.library)

    def test_legacy_movie_catalog_migrates_when_current_catalog_never_existed(self):
        self.path.unlink()
        Path(api.LEGACY_MOVIE_LIBRARY_PATH).write_text(json.dumps(self.library["movies"]))
        self.assertEqual(api.load_media_library()["movies"], self.library["movies"])
        self.assertTrue(catalog_store.database_path(self.path).exists())

    def test_old_snapshot_is_rejected_without_losing_newer_edit(self):
        old = api.load_media_library()
        api.upsert_media_profile("movies", "Movies/alien.mp4", {"name": "Latest"})
        old["series"]["TVShows/test"]["name"] = "Stale"
        with self.assertRaises(catalog_store.CatalogError):
            api.save_media_library(old)
        current = api.load_media_library()
        self.assertEqual(current["movies"]["Movies/alien.mp4"]["name"], "Latest")
        self.assertEqual(current["series"]["TVShows/test"]["name"], "Mi serie")

    def test_single_edit_only_changes_its_row_and_records_history(self):
        api.load_media_library()
        with sqlite3.connect(catalog_store.database_path(self.path)) as db:
            db.execute("""CREATE TRIGGER protect_series BEFORE UPDATE ON media_items
                WHEN OLD.collection='series' BEGIN SELECT RAISE(ABORT,'unrelated row changed'); END""")
        api.upsert_media_profile("movies", "Movies/alien.mp4", {"name": "Edited"})
        with sqlite3.connect(catalog_store.database_path(self.path)) as db:
            rows = db.execute("SELECT collection,item_key,before_json,after_json FROM catalog_changes").fetchall()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][:2], ("movies", "Movies/alien.mp4"))
        self.assertEqual(json.loads(rows[0][2])["name"], "Alien: mi título")
        self.assertEqual(json.loads(rows[0][3])["name"], "Edited")

    def test_nested_transaction_rolls_back_all_edits_on_application_error(self):
        before = api.load_media_library()
        with self.assertRaises(RuntimeError):
            with catalog_store.transaction(self.path):
                api.upsert_media_profile("movies", "Movies/alien.mp4", {"name": "Edited"})
                api.upsert_series_metadata("TVShows/new", {"tmdbId": 200})
                raise RuntimeError("cancel operation")
        self.assertEqual(api.load_media_library(), before)

    def test_killed_writer_recovers_committed_catalog(self):
        before = api.load_media_library()
        script = """
import catalog_store, os, sys
with catalog_store.transaction(sys.argv[1]):
    data = catalog_store.read(sys.argv[1])
    data['movies']['Movies/crash.mp4'] = {'tmdbId': 1}
    catalog_store.save(sys.argv[1], data)
    # Force dirty pages to disk so the test exercises hot-journal recovery.
    connection = catalog_store._connections()[str(catalog_store.database_path(sys.argv[1]))]
    connection.execute('PRAGMA cache_size=1')
    connection.execute('CREATE TABLE crash_pages(payload BLOB)')
    connection.execute('INSERT INTO crash_pages VALUES(zeroblob(1048576))')
    os._exit(9)
"""
        env = {**os.environ, "PYTHONPATH": str(Path(api.__file__).parent), "PYTHONDONTWRITEBYTECODE": "1"}
        result = subprocess.run([sys.executable, "-c", script, str(self.path)], env=env, timeout=15)
        self.assertEqual(result.returncode, 9)
        self.assertEqual(api.load_media_library(), before)
        self.assertEqual(catalog_store.check(self.path)["integrity"], "ok")

    def test_backup_and_json_export_round_trip(self):
        api.upsert_media_profile("movies", "Movies/alien.mp4", {"name": "Edited"})
        current = api.load_media_library()
        export = self.root / 'export.json'
        backup = self.root / 'backup.sqlite3'
        catalog_store.export_json(self.path, export)
        catalog_store.backup(self.path, backup)
        self.assertEqual(json.loads(export.read_text()), current)
        self.assertEqual(catalog_store.read(backup), current)
        # Reimport the export in isolation, as a rollback/recovery would do.
        self.assertEqual(catalog_store.read(export), current)
        with self.assertRaises(catalog_store.CatalogError):
            catalog_store.export_json(self.path, export)
        with self.assertRaises(catalog_store.CatalogError):
            catalog_store.backup(self.path, backup)

    def test_series_episode_update_delete_and_foreign_keys(self):
        api.upsert_series_metadata("TVShows/test", {"episodes": [{"id": "S01E01"}, {"id": "S01E02"}]})
        api.upsert_series_metadata("TVShows/test", {"episodes": [{"id": "S01E01", "title": "Edited"}]})
        self.assertEqual(catalog_store.check(self.path)["episodes"], 1)
        with sqlite3.connect(catalog_store.database_path(self.path)) as db:
            db.execute('PRAGMA foreign_keys=ON')
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("INSERT INTO episodes(series_key,position,payload) VALUES('missing',0,'{}')")
        with patch.object(api, 'tmdb_artwork'):
            api.remove_series_metadata('TVShows/test')
        self.assertEqual(catalog_store.check(self.path)["episodes"], 0)

    def test_upload_preserves_unrelated_movie_fields(self):
        self.library['movies']['Movies/alien.mp4']['futureField'] = {'value': 42}
        self.path.write_text(json.dumps(self.library))
        api.upsert_movie_metadata('Movies/new.mp4', 'New', 123)
        self.assertEqual(api.load_media_library()['movies']['Movies/alien.mp4'], self.library['movies']['Movies/alien.mp4'])

    def test_handled_nested_failure_rolls_back_its_writes(self):
        api.load_media_library()
        with catalog_store.transaction(self.path):
            try:
                with catalog_store.transaction(self.path):
                    api.upsert_series_metadata('TVShows/cancelled', {'tmdbId': 200})
                    raise RuntimeError('cancel nested operation')
            except RuntimeError:
                pass
            api.upsert_media_profile('movies', 'Movies/alien.mp4', {'name': 'Committed'})
        current = api.load_media_library()
        self.assertNotIn('TVShows/cancelled', current['series'])
        self.assertEqual(current['movies']['Movies/alien.mp4']['name'], 'Committed')

    def test_read_item_returns_only_requested_entry_and_unknown_is_none(self):
        self.assertEqual(catalog_store.read_item(self.path, 'movies', 'Movies/alien.mp4'),
                         self.library['movies']['Movies/alien.mp4'])
        self.assertIsNone(catalog_store.read_item(self.path, 'games', 'missing'))
        api.upsert_series_metadata('TVShows/test', {'episodes': [{'id': 'S01E01'}]})
        self.assertEqual(catalog_store.read_item(self.path, 'series', 'TVShows/test')['episodes'], [{'id': 'S01E01'}])

    def test_corrupt_database_api_reports_503_without_restoring_json(self):
        api.load_media_library()
        database = catalog_store.database_path(self.path)
        database.write_bytes(b'broken database')
        with patch.object(api, 'is_authorized_request', return_value=True):
            response = api.app.test_client().get('/tmdb/library')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json['code'], 'CATALOG_STORAGE_ERROR')
        self.assertEqual(database.read_bytes(), b'broken database')


if __name__ == "__main__":
    unittest.main()
