import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api
from languages import LANGUAGES, normalize_language


class LanguageSettingsTests(unittest.TestCase):
    def test_all_languages_are_saved_and_read_without_changing_other_settings(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(api, 'USER_SETTINGS_PATH', str(Path(folder) / 'settings.json')):
            api.save_settings({**api.DEFAULT_SETTINGS, 'web_password': '1234', 'weather_location': 'Barcelona'})
            client = api.app.test_client()
            for item in LANGUAGES:
                with self.subTest(language=item['id']):
                    response = client.post('/settings/language', json={'language': item['id']}, headers={'X-Web-Pin': '1234'})
                    self.assertEqual(response.status_code, 200, response.json)
                    self.assertEqual(response.json['language'], item['id'])
                    self.assertEqual(client.get('/settings/language', headers={'X-Web-Pin': '1234'}).json['language'], item['id'])
                    saved = json.loads(Path(api.USER_SETTINGS_PATH).read_text())
                    self.assertEqual(saved['language'], item['id'])
                    self.assertEqual(saved['weather_location'], 'Barcelona')
                    self.assertEqual(saved['web_password'], '1234')

    def test_invalid_language_is_rejected_without_saving(self):
        client = api.app.test_client()
        with patch.object(api, 'current_web_pin', return_value='1234'), patch.object(api, 'save_settings') as save:
            for value in ['xx', '', [], {}, None]:
                response = client.post('/settings/language', json={'language': value}, headers={'X-Web-Pin': '1234'})
                self.assertEqual(response.status_code, 400, value)
            save.assert_not_called()

    def test_regional_aliases_and_three_letter_languages_remain_distinct(self):
        for value, expected in [('ar-EG', 'arz'), ('ar', 'ar'), ('pcm', 'pcm'), ('zh_Hans', 'zh'), ('ca-ES', 'ca')]:
            self.assertEqual(normalize_language(value), expected)
        self.assertIsNone(normalize_language('invalid', None))

