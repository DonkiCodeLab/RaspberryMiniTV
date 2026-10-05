import gzip
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api


class CatalogCompressionTests(unittest.TestCase):
    def response(self, encoding, path='/videos', status=200, method='GET'):
        with api.app.test_request_context(path, method=method, headers={'Accept-Encoding': encoding}):
            response = api.jsonify({'movies': [{'name': 'Example movie', 'relativePath': f'Movies/{index}.mkv'} for index in range(100)]})
            response.status_code = status
            original = response.get_data()
            return original, api.compress_video_catalog(response)

    def test_gzip_preserves_catalog_and_updates_wire_length(self):
        original, response = self.response('gzip, deflate, br')
        self.assertEqual(gzip.decompress(response.get_data()), original)
        self.assertLess(len(response.get_data()), len(original))
        self.assertEqual(response.content_length, len(response.get_data()))
        self.assertEqual(response.headers['Content-Encoding'], 'gzip')
        self.assertIn('Accept-Encoding', response.vary)

    def test_clients_without_gzip_and_exclusions_keep_plain_json(self):
        for encoding in ('', 'br', 'gzip;q=0, identity'):
            original, response = self.response(encoding)
            self.assertEqual(response.get_data(), original)
            self.assertNotIn('Content-Encoding', response.headers)
            self.assertIn('Accept-Encoding', response.vary)

    def test_other_routes_errors_and_head_are_not_compressed(self):
        for options in ({'path': '/health'}, {'status': 401}, {'method': 'HEAD'}):
            original, response = self.response('gzip', **options)
            self.assertEqual(response.get_data(), original)
            self.assertNotIn('Content-Encoding', response.headers)


if __name__ == '__main__':
    unittest.main()
