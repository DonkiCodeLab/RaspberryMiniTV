import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api
from game_platforms import resolve_platform, stored_platform


class GameSystemsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        games, covers = root / 'Games', root / 'GameCovers'
        games.mkdir(); covers.mkdir()
        values = dict(MULTIMEDIA_DIR=str(root), GAMES_DIR=str(games), GAME_COVERS_DIR=str(covers),
                      MEDIA_LIBRARY_PATH=str(root / 'media_library.json'),
                      LEGACY_MOVIE_LIBRARY_PATH=str(root / 'legacy.json'))
        for key, value in values.items():
            p = patch.object(api, key, value); p.start(); self.addCleanup(p.stop)
        for name, value in [('ensure_media_directories', None), ('get_library_counts', {}), ('is_authorized_request', True)]:
            p = patch.object(api, name, return_value=value); p.start(); self.addCleanup(p.stop)
        self.client = api.app.test_client()

    def upload(self, platform, filename='disc.chd'):
        return self.client.post('/games/upload', data={'platform': platform, 'name': 'Test', 'file': (io.BytesIO(b'test fixture'), filename)})

    def test_disc_platform_survives_profile_edit_and_menu_reload(self):
        response = self.upload('psx')
        self.assertEqual(response.status_code, 200, response.json)
        item = response.json['item']
        self.assertEqual(item['platform'], 'psx')
        updated = api.upsert_game_metadata(item['relativePath'], {'description': 'Edited'})
        self.assertEqual(updated['platform'], 'psx')
        self.assertEqual(stored_platform(item['file'], self.temp.name)['core'], 'pcsx_rearmed_libretro.so')
        self.assertEqual(api.list_game_entries()[0]['platform'], 'psx')

    def test_ambiguous_and_incompatible_uploads_are_rejected(self):
        self.assertEqual(self.upload('').status_code, 400)
        self.assertEqual(self.upload('gb').status_code, 400)
        self.assertEqual(list(Path(api.GAMES_DIR).iterdir()), [])

    def test_legacy_chd_keeps_neogeo_mapping(self):
        self.assertEqual(resolve_platform('legacy.chd')['id'], 'neo_geo_cd')
        self.assertEqual(resolve_platform('old.gb', 'gameboy')['core'], 'gambatte_libretro.so')
        self.assertIsNone(resolve_platform('set.zip'))

    def test_arcade_archive_name_is_preserved(self):
        response = self.upload('arcade', 'sf2.zip')
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json['item']['file'], 'sf2.zip')

    def test_artwork_persists_and_can_be_reset(self):
        data = (Path(__file__).resolve().parents[2] / 'WebApp/public/game-systems/iconic/ngp/background.webp').read_bytes()
        response = self.client.post('/games/systems/ngp/artwork', data={'image': (io.BytesIO(data), 'art.webp')})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertTrue(response.json['image'])
        self.assertEqual(self.client.get('/games/systems/ngp/artwork').json, response.json)
        self.assertEqual(self.client.post('/games/systems/ngp/artwork', data={'reset': '1'}).json, {'image': ''})
        self.assertFalse(list(Path(api.GAME_COVERS_DIR).glob('*.webp')))
        self.assertEqual(self.client.post('/games/systems/ngp/artwork', data={'image': (io.BytesIO(b'<svg/>'), 'fake.png')}).status_code, 400)

    def test_artwork_requires_authentication(self):
        with patch.object(api, 'is_authorized_request', return_value=False):
            self.assertEqual(self.client.post('/games/systems/ngp/artwork', data={'reset': '1'}).status_code, 401)


if __name__ == '__main__':
    unittest.main()
