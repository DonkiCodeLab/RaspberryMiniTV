import io
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
import zipfile
from unittest.mock import Mock, patch

from PIL import Image
from werkzeug.datastructures import FileStorage

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from photo_library import PhotoLibrary, PhotoError, create_photo_blueprint, UNKNOWN_PERSON_ID
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

    def test_unknown_exists_in_empty_and_upgraded_libraries_and_is_permanent(self):
        expected = {'id': UNKNOWN_PERSON_ID, 'name': 'Desconocido'}
        for store in (self.store, PhotoLibrary(self.store.root)):
            snap = store.snapshot()
            self.assertEqual(snap['knownPeople'], [expected])
            self.assertEqual([(p['id'], p['photoIds']) for p in snap['people']], [(UNKNOWN_PERSON_ID, [])])
        # Simulate a catalogue created before the reserved folder existed.
        with self.store.db() as db:
            db.execute('DELETE FROM people WHERE id=?', (UNKNOWN_PERSON_ID,))
        upgraded = PhotoLibrary(self.store.root)
        self.assertEqual(upgraded.snapshot()['knownPeople'], [expected])
        from flask import Flask
        app = Flask(__name__); app.register_blueprint(create_photo_blueprint(lambda: upgraded))
        client = app.test_client()
        before = upgraded.snapshot()
        self.assertEqual(client.post('/pictures/people/unknown', json={'name': 'Otra persona'}).status_code, 400)
        self.assertEqual(client.post('/pictures/people/unknown/merge', json={'personId': 'missing'}).status_code, 400)
        self.assertEqual(upgraded.snapshot(), before)

    def test_unknown_assignment_is_per_face_survives_detection_and_can_be_corrected(self):
        photos = self.upload(2)
        photo = photos[0]
        self.store.group_faces(photo['id'], self.detections())
        first, other = self.store.photo_faces(photo['id'])['faces']
        self.assertEqual(self.store.assign_face(photo['id'], first['id'], {'personId': UNKNOWN_PERSON_ID}),
                         {'ok': True, 'personId': UNKNOWN_PERSON_ID})
        restored = PhotoLibrary(self.store.root)
        restored.group_faces(photo['id'], self.detections())
        faces = restored.photo_faces(photo['id'])['faces']
        self.assertEqual([f['personId'] for f in faces], [UNKNOWN_PERSON_ID, other['personId']])
        self.assertTrue(faces[0]['manual'])
        restored.group_faces(photo['id'], self.detections()[1:])  # Missed face remains assigned.
        self.assertEqual({f['id'] for f in restored.photo_faces(photo['id'])['faces']}, {first['id'], other['id']})
        # Unknown contains unrelated people, so it must not be used as a matching identity.
        restored.group_faces(photos[1]['id'], self.detections()[:1])
        self.assertNotEqual(restored.photo_faces(photos[1]['id'])['faces'][0]['personId'], UNKNOWN_PERSON_ID)
        unknown = next(p for p in restored.snapshot()['people'] if p['id'] == UNKNOWN_PERSON_ID)
        self.assertEqual(unknown['photoIds'], [photo['id']])
        restored.assign_face(photo['id'], first['id'], {'name': 'Ana'})
        unknown = next(p for p in restored.snapshot()['people'] if p['id'] == UNKNOWN_PERSON_ID)
        self.assertEqual(unknown['photoIds'], [])
        self.assertEqual(len(restored.snapshot()['photos']), 2)

    def test_whole_people_folders_merge_into_unknown_without_losing_shared_faces_or_photos(self):
        photos = self.upload(2)
        for photo in photos: self.store.group_faces(photo['id'], self.detections())
        a, b = self.store.photo_faces(photos[0]['id'])['faces']
        original_photos = self.store.snapshot()['photos']
        self.store.set_person_cover(a['personId'], photos[0]['id'])
        from flask import Flask
        app = Flask(__name__); app.register_blueprint(create_photo_blueprint(lambda: self.store))
        client = app.test_client()
        for person in (a['personId'], b['personId']):
            response = client.post(f'/pictures/people/{person}/merge', json={'personId': UNKNOWN_PERSON_ID})
            self.assertEqual((response.status_code, response.json), (200, {'ok': True, 'personId': UNKNOWN_PERSON_ID}))
        restored = PhotoLibrary(self.store.root)
        snap = restored.snapshot()
        self.assertEqual(snap['photos'], original_photos)
        self.assertEqual(len(snap['people']), 1)
        unknown = snap['people'][0]
        self.assertEqual((unknown['id'], unknown['coverPhotoId']), (UNKNOWN_PERSON_ID, photos[0]['id']))
        self.assertEqual(set(unknown['photoIds']), {p['id'] for p in photos})
        self.assertEqual(snap['knownPeople'], [{'id': UNKNOWN_PERSON_ID, 'name': 'Desconocido'}])
        for photo in photos:
            restored.group_faces(photo['id'], self.detections())
            faces = restored.photo_faces(photo['id'])['faces']
            self.assertEqual(len(faces), 2)
            self.assertTrue(all(f['personId'] == UNKNOWN_PERSON_ID and f['manual'] for f in faces))
            self.assertTrue(restored.safe_file(photo['relativePath']).is_file())
        restored.remove_matches(UNKNOWN_PERSON_ID, [photos[0]['id']])
        restored.delete_photos([photos[1]['id']], 'gallery')
        empty = PhotoLibrary(self.store.root).snapshot()['people']
        self.assertEqual([(p['id'], p['photoIds'], p['coverPhotoId']) for p in empty], [(UNKNOWN_PERSON_ID, [], None)])

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
        self.assertEqual([(p['id'], p['photoIds']) for p in self.store.snapshot()['people']], [('unknown', [])])
        self.assertEqual(self.store.snapshot()['faces']['total'], 3)
        self.store.start_faces(); self.wait_idle()
        result = self.store.snapshot()
        self.assertEqual(self.engine.encode.call_count, 3)
        self.assertEqual((result['faces']['state'], result['faces']['done'], result['faces']['total'], result['faces']['percent']), ('complete', 3, 3, 100))
        self.assertEqual(len(result['people']), 2)
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

    def test_person_portraits_use_their_own_rectangle_in_the_first_album_photo(self):
        photos = self.upload(2)
        detections = [{'encoding': [float(i)] * 128, 'box': {'x': i * .25, 'y': .2, 'width': .2, 'height': .3}}
                      for i in range(4)]
        for photo in photos: self.store.group_faces(photo['id'], detections)
        people = [p for p in self.store.snapshot()['people'] if p['id'] != 'unknown']
        self.assertEqual(len(people), 4)
        for person in people:
            cover = person['coverFace']
            self.assertEqual(cover['photoId'], person['photoIds'][0])
            self.assertIsNone(person['coverPhotoId'])  # Automatic crop is not a saved cover choice.
            face = next(face for face in self.store.photo_faces(cover['photoId'])['faces'] if face['personId'] == person['id'])
            self.assertEqual(cover, {'id': face['id'], 'photoId': cover['photoId'], 'box': face['box']})
            self.assertNotIn('encoding', str(cover))
            self.assertEqual(set(person['faceBoxes']), set(person['photoIds']))
            for photo_id, boxes in person['faceBoxes'].items():
                expected = [{'id': f['id'], 'box': f['box']} for f in self.store.photo_faces(photo_id)['faces']
                            if f['personId'] == person['id'] and f['box']]
                self.assertEqual(boxes, expected)
            self.assertNotIn('encoding', str(person['faceBoxes']))
        self.assertEqual(len({person['coverFace']['box']['x'] for person in people}), 4)

    def test_chosen_portrait_updates_after_face_correction_and_photo_deletion(self):
        photos = self.upload(3)
        for photo in photos: self.store.group_faces(photo['id'], self.detections())
        person = self.store.snapshot()['people'][0]
        chosen = person['photoIds'][-1]
        self.store.set_person_cover(person['id'], chosen)
        saved = next(p for p in PhotoLibrary(self.store.root).snapshot()['people'] if p['id'] == person['id'])
        self.assertEqual(saved['coverFace']['photoId'], chosen)
        assigned = self.store.assign_face(chosen, saved['coverFace']['id'], {'name': 'Otra persona'})['personId']
        people = {p['id']: p for p in self.store.snapshot()['people']}
        self.assertEqual(people[assigned]['coverFace'], saved['coverFace'])
        self.assertNotEqual(people[person['id']]['coverFace']['photoId'], chosen)
        self.assertNotIn(chosen, people[person['id']]['faceBoxes'])
        self.assertEqual(people[assigned]['faceBoxes'][chosen][0]['id'], saved['coverFace']['id'])
        next_cover = people[person['id']]['coverFace']['photoId']
        self.store.delete_photos([next_cover], 'gallery')
        remaining = next(p for p in self.store.snapshot()['people'] if p['id'] == person['id'])
        self.assertEqual(remaining['coverFace']['photoId'], remaining['photoIds'][0])
        self.assertNotEqual(remaining['coverFace']['photoId'], next_cover)

    def test_legacy_person_portrait_falls_back_only_to_a_known_rectangle(self):
        photos = self.upload(2)
        self.store.group_faces(photos[0]['id'], [[0.] * 128])
        person = self.store.snapshot()['people'][0]
        self.assertIsNone(person['coverFace'])
        self.store.set_person_cover(person['id'], photos[0]['id'])
        self.store.group_faces(photos[1]['id'], self.detections()[:1])
        person = self.store.snapshot()['people'][0]
        self.assertEqual(person['coverPhotoId'], photos[0]['id'])
        self.assertEqual(person['coverFace']['photoId'], photos[1]['id'])

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

    def test_manual_face_creates_album_without_detector_and_survives_reanalysis(self):
        photo = self.upload(1)[0]
        box = {'x': .1, 'y': .2, 'width': .2, 'height': .3}
        from flask import Flask
        app = Flask(__name__); app.register_blueprint(create_photo_blueprint(lambda: self.store))
        client = app.test_client()
        with patch('photo_library.LocalFaceEngine.available', return_value=False):
            response = client.post(f"/pictures/photos/{photo['id']}/faces", json={'box': box, 'name': 'Ana'})
        self.assertEqual(response.status_code, 201)
        face_id, person_id = response.json['faceId'], response.json['personId']
        restored = PhotoLibrary(self.store.root)
        person = next(p for p in restored.snapshot()['people'] if p['id'] == person_id)
        self.assertEqual(person['photoIds'], [photo['id']])
        self.assertEqual(person['coverFace']['box'], box)
        self.assertEqual(person['coverFace']['id'], face_id)
        restored.group_faces(photo['id'], [])
        face = restored.photo_faces(photo['id'])['faces'][0]
        self.assertEqual((face['id'], face['personId'], face['box'], face['manual']), (face_id, person_id, box, True))
        # Later automatic recognition of the same face must not create a duplicate identity.
        restored.group_faces(photo['id'], [self.detections()[0]])
        faces = restored.photo_faces(photo['id'])['faces']
        self.assertEqual(len(faces), 1)
        self.assertEqual((faces[0]['id'], faces[0]['personId']), (face_id, person_id))

    def test_manual_face_reuses_names_can_be_reassigned_and_rejects_incomplete_requests(self):
        photos = self.upload(2)
        box = {'x': .1, 'y': .2, 'width': .2, 'height': .3}
        created = self.store.add_face(photos[0]['id'], {'box': box, 'name': 'Ana'})
        self.assertEqual(self.store.add_face(photos[1]['id'], {'box': box, 'name': ' ANA '})['personId'], created['personId'])
        self.assertEqual(self.store.add_face(photos[1]['id'], {'box': box, 'personId': created['personId']})['personId'], created['personId'])
        before = self.store.snapshot()
        invalid = [{}, {'name': 'Ana'}, {'box': box}, {'box': box, 'name': ''}, {'box': box, 'personId': 'missing'},
                   {'box': box, 'name': 'Ana', 'personId': created['personId']}, {'box': box, 'name': 'Ana', 'extra': True}]
        for changes in [{'width': 0}, {'width': -1}, {'x': -.1}, {'x': .9}, {'y': float('nan')}, {'height': True}, {'height': '0.2'}]:
            invalid.append({'box': {**box, **changes}, 'name': 'New name'})
        for data in invalid:
            with self.subTest(data=data), self.assertRaises(PhotoError):
                self.store.add_face(photos[0]['id'], data)
            self.assertEqual(self.store.snapshot(), before)
        with self.assertRaises(PhotoError): self.store.add_face('missing', {'box': box, 'name': 'New name'})
        changed = self.store.assign_face(photos[0]['id'], created['faceId'], {'name': 'Luis'})
        people = self.store.snapshot()['people']
        self.assertNotIn(photos[0]['id'], next(p for p in people if p['id'] == created['personId'])['photoIds'])
        self.assertEqual(next(p for p in people if p['id'] == changed['personId'])['photoIds'], [photos[0]['id']])
        self.store.remove_matches(changed['personId'], [photos[0]['id']])
        self.assertNotIn(changed['personId'], [p['id'] for p in self.store.snapshot()['people']])

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
        self.assertEqual(len(snap['people']), 2)
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

    def test_merge_unites_shared_photos_preserves_faces_and_destination_cover_after_restart(self):
        photos = self.upload(3)
        self.store.group_faces(photos[0]['id'], self.detections())
        self.store.group_faces(photos[1]['id'], self.detections()[:1])
        self.store.group_faces(photos[2]['id'], self.detections()[1:])
        a, b = self.store.photo_faces(photos[0]['id'])['faces']
        source, target = a['personId'], b['personId']
        self.store.rename_person(target, 'Ana')
        self.store.set_person_cover(source, photos[1]['id'])
        self.store.set_person_cover(target, photos[2]['id'])
        original_faces = {photo['id']: self.store.photo_faces(photo['id'])['faces'] for photo in photos}
        self.assertEqual(self.store.merge_people(source, target), {'ok': True, 'personId': target})
        restored = PhotoLibrary(self.store.root)
        result = restored.snapshot()
        self.assertEqual(len(result['people']), 2)
        person = result['people'][0]
        self.assertEqual((person['id'], person['name'], person['coverPhotoId']), (target, 'Ana', photos[2]['id']))
        self.assertEqual(set(person['photoIds']), {photo['id'] for photo in photos})
        self.assertNotIn(source, [person['id'] for person in result['knownPeople']])
        for photo in photos:
            faces = restored.photo_faces(photo['id'])['faces']
            self.assertEqual([(f['id'], f['box']) for f in faces], [(f['id'], f['box']) for f in original_faces[photo['id']]])
            self.assertEqual({f['personId'] for f in faces}, {target})
            self.assertTrue(restored.safe_file(photo['relativePath']).is_file())
        restored.group_faces(photos[0]['id'], self.detections())
        self.assertEqual({f['personId'] for f in restored.photo_faces(photos[0]['id'])['faces']}, {target})
        restored.group_faces(photos[1]['id'], [])
        self.assertEqual(restored.photo_faces(photos[1]['id'])['faces'][0]['personId'], target)
        with restored.db() as db:
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_merge_inherits_source_cover_and_can_target_a_known_person_without_photos(self):
        photo = self.upload(1)[0]
        self.store.group_faces(photo['id'], self.detections()[:1])
        source = self.store.photo_faces(photo['id'])['faces'][0]['personId']
        self.store.set_person_cover(source, photo['id'])
        with self.store.db() as db: db.execute("INSERT INTO people VALUES ('ana','Ana',0)")
        self.store.merge_people(source, 'ana')
        person = self.store.snapshot()['people'][0]
        self.assertEqual((person['id'], person['coverPhotoId'], person['photoIds']), ('ana', photo['id'], [photo['id']]))

    def test_bulk_merge_validates_every_person_before_changing_shared_faces(self):
        photos = self.upload(2)
        for photo in photos: self.store.group_faces(photo['id'], self.detections())
        sources = [face['personId'] for face in self.store.photo_faces(photos[0]['id'])['faces']]
        with self.store.db() as db: db.execute("INSERT INTO people VALUES ('target','Destino',0)")
        self.store.set_person_cover(sources[0], photos[0]['id'])
        before = self.store.snapshot()
        from flask import Flask
        app = Flask(__name__); app.register_blueprint(create_photo_blueprint(lambda: self.store))
        client = app.test_client()
        for ids, target, status in [(sources + ['missing'], 'target', 409), (sources, sources[0], 400),
                                     (sources + ['unknown'], 'target', 400), (sources, 'missing', 409)]:
            response = client.post('/pictures/people/merge', json={'ids': ids, 'personId': target})
            self.assertEqual(response.status_code, status)
            self.assertEqual(self.store.snapshot(), before)
        response = client.post('/pictures/people/merge', json={'ids': sources + sources, 'personId': 'target'})
        self.assertEqual((response.status_code, response.json), (200, {'ok': True, 'personId': 'target'}))
        restored = PhotoLibrary(self.store.root)
        target = next(person for person in restored.snapshot()['people'] if person['id'] == 'target')
        self.assertEqual(set(target['photoIds']), {photo['id'] for photo in photos})
        self.assertEqual(target['coverPhotoId'], photos[0]['id'])
        for photo in photos:
            faces = restored.photo_faces(photo['id'])['faces']
            self.assertEqual(len(faces), 2)
            self.assertTrue(all(face['personId'] == 'target' and face['manual'] for face in faces))

    def test_bulk_delete_removes_only_identities_and_preserves_photos_and_albums(self):
        photo = self.upload(1)[0]
        self.store.group_faces(photo['id'], self.detections())
        sources = [face['personId'] for face in self.store.photo_faces(photo['id'])['faces']]
        before = self.store.snapshot()
        for ids in [[], None, 'invalid', sources + ['missing'], sources + ['unknown']]:
            with self.assertRaises(PhotoError): self.store.delete_people(ids)
            self.assertEqual(self.store.snapshot(), before)
        from flask import Flask
        app = Flask(__name__); app.register_blueprint(create_photo_blueprint(lambda: self.store))
        response = app.test_client().post('/pictures/people/delete', json={'ids': sources})
        self.assertEqual(response.status_code, 200)
        after = PhotoLibrary(self.store.root).snapshot()
        self.assertEqual(after['photos'], before['photos'])
        self.assertEqual(after['folders'], before['folders'])
        self.assertEqual(after['knownPeople'], [{'id': 'unknown', 'name': 'Desconocido'}])
        self.assertTrue(self.store.safe_file(photo['relativePath']).is_file())
        self.store.group_faces(photo['id'], self.detections())
        self.assertTrue(all(face['personId'] == 'unknown' for face in self.store.photo_faces(photo['id'])['faces']))

    def test_unknown_photo_selection_downloads_and_deletes_only_selected_originals(self):
        photos = self.upload(3)
        for photo in photos:
            self.store.group_faces(photo['id'], self.detections())
        sources = [person['id'] for person in self.store.snapshot()['people'] if person['id'] != UNKNOWN_PERSON_ID]
        self.store.delete_people(sources)
        from flask import Flask
        app = Flask(__name__); app.register_blueprint(create_photo_blueprint(lambda: self.store))
        client = app.test_client()
        before = self.store.snapshot()
        selected = [photos[0], photos[2]]
        response = client.post('/pictures/photos/download', json={'ids': [photo['id'] for photo in selected] * 2})
        self.addCleanup(response.close)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, 'application/zip')
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
            self.assertEqual(set(archive.namelist()), {photo['relativePath'] for photo in selected})
            self.assertEqual(len(archive.namelist()), 2)
            for photo in selected:
                self.assertEqual(archive.read(photo['relativePath']), self.store.safe_file(photo['relativePath']).read_bytes())
        for ids, status in [(None, 400), ([], 400), ('bad', 400), ([True], 400), (['x'] * 5001, 400),
                            ([photos[0]['id'], 'missing'], 409), (['../etc/passwd'], 409)]:
            self.assertEqual(client.post('/pictures/photos/download', json={'ids': ids}).status_code, status)
        self.assertEqual(self.store.snapshot(), before)
        deleted = client.post('/pictures/photos/delete', json={'ids': [photo['id'] for photo in selected], 'scope': 'gallery'})
        self.assertEqual(deleted.status_code, 200)
        after = self.store.snapshot()
        self.assertEqual([photo['id'] for photo in after['photos']], [photos[1]['id']])
        unknown = next(person for person in after['people'] if person['id'] == UNKNOWN_PERSON_ID)
        self.assertEqual(unknown['photoIds'], [photos[1]['id']])

    def test_people_zip_keeps_original_bytes_paths_and_shared_photos_only_once(self):
        photos = self.upload(2)
        for photo in photos: self.store.group_faces(photo['id'], self.detections())
        sources = [face['personId'] for face in self.store.photo_faces(photos[0]['id'])['faces']]
        from flask import Flask
        app = Flask(__name__); app.register_blueprint(create_photo_blueprint(lambda: self.store))
        client = app.test_client()
        before = self.store.snapshot()
        response = client.post('/pictures/people/download', json={'ids': sources + sources})
        self.addCleanup(response.close)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, 'application/zip')
        self.assertIn('attachment', response.headers['Content-Disposition'])
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
            self.assertEqual(set(archive.namelist()), {photo['relativePath'] for photo in photos})
            self.assertEqual(len(archive.namelist()), 2)
            for photo in photos:
                self.assertEqual(archive.read(photo['relativePath']), self.store.safe_file(photo['relativePath']).read_bytes())
        for ids, status in [([], 400), (['missing'], 409), (['unknown'], 400), (['../etc/passwd'], 409)]:
            self.assertEqual(client.post('/pictures/people/download', json={'ids': ids}).status_code, status)
        self.assertEqual(self.store.snapshot(), before)

    def test_merge_during_scan_applies_to_results_that_arrive_later(self):
        photos = self.upload(2)
        self.store.group_faces(photos[0]['id'], self.detections())
        source, target = [face['personId'] for face in self.store.photo_faces(photos[0]['id'])['faces']]
        entered = threading.Event()
        def encode(path, stop):
            entered.set(); self.assertTrue(self.release.wait(5))
            # The shared photo's album link only holds the source vector after merging.
            # Matching must still retain the destination's other detected face vector.
            return self.detections()[1:]
        self.engine.encode.side_effect = encode
        self.store.start_faces(); self.assertTrue(entered.wait(5))
        self.store.merge_people(source, target)
        self.release.set(); self.wait_idle()
        self.assertEqual(self.store.photo_faces(photos[1]['id'])['faces'][0]['personId'], target)
        self.assertEqual(len(self.store.snapshot()['people']), 2)

    def test_correction_after_merge_moves_only_one_face_and_preserves_other_album_members(self):
        photos = self.upload(2)
        for photo in photos: self.store.group_faces(photo['id'], self.detections())
        a, b = self.store.photo_faces(photos[0]['id'])['faces']
        self.store.merge_people(a['personId'], b['personId'])
        new = self.store.assign_face(photos[0]['id'], a['id'], {'name': 'Otra persona'})['personId']
        faces = self.store.photo_faces(photos[0]['id'])['faces']
        self.assertEqual([face['personId'] for face in faces], [new, b['personId']])
        self.assertEqual({face['personId'] for face in self.store.photo_faces(photos[1]['id'])['faces']}, {b['personId']})
        self.store.group_faces(photos[0]['id'], self.detections())
        self.assertEqual([face['personId'] for face in self.store.photo_faces(photos[0]['id'])['faces']], [new, b['personId']])

    def test_merge_api_rejects_invalid_targets_without_changing_library(self):
        from flask import Flask
        app = Flask(__name__); app.register_blueprint(create_photo_blueprint(lambda: self.store))
        client = app.test_client()
        photo = self.upload(1)[0]
        self.store.group_faces(photo['id'], self.detections())
        source, target = [face['personId'] for face in self.store.photo_faces(photo['id'])['faces']]
        path = f'/pictures/people/{source}/merge'
        before = self.store.snapshot()
        for data, code in [([], 400), ({}, 400), ({'personId': []}, 400), ({'personId': source}, 400),
                           ({'personId': 'missing'}, 409), ({'personId': 'apple-old'}, 400)]:
            self.assertEqual(client.post(path, json=data).status_code, code)
            self.assertEqual(self.store.snapshot()['people'], before['people'])
            self.assertEqual(self.store.snapshot()['revision'], before['revision'])
        response = client.post(path, json={'personId': target})
        self.assertEqual((response.status_code, response.json['personId']), (200, target))
        self.assertEqual(client.post(path, json={'personId': target}).status_code, 409)
        # Deleting a duplicate must not cause new auto names to collide.
        self.store.group_faces(photo['id'], self.detections() + [[2.] * 128])
        names = [person['name'] for person in self.store.snapshot()['people']]
        self.assertEqual(len(names), len(set(names)))

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
