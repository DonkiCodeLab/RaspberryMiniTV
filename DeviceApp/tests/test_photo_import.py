import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from photo_library import PhotoLibrary, PhotoError
import test_photo_library as base
from test_photo_library import picture


def metadata(**overrides):
    data = {'title': 'Un día en la playa', 'description': 'Vacaciones', 'appleId': 'photo-1',
            'takenAt': '2024-08-02T17:25:00+02:00', 'latitude': 0, 'longitude': -3.7,
            'locationKnown': True, 'people': [{'id': 'person-1', 'name': 'Ana'}],
            'albums': ['Verano', 'Familia'], 'keywords': ['playa'], 'appleFavorite': True}
    data.update(overrides)
    return {'metadata': data, 'raw': {'uuid': 'photo-1', 'face_info': [{'center': [.5, .4]}], 'location': [0, -3.7]}}


def payload(*records, session='session-1', batch='0'):
    return {'session': session, 'batch': batch, 'records': list(records), 'preserveAlbums': True}


class PhotoImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.store = PhotoLibrary(Path(self.temp.name) / 'Pictures')
        worker = patch.object(self.store, 'start_faces'); worker.start(); self.addCleanup(worker.stop)

    def test_import_preserves_original_bytes_full_metadata_people_and_multi_album_membership(self):
        original = picture().read()
        self.store.upload([picture()], 'Mac', import_data=payload(metadata()))
        snap = self.store.snapshot(); photo = snap['photos'][0]
        self.assertEqual(self.store.safe_file(photo['relativePath']).read_bytes(), original)
        self.assertEqual(photo['latitude'], 0); self.assertEqual(photo['longitude'], -3.7)
        self.assertEqual(photo['takenAt'], '2024-08-02T17:25:00+02:00')
        self.assertEqual(len(photo['folderIds']), 2); self.assertTrue(photo['appleFavorite'])
        self.assertEqual(snap['people'][0]['name'], 'Ana'); self.assertEqual(snap['people'][0]['photoIds'], [photo['id']])
        with self.store.db() as db:
            self.assertEqual(db.execute('SELECT face_state FROM photos').fetchone()[0], 'imported')
            raw = json.loads(db.execute('SELECT data FROM photo_metadata').fetchone()[0])
        self.assertEqual(raw, metadata()['raw'])
        self.assertNotIn('face_info', json.dumps(snap))

    def test_lost_response_retry_and_multiple_batches_are_idempotent(self):
        first = self.store.upload([picture()], 'Mac', import_data=payload(metadata()))
        retry = self.store.upload([picture()], 'Mac', import_data=payload(metadata()))
        self.assertEqual(first, retry)
        second = self.store.upload([picture(color='blue')], 'Mac', import_data=payload(metadata(), batch='1'))
        self.assertEqual(first['folderId'], second['folderId'])
        again = self.store.upload([picture()], 'Mac again', import_data=payload(metadata(), session='session-2'))
        self.assertEqual(again['duplicates'], 1); self.assertEqual(again['imported'], 0)
        self.assertEqual(len(self.store.snapshot()['photos']), 2)
        self.assertEqual(len(list(self.store.root.rglob('*.jpg'))), 2)

    def test_same_names_different_apple_ids_remain_distinct_and_never_match_empty_encodings(self):
        self.store.upload([picture()], 'Mac', import_data=payload(metadata(people=[{'id': 'a', 'name': 'Ana'}, {'id': 'b', 'name': 'Ana'}])))
        self.store.upload([picture(color='blue')], 'Ordinary')
        photo = next(p for p in self.store.snapshot()['photos'] if not p.get('appleId'))
        self.store.group_faces(photo['id'], [[0.0] * 128])
        self.assertEqual(len(self.store.snapshot()['people']), 3)
        self.assertFalse(any(photo['id'] in p['photoIds'] for p in self.store.snapshot()['people'] if p['name'] == 'Ana'))

    def test_invalid_metadata_rolls_back_all_inputs(self):
        for invalid in [metadata(latitude=91), metadata(people='Ana'), metadata(takenAt='invalid'),
                        metadata(albums=['x' * 201]), metadata(latitude=True), metadata(title=123)]:
            with self.assertRaises(PhotoError): self.store.upload([picture()], 'Invalid', import_data=payload(invalid))
        self.assertEqual(self.store.snapshot()['photos'], [])
        self.assertEqual(list(self.store.root.iterdir()), [])

    def test_reserved_client_fields_cannot_overwrite_server_paths_or_dimensions(self):
        self.store.upload([picture()], 'Mac', import_data=payload(metadata(relativePath='../secret', id='fake', width=1)))
        photo = self.store.snapshot()['photos'][0]
        self.assertEqual(photo['width'], 100); self.assertNotEqual(photo['id'], 'fake')
        self.assertNotIn('..', photo['relativePath'])

    def test_bad_image_rolls_back_import_session_and_dedup_records(self):
        from werkzeug.datastructures import FileStorage
        invalid = FileStorage(stream=io.BytesIO(b'bad'), filename='bad.jpg')
        with self.assertRaises(PhotoError):
            self.store.upload([picture(), invalid], 'Mac', import_data=payload(metadata(), metadata()))
        with self.store.db() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM photo_import_sessions').fetchone()[0], 0)
            self.assertEqual(db.execute('SELECT count(*) FROM photo_import_files').fetchone()[0], 0)
        self.assertEqual(list(self.store.root.iterdir()), [])


class PhotoImportAPITests(base.PhotoApiTests):
    def test_multipart_roundtrip_and_metadata_download_require_pin(self):
        response = self.client.post('/pictures/upload', headers=self.headers, data={
            'albumName': 'Mac', 'files': (picture().stream, 'a.jpg'),
            'metadata': (io.BytesIO(json.dumps(payload(metadata())).encode()), 'metadata.json')})
        self.assertEqual(response.status_code, 200, response.json)
        photo = self.store.snapshot()['photos'][0]
        route = '/pictures/metadata/' + photo['id']
        self.assertEqual(self.client.get(route).status_code, 401)
        exported = self.client.get(route, headers=self.headers)
        self.assertEqual(exported.json, metadata()['raw'])
        self.assertEqual(exported.headers['Cache-Control'], 'no-store')

    def test_invalid_metadata_file_rejected_before_saving_photos(self):
        response = self.client.post('/pictures/upload', headers=self.headers, data={
            'albumName': 'Mac', 'files': (picture().stream, 'a.jpg'),
            'metadata': (io.BytesIO(b'invalid'), 'metadata.json')})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.store.snapshot()['photos'], [])


if __name__ == '__main__': unittest.main()
