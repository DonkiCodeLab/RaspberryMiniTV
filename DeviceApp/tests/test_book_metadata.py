import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import book_metadata as metadata
import control_api as api


class ProviderTests(unittest.TestCase):
    def test_search_uses_matched_edition_identifiers_and_does_not_mix_isbns(self):
        payload = {'docs': [{'key': '/works/OL1W', 'title': 'Work', 'author_name': ['Writer'],
            'isbn': ['WRONG-EDITION'], 'first_publish_year': 1960, 'cover_i': 123,
            'editions': {'docs': [{'key': '/books/OL2M', 'title': 'Título español', 'isbn': ['RIGHT-EDITION'], 'language': ['spa']}]}}]}
        with patch.object(metadata, '_get', return_value=payload):
            item = metadata.search('Título español')[0]
        self.assertEqual(item['isbn'], 'RIGHT-EDITION')
        self.assertEqual(item['editionKey'], '/books/OL2M')
        self.assertEqual(item['title'], 'Título español')

    def test_details_combines_edition_and_work_and_validates_keys(self):
        fixtures = {
            '/books/OL2M.json': {'works': [{'key': '/works/OL1W'}], 'title': 'Edición', 'isbn_13': ['9781234567890'],
                'publish_date': 'September 2001', 'publishers': ['Editorial'], 'number_of_pages': 120,
                'languages': [{'key': '/languages/spa'}]},
            '/works/OL1W.json': {'title': 'Original', 'description': {'value': 'Sinopsis completa'}, 'subjects': ['Ficción'],
                'authors': [{'author': {'key': '/authors/OL3A'}}], 'covers': [123]},
            '/authors/OL3A.json': {'name': 'Una autora'},
        }
        with patch.object(metadata, '_get', side_effect=lambda path: fixtures[path]) as fetch:
            item = metadata.details('/works/OL1W', '/books/OL2M')
            self.assertEqual(item['description'], 'Sinopsis completa')
            self.assertEqual(item['publisher'], 'Editorial')
            self.assertEqual(item['author'], 'Una autora')
            self.assertEqual(item['year'], '2001')
            self.assertEqual(item['pageCount'], '120')
            self.assertEqual(item['language'], 'spa')
            self.assertEqual(item['isbn'], '9781234567890')
            with self.assertRaises(ValueError):
                metadata.details('/works/OL9W', '/books/OL2M')
        with patch.object(metadata, '_get') as fetch:
            for key in ['https://localhost/private', '/works/../../private', '/works/OL1W?anything=1']:
                with self.assertRaises(ValueError):
                    metadata.details(key)
            fetch.assert_not_called()

    def test_cover_redirects_only_follow_official_provider_hosts(self):
        handler = metadata._CoverRedirect()
        request = metadata.urllib.request.Request('https://covers.openlibrary.org/b/id/1-L.jpg')
        for url in ['https://archive.org/download/l_covers_0001/cover.jpg', 'https://ia902809.us.archive.org/view_archive.php?file=cover.jpg']:
            self.assertEqual(handler.redirect_request(request, None, 302, '', {}, url).full_url, url)
        for url in ['http://archive.org/cover.jpg', 'https://archive.org.evil.example/cover.jpg', 'https://127.0.0.1/cover.jpg', 'https://archive.org:8443/cover.jpg']:
            with self.assertRaises(ValueError):
                handler.redirect_request(request, None, 302, '', {}, url)

    def test_cover_is_cached_atomically_and_arbitrary_urls_are_never_fetched(self):
        with tempfile.TemporaryDirectory() as directory:
            response = MagicMock()
            response.__enter__.return_value.read.return_value = b'\xff\xd8\xfftest-image'
            opener = MagicMock()
            opener.open.return_value = response
            with patch.object(metadata.urllib.request, 'build_opener', return_value=opener):
                url = metadata.cache_cover('https://covers.openlibrary.org/b/id/123-L.jpg?default=false', directory, 'Books/a.epub')
                self.assertEqual((Path(directory) / url.rsplit('/', 1)[-1]).read_bytes(), b'\xff\xd8\xfftest-image')
                self.assertEqual(metadata.cache_cover('http://127.0.0.1/private', directory, 'Books/a.epub'), 'http://127.0.0.1/private')
                self.assertEqual(opener.open.call_count, 1)
                response.__enter__.return_value.read.return_value = b'<html>Error</html>'
                with self.assertRaises(ValueError):
                    metadata.cache_cover('https://covers.openlibrary.org/b/id/124-L.jpg', directory, 'Books/a.epub')
            self.assertEqual(len(list(Path(directory).iterdir())), 1)


class BookFlowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name, value in {
            'MULTIMEDIA_DIR': str(self.root), 'BOOKS_DIR': str(self.root / 'Books'),
            'BOOK_COVERS_DIR': str(self.root / 'BookCovers'), 'MEDIA_LIBRARY_PATH': str(self.root / 'media_library.json'),
            'LEGACY_MOVIE_LIBRARY_PATH': str(self.root / 'movie_library.json'),
        }.items():
            patcher = patch.object(api, name, value); patcher.start(); self.addCleanup(patcher.stop)
        for name in ['ensure_media_directories', 'is_authorized_request']:
            patcher = patch.object(api, name, return_value=True); patcher.start(); self.addCleanup(patcher.stop)
        (self.root / 'Books').mkdir()
        self.client = api.app.test_client()

    def test_confirmed_upload_persists_file_and_full_profile_in_sqlite(self):
        profile = dict(title='El libro', author='Autor', description='Sinopsis', isbn='9781234567890',
            publisher='Editorial', pageCount='231', language='spa', subjects='Ficción', editionKey='/books/OL2M', openLibraryKey='/works/OL1W')
        response = self.client.post('/books/upload', data={'files': (io.BytesIO(b'PK\x03\x04test'), 'source.epub'), 'metadata': json.dumps(profile)})
        self.assertEqual(response.status_code, 200, response.json)
        path = response.json['items'][0]['relativePath']
        self.assertEqual((self.root / path).read_bytes(), b'PK\x03\x04test')
        self.assertEqual(api.load_media_library()['books'][path]['publisher'], 'Editorial')
        self.assertTrue((self.root / 'media_library.sqlite3').exists())
        with patch.object(metadata, '_get', side_effect=AssertionError('Listing must work offline')):
            item = api.list_book_entries()[0]
        self.assertEqual(item['name'], 'El libro')
        self.assertEqual(item['description'], 'Sinopsis')
        self.assertEqual(item['pageCount'], '231')
        self.client.post('/books/profile', json={'relativePath': path, 'title': 'Renamed'})
        self.assertEqual(api.list_book_entries()[0]['isbn'], '9781234567890', 'partial edits preserve confirmed metadata')
        with self.client.get('/books/content', query_string={'relativePath': path}) as content:
            self.assertEqual(content.mimetype, 'application/epub+zip')
            self.assertEqual(content.data, b'PK\x03\x04test')
        with patch.object(api, 'write_menu_command') as command:
            self.assertEqual(self.client.post('/books/open', json={'relativePath': path}).status_code, 200)
            self.assertEqual(command.call_args.args[0]['action'], 'open_book')

    def test_failed_persistence_removes_only_the_new_upload(self):
        (self.root / 'Books' / 'existing.epub').write_bytes(b'original')
        with patch.object(api, 'persist_book_profile', side_effect=api.catalog_store.CatalogError('disk full')):
            response = self.client.post('/books/upload', data={'files': (io.BytesIO(b'new file'), 'existing.epub')})
        self.assertEqual(response.status_code, 500)
        self.assertEqual(list((self.root / 'Books').iterdir()), [self.root / 'Books' / 'existing.epub'])
        self.assertEqual((self.root / 'Books' / 'existing.epub').read_bytes(), b'original')

    def test_failed_provider_preserves_existing_profile_and_invalid_metadata_rejects_before_upload(self):
        (self.root / 'Books' / 'a.epub').write_bytes(b'original')
        self.client.post('/books/profile', json={'relativePath': 'Books/a.epub', 'title': 'Original'})
        with patch.object(metadata, 'cache_cover', side_effect=OSError('offline')):
            response = self.client.post('/books/profile', json={'relativePath': 'Books/a.epub', 'title': 'Changed', 'coverUrl': 'https://covers.openlibrary.org/b/id/1-L.jpg'})
        self.assertEqual(response.status_code, 502)
        self.assertEqual(api.list_book_entries()[0]['name'], 'Original')
        response = self.client.post('/books/upload', data={'files': (io.BytesIO(b'data'), 'b.epub'), 'metadata': '[]'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(len(list((self.root / 'Books').iterdir())), 1)

    def test_provider_errors_and_auth_are_explicit(self):
        with patch.object(metadata, 'search', side_effect=TimeoutError):
            self.assertEqual(self.client.get('/books/search?query=book').status_code, 502)
        self.assertEqual(self.client.get('/books/metadata?workKey=invalid').status_code, 400)
        with patch.object(api, 'is_authorized_request', return_value=False):
            for url in ['/books/search?query=book', '/books/metadata?workKey=/works/OL1W', '/books/content?relativePath=Books/a.epub']:
                self.assertEqual(self.client.get(url).status_code, 401)


if __name__ == '__main__':
    unittest.main()
