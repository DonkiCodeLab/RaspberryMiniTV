import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api


class UploadConflictTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        for folder in ('Books', 'Movies'):
            (self.root / folder).mkdir()
        for name, value in {
            'BOOKS_DIR': str(self.root / 'Books'),
            'MOVIES_DIR': str(self.root / 'Movies'),
            'VIDEOS_DIR': str(self.root),
            'MEDIA_LIBRARY_PATH': str(self.root / 'library.json'),
            'LEGACY_MOVIE_LIBRARY_PATH': str(self.root / 'legacy.json'),
        }.items():
            handle = patch.object(api, name, value)
            handle.start()
            self.addCleanup(handle.stop)
        for name in ('ensure_media_directories', 'is_authorized_request', 'queue_tmdb_artwork'):
            handle = patch.object(api, name, return_value=True)
            handle.start()
            self.addCleanup(handle.stop)
        self.client = api.app.test_client()

    def test_book_requires_confirmation_and_replaces_without_duplicate(self):
        target = self.root / 'Books' / 'my-book.pdf'
        target.write_bytes(b'original')
        check = self.client.post('/uploads/check', json={'mediaType': 'books', 'files': ['other.pdf'], 'title': 'My Book'})
        self.assertEqual(check.json['conflicts'], ['other.pdf'])
        for confirmed, status in ((False, 409), (True, 200)):
            response = self.client.post('/books/upload', data={'files': (io.BytesIO(b'replacement'), 'other.pdf'), 'title': 'My Book', 'overwriteExisting': str(confirmed).lower()})
            self.assertEqual(response.status_code, status, response.json)
            self.assertEqual(target.read_bytes(), b'replacement' if confirmed else b'original')
        self.assertEqual(len(list(target.parent.glob('*.pdf'))), 1)

    def test_movie_matches_tmdb_id_even_when_title_changes(self):
        target = self.root / 'Movies' / 'original.mp4'
        target.write_bytes(b'original')
        api.upsert_movie_metadata('Movies/original.mp4', 'Old title', 123, target.name)
        check = self.client.post('/uploads/check', json={'mediaType': 'movies', 'files': ['new.mp4'], 'title': 'New title', 'tmdbId': 123})
        self.assertEqual(check.json['conflicts'], ['new.mp4'])
        for confirmed, status in ((False, 409), (True, 200)):
            response = self.client.post('/movies/upload/raw', query_string={'filename': 'new.mp4', 'name': 'New title', 'tmdbId': 123, 'overwriteExisting': str(confirmed).lower()}, data=b'replacement', content_type='application/octet-stream')
            self.assertEqual(response.status_code, status, response.json)
            self.assertEqual(target.read_bytes(), b'replacement' if confirmed else b'original')
        self.assertEqual(len(list(target.parent.glob('*.mp4'))), 1)

    def test_collection_conflicts_use_same_slug_as_upload(self):
        folder = self.root / 'Books' / 'my-collection'
        folder.mkdir()
        (folder / 'volume-one.cbz').write_bytes(b'original')
        response = self.client.post('/uploads/check', json={'mediaType': 'books', 'collection': 'My Collection', 'files': ['Folder/Volume One.cbz', 'Folder/Volume Two.cbz']})
        self.assertEqual(response.json['conflicts'], ['Folder/Volume One.cbz'])


if __name__ == '__main__':
    unittest.main()
