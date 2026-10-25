import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api
from tv_books import text_pages, MAX_MEMBER


def epub(path, text='Texto de prueba', href='chapter.xhtml', extra=None):
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>')
        archive.writestr('OEBPS/content.opf', f'<package><manifest><item id="c" href="{href}" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>')
        archive.writestr('OEBPS/chapter.xhtml', '<html><head><title>Hidden title</title></head><body><script>hidden script</script><p>' + text + '</p></body></html>')
        for name, value in (extra or {}).items():
            archive.writestr(name, value)


class TVBookTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'Books'
        self.root.mkdir()
        self.book = self.root / 'Libro á.epub'
        for name, value in [('BOOKS_DIR', str(self.root)), ('current_web_pin', lambda: '2468')]:
            mocked = patch.object(api, name, value)
            mocked.start(); self.addCleanup(mocked.stop)
        text_pages.cache_clear()
        self.client = api.app.test_client()

    def get(self, path='Books/Libro á.epub', page=1, authorized=True):
        return self.client.get('/tv/books/text', query_string={'relativePath': path, 'page': page},
                               headers={'X-Web-Pin': '2468'} if authorized else {})

    def test_uses_existing_pin_and_has_no_query_pin_bypass(self):
        epub(self.book)
        self.assertEqual(self.get(authorized=False).status_code, 401)
        self.assertEqual(self.client.get('/tv/books/text?pin=2468').status_code, 401)
        self.assertEqual(self.get().status_code, 200)

    def test_paginated_text_preserves_content_without_html_scripts_or_head(self):
        text = 'La biblioteca está abierta. ' * 200
        epub(self.book, text)
        first = self.get()
        self.assertEqual(first.headers['Cache-Control'], 'no-store')
        self.assertGreater(first.json['total'], 1)
        pages = [self.get(page=index).json['text'] for index in range(1, first.json['total'] + 1)]
        self.assertEqual(' '.join(pages), text.strip())
        self.assertTrue(all(len(page) <= 1800 for page in pages))
        self.assertNotIn('hidden', ' '.join(pages).lower())

    def test_rejects_bad_pages_and_outside_files(self):
        epub(self.book)
        for page in [0, -1, 999999, 'nope']:
            self.assertIn(self.get(page=page).status_code, (400, 422))
        outside = Path(self.tmp.name) / 'outside.epub'
        epub(outside, 'private')
        self.assertEqual(self.get('../outside.epub').status_code, 404)
        (self.root / 'linked.epub').symlink_to(outside)
        self.assertEqual(self.get('Books/linked.epub').status_code, 404)

    def test_rejects_external_and_traversing_manifest_links(self):
        for href in ['https://example.com/file', '../../private.xhtml', '%2fprivate.xhtml']:
            epub(self.book, href=href)
            self.assertEqual(self.get().status_code, 422)

    def test_rejects_large_sections_and_malformed_archives(self):
        epub(self.book, 'A' * (MAX_MEMBER + 1))
        self.assertEqual(self.get().status_code, 422)
        self.book.write_bytes(b'not an epub')
        self.assertEqual(self.get().status_code, 422)

    def test_invalidates_cached_pages_after_replacement(self):
        epub(self.book, 'Primero')
        self.assertEqual(self.get().json['text'], 'Primero')
        epub(self.book, 'Segunda versión más larga')
        self.assertEqual(self.get().json['text'], 'Segunda versión más larga')

    def test_spine_order_and_encrypted_text(self):
        epub(self.book, extra={'META-INF/encryption.xml': '<encryption><CipherReference URI="OEBPS/chapter.xhtml"/></encryption>'})
        self.assertEqual(self.get().status_code, 422)
        with zipfile.ZipFile(self.book, 'w') as archive:
            archive.writestr('META-INF/container.xml', '<container><rootfile full-path="content.opf"/></container>')
            archive.writestr('content.opf', '<package><manifest><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>')
            archive.writestr('b.xhtml', '<p>Segundo</p>')
            archive.writestr('a.xhtml', '<p>Primero</p>')
        self.assertEqual(self.get(page=1).json['text'], 'Primero')
        self.assertEqual(self.get(page=2).json['text'], 'Segundo')


if __name__ == '__main__':
    unittest.main()
