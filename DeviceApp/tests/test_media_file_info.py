import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api
import media_file_info as info
from browser_playback import PlaybackError


class MediaFileInfoTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.video = self.root / 'film.mkv'
        self.video.write_bytes(b'video')
        info._inspect.cache_clear()
        for name, value in [('VIDEOS_DIR', str(self.root)), ('current_web_pin', lambda: 'test-pin'),
                            ('load_movie_library', lambda: {'film.mkv': {'originalFileName': 'Film.1080p.BluRay.mkv'}})]:
            mock = patch.object(api, name, value)
            mock.start(); self.addCleanup(mock.stop)
        self.client = api.app.test_client()

    def test_real_metadata_ignores_cover_art_and_caches_until_file_changes(self):
        metadata = {'streams': [
            {'codec_type': 'video', 'width': 400, 'height': 400, 'disposition': {'attached_pic': 1}},
            {'codec_type': 'video', 'width': 1920, 'height': 800, 'codec_name': 'hevc', 'bit_rate': '4000000'}],
            'format': {'bit_rate': '4500000', 'duration': '7200'}}
        with patch.object(info, 'probe', return_value=metadata) as probe:
            result = info.inspect_file(self.video)
            self.assertEqual((result['width'], result['height']), (1920, 800))
            self.assertEqual(result['videoBitrate'], 4000000)
            self.assertEqual(result['sizeBytes'], 5)
            info.inspect_file(self.video)
            self.assertEqual(probe.call_count, 1)
            self.video.write_bytes(b'replacement')
            self.assertEqual(info.inspect_file(self.video)['sizeBytes'], 11)
            self.assertEqual(probe.call_count, 2)

    def test_missing_probe_preserves_file_details_and_is_retried(self):
        with patch.object(info, 'probe', side_effect=PlaybackError('TOOLS_MISSING')) as probe:
            result = info.inspect_file(self.video)
            self.assertEqual(result['probeStatus'], 'unknown')
            self.assertEqual(result['fileName'], 'film.mkv')
            self.assertNotIn('width', result)
            info.inspect_file(self.video)
            self.assertEqual(probe.call_count, 2)

    def test_endpoint_auth_containment_and_original_filename(self):
        query = {'relativePath': 'film.mkv'}
        self.assertEqual(self.client.get('/media/file-info', query_string=query).status_code, 401)
        with patch.object(info, 'probe', side_effect=PlaybackError('PROBE_FAILED')):
            response = self.client.get('/media/file-info', query_string=query, headers={'X-Web-Pin': 'test-pin'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json['originalFileName'], 'Film.1080p.BluRay.mkv')
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
        for path in ['../outside.mkv', 'missing.mkv']:
            self.assertEqual(self.client.get('/media/file-info', query_string={'relativePath': path}, headers={'X-Web-Pin': 'test-pin'}).status_code, 404)
        outside = self.root.parent / (self.root.name + '-outside.mkv')
        outside.write_bytes(b'outside'); self.addCleanup(outside.unlink)
        (self.root / 'link.mkv').symlink_to(outside)
        self.assertEqual(self.client.get('/media/file-info', query_string={'relativePath': 'link.mkv'}, headers={'X-Web-Pin': 'test-pin'}).status_code, 404)

    def test_invalid_numbers_are_unknown(self):
        for value in ['N/A', 'nan', 'inf', -1, 0, None]:
            self.assertIsNone(info.positive(value))
