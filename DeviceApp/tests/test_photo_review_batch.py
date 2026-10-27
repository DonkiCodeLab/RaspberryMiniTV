"""Atomic step commits: retries, stale data, real image edits and shared photos."""
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from flask import Flask
from werkzeug.datastructures import FileStorage
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from photo_library import PhotoLibrary, PhotoError, create_photo_blueprint
from photo_review_batch import apply_batch, transform_box


class ReviewBatchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.store = PhotoLibrary(Path(self.temp.name) / 'Pictures')
        for i in range(4):
            stream = io.BytesIO()
            image = Image.new('RGB', (120, 80), (20 + i, 90, 30))
            image.paste((255, 0, 0), (0, 0, 60, 40)); image.save(stream, 'PNG'); stream.seek(0)
            self.store.upload([FileStorage(stream=stream, filename=f'{i}.png')], 'Fotos')
        self.photos = self.store.snapshot()['photos']
        self.box = {'x': .1, 'y': .2, 'width': .2, 'height': .3}
        self.detections = [{'encoding': [n] * 128, 'box': {**self.box, 'x': x}} for n, x in [(0., .1), (1., .6)]]
        self.store.group_faces(self.photos[0]['id'], self.detections)
        for i, face in enumerate(self.store.photo_faces(self.photos[0]['id'])['faces']): self.store.rename_person(face['personId'], ['Ana', 'Luis'][i])
        self.store.group_faces(self.photos[1]['id'], self.detections)
        self.store.group_faces(self.photos[2]['id'], [])
        self.store.group_faces(self.photos[3]['id'], [{'encoding': [8.] * 128, 'box': self.box}])
        self.app = Flask(__name__); self.app.register_blueprint(create_photo_blueprint(lambda: self.store)); self.client = self.app.test_client()

    def item(self, index, **extra):
        photo = self.store.snapshot()['photos'][index]
        details = self.store.photo_faces(photo['id'])
        return {'photoId': photo['id'], 'expectedPath': photo['relativePath'], 'version': details['version'],
                'reviewIds': [r['id'] for r in self.store.snapshot()['reviews'] if r['photoId'] == photo['id']],
                'changes': [], 'edits': [], 'delete': False, **extra}

    def payload(self, photos=None, people=None):
        return {'requestId': 'test-batch-id-12345', 'photos': photos or [], 'people': people or []}

    def test_batch_metadata_for_all_review_modes_preserves_time_image_edits_and_faces(self):
        with self.store.db() as db:
            for photo in self.photos:
                metadata = json.loads(db.execute('SELECT metadata FROM photos WHERE id=?', (photo['id'],)).fetchone()[0])
                metadata['takenAt'] = '2022-08-17T23:45:12-07:00'
                db.execute('UPDATE photos SET metadata=? WHERE id=?', (json.dumps(metadata), photo['id']))
        items = [self.item(i, metadata={'takenAt': '1985-01-03', 'latitude': 0, 'longitude': -180}) for i in (0, 2, 3)]
        originals = [(self.store.safe_file(item['expectedPath']), self.store.safe_file(item['expectedPath']).read_bytes()) for item in items]
        faces_before = {item['photoId']: self.store.photo_faces(item['photoId'])['faces'] for item in items}
        items[0]['edits'] = [{'rotate': 1}]
        items[0]['albums'] = [{'name': 'Viaje'}]
        data = self.payload(items)
        response = self.client.post('/pictures/reviews/batch', json=data)
        self.assertEqual(response.status_code, 200, response.json)
        restored = PhotoLibrary(self.store.root)
        self.assertEqual(apply_batch(restored, data), response.json)
        restored.sync()
        photos = {photo['id']: photo for photo in restored.snapshot()['photos']}
        for item in items:
            photo = photos[item['photoId']]
            self.assertEqual(photo['takenAt'], '1985-01-03T23:45:12-07:00')
            self.assertEqual((photo['latitude'], photo['longitude']), (0, -180))
            self.assertEqual([face['id'] for face in restored.photo_faces(photo['id'])['faces']],
                             [face['id'] for face in faces_before[photo['id']]])
        rotated = photos[items[0]['photoId']]
        self.assertEqual((rotated['width'], rotated['height']), (80, 120))
        self.assertTrue(rotated['folderIds'])
        for path, original in originals: self.assertEqual(path.read_bytes(), original)

    def test_invalid_batch_metadata_rolls_back_other_photos_faces_albums_and_image_edits(self):
        for metadata in [{}, None, {'takenAt': '2023-02-29'}, {'takenAt': '2024-01-02T10:00:00'},
                         {'latitude': 0}, {'latitude': 91, 'longitude': 0}, {'title': 'Invalid'}]:
            with self.subTest(metadata=metadata):
                before = self.store.snapshot()
                first = self.item(2, metadata={'takenAt': '1960-02-29'}, edits=[{'rotate': 1}],
                                  albums=[{'name': 'Do not persist'}], changes=[{'action': 'add', 'box': self.box, 'name': 'Eva'}])
                second = self.item(3, metadata=metadata)
                response = self.client.post('/pictures/reviews/batch', json=self.payload([first, second]))
                self.assertEqual(response.status_code, 400, response.json)
                self.assertEqual(self.store.snapshot(), before)
                self.assertEqual(list((self.store.root / 'edited-photos').glob('*.jpg')), [])

    def test_personal_albums_are_added_atomically_and_new_names_reused_after_retry(self):
        parent = self.store.create_folder('Familia')['id']
        nested = self.store.create_folder('Viaje', parent)['id']
        one = self.item(1, albums=[{'folderId': nested}, {'name': ' Verano '}, {'name': 'FAMILIA'}])
        two = self.item(2, albums=[{'name': 'verano'}, {'folderId': nested}], edits=[{'rotate': 1}])
        previous = next(p for p in self.store.snapshot()['photos'] if p['id'] == one['photoId'])['folderIds']
        data = self.payload([one, two])
        self.assertFalse(any(f['name'] == 'Verano' for f in self.store.snapshot()['folders']))
        response = self.client.post('/pictures/reviews/batch', json=data)
        self.assertEqual(response.status_code, 200, response.json)
        restored = PhotoLibrary(self.store.root)
        self.assertEqual(apply_batch(restored, data), response.json)
        snapshot = restored.snapshot()
        created = [f for f in snapshot['folders'] if f['name'].casefold() == 'verano']
        self.assertEqual(len(created), 1)
        self.assertEqual(created[0]['parent'], 'albums')
        self.assertEqual(len([f for f in snapshot['folders'] if f['name'].casefold() == 'familia']), 1)
        for item in [one, two]:
            photo = next(p for p in snapshot['photos'] if p['id'] == item['photoId'])
            self.assertTrue({nested, created[0]['id']} <= set(photo['folderIds']))
        first = next(p for p in snapshot['photos'] if p['id'] == one['photoId'])
        self.assertTrue(set(previous) | {parent} <= set(first['folderIds']))
        second = next(p for p in snapshot['photos'] if p['id'] == two['photoId'])
        self.assertEqual((second['width'], second['height']), (80, 120))

    def test_later_error_rolls_back_album_creation_memberships_and_face_reviews(self):
        existing = self.store.create_folder('Familia')['id']
        one = self.item(1, albums=[{'folderId': existing}, {'name': 'Never created'}])
        two = self.item(2, changes=[{'action': 'add', 'box': {}, 'name': 'Invalid face'}])
        before = self.store.snapshot()
        with self.assertRaises(PhotoError): apply_batch(self.store, self.payload([one, two]))
        self.assertEqual(self.store.snapshot(), before)

    def test_album_links_reject_nonpersonal_folders_missing_targets_and_bad_names(self):
        generated = self.store.create_folder('Generated', 'ai')['id']
        before = self.store.snapshot()
        for albums in [None, {}, [{'folderId': value} for value in ['albums']] * 101,
                       *[[{'folderId': value}] for value in ['albums', 'gallery', 'ai', generated, 'missing', None]],
                       *[[{'name': value}] for value in ['', '..', 'bad/name', 'bad\\name', 'bad\nname', 'x' * 101, None]],
                       [{'folderId': generated, 'name': 'Ambiguous'}]]:
            with self.subTest(albums=albums):
                with self.assertRaises(PhotoError): apply_batch(self.store, self.payload([self.item(2, albums=albums)]))
                self.assertEqual(self.store.snapshot(), before)

    def test_new_person_step_links_album_without_confirming_unresolved_faces(self):
        item = self.item(3, reviewIds=[], albums=[{'name': 'Familia'}])
        before = self.store.photo_faces(item['photoId'])['faces']
        apply_batch(self.store, self.payload([item]))
        self.assertEqual(self.store.photo_faces(item['photoId'])['faces'], before)
        snapshot = self.store.snapshot()
        album = next(f for f in snapshot['folders'] if f['name'] == 'Familia')
        photo = next(p for p in snapshot['photos'] if p['id'] == item['photoId'])
        self.assertIn(album['id'], photo['folderIds'])

    def test_deleting_photo_does_not_create_its_staged_album(self):
        apply_batch(self.store, self.payload([self.item(2, delete=True, albums=[{'name': 'Unused'}])]))
        self.assertFalse(any(f['name'] == 'Unused' for f in self.store.snapshot()['folders']))

    def test_commits_shared_faces_and_manual_additions_once_with_response_loss(self):
        one = self.item(1); two = self.item(2, changes=[{'action': 'add', 'box': self.box, 'name': 'Eva'}])
        other = self.store.photo_faces(one['photoId'])['faces'][1]
        one['changes'] = [{'action': 'assign', 'faceId': other['id'], 'personId': 'unknown'}]
        data = self.payload([one, two])
        response = self.client.post('/pictures/reviews/batch', json=data)
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(len(self.store.photo_faces(two['photoId'])['faces']), 1)
        restored = PhotoLibrary(self.store.root)
        self.assertEqual(apply_batch(restored, data), response.json)
        self.assertEqual(len(restored.photo_faces(two['photoId'])['faces']), 1)
        self.assertTrue(all(f['manual'] for f in restored.photo_faces(one['photoId'])['faces']))
        data['photos'][0]['delete'] = True
        with self.assertRaises(PhotoError): apply_batch(restored, data)

    def test_later_bad_change_rolls_back_all_photos_and_rendered_files(self):
        one = self.item(1, edits=[{'rotate': 1}])
        two = self.item(2, changes=[{'action': 'add', 'box': {}, 'name': 'Never saved'}])
        before = self.store.snapshot()
        response = self.client.post('/pictures/reviews/batch', json=self.payload([one, two]))
        self.assertEqual(response.status_code, 400, response.json)
        self.assertEqual(self.store.snapshot(), before)
        self.assertEqual(list((self.store.root / 'edited-photos').glob('*')), [])
        with self.store.db() as db: self.assertEqual(db.execute('SELECT count(*) FROM photo_review_batches').fetchone()[0], 0)

    def test_reused_draft_name_is_one_person_across_photos_groups_and_retries(self):
        one = self.item(1)
        face = self.store.photo_faces(one['photoId'])['faces'][0]
        one['changes'] = [{'action': 'assign', 'faceId': face['id'], 'name': 'Eva'}]
        two = self.item(2, changes=[{'action': 'add', 'box': self.box, 'name': 'Eva'}])
        group = self.store.photo_faces(self.photos[3]['id'])['faces'][0]['personId']
        data = self.payload([one, two], [{'id': group, 'name': 'Eva'}])
        self.assertFalse(any(p['name'] == 'Eva' for p in self.store.snapshot()['people']))
        response = self.client.post('/pictures/reviews/batch', json=data)
        self.assertEqual(response.status_code, 200, response.json)
        restored = PhotoLibrary(self.store.root)
        self.assertEqual(apply_batch(restored, data), response.json)
        people = [p for p in restored.snapshot()['people'] if p['name'] == 'Eva']
        self.assertEqual(len(people), 1)
        self.assertEqual(set(people[0]['photoIds']), {one['photoId'], two['photoId'], self.photos[3]['id']})
        for photo_id in people[0]['photoIds']:
            matches = [f for f in restored.photo_faces(photo_id)['faces'] if f['name'] == 'Eva']
            self.assertEqual(len(matches), 1)
            self.assertEqual(matches[0]['personId'], people[0]['id'])

    def test_stale_face_rejects_whole_batch_before_other_photos_are_written(self):
        one, two = self.item(1), self.item(2)
        face = self.store.photo_faces(one['photoId'])['faces'][0]
        self.store.assign_face(one['photoId'], face['id'], {'name': 'Changed elsewhere'})
        before = self.store.snapshot()
        response = self.client.post('/pictures/reviews/batch', json=self.payload([two, one]))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.store.snapshot(), before)

    def test_rotate_crop_resize_keep_original_date_gps_and_face_alignment(self):
        edits = [{'rotate': 1}, {'crop': {'x': .25, 'y': 0, 'width': .75, 'height': 1}}, {'scale': .5}]
        item = self.item(1, edits=edits)
        path = self.store.safe_file(item['expectedPath']); original = path.read_bytes()
        with self.store.db() as db:
            metadata = json.loads(db.execute('SELECT metadata FROM photos WHERE id=?', (item['photoId'],)).fetchone()[0])
            metadata.update(takenAt='2020-01-02T12:00:00', latitude=41.3, longitude=2.1)
            db.execute('UPDATE photos SET metadata=? WHERE id=?', (json.dumps(metadata), item['photoId']))
        result = apply_batch(self.store, self.payload([item]))
        self.assertTrue(result['ok']); self.assertEqual(path.read_bytes(), original)
        photo = next(p for p in self.store.snapshot()['photos'] if p['id'] == item['photoId'])
        self.assertEqual((photo['width'], photo['height']), (30, 60))
        self.assertEqual((photo['takenAt'], photo['latitude'], photo['longitude']), ('2020-01-02T12:00:00', 41.3, 2.1))
        self.assertNotEqual(photo['relativePath'], item['expectedPath'])
        with Image.open(self.store.safe_file(photo['relativePath'])) as rendered: self.assertEqual(rendered.size, (30, 60))
        face = next(f for f in self.store.photo_faces(photo['id'])['faces'] if f['box']['y'] < .5)
        expected = transform_box(self.box, edits)
        for key in expected: self.assertAlmostEqual(face['box'][key], expected[key])
        self.store.sync(); self.assertEqual(len(self.store.snapshot()['photos']), 4)
        self.store.delete_photos([photo['id']], 'gallery')
        self.assertFalse(path.exists()); self.assertFalse((self.store.root / photo['relativePath']).exists())

    def test_add_face_then_rotate_and_retry_does_not_duplicate_or_rotate_twice(self):
        item = self.item(2, edits=[{'rotate': -1}], changes=[{'action': 'add', 'box': self.box, 'name': 'Eva'}])
        data = self.payload([item]); apply_batch(self.store, data); apply_batch(self.store, data)
        details = self.store.photo_faces(item['photoId'])
        self.assertEqual(len(details['faces']), 1)
        self.assertEqual(details['faces'][0]['box'], transform_box(self.box, item['edits']))
        photo = next(p for p in self.store.snapshot()['photos'] if p['id'] == item['photoId'])
        self.assertEqual((photo['width'], photo['height']), (80, 120))
        self.assertNotIn(item['reviewIds'][0], [r['id'] for r in self.store.snapshot()['reviews']])

    def test_new_group_can_be_named_or_merged_with_photo_edits_in_same_commit(self):
        item = self.item(3, edits=[{'rotate': 1}])
        person = self.store.photo_faces(item['photoId'])['faces'][0]['personId']
        data = self.payload([item], [{'id': person, 'name': 'Ana'}])
        apply_batch(self.store, data)
        self.assertNotIn(person, [p['id'] for p in self.store.snapshot()['people']])
        self.assertEqual(self.store.photo_faces(item['photoId'])['faces'][0]['name'], 'Ana')

    def test_naming_a_new_group_confirms_its_faces(self):
        item = self.item(3)
        person = self.store.photo_faces(item['photoId'])['faces'][0]['personId']
        apply_batch(self.store, self.payload(people=[{'id': person, 'name': 'Marta'}]))
        face = self.store.photo_faces(item['photoId'])['faces'][0]
        self.assertEqual(face['name'], 'Marta')
        self.assertTrue(face['manual'])

    def test_group_photo_can_resolve_new_faces_individually_and_keep_recognized_person(self):
        known = self.store.photo_faces(self.photos[0]['id'])['faces'][0]['personId']
        self.store.group_faces(self.photos[3]['id'], self.detections[:1] + [
            {'encoding': [n] * 128, 'box': self.box} for n in [8., 16., 24.]])
        item = self.item(3, reviewIds=[])
        faces = self.store.photo_faces(item['photoId'])['faces']
        new_faces = [face for face in faces if face['personId'] != known]
        self.assertEqual(len(new_faces), 3)
        item['changes'] = [{'action': 'assign', 'faceId': face['id'], 'personId': 'unknown'} for face in new_faces]
        data = self.payload([item])
        response = self.client.post('/pictures/reviews/batch', json=data)
        self.assertEqual(response.status_code, 200, response.json)
        restored = PhotoLibrary(self.store.root)
        self.assertEqual(apply_batch(restored, data), response.json)
        final = restored.photo_faces(item['photoId'])['faces']
        self.assertEqual([face['personId'] for face in final].count('unknown'), 3)
        self.assertEqual([face['personId'] for face in final].count(known), 1)
        self.assertTrue(self.store.safe_file(item['expectedPath']).is_file())
        self.assertEqual(len(restored.snapshot()['photos']), 4)

    def test_crowded_photo_can_mark_more_than_100_faces_unknown_and_preserve_a_draft_name(self):
        detections = [{'encoding': [float(n + 100)] * 128,
                       'box': {'x': (n % 12) / 12, 'y': (n // 12) / 12, 'width': .06, 'height': .06}}
                      for n in range(121)]
        photo_id = self.photos[2]['id']
        self.store.group_faces(photo_id, detections)
        faces = self.store.photo_faces(photo_id)['faces']
        named = faces[0]
        item = self.item(2, reviewIds=[], changes=[
            {'action': 'assign', 'faceId': face['id'], 'personId': 'unknown'} for face in faces[1:]])
        data = self.payload([item], people=[{'id': named['personId'], 'name': 'Eva'}])
        response = self.client.post('/pictures/reviews/batch', json=data)
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(apply_batch(self.store, data), response.json)
        # Unknown is a confirmed decision: reanalysis must not recreate the groups.
        restored = PhotoLibrary(self.store.root)
        restored.group_faces(photo_id, detections)
        final = restored.photo_faces(photo_id)['faces']
        self.assertEqual(len(final), 121)
        self.assertEqual(sum(face['personId'] == 'unknown' for face in final), 120)
        self.assertEqual(sum(face['name'] == 'Eva' for face in final), 1)
        self.assertTrue(all(face['manual'] for face in final))
        self.assertFalse(any(review['photoId'] == photo_id for review in restored.snapshot()['reviews']))
        self.assertTrue(all(not person['name'].startswith('Persona ') for person in restored.snapshot()['people']
                            if photo_id in person['photoIds']))

    def test_large_review_still_limits_manual_additions_and_rolls_back(self):
        item = self.item(0, changes=[{'action': 'add', 'box': self.box, 'name': 'Eva'}] * 101)
        before = self.store.photo_faces(item['photoId'])
        response = self.client.post('/pictures/reviews/batch', json=self.payload([item]))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.store.photo_faces(item['photoId']), before)

    def test_edit_keeps_import_deduplication_and_restart(self):
        item = self.item(2, edits=[{'rotate': 1}])
        digest = 'a' * 64
        with self.store.db() as db: db.execute('INSERT INTO photo_import_files VALUES (?,?)', (digest, item['photoId']))
        apply_batch(self.store, self.payload([item]))
        restored = PhotoLibrary(self.store.root)
        self.assertEqual(restored.check_import([digest]), {'missing': []})
        self.assertEqual(len(restored.snapshot()['photos']), 4)

    def test_custom_batch_can_exceed_100_and_resuming_keeps_the_queue(self):
        with self.store.db() as db:
            row = db.execute('SELECT * FROM photos LIMIT 1').fetchone()
            for n in range(105):
                db.execute('INSERT INTO photos VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                    (f'pending-{n}', f'pending-{n}.jpg', 'gallery', f'{n}.jpg', n, n, 0, row['metadata'], None, None, 'pending'))
        with patch('photo_library.LocalFaceEngine.available', return_value=True), patch('photo_library.threading.Thread.start'):
            self.store.start_faces(102)
            self.assertEqual(self.store.snapshot()['faces']['total'], 102)
            self.store.pause_faces()
            self.store.start_faces(1)
            self.assertEqual(self.store.snapshot()['faces']['total'], 102)
            self.store.faces_running = False; self.store.face_lock.release()

    def test_invalid_transform_and_foreign_faces_are_rejected(self):
        for edit in [{'rotate': True}, {'scale': float('nan')}, {'scale': 200}, {'crop': {'x': 0}}]:
            with self.subTest(edit=edit):
                response = self.client.post('/pictures/reviews/batch', json=self.payload([self.item(2, edits=[edit])]))
                self.assertEqual(response.status_code, 400)
        face = self.store.photo_faces(self.photos[0]['id'])['faces'][0]
        response = self.client.post('/pictures/reviews/batch', json=self.payload([self.item(2, changes=[{'action': 'remove', 'faceId': face['id']}])]))
        self.assertEqual(response.status_code, 409)

    def test_edit_and_gallery_deletion_are_atomic(self):
        one = self.item(1, delete=True)
        two = self.item(2, changes=[{'action': 'add', 'box': {}, 'name': 'Invalid'}])
        before = self.store.snapshot()
        with self.assertRaises(PhotoError): apply_batch(self.store, self.payload([one, two]))
        self.assertEqual(self.store.snapshot(), before)
        self.assertTrue(self.store.safe_file(one['expectedPath']).exists())

    def test_custom_analysis_limit_and_invalid_values(self):
        with self.store.db() as db: db.execute("UPDATE photos SET face_state='pending'")
        with patch('photo_library.LocalFaceEngine.available', return_value=True), patch('photo_library.threading.Thread.start'):
            for limit in [0, -1, True, 1.2, '1', 5]:
                response = self.client.post('/pictures/people/scan', json={'limit': limit})
                self.assertEqual(response.status_code, 400)
            response = self.client.post('/pictures/people/scan', json={'limit': 2})
            self.assertEqual(response.status_code, 202)
            self.assertEqual(self.store.snapshot()['faces']['total'], 2)
            self.assertEqual(len(self.store.snapshot()['faces']['batchPhotoIds']), 2)
            self.store.faces_running = False; self.store.face_lock.release()

if __name__ == '__main__': unittest.main()
