import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api


class MovieSubtitleTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.movies = self.root / 'Movies'
        self.movies.mkdir()
        self.video = self.movies / 'Alien (1979).mkv'
        self.video.write_bytes(b'video')
        for name, value in {'VIDEOS_DIR': str(self.root), 'MOVIES_DIR': str(self.movies)}.items():
            mocked = patch.object(api, name, value)
            mocked.start()
            self.addCleanup(mocked.stop)
        for name in ('ensure_media_directories', 'is_authorized_request'):
            mocked = patch.object(api, name, return_value=True)
            mocked.start()
            self.addCleanup(mocked.stop)
        self.client = api.app.test_client()

    def upload(self, path='Movies/Alien (1979).mkv', name='different.SRT', content=b'1\n00:00:01,000 --> 00:00:02,000\nHola\n'):
        return self.client.post('/movies/subtitles', data={'relativePath': path, 'file': (io.BytesIO(content), name)})

    def test_names_sidecar_after_actual_video_and_replaces_it(self):
        self.assertEqual(self.upload().status_code, 200)
        target = self.video.with_suffix('.srt')
        self.assertIn(b'Hola', target.read_bytes())
        self.assertFalse((self.movies / 'different.SRT').exists())
        self.assertEqual(self.upload(content=b'new subtitles').status_code, 200)
        self.assertEqual(target.read_bytes(), b'new subtitles')
        self.assertEqual(self.video.read_bytes(), b'video')

    def test_invalid_upload_does_not_replace_existing_subtitles(self):
        target = self.video.with_suffix('.srt')
        target.write_bytes(b'existing')
        for name, content in [('bad.txt', b'text'), ('empty.srt', b''), ('large.srt', b'x' * (5 * 1024 * 1024 + 1))]:
            self.assertEqual(self.upload(name=name, content=content).status_code, 400)
            self.assertEqual(target.read_bytes(), b'existing')

    def test_missing_video_traversal_and_symlink_escape(self):
        for path, status in [('Movies/missing.mp4', 404), ('../outside.mp4', 400), ('TVShows/video.mp4', 400)]:
            self.assertEqual(self.upload(path=path).status_code, status)
        outside = self.root / 'outside.mp4'
        outside.write_bytes(b'video')
        (self.movies / 'link.mp4').symlink_to(outside)
        self.assertEqual(self.upload(path='Movies/link.mp4').status_code, 400)
        self.assertFalse(outside.with_suffix('.srt').exists())

    def test_deleting_movie_removes_subtitle(self):
        self.upload()
        with patch.object(api, 'remove_movie_metadata'):
            response = self.client.delete('/movies', query_string={'relativePath': 'Movies/Alien (1979).mkv'})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(self.video.with_suffix('.srt').exists())


if __name__ == '__main__':
    unittest.main()
