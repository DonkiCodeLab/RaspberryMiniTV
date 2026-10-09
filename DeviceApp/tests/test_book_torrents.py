import copy
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import torrent_downloads as torrents
import control_api as api
from test_torrent_downloads import FakeTransmission, INFO_HASH


class BookTorrentTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name).resolve()
        self.rpc = FakeTransmission()
        self.importer = Mock(return_value={'relativePath': 'Books/La carretera.epub'})
        self.movie_importer = Mock()
        self.manager = torrents.TorrentDownloads(self.root / 'Torrents', self.movie_importer, Mock(), Mock(), self.rpc, import_book=self.importer)
        self.manager.start = Mock()
        self.data = {'infoHash': INFO_HASH, 'mediaType': 'books', 'name': 'La carretera español epub',
                     'book': {'openLibraryKey': '/works/OL1W', 'name': 'La carretera', 'author': 'Cormac McCarthy'}}

    def test_providers_request_and_filter_books_without_movies_comics_or_audiobooks(self):
        row = {'info_hash': INFO_HASH, 'category': '601', 'size': 1000, 'name': 'La carretera', 'seeders': 2}
        self.assertEqual(len(torrents.normalize_results([row, {**row, 'category': '201'}, {**row, 'category': '102'}], 'books')), 1)
        hit = {'hash': INFO_HASH, 'title': 'La carretera', 'bytes': 1000, 'categoryId': [9000000, 9001000]}
        self.assertEqual(len(torrents.normalize_knaben_results({'hits': [hit, {**hit, 'categoryId': [9000000, 9002000]}, {**hit, 'categoryId': [3001000]}]}, 'books')), 1)
        with patch.object(torrents, '_search_json', return_value={'hits': []}) as fetch:
            torrents.search_knaben('La carretera español', 'books')
        self.assertEqual(parse_qs(urlsplit(fetch.call_args.args[0]).query)['c'], ['9001000'])
        with patch.object(torrents, '_search_json', return_value=[]) as fetch:
            torrents.search_pirate_bay('La carretera español', 'books')
        self.assertEqual(parse_qs(urlsplit(fetch.call_args.args[0]).query)['cat'], ['601'])

    def test_book_search_keeps_spanish_query_and_skips_eztv(self):
        with patch.object(torrents, 'torznab_sources', return_value=[]), patch.object(torrents, 'search_pirate_bay', return_value=[]) as pb, patch.object(torrents, 'search_knaben', return_value=[]) as kn, patch.object(torrents, 'search_eztv') as eztv:
            torrents.search_torrents('Libro español de prueba', 'books')
        pb.assert_called_once_with('Libro español de prueba', 'books')
        kn.assert_called_once_with('Libro español de prueba', 'books')
        eztv.assert_not_called()
        with self.assertRaises(ValueError):
            torrents.search_torrents('Book', 'books', season=1)

    def test_selects_epub_over_pdf_for_same_book_rejects_ambiguous_packs_and_traversal(self):
        files = [{'name': name, 'length': 100} for name in ['La carretera.pdf', 'La carretera.epub', 'otro libro.epub']]
        self.assertEqual(torrents.book_file(files, self.data['book'])[0], 1)
        for files in ([{'name': 'a.epub', 'length': 10}, {'name': 'b.epub', 'length': 10}], [{'name': '../book.epub', 'length': 10}], [{'name': '/book.pdf', 'length': 10}], [{'name': 'book.zip', 'length': 10}], [{'name': 'book.mp3', 'length': 10}]):
            with self.assertRaises(torrents.TorrentError):
                torrents.book_file(files, self.data['book'])

    def test_download_imports_only_completed_book_without_tmdb_and_survives_restart(self):
        self.manager.add(self.data)
        row = self.rpc.rows[INFO_HASH]
        row.update(metadataPercentComplete=1, percentDone=.5, leftUntilDone=50, files=[{'name': 'La carretera.epub', 'length': 100, 'bytesCompleted': 50}, {'name': 'movie.mkv', 'length': 500}])
        folder = Path(row['downloadDir']); source = folder / 'La carretera.epub'; source.write_bytes(b'a' * 50)
        self.manager.tick(); self.manager.tick()
        self.importer.assert_not_called()
        wanted = [args for method, args in self.rpc.calls if method == 'torrent-set'][-1]
        self.assertEqual(wanted['files-wanted'], [0]); self.assertEqual(wanted['files-unwanted'], [1])
        restarted = torrents.TorrentDownloads(self.root / 'Torrents', self.movie_importer, Mock(), Mock(), self.rpc, import_book=self.importer)
        source.write_bytes(b'a' * 100); row['files'][0]['bytesCompleted'] = 100; row.update(percentDone=1, leftUntilDone=0)
        restarted.tick()
        self.importer.assert_called_once()
        self.movie_importer.assert_not_called()
        restarted.artwork_status.assert_not_called()
        restarted.prepare_artwork.assert_not_called()
        self.assertEqual(restarted.snapshot()['jobs'][0]['state'], 'complete')

    def test_duplicate_book_and_invalid_identity_rejected(self):
        self.manager.add(self.data)
        with self.assertRaisesRegex(ValueError, 'en curso'):
            self.manager.add({**self.data, 'infoHash': 'b' * 40})
        with self.assertRaises(ValueError):
            self.manager.add({**self.data, 'book': {'name': 'Book', 'openLibraryKey': 'https://bad.example/works/OL1W'}})

    def test_import_publishes_work_profile_and_preserves_existing_book(self):
        books = self.root / 'Books'; books.mkdir()
        with patch.multiple(api, BOOKS_DIR=str(books), BOOK_COVERS_DIR=str(self.root / 'covers'), MEDIA_LIBRARY_PATH=str(self.root / 'library.json'), LEGACY_MOVIE_LIBRARY_PATH=str(self.root / 'legacy.json')), patch.object(api, 'ensure_media_directories'):
            source = self.root / 'book.epub'; source.write_bytes(b'book contents')
            job = {**self.data, 'id': INFO_HASH}
            item = api.import_torrent_book(job, source)
            self.assertEqual(Path(api.resolve_book_path(item['relativePath'])).read_bytes(), b'book contents')
            self.assertEqual(api.load_media_library()['books'][item['relativePath']]['openLibraryKey'], '/works/OL1W')
            self.assertNotIn('isbn', item)
            source.write_bytes(b'book contents')
            again = api.import_torrent_book({**job, 'id': 'b' * 40}, source)
            self.assertEqual(again['relativePath'], item['relativePath'])
            self.assertEqual(len(list(books.glob('*.epub'))), 1)

    def test_import_rolls_back_file_when_profile_save_fails(self):
        books = self.root / 'Books'; books.mkdir()
        with patch.multiple(api, BOOKS_DIR=str(books), MEDIA_LIBRARY_PATH=str(self.root / 'library.json'), LEGACY_MOVIE_LIBRARY_PATH=str(self.root / 'legacy.json')), patch.object(api, 'ensure_media_directories'), patch.object(api, 'save_media_library', side_effect=OSError('disk full')):
            source = self.root / 'book.pdf'; source.write_bytes(b'book')
            with self.assertRaises(OSError):
                api.import_torrent_book({**self.data, 'id': INFO_HASH}, source)
            self.assertEqual(list(books.iterdir()), [])
            self.assertEqual(source.read_bytes(), b'book')

    def test_api_resolves_metadata_server_side_and_keeps_work_identity(self):
        manager = Mock(); manager.add.return_value = {'state': 'queued'}
        detail = {'title': 'La carretera', 'openLibraryKey': '/works/OL1W', 'author': 'Cormac McCarthy', 'coverUrl': ''}
        with patch.object(api, 'is_authorized_request', return_value=True), patch.object(api, 'get_movie_torrents', return_value=manager), patch.object(api.book_metadata, 'details', return_value=detail) as lookup:
            response = api.app.test_client().post('/torrents', json={**self.data, 'book': {**self.data['book'], 'coverUrl': 'https://untrusted.invalid/cover'}})
        self.assertEqual(response.status_code, 202)
        lookup.assert_called_once_with('/works/OL1W', None, language='es')
        self.assertEqual(manager.add.call_args.args[0]['book']['coverUrl'], '')
