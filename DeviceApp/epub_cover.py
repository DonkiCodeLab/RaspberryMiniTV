"""Select the EPUB-declared cover instead of an arbitrary interior image."""
import hashlib
import os
import posixpath
import re
import tempfile
import urllib.parse
import xml.etree.ElementTree as ET
import zipfile

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}


def resolve_member(base, href):
    url = urllib.parse.urlsplit(href or '')
    if url.scheme or url.netloc:
        return None
    path = posixpath.normpath(posixpath.join(posixpath.dirname(base), urllib.parse.unquote(url.path)))
    return path if not path.startswith(('/', '../')) else None


def cover_member(archive):
    names = set(archive.namelist())

    def xml(path):
        try:
            return ET.fromstring(archive.read(path))
        except (KeyError, ET.ParseError):
            return None

    def image(path):
        if not path or path not in names:
            return None
        if posixpath.splitext(path)[1].lower() in IMAGE_EXTENSIONS:
            return path
        # Cover pages often wrap their image in XHTML or SVG.
        root = xml(path)
        if root is not None:
            for node in root.iter():
                if node.tag.split('}')[-1] in {'img', 'image'}:
                    href = node.get('src') or node.get('href') or node.get('{http://www.w3.org/1999/xlink}href')
                    target = resolve_member(path, href)
                    if target in names and posixpath.splitext(target)[1].lower() in IMAGE_EXTENSIONS:
                        return target
        return None

    container = xml('META-INF/container.xml')
    packages = [n.get('full-path') for n in container.iter() if n.tag.split('}')[-1] == 'rootfile'] if container is not None else []
    packages = packages or sorted(n for n in names if n.endswith('.opf'))
    for package in packages:
        root = xml(package)
        if root is None:
            continue
        items = {n.get('id'): n for n in root.iter() if n.tag.split('}')[-1] == 'item'}
        candidates = [resolve_member(package, n.get('href')) for n in items.values() if 'cover-image' in n.get('properties', '').split()]
        for node in root.iter():
            if node.tag.split('}')[-1] == 'meta' and node.get('name', '').lower() == 'cover':
                item = items.get(node.get('content'))
                if item is not None:
                    candidates.append(resolve_member(package, item.get('href')))
        candidates.extend(resolve_member(package, n.get('href')) for n in root.iter() if n.tag.split('}')[-1] == 'reference' and n.get('type') == 'cover')
        for candidate in candidates:
            selected = image(candidate)
            if selected:
                return selected
    # Conservative fallback: a clearly named cover, never the first image.
    for name in sorted(names):
        if re.fullmatch(r'(?:cover|portada|cubierta)(?:[-_\d].*)?', posixpath.splitext(posixpath.basename(name))[0], re.I):
            selected = image(name)
            if selected:
                return selected
    return None


def extract_epub_cover(book_path, cache_dir):
    stat = os.stat(book_path)
    # Version the cache to bypass images chosen by the old alphabetical heuristic.
    key = hashlib.sha256(f'epub-cover-v2:{os.path.abspath(book_path)}:{stat.st_mtime_ns}:{stat.st_size}'.encode()).hexdigest()
    try:
        with zipfile.ZipFile(book_path) as archive:
            member = cover_member(archive)
            if not member:
                return None
            os.makedirs(cache_dir, exist_ok=True)
            destination = os.path.join(cache_dir, key + posixpath.splitext(member)[1].lower())
            if not os.path.isfile(destination):
                data = archive.read(member)
                fd, temporary = tempfile.mkstemp(dir=cache_dir)
                try:
                    with os.fdopen(fd, 'wb') as output:
                        output.write(data)
                    os.replace(temporary, destination)
                finally:
                    if os.path.exists(temporary):
                        os.unlink(temporary)
            return destination
    except (OSError, zipfile.BadZipFile, KeyError, ValueError):
        return None
