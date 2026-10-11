import sys
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api
import movie_trailers


class TrailerTests(unittest.TestCase):
    def test_exact_official_trailer_wins_and_no_youtube_search(self):
        tmdb, search = Mock(), Mock()
        tmdb.json.return_value = {'videos': {'results': [
            {'site': 'YouTube', 'type': 'Clip', 'key': 'aaaaaaaaaaa', 'official': True},
            {'site': 'YouTube', 'type': 'Trailer', 'key': 'bbbbbbbbbbb'},
            {'site': 'YouTube', 'type': 'Trailer', 'key': 'ccccccccccc', 'official': True}]}}
        self.assertEqual(movie_trailers.find_trailer(tmdb, 1, 'Movie', 'es', search)['id'], 'ccccccccccc')
        search.assert_not_called()

    def test_franchise_montage_is_skipped_in_favor_of_movie_trailer(self):
        tmdb, search = Mock(), Mock()
        tmdb.json.side_effect = [
            {'videos': {'results': [{'site': 'YouTube', 'type': 'Trailer', 'key': 'Ha94ny648TQ'}]}},
            {'videos': {'results': [{'site': 'YouTube', 'type': 'Trailer', 'key': 'abcdefghijk'}]}},
        ]
        self.assertEqual(movie_trailers.find_trailer(tmdb, 62, 'Dr. No', 'es', search)['id'], 'abcdefghijk')
        search.assert_not_called()

    def test_english_fallback_then_youtube(self):
        tmdb, search = Mock(), Mock(return_value={'results': [{'id': 'abcdefghijk', 'title': 'Trailer'}]})
        tmdb.json.return_value = {'release_date': '1999-01-01', 'videos': {'results': []}}
        self.assertEqual(movie_trailers.find_trailer(tmdb, 1, 'Movie', 'es', search)['name'], 'Trailer')
        self.assertEqual(tmdb.json.call_count, 2)
        self.assertIn('1999', search.call_args.args[0])

    def test_series_search_uses_tv_and_first_air_year(self):
        tmdb = Mock()
        tmdb.json.return_value = {'first_air_date': '2004-09-22', 'videos': {'results': []}}
        search = Mock(return_value={'results': []})
        self.assertIsNone(movie_trailers.find_trailer(tmdb, 42, 'Series', 'es', search, kind='tv'))
        self.assertTrue(all(call.args[0] == '/tv/42' for call in tmdb.json.call_args_list))
        self.assertIn('2004', search.call_args.args[0])

    def test_series_trailer_save_and_reload(self):
        with tempfile.TemporaryDirectory() as root:
            shows = Path(root) / 'TVShows'
            (shows / 'Example').mkdir(parents=True)
            with patch.multiple(api, VIDEOS_DIR=root, TVSHOWS_DIR=str(shows),
                                MEDIA_LIBRARY_PATH=str(Path(root) / 'media_library.json'),
                                LEGACY_MOVIE_LIBRARY_PATH=str(Path(root) / 'legacy.json')), \
                 patch.object(api, 'ensure_media_directories'), patch.object(api, 'is_authorized_request', return_value=True):
                library = api.load_media_library()
                library['series']['TVShows/Example'] = {'name': 'Example', 'tmdbId': 42}
                api.save_media_library(library)
                client = api.app.test_client()
                payload = {'relativePath': 'TVShows/Example', 'video': {'id': 'abcdefghijk', 'name': 'Trailer'}}
                self.assertEqual(client.post('/series/trailer', json=payload).status_code, 200)
                saved = api.load_media_library()['series']['TVShows/Example']
                self.assertEqual(saved['preferredVideo']['id'], 'abcdefghijk')
                self.assertEqual(saved['tmdbId'], 42)
                self.assertEqual(client.post('/series/trailer', json={**payload, 'video': {'id': 'bad'}}).status_code, 400)
                for path in ('TVShows/missing', '../Example', 'Movies/Example'):
                    self.assertEqual(client.post('/series/trailer', json={**payload, 'relativePath': path}).status_code, 404)
                with patch.object(api, 'is_authorized_request', return_value=False):
                    self.assertEqual(client.post('/series/trailer', json=payload).status_code, 401)
                with patch.object(movie_trailers, 'find_trailer', return_value=None) as find:
                    self.assertEqual(client.get('/series/trailer?tmdbId=42&name=Example').status_code, 200)
                    self.assertEqual(find.call_args.kwargs['kind'], 'tv')

    def test_save_replace_preserve_metadata_validate_and_require_auth(self):
        with tempfile.TemporaryDirectory() as root:
            movies = Path(root) / 'Movies'
            movies.mkdir()
            (movies / 'test.mp4').write_bytes(b'video')
            with patch.multiple(api, VIDEOS_DIR=root, MOVIES_DIR=str(movies), MEDIA_LIBRARY_PATH=str(Path(root) / 'media_library.json'),
                                LEGACY_MOVIE_LIBRARY_PATH=str(Path(root) / 'legacy.json')), \
                 patch.object(api, 'ensure_media_directories'), patch.object(api, 'is_authorized_request', return_value=True):
                library = api.load_media_library()
                library['movies']['Movies/test.mp4'] = {'name': 'My movie', 'tmdbId': 42, 'heroImage': 'custom.jpg'}
                api.save_media_library(library)
                client = api.app.test_client()
                payload = {'relativePath': 'Movies/test.mp4', 'video': {'id': 'abcdefghijk', 'name': 'Trailer'}}
                self.assertEqual(client.post('/movies/trailer', json=payload).status_code, 200)
                payload['video']['id'] = '12345678901'
                self.assertEqual(client.post('/movies/trailer', json=payload).status_code, 200)
                saved = api.load_media_library()['movies']['Movies/test.mp4']
                self.assertEqual(saved['preferredVideo']['id'], '12345678901')
                self.assertEqual(saved['heroImage'], 'custom.jpg')
                self.assertEqual(saved['tmdbId'], 42)
                for video in (None, [], {'id': '../bad'}, {'id': 'abcdefghijk', 'name': []}):
                    self.assertEqual(client.post('/movies/trailer', json={**payload, 'video': video}).status_code, 400)
                for path in ('Movies/missing.mp4', '../test.mp4', 'Games/test.mp4'):
                    self.assertEqual(client.post('/movies/trailer', json={**payload, 'relativePath': path}).status_code, 404)
                with patch.object(api, 'is_authorized_request', return_value=False):
                    self.assertEqual(client.post('/movies/trailer', json=payload).status_code, 401)


if __name__ == '__main__':
    unittest.main()
