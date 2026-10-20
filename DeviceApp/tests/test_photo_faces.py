"""Exercise the actual subprocess transport and cancellation without native ML."""
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
import types
import unittest
from unittest.mock import Mock, patch

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from photo_faces import LocalFaceEngine, FacePaused, FaceEngineError, encode_photo, limit_resources


class FaceProcessTests(unittest.TestCase):
    def setUp(self):
        self.engine = LocalFaceEngine()
        self.addCleanup(self.engine.close)

    def command(self, code):
        patcher = patch.object(self.engine, 'command', return_value=[sys.executable, '-u', '-c', code])
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_worker_is_reused_and_close_reaps_process(self):
        self.command('import json, sys\nfor line in sys.stdin:\n print(json.dumps({"encodings": [[0.0]*128]}), flush=True)')
        stop = threading.Event()
        self.assertEqual(len(self.engine.encode('/local/photo.jpg', stop)[0]), 128)
        process = self.engine.process
        self.assertEqual(len(self.engine.encode('/local/other.jpg', stop)[0]), 128)
        self.assertIs(self.engine.process, process)
        self.engine.close()
        self.assertIsNotNone(process.poll())
        self.assertTrue(process.stdout.closed)

    def test_pause_interrupts_inflight_native_work_and_reaps_process(self):
        self.command('import sys, time\nsys.stdin.readline()\ntime.sleep(60)')
        stop = threading.Event()
        timer = threading.Timer(.2, stop.set)
        timer.start(); self.addCleanup(timer.cancel)
        start = time.monotonic()
        with self.assertRaises(FacePaused): self.engine.encode('/local/photo.jpg', stop)
        self.assertLess(time.monotonic() - start, 2)
        self.assertIsNone(self.engine.process)

    def test_pause_before_launch_never_starts_engine(self):
        stop = threading.Event(); stop.set()
        with patch('photo_faces.subprocess.Popen') as spawn:
            with self.assertRaises(FacePaused): self.engine.encode('/local/photo.jpg', stop)
            spawn.assert_not_called()

    def test_crashed_worker_reports_engine_failure_instead_of_empty_faces(self):
        self.command('import sys\nsys.stdin.readline()\nsys.exit(1)')
        with self.assertRaises(FaceEngineError):
            self.engine.encode('/local/photo.jpg', threading.Event())

    def test_bad_photo_can_be_skipped_without_killing_the_engine(self):
        self.command('import json, sys\nfor line in sys.stdin:\n print(json.dumps({"photoError": True}), flush=True)')
        with self.assertRaises(ValueError):
            self.engine.encode('/local/photo.jpg', threading.Event())
        self.assertIsNone(self.engine.process.poll())

    def test_models_are_required_even_when_python_packages_exist(self):
        with tempfile.TemporaryDirectory() as folder:
            spec = types.SimpleNamespace(origin=str(Path(folder) / '__init__.py'))
            with patch('photo_faces.importlib.util.find_spec', return_value=spec):
                self.assertFalse(LocalFaceEngine.available())

    def test_child_alone_gets_cpu_affinity_priority_and_thread_limits(self):
        with patch.dict(os.environ), patch('photo_faces.os.nice') as nice, \
                patch('photo_faces.os.sched_getaffinity', create=True, return_value={1, 2}) as get, \
                patch('photo_faces.os.sched_setaffinity', create=True) as set_affinity:
            limit_resources()
            set_affinity.assert_called_once_with(0, {2})
            nice.assert_called_once_with(10)
            self.assertEqual(os.environ['OPENBLAS_NUM_THREADS'], '1')

    def test_input_is_reduced_and_oriented_before_detection(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'portrait.jpg'
            exif = Image.Exif(); exif[274] = 6
            Image.new('RGB', (1600, 800)).save(path, exif=exif)
            arrays = Mock(); arrays.asarray.side_effect = lambda image: image
            face = Mock()
            face.left.return_value = -10; face.top.return_value = 80
            face.right.return_value = 99; face.bottom.return_value = 239
            detector = Mock(return_value=[face])
            predictor = Mock(return_value='landmarks')
            network = Mock(); network.compute_face_descriptor.return_value = [0.] * 128
            vectors = encode_photo(path, (arrays, detector, predictor, network))
            image = detector.call_args.args[0]
            self.assertEqual(image.size, (400, 800))
            self.assertEqual(image.mode, 'RGB')
            self.assertEqual(vectors, [{'encoding': [0.] * 128, 'box': {'x': 0., 'y': .1, 'width': .25, 'height': .2}}])
            network.compute_face_descriptor.assert_called_once_with(image, 'landmarks', 1)


if __name__ == '__main__': unittest.main()
