import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tmdb_cache import TmdbCache, LANGUAGES, TmdbError
import control_api as api


class TmdbCacheTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.cache = TmdbCache(self.temp.name, lambda: {"apiKey": "test-secret"})

    def test_metadata_and_images_survive_restart_without_network_or_credentials(self):
        with patch.object(self.cache, '_download', return_value=(b'{"id":1}', 'application/json')) as download:
            self.cache.json('/movie/1', {'language': 'es-ES'})
            self.cache.json('/movie/1', {'language': 'es-ES'})
            self.assertEqual(download.call_count, 1)
        with patch.object(self.cache, '_download', return_value=(b'image-data', 'image/jpeg')) as download:
            self.cache.image('/poster.jpg')
            self.cache.image('/poster.jpg')
            self.assertEqual(download.call_count, 1)
        reopened = TmdbCache(self.temp.name, lambda: {})
        with patch.object(reopened, '_download', side_effect=AssertionError('offline')):
            self.assertEqual(reopened.json('/movie/1', {'language': 'es-ES'}), {'id': 1})
            self.assertEqual(reopened.image('/poster.jpg').read_bytes(), b'image-data')
        self.assertNotIn('test-secret', ''.join(p.read_text() for p in Path(self.temp.name).rglob('*.json')))

    def test_movie_links_are_prepared_once_and_read_offline_after_restart(self):
        movie = {"id": 1, "title": "Prueba", "original_title": "Test", "release_date": "2000-01-01",
                 "external_ids": {"wikidata_id": "Q123"}}
        raw = json.dumps(movie).encode()
        with patch.object(self.cache, '_download', return_value=(raw, 'application/json')), \
                patch.object(self.cache, '_rotten_tomatoes_lookup', return_value='https://www.rottentomatoes.com/m/test') as lookup:
            # Reading an existing library never performs link lookups.
            first = self.cache.json('/movie/1', {'language': 'es-ES'})
            self.assertIn('/search/', first['rottenTomatoesUrl'])
            lookup.assert_not_called()
            with patch.object(self.cache, 'image'):
                self.cache.warm('movie', 1)
                self.cache.warm('movie', 1)
            self.assertEqual(lookup.call_count, 1)
        reopened = TmdbCache(self.temp.name, lambda: {})
        with patch.object(reopened, '_download', side_effect=AssertionError('offline')), \
                patch.object(reopened, '_rotten_tomatoes_lookup', side_effect=AssertionError('offline')):
            for language in LANGUAGES:
                result = reopened.json('/movie/1', {'language': language, 'append_to_response': 'external_ids'})
                self.assertEqual(result['rottenTomatoesUrl'], 'https://www.rottentomatoes.com/m/test')

    def test_movie_link_fallback_is_persistent_and_explicit_refresh_retries(self):
        movie = {'title': 'Test', 'external_ids': {'wikidata_id': 'Q123'}}
        with patch.object(self.cache, '_rotten_tomatoes_lookup', side_effect=OSError('offline')) as lookup:
            first = self.cache._with_movie_links('/movie/1', movie, lookup=True)
            self.cache._with_movie_links('/movie/1', movie, lookup=True)
            self.assertEqual(lookup.call_count, 1)
            self.assertIn('/search/', first['rottenTomatoesUrl'])
        with patch.object(self.cache, '_rotten_tomatoes_lookup', return_value='https://www.rottentomatoes.com/m/test') as lookup:
            updated = self.cache._with_movie_links('/movie/1', movie, lookup=True, refresh=True)
            self.assertEqual(updated['rottenTomatoesUrl'], 'https://www.rottentomatoes.com/m/test')
            self.assertEqual(lookup.call_count, 1)

    def test_library_summary_is_compact_and_never_downloads(self):
        movie = {'id': 1, 'title': 'Test', 'poster_path': '/poster.jpg',
                 'overview': 'Long details', 'external_ids': {}, 'genres': [{'name': 'Drama'}]}
        with patch.object(self.cache, '_download', return_value=(json.dumps(movie).encode(), 'application/json')):
            self.cache.json('/movie/1', {'language': 'es-ES', 'append_to_response': 'external_ids'})
        with patch.object(self.cache, '_download', side_effect=AssertionError('offline')):
            card = self.cache.library_summary('movie', 1, 'es-ES')
            self.assertEqual(card['posterPath'], '/poster.jpg')
            self.assertEqual(card['genres'], ['Drama'])
            self.assertNotIn('overview', card)
            self.assertNotIn('external_ids', card)
            self.assertEqual(self.cache.library_summary('movie', 999, 'es-ES'), {'id': 999})
        with patch.object(api, 'tmdb_artwork', self.cache), patch.object(api, 'is_authorized_request', return_value=True), \
                patch.object(api, 'load_media_library', return_value={'movies': {'Movies/a.mp4': {'tmdbId': 1}}, 'series': {}}):
            response = api.app.test_client().get('/tmdb/library?language=es-ES')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json['movies']['1']['name'], 'Test')
            self.assertEqual(response.json['series'], {})

    def test_display_thumbnail_preserves_original_and_is_reused_offline(self):
        from PIL import Image
        source = self.cache.root / 'images' / 'poster.jpg'
        source.parent.mkdir(parents=True)
        Image.new('RGB', (2000, 3000), '#ffd429').save(source, 'JPEG')
        original = source.read_bytes()
        with patch.object(self.cache, '_download', side_effect=AssertionError('offline')):
            thumbnail = self.cache.display_image('/poster.jpg', 500)
            with Image.open(thumbnail) as image:
                self.assertEqual(image.size, (500, 750))
                self.assertEqual(image.format, 'WEBP')
            self.assertLess(thumbnail.stat().st_size, source.stat().st_size)
            self.assertEqual(source.read_bytes(), original)
            reopened = TmdbCache(self.temp.name, lambda: {})
            with patch('PIL.Image.open', side_effect=AssertionError('must reuse thumbnail')):
                self.assertEqual(reopened.display_image('/poster.jpg', 500), thumbnail)
            with self.assertRaises(ValueError): self.cache.display_image('/poster.jpg', 99999)
            with self.assertRaises(ValueError): self.cache.display_image('/../secret.jpg', 500)

    def test_failed_download_is_not_cached_and_can_be_retried(self):
        with patch.object(self.cache, '_download', return_value=(b'not image', 'text/html')):
            with self.assertRaises(ValueError): self.cache.image('/poster.jpg')
        self.assertFalse((Path(self.temp.name) / 'images/poster.jpg').exists())
        with patch.object(self.cache, '_download', return_value=(b'ok', 'image/jpeg')):
            self.assertTrue(self.cache.image('/poster.jpg').exists())

    def test_rejects_arbitrary_upstreams_and_traversal(self):
        for path in ['/../../secret.jpg', '//evil.com/a.jpg', '/a.jpg?x=y', '/a/b.jpg']:
            with self.assertRaises(ValueError): self.cache.image(path)
        for path in ['/configuration', '//evil.com', '/movie/1/../../account']:
            with self.assertRaises(ValueError): self.cache.json(path)

    def test_image_signature_fallback_when_cdn_omits_content_type(self):
        for path, raw in [('/photo.jpg', b'\xff\xd8\xff\xe0JPEG'),
                          ('/logo.png', b'\x89PNG\r\n\x1a\nPNG'),
                          ('/art.webp', b'RIFF\x04\x00\x00\x00WEBP')]:
            with self.subTest(path=path), patch.object(self.cache, '_download', return_value=(raw, 'text/plain')):
                self.assertEqual(self.cache.image(path).read_bytes(), raw)
        for raw in (b'<html>Error</html>', b'{"error":"unavailable"}', b'RIFF', b'\x89PNG\r\n\x1a\n'):
            with self.subTest(raw=raw), patch.object(self.cache, '_download', return_value=(raw, 'text/plain')):
                with self.assertRaises(ValueError):
                    self.cache.image('/invalid.jpg')
                self.assertFalse((self.cache.root / 'images/invalid.jpg').exists())

    def test_warm_includes_all_languages_seasons_episodes_and_image_variants(self):
        paths = []
        def fetch(path, params=None, refresh=False):
            paths.append((path, params))
            if path == '/tv/1': return {'seasons': [{'season_number': 0}, {'season_number': 1}], 'backdrop_path': '/back.jpg', 'networks': [{'logo_path': '/logo.png'}]}
            if path.endswith('/images'): return {'posters': [{'file_path': '/variant.jpg'}], 'stills': [{'file_path': '/still2.jpg'}]}
            return {'episodes': [{'episode_number': 1, 'still_path': '/still.jpg'}], 'poster_path': '/season.jpg'}
        with patch.object(self.cache, 'json', side_effect=fetch), patch.object(self.cache, 'image') as images:
            self.cache.warm('tv', 1)
        self.assertEqual({call.args[0] for call in images.call_args_list}, {'/back.jpg', '/logo.png', '/variant.jpg', '/still2.jpg', '/still.jpg', '/season.jpg'})
        for language in LANGUAGES:
            self.assertIn(('/tv/1/season/1', {'language': language}), paths)
        self.assertIn(('/tv/1/season/0/episode/1/images', None), paths)
        self.assertEqual(paths.count(('/tv/1/images', None)), 1)

    def test_jobs_deduplicate_retry_and_resume_after_restart(self):
        with patch.object(self.cache, 'start'):
            self.cache.enqueue('movie', 1)
            self.cache.enqueue('movie', 1)
        self.assertEqual(self.cache.status()['total'], 1)
        with patch.object(self.cache, 'warm', side_effect=RuntimeError('offline')):
            self.cache._run()
        self.assertEqual(self.cache.status()['failed'], 1)
        with patch.object(self.cache, 'start'):
            self.cache.enqueue('movie', 1)
        self.cache.jobs['movie/1']['state'] = 'running'
        self.cache._save_jobs()
        reopened = TmdbCache(self.temp.name, lambda: {})
        self.assertEqual(reopened.status()['pending'], 1)
        with patch.object(reopened, 'warm') as warm:
            reopened._run()
            reopened.enqueue('movie', 1)
            self.assertEqual(warm.call_count, 1)
        self.assertEqual(reopened.status()['complete'], 1)

    def test_cancel_persists_and_repeated_start_does_not_resume_until_enqueued(self):
        with patch.object(self.cache, 'start'):
            self.cache.enqueue('movie', 1)
            self.cache.enqueue('tv', 2)
        self.cache.jobs['movie/1']['state'] = 'complete'
        self.cache.cancel()
        self.assertEqual(self.cache.status()['cancelled'], 1)
        reopened = TmdbCache(self.temp.name, lambda: {})
        with patch.object(reopened, 'warm') as warm:
            reopened._run()
            warm.assert_not_called()
        with patch.object(reopened, 'start'):
            reopened.enqueue('tv', 2)
        self.assertEqual(reopened.status()['pending'], 1)
        self.assertEqual(reopened.status()['complete'], 1)

    def test_cancel_running_job_retains_files_and_does_not_become_failure(self):
        started, release = threading.Event(), threading.Event()
        with patch.object(self.cache, 'start'):
            self.cache.enqueue('movie', 1)
            self.cache.enqueue('movie', 2)
        def warm(*args):
            started.set()
            release.wait(5)
            self.cache._check_worker()
        with patch.object(self.cache, 'warm', side_effect=warm) as warm_mock:
            worker = threading.Thread(target=self.cache._run)
            worker.start()
            try:
                self.assertTrue(started.wait(5))
                self.cache.cancel()
            finally:
                release.set()
                worker.join(5)
            self.assertFalse(worker.is_alive())
            self.assertEqual(warm_mock.call_count, 1)
        self.assertEqual(self.cache.status()['cancelled'], 2)
        self.assertEqual(self.cache.status()['failed'], 0)

    def test_repeated_migration_requests_do_not_enqueue_while_active_and_cancel_requires_pin(self):
        library = {'movies': {'Movies/a.mp4': {'tmdbId': 1}}}
        with patch.object(api, 'tmdb_artwork', self.cache), patch.object(api, 'load_media_library', return_value=library), patch.object(api, 'is_authorized_request', return_value=True), patch.object(self.cache, 'start'):
            client = api.app.test_client()
            self.assertEqual(client.post('/tmdb/cache').json['pending'], 1)
            with patch.object(self.cache, 'enqueue') as enqueue:
                client.post('/tmdb/cache')
                enqueue.assert_not_called()
            self.assertEqual(client.delete('/tmdb/cache').json['cancelled'], 1)
            self.assertEqual(client.get('/tmdb/cache').json['cancelled'], 1)
            self.assertEqual(client.post('/tmdb/cache').json['pending'], 1)
        with patch.object(api, 'is_authorized_request', return_value=False):
            self.assertEqual(api.app.test_client().delete('/tmdb/cache').status_code, 401)

    def test_storage_counts_all_cache_files_and_uses_cache_disk_capacity(self):
        (self.cache.root / 'images').mkdir()
        (self.cache.root / 'images/a.jpg').write_bytes(b'a' * 200)
        (self.cache.root / 'metadata').mkdir()
        (self.cache.root / 'metadata/a.json').write_bytes(b'a' * 100)
        (self.cache.root / 'index.json').write_bytes(b'a' * 50)
        (self.cache.root / 'jobs.json').write_bytes(b'a' * 50)
        with patch('tmdb_cache.shutil.disk_usage') as usage:
            usage.return_value.total = 2000
            result = self.cache.storage()
            self.assertEqual(result['bytes'], 400)
            self.assertEqual(result['percent'], 20)
            self.assertEqual(result['gb'], 400 / 1_000_000_000)
            usage.assert_called_once_with(self.cache.root)
            self.cache.storage()
            usage.assert_called_once()

    def test_storage_empty_cache_and_unavailable_disk(self):
        self.cache.root = self.cache.root / 'not-created'
        self.assertEqual(self.cache.storage()['bytes'], 0)
        self.cache.storage_snapshot = None
        with patch('tmdb_cache.shutil.disk_usage', side_effect=PermissionError()):
            self.assertEqual(self.cache.storage(), {'available': False})

    def test_full_disk_is_reported_without_leaving_running_jobs(self):
        with patch.object(self.cache, 'start'):
            self.cache.enqueue('movie', 1)
        with patch.object(self.cache, '_save_jobs', side_effect=OSError('disk full')):
            self.cache._run()
        self.assertEqual(self.cache.status()['running'], 0)
        self.assertEqual(self.cache.status()['failed'], 1)
        self.assertIn('disk full', self.cache.status()['errors'][0]['error'])

    def test_routes_require_pin_and_serve_cached_images(self):
        with patch.object(api, 'tmdb_artwork', self.cache), patch.object(api, 'current_web_pin', return_value='1234'):
            client = api.app.test_client()
            self.assertEqual(client.get('/tmdb/cache').status_code, 401)
            self.assertEqual(client.get('/tmdb/images/a.jpg').status_code, 401)
            with patch.object(self.cache, '_download', return_value=(b'jpeg', 'image/jpeg')):
                response = client.get('/tmdb/images/a.jpg?pin=1234')
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data, b'jpeg')
                response.close()
            with patch.object(api, 'load_media_library', return_value={'movies': {'Movies/a.mp4': {'tmdbId': 1}, 'Movies/b.mp4': {}}, 'series': {}}), patch.object(self.cache, 'start'):
                response = client.post('/tmdb/cache', headers={'X-Web-Pin': '1234'})
                self.assertEqual(response.json['pending'], 1)
                self.assertEqual(response.json['missingIds'], ['Movies/b.mp4'])

    def test_missing_credentials_and_upstream_failures_have_distinct_safe_errors(self):
        self.cache.credentials = lambda: {}
        with patch.object(api, 'tmdb_artwork', self.cache), patch.object(api, 'is_authorized_request', return_value=True):
            client = api.app.test_client()
            response = client.get('/tmdb/json/tv/1')
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json['code'], 'TMDB_CREDENTIALS_MISSING')
            self.cache.credentials = lambda: {"apiKey": "secret"}
            with patch.object(self.cache, '_download', side_effect=TmdbError('TMDB rejected credentials', 'TMDB_AUTH_ERROR')):
                response = client.get('/tmdb/json/tv/1')
                self.assertEqual(response.status_code, 502)
                self.assertEqual(response.json['code'], 'TMDB_AUTH_ERROR')
                self.assertNotIn('secret', response.get_data(as_text=True))
            with patch.object(self.cache, '_download', side_effect=PermissionError(13, 'denied')):
                response = client.get('/tmdb/json/tv/1')
                self.assertEqual(response.status_code, 500)
                self.assertEqual(response.json['code'], 'TMDB_STORAGE_ERROR')

    def test_upload_metadata_and_profile_edits_enqueue_downloads(self):
        library = {'movies': {}, 'series': {}}
        with patch.object(api, 'load_media_library', return_value=library), patch.object(api, 'save_media_library'), patch.object(api, 'queue_tmdb_artwork') as queue:
            api.upsert_movie_metadata('Movies/a.mp4', 'A', 1)
            api.upsert_series_metadata('TVShows/b', {'tmdbId': 2, 'episodes': []})
            api.upsert_media_profile('movies', 'Movies/a.mp4', {'heroImage': 'https://image.tmdb.org/t/p/w500/custom.jpg'})
        self.assertEqual([call.args[0] for call in queue.call_args_list], ['movie', 'tv', 'movie'])
        self.assertTrue(queue.call_args_list[1].kwargs['refresh'])

class TmdbCleanupTests(unittest.TestCase):
    setUp = TmdbCacheTests.setUp
    def cache_json(self, path, data, params=None):
        with patch.object(self.cache, '_download', return_value=(json.dumps(data).encode(), 'application/json')):
            self.cache.json(path, params)

    def cache_images(self, *names):
        with patch.object(self.cache, '_download', return_value=(b'image', 'image/jpeg')):
            for name in names:
                self.cache.image(name)

    def test_removes_exclusive_data_preserves_shared_images_and_custom_profiles(self):
        self.cache_json('/movie/1', {'id': 1, 'poster_path': '/own.jpg', 'backdrop_path': '/shared.jpg'})
        self.cache_json('/movie/1/images', {'posters': [{'file_path': '/custom.jpg'}]})
        self.cache_json('/tv/2', {'id': 2, 'backdrop_path': '/shared.jpg'})
        self.cache_images('/own.jpg', '/shared.jpg', '/custom.jpg')
        library = {'series': {'TVShows/b': {'tmdbId': 2}}, 'movies': {'Movies/c.mp4': {'heroImage': 'https://image.tmdb.org/t/p/w500/custom.jpg'}}}
        result = self.cache.remove_unused([('movie', {'tmdbId': 1})], library)
        self.assertEqual(result, {'metadata': 2, 'images': 1})
        self.assertFalse((self.cache.root / 'images/own.jpg').exists())
        self.assertTrue((self.cache.root / 'images/shared.jpg').exists())
        self.assertTrue((self.cache.root / 'images/custom.jpg').exists())
        self.assertEqual(self.cache.remove_unused([('movie', {'tmdbId': 1})], library), {'metadata': 0, 'images': 0})

    def test_same_tmdb_id_retained_until_last_copy_deleted(self):
        self.cache_json('/movie/1', {'id': 1, 'poster_path': '/own.jpg'})
        self.cache_images('/own.jpg')
        with patch.object(self.cache, 'start'):
            self.cache.enqueue('movie', 1)
        self.cache.remove_unused([('movie', {'tmdbId': 1})], {'movies': {'Movies/copy.mp4': {'tmdbId': 1}}})
        self.assertTrue((self.cache.root / 'images/own.jpg').exists())
        self.assertIn('movie/1', self.cache.jobs)
        self.cache.remove_unused([('movie', {'tmdbId': 1})], {})
        self.assertFalse((self.cache.root / 'images/own.jpg').exists())
        self.assertNotIn('movie/1', self.cache.jobs)
        self.assertEqual(TmdbCache(self.temp.name, lambda: {}).status()['total'], 0)

    def test_upgrades_legacy_series_cache_and_cleans_seasons_and_episode_variants(self):
        self.cache_json('/tv/1', {'id': 1, 'seasons': [{'season_number': 1}]}, {'language': 'es-ES'})
        self.cache_json('/tv/1/season/1', {'episodes': [{'episode_number': 1, 'still_path': '/still.jpg'}]}, {'language': 'es-ES'})
        self.cache_json('/tv/1/season/1/episode/1/images', {'stills': [{'file_path': '/variant.jpg'}]})
        self.cache_json('/search/tv', {'results': [{'id': 1, 'poster_path': '/still.jpg'}]}, {'query': 'Example'})
        self.cache_images('/still.jpg', '/variant.jpg')
        (self.cache.root / 'index.json').unlink()
        legacy = TmdbCache(self.temp.name, lambda: {})
        with patch.object(legacy, '_download', side_effect=AssertionError('must be offline')):
            result = legacy.remove_unused([('tv', {'tmdbId': 1})], {})
        self.assertEqual(result, {'metadata': 3, 'images': 2})
        self.assertEqual(len(list((self.cache.root / 'metadata').glob('*.json'))), 1)

    def test_running_download_cannot_recreate_deleted_images_or_jobs(self):
        self.cache_json('/movie/1', {'id': 1, 'poster_path': '/late.jpg'})
        with patch.object(self.cache, 'start'):
            self.cache.enqueue('movie', 1)
        started, release = threading.Event(), threading.Event()
        def download(*args):
            started.set()
            self.assertTrue(release.wait(5))
            return b'image', 'image/jpeg'
        def warm(*args):
            self.cache.image('/late.jpg')
        with patch.object(self.cache, '_download', side_effect=download), patch.object(self.cache, 'warm', side_effect=warm):
            worker = threading.Thread(target=self.cache._run)
            worker.start()
            try:
                self.assertTrue(started.wait(5))
                self.cache.remove_unused([('movie', {'tmdbId': 1})], {})
            finally:
                release.set()
                worker.join(5)
            self.assertFalse(worker.is_alive())
        self.assertFalse((self.cache.root / 'images/late.jpg').exists())
        self.assertNotIn('movie/1', self.cache.jobs)

    def test_deleting_movie_directory_cleans_descendants_but_not_similar_paths(self):
        library = {'movies': {'Movies/folder/a.mp4': {'tmdbId': 1}, 'Movies/folder/b.mp4': {'tmdbId': 2}, 'Movies/folder2/c.mp4': {'tmdbId': 3}}, 'series': {}}
        with patch.object(api, 'load_media_library', return_value=library), patch.object(api, 'save_media_library') as save, patch.object(api, 'tmdb_artwork') as cache:
            api.remove_movie_metadata('Movies/folder')
        self.assertEqual(set(save.call_args.args[0]['movies']), {'Movies/folder2/c.mp4'})
        self.assertEqual({item['tmdbId'] for _, item in cache.remove_unused.call_args.args[0]}, {1, 2})

    def test_refresh_keeps_old_image_ownership_for_eventual_cleanup(self):
        self.cache_json('/movie/1', {'poster_path': '/old.jpg'})
        self.cache_images('/old.jpg', '/new.jpg')
        with patch.object(self.cache, '_download', return_value=(b'{"poster_path":"/new.jpg"}', 'application/json')):
            self.cache.json('/movie/1', refresh=True)
        result = self.cache.remove_unused([('movie', {'tmdbId': 1})], {})
        self.assertEqual(result['images'], 2)

    def test_cleanup_failure_does_not_save_removed_catalog_metadata(self):
        library = {'movies': {'Movies/a.mp4': {'tmdbId': 1}}}
        with patch.object(api, 'load_media_library', return_value=library), patch.object(api, 'save_media_library') as save, patch.object(api, 'tmdb_artwork') as cache:
            cache.remove_unused.side_effect = OSError('permission denied')
            with self.assertRaises(OSError):
                api.remove_movie_metadata('Movies/a.mp4')
            save.assert_not_called()

    def test_delete_routes_clean_even_when_video_already_missing(self):
        for collection, kind, path in [('movies', 'movie', 'Movies/a.mp4'), ('series', 'tv', 'TVShows/a')]:
            library = {collection: {path: {'tmdbId': 1}}}
            with patch.object(api, 'load_media_library', return_value=library), patch.object(api, 'save_media_library'), patch.object(api, 'tmdb_artwork') as cache, patch.object(api, 'is_authorized_request', return_value=True), patch.object(api, 'resolve_relative_video_path', return_value=str(self.cache.root / 'missing')):
                response = api.app.test_client().delete('/' + collection, query_string={'relativePath': path})
            self.assertEqual(response.status_code, 200)
            cache.remove_unused.assert_called_once_with([(kind, {'tmdbId': 1})], {collection: {}})

if __name__ == '__main__': unittest.main()
