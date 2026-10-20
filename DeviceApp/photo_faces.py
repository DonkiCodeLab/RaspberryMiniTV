"""Offline dlib recognition in a disposable, single-core process.

The API never imports the neural network. Pause terminates this process, leaving
the current photo pending. Only completed results are committed by PhotoLibrary.
"""
import importlib.util
import json
import os
from pathlib import Path
import select
import subprocess
import sys
import time


INSTALL_COMMAND = 'sudo bash DeviceApp/install_photo_support.sh --faces'
THREAD_ENV = {name: '1' for name in (
    'OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS',
    'NUMEXPR_NUM_THREADS', 'VECLIB_MAXIMUM_THREADS', 'BLIS_NUM_THREADS')}


class FacePaused(Exception):
    pass


class FaceEngineError(Exception):
    pass


def model_paths():
    # Locate data without importing the obsolete pkg_resources wrapper.
    spec = importlib.util.find_spec('face_recognition_models')
    if spec is None or not spec.origin:
        raise FaceEngineError('Faltan los modelos locales de Personas.')
    root = Path(spec.origin).parent / 'models'
    paths = [root / name for name in (
        'shape_predictor_5_face_landmarks.dat',
        'dlib_face_recognition_resnet_model_v1.dat')]
    if not all(path.is_file() and path.stat().st_size > 0 for path in paths):
        raise FaceEngineError('Faltan archivos del modelo local de Personas.')
    return paths


def limit_resources():
    # Called in the child only; web requests and playback keep their priority.
    os.environ.update(THREAD_ENV)
    try:
        if hasattr(os, 'sched_getaffinity'):
            cpus = os.sched_getaffinity(0)
            os.sched_setaffinity(0, {max(cpus)})
        os.nice(10)
    except OSError:
        pass


def load_models():
    import dlib
    import numpy as np
    predictor_path, recognition_path = model_paths()
    return (np, dlib.get_frontal_face_detector(),
            dlib.shape_predictor(str(predictor_path)),
            dlib.face_recognition_model_v1(str(recognition_path)))


def encode_photo(path, models):
    from PIL import Image, ImageOps
    try:
        from pillow_heif import register_heif_opener
        register_heif_opener()
    except ImportError:
        pass
    np, detector, predictor, network = models
    with Image.open(path) as source:
        if source.width * source.height > 50_000_000:
            raise ValueError('La foto supera 50 megapíxeles.')
        source.draft('RGB', (800, 800))
        source.thumbnail((800, 800))
        oriented = ImageOps.exif_transpose(source).convert('RGB')
        width, height = oriented.size
        image = np.asarray(oriented)
    # HOG detector + five landmarks + 128-dimensional ResNet descriptor.
    # Same embedding space as face-recognition, without loading its unused models.
    detections = []
    for face in detector(image, 1):
        left, top = max(0, face.left()), max(0, face.top())
        right, bottom = min(width, face.right() + 1), min(height, face.bottom() + 1)
        if right <= left or bottom <= top: continue
        detections.append({
            'encoding': list(network.compute_face_descriptor(image, predictor(image, face), 1)),
            # Fractions of the EXIF-oriented image; valid at every preview size.
            'box': {'x': left / width, 'y': top / height,
                    'width': (right - left) / width, 'height': (bottom - top) / height},
        })
    return detections


def worker():
    limit_resources()
    models = load_models()
    if '--check' in sys.argv:
        # Exercise both native models, not just Python package discovery.
        np, detector, predictor, network = models
        import dlib
        image = np.zeros((150, 150, 3), dtype=np.uint8)
        detector(image, 0)
        vector = network.compute_face_descriptor(image, predictor(image, dlib.rectangle(0, 0, 149, 149)), 1)
        if len(vector) != 128:
            raise FaceEngineError('Modelo local incompatible.')
        return
    for line in sys.stdin:
        try:
            result = {'encodings': encode_photo(json.loads(line)['path'], models)}
        except (OSError, ValueError, RuntimeError):
            result = {'photoError': True}
        print(json.dumps(result, allow_nan=False), flush=True)


class LocalFaceEngine:
    def __init__(self):
        self.process = None
        self.buffer = b''

    @staticmethod
    def command():
        return [sys.executable, '-u', str(Path(__file__).resolve())]

    @classmethod
    def available(cls):
        """Cheap check for the library view; installation performs a full check."""
        try:
            model_paths()
            return all(importlib.util.find_spec(name) is not None for name in ('dlib', 'numpy'))
        except (ImportError, ValueError, OSError, FaceEngineError):
            return False

    def encode(self, path, stop):
        if stop.is_set():
            raise FacePaused()
        if self.process is None:
            self.process = subprocess.Popen(self.command(), stdin=subprocess.PIPE,
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                env={**os.environ, **THREAD_ENV}, bufsize=0)
        try:
            self.process.stdin.write((json.dumps({'path': str(path)}) + '\n').encode())
            deadline = time.monotonic() + 120
            while True:
                if stop.is_set():
                    raise FacePaused()
                if time.monotonic() > deadline:
                    raise FaceEngineError('El motor local no respondió en 120 segundos.')
                if b'\n' in self.buffer:
                    line, self.buffer = self.buffer.split(b'\n', 1)
                    result = json.loads(line)
                    if result.get('photoError'):
                        raise ValueError('No se pudo analizar esta foto.')
                    return result['encodings']
                ready, _, _ = select.select([self.process.stdout], [], [], .1)
                if ready:
                    data = os.read(self.process.stdout.fileno(), 65536)
                    if not data:
                        raise FaceEngineError('Se ha detenido el motor local.')
                    self.buffer += data
                    if len(self.buffer) > 2 * 1024 * 1024:
                        raise FaceEngineError('Respuesta del motor local demasiado grande.')
        except (BrokenPipeError, KeyError, json.JSONDecodeError) as error:
            raise FaceEngineError('No se pudo comunicar con el motor local.') from error
        except FacePaused:
            self.close()
            raise

    def close(self):
        if self.process is not None:
            if self.process.poll() is None:
                self.process.terminate()
                try:
                    self.process.wait(timeout=1)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    self.process.wait(timeout=2)
            self.process.stdin.close()
            self.process.stdout.close()
            self.process = None
            self.buffer = b''


if __name__ == '__main__':
    try:
        worker()
    except Exception as error:
        print(f'Personas: {error}. Ejecuta: {INSTALL_COMMAND}', file=sys.stderr)
        sys.exit(1)
