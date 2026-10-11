"""Check the Codex blueprint inherits the real MiniTV PIN gate."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api


class CodexApiTests(unittest.TestCase):
    def test_real_api_requires_pin_then_separate_admin_session(self):
        client = control_api.app.test_client()
        with patch.object(control_api, 'current_web_pin', return_value='test-pin'), patch('codex_bridge.CodexBridge.start') as start:
            for path, method in (('/codex/status', 'get'), ('/codex/unlock', 'post'), ('/codex/state', 'get'),
                                 ('/codex/send', 'post'), ('/codex/reply', 'post'), ('/codex/login', 'post')):
                self.assertEqual(getattr(client, method)(path).status_code, 401)
            self.assertEqual(client.get('/codex/state', headers={'X-Web-Pin': 'test-pin'}).status_code, 403)
            self.assertEqual(client.post('/codex/send', headers={'X-Web-Pin': 'test-pin'}, json={'prompt': 'Hello'}).status_code, 403)
            start.assert_not_called()


if __name__ == '__main__':
    unittest.main()
