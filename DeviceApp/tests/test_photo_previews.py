import errno
import hashlib
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from photo_library import PhotoLibrary
from photo_previews import ImageWorkLock
from test_photo_library import picture
from test_photo_import import metadata, payload


class PhotoPreviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.store = PhotoLibrary(Path(self.temp.name) / 'Pictures')
        self.worker = patch.object(self.store, 'start_faces'); self.worker.start(); self.addCleanup(self.worker.stop)

    def test_one_decode_creates_both_sizes_and_preserves_original_and_orientation(self):
        source = self.store.root / 'camera.jpg'
        exif = Image.Exif(); exif[274] = 6
        Image.new('RGB', (4000, 3000), 'blue').save(source, 'JPEG', exif=exif)
        original = hashlib.sha256(source.read_bytes()).hexdigest()
        opener = Image.open
        with patch('photo_previews.Image.open', wraps=opener) as decode:
            thumb = self.store.preview('camera.jpg')
            large = self.store.preview('camera.jpg', full=True)
            self.assertEqual(decode.call_count, 1)
        with opener(thumb) as image: self.assertEqual(image.size, (450, 600))
        with opener(large) as image:
            self.assertEqual(image.size, (1800, 2400))
            self.assertFalse(image.getexif())
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), original)
        self.assertEqual(list(self.store.cache.glob('*.tmp')), [])

    def test_new_import_has_both_previews_without_reopening_the_original(self):
        with patch('photo_previews.Image.open', wraps=Image.open) as decode:
            result = self.store.upload([picture()], import_data={**payload(metadata()), 'geolocatedOnly': True})
            self.assertEqual(decode.call_count, 1)
        with patch('photo_previews.Image.open', side_effect=AssertionError('must be cached')):
            self.assertTrue(self.store.preview(result['saved'][0]).exists())
            self.assertTrue(self.store.preview(result['saved'][0], full=True).exists())

    def test_missing_thumbnail_uses_large_jpeg_and_changed_original_invalidates_both(self):
        source = self.store.root / 'camera.jpg'
        Image.new('RGB', (1200, 900), 'red').save(source)
        thumb = self.store.preview('camera.jpg'); large = self.store.preview('camera.jpg', True)
        thumb.unlink()
        with patch('photo_previews.Image.open', wraps=Image.open) as decode:
            self.store.preview('camera.jpg')
            self.assertEqual(decode.call_args.args[0], large)
        import os
        stamp = source.stat().st_mtime_ns + 1000000
        os.utime(source, ns=(stamp, stamp))
        self.assertNotEqual(self.store.preview('camera.jpg'), thumb)
        self.assertNotEqual(self.store.preview('camera.jpg', True), large)

    def test_background_skips_bad_and_missing_files_and_never_changes_catalogue_revision(self):
        good = self.store.root / 'good.jpg'; Image.new('RGB', (100, 60), 'green').save(good)
        bad = self.store.root / 'bad.jpg'; bad.write_bytes(b'incomplete')
        preview = self.store.previews
        revision = self.store.revision
        with patch('photo_previews.time.sleep'):
            preview._warm([bad, self.store.root / 'missing.jpg', good])
        self.assertEqual(preview.progress['failed'], 2)
        self.assertEqual(preview.progress['done'], 3)
        self.assertTrue(all(p.exists() for p in preview.paths(good)))
        self.assertEqual(self.store.revision, revision)
        with patch.object(preview, 'get', side_effect=OSError(errno.ENOSPC, 'full')) as create:
            other = self.store.root / 'other.jpg'; other.write_bytes(good.read_bytes())
            preview._warm([other, other])
            self.assertEqual(create.call_count, 1)
        self.assertFalse(preview.progress['running'])

    def test_failed_atomic_upload_discards_its_derivatives_too(self):
        from werkzeug.datastructures import FileStorage
        import io
        with self.assertRaises(ValueError):
            self.store.upload([picture(), FileStorage(stream=io.BytesIO(b'broken'), filename='bad.jpg')], 'Fail')
        self.assertEqual(list(self.store.cache.iterdir()), [])
        self.assertEqual(list(self.store.root.iterdir()), [])

    def test_open_viewer_overtakes_queued_thumbnails_and_background_with_one_decoder(self):
        lock = ImageWorkLock(); order = []
        def work(priority):
            with lock.priority(priority): order.append(priority)
        lock.acquire()
        threads = [threading.Thread(target=work, args=(p,)) for p in [2, 1, 0]]
        for thread in threads: thread.start()
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            with lock.condition:
                if lock.waiting == [1, 1, 1]: break
            time.sleep(.001)
        lock.release()
        for thread in threads: thread.join(2)
        self.assertEqual(order, [0, 1, 2])
        self.assertFalse(lock.locked())


if __name__ == '__main__': unittest.main()
