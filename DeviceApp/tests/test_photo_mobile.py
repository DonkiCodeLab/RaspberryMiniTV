import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from photo_mobile import PhotoMobilePairings
from photo_library import PhotoError
import test_photo_library as base
from test_photo_library import picture


class PairingTests(unittest.TestCase):
    def setUp(self):
        self.now = 1000
        self.store = PhotoMobilePairings(clock=lambda: self.now)
        self.pair = self.store.create('pin')

    def claim(self, client='installation-123456'):
        return self.store.claim(self.pair['code'], client, 'Mi iPhone', 'pin')

    def test_repeated_claim_is_idempotent_but_other_phone_cannot_reuse_qr(self):
        first = self.claim()
        self.assertEqual(first, self.claim())
        self.assertNotIn('pin', first)
        self.assertEqual(self.store.status(self.pair['id'], 'pin')['state'], 'connected')
        with self.assertRaises(PhotoError) as error: self.claim('another-installation')
        self.assertEqual(error.exception.status, 409)

    def test_concurrent_claim_has_one_winner(self):
        def claim(client):
            try: return self.claim(client)['token']
            except PhotoError: return None
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(claim, ['installation-11111', 'installation-22222']))
        self.assertEqual(sum(value is not None for value in results), 1)

    def test_expiration_scope_pin_rotation_and_revocation(self):
        token = self.claim()['token']
        self.now += 301
        with self.assertRaises(PhotoError): self.claim()
        self.assertTrue(self.store.authorized(token, 'pin', 'POST', '/pictures/upload'))
        self.assertFalse(self.store.authorized(token, 'new-pin', 'POST', '/pictures/upload'))
        for method, path in [('GET', '/pictures/content'), ('POST', '/pictures/photos/delete'),
                             ('POST', '/pictures/mobile/pairing'), ('GET', '/settings/ai'), ('GET', '/pictures/upload')]:
            self.assertFalse(self.store.authorized(token, 'pin', method, path))
        self.store.revoke(ident=self.pair['id'])
        self.assertFalse(self.store.authorized(token, 'pin', 'POST', '/pictures/upload'))
        self.pair = self.store.create('pin'); token = self.claim()['token']
        self.now += 86401
        self.assertFalse(self.store.authorized(token, 'pin', 'POST', '/pictures/upload'))

    def test_bad_and_expired_codes_are_rejected(self):
        for code in [None, [], 'bad', 'x' * 43]:
            with self.subTest(code=code), self.assertRaises(PhotoError):
                self.store.claim(code, 'installation-123456', 'Phone', 'pin')
        self.now += 301
        with self.assertRaises(PhotoError): self.claim()


class MobileAPITests(unittest.TestCase):
    def setUp(self):
        base.PhotoApiTests.setUp(self)
        self.pairings = self.api.photo_mobile_pairings
        with self.pairings.lock: self.pairings.pairs.clear()

    def pair(self):
        response = self.client.post('/pictures/mobile/pairing', headers=self.headers, json={})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.assertNotIn('test', response.json.values())
        pair = response.json
        response = self.client.post('/pictures/mobile/claim', json={'code': pair['code'], 'clientId': 'installation-123456', 'deviceName': 'iPhone'})
        self.assertEqual(response.status_code, 200)
        return pair, {'Authorization': 'Bearer ' + response.json['token']}

    def test_pairing_routes_and_phone_scope(self):
        self.assertEqual(self.client.post('/pictures/mobile/pairing', json={}).status_code, 401)
        self.assertEqual(self.client.post('/pictures/mobile/claim', json={}).status_code, 400)
        pair, headers = self.pair()
        self.assertEqual(self.client.get('/pictures/mobile/session', headers=headers).status_code, 200)
        self.assertEqual(self.client.get('/pictures/mobile/pairing/' + pair['id'], headers=self.headers).json['state'], 'connected')
        for path, method in [('/pictures/library', 'get'), ('/pictures/content', 'get'),
                             ('/pictures/photos/delete', 'post'), ('/settings/ai', 'get'),
                             ('/pictures/mobile/revoke', 'post'), ('/pictures/mobile/pairing', 'post')]:
            self.assertEqual(getattr(self.client, method)(path, headers=headers).status_code, 401, path)
        self.assertEqual(self.client.post('/pictures/mobile/disconnect', headers=headers).status_code, 200)
        self.assertEqual(self.client.get('/pictures/mobile/session', headers=headers).status_code, 401)

    def test_native_manifest_upload_duplicate_preflight_and_lost_response(self):
        _, headers = self.pair()
        digest = hashlib.sha256(picture().read()).hexdigest()
        self.assertEqual(self.client.post('/pictures/import/check', headers=headers, json={'digests': [digest]}).json, {'missing': [0]})
        manifest = {'session': 'ios-test', 'batch': '0-' + digest, 'digests': [digest], 'fileIndices': [0],
                    'continueOnError': True, 'preserveAlbums': False,
                    'records': [{'metadata': {'appleId': 'phone-asset', 'takenAt': '2026-10-24T12:00:00Z',
                                              'locationKnown': True, 'latitude': 0, 'longitude': 0, 'appleFavorite': True}, 'raw': {'device': 'iPhone'}}]}
        import io
        def upload(data, send_file):
            body = {'metadata': (io.BytesIO(json.dumps(data).encode()), 'metadata.json')}
            if send_file: body['files'] = (picture().stream, 'IMG_0001.JPG')
            return self.client.post('/pictures/upload', headers=headers, data=body)
        first = upload(manifest, True)
        self.assertEqual(first.status_code, 200, first.json)
        self.assertEqual((first.json['imported'], first.json['duplicates']), (1, 0))
        self.assertEqual(self.client.post('/pictures/import/check', headers=headers, json={'digests': [digest]}).json, {'missing': []})
        # App killed after commit: same batch returns the original count even without image bytes.
        retry = {**manifest, 'fileIndices': [], 'records': [{'metadata': None, 'raw': None}]}
        self.assertEqual(upload(retry, False).json, first.json)
        repeat = upload({**retry, 'session': 'next-import'}, False)
        self.assertEqual((repeat.json['imported'], repeat.json['duplicates']), (0, 1))
        photos = self.store.snapshot()['photos']
        self.assertEqual(len(photos), 1)
        self.assertEqual(photos[0]['latitude'], 0)
        self.assertTrue(photos[0]['appleFavorite'])
        self.assertEqual(self.store.safe_file(first.json['saved'][0]).read_bytes(), picture().read())

    def test_heic_original_when_photo_support_is_installed(self):
        try:
            from pillow_heif import register_heif_opener
        except ImportError:
            self.skipTest('Install requirements-photos.txt to exercise HEIC')
        import io
        from PIL import Image
        register_heif_opener()
        buffer = io.BytesIO()
        Image.new('RGB', (120, 80), 'gold').save(buffer, format='HEIF')
        original = buffer.getvalue()
        digest = hashlib.sha256(original).hexdigest()
        _, headers = self.pair()
        manifest = {'session': 'ios-heic', 'batch': '0-' + digest, 'digests': [digest], 'fileIndices': [0],
                    'records': [{'metadata': None, 'raw': None}], 'continueOnError': True}
        response = self.client.post('/pictures/upload', headers=headers, data={
            'metadata': (io.BytesIO(json.dumps(manifest).encode()), 'metadata.json'),
            'files': (io.BytesIO(original), 'IMG_0001.HEIC')})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json['imported'], 1, response.json)
        self.assertEqual(self.store.safe_file(response.json['saved'][0]).read_bytes(), original)


if __name__ == '__main__': unittest.main()
