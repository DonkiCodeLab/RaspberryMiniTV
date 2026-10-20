import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from photo_library import PhotoLibrary, PhotoError
from test_photo_library import picture
from test_photo_import import metadata, payload


class GalleryTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.store = PhotoLibrary(Path(temp.name) / 'Pictures')
        worker = patch.object(self.store, 'start_faces'); worker.start(); self.addCleanup(worker.stop)

    def photo(self):
        self.store.upload([picture()], import_data=payload(metadata()))
        return self.store.snapshot()['photos'][0]

    def test_nested_albums_add_and_remove_references_without_moving_unique_photo(self):
        photo = self.photo()
        self.store.group_faces(photo['id'], [[0.] * 128])
        first = self.store.create_folder('Mi familia')
        second = self.store.create_folder('Vacaciones', first['id'])
        for folder in (first, second): self.store.move([photo['id']], folder['id'])
        self.store.move([photo['id']], first['id'])
        before = self.store.snapshot()['photos'][0]
        self.assertEqual(len(self.store.snapshot()['photos']), 1)
        self.assertEqual(before['folderId'], 'gallery')
        self.assertTrue({first['id'], second['id']} <= set(before['folderIds']))
        self.store.delete_photos([photo['id']], 'album', first['id'])
        after = self.store.snapshot()['photos'][0]
        self.assertEqual(set(after['folderIds']), set(before['folderIds']) - {first['id']})
        self.assertEqual(after['latitude'], photo['latitude'])
        self.assertEqual(len(self.store.snapshot()['people']), 1)
        self.assertEqual(self.store.safe_file(photo['relativePath']).read_bytes(), picture().read())

    def test_global_delete_removes_every_reference_metadata_digest_and_cached_bytes(self):
        photo = self.photo()
        path = self.store.safe_file(photo['relativePath'])
        self.store.move([photo['id']], new_name='Another album')
        thumb = self.store.preview(photo['relativePath'])
        large = self.store.preview(photo['relativePath'], full=True)
        tiny = self.store.preview(photo['relativePath'], tiny=True)
        result = self.store.delete_photos([photo['id']], 'gallery')
        self.assertEqual(result, {'ok': True, 'deleted': 1, 'cleanupPending': 0})
        snapshot = self.store.snapshot()
        self.assertEqual(snapshot['photos'], [])
        self.assertEqual(snapshot['people'], [])
        self.assertTrue(all(not file.exists() for file in (path, thumb, large, tiny)))
        with self.store.db() as db:
            for table in ('photo_albums', 'photo_metadata', 'photo_import_files', 'photo_import_batches', 'faces'):
                self.assertEqual(db.execute('SELECT count(*) FROM ' + table).fetchone()[0], 0, table)
        self.store.sync()
        self.assertEqual(self.store.snapshot()['photos'], [])
        with self.assertRaises(PhotoError): self.store.safe_file(photo['relativePath'])
        # An intentionally repeated import must not replay a deleted receipt.
        again = self.store.upload([picture()], import_data=payload(metadata()))
        self.assertEqual(again['imported'], 1)
        self.assertNotEqual(again['saved'], [photo['relativePath']])

    def test_delete_with_missing_photo_or_invalid_scope_is_atomic(self):
        photo = self.photo()
        for ids, scope, folder in [([photo['id'], 'stale'], 'gallery', None), ([photo['id']], '', None), ([photo['id']], [], None),
                                   ([photo['id']], 'album', 'gallery'), ([photo['id']], 'album', 'missing')]:
            with self.assertRaises(PhotoError): self.store.delete_photos(ids, scope, folder)
            self.assertEqual(len(self.store.snapshot()['photos']), 1)
            self.assertTrue(self.store.safe_file(photo['relativePath']).exists())

    def test_interrupted_disk_cleanup_never_resurrects_an_image_and_retries_after_restart(self):
        photo = self.photo(); path = self.store.safe_file(photo['relativePath'])
        with patch.object(Path, 'unlink', side_effect=PermissionError('disk temporarily unavailable')):
            result = self.store.delete_photos([photo['id']], 'gallery')
        self.assertEqual(result['cleanupPending'], 1)
        self.assertTrue(path.exists())
        with self.assertRaises(PhotoError): self.store.safe_file(photo['relativePath'])
        self.store.sync()
        self.assertEqual(self.store.snapshot()['photos'], [])
        restarted = PhotoLibrary(self.store.root)
        self.assertFalse(path.exists())
        self.assertEqual(restarted.snapshot()['photos'], [])

    def test_migration_flattens_uploads_preserves_other_albums_and_keeps_original_bytes(self):
        photo = self.photo()
        with self.store.db() as db:
            db.execute("DELETE FROM photo_library_migrations")
            db.executemany('INSERT INTO folders VALUES (?,?,?,0)', [('uploads', '', 'Uploads'),
                ('old', 'uploads', 'Imported'), ('nested', 'old', 'Nested'), ('personal', '', 'Personal'), ('creative', 'ai', 'Creative')])
            db.execute("UPDATE photos SET folder='nested'")
            db.execute("INSERT INTO photo_albums VALUES (?, 'personal')", (photo['id'],))
            db.execute("INSERT INTO photo_albums VALUES (?, 'old')", (photo['id'],))
            db.execute("UPDATE photo_import_sessions SET folder='old'")
            db.execute("UPDATE photo_import_batches SET result=json_set(result, '$.folderId', 'old')")
        path = self.store.safe_file(photo['relativePath']); original = path.read_bytes()
        restarted = PhotoLibrary(self.store.root)
        snapshot = restarted.snapshot(); updated = snapshot['photos'][0]
        self.assertEqual(updated['folderId'], 'gallery')
        self.assertIn('personal', updated['folderIds'])
        self.assertFalse(set(updated['folderIds']) & {'old', 'nested', 'uploads'})
        self.assertFalse(any(f['parent'] == 'gallery' or f['id'] in {'uploads', 'old', 'nested'} for f in snapshot['folders']))
        self.assertEqual(next(f for f in snapshot['folders'] if f['id'] == 'personal')['parent'], 'albums')
        self.assertEqual(path.read_bytes(), original)
        self.assertEqual(PhotoLibrary(self.store.root).snapshot()['photos'], snapshot['photos'])
        with restarted.db() as db:
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
            self.assertEqual(db.execute('SELECT folder FROM photo_import_sessions').fetchone()[0], 'gallery')
            self.assertEqual(json.loads(db.execute('SELECT result FROM photo_import_batches').fetchone()[0])['folderId'], 'gallery')

    def test_arbitrary_album_depth_and_no_gallery_subfolders(self):
        parent = 'albums'
        for number in range(120): parent = self.store.create_folder(str(number), parent)['id']
        photo = self.photo(); self.store.move([photo['id']], parent)
        with self.store.db() as db: self.assertEqual(self.store.folder_root(db, parent), 'albums')
        with self.assertRaises(PhotoError): self.store.create_folder('Forbidden', 'gallery')

    def test_small_previews_come_from_cached_thumbnail_without_decoding_original(self):
        photo = self.photo()
        original_open = Image.open
        def cached_only(path, *args, **kwargs):
            self.assertTrue(Path(path).is_relative_to(self.store.cache))
            return original_open(path, *args, **kwargs)
        with patch('photo_previews.Image.open', side_effect=cached_only): tiny = self.store.preview(photo['relativePath'], tiny=True)
        with original_open(tiny) as image: self.assertEqual(image.size, (24, 24))
        self.assertLess(tiny.stat().st_size, 2000)


class GalleryApiTests(unittest.TestCase):
    def setUp(self):
        from test_photo_library import PhotoApiTests
        PhotoApiTests.setUp(self)

    def test_pin_authenticated_reference_and_global_deletion_round_trip(self):
        self.store.upload([picture()], import_data=payload(metadata()))
        photo = self.store.snapshot()['photos'][0]
        response = self.client.post('/pictures/albums/add', headers=self.headers,
                                    json={'ids': [photo['id']], 'name': 'Nested reference', 'parent': 'albums'})
        self.assertEqual(response.status_code, 200)
        album = response.json['folderId']
        result = self.client.post('/pictures/photos/delete', headers=self.headers,
                                  json={'ids': [photo['id']], 'scope': 'album', 'folderId': album})
        self.assertEqual(result.json, {'ok': True, 'removed': 1})
        self.assertTrue(self.store.safe_file(photo['relativePath']).exists())
        invalid = self.client.post('/pictures/photos/delete', headers=self.headers, json={'ids': [photo['id']]})
        self.assertEqual(invalid.status_code, 400)
        tiny = self.client.get('/pictures/content', headers=self.headers, query_string={'relativePath': photo['relativePath'], 'render': 'tiny'})
        self.assertEqual(tiny.status_code, 200); tiny.close()
        result = self.client.post('/pictures/photos/delete', headers=self.headers, json={'ids': [photo['id']], 'scope': 'gallery'})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json['deleted'], 1)
        content = self.client.get('/pictures/content', headers=self.headers, query_string={'relativePath': photo['relativePath']})
        self.assertEqual(content.status_code, 404)
        self.assertEqual(self.client.get('/pictures/metadata/' + photo['id'], headers=self.headers).status_code, 404)
        self.assertEqual(self.store.snapshot()['people'], [])


if __name__ == '__main__': unittest.main()
