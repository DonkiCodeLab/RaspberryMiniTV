import base64
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image, TiffImagePlugin
from werkzeug.datastructures import FileStorage

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from photo_library import PhotoLibrary, PhotoError, read_metadata, edit_image, MAX_FILE_BYTES
from catalog_ai import AISettings


def picture(name='photo.jpg', color='red', exif=None):
    buffer = io.BytesIO()
    Image.new('RGB', (100, 60), color).save(buffer, 'JPEG', **({'exif': exif} if exif else {}))
    buffer.seek(0)
    return FileStorage(stream=buffer, filename=name)


class PhotoLibraryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.settings = AISettings(self.root / 'ai.json')
        self.settings.update({'enabled': True, 'apiKey': 'sk-test-private'})
        self.store = PhotoLibrary(self.root / 'Pictures', self.settings)
        self.worker = patch.object(self.store, 'start_faces')
        self.worker.start(); self.addCleanup(self.worker.stop)

    def upload(self, name='Viaje', **kwargs):
        return self.store.upload([picture()], name, **kwargs)

    def test_upload_goes_to_flat_gallery_and_survives_reload(self):
        result = self.upload()
        snap = self.store.snapshot()
        album = next(f for f in snap['folders'] if f['id'] == result['folderId'])
        self.assertEqual((album['name'], album['parent']), ('Galería', ''))
        photo = snap['photos'][0]
        self.assertIsNone(photo['takenAt'])
        self.assertIsNone(photo['latitude'])
        self.assertGreater(photo['uploadedAt'], 0)
        self.assertEqual(photo['width'], 100)
        self.assertEqual(PhotoLibrary(self.store.root, self.settings).snapshot()['photos'], snap['photos'])

    def test_distinct_content_is_preserved_and_duplicate_content_is_referenced(self):
        result = self.store.upload([picture(color='red'), picture(color='blue')], 'Viaje')
        self.assertEqual(len(set(result['saved'])), 2)
        self.assertTrue(all(self.store.safe_file(path).exists() for path in result['saved']))
        self.assertEqual(self.upload()['duplicates'], 1)
        album = self.store.create_folder('Viaje')
        with self.assertRaises(PhotoError): self.store.create_folder('Viaje')
        self.assertEqual(len(self.store.snapshot()['photos']), 2)

    def test_status_changes_only_after_commits_or_worker_state_changes(self):
        initial = self.store.status()
        self.assertEqual(initial, self.store.status())
        self.assertFalse(initial['working'])
        self.upload()
        saved = self.store.status()
        self.assertNotEqual(initial['revision'], saved['revision'])
        self.assertEqual(saved['revision'], self.store.snapshot()['revision'])
        with self.assertRaises(RuntimeError):
            with self.store.db() as db:
                db.execute("UPDATE photos SET name='rolled back'")
                raise RuntimeError('rollback')
        self.assertEqual(saved, self.store.status())
        self.store.faces_running = True
        active = self.store.status()
        self.assertTrue(active['working'])
        self.assertNotEqual(saved['revision'], active['revision'])
        self.store.faces_running = False
        self.assertEqual(saved, self.store.status())
        restarted = PhotoLibrary(self.store.root, self.settings)
        self.assertNotEqual(saved['revision'], restarted.status()['revision'])

    def test_initial_scan_advertises_work_before_thread_starts(self):
        with patch('photo_library.threading.Thread') as thread:
            self.store.start_sync(); self.store.start_sync()
        self.assertEqual(thread.call_count, 1)
        self.assertTrue(self.store.status()['working'])
        self.store.sync(reserved=True)
        self.assertFalse(self.store.status()['working'])

    def test_bad_file_rolls_back_whole_upload(self):
        broken = FileStorage(stream=io.BytesIO(b'not a jpeg'), filename='broken.jpg')
        with self.assertRaises(PhotoError): self.store.upload([picture(), broken], 'Broken')
        self.assertEqual(self.store.snapshot()['photos'], [])
        self.assertEqual(list(self.store.root.iterdir()), [])
        self.assertFalse(any(f['name'] == 'Broken' for f in self.store.snapshot()['folders']))

    def test_move_keeps_content_url_and_can_create_root_or_nested_folder(self):
        self.upload()
        photo = self.store.snapshot()['photos'][0]
        result = self.store.move([photo['id']], new_name='Vacaciones')
        updated = self.store.snapshot()['photos'][0]
        self.assertEqual(updated['relativePath'], photo['relativePath'])
        self.assertEqual(updated['folderId'], 'gallery')
        self.assertIn(result['folderId'], updated['folderIds'])
        sub = self.store.move([photo['id']], new_name='Playa', parent=result['folderId'])
        self.assertEqual(set(self.store.snapshot()['photos'][0]['folderIds']), {result['folderId'], sub['folderId']})
        self.assertEqual(self.store.safe_file(photo['relativePath']).read_bytes(), picture().read())

    def test_move_is_atomic_and_virtual_roots_cannot_receive_photos(self):
        original = self.upload()['folderId']
        photo = self.store.snapshot()['photos'][0]
        with self.assertRaises(PhotoError): self.store.move([photo['id'], 'missing'], new_name='Should not exist')
        self.assertFalse(any(f['name'] == 'Should not exist' for f in self.store.snapshot()['folders']))
        for target in ('map', 'people', 'gallery', 'albums', 'uploads', 'ai', None, []):
            with self.assertRaises(PhotoError): self.store.move([photo['id']], target)
        self.assertEqual(self.store.snapshot()['photos'][0]['folderId'], original)

    def test_folder_input_validation(self):
        for name in ('', '../escape', 'a/b', 'a\\b', 'x\nq', 'x' * 101, None, []):
            with self.assertRaises(PhotoError): self.store.create_folder(name)
        for parent in ('gallery', 'uploads', 'map', 'people'):
            with self.assertRaises(PhotoError): self.store.create_folder('Forbidden', parent)
        with self.assertRaises(PhotoError): self.store.create_folder('test', 'missing')

    def test_content_rejects_traversal_and_symlinks(self):
        outside = self.root / 'secret.jpg'; outside.write_bytes(picture().read())
        (self.store.root / 'link.jpg').symlink_to(outside)
        for path in ('../secret.jpg', str(outside), 'link.jpg', '..\\secret.jpg', ''):
            with self.assertRaises(PhotoError): self.store.safe_file(path)

    def test_legacy_import_preserves_paths_and_is_idempotent(self):
        legacy = self.store.root / 'Paris' / 'Day 1'; legacy.mkdir(parents=True)
        (legacy / 'old.jpg').write_bytes(picture().read())
        self.store.sync(); self.store.sync()
        photos = self.store.snapshot()['photos']
        self.assertEqual(len(photos), 1)
        self.assertEqual(photos[0]['relativePath'], 'Paris/Day 1/old.jpg')
        self.assertEqual(photos[0]['folderId'], 'gallery')
        self.assertFalse(any(f['parent'] == 'gallery' for f in self.store.snapshot()['folders']))

    def test_exif_date_gps_and_orientation(self):
        exif = Image.Exif()
        exif[34665] = {36867: '2024:06:12 16:20:31', 36881: '+02:00'}
        rational = TiffImagePlugin.IFDRational
        exif[34853] = {1: 'S', 2: (rational(33), rational(30), rational(0)), 3: 'W', 4: (rational(70), rational(40), rational(0))}
        exif[274] = 6
        result = self.store.upload([picture(exif=exif)], 'GPS')
        photo = self.store.snapshot()['photos'][0]
        self.assertEqual(photo['takenAt'], '2024-06-12T16:20:31+02:00')
        self.assertAlmostEqual(photo['latitude'], -33.5)
        self.assertAlmostEqual(photo['longitude'], -70.66666666666667)
        with Image.open(self.store.preview(result['saved'][0])) as preview:
            self.assertEqual(preview.size, (60, 100))
            self.assertFalse(preview.getexif())

    def test_concurrent_previews_decode_once_and_resize_before_copying_pixels(self):
        from concurrent.futures import ThreadPoolExecutor
        import time
        path = self.store.root / 'large.jpg'
        exif = Image.Exif(); exif[274] = 6
        Image.new('RGB', (4000, 3000), 'blue').save(path, 'JPEG', exif=exif)
        from PIL import ImageOps
        transpose = ImageOps.exif_transpose
        def inspect(image, *args, **kwargs):
            self.assertTrue(self.store.image_lock.locked())
            self.assertLessEqual(max(image.size), 2400)
            time.sleep(.02)
            return transpose(image, *args, **kwargs)
        with patch('photo_library.ImageOps.exif_transpose', side_effect=inspect) as convert:
            with ThreadPoolExecutor(max_workers=8) as pool:
                paths = list(pool.map(lambda _: self.store.preview('large.jpg'), range(8)))
        self.assertEqual(convert.call_count, 1)
        self.assertEqual(len(set(paths)), 1)
        with Image.open(paths[0]) as image:
            self.assertEqual(image.size, (450, 600))
        self.assertEqual(list(self.store.cache.glob('*.tmp')), [])

    def test_faces_group_locally_rename_and_remove_without_deleting_photo(self):
        self.store.upload([picture(), picture(color='blue')], 'Personas del viaje')
        photos = self.store.snapshot()['photos']
        self.store.group_faces(photos[0]['id'], [[0.] * 128, [1.] * 128])
        self.store.group_faces(photos[1]['id'], [[.001] * 128])
        people = self.store.snapshot()['people']
        self.assertEqual(len(people), 2)
        match = next(p for p in people if len(p['photoIds']) == 2)
        self.store.rename_person(match['id'], 'Ana')
        self.store.remove_matches(match['id'], [photos[1]['id']])
        self.assertEqual(len(self.store.snapshot()['photos']), 2)
        ana = next(p for p in self.store.snapshot()['people'] if p['name'] == 'Ana')
        self.assertEqual(ana['photoIds'], [photos[0]['id']])

    def test_generation_four_styles_no_recursive_inputs_or_duplicate_spend(self):
        result = self.upload('Creativo', parent='ai')
        image = picture().read()
        with patch('photo_library.threading.Thread') as thread:
            job = self.store.start_generation(result['folderId'])
        args = thread.call_args.kwargs['args']
        self.assertEqual(job['total'], 4)
        with patch('photo_library.edit_image', return_value=image) as edit, patch('photo_library.time.sleep'):
            self.store._generate(*args)
        self.assertEqual(edit.call_count, 4)
        snap = self.store.snapshot()
        self.assertEqual(len(snap['photos']), 5)
        self.assertEqual({p['style'] for p in snap['photos'] if p['sourceId']}, {'lego', 'foam', 'minecraft', 'ghibli'})
        self.assertEqual(snap['jobs'][0]['state'], 'complete')
        with self.assertRaises(PhotoError): self.store.start_generation(result['folderId'])
        self.assertNotIn('sk-test-private', json.dumps(snap))

    def test_partial_generation_retries_only_missing_variants_and_blocks_parallel_jobs(self):
        folder = self.upload('Creativo', parent='ai')['folderId']
        with patch('photo_library.threading.Thread') as thread:
            self.store.start_generation(folder)
        args = thread.call_args.kwargs['args']
        with self.assertRaises(PhotoError): self.store.start_generation(folder)
        with patch('photo_library.edit_image', side_effect=[picture().read(), PhotoError('Provider unavailable')]), patch('photo_library.time.sleep'):
            self.store._generate(*args)
        self.assertEqual(self.store.snapshot()['jobs'][0]['done'], 1)
        with patch('photo_library.threading.Thread') as thread:
            second = self.store.start_generation(folder)
        self.assertEqual(second['total'], 3)
        self.assertNotIn('lego', [item[-1] for item in thread.call_args.kwargs['args'][2]])

    def test_restart_marks_running_job_interrupted(self):
        folder = self.upload('Creativo', parent='ai')['folderId']
        with patch('photo_library.threading.Thread'): self.store.start_generation(folder)
        restarted = PhotoLibrary(self.store.root, self.settings)
        self.assertEqual(restarted.snapshot()['jobs'][0]['state'], 'interrupted')

    def test_ai_disabled_and_normal_album_cannot_generate(self):
        folder = self.upload()['folderId']
        with self.assertRaises(PhotoError): self.store.start_generation(folder)
        self.settings.update({'enabled': False})
        with self.assertRaises(PhotoError): self.store.start_generation('ai')

    def test_image_api_uses_reference_and_server_key(self):
        self.upload()
        photo = self.store.snapshot()['photos'][0]
        response = unittest.mock.MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({'data': [{'b64_json': base64.b64encode(b'png').decode()}]}).encode()
        with patch('photo_library.urllib.request.urlopen', return_value=response) as call:
            self.assertEqual(edit_image(self.store.safe_file(photo['relativePath']), 'lego', self.settings.credentials()), b'png')
        req = call.call_args.args[0]
        body = json.loads(req.data)
        self.assertEqual(req.full_url, 'https://api.openai.com/v1/images/edits')
        self.assertTrue(body['images'][0]['image_url'].startswith('data:image/jpeg;base64,'))
        self.assertEqual(req.get_header('Authorization'), 'Bearer sk-test-private')
        self.assertEqual(body['n'], 1)


class PhotoApiTests(unittest.TestCase):
    def setUp(self):
        import control_api
        self.api = control_api
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.store = PhotoLibrary(Path(self.temp.name) / 'Pictures')
        for name, value in [('get_photo_library', lambda: self.store), ('current_web_pin', lambda: 'test')]:
            patcher = patch.object(control_api, name, value); patcher.start(); self.addCleanup(patcher.stop)
        for name in ('start_sync', 'start_faces'):
            patcher = patch.object(self.store, name); patcher.start(); self.addCleanup(patcher.stop)
        self.client = control_api.app.test_client()
        self.headers = {'X-Web-Pin': 'test'}

    def test_all_routes_require_pin(self):
        for path, method in [('library', 'get'), ('status', 'get'), ('content', 'get'), ('upload', 'post'), ('folders', 'post'), ('move', 'post'),
                             ('albums/add', 'post'), ('photos/delete', 'post'), ('generate', 'post'), ('people/scan', 'post'), ('people/pause', 'post'), ('people/a/cover', 'post'), ('people/a', 'post'), ('people/a/remove', 'post')]:
            self.assertEqual(getattr(self.client, method)('/pictures/' + path).status_code, 401, path)

    def test_status_is_small_private_and_does_not_build_or_scan_catalogue(self):
        with patch.object(self.store, 'snapshot', side_effect=AssertionError('Must not serialize the catalogue')):
            response = self.client.get('/pictures/status', headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.json), {'revision', 'working'})
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.assertLess(len(response.data), 150)
        self.store.start_sync.assert_not_called()

    def test_upload_and_thumbnail_roundtrip(self):
        response = self.client.post('/pictures/upload', headers=self.headers, data={'albumName': 'Vacation', 'files': (picture().stream, 'a.jpg')})
        self.assertEqual(response.status_code, 200, response.json)
        path = response.json['saved'][0]
        content = self.client.get('/pictures/content', query_string={'relativePath': path, 'pin': 'test', 'render': 'thumb'})
        self.assertEqual(content.status_code, 200)
        self.assertEqual(content.mimetype, 'image/jpeg')
        content.close()
        snapshot = self.client.get('/pictures/library', headers=self.headers)
        self.assertEqual(snapshot.headers['Cache-Control'], 'no-store')
        self.assertEqual(len(snapshot.json['photos']), 1)

    def test_invalid_requests_return_400(self):
        for route in ('folders', 'move', 'generate'):
            self.assertEqual(self.client.post('/pictures/' + route, headers=self.headers, json=[]).status_code, 400)
        self.assertEqual(self.client.get('/pictures/content?relativePath=../secret.jpg', headers=self.headers).status_code, 400)

if __name__ == '__main__': unittest.main()
