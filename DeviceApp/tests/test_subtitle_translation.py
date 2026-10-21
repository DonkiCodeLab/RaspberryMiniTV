from contextlib import nullcontext
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api
import subtitle_translation as translation
from catalog_ai import AIError

SETTINGS = {'enabled': True, 'apiKey': 'test-key', 'model': 'configured-model', 'requestsPerMinute': 10}
VTT = 'WEBVTT\n\n1\n00:00:01.200 --> 00:00:03.400\nHello\n\n2\n00:00:04.000 --> 00:00:05.000\nGoodbye\n'


class SubtitleTranslationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name); self.movies = self.root / 'Movies'; self.movies.mkdir()
        self.video = self.movies / 'Film.mp4'; self.video.write_bytes(b'video')
        self.original = self.movies / 'Film.en.srt'; self.original.write_text('original remains')
        self.target = self.movies / 'Film.es.ai.srt'
        self.manager = translation.SubtitleTranslations()

    def run_job(self, vtt=VTT, callback=None):
        with patch.object(translation.threading, 'Thread'):
            job = self.manager.start(self.video, self.movies, 'external:Film.en.srt', 'es', SETTINGS, lambda limit: nullcontext())
        def provider(data, body, **kwargs):
            self.assertEqual(data['apiKey'], 'test-key')
            self.assertEqual(body['model'], 'configured-model'); self.assertFalse(body['store'])
            self.assertEqual(body['text']['format']['type'], 'json_schema')
            if callback:
                return callback(data, body)
            return {'cues': [{'id': 1, 'text': 'Hola'}, {'id': 2, 'text': 'Adiós'}]}
        with patch.object(translation.browser_subtitles, 'read_track', return_value=vtt), patch.object(translation, '_post_response', side_effect=provider):
            self.manager._run(job['id'], self.video, self.movies, 'external:Film.en.srt', 'es', SETTINGS, lambda limit: nullcontext())
        return self.manager.status(job['id'])

    def test_complete_translation_preserves_every_timestamp_source_and_private_settings(self):
        job = self.run_job()
        self.assertEqual(job['state'], 'ready')
        self.assertEqual(self.target.read_text(), '1\n00:00:01,200 --> 00:00:03,400\nHola\n\n2\n00:00:04,000 --> 00:00:05,000\nAdiós\n')
        self.assertEqual(self.original.read_text(), 'original remains')
        self.assertNotIn('sourceKey', self.manager.public(job))
        self.assertNotIn('test-key', str(self.manager.public(job)))
        with patch.object(translation, '_post_response') as call, patch.object(translation.threading, 'Thread') as worker:
            reused = self.manager.start(self.video, self.movies, 'external:Film.en.srt', 'es', SETTINGS, lambda limit: nullcontext())
            self.assertEqual(reused['state'], 'ready'); call.assert_not_called(); worker.assert_not_called()

    def test_missing_duplicate_or_invented_ids_never_publish_a_file(self):
        for output in ({'cues': [{'id': 1, 'text': 'Hola'}]}, {'cues': [{'id': 1, 'text': 'Hola'}, {'id': 1, 'text': 'Wrong'}]},
                       {'cues': [{'id': 1, 'text': 'Hola'}, {'id': 2, 'text': '00:00:01 --> 00:00:02'}]}):
            self.manager = translation.SubtitleTranslations()
            job = self.run_job(callback=lambda *args: output)
            self.assertEqual(job['state'], 'failed'); self.assertFalse(self.target.exists())
            self.assertEqual(self.original.read_text(), 'original remains')

    def test_failure_after_first_batch_does_not_save_partial_translation(self):
        cues = 'WEBVTT\n\n' + '\n\n'.join(f'{n}\n00:00:01.000 --> 00:00:02.000\nHello {n}' for n in range(1, 52))
        calls = []
        def provider(data, body):
            calls.append(body)
            if len(calls) > 1: raise AIError('error', 'AI_UPSTREAM_ERROR', 502)
            return {'cues': [{'id': n, 'text': f'Hola {n}'} for n in range(1, 51)]}
        job = self.run_job(vtt=cues, callback=provider)
        self.assertEqual(job['state'], 'failed'); self.assertEqual(job['done'], 50)
        self.assertFalse(self.target.exists())

    def test_changed_source_or_video_is_not_published(self):
        def provider(data, body):
            self.video.write_bytes(b'replaced video')
            return {'cues': [{'id': 1, 'text': 'Hola'}, {'id': 2, 'text': 'Adiós'}]}
        job = self.run_job(callback=provider)
        self.assertEqual(job['code'], 'SUBTITLE_MOVIE_CHANGED'); self.assertFalse(self.target.exists())

    def test_invalid_input_missing_settings_and_concurrent_job(self):
        with self.assertRaises(AIError):
            self.manager.start(self.video, self.movies, 'external:Film.en.srt', [], SETTINGS, nullcontext)
        with self.assertRaises(AIError) as error:
            self.manager.start(self.video, self.movies, 'external:Film.en.srt', 'es', {**SETTINGS, 'apiKey': ''}, nullcontext)
        self.assertEqual(error.exception.code, 'AI_NOT_CONFIGURED')
        with patch.object(translation.threading, 'Thread'):
            job = self.manager.start(self.video, self.movies, 'external:Film.en.srt', 'es', SETTINGS, lambda limit: nullcontext())
            self.assertEqual(self.manager.start(self.video, self.movies, 'external:Film.en.srt', 'es', SETTINGS, nullcontext)['id'], job['id'])
            with self.assertRaises(AIError):
                self.manager.start(self.video, self.movies, 'external:Film.en.srt', 'ca', SETTINGS, nullcontext)

    def test_endpoint_requires_pin_rejects_escaping_video_and_keeps_key_private(self):
        client = api.app.test_client()
        with patch.object(api, 'VIDEOS_DIR', str(self.root)), patch.object(api, 'MOVIES_DIR', str(self.movies)), \
                patch.object(api, 'current_web_pin', return_value='test-pin'), patch.object(api, 'subtitle_translations', self.manager), \
                patch.object(api, 'ai_settings_store', SETTINGS), patch.object(translation.threading, 'Thread'):
            body = {'relativePath': 'Movies/Film.mp4', 'sourceId': 'external:Film.en.srt', 'language': 'es'}
            self.assertEqual(client.post('/movies/subtitles/translate', json=body).status_code, 401)
            response = client.post('/movies/subtitles/translate', json=body, headers={'X-Web-Pin': 'test-pin'})
            self.assertEqual(response.status_code, 200); self.assertNotIn('test-key', response.text); self.assertNotIn('sourceKey', response.json)
            self.assertEqual(client.get('/movies/subtitles/translate', query_string={'id': response.json['id']}, headers={'X-Web-Pin': 'test-pin'}).json['state'], 'queued')
            self.assertEqual(client.post('/movies/subtitles/translate', json={**body, 'relativePath': '../outside.mp4'}, headers={'X-Web-Pin': 'test-pin'}).status_code, 404)
