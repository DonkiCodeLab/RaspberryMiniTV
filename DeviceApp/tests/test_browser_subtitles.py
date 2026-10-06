import sys
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api
from movie_subtitles import srt_to_vtt, inspect_subtitles


class BrowserSubtitleTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        (self.root / 'Movie.mp4').write_bytes(b'video')
        self.srt = self.root / 'Movie.srt'
        self.srt.write_bytes('1\r\n00:00:01,200 --> 00:00:03,400\r\n¡Hola!\r\n'.encode())
        for name, value in [('VIDEOS_DIR', str(self.root))]:
            mocked = patch.object(api, name, value)
            mocked.start()
            self.addCleanup(mocked.stop)
        pin = patch.object(api, 'current_web_pin', return_value='test-pin')
        pin.start()
        self.addCleanup(pin.stop)
        self.client = api.app.test_client()

    def get(self, **overrides):
        return self.client.get('/media/stream', query_string={
            'relativePath': 'Movie.mp4', 'subtitles': '1', 'pin': 'test-pin', **overrides,
        })

    def test_serves_vtt_with_query_pin_and_fresh_content(self):
        response = self.get()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, 'text/vtt')
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.assertEqual(response.text, 'WEBVTT\n\n1\n00:00:01.200 --> 00:00:03.400\n¡Hola!\n\n')
        self.srt.write_text('1\n00:00:01,200 --> 00:00:03,400\nNuevo\n')
        self.assertIn('Nuevo', self.get().text)

    def test_missing_invalid_and_unauthorized_subtitles(self):
        self.assertEqual(self.get(pin='wrong').status_code, 401)
        self.srt.write_text('not a subtitle')
        self.assertEqual(self.get().status_code, 422)
        self.srt.unlink()
        self.assertEqual(self.get().status_code, 404)

    def test_path_traversal_and_external_symlink_are_rejected(self):
        self.assertEqual(self.get(relativePath='../Movie.mp4').status_code, 404)
        self.srt.unlink()
        self.srt.symlink_to(self.root.parent / 'external.srt')
        self.assertEqual(self.get().status_code, 404)

    def test_video_stream_is_unchanged(self):
        response = self.get(subtitles='0')
        self.assertEqual(response.data, b'video')
        response.close()

    def test_conversion_preserves_cue_text_and_legacy_accents(self):
        content = '1\n00:00:01,000 --> 00:00:02,000\n<i>Qué tal</i>\nSegunda línea\n'
        self.assertIn('<i>Qué tal</i>\nSegunda línea', srt_to_vtt(content.encode('cp1252')))

    def test_inventory_reports_external_and_multiple_embedded_tracks(self):
        streams = [{'index': 2, 'codec_name': 'subrip', 'tags': {'language': 'spa', 'title': 'Español'}},
                   {'index': 3, 'codec_name': 'hdmv_pgs_subtitle'}]
        with patch('movie_subtitles.shutil.which', return_value='/usr/bin/ffprobe'), patch(
                'movie_subtitles.subprocess.run', return_value=subprocess.CompletedProcess([], 0, json.dumps({'streams': streams}))) as run:
            response = self.client.get('/media/subtitles', query_string={'relativePath': 'Movie.mp4'}, headers={'X-Web-Pin': 'test-pin'})
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data['external'], 'Movie.srt')
        self.assertEqual(data['embeddedStatus'], 'known')
        self.assertEqual(len(data['embedded']), 2)
        self.assertEqual(data['embedded'][0]['language'], 'spa')
        self.assertEqual(run.call_args.kwargs['timeout'], 10)

    def test_inventory_distinguishes_no_tracks_from_probe_failure(self):
        self.srt.unlink()
        with patch('movie_subtitles.shutil.which', return_value='/usr/bin/ffprobe'), patch(
                'movie_subtitles.subprocess.run', return_value=subprocess.CompletedProcess([], 0, '{"streams": []}')):
            self.assertEqual(inspect_subtitles(str(self.root / 'Movie.mp4'), self.root),
                             {'external': None, 'embedded': [], 'embeddedStatus': 'known'})
        with patch('movie_subtitles.shutil.which', return_value=None):
            self.assertEqual(inspect_subtitles(str(self.root / 'Movie.mp4'), self.root)['embeddedStatus'], 'unknown')
        with patch('movie_subtitles.shutil.which', return_value='/usr/bin/ffprobe'), patch(
                'movie_subtitles.subprocess.run', side_effect=subprocess.TimeoutExpired('ffprobe', 10)):
            self.assertEqual(inspect_subtitles(str(self.root / 'Movie.mp4'), self.root)['embeddedStatus'], 'unknown')

    def test_inventory_requires_pin_and_rejects_traversal(self):
        self.assertEqual(self.client.get('/media/subtitles?relativePath=Movie.mp4').status_code, 401)
        response = self.client.get('/media/subtitles?relativePath=../Movie.mp4', headers={'X-Web-Pin': 'test-pin'})
        self.assertEqual(response.status_code, 404)


if __name__ == '__main__':
    unittest.main()
