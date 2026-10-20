import io
from importlib.machinery import ModuleSpec
from pathlib import Path
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import Mock, patch

from PIL import Image
from werkzeug.datastructures import FileStorage

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from photo_library import PhotoLibrary, PhotoError, create_photo_blueprint


class Encoding(list):
    def tolist(self): return list(self)


class PeopleAnalysisTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.store = PhotoLibrary(Path(temp.name) / 'Pictures')
        self.engine = types.ModuleType('face_recognition')
        self.engine.__spec__ = ModuleSpec('face_recognition', loader=None)
        self.engine.face_encodings = Mock(return_value=[Encoding([0.] * 128)])
        # Exercise decoding, queueing and persistence without installing the optional ML runtime.
        arrays = types.ModuleType('numpy')
        arrays.asarray = lambda image: image
        patcher = patch.dict(sys.modules, {'face_recognition': self.engine, 'numpy': arrays})
        patcher.start(); self.addCleanup(patcher.stop)
        self.release = threading.Event()
        self.addCleanup(self.finish_worker)

    def finish_worker(self):
        self.release.set()
        self.wait_idle()

    def wait_idle(self, store=None):
        store = store or self.store
        self.assertTrue(store.face_lock.acquire(timeout=5), 'Face worker did not finish')
        store.face_lock.release()
        self.assertFalse(store.faces_running)

    def upload(self, count=3):
        files = []
        for index in range(count):
            stream = io.BytesIO()
            Image.new('RGB', (120, 80), (index * 60, 20, 30)).save(stream, 'JPEG')
            stream.seek(0)
            files.append(FileStorage(stream=stream, filename=f'{index}.jpg'))
        self.store.upload(files, 'Fotos')
        return self.store.snapshot()['photos']

    def test_explicit_scan_includes_skipped_imports_but_keeps_imported_names_and_generated_photos(self):
        photos = self.upload(4)
        self.assertFalse(self.store.faces_running)
        self.assertEqual(self.store.snapshot()['faces']['state'], 'idle')
        with self.store.db() as db:
            db.execute("UPDATE photos SET face_state='skip' WHERE id=?", (photos[0]['id'],))
            db.execute("UPDATE photos SET face_state='imported' WHERE id=?", (photos[1]['id'],))
            db.execute("UPDATE photos SET source='original', style='lego' WHERE id=?", (photos[2]['id'],))
        self.store.start_faces(); self.wait_idle()
        result = self.store.snapshot()
        self.assertEqual(self.engine.face_encodings.call_count, 2)
        self.assertEqual((result['faces']['state'], result['faces']['done'], result['faces']['total'], result['faces']['percent']), ('complete', 2, 2, 100))
        self.assertEqual(len(result['people']), 1)
        self.assertEqual(set(result['people'][0]['photoIds']), {photos[0]['id'], photos[3]['id']})
        self.store.start_faces(); self.wait_idle()
        self.assertEqual(self.engine.face_encodings.call_count, 2)
        self.assertEqual(self.store.snapshot()['faces']['percent'], 100)

    def test_pause_finishes_current_photo_and_resume_after_restart_retains_progress(self):
        self.upload()
        entered = threading.Event()
        def encode(image):
            entered.set()
            self.assertTrue(self.release.wait(5))
            return [Encoding([0.] * 128)]
        self.engine.face_encodings.side_effect = encode
        self.store.start_faces()
        self.assertTrue(entered.wait(5))
        self.store.pause_faces()
        self.assertTrue(self.store.snapshot()['faces']['pausing'])
        self.release.set(); self.wait_idle()
        faces = self.store.snapshot()['faces']
        self.assertEqual((faces['state'], faces['done'], faces['total'], faces['percent']), ('paused', 1, 3, 33))
        self.store.sync()  # Opening/scanning the library must not undo Pause.
        self.assertFalse(self.store.faces_running)
        self.assertEqual(self.engine.face_encodings.call_count, 1)
        restored = PhotoLibrary(self.store.root)
        self.assertEqual(restored.snapshot()['faces']['done'], 1)
        restored.start_faces(); self.wait_idle(restored)
        self.assertEqual(self.engine.face_encodings.call_count, 3)
        self.assertEqual(restored.snapshot()['faces']['percent'], 100)

    def test_restart_marks_running_job_paused_and_does_not_restart_computation(self):
        self.upload()
        with patch('photo_library.threading.Thread'):
            self.store.start_faces()
        self.store.faces_running = False; self.store.face_lock.release()
        restored = PhotoLibrary(self.store.root)
        faces = restored.snapshot()['faces']
        self.assertEqual((faces['state'], faces['remaining']), ('paused', 3))
        self.assertFalse(restored.faces_running)
        restored.start_faces(); self.wait_idle(restored)
        self.assertEqual(restored.snapshot()['faces']['done'], 3)

    def test_people_can_be_named_and_given_a_cover_while_more_matches_arrive(self):
        self.upload()
        entered = threading.Event()
        def encode(image):
            if self.engine.face_encodings.call_count == 2:
                entered.set()
                self.assertTrue(self.release.wait(5))
            return [Encoding([0.] * 128)]
        self.engine.face_encodings.side_effect = encode
        self.store.start_faces()
        self.assertTrue(entered.wait(5))
        partial = self.store.snapshot()
        person = partial['people'][0]
        self.assertEqual(partial['faces']['done'], 1)
        self.assertEqual(len(person['photoIds']), 1)
        self.store.rename_person(person['id'], 'Ana')
        self.store.set_person_cover(person['id'], person['photoIds'][0])
        self.release.set(); self.wait_idle()
        saved = PhotoLibrary(self.store.root).snapshot()['people'][0]
        self.assertEqual((saved['name'], saved['coverPhotoId']), ('Ana', person['photoIds'][0]))
        self.assertEqual(len(saved['photoIds']), 3)

    def test_duplicate_start_and_rapid_pause_resume_use_one_worker(self):
        self.upload()
        entered = threading.Event()
        def encode(image):
            entered.set(); self.assertTrue(self.release.wait(5))
            return [Encoding([0.] * 128)]
        self.engine.face_encodings.side_effect = encode
        self.store.start_faces(); self.assertTrue(entered.wait(5))
        self.store.start_faces(); self.store.pause_faces(); self.store.start_faces()
        self.release.set(); self.wait_idle()
        self.assertEqual(self.engine.face_encodings.call_count, 3)
        self.assertEqual(self.store.snapshot()['faces']['percent'], 100)

    def test_failed_photo_does_not_block_progress_and_retry_only_processes_failures(self):
        self.upload()
        self.engine.face_encodings.side_effect = [ValueError('Bad image'), [], [Encoding([0.] * 128)]]
        self.store.start_faces(); self.wait_idle()
        faces = self.store.snapshot()['faces']
        self.assertEqual((faces['state'], faces['done'], faces['total'], faces['failed'], faces['pending']), ('complete', 3, 3, 1, 1))
        self.engine.face_encodings.side_effect = None
        self.store.start_faces(); self.wait_idle()
        faces = self.store.snapshot()['faces']
        self.assertEqual((faces['total'], faces['done'], faces['failed']), (1, 1, 0))
        self.assertEqual(self.engine.face_encodings.call_count, 4)

    def test_cover_requires_membership_and_is_cleared_on_removal_or_deletion(self):
        photos = self.upload()
        self.store.group_faces(photos[0]['id'], [[0.] * 128])
        self.store.group_faces(photos[1]['id'], [[0.] * 128])
        person = self.store.snapshot()['people'][0]
        with self.assertRaises(PhotoError): self.store.set_person_cover(person['id'], photos[2]['id'])
        self.store.set_person_cover(person['id'], photos[0]['id'])
        self.store.remove_matches(person['id'], [photos[0]['id']])
        self.assertIsNone(self.store.snapshot()['people'][0]['coverPhotoId'])
        self.store.set_person_cover(person['id'], photos[1]['id'])
        self.store.delete_photos([photos[1]['id']], 'gallery')
        with self.store.db() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM person_covers').fetchone()[0], 0)

    def test_engine_failure_preserves_pending_work_for_an_explicit_retry(self):
        self.upload()
        self.engine.face_encodings.side_effect = ImportError('Incomplete engine installation')
        self.store.start_faces(); self.wait_idle()
        faces = self.store.snapshot()['faces']
        self.assertEqual((faces['state'], faces['done'], faces['remaining']), ('error', 0, 3))
        self.assertTrue(faces['error'])
        self.engine.face_encodings.side_effect = None
        self.store.start_faces(); self.wait_idle()
        self.assertEqual(self.store.snapshot()['faces']['percent'], 100)

    def test_scan_pause_and_cover_api_validate_payloads(self):
        from flask import Flask
        app = Flask(__name__); app.register_blueprint(create_photo_blueprint(lambda: self.store))
        client = app.test_client()
        for route in ['people/scan', 'people/pause', 'people/example/cover']:
            self.assertEqual(client.post('/pictures/' + route, json=[]).status_code, 400)
        self.assertEqual(client.post('/pictures/people/example/cover', json={'photoId': 'missing'}).status_code, 409)
        with patch('photo_library.importlib.util.find_spec', return_value=None):
            self.assertEqual(client.post('/pictures/people/scan', json={}).status_code, 503)
        self.assertEqual(client.post('/pictures/people/scan', json={}).status_code, 202)
        self.assertEqual(client.post('/pictures/people/pause', json={}).status_code, 200)


if __name__ == '__main__': unittest.main()
