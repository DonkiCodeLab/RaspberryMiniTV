"""The guided review saves one photo atomically and protects unrelated proposals."""
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from flask import Flask
from werkzeug.datastructures import FileStorage

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from photo_library import PhotoLibrary, create_photo_blueprint


class ReviewWizardTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.store = PhotoLibrary(Path(temporary.name) / 'Pictures')
        files = []
        for index in range(3):
            stream = io.BytesIO()
            Image.new('RGB', (120, 80), (index * 30, 40, 60)).save(stream, 'PNG')
            stream.seek(0)
            files.append(FileStorage(stream=stream, filename=f'family-{index}.png'))
        self.store.upload(files, 'Familia')
        self.photos = self.store.snapshot()['photos']
        self.box = {'x': .1, 'y': .2, 'width': .2, 'height': .3}
        detections = [{'encoding': [value] * 128, 'box': {**self.box, 'x': x}} for value, x in [(0., .1), (1., .6)]]
        self.store.group_faces(self.photos[0]['id'], detections)
        for index, face in enumerate(self.store.photo_faces(self.photos[0]['id'])['faces']):
            self.store.rename_person(face['personId'], ['Ana', 'Luis'][index])
        self.store.group_faces(self.photos[1]['id'], detections)
        self.store.group_faces(self.photos[2]['id'], detections[:1])
        self.reviews = self.store.snapshot()['reviews']
        self.review = next(row for row in self.reviews if row['photoId'] == self.photos[1]['id'])
        self.other = next(row for row in self.reviews if row['photoId'] == self.review['photoId'] and row['id'] != self.review['id'])
        app = Flask(__name__)
        app.register_blueprint(create_photo_blueprint(lambda: self.store))
        self.client = app.test_client()

    def post(self, changes=None, review=None):
        return self.client.post('/pictures/reviews/resolve', json={'reviewId': review or self.review['id'], 'changes': changes or []})

    def test_approve_and_unknown_only_resolve_the_selected_face(self):
        self.assertEqual(self.post().status_code, 200)
        self.assertEqual(len(self.store.snapshot()['reviews']), 2)
        self.assertEqual(self.post([{'action': 'assign', 'faceId': self.other['faceId'], 'personId': 'unknown'}], self.other['id']).status_code, 200)
        self.assertEqual(len(self.store.snapshot()['reviews']), 1)
        faces = self.store.photo_faces(self.review['photoId'])['faces']
        self.assertTrue(all(face['manual'] for face in faces))
        self.assertEqual(next(face for face in faces if face['id'] == self.other['faceId'])['personId'], 'unknown')

    def test_save_corrections_and_new_faces_together_and_reuse_receipt_after_restart(self):
        changes = [{'action': 'assign', 'faceId': self.review['faceId'], 'name': 'Marta'},
                   {'action': 'add', 'box': self.box, 'name': 'Eva'},
                   {'action': 'assign', 'faceId': self.other['faceId'], 'personId': 'unknown'}]
        result = self.post(changes)
        self.assertEqual(result.status_code, 200, result.json)
        faces = self.store.photo_faces(self.review['photoId'])['faces']
        self.assertEqual({face['name'] for face in faces}, {'Marta', 'Eva', 'Desconocido'})
        self.assertEqual(len(self.store.snapshot()['reviews']), 1)
        restored = PhotoLibrary(self.store.root)
        self.assertEqual(restored.resolve_review({'reviewId': self.review['id'], 'changes': changes}), result.json)
        self.assertEqual(len(restored.photo_faces(self.review['photoId'])['faces']), 3)
        self.assertEqual(self.post().status_code, 409)

    def test_adding_other_faces_also_approves_current_proposal(self):
        result = self.post([{'action': 'add', 'box': self.box, 'name': 'Eva'}])
        self.assertEqual(result.status_code, 200, result.json)
        remaining = {row['id'] for row in self.store.snapshot()['reviews']}
        self.assertNotIn(self.review['id'], remaining)
        self.assertIn(self.other['id'], remaining)

    def test_invalid_later_change_rolls_back_names_faces_and_review(self):
        before = self.store.snapshot()
        invalid = [{'action': 'add', 'box': {}, 'name': 'Eva'},
                   {'action': 'assign', 'faceId': 'missing', 'personId': 'unknown'},
                   {'action': 'assign', 'faceId': self.other['faceId'], 'name': '../bad'},
                   {'action': 'assign', 'faceId': self.other['faceId'], 'personId': 'missing'}]
        for change in invalid:
            response = self.post([{'action': 'assign', 'faceId': self.review['faceId'], 'name': 'Never saved'}, change])
            self.assertIn(response.status_code, [400, 409], response.json)
            self.assertEqual(self.store.snapshot(), before)

    def test_foreign_photo_faces_and_duplicate_changes_are_rejected(self):
        foreign = next(row for row in self.reviews if row['photoId'] != self.review['photoId'])
        before = self.store.snapshot()
        self.assertEqual(self.post([{'action': 'remove', 'faceId': foreign['faceId']}]).status_code, 409)
        self.assertEqual(self.post([{'action': 'remove', 'faceId': self.review['faceId']}] * 2).status_code, 400)
        self.assertEqual(self.store.snapshot(), before)

    def test_remove_reference_keeps_original_and_other_faces(self):
        self.assertEqual(self.post([{'action': 'remove', 'faceId': self.review['faceId']}]).status_code, 200)
        self.assertEqual(len(self.store.photo_faces(self.review['photoId'])['faces']), 1)
        self.assertTrue((self.store.root / self.photos[1]['relativePath']).is_file())
        self.assertEqual(len(self.store.snapshot()['reviews']), 2)

    def test_stale_token_cannot_overwrite_external_correction(self):
        self.store.assign_face(self.review['photoId'], self.review['faceId'], {'name': 'Corrected elsewhere'})
        before = self.store.snapshot()
        self.assertEqual(self.post([{'action': 'assign', 'faceId': self.review['faceId'], 'personId': 'unknown'}]).status_code, 409)
        self.assertEqual(self.store.snapshot(), before)

    def test_storage_failure_rolls_back_every_edit_and_receipt(self):
        before = self.store.snapshot()
        with patch.object(self.store, 'add_face', side_effect=RuntimeError('storage failure')):
            with self.assertRaises(RuntimeError):
                self.store.resolve_review({'reviewId': self.review['id'], 'changes': [
                    {'action': 'assign', 'faceId': self.review['faceId'], 'name': 'Never saved'},
                    {'action': 'add', 'box': self.box, 'name': 'Eva'}]})
        self.assertEqual(self.store.snapshot(), before)
        self.assertEqual(self.post().status_code, 200)

    def test_removing_last_proposed_face_keeps_no_face_review_in_same_batch(self):
        review = next(row for row in self.reviews if row['photoId'] == self.photos[2]['id'])
        with self.store.db() as db:
            db.execute('UPDATE photo_reviews SET batch=? WHERE id=?', ('wizard-batch', review['id']))
        result = self.post([{'action': 'remove', 'faceId': review['faceId']}], review['id'])
        self.assertEqual(result.status_code, 200)
        pending = [row for row in self.store.snapshot()['reviews'] if row['photoId'] == review['photoId']]
        self.assertEqual(len(pending), 1)
        self.assertIsNone(pending[0]['faceId'])
        self.assertEqual(pending[0]['batchId'], 'wizard-batch')


class NoFacesReviewWizardTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.store = PhotoLibrary(Path(temporary.name) / 'Pictures')
        files = []
        for index in range(3):
            stream = io.BytesIO()
            Image.new('RGB', (120, 80), (index * 30, 70, 100)).save(stream, 'PNG')
            stream.seek(0)
            files.append(FileStorage(stream=stream, filename=f'empty-{index}.png'))
        self.store.upload(files, 'Paisajes')
        self.photos = self.store.snapshot()['photos']
        for photo in self.photos: self.store.group_faces(photo['id'], [])
        self.reviews = {row['photoId']: row for row in self.store.snapshot()['reviews']}
        self.historical = self.reviews[self.photos[0]['id']]
        self.store.confirm_reviews([self.historical['id']])
        self.review = self.reviews[self.photos[1]['id']]
        self.other = self.reviews[self.photos[2]['id']]
        self.box = {'x': .1, 'y': .2, 'width': .2, 'height': .3}
        app = Flask(__name__)
        app.register_blueprint(create_photo_blueprint(lambda: self.store))
        self.client = app.test_client()

    def post(self, changes=None, review=None):
        return self.client.post('/pictures/reviews/resolve', json={'reviewId': review or self.review['id'], 'changes': changes or []})

    def test_mark_reviewed_keeps_original_and_history_and_survives_restart(self):
        self.assertEqual(self.post().status_code, 200)
        restored = PhotoLibrary(self.store.root)
        self.assertEqual([row['id'] for row in restored.snapshot()['reviews']], [self.other['id']])
        self.assertEqual(len(restored.snapshot()['photos']), 3)
        self.assertTrue((restored.root / self.photos[1]['relativePath']).is_file())
        self.assertEqual(restored.photo_faces(self.review['photoId'])['faces'], [])
        self.assertEqual(self.post().status_code, 200)  # lost response retry
        self.store.group_faces(self.review['photoId'], [])
        self.assertEqual([row['id'] for row in self.store.snapshot()['reviews']], [self.other['id']])

    def test_adding_faces_saves_all_people_and_finishes_review_without_duplicates(self):
        existing = self.store.add_face(self.photos[0]['id'], {'name': 'Ana', 'box': self.box})['personId']
        changes = [{'action': 'add', 'box': self.box, 'name': 'Eva'},
                   {'action': 'add', 'box': {**self.box, 'x': .6}, 'personId': existing}]
        result = self.post(changes)
        self.assertEqual(result.status_code, 200, result.json)
        self.assertEqual(self.post(changes).json, result.json)
        restored = PhotoLibrary(self.store.root)
        faces = restored.photo_faces(self.review['photoId'])['faces']
        self.assertEqual({face['name'] for face in faces}, {'Ana', 'Eva'})
        self.assertEqual(len(faces), 2)
        self.assertTrue(all(face['manual'] for face in faces))
        self.assertEqual([row['id'] for row in restored.snapshot()['reviews']], [self.other['id']])

    def test_later_invalid_face_rolls_back_confirmation_first_face_and_new_person(self):
        before = self.store.snapshot()
        result = self.post([{'action': 'add', 'box': self.box, 'name': 'Never saved'},
                            {'action': 'add', 'box': {}, 'name': 'Eva'}])
        self.assertEqual(result.status_code, 400)
        self.assertEqual(self.store.snapshot(), before)
        self.assertEqual(self.post([{'action': 'add', 'box': self.box, 'name': 'Eva'}]).status_code, 200)

    def test_historical_or_externally_edited_photo_is_not_revisited(self):
        self.assertEqual(self.post(review=self.historical['id']).status_code, 409)
        self.store.add_face(self.review['photoId'], {'name': 'Eva', 'box': self.box})
        before = self.store.snapshot()
        self.assertEqual(self.post().status_code, 409)
        self.assertEqual(self.store.snapshot(), before)

    def test_no_face_review_cannot_modify_a_face_in_another_photo(self):
        foreign = self.store.add_face(self.photos[0]['id'], {'name': 'Ana', 'box': self.box})
        before = self.store.snapshot()
        self.assertEqual(self.post([{'action': 'remove', 'faceId': foreign['faceId']}]).status_code, 400)
        self.assertEqual(self.store.snapshot(), before)

    def test_gallery_delete_removes_new_entry_and_original_without_touching_other_pending(self):
        response = self.client.post('/pictures/photos/delete', json={'ids': [self.review['photoId']], 'scope': 'gallery'})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertFalse((self.store.root / self.photos[1]['relativePath']).exists())
        self.assertEqual([row['id'] for row in self.store.snapshot()['reviews']], [self.other['id']])
        self.assertEqual(len(self.store.snapshot()['photos']), 2)


if __name__ == '__main__': unittest.main()
