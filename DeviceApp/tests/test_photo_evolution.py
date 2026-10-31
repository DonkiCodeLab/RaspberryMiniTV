import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

from flask import Flask
from PIL import Image
from werkzeug.datastructures import FileStorage
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from photo_library import PhotoLibrary, create_photo_blueprint
from photo_evolution import detect_eyes


class EvolutionTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.store = PhotoLibrary(Path(temp.name) / 'Pictures')
        worker = patch.object(self.store, 'start_faces'); worker.start(); self.addCleanup(worker.stop)
        stream = io.BytesIO(); Image.new('RGB', (400, 300), 'orange').save(stream, 'PNG'); stream.seek(0)
        self.store.upload([FileStorage(stream=stream, filename='portrait.png')])
        self.photo = self.store.snapshot()['photos'][0]
        self.box = {'x': .2, 'y': .2, 'width': .5, 'height': .5}
        self.face = self.store.add_face(self.photo['id'], {'name': 'Ana', 'box': self.box})['faceId']
        app = Flask(__name__); app.register_blueprint(create_photo_blueprint(lambda: self.store))
        self.client = app.test_client()
        self.url = f"/pictures/photos/{self.photo['id']}/faces/{self.face}/evolution"

    def test_route_uses_persisted_photo_and_face_and_never_mutates_assignments(self):
        before = self.store.photo_faces(self.photo['id'])
        eyes = [{'x': .3, 'y': .4}, {'x': .5, 'y': .4}]
        with patch.object(self.store.evolution, 'eyes', return_value=eyes) as detect:
            response = self.client.get(self.url)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json, {'eyes': eyes, 'alignment': 'eyes'})
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            self.assertEqual(detect.call_args.args[1], self.box)
            self.assertTrue(detect.call_args.args[0].is_relative_to(self.store.root))
        self.assertEqual(before, self.store.photo_faces(self.photo['id']))
        self.assertEqual(self.client.get(self.url.replace(self.photo['id'], 'missing')).status_code, 404)
        self.store.remove_face(self.photo['id'], self.face)
        self.assertEqual(self.client.get(self.url).status_code, 404)

    def test_unavailable_model_and_timeout_allow_centered_portraits_without_caching_failure(self):
        with patch('photo_evolution.LocalFaceEngine.available', return_value=False), patch('photo_evolution.subprocess.run') as run:
            self.assertEqual(self.client.get(self.url).json, {'eyes': None, 'alignment': 'box'})
            run.assert_not_called()
        with patch('photo_evolution.LocalFaceEngine.available', return_value=True), patch('photo_evolution.subprocess.run', side_effect=subprocess.TimeoutExpired('predictor', 20)):
            self.assertEqual(self.client.get(self.url).json['alignment'], 'box')
        self.assertEqual(list(self.store.cache.glob('evolution-*')), [])

    def test_disk_cache_is_invalidated_by_face_box_or_source_change(self):
        path = self.store.safe_file(self.photo['relativePath'])
        eyes = [{'x': .3, 'y': .4}, {'x': .5, 'y': .4}]
        with patch('photo_evolution.LocalFaceEngine.available', return_value=True), patch('photo_evolution.subprocess.run', return_value=subprocess.CompletedProcess([], 0, json.dumps({'eyes': eyes}))) as run:
            self.assertEqual(self.store.evolution.eyes(path, self.box), eyes)
            self.assertEqual(self.store.evolution.eyes(path, self.box), eyes)
            self.assertEqual(run.call_count, 1)
            self.store.evolution.eyes(path, {**self.box, 'x': .1})
            self.assertEqual(run.call_count, 2)
            Image.new('RGB', (450, 300), 'blue').save(path)
            self.store.evolution.eyes(path, self.box)
            self.assertEqual(run.call_count, 3)
            self.assertEqual(run.call_args.kwargs['timeout'], 20)

    def test_predictor_coordinates_follow_exif_orientation_and_reject_bad_eye_geometry(self):
        path = self.store.root / 'oriented.jpg'
        exif = Image.Exif(); exif[274] = 6
        Image.new('RGB', (2400, 1200)).save(path, exif=exif)
        points = [(260, 350), (280, 350), (140, 350), (160, 350), (210, 440)]
        def predict(image, rectangle):
            self.assertEqual(image.size, (600, 1200))
            self.assertEqual(rectangle, (120, 240, 420, 840))
            return types.SimpleNamespace(part=lambda i: types.SimpleNamespace(x=points[i][0], y=points[i][1]))
        dlib = types.SimpleNamespace(rectangle=lambda *args: args, shape_predictor=lambda _: predict)
        numpy = types.SimpleNamespace(asarray=lambda image: image)
        with patch.dict(sys.modules, {'dlib': dlib, 'numpy': numpy}), patch('photo_faces.model_paths', return_value=['predictor', 'unused-network']):
            eyes = detect_eyes(path, self.box)
            self.assertEqual(eyes, [{'x': .25, 'y': 350 / 1200}, {'x': .45, 'y': 350 / 1200}])
            points[0] = points[1] = (50, 350)
            self.assertIsNone(detect_eyes(path, self.box))


if __name__ == '__main__': unittest.main()
