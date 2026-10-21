import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api
import media_file_info as info
import catalog_store
from backfill_movie_file_info import backfill
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
        with patch.object(info, 'probe', side_effect=AssertionError('A read must not probe')) as probe:
            response = self.client.get('/media/file-info', query_string=query, headers={'X-Web-Pin': 'test-pin'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json['originalFileName'], 'Film.1080p.BluRay.mkv')
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            self.assertEqual(response.json['probeStatus'], 'pending')
            probe.assert_not_called()
        for path in ['../outside.mkv', 'missing.mkv']:
            self.assertEqual(self.client.get('/media/file-info', query_string={'relativePath': path}, headers={'X-Web-Pin': 'test-pin'}).status_code, 404)
        outside = self.root.parent / (self.root.name + '-outside.mkv')
        outside.write_bytes(b'outside'); self.addCleanup(outside.unlink)
        (self.root / 'link.mkv').symlink_to(outside)
        self.assertEqual(self.client.get('/media/file-info', query_string={'relativePath': 'link.mkv'}, headers={'X-Web-Pin': 'test-pin'}).status_code, 404)

    def test_invalid_numbers_are_unknown(self):
        for value in ['N/A', 'nan', 'inf', -1, 0, None]:
            self.assertIsNone(info.positive(value))

    def test_saved_analysis_survives_cache_clear_and_replacement_invalidates_it(self):
        with patch.object(info, 'probe', return_value={'streams': [
                {'codec_type': 'video', 'width': 3840, 'height': 1600, 'codec_name': 'hevc'}]}):
            saved = info.inspect_file(self.video, 'Film.WEB-DL.mkv')
        metadata = {'originalFileName': 'Film.WEB-DL.mkv', 'fileInfo': saved}
        info._inspect.cache_clear()
        with patch.object(info, 'probe', side_effect=AssertionError('Must use saved data')):
            self.assertEqual(info.stored_file_info(self.video, metadata)['quality'],
                             {'level': 5, 'resolution': '4K UHD', 'source': 'WEB-DL'})
            self.video.write_bytes(b'new video')
            pending = info.stored_file_info(self.video, metadata)
            self.assertEqual(pending['probeStatus'], 'pending')
            self.assertEqual(pending['quality']['level'], 0)

    def test_endpoint_returns_saved_info_without_probing_after_restart(self):
        with patch.object(info, 'probe', return_value={'streams': [
                {'codec_type': 'video', 'width': 1920, 'height': 800}]}):
            saved = info.inspect_file(self.video, 'Film.BluRay.mkv')
        info._inspect.cache_clear()
        with patch.object(api, 'load_movie_library', return_value={
                'film.mkv': {'fileInfo': saved, 'originalFileName': 'Film.BluRay.mkv'}}), patch.object(
                info, 'probe', side_effect=AssertionError('The endpoint must only read SQLite')):
            response = self.client.get('/media/file-info?relativePath=film.mkv', headers={'X-Web-Pin': 'test-pin'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json, saved)

    def test_quality_captures_and_unknowns(self):
        self.assertEqual(info.quality({'width': 1920, 'height': 800})['level'], 4)
        self.assertEqual(info.quality({'width': 3840, 'height': 2160}, 'Film.HDCAM.mkv')['level'], 1)
        self.assertEqual(info.quality({'width': 1920, 'height': 1080}, 'Film.DVDSCR.mkv')['level'], 2)
        self.assertEqual(info.quality({}, 'Film.2160p.BluRay.mkv')['level'], 0)


class BackfillTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.movies = self.root / 'Videos/Movies'
        self.movies.mkdir(parents=True)
        self.path = self.movies / 'film.mkv'
        self.path.write_bytes(b'video')
        self.catalog = self.root / 'media_library.json'
        self.relative = 'Movies/film.mkv'
        catalog_store.save(self.catalog, {'movies': {self.relative: {
            'name': 'Custom title', 'tmdbId': 20, 'heroImage': 'custom.jpg',
            'originalFileName': 'Original.WEB-DL.mkv'}}})
        info._inspect.cache_clear()

    def test_resumable_persistent_backfill_preserves_profiles_and_skips_non_videos(self):
        (self.movies / 'captions.srt').write_text('subtitle')
        (self.movies / '.partial').mkdir()
        (self.movies / '.partial' / 'part.mkv').write_bytes(b'partial')
        with patch.object(info, 'probe', return_value={'streams': [
                {'codec_type': 'video', 'width': 1920, 'height': 800}]}):
            self.assertEqual(backfill(self.root)['updated'], 1)
        info._inspect.cache_clear()
        with patch.object(info, 'probe', side_effect=AssertionError('Already saved')):
            self.assertEqual(backfill(self.root)['unchanged'], 1)
        item = catalog_store.read(self.catalog)['movies'][self.relative]
        self.assertEqual(item['name'], 'Custom title')
        self.assertEqual(item['heroImage'], 'custom.jpg')
        self.assertEqual(item['fileInfo']['quality']['source'], 'WEB-DL')

    def test_replacement_is_remeasured_and_failure_never_keeps_previous_quality(self):
        with patch.object(info, 'probe', return_value={'streams': [
                {'codec_type': 'video', 'width': 1920, 'height': 800}]}):
            backfill(self.root)
        self.path.write_bytes(b'broken replacement')
        with patch.object(info, 'probe', side_effect=PlaybackError('PROBE_FAILED')) as probe:
            self.assertEqual(backfill(self.root)['failed'], 1)
            info._inspect.cache_clear()
            self.assertEqual(backfill(self.root)['failed'], 1)
            self.assertEqual(probe.call_count, 1)
        item = catalog_store.read(self.catalog)['movies'][self.relative]
        self.assertEqual(item['fileInfo']['quality']['level'], 0)
        with patch.object(info, 'probe', return_value={'streams': [
                {'codec_type': 'video', 'width': 1280, 'height': 720}]}):
            self.assertEqual(backfill(self.root, retry_failed=True)['updated'], 1)

    def test_concurrent_profile_edit_is_preserved_and_changed_video_is_not_saved(self):
        def edit_profile(_):
            with catalog_store.transaction(self.catalog):
                current = catalog_store.read(self.catalog)
                current['movies'][self.relative]['name'] = 'Edited during analysis'
                catalog_store.save(self.catalog, current)
            return {'streams': [{'codec_type': 'video', 'width': 640, 'height': 480}]}
        with patch.object(info, 'probe', side_effect=edit_profile):
            self.assertEqual(backfill(self.root)['updated'], 1)
        self.assertEqual(catalog_store.read(self.catalog)['movies'][self.relative]['name'], 'Edited during analysis')
        self.path.write_bytes(b'new')
        def replace_file(_):
            self.path.write_bytes(b'changed while probing')
            return {'streams': [{'codec_type': 'video', 'width': 3840, 'height': 2160}]}
        with patch.object(info, 'probe', side_effect=replace_file):
            self.assertEqual(backfill(self.root)['skipped'], 1)
        self.assertEqual(catalog_store.read(self.catalog)['movies'][self.relative]['fileInfo']['quality']['level'], 2)

    def test_interrupted_batch_resumes_from_committed_measurements(self):
        for index in range(4):
            (self.movies / f'new{index}.mkv').write_bytes(b'video')
        def stop_after_commit(row):
            raise RuntimeError('interrupted')
        with patch.object(info, 'probe', return_value={'streams': [
                {'codec_type': 'video', 'width': 1280, 'height': 720}]}):
            with self.assertRaisesRegex(RuntimeError, 'interrupted'):
                backfill(self.root, progress=stop_after_commit, batch_size=2)
            info._inspect.cache_clear()
            result = backfill(self.root, batch_size=2)
        self.assertEqual(result, {'total': 5, 'updated': 3, 'unchanged': 2, 'failed': 0, 'skipped': 0})
