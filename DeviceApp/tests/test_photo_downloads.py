"""Exercise the production route without starting the device's other services."""
import ast
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from flask import Flask, request, send_file

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from photo_library import PhotoLibrary, PhotoError
from test_photo_library import picture


class PhotoDownloadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.store = PhotoLibrary(Path(self.temp.name) / 'Pictures')
        with patch.object(self.store, 'start_faces'):
            self.relative = self.store.upload([picture('Vacaciones ñ.HEIC')], 'Album')['saved'][0]
        # Preserve the uploaded bytes and extension even if the source decoder
        # recognizes the content differently (the download must not decode it).
        self.original = self.store.safe_file(self.relative).read_bytes()
        app = Flask(__name__); app.config['TESTING'] = True
        tree = ast.parse((Path(__file__).resolve().parents[1] / 'control_api.py').read_text())
        route = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'picture_content')
        namespace = {'app': app, 'request': request, 'send_file': send_file, 'get_photo_library': lambda: self.store, 'PhotoError': PhotoError}
        exec(compile(ast.Module(body=[route], type_ignores=[]), 'control_api.py', 'exec'), namespace)
        @app.errorhandler(PhotoError)
        def error(value): return {'error': str(value)}, value.status
        self.client = app.test_client()

    def test_download_returns_exact_original_as_attachment_with_its_catalogue_name(self):
        with patch.object(self.store, 'preview', side_effect=AssertionError('Never decode downloads')):
            response = self.client.get('/pictures/content', query_string={'relativePath': self.relative, 'download': '1', 'render': 'thumb'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(hashlib.sha256(response.data).digest(), hashlib.sha256(self.original).digest())
        disposition = response.headers['Content-Disposition']
        self.assertTrue(disposition.startswith('attachment;'))
        self.assertIn("filename*=UTF-8''Vacaciones%20%C3%B1.HEIC", disposition)
        self.assertIn('private', response.headers['Cache-Control'])
        response.close()

    def test_preview_stays_inline_and_original_supports_partial_downloads(self):
        preview = self.client.get('/pictures/content', query_string={'relativePath': self.relative, 'render': 'preview'})
        self.assertEqual(preview.status_code, 200)
        self.assertTrue(preview.headers['Content-Disposition'].startswith('inline;')); preview.close()
        response = self.client.get('/pictures/content', query_string={'relativePath': self.relative, 'download': '1'}, headers={'Range': 'bytes=0-31'})
        self.assertEqual(response.status_code, 206); self.assertEqual(response.data, self.original[:32]); response.close()

    def test_download_rejects_traversal_missing_and_uncatalogued_photos(self):
        for relative in ['../photo_library.sqlite3', '/etc/passwd', 'missing.heic']:
            self.assertGreaterEqual(self.client.get('/pictures/content', query_string={'relativePath': relative, 'download': '1'}).status_code, 400)
        (self.store.root / 'loose.jpg').write_bytes(self.original)
        self.assertEqual(self.client.get('/pictures/content', query_string={'relativePath': 'loose.jpg', 'download': '1'}).status_code, 404)


if __name__ == '__main__': unittest.main()
