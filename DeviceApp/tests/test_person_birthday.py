from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from photo_library import PhotoLibrary, PhotoError, create_photo_blueprint
from flask import Flask


class PersonBirthdayTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.store = PhotoLibrary(Path(temp.name) / 'Pictures')
        with self.store.db() as db:
            db.executemany('INSERT INTO people VALUES (?, ?, ?)', [('one', 'Ana', 1), ('two', 'Eva', 2)])
        app = Flask(__name__)
        app.register_blueprint(create_photo_blueprint(lambda: self.store))
        self.client = app.test_client()

    def test_api_persists_old_date_after_reopening_and_allows_removal(self):
        response = self.client.post('/pictures/people/one/birthday', json={'birthDate': '1850-10-23'})
        self.assertEqual(response.status_code, 200)
        restored = PhotoLibrary(self.store.root)
        with restored.db() as db:
            self.assertEqual(db.execute('SELECT birth_date FROM person_birthdays WHERE person=?', ('one',)).fetchone()[0], '1850-10-23')
        self.assertEqual(self.client.post('/pictures/people/one/birthday', json={'birthDate': ''}).status_code, 200)
        with self.store.db() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM person_birthdays').fetchone()[0], 0)

    def test_invalid_dates_and_reserved_or_missing_people(self):
        for value in [None, 123, '1900-02-29', '2025-04-31', '9999-01-01', '0000-01-01', '1950-1-1']:
            self.assertEqual(self.client.post('/pictures/people/one/birthday', json={'birthDate': value}).status_code, 400, value)
        self.assertEqual(self.client.post('/pictures/people/unknown/birthday', json={'birthDate': '2000-01-01'}).status_code, 400)
        self.assertEqual(self.client.post('/pictures/people/missing/birthday', json={'birthDate': '2000-01-01'}).status_code, 404)

    def test_merge_inherits_date_and_preserves_destination_date(self):
        self.store.set_person_birthday('one', '0001-01-01')
        self.store.merge_people('one', 'two')
        with self.store.db() as db:
            self.assertEqual(dict(db.execute('SELECT person, birth_date FROM person_birthdays')), {'two': '0001-01-01'})
        with self.store.db() as db:
            db.execute('INSERT INTO people VALUES (?, ?, ?)', ('three', 'Luz', 3))
        self.store.set_person_birthday('three', '1900-01-01')
        self.store.merge_people('three', 'two')
        with self.store.db() as db:
            self.assertEqual(dict(db.execute('SELECT person, birth_date FROM person_birthdays')), {'two': '0001-01-01'})


if __name__ == '__main__':
    unittest.main()
