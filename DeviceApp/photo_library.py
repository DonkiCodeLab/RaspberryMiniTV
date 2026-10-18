"""Photo albums, EXIF, local face groups and resumable image-edit jobs.

Physical paths are immutable: organizing albums never invalidates profile marks.
The SQLite catalogue and its thumbnail cache can be backed up with Pictures.
"""
import base64
from contextlib import contextmanager
from datetime import datetime
import hashlib
import importlib.util
import io
import json
import math
import os
from pathlib import Path
import sqlite3
import threading
import time
import urllib.error
import urllib.request
import uuid

from PIL import Image, ImageOps, UnidentifiedImageError
from flask import Blueprint, jsonify, request
from photo_import import validate_import_records

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif', '.heic', '.heif'}
MAX_FILE_BYTES = 50 * 1024 * 1024
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


def read_metadata(path):
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
        return {'takenAt': taken, 'latitude': latitude, 'longitude': longitude,
                'width': image.width, 'height': image.height}


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
        with urllib.request.urlopen(req, timeout=300) as response:
            raw = response.read(32 * 1024 * 1024 + 1)
        if len(raw) > 32 * 1024 * 1024:
            raise ValueError()
        result = json.loads(raw)
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
        self.face_lock = threading.Lock()
        self.scan_lock = threading.Lock()
        self.scanning = False
        self.scan_error = ''
        self.last_scan = 0
        self.faces_running = False
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
            ''')
            for ident, name in [('uploads', 'Uploads'), ('ai', 'Diviértete con la IA')]:
                db.execute('INSERT OR IGNORE INTO folders VALUES (?, ?, ?, ?)', (ident, '', name, time.time()))
            db.execute("UPDATE jobs SET state='interrupted', error='Se interrumpió la generación. Reintenta las variantes pendientes.' WHERE state='running'")

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

    def safe_file(self, relative):
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
        return target

    def folder(self, db, ident):
        if not isinstance(ident, str): raise PhotoError('Carpeta inválida.')
        row = db.execute('SELECT * FROM folders WHERE id=?', (ident,)).fetchone()
        if not row: raise PhotoError('No se encuentra la carpeta.', 404)
        return dict(row)

    def create_folder(self, name, parent='', db=None):
        if db is None:
            with self.db() as connection:
                return self.create_folder(name, parent, connection)
        name = clean_name(name)
        if parent: self.folder(db, parent)
        elif parent != '': raise PhotoError('Carpeta inválida.')
        if parent == '' and name.casefold() in {'uploads', 'upload', 'mapa', 'map', 'ia', 'ai', 'personas', 'people', 'diviértete con la ia'}:
            raise PhotoError('Ese nombre está reservado para una carpeta especial.')
        if db.execute('SELECT 1 FROM folders WHERE parent=? AND lower(name)=lower(?)', (parent, name)).fetchone():
            raise PhotoError('Ya existe una carpeta con ese nombre.', 409)
        ident = uuid.uuid4().hex
        db.execute('INSERT INTO folders VALUES (?, ?, ?, ?)', (ident, parent, name, time.time()))
        return self.folder(db, ident)

    def _insert(self, db, relative, folder, name, uploaded=None, source=None, style=None, metadata=None):
        path = self.safe_file(relative)
        if metadata is None:
            metadata = read_metadata(path)
        stat = path.stat()
        ident = uuid.uuid4().hex
        db.execute('INSERT INTO photos VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            (ident, relative, folder, name, uploaded or time.time(), stat.st_mtime, stat.st_size,
             json.dumps(metadata), source, style, 'skip' if source else 'pending'))
        return ident

    def upload(self, files, album_name='', folder_id='', parent='uploads', import_data=None):
        if not files or len(files) > 500:
            raise PhotoError('Selecciona entre 1 y 500 fotos por subida.')
        records = None
        if import_data is not None:
            try:
                if not isinstance(import_data, dict) or len(files) > 20: raise ValueError('Lote de importación inválido.')
                session, batch_id = import_data.get('session'), import_data.get('batch')
                if any(not isinstance(v, str) or not v or len(v) > 100 for v in (session, batch_id)):
                    raise ValueError('Identificador de importación inválido.')
                records = validate_import_records(import_data.get('records'), len(files))
            except (ValueError, TypeError, OverflowError, RecursionError) as error:
                raise PhotoError(str(error) or 'Metadatos inválidos.') from None
            with self.db() as db:
                previous = db.execute('SELECT result FROM photo_import_batches WHERE session=? AND batch=?', (session, batch_id)).fetchone()
                if previous: return json.loads(previous['result'])
        # Only the import wizard opts into per-image failures; other uploads stay atomic.
        continue_on_error = records is not None and import_data.get('continueOnError') is True
        # Stage and validate inputs before taking the catalogue lock.
        batch = self.root / ('batch-' + uuid.uuid4().hex)
        batch.mkdir()
        staged, rejected = [], []
        committed = False
        try:
            for index, uploaded in enumerate(files):
                name = str(uploaded.filename or '').replace('\\', '/').split('/')[-1]
                if not name or Path(name).suffix.lower() not in EXTENSIONS or len(name) > 240:
                    raise PhotoError('La selección contiene un formato no compatible: ' + name[:100])
                path = batch / (uuid.uuid4().hex + Path(name).suffix.lower())
                hasher = hashlib.sha256() if records is not None else None
                with path.open('xb') as handle:
                    count = 0
                    while True:
                        chunk = uploaded.stream.read(1024 * 1024)
                        if not chunk: break
                        count += len(chunk)
                        if count > MAX_FILE_BYTES: raise PhotoError('Una foto supera el límite de 50 MB.', 413)
                        handle.write(chunk)
                        if hasher is not None: hasher.update(chunk)
                try:
                    metadata = read_metadata(path)
                except (OSError, ValueError, Image.DecompressionBombError) as error:
                    # Storage/permission failures require a retry, not a skipped photo.
                    if isinstance(error, OSError) and error.errno is not None: raise
                    message = str(error) if isinstance(error, PhotoError) else 'No se puede leer ' + name + '. El archivo está incompleto, dañado o su formato no es compatible.'
                    if Path(name).suffix.lower() in {'.heic', '.heif'}:
                        message += ' Comprueba el soporte HEIC (pillow-heif) en la MiniTV.'
                    if not continue_on_error:
                        raise PhotoError(message) from None
                    rejected.append({'index': index, 'name': name, 'error': message})
                    path.unlink()
                    continue
                staged.append((index, path, name, metadata, hasher.hexdigest() if hasher is not None else None))
            with self.db() as db:
                # A lost response or simultaneous retry must not create a second album.
                previous = db.execute('SELECT result FROM photo_import_batches WHERE session=? AND batch=?', (session, batch_id)).fetchone() if records is not None else None
                if previous:
                    for _, path, _, _, _ in staged: path.unlink()
                    batch.rmdir()
                    return json.loads(previous['result'])
                existing_session = db.execute('SELECT folder FROM photo_import_sessions WHERE id=?', (session,)).fetchone() if records is not None else None
                if existing_session:
                    folder = self.folder(db, existing_session['folder'])
                elif folder_id:
                    folder = self.folder(db, folder_id)
                    if folder_id in ('uploads', 'ai'): raise PhotoError('Selecciona o crea una subcarpeta.')
                else:
                    if parent not in ('uploads', 'ai'): raise PhotoError('Selecciona Uploads o IA para la nueva carpeta.')
                    folder = self.create_folder(album_name, parent, db)
                if records is not None:
                    db.execute('INSERT OR IGNORE INTO photo_import_sessions VALUES (?,?)', (session, folder['id']))
                saved, duplicates, discarded = [], 0, []
                for index, path, name, image_metadata, digest in staged:
                    existing = db.execute('SELECT photo FROM photo_import_files WHERE digest=?', (digest,)).fetchone() if digest else None
                    if existing:
                        ident = existing['photo']; duplicates += 1; discarded.append(path)
                        relative = db.execute('SELECT path FROM photos WHERE id=?', (ident,)).fetchone()['path']
                        db.execute('INSERT OR IGNORE INTO photo_albums VALUES (?,?)', (ident, folder['id']))
                    else:
                        relative = path.relative_to(self.root).as_posix()
                        ident = self._insert(db, relative, folder['id'], name, metadata=image_metadata)
                        if digest: db.execute('INSERT INTO photo_import_files VALUES (?,?)', (digest, ident))
                    saved.append(relative)
                    if records is not None:
                        metadata, raw, people = records[index]
                        if raw is not None:
                            current = json.loads(db.execute('SELECT metadata FROM photos WHERE id=?', (ident,)).fetchone()['metadata'])
                            current.update(metadata)
                            db.execute('UPDATE photos SET metadata=? WHERE id=?', (json.dumps(current), ident))
                            db.execute('INSERT OR REPLACE INTO photo_metadata VALUES (?,?)', (ident, raw))
                            # Empty encodings are imported labels, never face-recognition vectors.
                            for person in people:
                                key = person.get('id') or 'name:' + person['name']
                                person_id = 'apple-' + hashlib.sha256(key.encode()).hexdigest()[:32]
                                db.execute('INSERT OR IGNORE INTO people VALUES (?,?,?)', (person_id, person['name'], time.time()))
                                db.execute('INSERT OR IGNORE INTO faces VALUES (?,?,?)', (ident, person_id, '[]'))
                            if people: db.execute("UPDATE photos SET face_state='imported' WHERE id=?", (ident,))
                            if import_data.get('preserveAlbums') is True:
                                for album in metadata['albums']:
                                    # Keep the full Apple name in metadata; folder names follow app constraints.
                                    album_name_safe = ''.join(c if c not in '/\\' and ord(c) >= 32 else ' · ' for c in album).strip()[:100]
                                    if album_name_safe in ('', '.', '..'): continue
                                    found = db.execute('SELECT id FROM folders WHERE parent=? AND lower(name)=lower(?)', (folder['id'], album_name_safe)).fetchone()
                                    album_id = found['id'] if found else self.create_folder(album_name_safe, folder['id'], db)['id']
                                    db.execute('INSERT OR IGNORE INTO photo_albums VALUES (?,?)', (ident, album_id))
                result = {'ok': True, 'folderId': folder['id'], 'saved': saved,
                          'imported': len(staged) - duplicates, 'duplicates': duplicates}
                if continue_on_error: result['rejected'] = rejected
                if records is not None:
                    db.execute('INSERT INTO photo_import_batches VALUES (?,?,?)', (session, batch_id, json.dumps(result)))
            committed = True
            for path in discarded: path.unlink(missing_ok=True)
            if not any(batch.iterdir()): batch.rmdir()
            self.start_faces()
            return result
        except Exception:
            if not committed and batch.exists():
                for path in batch.iterdir(): path.unlink()
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
            for root, dirs, files in os.walk(self.root, followlinks=False):
                dirs[:] = sorted(d for d in dirs if not d.startswith(('.', 'batch-', 'generated-')) and not (Path(root) / d).is_symlink())
                for name in sorted(files):
                    path = Path(root) / name
                    relative = path.relative_to(self.root).as_posix()
                    if relative in known or name.startswith('.') or path.suffix.lower() not in EXTENSIONS or path.is_symlink(): continue
                    try:
                        metadata = read_metadata(path)
                        with self.db() as db:
                            if db.execute('SELECT 1 FROM photos WHERE path=?', (relative,)).fetchone(): continue
                            parent = 'uploads'
                            parts = Path(relative).parts[:-1] or ('Fotos anteriores',)
                            for part in parts:
                                existing = db.execute('SELECT id FROM folders WHERE parent=? AND name=?', (parent, part)).fetchone()
                                parent = existing['id'] if existing else self.create_folder(part, parent, db)['id']
                            stat = path.stat()
                            db.execute('INSERT INTO photos VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                                (uuid.uuid4().hex, relative, parent, name, stat.st_mtime, stat.st_mtime, stat.st_size,
                                 json.dumps(metadata), None, None, 'pending'))
                    except (OSError, ValueError, Image.DecompressionBombError):
                        self.scan_error = 'Algunas fotos no se pudieron leer. Revisa sus formatos y el soporte HEIC.'
            self.last_scan = time.monotonic()
        finally:
            self.scanning = False
            self.scan_lock.release()
        self.start_faces()

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
        state = [self.revision, self.scanning, self.scan_error, self.faces_running, self.face_error]
        return {'revision': hashlib.sha256(json.dumps(state).encode()).hexdigest(),
                'working': self.scanning or self.faces_running or running_job}

    def snapshot(self):
        with self.db() as db:
            status = self.status(db)
            folders = [dict(row) for row in db.execute('SELECT * FROM folders ORDER BY created, name')]
            photos = []
            memberships = {}
            for member in db.execute('SELECT photo, folder FROM photo_albums'):
                memberships.setdefault(member['photo'], []).append(member['folder'])
            for row in db.execute('SELECT * FROM photos ORDER BY uploaded DESC, name'):
                photos.append({'id': row['id'], 'relativePath': row['path'], 'folderId': row['folder'],
                    'folderIds': memberships.get(row['id'], []),
                    'name': row['name'], 'uploadedAt': row['uploaded'], 'modifiedAt': row['modified'],
                    'size': row['size'], 'sourceId': row['source'], 'style': row['style'], **json.loads(row['metadata'])})
            people = [dict(row) for row in db.execute('SELECT * FROM people WHERE id IN (SELECT person FROM faces) ORDER BY created')]
            person_photos = {}
            for row in db.execute('SELECT person, photo FROM faces ORDER BY person, photo'):
                person_photos.setdefault(row['person'], []).append(row['photo'])
            for person in people:
                person['photoIds'] = person_photos.get(person['id'], [])
            jobs = [dict(row) for row in db.execute('SELECT * FROM jobs ORDER BY created DESC LIMIT 20')]
            pending = db.execute("SELECT count(*) FROM photos WHERE face_state='pending'").fetchone()[0]
            failed = db.execute("SELECT count(*) FROM photos WHERE face_state='error'").fetchone()[0]
        try:
            configured = self.settings.public() if self.settings else {}
        except Exception:
            configured = {}  # A broken AI setting must not hide the photo library.
        return {**status, 'folders': folders, 'photos': photos, 'people': people, 'jobs': jobs,
                'scanning': self.scanning, 'scanError': self.scan_error,
                'aiReady': bool(configured.get('enabled') and configured.get('configured')),
                'faces': {'available': importlib.util.find_spec('face_recognition') is not None,
                          'running': self.faces_running, 'pending': pending, 'failed': failed, 'error': self.face_error}}

    def move(self, ids, target='', new_name=None, parent=''):
        if not isinstance(ids, list) or not ids or len(ids) > 5000 or any(not isinstance(i, str) for i in ids):
            raise PhotoError('Selecciona las fotos que quieres mover.')
        ids = list(dict.fromkeys(ids))
        with self.db() as db:
            # All-or-nothing even if a stale client sends one missing photo.
            for ident in ids:
                if not db.execute('SELECT 1 FROM photos WHERE id=?', (ident,)).fetchone():
                    raise PhotoError('Una foto ya no está disponible. Actualiza la biblioteca.', 409)
            if new_name is not None: target = self.create_folder(new_name, parent, db)['id']
            self.folder(db, target)
            if target in ('uploads', 'ai'): raise PhotoError('Mueve las fotos a una subcarpeta, no a una carpeta especial.')
            db.executemany('UPDATE photos SET folder=? WHERE id=?', [(target, ident) for ident in ids])
            db.executemany('DELETE FROM photo_albums WHERE photo=?', [(ident,) for ident in ids])
        return {'ok': True, 'folderId': target, 'moved': len(ids)}

    def preview(self, relative, full=False):
        path = self.safe_file(relative)
        key = hashlib.sha256((relative + str(path.stat().st_mtime_ns) + str(full)).encode()).hexdigest()
        cached = self.cache / (key + '.jpg')
        if not cached.exists():
            temporary = self.cache / (uuid.uuid4().hex + '.tmp')
            try:
                with Image.open(path) as image:
                    image = ImageOps.exif_transpose(image).convert('RGB')
                    image.thumbnail((2400, 2400) if full else (600, 600))
                    image.save(temporary, 'JPEG', quality=90 if full else 80)
                os.replace(temporary, cached)
            except (OSError, ValueError, Image.DecompressionBombError):
                raise PhotoError('No se puede crear la vista previa de esta foto.', 422) from None
            finally:
                temporary.unlink(missing_ok=True)
        return cached

    def start_faces(self, retry=False):
        if importlib.util.find_spec('face_recognition') is None: return
        # Reserve synchronously so a burst of uploads cannot enqueue duplicate workers.
        if not self.face_lock.acquire(blocking=False): return
        self.faces_running = True
        self.face_error = ''
        if retry:
            with self.db() as db: db.execute("UPDATE photos SET face_state='pending' WHERE face_state='error'")
        threading.Thread(target=self._faces_worker, daemon=True).start()

    def _faces_worker(self):
        try:
            import face_recognition
            import numpy as np
            while True:
                with self.db() as db:
                    photo = db.execute("SELECT * FROM photos WHERE face_state='pending' LIMIT 1").fetchone()
                if not photo: break
                try:
                    with Image.open(self.safe_file(photo['path'])) as source:
                        image = ImageOps.exif_transpose(source).convert('RGB')
                        image.thumbnail((1000, 1000))
                        encodings = face_recognition.face_encodings(np.asarray(image))
                    self.group_faces(photo['id'], [encoding.tolist() for encoding in encodings])
                except (OSError, ValueError, RuntimeError):
                    with self.db() as db: db.execute("UPDATE photos SET face_state='error' WHERE id=?", (photo['id'],))
                    self.face_error = 'No se pudieron analizar algunas fotos. Puedes reintentar.'
        except Exception:
            self.face_error = 'No se pudo iniciar el reconocimiento local. Revisa la instalación de face-recognition.'
        finally:
            self.faces_running = False
            self.face_lock.release()

    def group_faces(self, photo_id, encodings):
        with self.db() as db:
            state = db.execute('SELECT face_state FROM photos WHERE id=?', (photo_id,)).fetchone()
            if state and state['face_state'] == 'imported': return
            known = [(r['person'], json.loads(r['encoding'])) for r in db.execute('SELECT person, encoding FROM faces')]
            used = set()
            for encoding in encodings:
                if len(encoding) != 128 or not all(math.isfinite(v) for v in encoding): continue
                scores = sorted((math.sqrt(sum((a-b)**2 for a, b in zip(vector, encoding))), person)
                                for person, vector in known if person not in used and len(vector) == 128)
                person = scores[0][1] if scores and scores[0][0] < .48 else uuid.uuid4().hex
                if not db.execute('SELECT 1 FROM people WHERE id=?', (person,)).fetchone():
                    count = db.execute('SELECT count(*) FROM people').fetchone()[0]
                    db.execute('INSERT INTO people VALUES (?,?,?)', (person, 'Persona ' + str(count + 1), time.time()))
                db.execute('INSERT OR IGNORE INTO faces VALUES (?,?,?)', (photo_id, person, json.dumps(encoding)))
                used.add(person)
            db.execute("UPDATE photos SET face_state='done' WHERE id=?", (photo_id,))

    def rename_person(self, ident, name):
        name = clean_name(name)
        with self.db() as db:
            if not db.execute('UPDATE people SET name=? WHERE id=?', (name, ident)).rowcount:
                raise PhotoError('No se encuentra esta persona.', 404)
        return {'ok': True}

    def remove_matches(self, person, ids):
        if not isinstance(ids, list) or not ids or any(not isinstance(i, str) for i in ids):
            raise PhotoError('Selecciona las coincidencias que quieres quitar.')
        with self.db() as db:
            db.executemany('DELETE FROM faces WHERE person=? AND photo=?', [(person, ident) for ident in ids])
        return {'ok': True}

    def _ai_folder(self, db, ident):
        current = self.folder(db, ident)
        if ident == 'ai': return False
        for _ in range(100):
            if current['parent'] == 'ai': return True
            if not current['parent']: return False
            current = self.folder(db, current['parent'])
        return False

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
        return jsonify(store.snapshot())

    @bp.get('/pictures/status')
    def status():
        return jsonify(get_library().status())

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
    def move():
        data = body()
        return jsonify(get_library().move(data.get('ids'), data.get('folderId', ''), data.get('name'), data.get('parent', '')))

    @bp.post('/pictures/generate')
    def generate():
        return jsonify(get_library().start_generation(body().get('folderId'))), 202

    @bp.post('/pictures/people/scan')
    def scan():
        store = get_library()
        if importlib.util.find_spec('face_recognition') is None:
            raise PhotoError('Instala el soporte de Personas en la Raspberry (face-recognition).', 503)
        store.start_faces(retry=True)
        return jsonify({'ok': True}), 202

    @bp.post('/pictures/people/<ident>')
    def rename(ident):
        return jsonify(get_library().rename_person(ident, body().get('name')))

    @bp.post('/pictures/people/<ident>/remove')
    def remove(ident):
        return jsonify(get_library().remove_matches(ident, body().get('ids')))

    return bp
