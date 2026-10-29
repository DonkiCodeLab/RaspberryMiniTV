"""One atomic, retryable commit for a complete wizard step, including image edits."""
import hashlib
import json
import math
import re
import uuid

from PIL import Image, ImageOps
import photo_reviews


def face_version(db, photo):
    rows = [tuple(row) for row in db.execute(
        'SELECT id, person, box, manual FROM face_detections WHERE photo=? ORDER BY id', (photo,))]
    return hashlib.sha256(json.dumps(rows).encode()).hexdigest()


def valid_box(box):
    return (isinstance(box, dict) and set(box) == {'x', 'y', 'width', 'height'} and
            all(type(v) in (int, float) and math.isfinite(v) for v in box.values()) and
            0 <= box['x'] < 1 and 0 <= box['y'] < 1 and box['width'] > 0 and box['height'] > 0 and
            box['x'] + box['width'] <= 1.000001 and box['y'] + box['height'] <= 1.000001)


def transform_box(box, edits):
    if box is None: return None
    x, y, w, h = (box[k] for k in ('x', 'y', 'width', 'height'))
    for edit in edits:
        if 'rotate' in edit:
            for _ in range(edit['rotate'] % 4): x, y, w, h = 1 - y - h, x, h, w
        elif 'crop' in edit:
            c = edit['crop']
            x, y, w, h = (x - c['x']) / c['width'], (y - c['y']) / c['height'], w / c['width'], h / c['height']
    right, bottom = min(1, x + w), min(1, y + h)
    x, y = max(0, x), max(0, y)
    return {'x': x, 'y': y, 'width': right - x, 'height': bottom - y} if right > x and bottom > y else None


def add_review_albums(library, db, photo, albums):
    """Resolve new root albums once per transaction and preserve all memberships."""
    from photo_library import PhotoError, clean_name
    if not isinstance(albums, list) or len(albums) > 100:
        raise PhotoError('Selecciona como máximo 100 álbumes personales por foto.')
    for album in albums:
        if not isinstance(album, dict) or set(album) not in ({'folderId'}, {'name'}):
            raise PhotoError('Álbum de revisión inválido.')
        if 'folderId' in album:
            try: target = library.folder(db, album['folderId'])['id']
            except PhotoError as error:
                if error.status == 404: raise PhotoError('Un álbum ya no está disponible. Revisa la selección.', 409) from error
                raise
            if target == 'albums' or library.folder_root(db, target) != 'albums':
                raise PhotoError('Selecciona un álbum personal.')
        else:
            name = clean_name(album['name'])
            target = next((row['id'] for row in db.execute("SELECT id, name FROM folders WHERE parent='albums'")
                           if row['name'].casefold() == name.casefold()), None)
            if not target: target = library.create_folder(name, 'albums', db)['id']
        db.execute('INSERT OR IGNORE INTO photo_albums VALUES (?,?)', (photo, target))


def save_image(library, db, photo, edits, created):
    from photo_library import PhotoError
    if not isinstance(edits, list) or len(edits) > 50: raise PhotoError('Demasiadas ediciones en una foto.')
    for edit in edits:
        if not isinstance(edit, dict) or not (
            set(edit) == {'rotate'} and type(edit['rotate']) is int and edit['rotate'] in (-1, 1) or
            set(edit) == {'crop'} and valid_box(edit['crop']) or
            set(edit) == {'scale'} and type(edit['scale']) in (float, int) and .1 <= edit['scale'] <= 2
        ): raise PhotoError('Edición de imagen inválida.')
    if not edits: return
    source = library.safe_file(photo['path'])
    with Image.open(source) as original:
        image = ImageOps.exif_transpose(original).convert('RGB')
        for edit in edits:
            if 'rotate' in edit: image = image.transpose(Image.Transpose.ROTATE_270 if edit['rotate'] == 1 else Image.Transpose.ROTATE_90)
            elif 'crop' in edit:
                c = edit['crop']; w, h = image.size
                left, top = round(c['x'] * w), round(c['y'] * h)
                right, bottom = min(w, round((c['x'] + c['width']) * w)), min(h, round((c['y'] + c['height']) * h))
                if right <= left or bottom <= top: raise PhotoError('El recorte es demasiado pequeño.')
                image = image.crop((left, top, right, bottom))
            else:
                w, h = [max(1, round(n * edit['scale'])) for n in image.size]
                if w * h > 50_000_000: raise PhotoError('La foto supera el límite de 50 megapíxeles.')
                image = image.resize((w, h), Image.Resampling.LANCZOS)
        # Keep every source intact. New URLs also invalidate browser thumbnail caches.
        directory = library.root / 'edited-photos'
        directory.mkdir(exist_ok=True)
        target = directory / (uuid.uuid4().hex + '.jpg')
        created.append(target)
        image.save(target, 'JPEG', quality=95)
        metadata = json.loads(photo['metadata'])
        metadata.update(width=image.width, height=image.height)
    db.execute('INSERT OR IGNORE INTO photo_edit_sources VALUES (?,?)', (photo['id'], photo['path']))
    stat = target.stat()
    name = photo['name'].rsplit('.', 1)[0] + '.jpg'
    db.execute('UPDATE photos SET path=?, metadata=?, modified=?, size=?, name=? WHERE id=?',
               (target.relative_to(library.root).as_posix(), json.dumps(metadata), stat.st_mtime, stat.st_size, name, photo['id']))
    for table in ('face_detections', 'face_rejections'):
        for face in db.execute('SELECT id, box FROM ' + table + ' WHERE photo=?', (photo['id'],)).fetchall():
            box = transform_box(json.loads(face['box']) if face['box'] else None, edits)
            if face['box'] and not box: db.execute('DELETE FROM ' + table + ' WHERE id=?', (face['id'],))
            else: db.execute('UPDATE ' + table + ' SET box=? WHERE id=?', (json.dumps(box) if box else None, face['id']))
    library._sync_face_links(photo['id'], db)


def apply_batch(library, data):
    from photo_library import PhotoError, is_identified_person, clean_name
    if not isinstance(data, dict) or set(data) != {'requestId', 'photos', 'people'}:
        raise PhotoError('Indica las fotos y personas de la revisión.')
    request_id, photos, people = data['requestId'], data['photos'], data['people']
    if (not isinstance(request_id, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{16,100}', request_id) or
        not isinstance(photos, list) or not isinstance(people, list) or not len(photos) + len(people)):
        raise PhotoError('Revisión de lote inválida.')
    payload = json.dumps(data, sort_keys=True)
    created = []
    with library.image_lock:
        try:
            with library.db() as db:
                receipt = db.execute('SELECT payload, result FROM photo_review_batches WHERE id=?', (request_id,)).fetchone()
                if receipt:
                    if receipt['payload'] != payload: raise PhotoError('Este lote ya se guardó con otros cambios.', 409)
                    return json.loads(receipt['result'])
                if library.faces_running or library.single_face_running:
                    raise PhotoError('Pausa el análisis antes de validar este paso.', 409)
                if len(photos) > db.execute('SELECT count(*) FROM photos').fetchone()[0] or len(people) > db.execute('SELECT count(*) FROM people').fetchone()[0]:
                    raise PhotoError('La selección supera los elementos de la biblioteca.')
                pending = {row['id']: row for row in photo_reviews.pending(db)}
                seen, prepared = set(), []
                for item in photos:
                    if not isinstance(item, dict) or set(item) - {'albums', 'metadata'} != {'photoId', 'expectedPath', 'version', 'reviewIds', 'changes', 'edits', 'delete'}:
                        raise PhotoError('Foto de revisión inválida.')
                    ident = item['photoId']
                    if not isinstance(ident, str) or ident in seen: raise PhotoError('Selecciona cada foto una sola vez.')
                    seen.add(ident)
                    photo = db.execute('SELECT * FROM photos WHERE id=?', (ident,)).fetchone()
                    if not photo or photo['path'] != item['expectedPath'] or face_version(db, ident) != item['version']:
                        raise PhotoError('Una foto ha cambiado. Revisa los cambios antes de validar.', 409)
                    ids = item['reviewIds']
                    if not isinstance(ids, list) or len(ids) > 5000 or any(not isinstance(i, str) or i not in pending or pending[i]['photoId'] != ident for i in ids):
                        raise PhotoError('Una propuesta ya no está pendiente. Actualiza la revisión.', 409)
                    # A crowded photo may have more than 100 existing detections.
                    # Permit one decision per detection, plus up to 100 manual additions.
                    face_count = db.execute('SELECT COUNT(*) FROM face_detections WHERE photo=?', (ident,)).fetchone()[0]
                    if (type(item['delete']) is not bool or not isinstance(item['changes'], list) or
                            len(item['changes']) > face_count + 100 or
                            sum(isinstance(change, dict) and change.get('action') == 'add' for change in item['changes']) > 100):
                        raise PhotoError('Cambios de foto inválidos.')
                    prepared.append((item, photo))
                # Check unnamed groups before changing any face in those groups.
                groups = set()
                for item in people:
                    if not isinstance(item, dict) or set(item) not in ({'id', 'name'}, {'id', 'personId'}): raise PhotoError('Persona inválida.')
                    ident = item['id']
                    if not isinstance(ident, str) or ident in groups: raise PhotoError('Persona repetida.')
                    groups.add(ident)
                    person = db.execute('SELECT id, name FROM people WHERE id=?', (ident,)).fetchone()
                    if not person or is_identified_person(person) or ident.startswith('apple-'):
                        raise PhotoError('Esta persona ya se identificó. Actualiza la revisión.', 409)
                    if 'name' in item:
                        name = clean_name(item['name'])
                        if not is_identified_person({'id': 'new', 'name': name}): raise PhotoError('Escribe un nombre para esta persona.')
                    else:
                        target = db.execute('SELECT id, name FROM people WHERE id=?', (item['personId'],)).fetchone() if isinstance(item['personId'], str) else None
                        if not target or not is_identified_person(target): raise PhotoError('Selecciona una persona identificada.')
                for item, photo in prepared:
                    if item['delete']:
                        library._delete_photo_rows(db, [photo['id']]); continue
                    add_review_albums(library, db, photo['id'], item.get('albums', []))
                    if item['reviewIds']: photo_reviews.confirm(db, item['reviewIds'])
                    changed_faces = set()
                    for change in item['changes']:
                        if not isinstance(change, dict): raise PhotoError('Cambio de cara inválido.')
                        action = change.get('action'); keys = set(change)
                        if not (action == 'remove' and keys == {'action', 'faceId'} or
                                action == 'assign' and keys in ({'action', 'faceId', 'personId'}, {'action', 'faceId', 'name'}) or
                                action == 'add' and keys in ({'action', 'box', 'personId'}, {'action', 'box', 'name'})):
                            raise PhotoError('Cambio de cara inválido.')
                        if action != 'add':
                            face = change['faceId']
                            if not isinstance(face, str) or face in changed_faces: raise PhotoError('Cara repetida.')
                            changed_faces.add(face)
                        assignment = {k: v for k, v in change.items() if k not in ('action', 'faceId')}
                        if action == 'add': library.add_face(photo['id'], assignment, db=db)
                        elif action == 'assign': library.assign_face(photo['id'], face, assignment, db=db)
                        else: library.remove_face(photo['id'], face, db=db)
                    save_image(library, db, photo, item['edits'], created)
                    if 'metadata' in item: library.update_photo_metadata(photo['id'], item['metadata'], db=db)
                    if item['reviewIds']:
                        batch = next((pending[i]['batchId'] for i in item['reviewIds']), None)
                        db.execute('UPDATE photo_reviews SET batch=? WHERE photo=? AND face IS NULL AND reviewed=0', (batch, photo['id']))
                for item in people:
                    if 'name' in item:
                        # Reuse an existing name rather than creating duplicate identities.
                        name = clean_name(item['name'])
                        target = next((p['id'] for p in db.execute('SELECT id, name FROM people') if is_identified_person(p) and p['name'].casefold() == name.casefold()), None)
                        if target: library._merge_people_rows(db, [item['id']], target)
                        else:
                            db.execute('UPDATE people SET name=? WHERE id=?', (name, item['id']))
                            db.execute('UPDATE face_detections SET manual=1 WHERE person=?', (item['id'],))
                            for row in db.execute('SELECT DISTINCT photo FROM face_detections WHERE person=?', (item['id'],)).fetchall():
                                library._sync_face_links(row['photo'], db)
                    else: library._merge_people_rows(db, [item['id']], item['personId'])
                result = {'ok': True, 'applied': len(photos) + len(people)}
                db.execute('INSERT INTO photo_review_batches VALUES (?,?,?)', (request_id, payload, json.dumps(result)))
        except Exception:
            for path in created: path.unlink(missing_ok=True)
            raise
        if any(item['delete'] for item in photos): library.cleanup_deleted()
    return result
