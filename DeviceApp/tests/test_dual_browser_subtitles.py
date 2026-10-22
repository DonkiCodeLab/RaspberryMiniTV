import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api
import browser_subtitles as subtitles


class DualSubtitleTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.video = self.root / 'Film.mp4'; self.video.write_bytes(b'video')
        self.content = '1\n00:00:00,100 --> 00:00:02,000\nHello\n'
        (self.root / 'Film.srt').write_text(self.content)
        for name, value in [('VIDEOS_DIR', str(self.root)), ('current_web_pin', lambda: 'test-pin'),
                            ('MEDIA_LIBRARY_PATH', str(self.root / 'media_library.json')),
                            ('LEGACY_MOVIE_LIBRARY_PATH', str(self.root / 'movie_library.json'))]:
            handle = patch.object(api, name, value); handle.start(); self.addCleanup(handle.stop)
        self.client = api.app.test_client()
        subtitles._extract.cache_clear()

    def get(self, id='list', pin='test-pin', **kwargs):
        return self.client.get('/media/stream', query_string={'relativePath': 'Film.mp4', 'subtitles': id, 'pin': pin, **kwargs})

    def test_multiple_external_languages_and_embedded_text_and_bitmap(self):
        (self.root / 'Film.es.srt').write_text(self.content)
        (self.root / 'Other.en.srt').write_text(self.content)
        embedded = {'embeddedStatus': 'known', 'embedded': [
            {'index': 2, 'codec': 'subrip', 'language': 'eng', 'title': 'English'},
            {'index': 3, 'codec': 'hdmv_pgs_subtitle', 'language': 'spa'}]}
        with patch.object(subtitles, 'inspect_subtitles', return_value=embedded), patch.object(subtitles.shutil, 'which', return_value='/ffmpeg'):
            tracks = self.get().json['tracks']
            self.assertEqual([t['id'] for t in tracks], ['external:Film.srt', 'external:Film.es.srt', 'embedded:2', 'embedded:3'])
            self.assertTrue(tracks[2]['available']); self.assertFalse(tracks[3]['available'])
            self.assertEqual(self.get('embedded:3').status_code, 422)

    def test_selected_external_track_is_fresh_and_legacy_endpoint_still_works(self):
        with patch.object(subtitles, 'inspect_subtitles', return_value={'embedded': [], 'embeddedStatus': 'known'}):
            (self.root / 'Film.es.srt').write_text(self.content.replace('Hello', 'Hola'))
            self.assertIn('Hola', self.get('external:Film.es.srt').text)
            self.assertIn('Hello', self.get('1').text)
            (self.root / 'Film.es.srt').write_text(self.content.replace('Hello', 'Nuevo'))
            self.assertIn('Nuevo', self.get('external:Film.es.srt').text)
            self.assertEqual(self.get('external:Other.srt').status_code, 404)

    def test_pin_traversal_and_external_symlinks_are_rejected(self):
        self.assertEqual(self.get(pin='wrong').status_code, 401)
        self.assertEqual(self.get(relativePath='../Film.mp4').status_code, 404)
        outside = self.root.parent / (self.root.name + '.srt'); outside.write_text(self.content); self.addCleanup(outside.unlink)
        (self.root / 'Film.en.srt').symlink_to(outside)
        with patch.object(subtitles, 'inspect_subtitles', return_value={'embedded': [], 'embeddedStatus': 'known'}):
            self.assertEqual(self.get('external:Film.en.srt').status_code, 404)
            self.assertEqual(self.get('external:../' + outside.name).status_code, 404)

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg required')
    def test_real_embedded_languages_convert_to_vtt_and_cache_without_changing_video(self):
        english = self.root / 'english.srt'; english.write_text(self.content)
        spanish = self.root / 'spanish.srt'; spanish.write_text(self.content.replace('Hello', 'Hola'))
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:d=3',
                        '-i', str(english), '-i', str(spanish), '-map', '0:v', '-map', '1:0', '-map', '2:0',
                        '-c:v', 'libx264', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng',
                        '-metadata:s:s:1', 'language=spa', str(self.video)], check=True, timeout=15)
        original = self.video.read_bytes()
        tracks = [t for t in self.get().json['tracks'] if t['kind'] == 'embedded']
        self.assertEqual(len(tracks), 2)
        for track, text in zip(tracks, ['Hello', 'Hola']):
            response = self.get(track['id'])
            self.assertEqual(response.status_code, 200, response.text)
            self.assertTrue(response.text.startswith('WEBVTT'))
            self.assertIn(text, response.text)
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
        hits = subtitles._extract.cache_info().hits
        self.get(tracks[0]['id'])
        self.assertEqual(subtitles._extract.cache_info().hits, hits + 1)
        self.assertEqual(self.video.read_bytes(), original)
