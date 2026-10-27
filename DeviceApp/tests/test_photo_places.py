import io
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
import urllib.error
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from photo_places import PhotoPlaces, coordinates, place_from_photon, DAY


def feature(**properties):
    return {'features': [{'properties': properties}]}


class PhotoPlaceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.now = 1000
        self.cache = Path(self.temp.name)
        self.places = PhotoPlaces(self.cache, clock=lambda: self.now)
        self.point = {'latitude': 41.385012, 'longitude': 2.173012}
        self.result = {'status': 'found', 'city': 'Barcelona', 'country': 'España', 'countryCode': 'ES'}
        self.env = patch.dict(os.environ, {'MINITV_PHOTON_URL': 'https://example.test'})
        self.env.start(); self.addCleanup(self.env.stop)

    def test_coordinates_zero_limits_precision_and_invalid_values(self):
        self.assertEqual(coordinates({'latitude': 0, 'longitude': -0.000001}), (0, 0))
        self.assertEqual(coordinates({'latitude': -90, 'longitude': 180}), (-90, 180))
        self.assertEqual(coordinates(self.point), (41.385, 2.173))
        for bad in [None, True, '41', float('nan'), float('inf'), 90.1, -90.1, 10 ** 500]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                coordinates({**self.point, 'latitude': bad})
        with self.assertRaises(ValueError): coordinates({**self.point, 'longitude': 180.1})

    def test_extracts_locality_not_shop_name_and_accepts_country_only(self):
        self.assertEqual(place_from_photon(feature(name='A shop', city='Barcelona', country='España', countrycode='es')), self.result)
        result = place_from_photon(feature(name='A shop', country='España', countrycode='ES'))
        self.assertEqual(result['city'], '')
        self.assertEqual(place_from_photon(feature(osm_key='place', osm_value='village', name='A village'))['city'], 'A village')
        self.assertEqual(place_from_photon(feature(type='city', name='Barcelona'))['city'], 'Barcelona')
        self.assertEqual(place_from_photon({'features': []}), {'status': 'not_found'})
        self.assertEqual(place_from_photon(feature(name='An address')), {'status': 'not_found'})
        for data in ({}, {'features': None}, {'features': [None]}):
            with self.assertRaises(ValueError): place_from_photon(data)

    def test_cache_survives_restart_and_uses_coordinates_not_photo_id(self):
        with patch.object(self.places, '_fetch', return_value=self.result) as fetch:
            self.assertEqual(self.places.resolve(self.point), self.result)
            self.assertEqual(self.places.resolve({**self.point, 'latitude': 41.385013, 'photoId': 'different'}), self.result)
            fetch.assert_called_once_with('https://example.test', 41.385, 2.173)
        restarted = PhotoPlaces(self.cache, clock=lambda: self.now)
        with patch.object(restarted, '_fetch', side_effect=AssertionError('Cache must survive restart')):
            self.assertEqual(restarted.resolve(self.point), self.result)
        self.now += 31 * DAY
        with patch.object(restarted, '_fetch', return_value=self.result) as fetch:
            restarted.resolve(self.point)
            fetch.assert_called_once()

    def test_empty_results_are_cached_and_provider_can_change_or_disable(self):
        with patch.object(self.places, '_fetch', return_value={'status': 'not_found'}) as fetch:
            self.places.resolve(self.point)
            self.now += 10
            self.places.resolve(self.point)
            fetch.assert_called_once()
            with patch.dict(os.environ, {'MINITV_PHOTON_URL': 'http://localhost:2322'}):
                self.places.resolve(self.point)
            self.assertEqual(fetch.call_count, 2)
            with patch.dict(os.environ, {'MINITV_PHOTON_URL': 'off'}):
                self.assertEqual(self.places.resolve(self.point), {'status': 'disabled'})
            with patch.dict(os.environ, {'MINITV_PHOTON_URL': 'file:///etc/passwd'}):
                self.assertEqual(self.places.resolve(self.point), {'status': 'unavailable'})
            self.assertEqual(fetch.call_count, 2)

    def test_requests_are_limited_without_delaying_cached_results(self):
        with patch.object(self.places, '_fetch', return_value=self.result) as fetch:
            self.places.resolve(self.point)
            other = {**self.point, 'latitude': 40}
            self.assertEqual(self.places.resolve(other)['status'], 'busy')
            self.assertEqual(self.places.resolve(self.point), self.result)
            self.now += 1.2
            self.places.resolve(other)
            self.assertEqual(fetch.call_count, 2)

    def test_slow_request_does_not_queue_other_requests(self):
        started, release = threading.Event(), threading.Event()
        def fetch(*_args):
            started.set(); release.wait(3); return self.result
        with patch.object(self.places, '_fetch', side_effect=fetch):
            worker = threading.Thread(target=self.places.resolve, args=(self.point,))
            worker.start()
            try:
                self.assertTrue(started.wait(2))
                self.assertEqual(self.places.resolve({'latitude': 40, 'longitude': -3})['status'], 'busy')
            finally:
                release.set(); worker.join(3)
            self.assertFalse(worker.is_alive())

    def test_provider_errors_and_rate_limits_back_off(self):
        for error, delay in [(TimeoutError(), 60), (ValueError(), 60),
                             (urllib.error.HTTPError('https://example.test', 429, 'Busy', {'Retry-After': '120'}, None), 120)]:
            self.places.next_request = 0
            with patch.object(self.places, '_fetch', side_effect=error) as fetch:
                self.assertEqual(self.places.resolve(self.point), {'status': 'unavailable', 'retryAfter': delay})
                self.assertEqual(self.places.resolve(self.point)['status'], 'busy')
                fetch.assert_called_once()
            self.now += delay + 1

    def test_http_request_contains_only_coordinates_and_identifies_app(self):
        raw = json.dumps(feature(city='Barcelona', country='España', countrycode='ES')).encode()
        with patch('photo_places.urllib.request.urlopen', return_value=io.BytesIO(raw)) as fetch:
            self.assertEqual(self.places.resolve({**self.point, 'name': 'Private photo', 'person': 'Ana'}), self.result)
        request = fetch.call_args.args[0]
        self.assertEqual(request.full_url, 'https://example.test/reverse?lat=41.3850&lon=2.1730&limit=1')
        self.assertIn('RaspberryMiniTV', request.headers['User-agent'])
        self.assertEqual(fetch.call_args.kwargs['timeout'], 5)


if __name__ == '__main__': unittest.main()
