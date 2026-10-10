import io
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import unittest
import urllib.error
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import catalog_ai as ai


def actor_plan():
    return {"intent": "filter", "message": "Películas con Tom Hanks", "groups": [
        {"conditions": [{"field": "actor", "op": "contains", "value": "Tom Hanks"}]}]}


def response_for(value):
    return {"status": "completed", "output": [{"type": "message", "role": "assistant", "status": "completed",
                                                 "content": [{"type": "output_text", "text": json.dumps(value)}]}]}


class SettingsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'private' / 'ai.json'
        self.settings = ai.AISettings(self.path)

    def test_defaults_and_public_settings_do_not_reveal_credentials(self):
        self.assertEqual(self.settings.public(), {'enabled': False, 'configured': False,
                                                  'model': 'gpt-4.1-mini', 'requestsPerMinute': 10})
        self.assertFalse(self.path.exists())
        public = self.settings.update({'apiKey': 'sk-test-private', 'enabled': True})
        self.assertTrue(public['configured'])
        self.assertTrue(public['enabled'])
        self.assertNotIn('apiKey', public)
        self.assertNotIn('private', json.dumps(public))
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o600)
        reopened = ai.AISettings(self.path)
        self.assertEqual(reopened.credentials()['apiKey'], 'sk-test-private')
        snapshot = reopened.credentials()
        snapshot['apiKey'] = 'changed'
        self.assertEqual(reopened.credentials()['apiKey'], 'sk-test-private')

    def test_blank_key_preserves_saved_secret_and_explicit_clear_removes_it(self):
        self.settings.update({'apiKey': 'sk-original', 'enabled': True, 'requestsPerMinute': 4})
        self.settings.update({'apiKey': '', 'model': 'gpt-4.1-mini-2025-04-14'})
        self.settings.update({'apiKey': '   ', 'enabled': False})
        self.assertEqual(self.settings.credentials()['apiKey'], 'sk-original')
        self.assertEqual(self.settings.public()['requestsPerMinute'], 4)
        self.assertEqual(self.settings.public()['model'], 'gpt-4.1-mini-2025-04-14')
        self.assertFalse(self.settings.update({'clearApiKey': True})['configured'])
        self.assertEqual(self.settings.credentials()['apiKey'], '')
        self.assertNotIn('sk-original', self.path.read_text())

    def test_invalid_updates_preserve_file_and_return_safe_errors(self):
        self.settings.update({'apiKey': 'sk-original'})
        original = self.path.read_bytes()
        for changes in ([1], {'enabled': 1}, {'enabled': 'yes'}, {'requestsPerMinute': True},
                        {'requestsPerMinute': 0}, {'requestsPerMinute': 31}, {'requestsPerMinute': '10'},
                        {'model': 'https://evil.example/model'}, {'model': ''}, {'model': 'x' * 101},
                        {'apiKey': 'sk-secret\nextra'}, {'apiKey': 'x' * 513}, {'apiKey': None},
                        {'clearApiKey': 'yes'}, {'configured': True}):
            with self.subTest(changes=changes), self.assertRaises(ai.AIError) as error:
                self.settings.update(changes)
            self.assertEqual(error.exception.status, 400)
            self.assertNotIn('sk-', str(error.exception))
            self.assertEqual(self.path.read_bytes(), original)

    def test_failed_atomic_write_retains_previous_key_and_removes_temporary_file(self):
        self.settings.update({'apiKey': 'sk-original'})
        with patch.object(ai.os, 'replace', side_effect=OSError('sk-new-secret write failed')):
            with self.assertRaises(ai.AIError) as error:
                self.settings.update({'apiKey': 'sk-new-secret'})
        self.assertEqual(error.exception.code, 'AI_SETTINGS_STORAGE_ERROR')
        self.assertNotIn('sk-', str(error.exception))
        self.assertEqual(self.settings.credentials()['apiKey'], 'sk-original')
        self.assertEqual(list(self.path.parent.iterdir()), [self.path])

    def test_corrupt_saved_config_is_not_silently_overwritten(self):
        self.path.parent.mkdir()
        self.path.write_text('{"apiKey":"sk-secret","enabled":"true"}')
        with self.assertRaises(ai.AIError) as error:
            self.settings.update({'model': 'gpt-4.1-mini'})
        self.assertEqual(error.exception.code, 'AI_SETTINGS_INVALID')
        self.assertNotIn('sk-secret', str(error.exception))
        self.assertIn('sk-secret', self.path.read_text())

    def test_no_environment_key_fallback(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'sk-environment'}):
            self.assertFalse(self.settings.public()['configured'])


class PlanValidationTests(unittest.TestCase):
    def test_or_groups_and_and_conditions_are_preserved(self):
        plan = actor_plan()
        plan['groups'][0]['conditions'].append({'field': 'year', 'op': 'gte', 'value': ' 1990 '})
        plan['groups'].append({'conditions': [{'field': 'director', 'op': 'contains', 'value': 'Spielberg'}]})
        clean = ai.validate_plan(plan, 'movies')
        self.assertEqual(clean['groups'][0]['conditions'][1]['value'], '1990')
        self.assertEqual(len(clean['groups']), 2)
        self.assertEqual(plan['groups'][0]['conditions'][1]['value'], ' 1990 ')

    def test_count_all_and_clarification_are_explicit(self):
        for intent in ('count', 'clarify', 'unsupported'):
            plan = {'intent': intent, 'message': 'Consulta', 'groups': []}
            self.assertEqual(ai.validate_plan(plan, 'books'), plan)
        with self.assertRaises(ai.AIError):
            ai.validate_plan({'intent': 'filter', 'message': '', 'groups': []}, 'movies')

    def test_disallowed_fields_operations_empty_values_and_extra_data_fail_closed(self):
        bad_conditions = [
            {'field': 'actor', 'op': 'gte', 'value': 'Tom'},
            {'field': 'year', 'op': 'contains', 'value': '1990'},
            {'field': 'year', 'op': 'eq', 'value': 'nineteen ninety'},
            {'field': 'year', 'op': 'eq', 'value': '0'},
            {'field': 'actor', 'op': 'contains', 'value': ''},
            {'field': 'actor', 'op': 'contains', 'value': ' '},
            {'field': 'actor', 'op': 'contains', 'value': 'x' * 161},
            {'field': 'actor', 'op': 'contains', 'value': 'Tom\nHanks'},
            {'field': 'actor', 'op': 'execute', 'value': 'secret'},
            {'field': 'sql', 'op': 'eq', 'value': 'SELECT *'},
            {'field': 'actor', 'op': 'eq', 'value': 'Tom', 'code': 'arbitrary'},
            {'field': ['actor'], 'op': 'contains', 'value': 'Tom'},
            {'field': 'actor', 'op': {'contains': True}, 'value': 'Tom'},
        ]
        for condition in bad_conditions:
            with self.subTest(condition=condition), self.assertRaises(ai.AIError) as error:
                ai.validate_plan({'intent': 'filter', 'message': '', 'groups': [{'conditions': [condition]}]}, 'movies')
            self.assertEqual(error.exception.code, 'AI_INVALID_PLAN')
        with self.assertRaises(ai.AIError):
            ai.validate_plan(actor_plan(), 'books')
        with self.assertRaises(ai.AIError):
            ai.validate_plan({**actor_plan(), 'matches': ['Invented title']}, 'movies')
        with self.assertRaises(ai.AIError):
            ai.validate_plan(actor_plan(), [])

    def test_plan_limits_and_clarifications_cannot_smuggle_conditions(self):
        for plan in ({**actor_plan(), 'groups': actor_plan()['groups'] * 9},
                     {**actor_plan(), 'groups': [{'conditions': actor_plan()['groups'][0]['conditions'] * 9}]},
                     {**actor_plan(), 'intent': 'clarify'},
                     {**actor_plan(), 'message': 'x' * 601},
                     {**actor_plan(), 'intent': ['filter']},
                     {**actor_plan(), 'groups': [{'conditions': []}]},
                     {'intent': 'unsupported', 'message': '', 'groups': []}):
            with self.subTest(plan=plan), self.assertRaises(ai.AIError):
                ai.validate_plan(plan, 'movies')


class PlannerTests(unittest.TestCase):
    def setUp(self):
        self.settings = {**ai.DEFAULTS, 'enabled': True, 'apiKey': 'sk-private-test'}
        self.opener = MagicMock()
        self.response = self.opener.open.return_value.__enter__.return_value
        self.response.read.return_value = json.dumps(response_for(actor_plan())).encode()
        patcher = patch.object(ai.urllib.request, 'build_opener', return_value=self.opener)
        self.build = patcher.start()
        self.addCleanup(patcher.stop)

    def call(self, **kwargs):
        return ai.plan_query(kwargs.get('prompt', '¿Qué películas tengo de Tom Hanks?'),
                             kwargs.get('section', 'movies'), kwargs.get('language', 'es-ES'),
                             kwargs.get('settings', self.settings), kwargs.get('options'))

    def test_response_uses_strict_schema_and_never_sends_catalogue_or_key_in_body(self):
        result = self.call(options={'genres': ['Drama', 'Ciencia ficción'], 'titles': ['Private file'],
                                    'files': ['/home/private/video.mp4']})
        self.assertEqual(result, actor_plan())
        request = self.opener.open.call_args.args[0]
        body = json.loads(request.data)
        self.assertEqual(request.full_url, 'https://api.openai.com/v1/responses')
        self.assertEqual(request.get_method(), 'POST')
        self.assertEqual(request.get_header('Authorization'), 'Bearer sk-private-test')
        self.assertEqual(body['model'], 'gpt-4.1-mini')
        user_input = json.loads(body['input'][0]['content'][0]['text'])
        self.assertEqual(user_input['currentDate'], ai.date.today().isoformat())
        self.assertIs(body['store'], False)
        self.assertIs(body['text']['format']['strict'], True)
        self.assertEqual(body['text']['format']['type'], 'json_schema')
        schema = body['text']['format']['schema']
        fields = schema['properties']['groups']['items']['properties']['conditions']['items']['properties']['field']['enum']
        self.assertEqual(fields, list(ai.SECTION_FIELDS['movies']))
        self.assertNotIn('sk-private-test', request.data.decode())
        self.assertNotIn('Private file', request.data.decode())
        self.assertNotIn('/home/private', request.data.decode())
        self.assertNotIn('tools', body)
        self.assertEqual(self.opener.open.call_args.kwargs['timeout'], 30)
        self.assertEqual(self.response.read.call_args.args[0], ai.MAX_RESPONSE_BYTES + 1)
        self.assertIs(self.build.call_args.args[0], ai._NoRedirect)

    def test_query_validation_and_disabled_settings_prevent_requests(self):
        for kwargs in ({'prompt': ''}, {'prompt': ' '}, {'prompt': 'x' * 2001}, {'prompt': 1},
                       {'section': 'unknown'}, {'section': []},
                       {'settings': {**self.settings, 'enabled': False}},
                       {'settings': {**self.settings, 'apiKey': ''}}):
            with self.subTest(kwargs=kwargs), self.assertRaises(ai.AIError):
                self.call(**kwargs)
        self.opener.open.assert_not_called()

    def test_fine_tuned_model_schema_keeps_strict_shape_without_unsupported_length_keywords(self):
        self.call(settings={**self.settings, 'model': 'ft:gpt-4.1-mini:org:catalogue:abc123'})
        body = json.loads(self.opener.open.call_args.args[0].data)
        schema = body['text']['format']['schema']
        def check_schema(node):
            if isinstance(node, dict):
                self.assertFalse(set(node) & {'minLength', 'maxLength', 'minItems', 'maxItems'})
                if node.get('type') == 'object':
                    self.assertIs(node['additionalProperties'], False)
                    self.assertEqual(set(node['required']), set(node['properties']))
                for child in node.values():
                    check_schema(child)
            elif isinstance(node, list):
                for child in node:
                    check_schema(child)
        check_schema(schema)
        self.assertIs(body['text']['format']['strict'], True)
        self.assertIn('at most 8 groups', body['instructions'])
        self.assertIn('1 to 8 conditions', body['instructions'])
        self.assertIn('1 to 160 characters', body['instructions'])
        self.assertIn('600 characters', body['instructions'])
        self.assertLessEqual(body['max_output_tokens'], 2200)

    def test_connection_works_disabled_and_uses_bounded_strict_response(self):
        self.response.read.return_value = json.dumps(response_for({'ok': True})).encode()
        result = ai.test_connection({**self.settings, 'enabled': False})
        self.assertEqual(result, {'ok': True, 'model': 'gpt-4.1-mini'})
        body = json.loads(self.opener.open.call_args.args[0].data)
        self.assertIs(body['store'], False)
        self.assertEqual(body['max_output_tokens'], 128)
        self.assertIs(body['text']['format']['strict'], True)
        self.assertNotIn('sk-private-test', json.dumps(result))

    def test_connection_accepts_settings_object_and_rejects_invalid_ok(self):
        with tempfile.TemporaryDirectory() as directory:
            settings = ai.AISettings(Path(directory) / 'ai.json')
            settings.update({'apiKey': 'sk-saved'})
            self.response.read.return_value = json.dumps(response_for({'ok': True})).encode()
            self.assertTrue(ai.test_connection(settings)['ok'])
            self.response.read.return_value = json.dumps(response_for({'ok': 1})).encode()
            with self.assertRaises(ai.AIError):
                ai.test_connection(settings)

    def test_refusal_incomplete_or_invalid_provider_payloads_never_become_filters(self):
        refusal = response_for(actor_plan())
        refusal['output'][0]['content'] = [{'type': 'refusal', 'refusal': 'sensitive provider explanation'}]
        for payload, code in ((refusal, 'AI_REFUSED'),
                              ({**response_for(actor_plan()), 'status': 'incomplete'}, 'AI_INCOMPLETE_RESPONSE'),
                              ({**response_for(actor_plan()), 'status': 'failed'}, 'AI_INCOMPLETE_RESPONSE'),
                              ({**response_for(actor_plan()), 'incomplete_details': {'reason': 'max_output_tokens'}}, 'AI_INCOMPLETE_RESPONSE'),
                              ({**response_for(actor_plan()), 'output': []}, 'AI_INVALID_RESPONSE'),
                              ({'status': 'completed', 'output_text': json.dumps(actor_plan())}, 'AI_INVALID_RESPONSE'),
                              ({'status': 'completed', 'output': [{'type': 'function_call'}]}, 'AI_INVALID_RESPONSE')):
            with self.subTest(payload=payload):
                self.response.read.return_value = json.dumps(payload).encode()
                with self.assertRaises(ai.AIError) as error:
                    self.call()
                self.assertEqual(error.exception.code, code)
                self.assertNotIn('sensitive provider', str(error.exception))

    def test_bad_model_json_and_extra_conditions_are_rejected(self):
        for text in ('not json', '```json\n{}\n```', '{"intent":"count","intent":"filter","message":"","groups":[]}',
                     json.dumps({**actor_plan(), 'groups': []}), json.dumps({'secret': 'sk-private-test'})):
            payload = response_for(actor_plan())
            payload['output'][0]['content'][0]['text'] = text
            self.response.read.return_value = json.dumps(payload).encode()
            with self.subTest(text=text), self.assertRaises(ai.AIError) as error:
                self.call()
            self.assertEqual(error.exception.code, 'AI_INVALID_PLAN')
            self.assertNotIn('sk-private-test', str(error.exception))

    def test_transport_errors_are_safe_and_no_request_is_retried(self):
        cases = [(401, 'AI_AUTH_ERROR', 502), (403, 'AI_AUTH_ERROR', 502), (429, 'AI_UPSTREAM_RATE_LIMIT', 429),
                 (400, 'AI_MODEL_ERROR', 502), (404, 'AI_MODEL_ERROR', 502), (500, 'AI_UPSTREAM_ERROR', 502),
                 (302, 'AI_UPSTREAM_ERROR', 502)]
        for status, code, response_status in cases:
            self.opener.open.reset_mock()
            self.opener.open.side_effect = urllib.error.HTTPError(ai.OPENAI_URL, status, 'sk-private-test', {}, io.BytesIO(b'sk-private-test'))
            with self.subTest(status=status), self.assertRaises(ai.AIError) as error:
                self.call()
            self.assertEqual((error.exception.code, error.exception.status), (code, response_status))
            self.assertNotIn('sk-private-test', str(error.exception))
            self.assertEqual(self.opener.open.call_count, 1)
        for failure, code in ((TimeoutError('sk-private-test'), 'AI_TIMEOUT'),
                              (urllib.error.URLError(TimeoutError()), 'AI_TIMEOUT'),
                              (urllib.error.URLError('sk-private-test'), 'AI_CONNECTION_ERROR')):
            self.opener.open.side_effect = failure
            with self.subTest(failure=failure), self.assertRaises(ai.AIError) as error:
                self.call()
            self.assertEqual(error.exception.code, code)
            self.assertNotIn('sk-private-test', str(error.exception))

    def test_response_size_limit_and_bad_transport_json_fail_closed(self):
        for raw in (b'', b'not json sk-private-test', b'x' * (ai.MAX_RESPONSE_BYTES + 1)):
            self.response.read.return_value = raw
            with self.subTest(length=len(raw)), self.assertRaises(ai.AIError) as error:
                self.call()
            self.assertEqual(error.exception.code, 'AI_INVALID_RESPONSE')
            self.assertNotIn('sk-private-test', str(error.exception))


if __name__ == '__main__':
    unittest.main()
