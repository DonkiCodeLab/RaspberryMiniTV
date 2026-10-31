"""On-demand local eye alignment; originals and face assignments are never edited."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import uuid

from photo_faces import LocalFaceEngine, THREAD_ENV


def detect_eyes(path, box):
    import dlib
    import numpy as np
    from PIL import Image, ImageOps
    from photo_faces import model_paths
    try:
        from pillow_heif import register_heif_opener
        register_heif_opener()
    except ImportError:
        pass
    with Image.open(path) as source:
        if source.width * source.height > 50_000_000:
            raise ValueError('Photo exceeds pixel limit')
        source.draft('RGB', (1200, 1200))
        source.thumbnail((1200, 1200))
        image = ImageOps.exif_transpose(source).convert('RGB')
    width, height = image.size
    rectangle = dlib.rectangle(round(box['x'] * width), round(box['y'] * height),
        min(width - 1, round((box['x'] + box['width']) * width)),
        min(height - 1, round((box['y'] + box['height']) * height)))
    # Only the existing 5-point predictor: no detection or recognition network.
    shape = dlib.shape_predictor(str(model_paths()[0]))(np.asarray(image), rectangle)
    eyes = sorted([{'x': (shape.part(i).x + shape.part(i + 1).x) / (2 * width),
                    'y': (shape.part(i).y + shape.part(i + 1).y) / (2 * height)} for i in (0, 2)], key=lambda p: p['x'])
    dx = (eyes[1]['x'] - eyes[0]['x']) * width
    dy = (eyes[1]['y'] - eyes[0]['y']) * height
    if not (.15 * box['width'] * width <= dx <= .95 * box['width'] * width) or abs(dy) > dx:
        return None
    if any(not (box['x'] <= eye['x'] <= box['x'] + box['width'] and
                box['y'] <= eye['y'] <= box['y'] + box['height']) for eye in eyes):
        return None
    return eyes


class PhotoEvolution:
    def __init__(self, cache, image_lock):
        self.cache, self.image_lock = Path(cache), image_lock
        self.lock = threading.Lock()

    def eyes(self, path, box):
        if not LocalFaceEngine.available():
            return None
        stamp = path.stat()
        key = json.dumps(['evolution-eyes-v1', str(path), stamp.st_mtime_ns, stamp.st_size, box], sort_keys=True)
        destination = self.cache / ('evolution-' + hashlib.sha256(key.encode()).hexdigest() + '.json')
        # Bound concurrent subprocesses, and yield to foreground photo decoders.
        with self.lock:
            try:
                return json.loads(destination.read_text())['eyes']
            except (OSError, ValueError, KeyError, TypeError):
                pass
            try:
                with self.image_lock.priority(2):
                    result = subprocess.run([sys.executable, '-u', str(Path(__file__).resolve())],
                        input=json.dumps({'path': str(path), 'box': box}), text=True,
                        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=20, check=True,
                        env={**os.environ, **THREAD_ENV})
                eyes = json.loads(result.stdout)['eyes']
            except (OSError, ValueError, KeyError, subprocess.SubprocessError):
                return None  # A failed predictor still permits a centered portrait; retry next time.
            temporary = self.cache / (uuid.uuid4().hex + '.tmp')
            try:
                temporary.write_text(json.dumps({'eyes': eyes}))
                os.replace(temporary, destination)
            except OSError:
                pass
            finally:
                temporary.unlink(missing_ok=True)
            return eyes


if __name__ == '__main__':
    from photo_faces import limit_resources
    limit_resources()
    data = json.load(sys.stdin)
    print(json.dumps({'eyes': detect_eyes(data['path'], data['box'])}, allow_nan=False))
