import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api


class ServiceCredentialTests(unittest.TestCase):
    def setUp(self):
        self.client = api.app.test_client()
        patcher = patch.object(api, 'current_web_pin', lambda: '1234')
        patcher.start()
        self.addCleanup(patcher.stop)
        self.headers = {'X-Web-Pin': '1234'}

    def post(self, provider, data):
        return self.client.post('/settings/services/' + provider + '/test', json=data, headers=self.headers)

    def test_auth_and_validation(self):
        self.assertEqual(self.client.post('/settings/services/tmdb/test', json={}).status_code, 401)
        for provider, data in [('unknown', {}), ('tmdb', []), ('tmdb', {'apiKey': 1})]:
            self.assertEqual(self.post(provider, data).status_code, 400)

    def test_tmdb_uses_current_credentials_without_saving(self):
        with patch.object(api, 'tmdb_credentials', return_value={}), patch.object(api.urllib.request, 'urlopen', return_value=io.StringIO('{"id":550}')) as remote, patch.object(api, 'save_settings') as save:
            self.assertEqual(self.post('tmdb', {'apiKey': 'key', 'bearerToken': 'token'}).status_code, 200)
            self.assertEqual(remote.call_args.args[0].get_header('Authorization'), 'Bearer token')
            save.assert_not_called()

    def test_subtitle_login_and_fixed_search(self):
        with patch.object(api.movie_subtitles, 'load_credentials', return_value={}), patch.object(api.movie_subtitles.OpenSubtitles, '_login', return_value=('https://api.opensubtitles.com/api/v1', 'token')) as login, patch.object(api.movie_subtitles.OpenSubtitles, '_request', return_value={'data': []}) as remote:
            response = self.post('opensubtitles', {'apiKey': 'key', 'username': 'user', 'password': 'pass'})
            self.assertEqual(response.status_code, 200)
            login.assert_called_once()
            self.assertIn('tmdb_id=550', remote.call_args.args[0])

    def test_youtube_bypasses_search_cache(self):
        with patch.object(api, 'game_config_value', return_value=''), patch.object(api.youtube_search, 'search', return_value={'configured': True, 'results': []}) as remote:
            self.assertEqual(self.post('youtube', {'YOUTUBE_API_KEY': 'key'}).status_code, 200)
            self.assertFalse(remote.call_args.kwargs['use_cache'])

    def test_game_provider_responses_and_failures(self):
        for provider, credentials, payload in [
            ('igdb', {'IGDB_CLIENT_ID': 'id', 'IGDB_CLIENT_SECRET': 'secret'}, []),
            ('screenscraper', {'SCREENSCRAPER_DEV_ID': 'id', 'SCREENSCRAPER_DEV_PASSWORD': 'secret'}, {'response': {'jeux': []}}),
        ]:
            with patch.object(api, 'game_config_value', return_value=''), patch.object(api.GameMetadata, 'request_json', return_value=payload) as remote:
                self.assertEqual(self.post(provider, credentials).status_code, 200)
                self.assertEqual(remote.call_args.args[0], provider)
                remote.return_value = {'error': 'invalid credentials'}
                self.assertEqual(self.post(provider, credentials).status_code, 502)
                remote.side_effect = api.MetadataError('secret in upstream URL')
                response = self.post(provider, credentials)
                self.assertEqual(response.status_code, 502)
                self.assertNotIn('secret', response.text)
