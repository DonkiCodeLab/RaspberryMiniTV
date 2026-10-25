"""Read-only, bounded EPUB text pages for tvOS (which has no web view).

No archive member is extracted or executed. Authentication is supplied by the
same application-wide PIN middleware as the existing book endpoints.
"""
from functools import lru_cache
from html.parser import HTMLParser
from pathlib import Path
import posixpath
import re
import urllib.parse
import xml.etree.ElementTree as ET
import zipfile

from flask import Blueprint, jsonify, request

MAX_MEMBER = 4 * 1024 * 1024
MAX_ARCHIVE = 128 * 1024 * 1024
MAX_TEXT = 8 * 1024 * 1024
PAGE_CHARS = 1800


class BookTextError(ValueError):
    pass


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in {'script', 'style', 'head'}:
            self.hidden += 1
        if not self.hidden and tag in {'p', 'div', 'br', 'h1', 'h2', 'h3', 'li', 'blockquote'}:
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in {'script', 'style', 'head'}:
            self.hidden = max(0, self.hidden - 1)
        elif not self.hidden and tag in {'p', 'div', 'h1', 'h2', 'h3', 'li', 'blockquote'}:
            self.parts.append('\n')

    def handle_data(self, text):
        if not self.hidden:
            self.parts.append(text)

    def text(self):
        return re.sub(r'\n{3,}', '\n\n', re.sub(r'[^\S\n]+', ' ', ''.join(self.parts))).strip()


def safe_member(base, href):
    value = urllib.parse.urlsplit(href)
    path = urllib.parse.unquote(value.path)
    if value.scheme or value.netloc or path.startswith('/') or '\\' in path or '\x00' in path:
        raise BookTextError('El EPUB contiene una ruta no válida.')
    name = posixpath.normpath(posixpath.join(base, path))
    if name == '..' or name.startswith('../'):
        raise BookTextError('El EPUB contiene una ruta fuera del libro.')
    return name


def read_member(archive, name):
    try:
        info = archive.getinfo(name)
    except KeyError:
        raise BookTextError('El EPUB está incompleto.') from None
    if info.file_size > MAX_MEMBER or info.flag_bits & 1:
        raise BookTextError('El EPUB contiene una sección demasiado grande o protegida.')
    return archive.read(info)


def xml(data):
    if re.search(br'<!\s*(?:DOCTYPE|ENTITY)', data, re.I):
        raise BookTextError('La estructura XML del EPUB no es compatible.')
    return ET.fromstring(data)


@lru_cache(maxsize=8)
def text_pages(path, size, modified):
    del size, modified  # The file signature invalidates the bounded cache.
    try:
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            if len(entries) > 4096 or sum(item.file_size for item in entries) > MAX_ARCHIVE:
                raise BookTextError('El EPUB es demasiado grande para el lector de texto.')
            if 'META-INF/encryption.xml' in archive.namelist():
                # Font obfuscation is harmless; encrypted text is not readable here.
                encryption = xml(read_member(archive, 'META-INF/encryption.xml'))
                for ref in encryption.findall('.//{*}CipherReference'):
                    if not ref.get('URI', '').lower().endswith(('.otf', '.ttf')):
                        raise BookTextError('Este EPUB está protegido y no se puede leer en Apple TV.')
            container = xml(read_member(archive, 'META-INF/container.xml'))
            root = container.find('.//{*}rootfile')
            if root is None or not root.get('full-path'):
                raise BookTextError('No se encuentra el índice del EPUB.')
            package_path = safe_member('', root.get('full-path'))
            package = xml(read_member(archive, package_path))
            manifest = {item.get('id'): item for item in package.findall('.//{*}manifest/{*}item')}
            pages = []
            text_length = 0
            for section, itemref in enumerate(package.findall('.//{*}spine/{*}itemref'), 1):
                item = manifest.get(itemref.get('idref'))
                if item is None or itemref.get('linear') == 'no':
                    continue
                if item.get('media-type') not in {'application/xhtml+xml', 'text/html'}:
                    continue
                name = safe_member(posixpath.dirname(package_path), item.get('href', ''))
                parser = PlainText()
                parser.feed(read_member(archive, name).decode('utf-8-sig', errors='replace'))
                text = parser.text()
                text_length += len(text)
                if text_length > MAX_TEXT:
                    raise BookTextError('El texto del EPUB supera el límite del lector.')
                while text:
                    cut = min(len(text), PAGE_CHARS)
                    if cut < len(text):
                        boundary = text.rfind(' ', PAGE_CHARS // 2, cut)
                        if boundary > 0:
                            cut = boundary
                    pages.append((section, text[:cut].strip()))
                    text = text[cut:].strip()
            if not pages:
                raise BookTextError('El EPUB no contiene texto legible; puede ser un libro de imágenes.')
            return tuple(pages)
    except BookTextError:
        raise
    except (OSError, ValueError, RuntimeError, zipfile.BadZipFile, ET.ParseError):
        raise BookTextError('No se pudo leer el EPUB. Comprueba que el archivo no está dañado.') from None


def create_tv_books_blueprint(resolve_book_path):
    bp = Blueprint('tv_books', __name__)

    @bp.get('/tv/books/text')
    def text_page():
        path = resolve_book_path(request.args.get('relativePath', ''))
        if not path or not Path(path).is_file() or Path(path).suffix.lower() != '.epub':
            return jsonify({'error': 'No se encuentra el EPUB.'}), 404
        root = resolve_book_path('Books')
        if not root or not Path(path).resolve().is_relative_to(Path(root).resolve()):
            return jsonify({'error': 'No se encuentra el EPUB.'}), 404
        try:
            page = int(request.args.get('page', '1'))
            stat = Path(path).stat()
            pages = text_pages(str(Path(path).resolve()), stat.st_size, stat.st_mtime_ns)
            if not 1 <= page <= len(pages):
                return jsonify({'error': 'Página fuera del libro.'}), 400
            section, text = pages[page - 1]
            response = jsonify({'page': page, 'total': len(pages), 'section': section, 'text': text})
            response.headers['Cache-Control'] = 'no-store'
            return response
        except (ValueError, BookTextError) as error:
            return jsonify({'error': str(error) or 'Página no válida.'}), 422

    return bp
