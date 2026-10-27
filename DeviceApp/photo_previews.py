"""Small JPEG derivatives, with one decoder and priority for the open viewer."""
from contextlib import contextmanager
import hashlib
import os
import threading
import time
import uuid

from PIL import Image, ImageOps


class ImageWorkLock:
    def __init__(self):
        self.condition = threading.Condition()
        self.active = False
        self.waiting = [0, 0, 0]  # Viewer, visible thumbnails/imports, background.

    def acquire(self, priority=1, cancel=None):
        with self.condition:
            self.waiting[priority] += 1
            try:
                while self.active or any(self.waiting[:priority]):
                    if cancel is not None and cancel.is_set(): return False
                    self.condition.wait(timeout=.1 if cancel is not None else None)
                if cancel is not None and cancel.is_set(): return False
                self.active = True
                return True
            finally:
                self.waiting[priority] -= 1
                self.condition.notify_all()

    def release(self):
        with self.condition:
            self.active = False
            self.condition.notify_all()

    def locked(self):
        with self.condition: return self.active

    def __enter__(self):
        self.acquire()
        return self

    def __exit__(self, *_):
        self.release()

    @contextmanager
    def priority(self, value, cancel=None):
        acquired = self.acquire(value, cancel=cancel)
        try: yield acquired
        finally:
            if acquired: self.release()


class PhotoPreviews:
    def __init__(self, root, cache, image_lock):
        self.root, self.cache, self.image_lock = root, cache, image_lock
        self.start_lock = threading.Lock()
        self.started = False
        self.progress = {'total': 0, 'done': 0, 'failed': 0, 'running': False}

    def paths(self, path):
        relative = path.relative_to(self.root).as_posix()
        stamp = str(path.stat().st_mtime_ns)
        # Preserve existing cached files, including those made before this worker.
        return tuple(self.cache / (hashlib.sha256((relative + stamp + str(full)).encode()).hexdigest() + '.jpg')
                     for full in (False, True))

    def save(self, path, image, full=True):
        """Called with the decoder lock, including while an upload is already decoded."""
        thumb, large = self.paths(path)
        if thumb.exists() and (not full or large.exists()): return
        limit = 2400 if full else 600
        image.draft('RGB', (limit, limit))
        image.thumbnail((limit, limit))
        image = ImageOps.exif_transpose(image).convert('RGB')
        sizes = [(large, 2400, 86), (thumb, 600, 80)] if full else [(thumb, 600, 80)]
        for destination, target, quality in sizes:
            if destination.exists(): continue
            if target == 600: image.thumbnail((600, 600))
            temporary = self.cache / (uuid.uuid4().hex + '.tmp')
            try:
                image.save(temporary, 'JPEG', quality=quality, progressive=True)
                os.replace(temporary, destination)
            finally:
                temporary.unlink(missing_ok=True)

    def get(self, path, full=False, background=False):
        thumb, large = self.paths(path)
        requested = large if full else thumb
        if requested.exists() and (not background or (thumb.exists() and large.exists())): return requested
        with self.image_lock.priority(2 if background else 0 if full else 1):
            if requested.exists() and (not background or (thumb.exists() and large.exists())): return requested
            # A missing thumbnail can be made from an existing JPEG preview.
            with Image.open(large if large.exists() else path) as image:
                if image.width * image.height > 50_000_000: raise ValueError('Photo exceeds pixel limit')
                # A foreground thumbnail must not wait for a 2400px encode.
                # Imports and the background worker still prepare both sizes.
                self.save(path, image, full=full or background)
        return requested

    def discard(self, path):
        thumb, large = self.paths(path)
        for cached in (thumb, large, thumb.with_suffix('.tiny.jpg')): cached.unlink(missing_ok=True)

    def tiny(self, path):
        thumb, _ = self.paths(path)
        destination = thumb.with_suffix('.tiny.jpg')
        if destination.exists(): return destination
        self.get(path)
        with self.image_lock:
            if not destination.exists():
                temporary = self.cache / (uuid.uuid4().hex + '.tmp')
                try:
                    with Image.open(thumb) as source:
                        image = ImageOps.fit(source, (24, 24))
                        image.save(temporary, 'JPEG', quality=55)
                    os.replace(temporary, destination)
                finally:
                    temporary.unlink(missing_ok=True)
        return destination

    def start(self, paths, resolve=lambda path: path):
        with self.start_lock:
            if self.started: return
            self.started = True
            self.progress = {'total': len(paths), 'done': 0, 'failed': 0, 'running': True}
            threading.Thread(target=self._warm, args=(paths, resolve), daemon=True, name='photo-previews').start()

    def _warm(self, paths, resolve=lambda path: path):
        try:
            for path in paths:
                try:
                    path = resolve(path)
                    thumb, large = self.paths(path)
                    if not (thumb.exists() and large.exists()):
                        self.get(path, full=True, background=True)
                        # Yield CPU between images; foreground requests take the lock first.
                        time.sleep(.15)
                except FileNotFoundError:
                    self.progress['failed'] += 1
                except OSError as error:
                    self.progress['failed'] += 1
                    if error.errno is not None: break  # Storage failures must not cause a retry storm.
                except (ValueError, Image.DecompressionBombError):
                    self.progress['failed'] += 1
                self.progress['done'] += 1
        finally:
            self.progress['running'] = False
