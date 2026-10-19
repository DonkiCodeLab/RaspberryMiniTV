import io
import errno
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from photo_library import PhotoLibrary, PhotoError, read_metadata
from werkzeug.datastructures import FileStorage
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

    def test_preflight_and_metadata_only_reimport_do_not_read_or_decode_image_bytes(self):
        digest = hashlib.sha256(picture().read()).hexdigest()
        self.assertEqual(self.store.check_import([digest]), {'missing': [0]})
        original = self.store.upload([picture()], 'Mac', import_data=payload(metadata()))
        data = {**payload(metadata(title='Actualizado'), session='again'), 'digests': [digest], 'fileIndices': []}
        revision = self.store.status()['revision']
        with patch('photo_library.read_metadata', side_effect=AssertionError('must not decode')), patch.object(Path, 'open', side_effect=AssertionError('must not read image')):
            self.assertEqual(self.store.check_import([digest]), {'missing': []})
            self.assertEqual(self.store.status()['revision'], revision)
            result = self.store.upload([], folder_id=original['folderId'], import_data=data)
            self.assertEqual(self.store.upload([], folder_id=original['folderId'], import_data=data), result)
        self.assertEqual((result['imported'], result['duplicates']), (0, 1))
        self.assertEqual(result['saved'], original['saved'])
        self.assertEqual(self.store.snapshot()['photos'][0]['title'], 'Actualizado')
        self.assertEqual(len(list(self.store.root.rglob('*.jpg'))), 1)

    def test_mixed_manifest_preserves_full_record_indices_for_metadata_and_rejections(self):
        digest = hashlib.sha256(picture().read()).hexdigest()
        blue = hashlib.sha256(picture(color='blue').read()).hexdigest()
        invalid = hashlib.sha256(b'bad').hexdigest()
        self.store.upload([picture()], import_data={**payload(metadata()), 'geolocatedOnly': True})
        data = {**payload(metadata(title='Existing'), metadata(title='Broken'), metadata(title='New'), session='mixed'),
                'digests': [digest, invalid, blue], 'fileIndices': [1, 2], 'continueOnError': True, 'geolocatedOnly': True}
        result = self.store.upload([FileStorage(stream=io.BytesIO(b'bad'), filename='bad.jpg'), picture(color='blue')], import_data=data)
        self.assertEqual((result['imported'], result['duplicates']), (1, 1))
        self.assertEqual(result['rejected'][0]['index'], 1)
        self.assertEqual({photo['title'] for photo in self.store.snapshot()['photos']}, {'Existing', 'New'})
        self.assertTrue(all(photo['folderId'] == 'uploads' for photo in self.store.snapshot()['photos']))
        self.store.start_faces.assert_not_called()

    def test_stale_hashes_are_reported_missing_and_metadata_only_commit_is_atomic(self):
        digest = hashlib.sha256(picture().read()).hexdigest()
        original = self.store.upload([picture()], 'Mac', import_data=payload(metadata()))
        path = self.store.safe_file(original['saved'][0])
        path.write_bytes(b'changed')
        self.assertEqual(self.store.check_import([digest]), {'missing': [0]})
        path.unlink()
        self.assertEqual(self.store.check_import([digest]), {'missing': [0]})
        data = {**payload(metadata(), session='again'), 'digests': [digest], 'fileIndices': []}
        with self.assertRaises(PhotoError) as error: self.store.upload([], 'Retry', import_data=data)
        self.assertEqual(error.exception.status, 409)
        with self.store.db() as db:
            self.assertIsNone(db.execute("SELECT 1 FROM photo_import_sessions WHERE id='again'").fetchone())
        result = self.store.upload([picture()], 'Retry', import_data={**data, 'fileIndices': [0]})
        self.assertEqual(result['imported'], 1)
        self.assertEqual(self.store.check_import([digest]), {'missing': []})

    def test_manifest_rejects_malformed_indices_and_forged_content_hashes(self):
        digest = hashlib.sha256(picture().read()).hexdigest()
        for hashes, indices in [([], []), ([digest] * 21, [0]), (['invalid'], [0]), ([digest], [True]),
                                ([digest], [1]), ([digest], [0, 0]), ([digest], []), ([digest], None)]:
            with self.subTest(indices=indices), self.assertRaises(PhotoError):
                self.store.upload([picture()], 'Mac', import_data={**payload(metadata()), 'digests': hashes, 'fileIndices': indices})
        with patch('photo_library.read_metadata', side_effect=AssertionError('verify before decoding')):
            with self.assertRaises(PhotoError) as error:
                self.store.upload([picture(color='blue')], 'Mac', import_data={**payload(metadata()), 'digests': [digest], 'fileIndices': [0]})
        self.assertEqual(error.exception.status, 422)
        self.assertEqual(list(self.store.root.iterdir()), [])
        self.assertEqual(self.store.snapshot()['photos'], [])

    def test_geolocated_import_goes_directly_to_uploads_without_albums_or_face_workers(self):
        data = {**payload(metadata(latitude=0, longitude=0)), 'geolocatedOnly': True}
        result = self.store.upload([picture()], import_data=data)
        self.assertEqual(result['folderId'], 'uploads')
        snap = self.store.snapshot()
        self.assertEqual(len(snap['photos']), 1)
        self.assertEqual(snap['photos'][0]['folderId'], 'uploads')
        self.assertEqual(snap['photos'][0]['latitude'], 0)
        self.assertEqual(snap['photos'][0]['longitude'], 0)
        self.assertEqual(snap['photos'][0]['folderIds'], [])
        self.assertEqual({f['id'] for f in snap['folders']}, {'uploads', 'ai'})
        self.assertEqual(snap['people'], [])
        self.store.start_faces.assert_not_called()
        with self.store.db() as db:
            self.assertEqual(db.execute('SELECT face_state FROM photos').fetchone()[0], 'skip')
        self.assertEqual(self.store.upload([picture()], import_data=data), result)
        again = self.store.upload([picture()], import_data={**data, 'session': 'again'})
        self.assertEqual(again['duplicates'], 1)
        self.assertEqual(len(self.store.snapshot()['photos']), 1)

    def test_geolocated_import_rejects_missing_gps_before_writing_or_decoding_files(self):
        for record in [metadata(latitude=None, longitude=None), metadata(locationKnown=False), {'metadata': None, 'raw': None}]:
            with patch('photo_library.read_metadata', side_effect=AssertionError('must not decode')):
                with self.assertRaises(PhotoError):
                    self.store.upload([picture()], import_data={**payload(record), 'geolocatedOnly': True})
            self.assertEqual(list(self.store.root.iterdir()), [])
            self.assertEqual(self.store.snapshot()['photos'], [])

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

    def test_partial_batch_keeps_metadata_aligned_and_replays_rejections_without_duplicates(self):
        invalid = FileStorage(stream=io.BytesIO(b'bad'), filename='IMG_5851_edited.jpeg')
        data = {**payload(metadata(title='First'), metadata(title='Broken'), metadata(title='Last')), 'continueOnError': True}
        result = self.store.upload([picture(), invalid, picture(color='blue')], 'Mac', import_data=data)
        self.assertEqual((result['imported'], result['duplicates'], len(result['saved'])), (2, 0, 2))
        self.assertEqual(result['rejected'][0]['index'], 1)
        self.assertEqual(result['rejected'][0]['name'], 'IMG_5851_edited.jpeg')
        self.assertNotIn('pillow-heif', result['rejected'][0]['error'])
        self.assertEqual({photo['title'] for photo in self.store.snapshot()['photos']}, {'First', 'Last'})
        self.assertEqual(len(list(self.store.root.rglob('*.jpg'))), 2)
        with patch('photo_library.read_metadata', side_effect=AssertionError('A committed batch must not be reprocessed')):
            retry = self.store.upload([picture(), picture(), picture()], 'Mac', import_data=data)
        self.assertEqual(retry, result)
        # Retrying only the failed photo uses a new receipt and the same destination.
        fixed = self.store.upload([picture(color='green')], folder_id=result['folderId'],
            import_data={**payload(metadata(title='Recovered'), session='retry-failed'), 'continueOnError': True})
        self.assertEqual(fixed['folderId'], result['folderId'])
        self.assertEqual(fixed['imported'], 1)
        self.assertEqual(fixed['rejected'], [])
        self.assertEqual(len(self.store.snapshot()['photos']), 3)

    def test_upload_decodes_once_outside_catalogue_lock_and_hashes_original_bytes(self):
        original = picture().read()
        def inspect(path, **kwargs):
            self.assertFalse(self.store.lock._is_owned())
            return read_metadata(path, **kwargs)
        with patch('photo_library.read_metadata', side_effect=inspect) as decode:
            self.store.upload([picture(), picture(color='blue')], 'Mac', import_data=payload(metadata(), metadata()))
        self.assertEqual(decode.call_count, 2)
        with self.store.db() as db:
            self.assertIsNotNone(db.execute('SELECT photo FROM photo_import_files WHERE digest=?',
                                           (hashlib.sha256(original).hexdigest(),)).fetchone())

    def test_all_unreadable_batch_can_be_followed_by_valid_batch_in_same_session(self):
        result = self.store.upload([FileStorage(stream=io.BytesIO(b'bad'), filename='bad.heic')], 'Mac',
            import_data={**payload(metadata()), 'continueOnError': True})
        self.assertEqual(result['imported'], 0)
        self.assertIn('pillow-heif', result['rejected'][0]['error'])
        self.assertEqual(list(self.store.root.iterdir()), [])
        next_batch = self.store.upload([picture()], 'Mac', import_data={**payload(metadata(), batch='1'), 'continueOnError': True})
        self.assertEqual(next_batch['folderId'], result['folderId'])
        self.assertEqual(next_batch['imported'], 1)

    def test_storage_and_metadata_errors_still_abort_partial_import(self):
        for error_number in (errno.EIO, errno.ENOSPC, errno.EACCES):
            with self.subTest(error_number=error_number):
                with patch('photo_library.read_metadata', side_effect=OSError(error_number, 'storage error')), self.assertRaises(OSError):
                    self.store.upload([picture()], 'Mac', import_data={**payload(metadata()), 'continueOnError': True})
                self.assertEqual(list(self.store.root.iterdir()), [])
        with self.assertRaises(PhotoError):
            self.store.upload([picture()], 'Mac', import_data={**payload(metadata(latitude=91)), 'continueOnError': True})
        with self.store.db() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM photo_import_batches').fetchone()[0], 0)
        self.assertEqual(self.store.snapshot()['photos'], [])

    def test_people_snapshot_uses_bounded_queries_for_many_imported_people(self):
        self.store.upload([picture()], 'Mac', import_data=payload(metadata(people=[{'id': str(i), 'name': f'Person {i}'} for i in range(100)])))
        import sqlite3
        connect = sqlite3.connect
        statements = []
        def traced(*args, **kwargs):
            db = connect(*args, **kwargs)
            db.set_trace_callback(statements.append)
            return db
        with patch('photo_library.sqlite3.connect', side_effect=traced):
            snapshot = self.store.snapshot()
        self.assertEqual(len(snapshot['people']), 100)
        self.assertTrue(all(person['photoIds'] == [snapshot['photos'][0]['id']] for person in snapshot['people']))
        self.assertLess(len([sql for sql in statements if sql.startswith('SELECT')]), 15)


class PhotoImportAPITests(base.PhotoApiTests):
    def test_preflight_requires_pin_validates_limits_and_accepts_metadata_only_upload(self):
        digest = hashlib.sha256(picture().read()).hexdigest()
        route = '/pictures/import/check'
        self.assertEqual(self.client.post(route, json={'digests': [digest]}).status_code, 401)
        for invalid in [None, [], ['bad'], [digest] * 21]:
            self.assertEqual(self.client.post(route, headers=self.headers, json={'digests': invalid}).status_code, 400)
        self.assertEqual(self.client.post(route, headers=self.headers, json={'digests': [digest], 'extra': 'x' * 5000}).status_code, 413)
        data = {**payload(metadata()), 'geolocatedOnly': True, 'digests': [digest], 'fileIndices': [0]}
        self.store.upload([picture()], import_data=data)
        checked = self.client.post(route, headers=self.headers, json={'digests': [digest]})
        self.assertEqual(checked.json, {'missing': []})
        self.assertEqual(checked.headers['Cache-Control'], 'no-store')
        data.update(session='again', fileIndices=[])
        response = self.client.post('/pictures/upload', headers=self.headers, data={
            'metadata': (io.BytesIO(json.dumps(data).encode()), 'metadata.json')})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual((response.json['imported'], response.json['duplicates']), (0, 1))

    def test_partial_import_reports_unreadable_image_and_saves_valid_file(self):
        response = self.client.post('/pictures/upload', headers=self.headers, data={
            'albumName': 'Mac', 'files': [(io.BytesIO(b'bad'), 'bad.jpeg'), (picture().stream, 'good.jpg')],
            'metadata': (io.BytesIO(json.dumps({**payload(metadata(), metadata()), 'continueOnError': True}).encode()), 'metadata.json')})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json['imported'], 1)
        self.assertEqual(response.json['rejected'][0]['index'], 0)
        self.assertEqual(len(self.store.snapshot()['photos']), 1)

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
