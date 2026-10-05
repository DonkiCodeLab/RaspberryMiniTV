import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api
from oscar_catalog import OscarCatalog
from tmdb_cache import atomic_write

DATA = Path(__file__).resolve().parents[1] / 'data'

class AwardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.caches = {name: OscarCatalog(self.root/name, lambda: {'apiKey':'test'}, DATA/file, cards_only=True)
                       for name,file in [('palme','palme_dor.json'),('goya','goya_best_picture.json')]}

    def test_complete_catalogs_preserve_ties_and_exclude_other_cannes_prizes(self):
        palme, goya = self.caches['palme'].winners, self.caches['goya'].winners
        self.assertEqual(len(palme), 66)
        self.assertEqual(len(goya), 41)
        self.assertEqual([w['title'] for w in goya if w['ceremonyYear']==2025], ['The 47','Undercover'])
        self.assertEqual(len([w for w in palme if w['ceremonyYear']==1993]),2)
        self.assertFalse(any(w['ceremonyYear'] in range(1964,1975) or w['ceremonyYear']==2020 for w in palme))
        self.assertNotIn('The Image Book',[w['title'] for w in palme])
        for rows in [palme,goya]:
            self.assertEqual(len(rows),len({w['key'] for w in rows}))
            self.assertEqual(len(rows),len({w['tmdbId'] for w in rows}))
            self.assertTrue(all(isinstance(w['tmdbId'],int) and w['tmdbId']>0 for w in rows))
            self.assertEqual(rows[-1]['ceremonyYear'],2026)
        self.assertEqual(next(w['tmdbId'] for w in goya if w['ceremonyYear']==2001),33504)

    def test_restarts_retain_both_tied_winners_and_isolate_catalogs(self):
        cache=self.caches['goya']
        with patch.object(cache,'start'):
            cache.prepare()
            cache.prepare()
        reopened=OscarCatalog(cache.root,lambda:{},DATA/'goya_best_picture.json',cards_only=True)
        self.assertEqual(len(reopened.winners),41)
        self.assertEqual(reopened.status()['pending'],41)
        self.assertEqual(self.caches['palme'].status()['total'],0)
        reopened.remove_unused([], {})
        self.assertTrue((cache.root/'catalog.json').is_file())

    def test_cards_prepare_three_languages_and_art_without_full_galleries(self):
        cache=self.caches['palme']
        with patch.object(cache,'json',return_value={'poster_path':'/p.jpg','backdrop_path':'/b.jpg'}) as read, patch.object(cache,'display_image') as image:
            cache.warm('movie',15919)
        self.assertEqual(read.call_count,3)
        self.assertTrue(all(call.args[0]=='/movie/15919' for call in read.call_args_list))
        self.assertEqual(image.call_count,6)

    def test_authenticated_routes_select_correct_catalog_and_are_offline(self):
        cache=self.caches['goya']
        atomic_write(cache.root/'thumbnails/500/test.jpg.webp',b'cover')
        with patch.object(api,'award_artwork',self.caches),patch.object(api,'current_web_pin',return_value='test-pin'):
            client=api.app.test_client()
            self.assertEqual(client.get('/awards/goya').status_code,401)
            self.assertEqual(client.post('/awards/palme/prepare').status_code,401)
            self.assertEqual(client.get('/awards/goya/images/test.jpg?width=500').status_code,401)
            headers={'X-Web-Pin':'test-pin'}
            self.assertEqual(len(client.get('/awards/goya',headers=headers).json['winners']),41)
            self.assertEqual(len(client.get('/awards/palme',headers=headers).json['winners']),66)
            self.assertEqual(client.get('/awards/unknown',headers=headers).status_code,404)
            self.assertEqual(client.get('/awards/goya?language=bad',headers=headers).status_code,400)
            with client.get('/awards/goya/images/test.jpg?width=500&pin=test-pin') as response:
                self.assertEqual(response.data,b'cover')
            self.assertEqual(client.get('/awards/goya/images/test.jpg?width=1&pin=test-pin').status_code,400)
            self.assertEqual(client.get('/awards/palme/images/test.jpg?width=500&pin=test-pin').status_code,409)
            with patch.object(cache,'start'):
                self.assertEqual(client.post('/awards/goya/prepare',headers=headers).status_code,200)
