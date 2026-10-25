import sys
import unittest
from pathlib import Path
from flask import Flask, jsonify, request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tv_access import register_tv_access


class TVAccessTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        register_tv_access(app)

        @app.before_request
        def pin():
            if request.headers.get('X-Web-Pin') != '9999':
                return jsonify(error='Unauthorized'), 401

        @app.route('/videos')
        @app.route('/users/default/state', methods=['GET', 'PATCH'])
        @app.route('/poweroff', methods=['POST'])
        def route():
            return jsonify(ok=True)

        self.client = app.test_client()

    def test_preflight_does_not_require_pin_but_request_does(self):
        result = self.client.options('/videos', headers={'Origin': 'null', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'X-Web-Pin'})
        self.assertEqual(result.status_code, 204)
        self.assertEqual(result.headers['Access-Control-Allow-Origin'], 'null')
        result = self.client.get('/videos', headers={'Origin': 'null'})
        self.assertEqual(result.status_code, 401)
        self.assertEqual(result.headers['Access-Control-Allow-Origin'], 'null')
        self.assertEqual(self.client.get('/videos', headers={'Origin': 'null', 'X-Web-Pin': '9999'}).status_code, 200)

    def test_arbitrary_websites_and_admin_routes_are_not_granted_cors(self):
        for origin in ('https://untrusted.example', 'http://localhost:4180'):
            result = self.client.get('/videos', headers={'Origin': origin, 'X-Web-Pin': '9999'})
            self.assertNotIn('Access-Control-Allow-Origin', result.headers)
        result = self.client.options('/poweroff', headers={'Origin': 'null', 'Access-Control-Request-Method': 'POST'})
        self.assertNotIn('Access-Control-Allow-Origin', result.headers)

    def test_preflight_rejects_wrong_methods_and_headers(self):
        for method, headers in [('DELETE', 'X-Web-Pin'), ('GET', 'X-Codex-Session')]:
            result = self.client.options('/videos', headers={'Origin': 'null', 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': headers})
            self.assertEqual(result.status_code, 403)
            self.assertNotIn('Access-Control-Allow-Origin', result.headers)

    def test_profile_patch_and_same_origin_still_work(self):
        result = self.client.options('/users/default/state', headers={'Origin': 'null', 'Access-Control-Request-Method': 'PATCH', 'Access-Control-Request-Headers': 'content-type,x-web-pin'})
        self.assertEqual(result.status_code, 204)
        result = self.client.patch('/users/default/state', headers={'X-Web-Pin': '9999'}, json={'progress': {}})
        self.assertEqual(result.status_code, 200)
        self.assertNotIn('Access-Control-Allow-Origin', result.headers)


if __name__ == '__main__':
    unittest.main()
