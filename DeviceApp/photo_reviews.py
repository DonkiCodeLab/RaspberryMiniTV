"""Persistent review queues for new matches and photos without faces."""
import json
import time
import uuid


def initialize(db):
    db.executescript('''
        CREATE TABLE IF NOT EXISTS photo_reviews (
            id TEXT PRIMARY KEY, photo TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
            face TEXT UNIQUE, person TEXT REFERENCES people(id) ON DELETE CASCADE,
            batch TEXT, created REAL NOT NULL, reviewed INTEGER NOT NULL DEFAULT 0);
        CREATE INDEX IF NOT EXISTS photo_reviews_photo ON photo_reviews(photo);
        CREATE UNIQUE INDEX IF NOT EXISTS photo_reviews_no_faces ON photo_reviews(photo) WHERE face IS NULL;
        CREATE TABLE IF NOT EXISTS face_review_batch (
            id INTEGER PRIMARY KEY CHECK(id=1), token TEXT NOT NULL, people TEXT NOT NULL);
    ''')
    if not db.execute("SELECT 1 FROM photo_library_migrations WHERE name='photo-reviews-v1'").fetchone():
        # Existing photos belong to the historical view, without claiming they
        # were explicitly validated by the user.
        for row in db.execute("""SELECT id FROM photos WHERE source IS NULL AND face_state='done'
                AND NOT EXISTS (SELECT 1 FROM face_detections WHERE photo=photos.id)""").fetchall():
            db.execute('INSERT INTO photo_reviews (id, photo, created, reviewed) VALUES (?,?,?,1)',
                       (uuid.uuid4().hex, row['id'], time.time()))
        db.execute("INSERT INTO photo_library_migrations VALUES ('photo-reviews-v1')")


def existing_people(db):
    return {row[0] for row in db.execute("""SELECT DISTINCT person FROM face_detections
        WHERE person IS NOT NULL AND person!='unknown' AND person NOT LIKE 'apple-%'""")}


def start_batch(db):
    db.execute('INSERT OR REPLACE INTO face_review_batch VALUES (1,?,?)',
               (uuid.uuid4().hex, json.dumps(sorted(existing_people(db)))))


def context(db, photo):
    batch = db.execute("""SELECT token, people FROM face_review_batch WHERE EXISTS
        (SELECT 1 FROM face_analysis_items WHERE photo=? AND state='pending')""", (photo,)).fetchone()
    return (batch['token'], set(json.loads(batch['people']))) if batch else (None, existing_people(db))


def add_match(db, photo, face, person, batch):
    db.execute('INSERT OR IGNORE INTO photo_reviews (id, photo, face, person, batch, created) VALUES (?,?,?,?,?,?)',
               (uuid.uuid4().hex, photo, face, person, batch, time.time()))


def sync(db, photo, batch=None):
    # Face IDs survive re-detection, but face rows are replaced in a transaction;
    # a foreign key to those rows would discard outstanding reviews prematurely.
    db.execute('''DELETE FROM photo_reviews WHERE photo=? AND face IS NOT NULL AND NOT EXISTS
        (SELECT 1 FROM face_detections f WHERE f.id=photo_reviews.face AND f.photo=photo_reviews.photo
         AND f.person=photo_reviews.person AND f.manual=0)''', (photo,))
    no_faces = db.execute("""SELECT 1 FROM photos WHERE id=? AND source IS NULL AND face_state='done'
        AND NOT EXISTS (SELECT 1 FROM face_detections WHERE photo=photos.id)""", (photo,)).fetchone()
    if no_faces:
        db.execute('INSERT OR IGNORE INTO photo_reviews (id, photo, batch, created) VALUES (?,?,?,?)',
                   (uuid.uuid4().hex, photo, batch, time.time()))
    else:
        db.execute('DELETE FROM photo_reviews WHERE photo=? AND face IS NULL', (photo,))


def pending(db, photo=None):
    return [dict(row) for row in db.execute('''SELECT r.id, r.photo AS photoId, r.face AS faceId,
        r.person AS personId, r.batch AS batchId, r.created AS createdAt
        FROM photo_reviews r JOIN photos p ON p.id=r.photo
        LEFT JOIN face_detections f ON f.id=r.face AND f.photo=r.photo
        WHERE r.reviewed=0 AND (? IS NULL OR r.photo=?) AND ((r.face IS NOT NULL AND f.person=r.person AND f.manual=0)
            OR (r.face IS NULL AND p.source IS NULL AND p.face_state='done'
                AND NOT EXISTS (SELECT 1 FROM face_detections WHERE photo=r.photo)))
        ORDER BY r.created DESC, r.id''', (photo, photo))]


def confirm(db, ids):
    """Validate the entire selection before changing anything; tokens reject stale UI."""
    if not isinstance(ids, list) or not 1 <= len(ids) <= 5000 or any(not isinstance(i, str) or not i for i in ids):
        raise ValueError('Selecciona entre 1 y 5000 elementos para validar.')
    selection = set(ids)
    rows = [row for row in pending(db) if row['id'] in selection]
    if len(rows) != len(selection):
        raise LookupError('La selección ha cambiado. Actualiza la biblioteca y revisa los pendientes.')
    for row in rows:
        if row['faceId']:
            # An explicit confirmation protects the match on subsequent detection.
            db.execute('UPDATE face_detections SET manual=1 WHERE id=?', (row['faceId'],))
            db.execute('DELETE FROM photo_reviews WHERE id=?', (row['id'],))
        else:
            db.execute('UPDATE photo_reviews SET reviewed=1 WHERE id=?', (row['id'],))
    return len(rows)
