import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from flask import Flask
from PIL import Image
from werkzeug.datastructures import FileStorage

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from photo_library import PhotoLibrary, PhotoError, create_photo_blueprint, UNKNOWN_PERSON_ID


class PeopleReviewTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.store = PhotoLibrary(Path(temp.name) / 'Pictures')
        files = []
        for i in range(4):
            stream = io.BytesIO(); Image.new('RGB', (120, 80), (i, 0, 30)).save(stream, 'PNG'); stream.seek(0)
            files.append(FileStorage(stream=stream, filename=f'{i}.png'))
        self.store.upload(files, 'Fotos')
        self.photos = sorted(self.store.snapshot()['photos'], key=lambda photo: photo['name'])
        self.ids = [photo['id'] for photo in self.photos]
        box = json.dumps({'x': .1, 'y': .2, 'width': .2, 'height': .3})
        with self.store.db() as db:
            for i, person in enumerate(['rename', 'merge', 'remove', 'delete', 'shared', 'untouched', 'target']):
                db.execute('INSERT INTO people VALUES (?,?,0)', (person, 'Ana' if person == 'target' else f'Persona {i+1}'))
            links = [('rename', 0), ('merge', 1), ('remove', 1), ('delete', 2), ('shared', 2), ('target', 2), ('target', 3), ('untouched', 3)]
            for person, index in links:
                db.execute('INSERT INTO face_detections VALUES (?,?,?,?,?,0)', (person+str(index), self.ids[index], person, '[]', box))
                db.execute('INSERT INTO faces VALUES (?,?,?)', (self.ids[index], person, '[]'))
            db.execute('INSERT INTO person_covers VALUES (?,?)', ('target', self.ids[3]))
            db.execute('INSERT INTO photo_metadata VALUES (?,?)', (self.ids[2], '{}'))
            db.execute('INSERT INTO photo_import_files VALUES (?,?)', ('digest', self.ids[2]))
        app = Flask(__name__); app.register_blueprint(create_photo_blueprint(lambda: self.store))
        self.client = app.test_client()
        self.changes = [{'id': 'rename', 'action': 'rename', 'name': ' Luis '},
                        {'id': 'merge', 'action': 'merge', 'personId': 'target'},
                        {'id': 'remove', 'action': 'delete'},
                        {'id': 'delete', 'action': 'deletePhotos', 'photoIds': [self.ids[2]]},
                        {'id': 'shared', 'action': 'deletePhotos', 'photoIds': [self.ids[2]]}]
        self.request_id = 'review-test-00001'

    def post(self, changes=None, request_id=None):
        return self.client.post('/pictures/people/review', json={'requestId': request_id or self.request_id, 'changes': self.changes if changes is None else changes})

    def assert_unchanged(self):
        with self.store.db() as db:
            self.assertEqual(db.execute('SELECT name FROM people WHERE id="rename"').fetchone()[0], 'Persona 1')
            self.assertEqual(db.execute('SELECT COUNT(*) FROM person_review_batches').fetchone()[0], 0)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM photo_deleted_files').fetchone()[0], 0)
        for photo in self.photos: self.assertTrue((self.store.root / photo['relativePath']).exists())

    def test_mixed_batch_keeps_other_cards_and_deletes_shared_original_once(self):
        response = self.post(); self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json, {'ok': True, 'applied': 5, 'deletedPhotos': 1, 'cleanupPending': 0})
        snapshot = self.store.snapshot()
        people = {person['id']: person for person in snapshot['people']}
        self.assertEqual(people['rename']['name'], 'Luis')
        self.assertNotIn('merge', people); self.assertNotIn('remove', people)
        self.assertEqual(people[UNKNOWN_PERSON_ID]['photoIds'], [self.ids[1]])
        self.assertEqual(set(people['target']['photoIds']), {self.ids[1], self.ids[3]})
        self.assertEqual(people['target']['coverPhotoId'], self.ids[3])
        self.assertEqual(people['untouched']['name'], 'Persona 6')
        self.assertEqual({photo['id'] for photo in snapshot['photos']}, set(self.ids)-{self.ids[2]})
        self.assertFalse((self.store.root / self.photos[2]['relativePath']).exists())
        self.assertTrue((self.store.root / self.photos[1]['relativePath']).exists())
        faces = self.store.photo_faces(self.ids[1])['faces']
        self.assertEqual({face['personId'] for face in faces}, {'target', UNKNOWN_PERSON_ID})
        self.assertTrue(all(face['manual'] for face in faces))
        with self.store.db() as db:
            for table in ['photo_metadata', 'photo_import_files', 'photo_albums', 'face_detections']:
                self.assertEqual(db.execute(f'SELECT COUNT(*) FROM {table} WHERE photo=?', (self.ids[2],)).fetchone()[0], 0)

    def test_retry_after_restart_returns_receipt_without_reapplying(self):
        original = self.post().json
        restored = PhotoLibrary(self.store.root)
        self.assertEqual(restored.review_people(self.changes, self.request_id), original)
        with self.assertRaises(PhotoError) as caught:
            restored.review_people([{'id': 'untouched', 'action': 'delete'}], self.request_id)
        self.assertEqual(caught.exception.status, 409)
        self.assertTrue(any(person['id'] == 'untouched' for person in restored.snapshot()['people']))

    def test_all_changes_are_validated_before_any_write(self):
        invalid = [None, {}, {'id': 'missing', 'action': 'delete'}, {'id': 'target', 'action': 'delete'},
                   {'id': UNKNOWN_PERSON_ID, 'action': 'delete'}, {'id': 'merge', 'action': 'merge', 'personId': 'untouched'},
                   {'id': 'merge', 'action': 'merge', 'personId': 'missing'},
                   {'id': 'merge', 'action': 'rename', 'name': 'Persona 42'},
                   {'id': 'merge', 'action': 'rename', 'name': '../x'},
                   {'id': 'merge', 'action': 'delete', 'name': 'Extra'},
                   {'id': 'rename', 'action': 'delete'},
                   {'id': 'delete', 'action': 'deletePhotos', 'photoIds': [self.ids[3]]},
                   {'id': 'delete', 'action': 'deletePhotos', 'photoIds': []}]
        for change in invalid:
            with self.subTest(change=change):
                response = self.post([self.changes[0], change])
                self.assertIn(response.status_code, (400, 404, 409), response.json)
                self.assert_unchanged()

    def test_photo_added_since_staging_aborts_entire_batch(self):
        with self.store.db() as db: db.execute('INSERT INTO faces VALUES (?,?,?)', (self.ids[3], 'delete', '[]'))
        self.assertEqual(self.post().status_code, 409)
        self.assert_unchanged()

    def test_write_failure_rolls_back_before_file_cleanup(self):
        original = self.store._delete_photo_rows
        def fail(db, ids):
            original(db, ids)
            raise RuntimeError('simulated storage failure')
        with patch.object(self.store, '_delete_photo_rows', side_effect=fail):
            with self.assertRaises(RuntimeError): self.store.review_people(self.changes, self.request_id)
        self.assert_unchanged()
        self.assertEqual(self.post().status_code, 200)

    def test_unlink_failure_is_reported_and_safe_to_retry(self):
        with patch.object(self.store, 'cleanup_deleted', return_value=1):
            self.assertEqual(self.post().json['cleanupPending'], 1)
        self.assertEqual(self.post().json['cleanupPending'], 0)
        self.assertFalse((self.store.root / self.photos[2]['relativePath']).exists())


if __name__ == '__main__': unittest.main()
