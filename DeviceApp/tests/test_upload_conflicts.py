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
        self.assertEqual(api.load_movie_library()["Movies/original.mp4"]["originalFileName"], "new.mp4")

    def test_collection_conflicts_use_same_slug_as_upload(self):
        folder = self.root / 'Books' / 'my-collection'
        folder.mkdir()
        (folder / 'volume-one.cbz').write_bytes(b'original')
        response = self.client.post('/uploads/check', json={'mediaType': 'books', 'collection': 'My Collection', 'files': ['Folder/Volume One.cbz', 'Folder/Volume Two.cbz']})
        self.assertEqual(response.json['conflicts'], ['Folder/Volume One.cbz'])

    def test_both_movie_upload_routes_store_measurements_and_replace_them(self):
        for raw in (False, True):
            with self.subTest(raw=raw), patch.object(api.media_file_info, 'probe') as probe:
                probe.return_value = {'streams': [{'codec_type': 'video', 'width': 1280, 'height': 720}]}
                route = '/movies/upload/raw' if raw else '/movies/upload'
                fields = {'name': f'Film {raw}', 'tmdbId': 10 if raw else 20}
                def upload(content, original, overwrite=False):
                    params = {**fields, 'overwriteExisting': str(overwrite).lower()}
                    if raw:
                        return self.client.post(route, query_string={**params, 'filename': original},
                                                data=content, content_type='application/octet-stream')
                    return self.client.post(route, data={**params, 'file': (io.BytesIO(content), original)})
                first = upload(b'first release', 'Film.WEBRip.mkv')
                self.assertEqual(first.status_code, 200)
                self.assertEqual(first.json['item']['fileInfo']['quality']['level'], 3)
                probe.return_value = {'streams': [{'codec_type': 'video', 'width': 1920, 'height': 800}]}
                second = upload(b'new release', 'Film.BluRay.mkv', True)
                self.assertEqual(second.status_code, 200)
                item = api.load_movie_library()[second.json['item']['relativePath']]
                self.assertEqual(item['fileInfo']['quality']['level'], 4)
                self.assertEqual(item['fileInfo']['quality']['source'], 'Blu-ray')

    def test_register_existing_movie_measures_once_and_title_edits_reuse_it(self):
        target = self.root / 'Movies/existing.mkv'
        target.write_bytes(b'video')
        with patch.object(api.media_file_info, 'probe', return_value={'streams': [
                {'codec_type': 'video', 'width': 1920, 'height': 1080}]}) as probe:
            first = self.client.post('/movies', json={
                'relativePath': 'Movies/existing.mkv', 'name': 'Title', 'tmdbId': 10})
            second = self.client.post('/movies', json={
                'relativePath': 'Movies/existing.mkv', 'name': 'Edited title', 'tmdbId': 10})
            self.assertEqual(first.status_code, 200)
            self.assertEqual(second.json['item']['fileInfo']['quality']['level'], 4)
            self.assertEqual(second.json['item']['fileInfo'], first.json['item']['fileInfo'])
            self.assertEqual(probe.call_count, 1)


if __name__ == '__main__':
    unittest.main()
