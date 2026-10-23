"""Grouping regressions on synthetic descriptors, never a visual-accuracy benchmark."""
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import photo_face_matching as matching
from photo_faces import FacePaused
from photo_library import PhotoLibrary


BOX = {'x': .1, 'y': .2, 'width': .2, 'height': .3}


def detection(value, box=None):
    return {'encoding': [value] + [0.] * 127, 'box': box or dict(BOX)}


class FaceMatchingTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.store = PhotoLibrary(Path(temp.name) / 'Pictures')

    def photo(self, name, taken=None):
        path = self.store.root / (name + '.png')
        Image.new('RGB', (100, 100)).save(path)
        with self.store.db() as db:
            return self.store._insert(db, path.name, 'gallery', path.name,
                metadata={'width': 100, 'height': 100, 'takenAt': taken})

    def face(self, photo):
        return self.store.photo_faces(photo)['faces'][0]

    def grouped(self, name, value):
        photo = self.photo(name)
        self.store.group_faces(photo, [detection(value)])
        return photo, self.face(photo)['personId']

    def test_weak_single_link_does_not_extend_an_automatic_chain(self):
        _, person = self.grouped('A', 0.)
        _, near = self.grouped('B', .35)
        _, far = self.grouped('C', .8)
        self.assertEqual(person, near)
        self.assertNotEqual(person, far)

    def test_two_close_identities_leave_a_separate_provisional_group(self):
        _, first = self.grouped('A', 0.)
        _, second = self.grouped('B', .4)
        _, uncertain = self.grouped('C', .2)
        self.assertNotEqual(first, second)
        self.assertNotIn(uncertain, (first, second))

    def test_margin_considers_a_competitor_just_outside_the_acceptance_threshold(self):
        a, first = self.grouped('A', 0.)
        self.store.assign_face(a, self.face(a)['id'], {'personId': 'unknown'})
        b, second = self.grouped('B', .96)
        self.store.assign_face(b, self.face(b)['id'], {'name': 'Second'})
        # Return A to a distinct confirmed identity after seeding the second.
        first = self.store.assign_face(a, self.face(a)['id'], {'name': 'First'})['personId']
        _, uncertain = self.grouped('C', .46)
        self.assertNotIn(uncertain, (first, self.face(b)['personId']))

    def test_moderate_match_needs_two_photos_or_one_confirmed_reference(self):
        a, first = self.grouped('A', 0.)
        _, corroborated = self.grouped('B', .05)
        _, supported = self.grouped('C', .44)
        self.assertEqual((corroborated, supported), (first, first))
        d, isolated = self.grouped('D', 2.)
        _, unsupported = self.grouped('E', 2.44)
        self.assertNotEqual(isolated, unsupported)
        self.store.assign_face(d, self.face(d)['id'], {'name': 'Confirmed'})
        # Remove the conflicting automatic group from the identity candidates.
        self.store.delete_people([unsupported])
        _, trusted = self.grouped('F', 2.44)
        self.assertEqual(trusted, self.face(d)['personId'])

    def test_two_automatic_samples_from_one_photo_do_not_count_as_two_photos(self):
        import json
        references = [{'person': 'A', 'photo': 'collage', 'manual': 0,
                       'encoding': json.dumps(detection(value)['encoding'])} for value in (0., .05)]
        candidates = matching.rank_candidates([detection(.44)], references)[0]
        self.assertIsNone(matching.choose_person(candidates, set()))

    def test_confirmed_rectangle_survives_vector_drift_without_duplicates(self):
        photo, _ = self.grouped('A', 0.)
        original = self.face(photo)
        person = self.store.assign_face(photo, original['id'], {'name': 'Confirmed'})['personId']
        self.store.set_person_cover(person, photo)
        self.store.group_faces(photo, [detection(.8), detection(.81)])
        faces = self.store.photo_faces(photo)['faces']
        self.assertEqual(len(faces), 1)
        self.assertEqual((faces[0]['id'], faces[0]['personId'], faces[0]['box'], faces[0]['manual']),
                         (original['id'], person, BOX, True))
        self.assertEqual(self.store.snapshot()['people'][0]['coverPhotoId'], photo)

    def test_removed_detection_stays_rejected_after_restart_and_can_be_restored_manually(self):
        photo, _ = self.grouped('A', 0.)
        self.store.remove_face(photo, self.face(photo)['id'])
        self.store = PhotoLibrary(self.store.root)
        self.store.group_faces(photo, [detection(0.)])
        self.assertEqual(self.store.photo_faces(photo)['faces'], [])
        other, _ = self.grouped('B', 0.)
        self.assertEqual(len(self.store.photo_faces(other)['faces']), 1)
        restored = self.store.add_face(photo, {'box': BOX, 'name': 'Restored'})
        self.store.group_faces(photo, [detection(0.)])
        self.assertEqual(self.face(photo)['id'], restored['faceId'])
        with self.store.db() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM face_rejections WHERE photo=?', (photo,)).fetchone()[0], 0)

    def test_rejections_are_scoped_to_geometry_and_cascade_when_the_photo_is_deleted(self):
        photo, _ = self.grouped('A', 0.)
        self.store.remove_face(photo, self.face(photo)['id'])
        self.store.group_faces(photo, [detection(0., {**BOX, 'x': .7})])
        self.assertEqual(len(self.store.photo_faces(photo)['faces']), 1)
        self.store.delete_photos([photo], 'gallery')
        with self.store.db() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM face_rejections').fetchone()[0], 0)

    def test_incompatible_and_malformed_vectors_never_erase_existing_faces(self):
        photo, _ = self.grouped('A', 0.)
        before = self.store.photo_faces(photo)
        bad_vectors = [[0.] * 512, [float('nan')] * 128, [True] * 128, ['0'] * 128, None]
        for vector in bad_vectors:
            with self.subTest(vector=str(vector)[:20]), self.assertRaises(ValueError):
                self.store.group_faces(photo, [detection(0.), {'encoding': vector, 'box': BOX}])
            self.assertEqual(self.store.photo_faces(photo), before)
        pending = self.photo('B')
        with self.assertRaises(ValueError):
            self.store.group_faces(pending, [{'encoding': [0.] * 512, 'box': BOX}])
        self.assertEqual(self.store.photo_faces(pending)['state'], 'pending')

    def test_known_birth_date_excludes_impossible_matches_but_missing_capture_date_does_not(self):
        _, person = self.grouped('A', 0.)
        self.store.set_person_birthday(person, '2020-01-01')
        old_photo = self.photo('Old', '2010-02-03T12:00:00+01:00')
        self.store.group_faces(old_photo, [detection(0.)])
        self.assertNotEqual(self.face(old_photo)['personId'], person)
        self.store.delete_people([self.face(old_photo)['personId']])
        _, unknown_date = self.grouped('NoDate', 0.)
        self.assertEqual(unknown_date, person)

    def test_matching_releases_catalogue_lock_and_retries_after_a_concurrent_merge(self):
        _, source = self.grouped('A', 0.)
        _, target = self.grouped('B', 2.)
        photo = self.photo('C')
        entered, release = threading.Event(), threading.Event()
        errors, calls = [], []
        original = matching.rank_candidates
        def blocked(*args, **kwargs):
            calls.append(True)
            if len(calls) == 1:
                entered.set()
                if not release.wait(5): raise RuntimeError('Matcher was not released')
            return original(*args, **kwargs)
        def run():
            try: self.store.group_faces(photo, [detection(0.)])
            except Exception as error: errors.append(error)
        with patch.object(matching, 'rank_candidates', side_effect=blocked):
            thread = threading.Thread(target=run)
            thread.start()
            try:
                self.assertTrue(entered.wait(5))
                acquired = self.store.lock.acquire(timeout=1)
                self.assertTrue(acquired, 'Vector matching held the catalogue lock')
                try:
                    self.store.status()
                    self.store.merge_people(source, target)
                finally:
                    self.store.lock.release()
            finally:
                release.set()
                thread.join(5)
        self.assertFalse(thread.is_alive())
        self.assertEqual(errors, [])
        self.assertGreaterEqual(len(calls), 2)
        self.assertEqual(self.face(photo)['personId'], target)

    def test_pause_during_comparison_does_not_commit_faces_or_progress(self):
        self.grouped('A', 0.)
        photo = self.photo('B')
        stop = threading.Event()
        original = matching.rank_candidates
        def pause(*args, **kwargs):
            stop.set()
            return original(*args, **kwargs)
        with patch.object(matching, 'rank_candidates', side_effect=pause), self.assertRaises(FacePaused):
            self.store.group_faces(photo, [detection(0.)], stop=stop, job='batch')
        self.assertEqual(self.store.photo_faces(photo)['state'], 'pending')
        self.assertEqual(self.store.photo_faces(photo)['faces'], [])


if __name__ == '__main__':
    unittest.main()
