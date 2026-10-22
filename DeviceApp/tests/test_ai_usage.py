import base64
from contextlib import nullcontext
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
import urllib.error
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import ai_usage as usage
import catalog_ai
from catalog_ai import AISettings, AIError
import control_api as api


def response(input_tokens=10000, output_tokens=1000, cached=2000, **extra):
    return {'model': 'gpt-6.1-sol', 'status': 'completed',
            'usage': {'input_tokens': input_tokens, 'output_tokens': output_tokens,
                      'input_tokens_details': {'cached_tokens': cached},
                      'output_tokens_details': {'reasoning_tokens': 500}},
            'output': [{'type': 'message', 'role': 'assistant', 'status': 'completed',
                        'content': [{'type': 'output_text', 'text': '{"ok":true}'}]}], **extra}


def upstream(payload, status=200):
    stream = MagicMock()
    stream.__enter__.return_value = stream
    stream.status, stream.headers = status, {'x-request-id': 'req_example'}
    stream.read.return_value = json.dumps(payload).encode()
    return stream


def reported(day, amount, more=False, cursor=None):
    timestamp = int(datetime.fromisoformat(day).replace(tzinfo=timezone.utc).timestamp())
    return {'data': [{'start_time': timestamp, 'end_time': timestamp + 86400,
                      'results': [{'amount': {'value': amount, 'currency': 'usd'}}]}],
            'has_more': more, 'next_page': cursor}


class UsageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.settings = AISettings(Path(self.temp.name) / 'ai.json')
        self.settings.update({'apiKey': 'sk-private', 'enabled': True})
        self.store = usage.UsageStore(self.settings.path.with_suffix('.usage.sqlite3'))
        self.day = datetime.now(timezone.utc).date().isoformat()

    def snapshot(self, **kwargs):
        return self.store.snapshot(self.day, self.day, **kwargs)

    def add(self, payload=None, operation='search', group=None):
        ident = self.store.begin(operation, 'gpt-6.1-sol', 'responses', group)
        self.store.finish(ident, response() if payload is None else payload, 200, 'req_example', 120)
        return ident

    def test_prices_cache_reasoning_and_images_use_different_rates(self):
        value, tariff, status = usage.estimate('gpt-6.1-sol', usage.clean_usage(response()['usage']), 'responses')
        self.assertEqual(value, 26200000)  # 8k uncached, 2k cached, 1k total output incl reasoning.
        self.assertEqual(status, 'estimated')
        self.assertEqual(tariff['asOf'], usage.PRICING_DATE)
        image = {'input_tokens': 200, 'output_tokens': 1000,
                 'input_tokens_details': {'text_tokens': 50, 'image_tokens': 150, 'cached_tokens': 150}}
        self.assertEqual(usage.estimate('gpt-image-2', image, 'images/edits')[0], 31450000)
        self.assertIsNone(usage.estimate('new-model', response()['usage'], 'responses')[0])
        self.assertIsNone(usage.estimate('gpt-6.1-sol', {}, 'responses')[0])
        self.assertIsNone(usage.estimate('gpt-6.1-sol', response()['usage'], 'responses', 'fast')[0])
        self.assertIsNone(usage.estimate('gpt-6.1-sol', response(input_tokens=300000)['usage'], 'responses')[0])
        self.assertIsNone(usage.estimate('gpt-6.1-sol', response(cached=20000)['usage'], 'responses')[0])
        self.assertEqual(usage.estimate('gpt-4.1-mini-2025-04-14', response(cached=0)['usage'], 'responses')[0], 5600000)

    def test_inference_is_persisted_with_usage_and_no_content_or_secrets(self):
        with patch('catalog_ai.urllib.request.build_opener') as opener:
            opener.return_value.open.return_value = upstream(response())
            catalog_ai.test_connection(self.settings)
        snap = self.snapshot()
        self.assertEqual(snap['summary']['calls'], 1)
        self.assertEqual(snap['calls'][0]['operation'], 'connection_test')
        self.assertEqual(snap['calls'][0]['request_id'], 'req_example')
        self.assertAlmostEqual(snap['summary']['estimatedUsd'], .0262)
        self.assertNotIn('sk-private', json.dumps(snap))
        self.assertNotIn('Check connection', self.store.path.read_bytes().decode(errors='ignore'))
        self.assertEqual(self.store.path.stat().st_mode & 0o777, 0o600)
        # Rate changes must not rewrite historical amounts.
        with patch.dict(usage.TEXT_RATES, {'gpt-6.1-sol': (100, 100, 100)}):
            self.assertEqual(self.snapshot()['summary']['estimatedUsd'], snap['summary']['estimatedUsd'])

    def test_timeout_incomplete_and_invalid_model_output_are_not_free(self):
        with patch('catalog_ai.urllib.request.build_opener') as opener:
            opener.return_value.open.side_effect = TimeoutError()
            with self.assertRaises(AIError): catalog_ai.test_connection(self.settings)
        row = self.snapshot()['calls'][0]
        self.assertEqual(row['status'], 'unknown')
        self.assertIsNone(row['estimatedUsd'])
        with patch('catalog_ai.urllib.request.build_opener') as opener:
            opener.return_value.open.return_value = upstream(response(status='incomplete'))
            with self.assertRaises(AIError): catalog_ai.test_connection(self.settings)
        row = self.snapshot()['calls'][0]
        self.assertEqual(row['status'], 'failed')
        self.assertGreater(row['estimatedUsd'], 0)
        invalid = response(); invalid['output'][0]['content'][0]['text'] = 'not JSON'
        with patch('catalog_ai.urllib.request.build_opener') as opener:
            opener.return_value.open.return_value = upstream(invalid)
            with self.assertRaises(AIError): catalog_ai.test_connection(self.settings)
        self.assertEqual(self.snapshot()['summary']['calls'], 3)
        self.assertEqual(self.snapshot()['summary']['unknown'], 1)

    def test_crash_and_timeout_after_headers_remain_unconfirmed(self):
        ident = self.store.begin('search', 'gpt-6.1-sol', 'responses')
        self.store.finish(ident, None, 200, 'req_example', 30000, failed=True)
        self.assertEqual(self.snapshot()['calls'][0]['status'], 'unknown')
        ident = self.store.begin('search', 'gpt-6.1-sol', 'responses')
        with self.store.db() as db:
            db.execute('UPDATE calls SET started=started-700 WHERE id=?', (ident,))
        records = self.store.snapshot('2020-01-01', self.day)['calls']
        row = next(row for row in records if row['id'] == ident)
        self.assertEqual(row['status'], 'unknown')
        self.assertIsNone(row['estimatedUsd'])

    def test_image_edit_records_token_modalities_and_job_group(self):
        from PIL import Image
        import photo_library
        photo = Path(self.temp.name) / 'photo.png'
        Image.new('RGB', (10, 10)).save(photo)
        payload = {'data': [{'b64_json': base64.b64encode(photo.read_bytes()).decode()}],
                   'usage': {'input_tokens': 200, 'output_tokens': 1000,
                             'input_tokens_details': {'text_tokens': 50, 'image_tokens': 150}}}
        with patch('photo_library.urllib.request.urlopen', return_value=upstream(payload)):
            photo_library.edit_image(photo, 'lego', {**self.settings.credentials(), '_usage_group': 'job-a'})
        row = self.snapshot()['calls'][0]
        self.assertEqual((row['operation'], row['group_id']), ('image', 'job-a'))
        self.assertAlmostEqual(row['estimatedUsd'], .03145)

    def test_subtitle_job_records_each_batch_in_dashboard_usage(self):
        import subtitle_translation
        movies = Path(self.temp.name) / 'Movies'
        movies.mkdir()
        video = movies / 'Film.mp4'
        video.write_bytes(b'video')
        vtt = 'WEBVTT\n\n' + '\n\n'.join(
            f'{n}\n00:00:01.000 --> 00:00:02.000\nHello {n}' for n in range(1, 52))
        manager = subtitle_translation.SubtitleTranslations()
        with patch.object(subtitle_translation.threading, 'Thread') as worker:
            job = manager.start(video, movies, 'external:Film.en.srt', 'es', self.settings,
                                lambda limit: nullcontext())
        def translate(request, **kwargs):
            body = json.loads(request.data)
            batch = json.loads(body['input'][0]['content'][0]['text'])['cues']
            payload = response()
            payload['output'][0]['content'][0]['text'] = json.dumps({
                'cues': [{'id': cue['id'], 'text': 'Hola'} for cue in batch]})
            return upstream(payload)
        with patch.object(subtitle_translation.browser_subtitles, 'read_track', return_value=vtt), \
                patch('catalog_ai.urllib.request.build_opener') as opener:
            opener.return_value.open.side_effect = translate
            # Run exactly the worker and private settings captured by start().
            worker.call_args.kwargs['target'](*worker.call_args.kwargs['args'])
            self.assertEqual(opener.return_value.open.call_count, 2)
        self.assertEqual(manager.status(job['id'])['state'], 'ready')
        with patch.object(api, 'ai_settings_store', self.settings), \
                patch.object(api, 'current_web_pin', return_value='test-pin'):
            result = api.app.test_client().get('/settings/ai/usage', headers={'X-Web-Pin': 'test-pin'},
                query_string={'start': self.day, 'end': self.day, 'operation': 'subtitle'}).json
        self.assertEqual(result['summary']['calls'], 2)
        self.assertEqual(result['summary']['tokens'], 22000)
        self.assertAlmostEqual(result['summary']['estimatedUsd'], .0524)
        self.assertEqual({call['group_id'] for call in result['calls']}, {job['id']})
        self.assertEqual(result['series'][0]['calls'], 2)
        self.assertEqual(result['breakdown'][0]['operation'], 'subtitle')
        # Reusing an already translated track must not create another paid call.
        reused = manager.start(video, movies, 'external:Film.en.srt', 'es', self.settings, nullcontext)
        self.assertEqual(reused['state'], 'ready')
        self.assertEqual(self.snapshot()['summary']['calls'], 2)

    def test_concurrent_calls_filters_pagination_and_group_totals(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda _: self.add(operation='subtitle', group='job-a'), range(55)))
        self.add(operation='image', group='job-b')
        snap = self.snapshot(operation='subtitle', group_id='job-a')
        self.assertEqual(snap['summary']['calls'], 55)
        self.assertEqual(len(snap['calls']), 50)
        self.assertTrue(snap['hasMore'])
        page = self.snapshot(operation='subtitle', group_id='job-a', page=1)
        self.assertEqual(len(page['calls']), 5)
        self.assertFalse(page['hasMore'])
        self.assertEqual(page['summary'], snap['summary'])
        self.assertFalse({r['id'] for r in page['calls']} & {r['id'] for r in snap['calls']})
        self.assertEqual(self.snapshot(model='missing')['summary']['calls'], 0)

    def test_calendar_boundaries_and_missing_days(self):
        for day in ('2024-12-31', '2025-01-01', '2025-01-05', '2025-01-06'):
            with patch('ai_usage.time.time', return_value=datetime.fromisoformat(day).replace(tzinfo=timezone.utc).timestamp()):
                self.add()
        snap = self.store.snapshot('2024-12-31', '2025-01-06', period='week')
        self.assertEqual([(p['date'], p['calls']) for p in snap['series']], [('2024-12-30', 3), ('2025-01-06', 1)])
        monthly = self.store.snapshot('2024-12-31', '2025-01-06', period='month')
        self.assertEqual([p['calls'] for p in monthly['series']], [1, 3])
        yearly = self.store.snapshot('2024-12-31', '2025-01-06', period='year')
        self.assertEqual([p['calls'] for p in yearly['series']], [1, 3])
        daily = self.store.snapshot('2025-01-01', '2025-01-06')
        self.assertEqual(len(daily['series']), 6)
        self.assertEqual(daily['series'][1]['calls'], 0)
        self.assertIsNone(daily['series'][1]['reportedUsd'])
        for start, end in (('20261021', self.day), (self.day, '2020-01-01'), (None, self.day)):
            with self.assertRaises(usage.UsageError): self.store.snapshot(start, end)

    def configure_billing(self):
        return self.store.configure({'adminKey': 'sk-admin-private', 'projectId': 'proj_example', 'apiKeyId': 'key_example'})

    def test_billing_requires_admin_project_and_never_returns_secret(self):
        with self.assertRaises(usage.UsageError): self.store.sync(self.day, self.day)
        result = self.configure_billing()
        self.assertTrue(result['configured'])
        self.assertNotIn('sk-admin-private', json.dumps(result))
        self.store.configure({'adminKey': ''})
        self.assertTrue(self.store.billing()['configured'])
        with self.assertRaises(usage.UsageError): self.store.configure({'apiKeyId': 'sk-secret-in-wrong-field'})
        self.store.configure({'clearAdminKey': True})
        self.assertFalse(self.store.billing()['configured'])
        self.assertNotIn(b'sk-admin-private', self.store.path.read_bytes())

    def test_import_pagination_idempotency_and_no_double_count(self):
        self.configure_billing()
        self.add()
        pages = [reported('2026-10-20', '.03', True, 'page2'), reported('2026-10-21', '.07')]
        for _ in range(2):
            with patch('ai_usage.urllib.request.build_opener') as opener:
                opener.return_value.open.side_effect = [upstream(page) for page in pages]
                result = self.store.sync('2026-10-20', '2026-10-21')
                self.assertEqual(result['days'], 2)
                url = opener.return_value.open.call_args.args[0].full_url
                self.assertIn('page=page2', url)
                self.assertIn('project_ids=proj_example', url)
                self.assertIn('api_key_ids=key_example', url)
                self.assertNotIn('sk-admin', url)
        snap = self.store.snapshot('2026-10-20', '2026-10-21')
        self.assertAlmostEqual(snap['reported']['usd'], .1)
        self.assertEqual(snap['reported']['days'], 2)
        self.assertNotIn('sk-admin-private', json.dumps(snap))
        self.assertEqual(self.snapshot()['summary']['calls'], 1)
        self.store.configure({'projectId': 'proj_other'})
        self.assertIsNone(self.store.snapshot('2026-10-20', '2026-10-21')['reported']['usd'])

    def test_failed_or_malformed_import_preserves_prior_data(self):
        self.configure_billing()
        with patch('ai_usage.urllib.request.build_opener') as opener:
            opener.return_value.open.return_value = upstream(reported(self.day, '.06'))
            self.store.sync(self.day, self.day)
        for value in ('NaN', '1e1000'):
            with patch('ai_usage.urllib.request.build_opener') as opener:
                opener.return_value.open.return_value = upstream(reported(self.day, value))
                with self.assertRaises(usage.UsageError): self.store.sync(self.day, self.day)
        with patch('ai_usage.urllib.request.build_opener') as opener:
            opener.return_value.open.side_effect = [upstream(reported(self.day, '.1', True, 'next')), TimeoutError()]
            with self.assertRaises(usage.UsageError): self.store.sync(self.day, self.day)
        self.assertAlmostEqual(self.snapshot()['reported']['usd'], .06)

    def test_routes_require_pin_validate_input_and_keep_admin_key_server_side(self):
        with patch.object(api, 'ai_settings_store', self.settings), patch.object(api, 'current_web_pin', return_value='test-pin'):
            client, headers = api.app.test_client(), {'X-Web-Pin': 'test-pin'}
            for path, method in (('/settings/ai/usage', 'get'), ('/settings/ai/billing', 'get'),
                                 ('/settings/ai/billing', 'post'), ('/settings/ai/billing/sync', 'post')):
                self.assertEqual(getattr(client, method)(path).status_code, 401)
            result = client.post('/settings/ai/billing', headers=headers, json={'adminKey': 'sk-admin-private', 'projectId': 'proj_example'})
            self.assertEqual(result.status_code, 200)
            self.assertNotIn('sk-admin-private', result.text)
            self.assertEqual(result.headers['Cache-Control'], 'no-store')
            self.assertEqual(client.get('/settings/ai/usage?page=x', headers=headers).status_code, 400)
            self.assertEqual(client.get('/settings/ai/usage?period=wrong', headers=headers).status_code, 400)
            self.assertEqual(client.post('/settings/ai/billing', headers=headers, json=[]).status_code, 400)
            self.assertEqual(client.post('/settings/ai/billing/sync', headers=headers, json={}).status_code, 400)
            self.assertEqual(client.get('/settings/ai/usage', headers=headers).status_code, 200)


if __name__ == '__main__':
    unittest.main()
