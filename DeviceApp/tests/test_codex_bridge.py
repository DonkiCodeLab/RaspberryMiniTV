import json
import os
from pathlib import Path
import pwd
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from flask import Flask, jsonify, request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from codex_bridge import CodexBridge, CodexError, create_codex_blueprint, password_hash


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.workspace = self.root / 'workspace'
        (self.workspace / '.git').mkdir(parents=True)
        self.path = self.root / 'config.json'
        self.salt = 'a1' * 16
        self.config = dict(user=pwd.getpwuid(os.getuid()).pw_name, home=str(self.root),
                           workspace=str(self.workspace), binary='/bin/false', salt=self.salt,
                           passwordHash=password_hash('admin-secret', self.salt))
        self.path.write_text(json.dumps(self.config))
        self.path.chmod(0o600)
        self.bridge = CodexBridge(self.path)
        self.addCleanup(self.bridge.close)

    def test_separate_admin_auth_expiry_rate_limit_and_config_permissions(self):
        with self.assertRaises(CodexError):
            self.bridge.authorize('family-pin')
        token = self.bridge.unlock('admin-secret')['token']
        self.bridge.authorize(token)
        self.bridge.sessions[token] = 0
        with self.assertRaises(CodexError):
            self.bridge.authorize(token)
        for _ in range(4):
            with self.assertRaises(CodexError) as ctx:
                self.bridge.unlock('wrong')
            self.assertEqual(ctx.exception.status, 403)
        with self.assertRaises(CodexError) as ctx:
            self.bridge.unlock('admin-secret')
        self.assertEqual(ctx.exception.status, 429)
        self.path.chmod(0o666)
        self.assertFalse(self.bridge.status()['configured'])

    def test_no_root_and_no_inherited_credentials(self):
        user = pwd.getpwuid(os.getuid())
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'secret', 'SSH_AUTH_SOCK': 'socket', 'WEB_PIN': '1234'}):
            if user.pw_uid:
                _, options = self.bridge.launch_options()
                self.assertNotIn('OPENAI_API_KEY', options['env'])
                self.assertNotIn('SSH_AUTH_SOCK', options['env'])
                self.assertNotIn('WEB_PIN', options['env'])
                self.assertEqual(options['env']['CODEX_HOME'], str(self.root.resolve() / '.codex'))
        with patch('codex_bridge.pwd.getpwnam', return_value=pwd.getpwnam('root')):
            with self.assertRaises(CodexError):
                self.bridge.launch_options()

    def test_api_rejects_untrusted_requests_before_starting_process(self):
        app = Flask(__name__)
        app.register_blueprint(create_codex_blueprint(self.bridge))

        @app.before_request
        def family_pin():
            if request.headers.get('X-Web-Pin') != 'family':
                return jsonify(error='Unauthorized'), 401

        client = app.test_client()
        pin = {'X-Web-Pin': 'family'}
        with patch.object(self.bridge, 'start') as start:
            self.assertEqual(client.get('/codex/status').status_code, 401)
            self.assertEqual(client.get('/codex/state', headers=pin).status_code, 403)
            self.assertEqual(client.post('/codex/send', headers=pin, json={'prompt': 'change code'}).status_code, 403)
            self.assertEqual(client.post('/codex/unlock', headers=pin, json=[]).status_code, 400)
            self.assertEqual(client.post('/codex/unlock', headers=pin, json={'password': 'family'}).status_code, 403)
            unlocked = client.post('/codex/unlock', headers=pin, json={'password': 'admin-secret'})
            self.assertEqual(unlocked.status_code, 200)
            headers = {**pin, 'X-Codex-Session': unlocked.json['token']}
            self.assertEqual(client.post('/codex/send', headers=headers, json=[]).status_code, 400)
            self.assertEqual(client.post('/codex/send', headers=headers, data='x' * 70000).status_code, 413)
            self.assertEqual(client.post('/codex/lock', headers=headers, json={}).status_code, 200)
            self.assertEqual(client.get('/codex/state', headers=headers).status_code, 403)
            self.assertEqual(unlocked.headers['Cache-Control'], 'no-store')
            start.assert_not_called()

    def notify(self, method, **params):
        self.bridge._notification({'method': method, 'params': {'threadId': 'thread-1', **params}})

    def test_stream_completion_failure_and_pending_approvals(self):
        bridge = self.bridge
        bridge.thread = {'id': 'thread-1', 'turns': []}
        self.notify('turn/started', turn={'id': 'turn-1', 'status': 'inProgress', 'items': []})
        self.notify('item/agentMessage/delta', turnId='turn-1', itemId='reply-1', delta='Hola ')
        self.notify('item/agentMessage/delta', turnId='turn-1', itemId='reply-1', delta='mundo')
        self.notify('item/completed', turnId='turn-1', item={'id': 'reply-1', 'type': 'agentMessage', 'text': 'Hola mundo.'})
        bridge.approvals['9'] = {'id': 9}
        self.notify('turn/completed', turn={'id': 'turn-1', 'status': 'failed', 'items': [], 'error': {'message': 'Rate limit'}})
        self.assertEqual(bridge.thread['turns'][0]['items'][0]['text'], 'Hola mundo.')
        self.assertFalse(bridge.busy)
        self.assertEqual(bridge.error, 'Rate limit')
        self.assertFalse(bridge.approvals)
        with patch.object(bridge, '_write') as write:
            bridge._server_request({'id': 10, 'method': 'item/commandExecution/requestApproval', 'params': {'command': 'ls'}})
            with self.assertRaises(CodexError):
                bridge.reply({'id': 10, 'decision': 'acceptForSession'})
            bridge.reply({'id': 10, 'decision': 'decline'})
            write.assert_called_with({'id': 10, 'result': {'decision': 'decline'}})
            bridge._server_request({'id': 11, 'method': 'item/permissions/requestApproval', 'params': {}})
            write.assert_called_with({'id': 11, 'result': {'permissions': {}, 'scope': 'turn'}})
            bridge._server_request({'id': 12, 'method': 'unknown', 'params': {}})
            self.assertEqual(write.call_args.args[0]['error']['code'], -32601)

    def test_user_questions_and_stale_approvals(self):
        bridge = self.bridge
        message = {'id': 1, 'method': 'item/tool/requestUserInput', 'params': {'questions': [{'id': 'q', 'question': 'Which?'}]}}
        bridge._server_request(message)
        with patch.object(bridge, '_write') as write:
            with self.assertRaises(CodexError):
                bridge.reply({'id': 1, 'answers': {}})
            bridge.reply({'id': 1, 'answers': {'q': 'First', 'extra': 'ignored'}})
            write.assert_called_once_with({'id': 1, 'result': {'answers': {'q': {'answers': ['First']}}}})
            with self.assertRaises(CodexError):
                bridge.reply({'id': 1, 'answers': {'q': 'Second'}})

    def test_scope_prompt_validation_and_single_running_turn(self):
        bridge = self.bridge
        with patch.object(bridge, 'start'), patch.object(bridge, 'rpc') as rpc:
            for prompt in (None, [], '', ' ' * 5, 'x' * 16001):
                with self.assertRaises(CodexError):
                    bridge.action('send', {'prompt': prompt})
            rpc.assert_not_called()
            rpc.return_value = {'thread': {'id': 'other', 'cwd': '/private/other-project'}}
            with self.assertRaises(CodexError) as ctx:
                bridge.action('select', {'threadId': 'other'})
            self.assertEqual(ctx.exception.status, 403)
            self.assertEqual(rpc.call_count, 1)
            bridge.busy = True
            for action in ('send', 'select', 'login', 'logout'):
                with self.assertRaises(CodexError) as ctx:
                    bridge.action(action, {'prompt': 'Hello'})
                self.assertEqual(ctx.exception.status, 409)

    def test_rpc_timeout_stops_process_before_retry(self):
        with patch.object(self.bridge, '_write'), patch.object(self.bridge, 'close') as close:
            with self.assertRaises(CodexError) as ctx:
                self.bridge.rpc('turn/start', {}, timeout=.01)
            self.assertEqual(ctx.exception.status, 504)
            self.assertEqual(ctx.exception.method, 'turn/start')
            close.assert_called_once()
            self.assertEqual(self.bridge.pending, {})

    def test_rpc_rejection_preserves_method_and_protocol_error(self):
        rejection = {'code': -32602, 'message': 'Unsupported dynamicTools', 'data': {'private': 'omitted'}}
        def reject(message):
            entry = self.bridge.pending[message['id']]
            entry['error'] = rejection
            entry['event'].set()
        with patch.object(self.bridge, '_write', side_effect=reject):
            with self.assertRaises(CodexError) as ctx:
                self.bridge.rpc('thread/start', {})
        self.assertEqual(ctx.exception.method, 'thread/start')
        self.assertEqual(ctx.exception.rpc_error, {'code': -32602, 'message': 'Unsupported dynamicTools'})
        self.assertEqual(self.bridge.pending, {})

    def test_login_completion_race_retry_cancel_and_account_refresh(self):
        bridge = self.bridge
        login = {'type': 'chatgptDeviceCode', 'loginId': 'login-1',
                 'verificationUrl': 'https://auth.openai.com/codex/device', 'userCode': 'TEST-CODE'}
        with patch.object(bridge, 'start'), patch.object(bridge, 'rpc') as rpc:
            rpc.return_value = login
            self.assertEqual(bridge.action('login', {}), login)
            self.assertEqual(bridge.action('login', {}), login)
            self.assertEqual(rpc.call_count, 1)
            bridge.action('cancel-login', {})
            rpc.assert_called_with('account/login/cancel', {'loginId': 'login-1'})
            self.assertTrue(bridge.snapshot()['login']['cancelled'])
            self.notify('account/login/completed', loginId='login-1', success=False, error='Cancelled')
            self.assertTrue(bridge.snapshot()['login']['cancelled'])

            login = {**login, 'loginId': 'login-2'}
            def immediate_completion(method, params):
                if method == 'account/login/start':
                    self.notify('account/login/completed', loginId='login-2', success=True, error=None)
                    return login
                return {'account': {'type': 'chatgpt', 'email': 'test@example.test'}}
            rpc.side_effect = immediate_completion
            self.assertTrue(bridge.action('login', {})['success'])
            state = bridge.snapshot()
            self.assertTrue(state['login']['completed'])
            self.assertEqual(state['account']['email'], 'test@example.test')
            # An old cancelled/expired attempt must not replace the completed login.
            self.notify('account/login/completed', loginId='login-1', success=False, error='Expired')
            self.assertTrue(bridge.snapshot()['login']['success'])

    def test_failed_login_can_retry_and_invalid_response_never_stays_pending(self):
        with patch.object(self.bridge, 'start'), patch.object(self.bridge, 'rpc') as rpc:
            rpc.side_effect = CodexError('No network', 502)
            with self.assertRaisesRegex(CodexError, 'No network'):
                self.bridge.action('login', {})
            self.assertIsNone(self.bridge.login)
            rpc.side_effect = None
            rpc.return_value = {}
            with self.assertRaisesRegex(CodexError, 'enlace y un código válidos'):
                self.bridge.action('login', {})
            self.assertIsNone(self.bridge.login)
            rpc.return_value = {'loginId': 'retry', 'verificationUrl': 'https://auth.openai.com/codex/device', 'userCode': 'TEST'}
            self.assertEqual(self.bridge.action('login', {})['loginId'], 'retry')

    def test_web_login_survives_request_thread_exit_and_completes_without_restart(self):
        if os.geteuid() == 0:
            self.skipTest('Production deliberately refuses root.')
        fake = self.root / 'fake-codex-login'
        fake.write_text('#!' + sys.executable + '\n' + r'''
import ctypes, json, signal, sys
if sys.platform == 'linux':
    # Reproduce bwrap --die-with-parent, including its thread lifetime semantics.
    assert ctypes.CDLL(None).prctl(1, signal.SIGKILL, 0, 0, 0) == 0
account = None
def emit(value): print(json.dumps(value), flush=True)
for line in sys.stdin:
    message = json.loads(line)
    if 'id' not in message: continue
    method, result = message.get('method'), {}
    if method == 'account/read': result = {'account': account}
    elif method == 'account/login/start':
        assert message['params']['type'] == 'chatgptDeviceCode'
        result = {'type': 'chatgptDeviceCode', 'loginId': 'web-login',
                  'verificationUrl': 'https://auth.openai.com/codex/device', 'userCode': 'TEST-CODE'}
    elif method == 'test/authorize':
        account = {'type': 'chatgpt', 'email': 'test@example.test'}
        emit({'method': 'account/login/completed', 'params': {'loginId': 'web-login', 'success': True, 'error': None}})
        emit({'method': 'account/updated', 'params': {'authMode': 'chatgpt', 'planType': 'plus'}})
    emit({'id': message['id'], 'result': result})
''')
        fake.chmod(0o700)
        self.config['binary'] = str(fake)
        self.path.write_text(json.dumps(self.config))
        app = Flask(__name__)
        app.register_blueprint(create_codex_blueprint(self.bridge))
        token = self.bridge.unlock('admin-secret')['token']
        headers = {'X-Codex-Session': token}

        def web_request(path, method='get'):
            responses = []
            def handle():
                with app.test_client() as client:
                    responses.append(getattr(client, method)(path, headers=headers, **({'json': {}} if method == 'post' else {})))
            request_thread = threading.Thread(target=handle)
            request_thread.start()
            request_thread.join(timeout=5)
            self.assertFalse(request_thread.is_alive())
            self.assertEqual(responses[0].status_code, 200)
            return responses[0].json

        self.assertIsNone(web_request('/codex/state')['account'])
        process = self.bridge.process
        self.assertTrue(self.bridge.process_owner.is_alive())
        login = web_request('/codex/login', 'post')
        self.assertEqual(login['userCode'], 'TEST-CODE')
        self.assertEqual(web_request('/codex/state')['login'], login)
        self.bridge.rpc('test/authorize', {})
        state = web_request('/codex/state')
        self.assertEqual(state['account']['type'], 'chatgpt')
        self.assertTrue(state['login']['success'])
        self.assertEqual(state['error'], '')
        self.assertIs(self.bridge.process, process)
        self.bridge.close()
        self.assertFalse(self.bridge.process_owner.is_alive())

    def test_spawn_failure_returns_without_hanging_request(self):
        with patch('codex_bridge.subprocess.Popen', side_effect=OSError('Missing binary')):
            with self.assertRaisesRegex(CodexError, 'No se pudo iniciar'):
                self.bridge.start()
        self.bridge.process_owner.join(timeout=1)
        self.assertFalse(self.bridge.process_owner.is_alive())

    def test_real_stdio_transport_with_fake_server(self):
        fake = self.root / 'fake-codex'
        fake.write_text('#!' + sys.executable + '\n' + r'''
import json, sys
def emit(value):
    print(json.dumps(value), flush=True)
for line in sys.stdin:
    message = json.loads(line)
    method = message.get('method')
    if 'id' not in message: continue
    result = {}
    if method == 'account/read': result = {'account': {'type': 'chatgpt'}}
    elif method == 'thread/start':
        assert message['params']['sandbox'] == 'workspace-write'
        result = {'thread': {'id': 'thread-1', 'turns': []}}
    elif method == 'turn/start':
        turn = {'id': 'turn-1', 'status': 'inProgress', 'items': []}
        emit({'method': 'turn/started', 'params': {'threadId': 'thread-1', 'turn': turn}})
        result = {'turn': turn}
    elif method == 'turn/interrupt':
        emit({'method': 'turn/completed', 'params': {'threadId': 'thread-1', 'turn': {'id': 'turn-1', 'status': 'interrupted', 'items': []}}})
    emit({'id': message['id'], 'result': result})
''')
        fake.chmod(0o700)
        self.config['binary'] = str(fake)
        self.path.write_text(json.dumps(self.config))
        if os.geteuid() == 0:
            self.skipTest('Production deliberately refuses root; run transport tests as an ordinary user.')
        self.bridge.start()
        self.bridge.action('send', {'prompt': 'Hello'})
        self.assertTrue(self.bridge.snapshot()['busy'])
        self.bridge.action('stop', {})
        self.assertFalse(self.bridge.snapshot()['busy'])
        self.assertEqual(self.bridge.snapshot()['thread']['turns'][0]['status'], 'interrupted')
        self.bridge.close()
        for _ in range(100):
            if self.bridge.error: break
            time.sleep(.01)
        self.assertIn('cerrado', self.bridge.error)


if __name__ == '__main__':
    unittest.main()
