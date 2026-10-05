import io
import json
import os
import struct
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api
import movie_subtitles as subtitles

SRT = b'1\r\n00:00:01,000 --> 00:00:02,000\r\nHola\r\n'
CREDENTIALS = {'apiKey': 'test-key', 'username': 'test-user', 'password': 'test-password'}


def candidate(file_id=10, **changes):
    return {'attributes': {
        'language': 'es', 'moviehash_match': False, 'release': 'Alien.1979.1080p.BluRay-GROUP',
        'feature_details': {'feature_type': 'Movie', 'title': 'Alien', 'tmdb_id': 348, 'year': 1979},
        'files': [{'file_id': file_id, 'cd_number': 1}], **changes,
    }}


class SubtitleProviderTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.video = self.root / 'Alien.1979.1080p.BluRay-GROUP.mkv'
        self.video.write_bytes(b'\0' * 131072)
        self.provider = subtitles.OpenSubtitles()

    def test_hash_reads_edges_and_handles_large_files_and_uint64_overflow(self):
        self.assertEqual(subtitles.movie_hash(self.video), '0000000000020000')
        with self.video.open('wb') as video:
            video.write(struct.pack('<Q', 0xffffffffffffffff) * 8192)
            video.seek((1 << 32) + 65536)
            video.write(struct.pack('<Q', 2) * 8192)
        self.assertEqual(subtitles.movie_hash(self.video), f'{(1 << 32) + 131072 + 8192:016x}')
        self.video.write_bytes(b'small')
        self.assertEqual(subtitles.movie_hash(self.video), '')

    def test_exact_hash_beats_popularity_and_release_match(self):
        exact = candidate(20, moviehash_match=True, release='Different release', download_count=1)
        popular = candidate(10, download_count=100000, from_trusted=True, ratings=10)
        result = subtitles.best_candidate([popular, exact], 'es', self.video.name, {'tmdbId': 348})
        self.assertEqual(result['files'][0]['file_id'], 20)

    def test_release_match_beats_popularity_and_trusted_breaks_ties(self):
        popular = candidate(10, release='Alien.1979.DVDRip', download_count=100000)
        matching = candidate(20)
        trusted = candidate(30, from_trusted=True)
        result = subtitles.best_candidate([popular, matching, trusted], 'es', self.video.name, {'tmdbId': 348})
        self.assertEqual(result['files'][0]['file_id'], 30)

    def test_rejects_other_movies_languages_partial_translated_and_multipart(self):
        invalid = [
            candidate(language='en'), candidate(foreign_parts_only=True), candidate(machine_translated='true'),
            candidate(ai_translated=True), candidate(nb_cd=2), candidate(files=[{'file_id': 10, 'cd_number': 2}]),
            candidate(files=[{'file_id': 10}, {'file_id': 11}]), candidate(files=[{'file_id': 0}]),
            candidate(feature_details={'tmdb_id': 999}), candidate(feature_details={'feature_type': 'Episode'}),
            {'attributes': None}, {'attributes': {'files': None}}, None,
        ]
        self.assertIsNone(subtitles.best_candidate(invalid, 'es', self.video.name, {'tmdbId': 348}))

    def test_filename_search_requires_title_and_year_and_exact_search_requires_hash(self):
        self.assertIsNotNone(subtitles.best_candidate([candidate()], 'es', self.video.name, {}))
        self.assertIsNone(subtitles.best_candidate([candidate()], 'es', 'Alien.2025.mkv', {}))
        self.assertIsNone(subtitles.best_candidate([candidate()], 'es', 'Unrelated.mkv', {}))
        self.assertIsNone(subtitles.best_candidate([candidate()], 'es', self.video.name, {}, hash_only=True))

    def test_complete_hash_download_and_session_reuse(self):
        login = {'token': 'test-token', 'base_url': 'vip-api.opensubtitles.com'}
        search = {'data': [candidate(moviehash_match=True)]}
        download = {'link': 'https://dl.opensubtitles.com/file.srt'}
        with patch.object(self.provider, '_request', side_effect=[login, search, download, SRT, search, download, SRT]) as request:
            for _ in range(2):
                content, result = self.provider.obtain(self.video, {'tmdbId': 348}, 'es', CREDENTIALS)
                self.assertEqual(result['match'], 'hash')
                self.assertEqual(content, SRT.replace(b'\r\n', b'\n'))
            calls = request.call_args_list
        self.assertEqual(sum('/login' in call.args[0] for call in calls), 1)
        self.assertIn('https://vip-api.opensubtitles.com/api/v1/subtitles?', calls[1].args[0])
        self.assertIn('moviehash=0000000000020000', calls[1].args[0])
        self.assertEqual(calls[2].kwargs['body'], {'file_id': 10, 'sub_format': 'srt'})
        self.assertEqual(calls[3].args, ('https://dl.opensubtitles.com/file.srt',))

    def test_fallback_searches_saved_movie_id_and_reports_nonexact_match(self):
        with patch.object(self.provider, '_request', side_effect=[
            {'token': 'token'}, {'data': []}, {'data': [candidate()]},
            {'link': 'https://dl.opensubtitles.com/file.srt'}, SRT,
        ]) as request:
            _, result = self.provider.obtain(self.video, {'tmdbId': 348}, 'es', CREDENTIALS)
        self.assertIn('tmdb_id=348', request.call_args_list[2].args[0])
        self.assertEqual(result['match'], 'metadata')

    def test_no_matches_never_requests_a_download_credit(self):
        with patch.object(self.provider, '_request', side_effect=[{'token': 'token'}, {'data': []}, {'data': []}]) as request:
            with self.assertRaises(subtitles.SubtitleError) as error:
                self.provider.obtain(self.video, {}, 'es', CREDENTIALS)
        self.assertEqual(error.exception.code, 'SUBTITLE_NOT_FOUND')
        self.assertFalse(any('/download' in call.args[0] for call in request.call_args_list))

    def test_invalid_or_oversized_downloads_are_rejected(self):
        for content in [b'', b'<html>Error</html>', b'not subtitles', b'\xff', SRT + b'\x00', b'x' * (subtitles.MAX_SUBTITLE_BYTES + 1)]:
            with self.subTest(content=content[:20]), self.assertRaises(subtitles.SubtitleError):
                subtitles.validate_srt(content)
        self.assertEqual(subtitles.validate_srt(b'\xef\xbb\xbf' + SRT), SRT.replace(b'\r\n', b'\n'))

    def test_download_and_redirect_urls_are_restricted(self):
        for url in ['http://dl.opensubtitles.com/file', 'https://127.0.0.1/file', 'file:///tmp/file',
                    'https://opensubtitles.com.attacker.test/file', 'https://user@dl.opensubtitles.com/file',
                    'https://dl.opensubtitles.com:5050/file']:
            with self.subTest(url=url):
                self.assertFalse(subtitles.allowed_url(url))
                with self.assertRaises(subtitles.SubtitleError):
                    subtitles.ProviderRedirect(False).redirect_request(None, None, 302, '', {}, url)
        self.assertTrue(subtitles.allowed_url('https://dl.opensubtitles.com/file'))
        self.assertFalse(subtitles.allowed_url('https://dl.opensubtitles.com/file', api=True))

    def test_transport_does_not_send_credentials_to_download_host(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = SRT
        opener = MagicMock()
        opener.open.return_value = response
        with patch.object(subtitles.urllib.request, 'build_opener', return_value=opener):
            self.provider._request('https://dl.opensubtitles.com/file')
        request = opener.open.call_args.args[0]
        self.assertIsNone(request.get_header('Api-key'))
        self.assertIsNone(request.get_header('Authorization'))
        self.assertEqual(opener.open.call_args.kwargs['timeout'], 20)

    def test_provider_errors_are_actionable_and_hide_response_secrets(self):
        for status, code in [(401, 'SUBTITLE_AUTH_FAILED'), (403, 'SUBTITLE_ACCESS_DENIED'),
                             (406, 'SUBTITLE_LIMIT_REACHED'), (429, 'SUBTITLE_LIMIT_REACHED'), (503, 'SUBTITLE_PROVIDER_ERROR')]:
            opener = MagicMock()
            opener.open.side_effect = urllib.error.HTTPError('https://api.opensubtitles.com/api/v1/download', status, 'secret', {}, io.BytesIO(b'secret'))
            with self.subTest(status=status), patch.object(subtitles.urllib.request, 'build_opener', return_value=opener):
                with self.assertRaises(subtitles.SubtitleError) as error:
                    self.provider._request('https://api.opensubtitles.com/api/v1/download', CREDENTIALS)
                self.assertEqual(error.exception.code, code)
                self.assertNotIn('secret', str(error.exception))


class SubtitleDownloadApiTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.movies = self.root / 'Movies'
        self.movies.mkdir()
        self.video = self.movies / 'Alien.mkv'
        self.video.write_bytes(b'video')
        self.target = self.video.with_suffix('.srt')
        self.target.write_bytes(b'existing')
        self.settings = self.root / 'subtitle_settings.json'
        self.path = 'Movies/Alien.mkv'
        for name, value in {'VIDEOS_DIR': str(self.root), 'MOVIES_DIR': str(self.movies), 'SUBTITLE_SETTINGS_PATH': str(self.settings)}.items():
            mocked = patch.object(api, name, value)
            mocked.start(); self.addCleanup(mocked.stop)
        self.patch_api('is_authorized_request', return_value=True)
        self.patch_api('ensure_media_directories', return_value=None)
        self.patch_api('load_movie_library', return_value={self.path: {'tmdbId': 348}})
        self.provider = self.patch_api('subtitle_provider')
        self.provider.obtain.return_value = (SRT, {'provider': 'OpenSubtitles', 'match': 'hash', 'language': 'es'})
        self.client = api.app.test_client()

    def patch_api(self, name, **kwargs):
        mocked = patch.object(api, name, **kwargs)
        value = mocked.start(); self.addCleanup(mocked.stop)
        return value

    def obtain(self, **changes):
        return self.client.post('/movies/subtitles/obtain', json={'relativePath': self.path, 'language': 'es', **changes})

    def test_download_saved_next_to_exact_video_using_server_metadata(self):
        response = self.obtain(tmdbId=999)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['file'], 'Alien.srt')
        self.assertEqual(self.target.read_bytes(), SRT)
        self.assertEqual(self.target.stat().st_mode & 0o777, 0o644)
        self.assertEqual(self.video.read_bytes(), b'video')
        self.assertEqual(self.provider.obtain.call_args.args[1], {'tmdbId': 348})
        self.assertFalse(list(self.movies.glob('.subtitle-*')))

    def test_errors_and_movie_changes_keep_existing_subtitle(self):
        for code in ('SUBTITLE_NOT_FOUND', 'SUBTITLE_AUTH_FAILED', 'SUBTITLE_INVALID_DOWNLOAD'):
            self.provider.obtain.side_effect = subtitles.SubtitleError(code)
            self.assertNotEqual(self.obtain().status_code, 200)
            self.assertEqual(self.target.read_bytes(), b'existing')

        def change_video(*_):
            self.video.write_bytes(b'new video')
            return SRT, {}
        self.provider.obtain.side_effect = change_video
        self.assertEqual(self.obtain().json['code'], 'SUBTITLE_MOVIE_CHANGED')
        self.assertEqual(self.target.read_bytes(), b'existing')

    def test_atomic_write_failure_keeps_old_subtitle_and_cleans_temp(self):
        with patch.object(subtitles.os, 'replace', side_effect=OSError('disk full')):
            self.assertEqual(self.obtain().json['code'], 'SUBTITLE_SAVE_FAILED')
        self.assertEqual(self.target.read_bytes(), b'existing')
        self.assertFalse(list(self.movies.glob('.subtitle-*')))

    def test_rejects_unsupported_languages_missing_files_traversal_and_symlinks(self):
        for changes in [{'language': 'fr'}, {'language': []}, {'relativePath': '../outside.mp4'},
                        {'relativePath': 'TVShows/Alien.mkv'}, {'relativePath': 'Movies/missing.mp4'}]:
            self.assertIn(self.obtain(**changes).status_code, (400, 404))
        outside = self.root / 'outside.mp4'
        outside.write_bytes(b'video')
        (self.movies / 'link.mp4').symlink_to(outside)
        self.assertEqual(self.obtain(relativePath='Movies/link.mp4').status_code, 400)
        self.provider.obtain.assert_not_called()

    def test_duplicate_click_does_not_spend_another_download(self):
        with api.subtitle_download_lock:
            self.assertEqual(self.obtain().json['code'], 'SUBTITLE_BUSY')
        self.provider.obtain.assert_not_called()

    def test_configuration_is_private_persistent_and_not_returned(self):
        with patch.dict(os.environ, {}, clear=True):
            response = self.client.post('/settings/subtitles', json=CREDENTIALS)
            self.assertTrue(response.json['configured'])
            self.assertEqual(self.settings.stat().st_mode & 0o777, 0o600)
            for payload in (response.json, self.client.get('/settings/subtitles').json):
                self.assertNotIn('test-key', json.dumps(payload))
                self.assertNotIn('test-password', json.dumps(payload))
            self.client.post('/settings/subtitles', json={'username': 'another-user'})
            stored = subtitles.load_credentials(self.settings)
            self.assertEqual(stored['apiKey'], CREDENTIALS['apiKey'])
            self.assertEqual(stored['password'], CREDENTIALS['password'])
            self.assertEqual(stored['username'], 'another-user')

    def test_credentials_can_come_from_environment(self):
        with patch.dict(os.environ, {'OPENSUBTITLES_API_KEY': 'key', 'OPENSUBTITLES_USERNAME': 'user', 'OPENSUBTITLES_PASSWORD': 'password'}):
            self.assertTrue(self.client.get('/settings/subtitles').json['configured'])
        self.assertFalse(self.settings.exists())

    def test_all_new_endpoints_require_pin(self):
        with patch.object(api, 'is_authorized_request', return_value=False):
            self.assertEqual(self.obtain().status_code, 401)
            self.assertEqual(self.client.get('/settings/subtitles').status_code, 401)
            self.assertEqual(self.client.post('/settings/subtitles', json=CREDENTIALS).status_code, 401)


if __name__ == '__main__':
    unittest.main()
