import io
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import Mock, patch

from PIL import Image
from werkzeug.datastructures import FileStorage

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from photo_library import PhotoLibrary, PhotoError, create_photo_blueprint
from photo_faces import FacePaused, FaceEngineError


class PeopleAnalysisTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.store = PhotoLibrary(Path(temp.name) / 'Pictures')
        self.engine = Mock()
        self.engine.encode.return_value = [[0.] * 128]
        # The separate engine process is tested in test_photo_faces.py.
        patcher = patch('photo_library.LocalFaceEngine', return_value=self.engine)
        patched_engine = patcher.start(); self.addCleanup(patcher.stop)
        patched_engine.available.return_value = True
        rest = patch.object(PhotoLibrary, '_face_rest')
        rest.start(); self.addCleanup(rest.stop)
        self.release = threading.Event()
        self.addCleanup(self.finish_worker)

    def finish_worker(self):
        self.release.set()
        self.store.pause_faces()
        self.wait_idle()

    def wait_idle(self, store=None):
        store = store or self.store
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            self.assertTrue(store.face_lock.acquire(timeout=5), 'Face worker did not finish')
            store.face_lock.release()
            with store.lock:
                if not store.faces_running and not store.single_face_running: return
            time.sleep(.01)
        self.fail('Face worker did not finish')

    def upload(self, count=3):
        files = []
        for index in range(count):
            stream = io.BytesIO()
            Image.new('RGB', (120, 80), (index % 256, index // 256, 30)).save(stream, 'PNG')
            stream.seek(0)
            files.append(FileStorage(stream=stream, filename=f'{index}.png'))
        self.store.upload(files, 'Fotos')
        return self.store.snapshot()['photos']

    def test_scan_uses_all_local_originals_including_apple_labels_but_excludes_generated_photos(self):
        photos = self.upload(4)
        self.assertFalse(self.store.faces_running)
        self.assertEqual(self.store.snapshot()['faces']['state'], 'idle')
        with self.store.db() as db:
            db.execute("UPDATE photos SET face_state='skip' WHERE id=?", (photos[0]['id'],))
            db.execute("UPDATE photos SET face_state='imported' WHERE id=?", (photos[1]['id'],))
            db.execute("INSERT INTO people VALUES ('apple-old','Apple name',0)")
            db.execute("INSERT INTO faces VALUES (?,'apple-old','[]')", (photos[1]['id'],))
            db.execute("UPDATE photos SET source='original', style='lego' WHERE id=?", (photos[2]['id'],))
        self.assertEqual(self.store.snapshot()['people'], [])
        self.assertEqual(self.store.snapshot()['faces']['total'], 3)
        self.store.start_faces(); self.wait_idle()
        result = self.store.snapshot()
        self.assertEqual(self.engine.encode.call_count, 3)
        self.assertEqual((result['faces']['state'], result['faces']['done'], result['faces']['total'], result['faces']['percent']), ('complete', 3, 3, 100))
        self.assertEqual(len(result['people']), 1)
        self.assertNotEqual(result['people'][0]['name'], 'Apple name')
        self.assertEqual(set(result['people'][0]['photoIds']), {photos[i]['id'] for i in (0, 1, 3)})
        self.store.start_faces(); self.wait_idle()
        self.assertEqual(self.engine.encode.call_count, 3)
        self.assertEqual(self.store.snapshot()['faces']['percent'], 100)

    def test_pause_interrupts_current_photo_and_resume_after_restart_retains_progress(self):
        self.upload()
        entered = threading.Event()
        def encode(path, stop):
            if self.engine.encode.call_count == 2:
                entered.set()
                self.assertTrue(stop.wait(5))
                raise FacePaused()
            return [[0.] * 128]
        self.engine.encode.side_effect = encode
        self.store.start_faces()
        self.assertTrue(entered.wait(5))
        self.store.pause_faces()
        self.wait_idle()
        faces = self.store.snapshot()['faces']
        self.assertEqual((faces['state'], faces['done'], faces['total'], faces['percent']), ('paused', 1, 3, 33))
        self.store.sync()  # Opening/scanning the library must not undo Pause.
        self.assertFalse(self.store.faces_running)
        self.assertEqual(self.engine.encode.call_count, 2)
        restored = PhotoLibrary(self.store.root)
        self.assertEqual(restored.snapshot()['faces']['done'], 1)
        restored.start_faces(); self.wait_idle(restored)
        self.assertEqual(self.engine.encode.call_count, 4)
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
        def encode(path, stop):
            if self.engine.encode.call_count == 2:
                entered.set()
                self.assertTrue(self.release.wait(5))
            return [[0.] * 128]
        self.engine.encode.side_effect = encode
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
        def encode(path, stop):
            entered.set(); self.assertTrue(self.release.wait(5))
            return [[0.] * 128]
        self.engine.encode.side_effect = encode
        self.store.start_faces(); self.assertTrue(entered.wait(5))
        self.store.start_faces(); self.store.pause_faces(); self.store.start_faces()
        self.release.set(); self.wait_idle()
        self.assertEqual(self.engine.encode.call_count, 4)
        self.assertEqual(self.store.snapshot()['faces']['percent'], 100)

    def test_failed_photo_does_not_block_progress_and_retry_only_processes_failures(self):
        self.upload()
        self.engine.encode.side_effect = [ValueError('Bad image'), [], [[0.] * 128]]
        self.store.start_faces(); self.wait_idle()
        faces = self.store.snapshot()['faces']
        self.assertEqual((faces['state'], faces['done'], faces['total'], faces['failed'], faces['pending']), ('complete', 3, 3, 1, 1))
        self.engine.encode.side_effect = None
        self.store.start_faces(); self.wait_idle()
        faces = self.store.snapshot()['faces']
        self.assertEqual((faces['total'], faces['done'], faces['failed']), (1, 1, 0))
        self.assertEqual(self.engine.encode.call_count, 4)

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
        self.engine.encode.side_effect = FaceEngineError('Incomplete engine installation')
        self.store.start_faces(); self.wait_idle()
        faces = self.store.snapshot()['faces']
        self.assertEqual((faces['state'], faces['done'], faces['remaining']), ('error', 0, 3))
        self.assertTrue(faces['error'])
        self.engine.encode.side_effect = None
        self.store.start_faces(); self.wait_idle()
        self.assertEqual(self.store.snapshot()['faces']['percent'], 100)

    def test_scan_pause_and_cover_api_validate_payloads(self):
        from flask import Flask
        app = Flask(__name__); app.register_blueprint(create_photo_blueprint(lambda: self.store))
        client = app.test_client()
        for route in ['people/scan', 'people/pause', 'people/example/cover']:
            self.assertEqual(client.post('/pictures/' + route, json=[]).status_code, 400)
        self.assertEqual(client.post('/pictures/people/example/cover', json={'photoId': 'missing'}).status_code, 409)
        with patch('photo_library.LocalFaceEngine.available', return_value=False):
            self.assertEqual(client.post('/pictures/people/scan', json={}).status_code, 503)
        self.assertEqual(client.post('/pictures/people/scan', json={}).status_code, 202)
        self.assertEqual(client.post('/pictures/people/pause', json={}).status_code, 200)

    def test_pause_while_waiting_for_viewer_releases_worker_without_analyzing(self):
        self.upload(1)
        with self.store.image_lock:
            self.store.start_faces()
            self.store.pause_faces()
            self.wait_idle()
        self.engine.encode.assert_not_called()
        self.assertEqual(self.store.snapshot()['faces']['remaining'], 1)

    def test_heat_pauses_without_losing_queue_and_requires_explicit_resume(self):
        self.upload(2)
        with patch.object(self.store, '_face_temperature', return_value=76):
            self.store.start_faces(); self.wait_idle()
        faces = self.store.snapshot()['faces']
        self.assertEqual((faces['state'], faces['remaining'], faces['done']), ('paused', 2, 0))
        self.assertIn('temperatura', faces['error'])
        self.engine.encode.assert_not_called()
        self.store.start_faces(); self.wait_idle()
        self.assertEqual(self.store.snapshot()['faces']['done'], 2)

    def test_rest_is_interruptible_and_proportional_to_work(self):
        # Bypass the test fixture's no-rest mock to test the actual wait policy.
        self.store.face_stop = Mock()
        ORIGINAL_REST(self.store, 2.5)
        self.store.face_stop.wait.assert_called_once_with(2.5)
        self.store.face_stop.wait.reset_mock()
        ORIGINAL_REST(self.store, .01)
        self.store.face_stop.wait.assert_called_once_with(.25)

    def detections(self):
        return [{'encoding': [value] * 128, 'box': {'x': x, 'y': .2, 'width': .2, 'height': .3}}
                for value, x in [(0., .1), (1., .6)]]

    def test_batches_stop_at_100_and_require_a_new_start_for_the_remainder(self):
        self.upload(103)
        self.assertEqual((self.store.snapshot()['faces']['total'], self.store.snapshot()['faces']['pending']), (100, 103))
        self.engine.encode.return_value = []
        self.store.start_faces(); self.wait_idle()
        faces = self.store.snapshot()['faces']
        self.assertEqual((faces['state'], faces['done'], faces['total'], faces['pending']), ('complete', 100, 100, 3))
        self.assertEqual(self.engine.encode.call_count, 100)
        restored = PhotoLibrary(self.store.root)
        self.assertFalse(restored.faces_running)
        restored.start_faces(); self.wait_idle(restored)
        faces = restored.snapshot()['faces']
        self.assertEqual((faces['state'], faces['done'], faces['pending']), ('complete', 3, 0))
        self.assertEqual(self.engine.encode.call_count, 103)

    def test_boxes_persist_without_exposing_embeddings_and_multiple_faces_can_share_a_person(self):
        photo = self.upload(1)[0]
        self.store.group_faces(photo['id'], self.detections())
        details = self.store.photo_faces(photo['id'])
        self.assertEqual(len(details['faces']), 2)
        self.assertNotIn('encoding', str(details))
        self.assertEqual(details['faces'][0]['box'], self.detections()[0]['box'])
        a, b = details['faces']
        self.store.assign_face(photo['id'], a['id'], {'name': 'Ana'})
        ana = next(person for person in self.store.snapshot()['knownPeople'] if person['name'] == 'Ana')
        self.store.assign_face(photo['id'], b['id'], {'personId': ana['id']})
        snap = PhotoLibrary(self.store.root).snapshot()
        self.assertEqual(snap['photos'][0]['faceCount'], 2)
        self.assertEqual(len(snap['people']), 1)
        self.assertEqual(snap['people'][0]['photoIds'], [photo['id']])
        self.assertEqual({face['personId'] for face in self.store.photo_faces(photo['id'])['faces']}, {ana['id']})

    def test_reanalysis_preserves_manual_names_rectangles_and_covers_even_if_a_face_is_missed(self):
        photo = self.upload(1)[0]
        self.store.group_faces(photo['id'], self.detections())
        a, b = self.store.photo_faces(photo['id'])['faces']
        person = self.store.assign_face(photo['id'], a['id'], {'name': 'Nombre confirmado'})['personId']
        self.store.set_person_cover(person, photo['id'])
        self.store.group_faces(photo['id'], self.detections())
        self.assertEqual(self.store.photo_faces(photo['id'])['faces'][0]['personId'], person)
        self.store.group_faces(photo['id'], [])
        faces = self.store.photo_faces(photo['id'])['faces']
        self.assertEqual([face['id'] for face in faces], [a['id']])
        self.assertTrue(faces[0]['manual'])
        self.assertEqual(self.store.snapshot()['people'][0]['coverPhotoId'], photo['id'])
        self.assertEqual(self.store.snapshot()['photos'][0]['faceCount'], 1)

    def test_assignment_reuses_existing_name_and_rejects_stale_or_cross_photo_ids(self):
        photos = self.upload(2)
        for photo in photos: self.store.group_faces(photo['id'], self.detections())
        first = self.store.photo_faces(photos[0]['id'])['faces'][0]
        second = self.store.photo_faces(photos[1]['id'])['faces'][1]
        person = self.store.assign_face(photos[0]['id'], first['id'], {'name': 'Ana'})['personId']
        self.assertEqual(self.store.assign_face(photos[1]['id'], second['id'], {'name': '  ANA '})['personId'], person)
        for ident, data in [(first['id'], {'name': 'Intruso'}), (second['id'], {}), (second['id'], {'personId': 'missing'}),
                            (second['id'], {'name': ''}), (second['id'], {'name': 'Luis', 'personId': person})]:
            with self.assertRaises(PhotoError):
                self.store.assign_face(photos[1]['id'], ident, data)

    def test_no_face_results_distinguish_reviewed_photos_from_pending_errors_and_unassigned_faces(self):
        photos = self.upload(4)
        self.store.group_faces(photos[0]['id'], [])
        self.store.group_faces(photos[1]['id'], self.detections()[:1])
        face = self.store.photo_faces(photos[1]['id'])['faces'][0]
        self.store.remove_matches(face['personId'], [photos[1]['id']])
        with self.store.db() as db: db.execute("UPDATE photos SET face_state='error' WHERE id=?", (photos[2]['id'],))
        snap = self.store.snapshot()
        no_faces = [photo['id'] for photo in snap['photos'] if photo['faceState'] == 'done' and photo['faceCount'] == 0]
        self.assertEqual(no_faces, [photos[0]['id']])
        self.assertIsNone(self.store.photo_faces(photos[1]['id'])['faces'][0]['personId'])

    def test_individual_detection_keeps_paused_batch_and_retries_no_face_photo(self):
        photos = self.upload(3)
        with self.store.db() as db:
            db.executemany("INSERT INTO face_analysis_items VALUES (?,'pending')", [(photo['id'],) for photo in photos])
            db.execute("UPDATE face_analysis SET state='paused'")
        self.engine.encode.return_value = []
        self.store.start_photo_faces(photos[0]['id']); self.wait_idle()
        self.assertEqual(self.store.snapshot()['faces']['remaining'], 2)
        self.assertEqual(self.store.photo_faces(photos[0]['id'])['scan']['state'], 'complete')
        self.engine.encode.return_value = self.detections()
        self.store.start_photo_faces(photos[0]['id']); self.wait_idle()
        self.assertEqual(len(self.store.photo_faces(photos[0]['id'])['faces']), 2)
        self.assertEqual(self.store.snapshot()['faces']['remaining'], 2)
        self.store.start_faces(); self.wait_idle()
        self.assertEqual(self.store.snapshot()['faces']['done'], 3)

    def test_individual_detection_can_pause_and_never_runs_alongside_a_batch(self):
        photos = self.upload(1)
        entered = threading.Event()
        def encode(path, stop):
            entered.set()
            self.assertTrue(stop.wait(5))
            raise FacePaused()
        self.engine.encode.side_effect = encode
        self.store.start_photo_faces(photos[0]['id'])
        self.assertTrue(entered.wait(5))
        with self.assertRaises(PhotoError): self.store.start_faces()
        with self.assertRaises(PhotoError): self.store.start_photo_faces(photos[0]['id'])
        self.store.pause_faces(); self.wait_idle()
        self.assertEqual(self.store.photo_faces(photos[0]['id'])['scan']['state'], 'paused')
        self.assertEqual(self.store.snapshot()['photos'][0]['faceState'], 'pending')

    def test_individual_detection_can_finish_the_last_photo_of_a_paused_batch(self):
        photo = self.upload(1)[0]
        with self.store.db() as db:
            db.execute("INSERT INTO face_analysis_items VALUES (?,'pending')", (photo['id'],))
            db.execute("UPDATE face_analysis SET state='paused'")
        self.store.start_photo_faces(photo['id']); self.wait_idle()
        status = self.store.snapshot()['faces']
        self.assertEqual((status['state'], status['done'], status['remaining']), ('complete', 1, 0))

    def test_migration_keeps_names_requeues_missing_boxes_and_discards_oversized_old_queue(self):
        photo = self.upload(1)[0]
        with self.store.db() as db:
            db.execute("DELETE FROM photo_library_migrations WHERE name='face-boxes-v1'")
            db.execute("INSERT INTO people VALUES ('legacy-local','Nombre anterior',0)")
            db.execute("INSERT INTO faces VALUES (?,'legacy-local',?)", (photo['id'], str([0.] * 128)))
            db.execute("UPDATE photos SET face_state='done'")
            db.executemany("INSERT INTO face_analysis_items VALUES (?,'pending')", [(str(i),) for i in range(500)])
            db.execute("UPDATE face_analysis SET state='running'")
        restored = PhotoLibrary(self.store.root)
        self.assertEqual(restored.snapshot()['people'][0]['name'], 'Nombre anterior')
        self.assertEqual(restored.snapshot()['photos'][0]['faceState'], 'pending')
        self.assertEqual(restored.snapshot()['faces']['state'], 'idle')
        self.assertEqual(restored.snapshot()['faces']['total'], 1)
        self.assertIsNone(restored.photo_faces(photo['id'])['faces'][0]['box'])

    def test_face_detail_detection_and_assignment_endpoints(self):
        from flask import Flask
        app = Flask(__name__); app.register_blueprint(create_photo_blueprint(lambda: self.store))
        client = app.test_client()
        photo = self.upload(1)[0]
        self.engine.encode.return_value = self.detections()
        self.assertEqual(client.post(f"/pictures/photos/{photo['id']}/detect", json={}).status_code, 202)
        self.wait_idle()
        result = client.get(f"/pictures/photos/{photo['id']}/faces")
        self.assertEqual(result.status_code, 200)
        self.assertNotIn('encoding', result.get_data(as_text=True))
        face = result.json['faces'][0]
        path = f"/pictures/photos/{photo['id']}/faces/{face['id']}/assign"
        self.assertEqual(client.post(path, json=[]).status_code, 400)
        self.assertEqual(client.post(path, json={'name': 'Ana'}).status_code, 200)
        self.assertEqual(client.get('/pictures/photos/missing/faces').status_code, 404)


ORIGINAL_REST = PhotoLibrary._face_rest
if __name__ == '__main__': unittest.main()
