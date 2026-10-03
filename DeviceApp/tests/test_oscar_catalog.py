import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api
from oscar_catalog import OscarCatalog, SEED_PATH
from tmdb_cache import TmdbCache, TmdbError, LANGUAGES, atomic_write


class OscarCatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.cache = OscarCatalog(self.root / 'Oscars', lambda: {'apiKey': 'test-secret'})
        self.winner = self.cache.winners[-1]
        self.movie_id = self.winner['tmdbId']

    def seed_detail(self, cache=None):
        cache = cache or self.cache
        data = {'id': self.movie_id, 'title': 'Ganadora', 'poster_path': '/poster.jpg',
                'backdrop_path': '/backdrop.jpg', 'overview': 'Sinopsis', 'external_ids': {}}
        with patch.object(cache, '_download', return_value=(json.dumps(data).encode(), 'application/json')):
            for language in LANGUAGES:
                cache.json(f'/movie/{self.movie_id}', {'language': language, 'append_to_response': 'external_ids'})
        atomic_write(cache.root / 'images/poster.jpg', b'original')
        atomic_write(cache.root / 'thumbnails/500/poster.jpg.webp', b'poster')

    def test_all_98_editions_and_historical_year_exceptions_are_preserved(self):
        winners = json.loads(SEED_PATH.read_text())['winners']
        self.assertEqual([w['edition'] for w in winners], list(range(1, 99)))
        self.assertEqual(len({w['tmdbId'] for w in winners}), 98)
        self.assertEqual([w['edition'] for w in winners if w['ceremonyYear'] == 1930], [2, 3])
        self.assertFalse(any(w['ceremonyYear'] == 1933 for w in winners))
        self.assertEqual(winners[-1]['ceremonyYear'], 2026)
        self.assertEqual(winners[-1]['title'], 'One Battle After Another')

    def test_prepare_persists_catalog_and_deduplicates_jobs(self):
        with patch.object(self.cache, 'start'):
            self.cache.prepare()
            self.cache.prepare()
        self.assertEqual(self.cache.status()['pending'], 98)
        self.assertEqual(len(json.loads((self.cache.root / 'catalog.json').read_text())['winners']), 98)
        self.assertNotIn('test-secret', (self.cache.root / 'catalog.json').read_text())
        reopened = OscarCatalog(self.cache.root, lambda: {})
        self.assertEqual(reopened.status()['pending'], 98)
        reopened.credentials = self.cache.credentials
        with patch.object(reopened, 'start') as start:
            reopened.prepare()
            start.assert_called_once()

    def test_newer_saved_winners_survive_older_seed(self):
        future = {**self.winner, 'edition': 99, 'ceremonyYear': 2027, 'tmdbId': 123456}
        atomic_write(self.cache.root / 'catalog.json', json.dumps({'winners': [future]}).encode())
        reopened = OscarCatalog(self.cache.root, lambda: {})
        self.assertEqual(len(reopened.winners), 99)
        self.assertEqual(reopened.winners[-1], future)

    def test_snapshot_is_offline_and_only_advertises_prepared_images(self):
        self.seed_detail()
        with patch.object(self.cache, '_download', side_effect=AssertionError('offline')):
            movie = self.cache.snapshot('es-ES')['winners'][-1]
        self.assertEqual(movie['name'], 'Ganadora')
        self.assertEqual(movie['posterPath'], '/poster.jpg')
        self.assertEqual(movie['backdropPath'], '')
        self.assertEqual(movie['overview'], 'Sinopsis')
        with self.assertRaises(ValueError):
            self.cache.snapshot('../../invalid')

    def test_missing_credentials_preserve_the_catalog_for_offline_browsing(self):
        self.cache.credentials = lambda: {}
        with self.assertRaises(TmdbError) as error:
            self.cache.prepare()
        self.assertEqual(error.exception.code, 'TMDB_CREDENTIALS_MISSING')
        self.assertEqual(len(self.cache.snapshot('en-US')['winners']), 98)
        self.assertTrue((self.cache.root / 'catalog.json').is_file())
        self.assertEqual(self.cache.status()['total'], 0)

    def test_video_deletion_removes_regular_cache_but_keeps_oscar_reference_and_art(self):
        regular = TmdbCache(self.root, lambda: {'apiKey': 'test-secret'})
        self.seed_detail(regular)
        self.seed_detail()
        with patch.object(api, 'tmdb_artwork', regular), patch.object(api, 'oscar_artwork', self.cache), \
                patch.object(api, 'load_media_library', return_value={'movies': {'Movies/winner.mp4': {'tmdbId': self.movie_id}}}), \
                patch.object(api, 'save_media_library'), patch.object(api, 'is_authorized_request', return_value=True), \
                patch.object(api, 'resolve_relative_video_path', return_value=str(self.root / 'missing.mp4')):
            self.assertEqual(api.app.test_client().delete('/movies?relativePath=Movies/winner.mp4').status_code, 200)
        self.assertFalse((regular.root / 'images/poster.jpg').exists())
        self.assertTrue((self.cache.root / 'images/poster.jpg').exists())
        self.cache.remove_unused([('movie', {'tmdbId': self.movie_id})], {})
        reopened = OscarCatalog(self.cache.root, lambda: {})
        self.assertEqual(reopened.snapshot('es-ES')['winners'][-1]['name'], 'Ganadora')

    def test_routes_require_pin_and_fall_back_to_permanent_details_and_images(self):
        self.seed_detail()
        regular = TmdbCache(self.root / 'regular', lambda: {})
        with patch.object(api, 'tmdb_artwork', regular), patch.object(api, 'oscar_artwork', self.cache), \
                patch.object(api, 'current_web_pin', return_value='1234'), \
                patch.object(self.cache, '_download', side_effect=AssertionError('offline')):
            client = api.app.test_client()
            self.assertEqual(client.get('/oscars').status_code, 401)
            self.assertEqual(client.post('/oscars/prepare').status_code, 401)
            self.assertEqual(client.get('/oscars/images/poster.jpg?width=500').status_code, 401)
            headers = {'X-Web-Pin': '1234'}
            self.assertEqual(len(client.get('/oscars', headers=headers).json['winners']), 98)
            self.assertEqual(client.delete('/oscars', headers=headers).status_code, 405)
            detail = client.get(f'/tmdb/json/movie/{self.movie_id}?language=es-ES&append_to_response=external_ids', headers=headers)
            self.assertEqual(detail.json['title'], 'Ganadora')
            for path in ['/oscars/images/poster.jpg', '/tmdb/images/poster.jpg']:
                response = client.get(path + '?width=500&pin=1234')
                self.assertEqual(response.data, b'poster')
                response.close()
            self.assertEqual(client.get('/oscars/images/poster.jpg?width=1&pin=1234').status_code, 400)

    def test_primary_covers_for_every_winner_precede_full_galleries(self):
        self.cache.winners = self.cache.winners[-2:]
        calls = []
        with patch.object(self.cache, 'json', side_effect=lambda *args, **kwargs: calls.append(args[0]) or {'poster_path': '/p.jpg'}), \
                patch.object(self.cache, 'display_image') as image, patch.object(TmdbCache, 'warm') as full:
            self.cache.warm('movie', self.movie_id)
            self.assertEqual(len(calls), 6)
            self.assertEqual(image.call_count, 6)
            full.assert_called_once()
            self.cache.warm('movie', self.movie_id)
            self.assertEqual(len(calls), 6)

    def test_parallel_artwork_obeys_cancellation_and_cannot_write_late_images(self):
        key = f'movie/{self.movie_id}'
        with patch.object(self.cache, 'start'):
            self.cache.enqueue('movie', self.movie_id)
        self.cache.jobs[key]['state'] = 'running'
        started, release = threading.Event(), threading.Event()
        errors = []
        def download(*args):
            started.set()
            release.wait(5)
            return b'image', 'image/jpeg'
        def run():
            self.cache.worker_context.job = (key, 0)
            try:
                self.cache._warm_images({'/late.jpg'}, set())
            except RuntimeError as exc:
                errors.append(str(exc))
        with patch.object(self.cache, '_download', side_effect=download):
            worker = threading.Thread(target=run)
            worker.start()
            try:
                self.assertTrue(started.wait(2))
                self.cache.cancel()
            finally:
                release.set()
                worker.join(5)
        self.assertFalse(worker.is_alive())
        self.assertTrue(errors)
        self.assertFalse((self.cache.root / 'images/late.jpg').exists())
        self.assertEqual(self.cache.status()['cancelled'], 1)


if __name__ == '__main__':
    unittest.main()
