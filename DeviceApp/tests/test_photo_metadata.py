import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from flask import Flask

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from photo_library import PhotoLibrary, create_photo_blueprint
from test_photo_library import picture


class PhotoMetadataTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.store = PhotoLibrary(Path(temp.name) / 'Pictures')
        with patch.object(self.store, 'start_faces'):
            self.store.upload([picture()], 'Test')
        self.photo = self.store.snapshot()['photos'][0]
        self.route = f"/pictures/photos/{self.photo['id']}/metadata"
        app = Flask(__name__)
        app.register_blueprint(create_photo_blueprint(lambda: self.store))
        self.client = app.test_client()

    def test_date_and_location_persist_without_changing_original_or_face_links(self):
        face = self.store.add_face(self.photo['id'], {'name': 'Ana', 'box': {'x': .1, 'y': .1, 'width': .2, 'height': .2}})
        original = self.store.safe_file(self.photo['relativePath']).read_bytes()
        before = self.store.status()['revision']
        for data in [{'takenAt': '1960-02-29'}, {'latitude': 0, 'longitude': -180}]:
            response = self.client.post(self.route, json=data)
            self.assertEqual(response.status_code, 200, response.json)
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.assertNotEqual(self.store.status()['revision'], before)
        restored = PhotoLibrary(self.store.root)
        restored.sync()
        photo = restored.snapshot()['photos'][0]
        self.assertEqual(photo['takenAt'], '1960-02-29')
        self.assertEqual((photo['latitude'], photo['longitude']), (0, -180))
        self.assertEqual(photo['uploadedAt'], self.photo['uploadedAt'])
        self.assertEqual(photo['width'], self.photo['width'])
        self.assertEqual(restored.safe_file(photo['relativePath']).read_bytes(), original)
        self.assertEqual(restored.photo_faces(photo['id'])['faces'][0]['id'], face['faceId'])

    def test_changing_date_preserves_capture_time_offset_and_other_metadata(self):
        with self.store.db() as db:
            metadata = json.loads(db.execute('SELECT metadata FROM photos WHERE id=?', (self.photo['id'],)).fetchone()[0])
            metadata.update(takenAt='2022-08-17T23:45:12-07:00', latitude=41.3, longitude=2.1, title='Vacaciones')
            db.execute('UPDATE photos SET metadata=? WHERE id=?', (json.dumps(metadata), self.photo['id']))
        response = self.client.post(self.route, json={'takenAt': '1985-01-03'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['metadata'], {**metadata, 'takenAt': '1985-01-03T23:45:12-07:00'})

    def test_invalid_patches_are_atomic(self):
        before = self.store.snapshot()['photos']
        revision = self.store.status()['revision']
        for data in [{}, [], None, {'takenAt': '2023-02-29'}, {'takenAt': '0000-01-01'}, {'takenAt': '2024-02-30'},
                     {'takenAt': '2024-1-2'}, {'takenAt': '2024-01-02T00:00:00Z'}, {'takenAt': None},
                     {'latitude': 0}, {'longitude': 0}, {'latitude': True, 'longitude': 0},
                     {'latitude': '41', 'longitude': 2}, {'latitude': 91, 'longitude': 0},
                     {'latitude': 0, 'longitude': -181}, {'latitude': None, 'longitude': None},
                     {'latitude': float('inf'), 'longitude': 0}, {'latitude': 0, 'longitude': float('nan')},
                     {'takenAt': '2024-01-01', 'latitude': 300, 'longitude': 0}, {'name': 'Renamed'}]:
            with self.subTest(data=data):
                response = self.client.post(self.route, json=data)
                self.assertEqual(response.status_code, 400, response.json)
                self.assertEqual(self.store.snapshot()['photos'], before)
                self.assertEqual(self.store.status()['revision'], revision)

    def test_deleted_photo_cannot_be_updated(self):
        response = self.client.post('/pictures/photos/missing/metadata', json={'takenAt': '2024-10-25'})
        self.assertEqual(response.status_code, 404)


if __name__ == '__main__':
    unittest.main()
