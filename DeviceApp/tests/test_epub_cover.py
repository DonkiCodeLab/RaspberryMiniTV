import io
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from epub_cover import cover_member, extract_epub_cover


class EpubCoverTests(unittest.TestCase):
    def archive(self, metadata='', manifest='', guide='', extra=None):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w') as z:
            z.writestr('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>')
            z.writestr('OEBPS/content.opf', f'<package xmlns="http://www.idpf.org/2007/opf"><metadata>{metadata}</metadata><manifest>{manifest}</manifest><guide>{guide}</guide></package>')
            z.writestr('OEBPS/Images/autora.jpg', b'author portrait')
            for name, data in (extra or {}).items():
                z.writestr(name, data)
        return stream.getvalue()

    def select(self, data):
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            return cover_member(z)

    def test_epub2_declared_portada_beats_author_photo_and_cover_decoy(self):
        data = self.archive('<meta name="cover" content="Portada.jpg"/>', '<item id="Portada.jpg" href="Images/Portada.jpg" media-type="image/jpeg"/>', extra={'OEBPS/Images/Portada.jpg': b'actual cover', 'OEBPS/Images/cover-decoy.jpg': b'decoy'})
        self.assertEqual(self.select(data), 'OEBPS/Images/Portada.jpg')
        with tempfile.TemporaryDirectory() as tmp:
            book = Path(tmp)/'book.epub'
            book.write_bytes(data)
            cache = Path(tmp)/'cache'
            cache.mkdir()
            (cache/'old.jpg').write_bytes(b'author portrait')
            result = extract_epub_cover(book, cache)
            self.assertEqual(Path(result).read_bytes(), b'actual cover')
            self.assertEqual(extract_epub_cover(book, cache), result)

    def test_epub3_property_and_encoded_path(self):
        data = self.archive(manifest='<item id="art" properties="cover-image" href="Images/front%20art.png"/>', extra={'OEBPS/Images/front art.png': b'cover'})
        self.assertEqual(self.select(data), 'OEBPS/Images/front art.png')

    def test_guide_svg_wrapper_resolves_relative_image(self):
        data = self.archive(guide='<reference type="cover" href="Text/front.xhtml#start"/>', extra={'OEBPS/Text/front.xhtml': '<html xmlns:xlink="http://www.w3.org/1999/xlink"><svg><image xlink:href="../Images/art.jpg"/></svg></html>', 'OEBPS/Images/art.jpg': b'cover'})
        self.assertEqual(self.select(data), 'OEBPS/Images/art.jpg')

    def test_missing_declared_image_falls_back_to_named_portada(self):
        data = self.archive('<meta name="cover" content="missing"/>', extra={'OEBPS/Images/Portada.jpg': b'cover'})
        self.assertEqual(self.select(data), 'OEBPS/Images/Portada.jpg')

    def test_no_cover_does_not_choose_author_or_fetch_external_image(self):
        data = self.archive(manifest='<item id="remote" properties="cover-image" href="https://example.com/cover.jpg"/>')
        self.assertIsNone(self.select(data))

    def test_invalid_archive_is_safe(self):
        with tempfile.TemporaryDirectory() as tmp:
            book = Path(tmp)/'broken.epub'
            book.write_bytes(b'not a zip')
            self.assertIsNone(extract_epub_cover(book, tmp))


if __name__ == '__main__':
    unittest.main()
