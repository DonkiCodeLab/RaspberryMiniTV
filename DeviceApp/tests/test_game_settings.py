import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api


class GameSettingsTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / 'credentials.json'
        for target, value in [('GAME_SETTINGS_PATH', str(self.path)), ('current_web_pin', lambda: '1234'),
                              ('get_config_value', lambda key: '')]:
            patcher = patch.object(api, target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = api.app.test_client()
        self.headers = {'X-Web-Pin': '1234'}

    def test_auth_required(self):
        for method in [self.client.get, self.client.post]:
            self.assertEqual(method('/settings/games').status_code, 401)
        self.assertFalse(self.path.exists())

    def test_save_visible_credentials_preservation_and_provider_use(self):
        response = self.client.post('/settings/games', headers=self.headers,
                                    json={'IGDB_CLIENT_ID': 'private-id', 'IGDB_CLIENT_SECRET': 'private-secret'})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json['igdb'])
        self.assertEqual(response.json['values']['IGDB_CLIENT_SECRET'], 'private-secret')
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        self.client.post('/settings/games', headers=self.headers, json={'SCREENSCRAPER_USER': 'person'})
        self.assertEqual(api.game_metadata_service().config('IGDB_CLIENT_SECRET'), 'private-secret')
        response = self.client.get('/settings/games', headers=self.headers)
        self.assertEqual(response.json['values']['IGDB_CLIENT_SECRET'], 'private-secret')
        self.assertEqual(response.headers['Cache-Control'], 'no-store')

    def test_environment_fallback_and_explicit_clear(self):
        with patch.object(api, 'get_config_value', lambda key: 'env-secret' if key.startswith('IGDB_') else ''):
            self.assertTrue(self.client.get('/settings/games', headers=self.headers).json['igdb'])
            response = self.client.post('/settings/games', headers=self.headers, json={'IGDB_CLIENT_SECRET': ''})
            self.assertFalse(response.json['igdb'])
            self.assertEqual(api.game_config_value('IGDB_CLIENT_SECRET'), '')

    def test_invalid_input_does_not_write(self):
        for data in [[], {'unknown': 'value'}, {'IGDB_CLIENT_ID': 5}, {'IGDB_CLIENT_SECRET': 'x' * 1025}]:
            self.assertEqual(self.client.post('/settings/games', headers=self.headers, json=data).status_code, 400)
        self.assertFalse(self.path.exists())


if __name__ == '__main__':
    unittest.main()
