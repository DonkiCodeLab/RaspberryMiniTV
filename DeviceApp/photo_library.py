"""Photo albums, EXIF, local face groups and resumable image-edit jobs.

Physical paths are immutable: organizing albums never invalidates profile marks.
The SQLite catalogue and its thumbnail cache can be backed up with Pictures.
"""
import base64
from contextlib import contextmanager
from datetime import datetime
import hashlib
import io
import json
import math
import os
import re
from pathlib import Path
import sqlite3
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid
import zipfile

from PIL import Image, ImageOps, UnidentifiedImageError
from flask import Blueprint, jsonify, request, send_file
from photo_import import validate_import_records
from photo_previews import ImageWorkLock, PhotoPreviews
from photo_places import PhotoPlaces
from photo_faces import FacePaused, FaceEngineError, LocalFaceEngine, INSTALL_COMMAND
import photo_face_matching as face_matching
import photo_reviews
import photo_review_batch
from ai_usage import track_call

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif', '.heic', '.heif'}
MAX_FILE_BYTES = 50 * 1024 * 1024
FACE_BATCH_SIZE = 100
UNKNOWN_PERSON_ID = 'unknown'


def validate_import_digests(digests):
    if not isinstance(digests, list) or not 1 <= len(digests) <= 20 or any(
            not isinstance(value, str) or not re.fullmatch(r'[0-9a-f]{64}', value) for value in digests):
        raise PhotoError('Huellas de importación inválidas.')
    return digests


STYLES = {
    'lego': 'a detailed scene built entirely from LEGO bricks and minifigures',
    'foam': 'a handmade foam puppet scene, with soft colorful foam textures',
    'minecraft': 'a Minecraft voxel scene, with block characters and pixel textures',
    'ghibli': 'a Studio Ghibli inspired hand-painted animation scene, with warm light and lush watercolor backgrounds',
}


class PhotoError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def clean_name(value):
    if not isinstance(value, str):
        raise PhotoError('Escribe un nombre para la carpeta.')
    name = value.strip()
    if not name or len(name) > 100 or name in {'.', '..'} or any(c in '/\\' or ord(c) < 32 for c in name):
        raise PhotoError('Usa un nombre de 1 a 100 caracteres, sin barras.')
    return name


def is_identified_person(person):
    """Automatic group labels cannot confirm the identity of another face."""
    return not person['id'].startswith('apple-') and (person['id'] == UNKNOWN_PERSON_ID or
        bool(person['name'].strip()) and not re.fullmatch(r'(?:persona|person)\s+\d+', person['name'].strip(), re.IGNORECASE))


def read_metadata(path, on_image=None):
    """Do not invent capture times or coordinates from filesystem timestamps."""
    with Image.open(path) as image:
        if image.width * image.height > 50_000_000:
            raise PhotoError('La foto supera el límite de 50 megapíxeles.')
        image.load()  # Validate bytes, not just the filename supplied by a browser.
        exif = image.getexif()
        try:
            camera = exif.get_ifd(34665)
        except (ValueError, TypeError, KeyError):
            camera = {}
        taken = camera.get(36867) or exif.get(36867) or exif.get(306)
        try:
            taken = datetime.strptime(str(taken), '%Y:%m:%d %H:%M:%S').isoformat()
            offset = camera.get(36881)
            if isinstance(offset, str) and len(offset) == 6 and offset[0] in '+-' and offset[3] == ':':
                datetime.fromisoformat(taken + offset)
                taken += offset
        except (ValueError, TypeError):
            taken = None
        latitude = longitude = None
        try:
            gps = exif.get_ifd(34853)
            def degrees(values):
                return float(values[0]) + float(values[1]) / 60 + float(values[2]) / 3600
            lat, lon = degrees(gps[2]), degrees(gps[4])
            if gps[1] in ('S', b'S'): lat = -lat
            if gps[3] in ('W', b'W'): lon = -lon
            if math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180:
                latitude, longitude = lat, lon
        except (ValueError, TypeError, KeyError, IndexError, ZeroDivisionError):
            pass
        metadata = {'takenAt': taken, 'latitude': latitude, 'longitude': longitude,
                    'width': image.width, 'height': image.height}
        if on_image: on_image(image)
        return metadata


def edit_image(path, style, credentials):
    """One explicit style per request; never send EXIF or the private key to clients."""
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source).convert('RGB')
        image.thumbnail((2048, 2048))
        buffer = io.BytesIO()
        image.save(buffer, 'JPEG', quality=92)
    payload = {
        'model': os.environ.get('MINITV_PHOTO_IMAGE_MODEL', 'gpt-image-2'),
        'images': [{'image_url': 'data:image/jpeg;base64,' + base64.b64encode(buffer.getvalue()).decode('ascii')}],
        'prompt': ('Transform the reference photo into ' + STYLES[style] + '. Preserve the people, '
                   'composition and main objects. Return a single finished image, with no text or collage.'),
        'n': 1, 'size': '1024x1024', 'quality': 'medium', 'output_format': 'png',
    }
    req = urllib.request.Request('https://api.openai.com/v1/images/edits',
        data=json.dumps(payload).encode(), headers={'Authorization': 'Bearer ' + credentials['apiKey'],
                                                   'Content-Type': 'application/json'}, method='POST')
    try:
        with track_call(credentials, payload['model'], 'image', 'images/edits') as meter:
            try:
                with urllib.request.urlopen(req, timeout=300) as response:
                    meter.response(getattr(response, 'status', None), getattr(response, 'headers', None))
                    raw = response.read(32 * 1024 * 1024 + 1)
            except urllib.error.HTTPError as error:
                meter.response(error.code, error.headers)
                raise
            if len(raw) > 32 * 1024 * 1024:
                raise ValueError()
            result = json.loads(raw)
            meter.payload = result
            return base64.b64decode(result['data'][0]['b64_json'], validate=True)
    except urllib.error.HTTPError as error:
        messages = {401: 'Revisa la clave de OpenAI en el Dashboard.', 403: 'La cuenta no tiene acceso al modelo de imágenes.',
                    429: 'OpenAI ha alcanzado el límite de uso o cuota. Reintenta más tarde.',
                    400: 'OpenAI no ha aceptado esta imagen o solicitud.'}
        raise PhotoError(messages.get(error.code, 'OpenAI no pudo generar la variante. Reintenta más tarde.'), 502) from None
    except (OSError, ValueError, KeyError, IndexError, TypeError):
        raise PhotoError('No se recibió una imagen válida de OpenAI. Puedes reintentar las pendientes.', 502) from None


class PhotoLibrary:
    def __init__(self, root, settings=None):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.cache = self.root.parent / 'PhotoCache'
        self.cache.mkdir(exist_ok=True)
        self.path = self.root.parent / 'photo_library.sqlite3'
        self.settings = settings
        self.revision = uuid.uuid4().hex
        self.lock = threading.RLock()
        # Full-resolution decoders can consume hundreds of MB per image.
        self.image_lock = ImageWorkLock()
        self.previews = PhotoPreviews(self.root, self.cache, self.image_lock)
        self.places = PhotoPlaces(self.cache)
        self.face_lock = threading.Lock()
        self.face_stop = threading.Event()
        self.scan_lock = threading.Lock()
        self.scanning = False
        self.scan_error = ''
        self.last_scan = 0
        self.faces_running = False
        self.single_face_running = False
        self.face_error = ''
        with self.db() as db:
            db.executescript('''
              CREATE TABLE IF NOT EXISTS folders (id TEXT PRIMARY KEY, parent TEXT NOT NULL,
                name TEXT NOT NULL, created REAL NOT NULL, UNIQUE(parent, name));
              CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, path TEXT UNIQUE NOT NULL,
                folder TEXT NOT NULL REFERENCES folders(id), name TEXT NOT NULL, uploaded REAL NOT NULL,
                modified REAL NOT NULL, size INTEGER NOT NULL, metadata TEXT NOT NULL,
                source TEXT, style TEXT, face_state TEXT NOT NULL DEFAULT 'pending', UNIQUE(source, style));
              CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, name TEXT NOT NULL, created REAL NOT NULL);
              CREATE TABLE IF NOT EXISTS faces (photo TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
                person TEXT NOT NULL REFERENCES people(id), encoding TEXT NOT NULL, PRIMARY KEY(photo, person));
              CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, folder TEXT NOT NULL, state TEXT NOT NULL,
                total INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '', created REAL NOT NULL);
              CREATE INDEX IF NOT EXISTS photos_folder ON photos(folder);
              CREATE INDEX IF NOT EXISTS faces_person ON faces(person);
              CREATE TABLE IF NOT EXISTS photo_import_sessions (id TEXT PRIMARY KEY, folder TEXT NOT NULL REFERENCES folders(id));
              CREATE TABLE IF NOT EXISTS photo_import_batches (session TEXT NOT NULL, batch TEXT NOT NULL,
                result TEXT NOT NULL, PRIMARY KEY(session, batch));
              CREATE TABLE IF NOT EXISTS photo_import_files (digest TEXT PRIMARY KEY, photo TEXT NOT NULL REFERENCES photos(id));
              CREATE TABLE IF NOT EXISTS photo_metadata (photo TEXT PRIMARY KEY REFERENCES photos(id), data TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS photo_albums (photo TEXT NOT NULL REFERENCES photos(id),
                folder TEXT NOT NULL REFERENCES folders(id), PRIMARY KEY(photo, folder));
              CREATE TABLE IF NOT EXISTS photo_library_migrations (name TEXT PRIMARY KEY);
              CREATE TABLE IF NOT EXISTS photo_deleted_files (path TEXT PRIMARY KEY);
              CREATE TABLE IF NOT EXISTS person_covers (person TEXT PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
                photo TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE);
              CREATE TABLE IF NOT EXISTS person_birthdays (person TEXT PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
                birth_date TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS person_review_batches (id TEXT PRIMARY KEY, payload TEXT NOT NULL, result TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS photo_review_batches (id TEXT PRIMARY KEY, payload TEXT NOT NULL, result TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS photo_edit_sources (photo TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
                path TEXT PRIMARY KEY);
              CREATE TABLE IF NOT EXISTS face_analysis (id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL,
                error TEXT NOT NULL DEFAULT '');
              INSERT OR IGNORE INTO face_analysis (id, state) VALUES (1, 'idle');
              CREATE TABLE IF NOT EXISTS face_analysis_items (photo TEXT PRIMARY KEY, state TEXT NOT NULL);
              CREATE INDEX IF NOT EXISTS face_analysis_state ON face_analysis_items(state);
              CREATE TABLE IF NOT EXISTS face_detections (
                id TEXT PRIMARY KEY, photo TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
                person TEXT REFERENCES people(id), encoding TEXT NOT NULL, box TEXT,
                manual INTEGER NOT NULL DEFAULT 0);
              CREATE INDEX IF NOT EXISTS face_detections_photo ON face_detections(photo);
              CREATE TABLE IF NOT EXISTS face_rejections (
                id TEXT PRIMARY KEY, photo TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
                encoding TEXT NOT NULL, box TEXT);
              CREATE INDEX IF NOT EXISTS face_rejections_photo ON face_rejections(photo);
              CREATE TABLE IF NOT EXISTS face_photo_jobs (
                photo TEXT PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
                state TEXT NOT NULL, error TEXT NOT NULL DEFAULT '');
            ''')
            for ident, name in [('gallery', 'Galería'), ('albums', 'Álbumes personales'), ('ai', 'Diviértete con la IA')]:
                db.execute('INSERT OR IGNORE INTO folders VALUES (?, ?, ?, ?)', (ident, '', name, time.time()))
            db.execute('INSERT OR IGNORE INTO people VALUES (?,?,?)', (UNKNOWN_PERSON_ID, 'Desconocido', 0))
            self._migrate_gallery(db)
            # An interrupted scan is resumed explicitly, preserving its queue and progress.
            db.execute("UPDATE face_analysis SET state='paused' WHERE state='running'")
            db.execute("UPDATE face_photo_jobs SET state='paused' WHERE state='running'")
            self._migrate_face_boxes(db)
            photo_reviews.initialize(db)
            db.execute("UPDATE jobs SET state='interrupted', error='Se interrumpió la generación. Reintenta las variantes pendientes.' WHERE state='running'")
        self.cleanup_deleted()

    def _migrate_face_boxes(self, db):
        if db.execute("SELECT 1 FROM photo_library_migrations WHERE name='face-boxes-v1'").fetchone(): return
        for face in db.execute("SELECT * FROM faces WHERE encoding!='[]'").fetchall():
            db.execute('INSERT INTO face_detections (id, photo, person, encoding) VALUES (?,?,?,?)',
                       (uuid.uuid4().hex, face['photo'], face['person'], face['encoding']))
        # Old detections have no location. A future explicit batch obtains boxes,
        # while the existing groups/names remain available until then.
        db.execute("UPDATE photos SET face_state='pending' WHERE source IS NULL AND id IN (SELECT photo FROM face_detections WHERE box IS NULL)")
        if db.execute('SELECT count(*) FROM face_analysis_items').fetchone()[0] > FACE_BATCH_SIZE:
            db.execute('DELETE FROM face_analysis_items')
            db.execute("UPDATE face_analysis SET state='idle', error='' WHERE id=1")
        db.execute("INSERT INTO photo_library_migrations VALUES ('face-boxes-v1')")

    def _migrate_gallery(self, db):
        if db.execute("SELECT 1 FROM photo_library_migrations WHERE name='gallery-v1'").fetchone(): return
        folders = [dict(row) for row in db.execute('SELECT * FROM folders')]
        removed = {'uploads'}
        # Flatten Uploads and any old Gallery hierarchy without deleting image bytes.
        while True:
            children = {f['id'] for f in folders if f['parent'] in removed | {'gallery'}}
            if children <= removed: break
            removed |= children
        for folder in folders:
            if folder['id'] in removed or folder['id'] in {'gallery', 'albums', 'ai'}: continue
            if not folder['parent']:
                name, suffix = folder['name'], 1
                while db.execute('SELECT 1 FROM folders WHERE parent=? AND name=?', ('albums', name)).fetchone():
                    suffix += 1; name = folder['name'][:90] + ' (' + str(suffix) + ')'
                db.execute('UPDATE folders SET parent=?, name=? WHERE id=?', ('albums', name, folder['id']))
            db.execute('INSERT OR IGNORE INTO photo_albums SELECT id, folder FROM photos WHERE folder=?', (folder['id'],))
        db.execute("UPDATE photos SET folder='gallery'")
        for ident in removed | {'gallery'}:
            db.execute('DELETE FROM photo_albums WHERE folder=?', (ident,))
            db.execute("UPDATE photo_import_sessions SET folder='gallery' WHERE folder=?", (ident,))
        for row in db.execute('SELECT session, batch, result FROM photo_import_batches').fetchall():
            result = json.loads(row['result'])
            if result.get('folderId') in removed:
                result['folderId'] = 'gallery'
                db.execute('UPDATE photo_import_batches SET result=? WHERE session=? AND batch=?',
                           (json.dumps(result), row['session'], row['batch']))
        for ident in removed:
            db.execute('DELETE FROM jobs WHERE folder=?', (ident,))
            db.execute('DELETE FROM folders WHERE id=?', (ident,))
        db.execute("INSERT INTO photo_library_migrations VALUES ('gallery-v1')")

    @contextmanager
    def db(self):
        # The process lock also makes multi-step moves and imports atomic across workers.
        with self.lock:
            connection = sqlite3.connect(self.path, timeout=30)
            connection.row_factory = sqlite3.Row
            connection.execute('PRAGMA foreign_keys=ON')
            try:
                with connection:
                    yield connection
                if connection.total_changes:
                    self.revision = uuid.uuid4().hex
            finally:
                connection.close()

    def safe_file(self, relative, db=None):
        if not isinstance(relative, str) or not relative or '\\' in relative:
            raise PhotoError('Ruta de foto inválida.')
        path = Path(relative)
        if path.is_absolute() or any(part.startswith('.') for part in path.parts):
            raise PhotoError('Ruta de foto inválida.')
        target = (self.root / path).resolve()
        if not target.is_relative_to(self.root) or target.suffix.lower() not in EXTENSIONS:
            raise PhotoError('Ruta de foto inválida.')
        if not target.is_file():
            raise PhotoError('No se encuentra la foto.', 404)
        if db is None:
            with self.db() as connection:
                return self.safe_file(relative, db=connection)
        if db.execute('SELECT 1 FROM photo_deleted_files WHERE path=?', (target.relative_to(self.root).as_posix(),)).fetchone():
            raise PhotoError('No se encuentra la foto.', 404)
        return target

    def folder(self, db, ident):
        if not isinstance(ident, str): raise PhotoError('Carpeta inválida.')
        row = db.execute('SELECT * FROM folders WHERE id=?', (ident,)).fetchone()
        if not row: raise PhotoError('No se encuentra la carpeta.', 404)
        return dict(row)

    def create_folder(self, name, parent='albums', db=None):
        if db is None:
            with self.db() as connection:
                return self.create_folder(name, parent, connection)
        name = clean_name(name)
        if parent == '': parent = 'albums'
        self.folder(db, parent)
        if self.folder_root(db, parent) not in {'albums', 'ai'}:
            raise PhotoError('Crea las carpetas en Álbumes personales. Galería no tiene subcarpetas.')
        if db.execute('SELECT 1 FROM folders WHERE parent=? AND lower(name)=lower(?)', (parent, name)).fetchone():
            raise PhotoError('Ya existe una carpeta con ese nombre.', 409)
        ident = uuid.uuid4().hex
        db.execute('INSERT INTO folders VALUES (?, ?, ?, ?)', (ident, parent, name, time.time()))
        return self.folder(db, ident)

    def folder_root(self, db, ident):
        visited = set()
        while ident not in visited:
            visited.add(ident)
            folder = self.folder(db, ident)
            if not folder['parent']: return ident
            ident = folder['parent']
        raise PhotoError('La jerarquía de carpetas no es válida.')

    def _insert(self, db, relative, folder, name, uploaded=None, source=None, style=None, metadata=None):
        path = self.safe_file(relative)
        if metadata is None:
            metadata = read_metadata(path)
        stat = path.stat()
        ident = uuid.uuid4().hex
        db.execute('INSERT INTO photos VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            (ident, relative, 'gallery', name, uploaded or time.time(), stat.st_mtime, stat.st_size,
             json.dumps(metadata), source, style, 'skip' if source else 'pending'))
        if folder != 'gallery': db.execute('INSERT OR IGNORE INTO photo_albums VALUES (?,?)', (ident, folder))
        return ident

    def _imported_file(self, db, digest):
        row = db.execute('SELECT p.* FROM photo_import_files f JOIN photos p ON p.id=f.photo WHERE f.digest=?', (digest,)).fetchone()
        if row:
            try:
                stat = self.safe_file(row['path']).stat()
                if stat.st_size == row['size'] and stat.st_mtime == row['modified']: return row
            except (FileNotFoundError, PhotoError):
                pass
        return None

    def check_import(self, digests):
        validate_import_digests(digests)
        with self.db() as db:
            # Indexed lookups and file stats only; never decode photos or load the library.
            return {'missing': [index for index, digest in enumerate(digests) if not self._imported_file(db, digest)]}

    def upload(self, files, album_name='', folder_id='', parent='gallery', import_data=None):
        if len(files) > 500 or (not files and import_data is None):
            raise PhotoError('Selecciona entre 1 y 500 fotos por subida.')
        records, digests = None, None
        file_indices = list(range(len(files)))
        if import_data is not None:
            try:
                if not isinstance(import_data, dict) or len(files) > 20: raise ValueError('Lote de importación inválido.')
                session, batch_id = import_data.get('session'), import_data.get('batch')
                if any(not isinstance(v, str) or not v or len(v) > 100 for v in (session, batch_id)):
                    raise ValueError('Identificador de importación inválido.')
                if 'digests' in import_data:
                    digests = validate_import_digests(import_data['digests'])
                    file_indices = import_data.get('fileIndices')
                    if (not isinstance(file_indices, list) or len(file_indices) != len(files)
                            or any(type(index) is not int or not 0 <= index < len(digests) for index in file_indices)
                            or len(set(file_indices)) != len(file_indices)):
                        raise ValueError('Índices de archivos inválidos.')
                elif not files:
                    raise ValueError('Selecciona las fotos que quieres importar.')
                records = validate_import_records(import_data.get('records'), len(digests) if digests else len(files))
            except (ValueError, TypeError, OverflowError, RecursionError) as error:
                raise PhotoError(str(error) or 'Metadatos inválidos.') from None
            with self.db() as db:
                previous = db.execute('SELECT result FROM photo_import_batches WHERE session=? AND batch=?', (session, batch_id)).fetchone()
                if previous: return json.loads(previous['result'])
        # Only the import wizard opts into per-image failures; other uploads stay atomic.
        continue_on_error = records is not None and import_data.get('continueOnError') is True
        geolocated_only = records is not None and import_data.get('geolocatedOnly') is True
        if geolocated_only:
            if any(not all(isinstance(meta.get(key), (int, float)) and not isinstance(meta.get(key), bool)
                           and math.isfinite(meta[key]) and abs(meta[key]) <= limit
                           for key, limit in [('latitude', 90), ('longitude', 180)]) for meta, _, _ in records):
                raise PhotoError('Esta importación solo admite fotos con coordenadas válidas en sus metadatos.', 422)
            folder_id = 'gallery'
        if folder_id == 'uploads': folder_id = 'gallery'
        if parent == 'uploads': parent = 'gallery'
        # Stage and validate inputs before taking the catalogue lock.
        batch = self.root / ('batch-' + uuid.uuid4().hex)
        batch.mkdir()
        staged, rejected = [], []
        committed = False
        try:
            for index, uploaded in zip(file_indices, files):
                name = str(uploaded.filename or '').replace('\\', '/').split('/')[-1]
                if not name or Path(name).suffix.lower() not in EXTENSIONS or len(name) > 240:
                    raise PhotoError('La selección contiene un formato no compatible: ' + name[:100])
                path = batch / (uuid.uuid4().hex + Path(name).suffix.lower())
                hasher = hashlib.sha256()
                with path.open('xb') as handle:
                    count = 0
                    while True:
                        chunk = uploaded.stream.read(1024 * 1024)
                        if not chunk: break
                        count += len(chunk)
                        if count > MAX_FILE_BYTES: raise PhotoError('Una foto supera el límite de 50 MB.', 413)
                        handle.write(chunk)
                        if hasher is not None: hasher.update(chunk)
                digest = hasher.hexdigest() if hasher is not None else None
                if digests and digest != digests[index]:
                    raise PhotoError('La foto ha cambiado durante la importación. Vuelve a seleccionar la carpeta.', 422)
                try:
                    with self.image_lock:
                        metadata = read_metadata(path, on_image=lambda image: self.previews.save(path, image))
                except (OSError, ValueError, Image.DecompressionBombError) as error:
                    # Storage/permission failures require a retry, not a skipped photo.
                    if isinstance(error, OSError) and error.errno is not None: raise
                    message = str(error) if isinstance(error, PhotoError) else 'No se puede leer ' + name + '. El archivo está incompleto, dañado o su formato no es compatible.'
                    if Path(name).suffix.lower() in {'.heic', '.heif'}:
                        message += ' Comprueba el soporte HEIC (pillow-heif) en la MiniTV.'
                    if not continue_on_error:
                        raise PhotoError(message) from None
                    rejected.append({'index': index, 'name': name, 'error': message})
                    self.previews.discard(path)
                    path.unlink()
                    continue
                staged.append((index, path, name, metadata, digest))
            with self.db() as db:
                # A lost response or simultaneous retry must not create a second album.
                previous = db.execute('SELECT result FROM photo_import_batches WHERE session=? AND batch=?', (session, batch_id)).fetchone() if records is not None else None
                if previous:
                    for _, path, _, _, _ in staged:
                        self.previews.discard(path)
                        path.unlink()
                    batch.rmdir()
                    return json.loads(previous['result'])
                if digests:
                    for index, digest in enumerate(digests):
                        if index in file_indices: continue
                        if not self._imported_file(db, digest):
                            raise PhotoError('Una foto ya no está guardada. Reintenta para enviarla.', 409)
                        staged.append((index, None, None, None, digest))
                    staged.sort(key=lambda item: item[0])
                existing_session = db.execute('SELECT folder FROM photo_import_sessions WHERE id=?', (session,)).fetchone() if records is not None else None
                if existing_session:
                    folder = self.folder(db, existing_session['folder'])
                elif folder_id:
                    folder = self.folder(db, folder_id)
                    if folder_id in ('albums', 'ai'): raise PhotoError('Selecciona o crea un álbum.')
                else:
                    folder = self.folder(db, 'gallery') if parent == 'gallery' else self.create_folder(album_name, parent, db)
                if records is not None:
                    db.execute('INSERT OR IGNORE INTO photo_import_sessions VALUES (?,?)', (session, folder['id']))
                saved, duplicates, discarded = [], 0, []
                for index, path, name, image_metadata, digest in staged:
                    existing = self._imported_file(db, digest) if digest else None
                    if existing:
                        ident = existing['id']; duplicates += 1
                        if path is not None: discarded.append(path)
                        relative = existing['path']
                        if folder['id'] != 'gallery': db.execute('INSERT OR IGNORE INTO photo_albums VALUES (?,?)', (ident, folder['id']))
                    else:
                        if path is None: raise PhotoError('Una foto ya no está guardada. Reintenta para enviarla.', 409)
                        relative = path.relative_to(self.root).as_posix()
                        ident = self._insert(db, relative, folder['id'], name, metadata=image_metadata)
                        if digest: db.execute('INSERT OR REPLACE INTO photo_import_files VALUES (?,?)', (digest, ident))
                    saved.append(relative)
                    if records is not None:
                        metadata, raw, _people = records[index]
                        if raw is not None:
                            current = json.loads(db.execute('SELECT metadata FROM photos WHERE id=?', (ident,)).fetchone()['metadata'])
                            dimensions = {k: current[k] for k in ('width', 'height') if k in current} if db.execute('SELECT 1 FROM photo_edit_sources WHERE photo=?', (ident,)).fetchone() else {}
                            current.update(metadata)
                            current.update(dimensions)
                            db.execute('UPDATE photos SET metadata=? WHERE id=?', (json.dumps(current), ident))
                            db.execute('INSERT OR REPLACE INTO photo_metadata VALUES (?,?)', (ident, raw))
                            # Apple labels remain in the original metadata only. People
                            # always comes from local analysis, including reimports.
                            if not geolocated_only and import_data.get('preserveAlbums') is True:
                                for album in metadata['albums']:
                                    # Keep the full Apple name in metadata; folder names follow app constraints.
                                    album_name_safe = ''.join(c if c not in '/\\' and ord(c) >= 32 else ' · ' for c in album).strip()[:100]
                                    if album_name_safe in ('', '.', '..'): continue
                                    album_parent = 'albums' if folder['id'] == 'gallery' else folder['id']
                                    found = db.execute('SELECT id FROM folders WHERE parent=? AND lower(name)=lower(?)', (album_parent, album_name_safe)).fetchone()
                                    album_id = found['id'] if found else self.create_folder(album_name_safe, album_parent, db)['id']
                                    db.execute('INSERT OR IGNORE INTO photo_albums VALUES (?,?)', (ident, album_id))
                result = {'ok': True, 'folderId': folder['id'], 'saved': saved,
                          'imported': len(staged) - duplicates, 'duplicates': duplicates}
                if continue_on_error: result['rejected'] = rejected
                if records is not None:
                    db.execute('INSERT INTO photo_import_batches VALUES (?,?,?)', (session, batch_id, json.dumps(result)))
            committed = True
            for path in discarded:
                self.previews.discard(path)
                path.unlink(missing_ok=True)
            if not any(batch.iterdir()): batch.rmdir()
            return result
        except Exception:
            if not committed and batch.exists():
                for path in batch.iterdir():
                    self.previews.discard(path)
                    path.unlink()
                batch.rmdir()
            raise

    def sync(self, reserved=False):
        """Adopt pre-existing files without moving or overwriting them."""
        if not reserved and not self.scan_lock.acquire(blocking=False): return
        self.scanning = True
        self.scan_error = ''
        try:
            with self.db() as db:
                known = {row['path'] for row in db.execute('SELECT path FROM photos')}
                known.update(row['path'] for row in db.execute('SELECT path FROM photo_deleted_files'))
                known.update(row['path'] for row in db.execute('SELECT path FROM photo_edit_sources'))
            for root, dirs, files in os.walk(self.root, followlinks=False):
                dirs[:] = sorted(d for d in dirs if not d.startswith(('.', 'batch-', 'generated-', 'edited-photos')) and not (Path(root) / d).is_symlink())
                for name in sorted(files):
                    path = Path(root) / name
                    relative = path.relative_to(self.root).as_posix()
                    if relative in known or name.startswith('.') or path.suffix.lower() not in EXTENSIONS or path.is_symlink(): continue
                    try:
                        with self.image_lock:
                            metadata = read_metadata(path, on_image=lambda image: self.previews.save(path, image))
                        with self.db() as db:
                            if db.execute('SELECT 1 FROM photos WHERE path=?', (relative,)).fetchone(): continue
                            if db.execute('SELECT 1 FROM photo_deleted_files WHERE path=?', (relative,)).fetchone(): continue
                            stat = path.stat()
                            db.execute('INSERT INTO photos VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                                (uuid.uuid4().hex, relative, 'gallery', name, stat.st_mtime, stat.st_mtime, stat.st_size,
                                 json.dumps(metadata), None, None, 'pending'))
                    except (OSError, ValueError, Image.DecompressionBombError):
                        self.scan_error = 'Algunas fotos no se pudieron leer. Revisa sus formatos y el soporte HEIC.'
            self.last_scan = time.monotonic()
        finally:
            self.scanning = False
            self.scan_lock.release()

    def start_sync(self):
        if time.monotonic() - self.last_scan > 60 and self.scan_lock.acquire(blocking=False):
            # Advertise pending work before the initial library response is sent.
            self.scanning = True
            threading.Thread(target=self.sync, kwargs={'reserved': True}, daemon=True).start()

    def status(self, db=None):
        if db is None:
            with self.db() as connection:
                return self.status(connection)
        # A small state probe: no photo rows, face vectors, JSON metadata or scan.
        running_job = bool(db.execute("SELECT EXISTS(SELECT 1 FROM jobs WHERE state='running')").fetchone()[0])
        state = [self.revision, self.scanning, self.scan_error, self.faces_running, self.single_face_running, self.face_error]
        return {'revision': hashlib.sha256(json.dumps(state).encode()).hexdigest(),
                'working': self.scanning or self.faces_running or self.single_face_running or running_job}

    def snapshot(self):
        with self.db() as db:
            status = self.status(db)
            folders = [dict(row) for row in db.execute('SELECT * FROM folders ORDER BY created, name')]
            photos = []
            memberships = {}
            face_counts = dict(db.execute('SELECT photo, count(*) FROM face_detections GROUP BY photo').fetchall())
            for member in db.execute('SELECT photo, folder FROM photo_albums'):
                memberships.setdefault(member['photo'], []).append(member['folder'])
            for row in db.execute('SELECT * FROM photos ORDER BY uploaded DESC, name'):
                photos.append({'id': row['id'], 'relativePath': row['path'], 'folderId': row['folder'],
                    'folderIds': memberships.get(row['id'], []),
                    'name': row['name'], 'uploadedAt': row['uploaded'], 'modifiedAt': row['modified'],
                    'size': row['size'], 'sourceId': row['source'], 'style': row['style'], **json.loads(row['metadata']),
                    'faceState': row['face_state'], 'faceCount': face_counts.get(row['id'], 0)})
            people = [dict(row) for row in db.execute("""SELECT p.*, b.birth_date AS birthDate, c.photo AS coverPhotoId
                FROM people p LEFT JOIN person_birthdays b ON b.person=p.id LEFT JOIN person_covers c ON c.person=p.id
                WHERE p.id=? OR p.id IN (SELECT person FROM faces WHERE encoding!='[]' OR person NOT LIKE 'apple-%')
                ORDER BY p.id=?, p.created""", (UNKNOWN_PERSON_ID, UNKNOWN_PERSON_ID))]
            person_photos = {}
            for row in db.execute("SELECT person, photo FROM faces WHERE encoding!='[]' OR person NOT LIKE 'apple-%' ORDER BY person, photo"):
                person_photos.setdefault(row['person'], []).append(row['photo'])
            for person in people:
                person['photoIds'] = person_photos.get(person['id'], [])
                person['birthDate'] = person['birthDate'] or ''
            portraits, face_boxes = {}, {}
            # Lightweight rectangles for checking each match, plus the preferred cover.
            # Never send facial encodings.
            for row in db.execute('''SELECT f.id, f.person, f.photo, f.box, c.photo AS chosen_cover FROM face_detections f
                    LEFT JOIN person_covers c ON c.person=f.person
                    WHERE f.person IS NOT NULL AND f.box IS NOT NULL
                    ORDER BY f.person, (f.photo=c.photo) DESC, f.photo, f.manual DESC, f.rowid'''):
                box = json.loads(row['box'])
                face_boxes.setdefault(row['person'], {}).setdefault(row['photo'], []).append({'id': row['id'], 'box': box})
                if row['person'] not in portraits and (row['chosen_cover'] is None or row['photo'] == row['chosen_cover']):
                    portraits[row['person']] = {'id': row['id'], 'photoId': row['photo'], 'box': box}
            for person in people:
                person['coverPhotoId'] = person['coverPhotoId'] if person['coverPhotoId'] in person['photoIds'] else None
                person['coverFace'] = portraits.get(person['id'])
                person['faceBoxes'] = face_boxes.get(person['id'], {})
            jobs = [dict(row) for row in db.execute('SELECT * FROM jobs ORDER BY created DESC LIMIT 20')]
            faces = self.face_status(db)
            reviews = photo_reviews.pending(db)
            known_people = [dict(row) for row in db.execute("SELECT id, name FROM people WHERE id NOT LIKE 'apple-%' ORDER BY id=? DESC, name, id", (UNKNOWN_PERSON_ID,))
                            if is_identified_person(row)]
        try:
            configured = self.settings.public() if self.settings else {}
        except Exception:
            configured = {}  # A broken AI setting must not hide the photo library.
        return {**status, 'folders': folders, 'photos': photos, 'people': people, 'jobs': jobs,
                'scanning': self.scanning, 'scanError': self.scan_error,
                'aiReady': bool(configured.get('enabled') and configured.get('configured')),
                'faces': faces, 'knownPeople': known_people, 'reviews': reviews}

    def update_photo_metadata(self, photo_id, data, db=None):
        if db is None:
            with self.db() as connection:
                return self.update_photo_metadata(photo_id, data, db=connection)
        if not isinstance(data, dict) or not data or set(data) - {'takenAt', 'latitude', 'longitude'}:
            raise PhotoError('Indica una fecha o ubicación válida.')
        if 'takenAt' in data:
            value = data['takenAt']
            if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
                raise PhotoError('Selecciona una fecha válida.')
            try:
                datetime.fromisoformat(value)
            except ValueError:
                raise PhotoError('Selecciona una fecha válida.')
        if 'latitude' in data or 'longitude' in data:
            for key, limit in [('latitude', 90), ('longitude', 180)]:
                value = data.get(key)
                if type(value) not in (int, float) or not math.isfinite(value) or not -limit <= value <= limit:
                    raise PhotoError('Selecciona una ubicación válida.')
        row = db.execute('SELECT metadata FROM photos WHERE id=?', (photo_id,)).fetchone()
        if not row:
            raise PhotoError('Esta foto ya no está disponible. Actualiza la biblioteca.', 404)
        metadata = json.loads(row['metadata'])
        patch = dict(data)
        if 'takenAt' in patch:
            previous = metadata.get('takenAt')
            if isinstance(previous, str) and re.match(r'\d{4}-\d{2}-\d{2}T', previous):
                patch['takenAt'] += previous[10:]
        metadata.update(patch)
        db.execute('UPDATE photos SET metadata=? WHERE id=?', (json.dumps(metadata), photo_id))
        return {'ok': True, 'metadata': metadata}

    def move(self, ids, target='', new_name=None, parent=''):
        """Compatibility endpoint: adding an album reference never moves an original."""
        with self.db() as db:
            ids = self.validate_photo_ids(db, ids)
            if new_name is not None: target = self.create_folder(new_name, parent, db)['id']
            self.folder(db, target)
            if target in ('gallery', 'albums', 'ai') or self.folder_root(db, target) not in {'albums', 'ai'}:
                raise PhotoError('Selecciona un álbum para añadir las referencias.')
            db.executemany('INSERT OR IGNORE INTO photo_albums VALUES (?,?)', [(ident, target) for ident in ids])
        return {'ok': True, 'folderId': target, 'added': len(ids)}

    def validate_photo_ids(self, db, ids):
        if not isinstance(ids, list) or not ids or len(ids) > 5000 or any(not isinstance(i, str) for i in ids):
            raise PhotoError('Selecciona entre 1 y 5000 fotos.')
        ids = list(dict.fromkeys(ids))
        for ident in ids:
            if not db.execute('SELECT 1 FROM photos WHERE id=?', (ident,)).fetchone():
                raise PhotoError('Una foto ya no está disponible. Actualiza la biblioteca.', 409)
        return ids

    def delete_photos(self, ids, scope, folder_id=None):
        if not isinstance(scope, str) or scope not in {'gallery', 'album'}:
            raise PhotoError('Indica si quieres quitar referencias o borrar de Galería.')
        # Serialize with preview decoders. The tombstones survive failed unlinks or
        # a power loss, so scans and old content URLs cannot resurrect deleted photos.
        with self.image_lock:
            with self.db() as db:
                ids = self.validate_photo_ids(db, ids)
                if scope == 'album':
                    self.folder(db, folder_id)
                    if folder_id in {'gallery', 'albums', 'ai'}: raise PhotoError('Selecciona un álbum.')
                    for ident in ids:
                        if not db.execute('SELECT 1 FROM photo_albums WHERE photo=? AND folder=?', (ident, folder_id)).fetchone():
                            raise PhotoError('Una referencia ya no está en este álbum. Actualiza la biblioteca.', 409)
                    db.executemany('DELETE FROM photo_albums WHERE photo=? AND folder=?', [(ident, folder_id) for ident in ids])
                    return {'ok': True, 'removed': len(ids)}
                self._delete_photo_rows(db, ids)
            pending = self.cleanup_deleted()
        return {'ok': True, 'deleted': len(ids), 'cleanupPending': pending}

    def _delete_photo_rows(self, db, ids):
        for ident in ids:
            db.execute('INSERT OR IGNORE INTO photo_deleted_files SELECT path FROM photos WHERE id=?', (ident,))
            db.execute('INSERT OR IGNORE INTO photo_deleted_files SELECT path FROM photo_edit_sources WHERE photo=?', (ident,))
            for table in ('photo_albums', 'photo_metadata', 'photo_import_files'):
                db.execute('DELETE FROM ' + table + ' WHERE photo=?', (ident,))
            db.execute('DELETE FROM photos WHERE id=?', (ident,))  # Cascades to faces.
        db.execute('''DELETE FROM photo_import_batches WHERE EXISTS (
            SELECT 1 FROM json_each(photo_import_batches.result, '$.saved') saved
            JOIN photo_deleted_files deleted ON deleted.path=saved.value)''')

    def cleanup_deleted(self):
        with self.db() as db:
            paths = [row['path'] for row in db.execute('SELECT path FROM photo_deleted_files')]
        pending = 0
        for relative in paths:
            path = self.root / relative
            try:
                if not path.resolve().is_relative_to(self.root) or path.is_symlink():
                    pending += 1; continue
                if path.exists():
                    self.previews.discard(path)
                    path.unlink()
            except OSError:
                pending += 1
        return pending

    def preview(self, relative, full=False, tiny=False):
        path = self.safe_file(relative)
        try:
            return self.previews.tiny(path) if tiny else self.previews.get(path, full)
        except (OSError, ValueError, Image.DecompressionBombError):
            raise PhotoError('No se puede crear la vista previa de esta foto.', 422) from None

    def start_previews(self):
        if self.previews.started: return
        with self.db() as db:
            rows = db.execute("SELECT path FROM photos ORDER BY json_extract(metadata, '$.takenAt') DESC, uploaded DESC").fetchall()
        # File stats and decoding happen in the worker, never in the library request.
        self.previews.start([row['path'] for row in rows], self.safe_file)

    def face_status(self, db):
        scan = db.execute('''SELECT state, error, (SELECT token FROM face_review_batch WHERE id=1) AS batchId,
            (SELECT json_group_array(photo) FROM face_analysis_items) AS batchPhotos
            FROM face_analysis WHERE id=1''').fetchone()
        counts = dict(db.execute('SELECT state, count(*) FROM face_analysis_items GROUP BY state').fetchall())
        total = sum(counts.values())
        done = total - counts.get('pending', 0)
        pending = db.execute("SELECT count(*) FROM photos WHERE source IS NULL AND face_state IN ('pending','skip','imported','error')").fetchone()[0]
        if scan['state'] == 'idle' and not total:
            total = min(FACE_BATCH_SIZE, pending)
        return {'batchId': scan['batchId'], 'available': LocalFaceEngine.available(), 'engine': 'dlib-local',
                'installCommand': INSTALL_COMMAND, 'lowPower': True, 'batchSize': total or FACE_BATCH_SIZE,
                'batchPhotoIds': json.loads(scan['batchPhotos']),
                'singleRunning': self.single_face_running,
                'state': scan['state'], 'running': self.faces_running,
                'pausing': scan['state'] == 'paused' and self.faces_running,
                'total': total, 'done': done, 'percent': int(done * 100 / total) if total else 0,
                'pending': pending, 'remaining': counts.get('pending', 0), 'failed': counts.get('error', 0),
                'error': scan['error']}

    def start_faces(self, limit=None):
        if limit is not None and (type(limit) is not int or limit < 1):
            raise PhotoError('Selecciona al menos una foto para analizar.')
        if not LocalFaceEngine.available():
            raise PhotoError('Instala el motor local de Personas: ' + INSTALL_COMMAND, 503)
        # Serialize transitions with worker exit, including a quick pause/resume.
        with self.lock:
            if self.single_face_running:
                raise PhotoError('Espera a que termine la foto seleccionada o pausa su análisis.', 409)
            with self.db() as db:
                scan = db.execute('SELECT state FROM face_analysis WHERE id=1').fetchone()
                remaining = db.execute("SELECT 1 FROM face_analysis_items WHERE state='pending' LIMIT 1").fetchone()
                if not self.faces_running and not (scan['state'] in ('running', 'paused', 'error') and remaining):
                    pending_count = db.execute("SELECT count(*) FROM photos WHERE source IS NULL AND face_state IN ('pending','skip','imported','error')").fetchone()[0]
                    if limit is not None and limit > pending_count:
                        raise PhotoError('El lote no puede superar las fotos pendientes.')
                    if not db.execute("SELECT 1 FROM photos WHERE source IS NULL AND face_state IN ('pending','skip','imported','error') LIMIT 1").fetchone():
                        if scan['state'] == 'idle': db.execute("UPDATE face_analysis SET state='complete' WHERE id=1")
                        return {'ok': True}
                    db.execute('DELETE FROM face_analysis_items')
                    db.execute("""INSERT INTO face_analysis_items SELECT id, 'pending' FROM photos
                        WHERE source IS NULL AND face_state IN ('pending','skip','imported','error')
                        ORDER BY (face_state='error'), uploaded, id LIMIT ?""", (limit or FACE_BATCH_SIZE,))
                    photo_reviews.start_batch(db)
                elif not db.execute('SELECT 1 FROM face_review_batch').fetchone():
                    # An upgrade may resume a batch that predates review tracking.
                    photo_reviews.start_batch(db)
                remaining = db.execute("SELECT 1 FROM face_analysis_items WHERE state='pending' LIMIT 1").fetchone()
                db.execute("UPDATE face_analysis SET state=?, error='' WHERE id=1", ('running' if remaining else 'complete',))
            self.face_error = ''
            if not remaining or self.faces_running: return {'ok': True}
            self.face_lock.acquire()
            self.face_stop.clear()
            self.faces_running = True
            try:
                threading.Thread(target=self._faces_worker, daemon=True).start()
            except Exception:
                self.faces_running = False
                self.face_lock.release()
                with self.db() as db: db.execute("UPDATE face_analysis SET state='paused' WHERE id=1")
                raise
        return {'ok': True}

    def pause_faces(self):
        with self.lock:
            self.face_stop.set()
            with self.db() as db:
                db.execute("UPDATE face_analysis SET state='paused' WHERE id=1 AND state='running'")
                db.execute("UPDATE face_photo_jobs SET state='paused' WHERE state='running'")
        return {'ok': True}

    def photo_faces(self, photo_id):
        with self.db() as db:
            photo = db.execute('SELECT face_state, source FROM photos WHERE id=?', (photo_id,)).fetchone()
            if not photo: raise PhotoError('No se encuentra la foto.', 404)
            detections = [dict(row) for row in db.execute('''SELECT f.id, f.person AS personId, p.name, f.box, f.manual
                FROM face_detections f LEFT JOIN people p ON p.id=f.person WHERE f.photo=? ORDER BY f.rowid''', (photo_id,))]
            reviews = {row['faceId']: row['id'] for row in photo_reviews.pending(db, photo_id)}
            for face in detections:
                face['box'] = json.loads(face['box']) if face['box'] else None
                face['manual'] = bool(face['manual'])
                face['reviewId'] = reviews.get(face['id'])
            job = db.execute('SELECT state, error FROM face_photo_jobs WHERE photo=?', (photo_id,)).fetchone()
            batch = db.execute("SELECT 1 FROM face_analysis_items WHERE photo=? AND state='pending'", (photo_id,)).fetchone()
            return {'photoId': photo_id, 'faces': detections, 'version': photo_review_batch.face_version(db, photo_id),
                    'state': photo['face_state'], 'noFacesReviewId': reviews.get(None),
                    'canDetect': photo['source'] is None and LocalFaceEngine.available(),
                    'scan': dict(job) if job else {'state': 'idle', 'error': ''},
                    'batchRunning': self.faces_running, 'queued': bool(batch)}

    def start_photo_faces(self, photo_id):
        if not LocalFaceEngine.available():
            raise PhotoError('Instala el motor local de Personas: ' + INSTALL_COMMAND, 503)
        with self.lock:
            if self.faces_running or self.single_face_running:
                raise PhotoError('Pausa el análisis en curso antes de detectar personas en esta foto.', 409)
            with self.db() as db:
                photo = db.execute('SELECT * FROM photos WHERE id=?', (photo_id,)).fetchone()
                if not photo: raise PhotoError('No se encuentra la foto.', 404)
                if photo['source'] is not None: raise PhotoError('Analiza la foto original.', 409)
                db.execute("""INSERT INTO face_photo_jobs VALUES (?,'running','')
                    ON CONFLICT(photo) DO UPDATE SET state='running', error=''""", (photo_id,))
            self.face_stop.clear()
            self.face_lock.acquire()
            self.single_face_running = True
            try:
                threading.Thread(target=self._single_faces_worker, args=(dict(photo),), daemon=True).start()
            except Exception:
                self.single_face_running = False
                self.face_lock.release()
                with self.db() as db: db.execute("UPDATE face_photo_jobs SET state='paused' WHERE photo=?", (photo_id,))
                raise
        return {'ok': True}

    def _single_faces_worker(self, photo):
        engine = LocalFaceEngine()
        try:
            temperature = self._face_temperature()
            if temperature is not None and temperature >= 75:
                raise PhotoError('Deja enfriar la Raspberry por debajo de 75 °C antes de continuar.')
            with self.image_lock.priority(2, cancel=self.face_stop) as acquired:
                if not acquired: raise FacePaused()
                detections = engine.encode(self.safe_file(photo['path']), self.face_stop)
            self.group_faces(photo['id'], detections, stop=self.face_stop, job='single')
        except FacePaused:
            with self.db() as db: db.execute("UPDATE face_photo_jobs SET state='paused' WHERE photo=?", (photo['id'],))
        except Exception as error:
            message = str(error) if isinstance(error, PhotoError) else 'No se pudo analizar esta foto. Revisa el archivo y el motor local.'
            with self.db() as db:
                db.execute("UPDATE face_photo_jobs SET state='error', error=? WHERE photo=?", (message, photo['id']))
        finally:
            engine.close()
            with self.lock:
                self.single_face_running = False
                self.face_lock.release()

    def _face_rest(self, elapsed):
        # At most half of one core on average, with an interruptible idle period.
        self.face_stop.wait(max(.25, elapsed))

    def _face_temperature(self):
        try:
            return int(Path('/sys/class/thermal/thermal_zone0/temp').read_text()) / 1000
        except (OSError, ValueError):
            return None

    def _faces_worker(self):
        engine = LocalFaceEngine()
        try:
            while not self.face_stop.is_set():
                temperature = self._face_temperature()
                if temperature is not None and temperature >= 75:
                    self.pause_faces()
                    with self.db() as db:
                        db.execute("UPDATE face_analysis SET error=? WHERE id=1",
                                   ('Pausa por temperatura (75 °C). Deja enfriar la Raspberry antes de continuar.',))
                    break
                with self.db() as db:
                    if db.execute('SELECT state FROM face_analysis WHERE id=1').fetchone()[0] != 'running': break
                    item = db.execute("SELECT photo FROM face_analysis_items WHERE state='pending' ORDER BY rowid LIMIT 1").fetchone()
                    if not item: break
                    photo = db.execute('SELECT * FROM photos WHERE id=?', (item['photo'],)).fetchone()
                    if not photo or photo['face_state'] == 'done':
                        db.execute("UPDATE face_analysis_items SET state='done' WHERE photo=?", (item['photo'],))
                        continue
                try:
                    started = time.monotonic()
                    with self.image_lock.priority(2, cancel=self.face_stop) as acquired:
                        if not acquired or self.face_stop.is_set(): break
                        encodings = engine.encode(self.safe_file(photo['path']), self.face_stop)
                    if self.face_stop.is_set(): break
                    self.group_faces(photo['id'], encodings, stop=self.face_stop, job='batch')
                except FacePaused:
                    break
                except (OSError, ValueError, RuntimeError):
                    with self.db() as db:
                        db.execute("UPDATE photos SET face_state='error' WHERE id=?", (photo['id'],))
                        db.execute("UPDATE face_analysis_items SET state='error' WHERE photo=?", (photo['id'],))
                self._face_rest(time.monotonic() - started)
        except Exception:
            self.face_error = 'No se pudo ejecutar el motor local. Revisa la instalación: ' + INSTALL_COMMAND
            with self.db() as db:
                db.execute("UPDATE face_analysis SET state='error', error=? WHERE id=1", (self.face_error,))
        finally:
            engine.close()
            with self.lock:
                with self.db() as db:
                    remaining = db.execute("SELECT 1 FROM face_analysis_items WHERE state='pending' LIMIT 1").fetchone()
                    if not remaining:
                        db.execute("UPDATE face_analysis SET state='complete' WHERE id=1 AND state!='error'")
                    resume = remaining and db.execute('SELECT state FROM face_analysis WHERE id=1').fetchone()[0] == 'running'
                self.faces_running = False
                self.face_lock.release()
                # Resume may arrive after the loop observes a pause but before exit.
                if resume: self.start_faces()

    def group_faces(self, photo_id, encodings, stop=None, job=None):
        # Reject the entire response before changing any saved face or job state.
        incoming = face_matching.validate_detections(encodings)
        def check_cancel():
            if stop is not None and stop.is_set(): raise FacePaused()
        for _attempt in range(5):
            check_cancel()
            with self.db() as db:
                photo = db.execute('SELECT metadata FROM photos WHERE id=?', (photo_id,)).fetchone()
                if not photo: return
                revision = self.revision
                review_batch, review_people = photo_reviews.context(db, photo_id)
                references = [] if not incoming else [dict(row) for row in db.execute("""SELECT person, photo, encoding, manual
                    FROM face_detections WHERE person IS NOT NULL AND person!=? AND encoding!='[]' AND photo!=?""",
                    (UNKNOWN_PERSON_ID, photo_id))]
                previous = [dict(row) for row in db.execute('SELECT * FROM face_detections WHERE photo=?', (photo_id,))]
                cover_people = {row[0] for row in db.execute('SELECT person FROM person_covers WHERE photo=?', (photo_id,))}
                rejections = [dict(row) for row in db.execute('SELECT * FROM face_rejections WHERE photo=?', (photo_id,))]
                birthdays = dict(db.execute('SELECT person, birth_date FROM person_birthdays'))
            # JSON decoding and all vector comparisons happen without the API's
            # catalogue lock. A concurrent correction invalidates the snapshot.
            for face in previous + rejections:
                face['encoding'] = json.loads(face['encoding'])
                face['box'] = json.loads(face['box']) if face['box'] else None
            taken = json.loads(photo['metadata']).get('takenAt')
            try:
                taken = datetime.fromisoformat(taken).date().isoformat()
            except (TypeError, ValueError):
                taken = None
            if taken:
                references = [row for row in references if not birthdays.get(row['person']) or birthdays[row['person']] <= taken]
            ranked = face_matching.rank_candidates(incoming, references, check_cancel)
            detections, matched, used = [], set(), set()
            for detection, candidates in zip(incoming, ranked):
                check_cancel()
                old = face_matching.previous_face(detection, previous, matched)
                if not (old and old['manual']):
                    if face_matching.rejected(detection, rejections): continue
                    # A second automatic box must not duplicate a confirmed face
                    # already consumed by another detection in this same result.
                    if any(face['manual'] and face['id'] in matched and
                           face_matching.overlap(face['box'], detection['box']) > .65 for face in previous): continue
                if old: matched.add(old['id'])
                person = old['person'] if old else face_matching.choose_person(candidates, used) or uuid.uuid4().hex
                detections.append({'id': old['id'] if old else uuid.uuid4().hex, 'person': person,
                    'encoding': detection['encoding'],
                    'box': old['box'] if old and old['manual'] and old['box'] else detection['box'],
                    'manual': old['manual'] if old else 0, 'new': old is None})
                used.add(person)
            # A detector miss must not discard an explicitly chosen cover.
            # Keep its identity without implicitly confirming pending reviews.
            detections.extend(face for face in previous
                              if (face['manual'] or face['person'] in cover_people) and face['id'] not in matched)
            with self.db() as db:
                check_cancel()
                if self.revision != revision: continue
                for face in detections:
                    person = face['person']
                    if person and not db.execute('SELECT 1 FROM people WHERE id=?', (person,)).fetchone():
                        number = db.execute('SELECT count(*) FROM people WHERE id!=?', (UNKNOWN_PERSON_ID,)).fetchone()[0] + 1
                        while db.execute('SELECT 1 FROM people WHERE name=?', ('Persona ' + str(number),)).fetchone():
                            number += 1
                        db.execute('INSERT INTO people VALUES (?,?,?)', (person, 'Persona ' + str(number), time.time()))
                    if face.get('new') and person in review_people:
                        photo_reviews.add_match(db, photo_id, face['id'], person, review_batch)
                db.execute('DELETE FROM face_detections WHERE photo=?', (photo_id,))
                for face in detections:
                    db.execute('INSERT INTO face_detections VALUES (?,?,?,?,?,?)', (face['id'], photo_id, face['person'],
                        json.dumps(face['encoding']), json.dumps(face['box']) if face['box'] else None, face['manual']))
                db.execute("UPDATE photos SET face_state='done' WHERE id=?", (photo_id,))
                self._sync_face_links(photo_id, db, review_batch)
                if job:
                    updated = db.execute("UPDATE face_analysis_items SET state='done' WHERE photo=?", (photo_id,)).rowcount
                    if job == 'single':
                        db.execute("UPDATE face_photo_jobs SET state='complete', error='' WHERE photo=?", (photo_id,))
                        if updated and not db.execute("SELECT 1 FROM face_analysis_items WHERE state='pending' LIMIT 1").fetchone():
                            db.execute("UPDATE face_analysis SET state='complete', error='' WHERE id=1")
                return
        raise FaceEngineError('La biblioteca está cambiando durante el análisis. Reintenta cuando terminen las ediciones.')

    def _sync_face_links(self, photo_id, db, review_batch=None):
        db.execute("DELETE FROM faces WHERE photo=? AND (encoding!='[]' OR person NOT LIKE 'apple-%')", (photo_id,))
        db.execute('''INSERT OR IGNORE INTO faces SELECT photo, person, encoding FROM face_detections
            WHERE photo=? AND person IS NOT NULL ORDER BY manual DESC, rowid''', (photo_id,))
        db.execute('''DELETE FROM person_covers WHERE photo=? AND NOT EXISTS
            (SELECT 1 FROM faces WHERE person=person_covers.person AND photo=person_covers.photo)''', (photo_id,))
        photo_reviews.sync(db, photo_id, review_batch)

    def confirm_reviews(self, ids):
        with self.db() as db:
            try:
                confirmed = photo_reviews.confirm(db, ids)
            except ValueError as error:
                raise PhotoError(str(error)) from None
            except LookupError as error:
                raise PhotoError(str(error), 409) from None
        return {'ok': True, 'confirmed': confirmed}

    def resolve_review(self, data):
        """Save a card and all its face edits atomically, with safe response-loss retries."""
        if not isinstance(data, dict) or set(data) != {'reviewId', 'changes'}:
            raise PhotoError('Indica la revisión y sus cambios.')
        review_id, changes = data['reviewId'], data['changes']
        if not isinstance(review_id, str) or not review_id or not isinstance(changes, list) or len(changes) > 100:
            raise PhotoError('Revisión inválida.')
        payload = json.dumps(data, sort_keys=True)
        with self.db() as db:
            receipt = db.execute('SELECT payload, result FROM photo_review_results WHERE review=?', (review_id,)).fetchone()
            if receipt:
                if receipt['payload'] != payload:
                    raise PhotoError('Esta revisión ya se guardó con otros cambios. Actualiza los pendientes.', 409)
                return json.loads(receipt['result'])
            review = next((row for row in photo_reviews.pending(db) if row['id'] == review_id), None)
            if not review:
                raise PhotoError('Esta propuesta ha cambiado. Actualiza los pendientes.', 409)
            # Validate the full shape and avoid editing the same face twice.
            seen = set()
            for change in changes:
                if not isinstance(change, dict): raise PhotoError('Cambio de cara inválido.')
                action = change.get('action')
                keys = set(change)
                valid = (action == 'remove' and keys == {'action', 'faceId'} or
                         action == 'assign' and keys in ({'action', 'faceId', 'personId'}, {'action', 'faceId', 'name'}) or
                         action == 'add' and keys in ({'action', 'box', 'personId'}, {'action', 'box', 'name'}))
                if not valid: raise PhotoError('Cambio de cara inválido.')
                if not review['faceId'] and action != 'add':
                    raise PhotoError('En una foto sin caras solo puedes añadir caras nuevas.')
                if action != 'add':
                    face_id = change['faceId']
                    if not isinstance(face_id, str) or not face_id or face_id in seen:
                        raise PhotoError('Selecciona cada cara una sola vez.')
                    seen.add(face_id)
            # Confirm before adding faces: the first addition removes the no-face
            # queue entry. Both the confirmation and additions roll back together.
            if not review['faceId']:
                photo_reviews.confirm(db, [review_id])
            for change in changes:
                action = change['action']
                assignment = {key: value for key, value in change.items() if key not in ('action', 'faceId')}
                if action == 'add': self.add_face(review['photoId'], assignment, db=db)
                elif action == 'assign': self.assign_face(review['photoId'], change['faceId'], assignment, db=db)
                else: self.remove_face(review['photoId'], change['faceId'], db=db)
            # Saving other faces also approves the current proposal, unless corrected or removed.
            if review['faceId'] and review['faceId'] not in seen:
                photo_reviews.confirm(db, [review_id])
            if review['faceId']:
                # Removing the final detected face creates a new no-face review;
                # keep it in the same batch for the wizard's third step.
                db.execute('''UPDATE photo_reviews SET batch=?
                    WHERE photo=? AND face IS NULL AND reviewed=0''', (review['batchId'], review['photoId']))
            result = {'ok': True, 'reviewId': review_id, 'photoId': review['photoId']}
            db.execute('INSERT INTO photo_review_results VALUES (?,?,?)', (review_id, payload, json.dumps(result)))
        return result

    def _face_person(self, db, data):
        if set(data) not in ({'personId'}, {'name'}):
            raise PhotoError('Selecciona una persona existente o escribe un nombre nuevo.')
        if 'personId' in data:
            person_id = data['personId']
            person = db.execute('SELECT id, name FROM people WHERE id=?', (person_id,)).fetchone() if isinstance(person_id, str) else None
            if not person:
                raise PhotoError('Selecciona una persona existente.', 400)
            if not is_identified_person(person):
                raise PhotoError('Selecciona una persona con nombre, Desconocido o escribe un nombre nuevo.')
            return person_id
        name = clean_name(data['name'])
        if not is_identified_person({'id': 'new', 'name': name}):
            raise PhotoError('Escribe un nombre para identificar a esta persona; Persona seguido de un número es una etiqueta provisional.')
        existing = next((row for row in db.execute("SELECT id, name FROM people WHERE id NOT LIKE 'apple-%'")
                         if row['name'].casefold() == name.casefold()), None)
        if existing:
            return existing['id']
        person_id = uuid.uuid4().hex
        db.execute('INSERT INTO people VALUES (?,?,?)', (person_id, name, time.time()))
        return person_id

    def add_face(self, photo_id, data, db=None):
        if db is None:
            with self.db() as connection:
                return self.add_face(photo_id, data, db=connection)
        box = data.get('box')
        if (not isinstance(box, dict) or set(box) != {'x', 'y', 'width', 'height'} or
                any(type(box[key]) not in (int, float) or not math.isfinite(box[key]) for key in box) or
                not (0 <= box['x'] < 1 and 0 <= box['y'] < 1 and box['width'] > 0 and box['height'] > 0
                     and box['x'] + box['width'] <= 1.000001 and box['y'] + box['height'] <= 1.000001)):
            raise PhotoError('Define un recuadro válido dentro de la foto.')
        if not db.execute('SELECT 1 FROM photos WHERE id=?', (photo_id,)).fetchone():
            raise PhotoError('No se encuentra la foto.', 404)
        person_id = self._face_person(db, {key: value for key, value in data.items() if key != 'box'})
        # Explicitly drawing a face restores this region after a rejection.
        for rejected in db.execute('SELECT id, box FROM face_rejections WHERE photo=?', (photo_id,)).fetchall():
            if rejected['box'] and face_matching.overlap(json.loads(rejected['box']), box) > .5:
                db.execute('DELETE FROM face_rejections WHERE id=?', (rejected['id'],))
        face_id = uuid.uuid4().hex
        # Manual boxes work without a detector or a biometric encoding.
        db.execute('INSERT INTO face_detections VALUES (?,?,?,?,?,1)',
                   (face_id, photo_id, person_id, '[]', json.dumps(box)))
        self._sync_face_links(photo_id, db)
        return {'ok': True, 'faceId': face_id, 'personId': person_id}

    def assign_face(self, photo_id, face_id, data, db=None):
        if db is None:
            with self.db() as connection:
                return self.assign_face(photo_id, face_id, data, db=connection)
        face = db.execute('SELECT * FROM face_detections WHERE id=? AND photo=?', (face_id, photo_id)).fetchone()
        if not face: raise PhotoError('Esta cara ya no está disponible. Actualiza la foto.', 409)
        person_id = self._face_person(db, data)
        db.execute('UPDATE face_detections SET person=?, manual=1 WHERE id=?', (person_id, face_id))
        self._sync_face_links(photo_id, db)
        return {'ok': True, 'personId': person_id}

    def remove_face(self, photo_id, face_id, db=None):
        if db is None:
            with self.db() as connection:
                return self.remove_face(photo_id, face_id, db=connection)
        face = db.execute('SELECT * FROM face_detections WHERE id=? AND photo=?', (face_id, photo_id)).fetchone()
        if not face:
            raise PhotoError('Esta cara ya no está disponible. Actualiza la foto.', 409)
        db.execute('INSERT OR REPLACE INTO face_rejections VALUES (?,?,?,?)',
                   (face_id, photo_id, face['encoding'], face['box']))
        db.execute('DELETE FROM face_detections WHERE id=?', (face_id,))
        self._sync_face_links(photo_id, db)
        return {'ok': True, 'faceId': face_id}

    def set_person_birthday(self, ident, value):
        if ident == UNKNOWN_PERSON_ID:
            raise PhotoError('Selecciona una persona con nombre.')
        if not isinstance(value, str):
            raise PhotoError('Introduce una fecha de nacimiento válida.')
        if value:
            try:
                if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
                    raise ValueError()
                birth_date = datetime.strptime(value, '%Y-%m-%d').date()
                if birth_date > datetime.now().date():
                    raise ValueError()
            except ValueError:
                raise PhotoError('Introduce una fecha de nacimiento válida que no sea futura.')
        with self.db() as db:
            if not db.execute('SELECT 1 FROM people WHERE id=?', (ident,)).fetchone():
                raise PhotoError('No se encuentra esta persona.', 404)
            if value:
                db.execute('INSERT OR REPLACE INTO person_birthdays VALUES (?, ?)', (ident, value))
            else:
                db.execute('DELETE FROM person_birthdays WHERE person=?', (ident,))
        return {'ok': True}

    def rename_person(self, ident, name):
        if ident == UNKNOWN_PERSON_ID:
            raise PhotoError('La carpeta Desconocido es fija y no se puede renombrar.')
        name = clean_name(name)
        with self.db() as db:
            if not db.execute('UPDATE people SET name=? WHERE id=?', (name, ident)).rowcount:
                raise PhotoError('No se encuentra esta persona.', 404)
        return {'ok': True}

    def merge_people(self, source, target):
        return self.merge_people_many([source], target)

    def _people_selection(self, ids, db, allow_unknown=False):
        if not isinstance(ids, list) or not ids or any(not isinstance(ident, str) or not ident or ident.startswith('apple-') for ident in ids):
            raise PhotoError('Selecciona las personas para esta acción.')
        ids = list(dict.fromkeys(ids))
        if not allow_unknown and UNKNOWN_PERSON_ID in ids:
            raise PhotoError('La carpeta Desconocido es fija. Reasigna cada cara desde su foto.')
        for ident in ids:
            if not db.execute('SELECT 1 FROM people WHERE id=?', (ident,)).fetchone():
                raise PhotoError('Esta persona ya no está disponible. Actualiza la biblioteca.', 409)
        return ids

    def merge_people_many(self, ids, target):
        with self.db() as db:
            ids = self._people_selection(ids, db)
            self._people_selection([target], db, allow_unknown=True)
            if target in ids:
                raise PhotoError('Selecciona otra persona existente para unir los álbumes.')
            self._merge_people_rows(db, ids, target)
        return {'ok': True, 'personId': target}

    def _merge_people_rows(self, db, ids, target):
        for source in ids:
            photos = [row[0] for row in db.execute('SELECT DISTINCT photo FROM face_detections WHERE person=?', (source,))]
            # Keep the destination cover, or inherit the first chosen source cover.
            db.execute('INSERT OR IGNORE INTO person_covers SELECT ?, photo FROM person_covers WHERE person=?', (target, source))
            if target != UNKNOWN_PERSON_ID:
                db.execute('INSERT OR IGNORE INTO person_birthdays SELECT ?, birth_date FROM person_birthdays WHERE person=?', (target, source))
            db.execute('UPDATE face_detections SET person=?, manual=1 WHERE person=?', (target, source))
            # Also retain legacy links; shared photos appear only once in the album.
            db.execute('INSERT OR IGNORE INTO faces SELECT photo, ?, encoding FROM faces WHERE person=?', (target, source))
            db.execute('DELETE FROM faces WHERE person=?', (source,))
            for photo in photos:
                self._sync_face_links(photo, db)
            db.execute('DELETE FROM people WHERE id=?', (source,))

    def review_people(self, changes, request_id):
        if not isinstance(request_id, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{16,100}', request_id):
            raise PhotoError('Identificador de revisión inválido.')
        if not isinstance(changes, list) or not 1 <= len(changes) <= 5000:
            raise PhotoError('Prepara entre 1 y 5000 cambios.')
        payload = json.dumps(changes, sort_keys=True, separators=(',', ':'))
        # Use the same lock order as original-photo deletion. Nothing is deleted
        # from disk until the complete, validated catalogue transaction commits.
        with self.image_lock:
            with self.db() as db:
                previous = db.execute('SELECT payload, result FROM person_review_batches WHERE id=?', (request_id,)).fetchone()
                if previous:
                    if previous['payload'] != payload:
                        raise PhotoError('Esta revisión ya se usó para otros cambios.', 409)
                    result = json.loads(previous['result'])
                else:
                    prepared, sources, photo_ids = [], set(), set()
                    fields = {'rename': {'id', 'action', 'name'}, 'merge': {'id', 'action', 'personId'},
                              'delete': {'id', 'action'}, 'deletePhotos': {'id', 'action', 'photoIds'}}
                    for change in changes:
                        if not isinstance(change, dict) or not isinstance(change.get('action'), str) or change['action'] not in fields or set(change) != fields[change['action']]:
                            raise PhotoError('Prepara una sola acción válida por persona.')
                        ident = self._people_selection([change.get('id')], db)[0]
                        if ident in sources: raise PhotoError('Hay más de una acción para la misma persona.')
                        sources.add(ident)
                        person = db.execute('SELECT id, name FROM people WHERE id=?', (ident,)).fetchone()
                        if not re.fullmatch(r'(?:persona|person)\s+\d+', person['name'].strip(), re.IGNORECASE):
                            raise PhotoError('Una persona ya se ha identificado. Actualiza y revisa sus cambios.', 409)
                        item = dict(change)
                        if item['action'] == 'rename':
                            item['name'] = clean_name(item['name'])
                            if not is_identified_person({'id': ident, 'name': item['name']}):
                                raise PhotoError('Escribe un nombre nuevo, no una etiqueta Persona seguida de un número.')
                        elif item['action'] == 'merge':
                            target = self._people_selection([item['personId']], db, allow_unknown=True)[0]
                            target_person = db.execute('SELECT id, name FROM people WHERE id=?', (target,)).fetchone()
                            if target == ident or not is_identified_person(target_person):
                                raise PhotoError('Elige una persona identificada como destino.')
                        elif item['action'] == 'deletePhotos':
                            selected = set(self.validate_photo_ids(db, item['photoIds']))
                            current = {row[0] for row in db.execute('SELECT photo FROM faces WHERE person=?', (ident,))}
                            if selected != current:
                                raise PhotoError('Han cambiado las fotos de una ficha. Actualiza y vuelve a marcar su borrado.', 409)
                            photo_ids.update(selected)
                        prepared.append(item)
                    if len(photo_ids) > 5000: raise PhotoError('Selecciona como máximo 5000 fotos por revisión.')
                    for item in prepared:
                        if item['action'] == 'rename':
                            db.execute('UPDATE people SET name=? WHERE id=?', (item['name'], item['id']))
                        elif item['action'] in {'merge', 'delete'}:
                            self._merge_people_rows(db, [item['id']], item.get('personId', UNKNOWN_PERSON_ID))
                    if photo_ids: self._delete_photo_rows(db, sorted(photo_ids))
                    result = {'ok': True, 'applied': len(prepared), 'deletedPhotos': len(photo_ids)}
                    db.execute('INSERT INTO person_review_batches VALUES (?,?,?)', (request_id, payload, json.dumps(result)))
            pending = self.cleanup_deleted() if result['deletedPhotos'] else 0
        return {**result, 'cleanupPending': pending}

    def delete_people(self, ids):
        # Removing an identity never deletes the underlying original images.
        self.merge_people_many(ids, UNKNOWN_PERSON_ID)
        return {'ok': True}

    def download_people(self, ids):
        with self.db() as db:
            ids = self._people_selection(ids, db, allow_unknown=True)
            photos = {}
            for ident in ids:
                for photo in db.execute('SELECT p.id, p.path FROM photos p JOIN faces f ON f.photo=p.id WHERE f.person=? ORDER BY p.path', (ident,)):
                    photos[photo['id']] = photo['path']
        if not photos:
            raise PhotoError('Estas personas no tienen fotos para descargar.')
        return self._download_archive(photos.values())

    def download_photos(self, ids):
        with self.db() as db:
            ids = self.validate_photo_ids(db, ids)
            paths = [db.execute('SELECT path FROM photos WHERE id=?', (ident,)).fetchone()['path'] for ident in ids]
        return self._download_archive(paths)

    def _download_archive(self, paths):
        # Use disk rather than RAM for large albums. Preserve original bytes and
        # relative paths, and include shared photos only once.
        archive = tempfile.TemporaryFile()
        try:
            with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_STORED) as bundle:
                for relative in paths:
                    bundle.write(self.safe_file(relative), arcname=relative)
            archive.seek(0)
            return archive
        except Exception:
            archive.close()
            raise

    def remove_matches(self, person, ids):
        if not isinstance(ids, list) or not ids or any(not isinstance(i, str) for i in ids):
            raise PhotoError('Selecciona las coincidencias que quieres quitar.')
        with self.db() as db:
            db.executemany('UPDATE face_detections SET person=NULL, manual=1 WHERE person=? AND photo=?', [(person, ident) for ident in ids])
            db.executemany('DELETE FROM faces WHERE person=? AND photo=?', [(person, ident) for ident in ids])
            db.execute('DELETE FROM person_covers WHERE person=? AND NOT EXISTS (SELECT 1 FROM faces WHERE person=? AND photo=person_covers.photo)', (person, person))
            for ident in ids:
                photo_reviews.sync(db, ident)
        return {'ok': True}

    def set_person_cover(self, person, photo):
        if not isinstance(photo, str): raise PhotoError('Selecciona una foto de esta persona.')
        with self.db() as db:
            if not db.execute('SELECT 1 FROM faces WHERE person=? AND photo=?', (person, photo)).fetchone():
                raise PhotoError('La portada debe ser una foto de esta persona.', 409)
            db.execute('INSERT INTO person_covers VALUES (?,?) ON CONFLICT(person) DO UPDATE SET photo=excluded.photo', (person, photo))
        return {'ok': True}

    def _ai_folder(self, db, ident):
        return ident != 'ai' and self.folder_root(db, ident) == 'ai'

    def start_generation(self, folder_id):
        credentials = self.settings.credentials() if self.settings else {}
        if not credentials.get('enabled') or not credentials.get('apiKey'):
            raise PhotoError('Activa OpenAI y guarda su clave en Dashboard → Servicios auxiliares → OpenAI.')
        with self.db() as db:
            if not self._ai_folder(db, folder_id): raise PhotoError('Selecciona una subcarpeta de IA.')
            active = db.execute("SELECT id FROM jobs WHERE state='running'").fetchone()
            if active: raise PhotoError('Ya hay una generación en curso. Espera a que termine.', 409)
            originals = db.execute('SELECT * FROM photos WHERE (folder=? OR id IN (SELECT photo FROM photo_albums WHERE folder=?)) AND source IS NULL', (folder_id, folder_id)).fetchall()
            pending = [(p['id'], p['path'], p['name'], style) for p in originals for style in STYLES
                       if not db.execute('SELECT 1 FROM photos WHERE source=? AND style=?', (p['id'], style)).fetchone()]
            if not pending: raise PhotoError('No hay variantes pendientes. Añade fotos originales a esta carpeta.')
            ident = uuid.uuid4().hex
            db.execute('INSERT INTO jobs VALUES (?,?,?, ?,0,?,?)', (ident, folder_id, 'running', len(pending), '', time.time()))
        threading.Thread(target=self._generate, args=(ident, folder_id, pending, credentials), daemon=True).start()
        return {'ok': True, 'jobId': ident, 'total': len(pending)}

    def _generate(self, ident, folder, pending, credentials):
        credentials = {**credentials, '_usage_group': ident}
        try:
            for index, (source, relative, name, style) in enumerate(pending):
                # Respect the configured request rate without retrying uncertain paid calls automatically.
                if index: time.sleep(60 / max(1, credentials.get('requestsPerMinute', 10)))
                content = edit_image(self.safe_file(relative), style, credentials)
                directory = self.root / ('generated-' + ident)
                directory.mkdir(exist_ok=True)
                path = directory / (source + '-' + style + '.png')
                path.write_bytes(content)
                try:
                    with self.db() as db:
                        if not db.execute('SELECT 1 FROM photos WHERE id=?', (source,)).fetchone():
                            raise PhotoError('La foto original se ha borrado de Galería.')
                        self._insert(db, path.relative_to(self.root).as_posix(), folder,
                                     Path(name).stem + ' · ' + style + '.png', source=source, style=style)
                        db.execute('UPDATE jobs SET done=done+1 WHERE id=?', (ident,))
                except Exception:
                    path.unlink(missing_ok=True)
                    raise
            with self.db() as db: db.execute("UPDATE jobs SET state='complete' WHERE id=?", (ident,))
        except Exception as error:
            message = str(error) if isinstance(error, PhotoError) else 'Se detuvo la generación. Revisa el espacio disponible y reintenta las pendientes.'
            with self.db() as db: db.execute("UPDATE jobs SET state='failed', error=? WHERE id=?", (message, ident))


def create_photo_blueprint(get_library):
    bp = Blueprint('photo_library', __name__)

    @bp.errorhandler(PhotoError)
    def invalid(error):
        return jsonify({'error': str(error)}), error.status

    @bp.after_request
    def private(response):
        response.headers['Cache-Control'] = 'no-store'
        return response

    def body():
        data = request.get_json(silent=True)
        if not isinstance(data, dict): raise PhotoError('Solicitud inválida.')
        return data

    @bp.get('/pictures/library')
    def library():
        store = get_library()
        store.start_sync()
        store.start_previews()
        return jsonify(store.snapshot())

    @bp.get('/pictures/status')
    def status():
        return jsonify(get_library().status())

    @bp.post('/pictures/import/check')
    def check_import():
        if request.content_length is None or request.content_length > 4096:
            raise PhotoError('Consulta de importación demasiado grande.', 413)
        return jsonify(get_library().check_import(body().get('digests')))

    @bp.post('/pictures/folders')
    def folders():
        data = body()
        return jsonify(get_library().create_folder(data.get('name'), data.get('parent', ''))), 201

    @bp.get('/pictures/metadata/<ident>')
    def metadata(ident):
        with get_library().db() as db:
            row = db.execute('SELECT data FROM photo_metadata WHERE photo=?', (ident,)).fetchone()
        if not row: raise PhotoError('Esta foto no tiene metadatos importados.', 404)
        response = jsonify(json.loads(row['data']))
        response.headers['Content-Disposition'] = 'attachment; filename="photo-metadata.json"'
        return response

    @bp.post('/pictures/move')
    @bp.post('/pictures/albums/add')
    def move():
        data = body()
        return jsonify(get_library().move(data.get('ids'), data.get('folderId', ''), data.get('name'), data.get('parent', '')))

    @bp.post('/pictures/photos/delete')
    def delete():
        data = body()
        return jsonify(get_library().delete_photos(data.get('ids'), data.get('scope'), data.get('folderId')))

    @bp.post('/pictures/photos/<ident>/metadata')
    def update_metadata(ident):
        return jsonify(get_library().update_photo_metadata(ident, body()))

    @bp.post('/pictures/places/resolve')
    def resolve_place():
        if request.content_length is None or request.content_length > 1024:
            raise PhotoError('Consulta de ubicación demasiado grande.', 413)
        data = body()
        try:
            return jsonify(get_library().places.resolve(data))
        except ValueError as error:
            raise PhotoError(str(error)) from None

    @bp.post('/pictures/photos/download')
    def download_photos():
        archive = get_library().download_photos(body().get('ids'))
        try:
            return send_file(archive, mimetype='application/zip', as_attachment=True,
                             download_name='fotos.zip', conditional=False)
        except Exception:
            archive.close()
            raise

    @bp.post('/pictures/generate')
    def generate():
        return jsonify(get_library().start_generation(body().get('folderId'))), 202

    @bp.post('/pictures/people/scan')
    def scan():
        get_library().start_faces(body().get('limit'))
        return jsonify({'ok': True}), 202

    @bp.post('/pictures/people/pause')
    def pause():
        body()
        return jsonify(get_library().pause_faces())

    @bp.get('/pictures/photos/<ident>/faces')
    def photo_faces(ident):
        return jsonify(get_library().photo_faces(ident))

    @bp.post('/pictures/photos/<ident>/detect')
    def detect_photo(ident):
        body()
        return jsonify(get_library().start_photo_faces(ident)), 202

    @bp.post('/pictures/photos/<ident>/faces/<face>/assign')
    def assign_face(ident, face):
        return jsonify(get_library().assign_face(ident, face, body()))

    @bp.post('/pictures/photos/<ident>/faces')
    def add_face(ident):
        return jsonify(get_library().add_face(ident, body())), 201

    @bp.post('/pictures/photos/<ident>/faces/<face>/remove')
    def remove_face(ident, face):
        body()
        return jsonify(get_library().remove_face(ident, face))

    @bp.post('/pictures/people/<ident>/cover')
    def cover(ident):
        return jsonify(get_library().set_person_cover(ident, body().get('photoId')))

    @bp.post('/pictures/people/<ident>')
    def rename(ident):
        return jsonify(get_library().rename_person(ident, body().get('name')))

    @bp.post('/pictures/people/<ident>/birthday')
    def birthday(ident):
        return jsonify(get_library().set_person_birthday(ident, body().get('birthDate')))

    @bp.post('/pictures/people/<ident>/merge')
    def merge(ident):
        return jsonify(get_library().merge_people(ident, body().get('personId')))

    @bp.post('/pictures/people/merge')
    def merge_many():
        data = body()
        return jsonify(get_library().merge_people_many(data.get('ids'), data.get('personId')))

    @bp.post('/pictures/people/delete')
    def delete_people():
        return jsonify(get_library().delete_people(body().get('ids')))

    @bp.post('/pictures/people/review')
    def review_people():
        data = body()
        return jsonify(get_library().review_people(data.get('changes'), data.get('requestId')))

    @bp.post('/pictures/people/download')
    def download_people():
        archive = get_library().download_people(body().get('ids'))
        try:
            return send_file(archive, mimetype='application/zip', as_attachment=True,
                             download_name='personas.zip', conditional=False)
        except Exception:
            archive.close()
            raise

    @bp.post('/pictures/people/<ident>/remove')
    def remove(ident):
        return jsonify(get_library().remove_matches(ident, body().get('ids')))

    @bp.post('/pictures/reviews/resolve')
    def resolve_review():
        return jsonify(get_library().resolve_review(body()))

    @bp.post('/pictures/reviews/batch')
    def resolve_review_batch():
        return jsonify(photo_review_batch.apply_batch(get_library(), body()))

    @bp.get('/pictures/reviews/batch/<request_id>')
    def review_batch_receipt(request_id):
        return jsonify(photo_review_batch.batch_receipt(get_library(), request_id))

    @bp.post('/pictures/reviews/confirm')
    def confirm_reviews():
        return jsonify(get_library().confirm_reviews(body().get('ids')))

    return bp
