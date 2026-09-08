import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('recovery', Path(__file__).parents[1] / 'recover_movie_profiles.py')
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)

class RecoveryTests(unittest.TestCase):
    def test_original_numeric_profile_wins_over_scanned_placeholder(self):
        path = 'Movies/alien.mp4'
        backup = {'library': [{'id': 348, 'name': 'Alien', 'fileRelativePath': path}], 'profiles': {
            '348': {'name': 'Alien 1: El octavo pasajero', 'heroImage': 'custom.jpg', 'imdbUrl': 'https://imdb.com/title/tt0078748/', 'rottenTomatoesUrl': 'https://rottentomatoes.com/m/alien', 'heroImageCrop': {'zoom': 2}},
            path: {'name': 'alien'},
        }}
        original = {'movies': {path: {'name': 'alien'}, 'Movies/new.mp4': {'name': 'New'}}, 'series': {'series': {'name': 'Series'}}}
        result, restored, skipped = recovery.recover_profiles(original, backup, {path})
        self.assertEqual(result['movies'][path]['name'], 'Alien 1: El octavo pasajero')
        for field in recovery.FIELDS:
            self.assertEqual(result['movies'][path][field], backup['profiles']['348'][field])
        self.assertEqual(result['movies']['Movies/new.mp4'], original['movies']['Movies/new.mp4'])
        self.assertEqual(result['series'], original['series'])
        self.assertEqual(original['movies'][path], {'name': 'alien'})
        self.assertEqual((restored, skipped), ([path], []))

    def test_conflicting_ids_and_missing_files_are_not_assigned(self):
        backup = {'library': [{'id': 1, 'fileRelativePath': p} for p in ['Movies/a.mp4', 'Movies/missing.mp4']]}
        original = {'movies': {'Movies/a.mp4': {'tmdbId': 2, 'name': 'Other'}}}
        result, restored, skipped = recovery.recover_profiles(original, backup, {'Movies/a.mp4'})
        self.assertEqual(result, original)
        self.assertEqual(restored, [])
        self.assertEqual(len(skipped), 2)

    def test_duplicate_tmdb_ids_remain_separate_files_and_recovery_is_repeatable(self):
        paths = {'Movies/a.mp4', 'Movies/b.mp4'}
        backup = {'library': [{'id': 10, 'fileRelativePath': p} for p in paths]}
        result, _, _ = recovery.recover_profiles({}, backup, paths)
        self.assertEqual(set(result['movies']), paths)
        self.assertEqual(recovery.recover_profiles(result, backup, paths)[0], result)

if __name__ == '__main__': unittest.main()
