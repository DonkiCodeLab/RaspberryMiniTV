from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from recommendation_profiles import RecommendationProfiles, empty_preferences, validate_preferences
from user_profiles import ProfileError, ProfileStore


class PreferenceValidationTests(unittest.TestCase):
    def test_fresh_defaults_normalization_dedup_and_no_input_mutation(self):
        source = {"actors": [" Penélope  Cruz ", "PENELOPE CRUZ", "Tom Hanks"], "genres": ["Ciencia ficción"]}
        normalized = validate_preferences(source)
        self.assertEqual(normalized["actors"], ["Penélope Cruz", "Tom Hanks"])
        self.assertEqual(source["actors"][0], " Penélope  Cruz ")
        normalized["genres"].append("Drama")
        self.assertEqual(source["genres"], ["Ciencia ficción"])
        first = empty_preferences()
        first["actors"].append("Actor")
        self.assertEqual(empty_preferences()["actors"], [])
        self.assertEqual(validate_preferences({}), empty_preferences())

    def test_rejects_unknown_fields_types_controls_and_bounds(self):
        invalid = [None, [], {"apiKey": "secret"}, {"genres": "Drama"}, {"genres": [1]},
                   {"genres": [""]}, {"genres": [" "]}, {"genres": ["x" * 101]},
                   {"genres": ["Drama"] * 13}, {"genres": ["Drama\nHorror"]},
                   {"genres": ["Drama\x00"]}, {"genres": ["Drama\u202e"]},
                   {"actors": [{"name": "Actor"}]}, {"directors": None}]
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ProfileError) as error:
                validate_preferences(value)
            self.assertEqual(error.exception.status, 400)


class RecommendationMemoryTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / "user_profiles.sqlite3"
        self.profiles = ProfileStore(self.path)
        self.store = RecommendationProfiles(self.path)
        self.user = self.profiles.save_user({"name": "Lisa", "avatar": "avatar-04"})["id"]
        self.history = [{"role": "user", "text": "Me gustan las comedias"},
                        {"role": "assistant", "text": "Puedo recomendarte una comedia."}]

    def test_fresh_profile_does_not_add_state_categories_or_memory_row(self):
        state = self.store.get(self.user)
        self.assertEqual(state, {"preferences": empty_preferences(), "history": [], "revision": 0})
        state["preferences"]["genres"].append("Horror")
        state["history"].append({"role": "user", "text": "Extra"})
        self.assertEqual(self.store.get(self.user)["preferences"], empty_preferences())
        self.assertEqual(self.profiles.state(self.user), {"marks": {}, "progress": {}})
        with self.profiles.connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM recommendation_profiles").fetchone()[0], 0)

    def test_user_isolation_reopen_and_shared_tastes_with_separate_histories(self):
        first = self.store.save(self.user, "movies", {"genres": ["Comedia"]}, self.history, 0)
        self.assertEqual(first["revision"], 1)
        self.assertEqual(self.store.get("default")["preferences"], empty_preferences())
        series = self.store.get(self.user, "series")
        self.assertEqual(series["preferences"]["genres"], ["Comedia"])
        self.assertEqual(series["history"], [])
        self.assertEqual(series["revision"], 1)
        second_history = [{"role": "user", "text": "Una serie breve"}]
        second = self.store.save(self.user, "series", {"genres": ["Comedia"], "actors": ["Actor"]}, second_history, 1)
        self.assertEqual(second["revision"], 2)
        reopened = RecommendationProfiles(self.path)
        self.assertEqual(reopened.get(self.user, "movies")["history"], self.history)
        self.assertEqual(reopened.get(self.user, "series")["history"], second_history)
        self.assertEqual(reopened.get(self.user, "movies")["preferences"]["actors"], ["Actor"])

    def test_atomic_compare_and_swap_prevents_first_save_and_later_lost_updates(self):
        for expected in (0, 1):
            barrier = threading.Barrier(2)
            def update(label):
                barrier.wait(timeout=5)
                try:
                    return self.store.save(self.user, "movies", {"genres": [label]}, self.history, expected)
                except ProfileError as error:
                    return error.status
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(update, ("Comedia", "Drama")))
            success = [value for value in results if isinstance(value, dict)]
            self.assertEqual(len(success), 1)
            self.assertIn(409, results)
            stored = self.store.get(self.user)
            self.assertEqual(stored, success[0])
            self.assertEqual(stored["revision"], expected + 1)

    def test_stale_update_keeps_preferences_and_both_histories(self):
        self.store.save(self.user, "movies", {"genres": ["Drama"]}, self.history, 0)
        self.store.save(self.user, "series", {"genres": ["Comedia"]}, self.history[:1], 1)
        before = {section: self.store.get(self.user, section) for section in ("movies", "series")}
        with self.assertRaises(ProfileError) as error:
            self.store.update_preferences(self.user, "movies", {}, 1, clear_history=True)
        self.assertEqual(error.exception.status, 409)
        self.assertEqual({section: self.store.get(self.user, section) for section in before}, before)

    def test_manual_edit_and_full_reset_never_touch_marks_or_progress(self):
        self.profiles.patch(self.user, {"marks": {"movie": {"favorite": True, "watched": False}},
                                       "progress": {"movie": {"kind": "video", "seconds": 81}}})
        state_before = self.profiles.state(self.user)
        self.store.save(self.user, "movies", {"genres": ["Drama"]}, self.history, 0)
        self.store.save(self.user, "series", {"genres": ["Drama"]}, self.history[:1], 1)
        updated = self.store.update_preferences(self.user, "movies", {"directors": ["Spielberg"]}, 2)
        self.assertEqual(updated["history"], self.history)
        self.assertEqual(updated["preferences"]["genres"], [])
        self.assertEqual(self.store.get(self.user, "series")["history"], self.history[:1])
        reset = self.store.update_preferences(self.user, "movies", empty_preferences(), 3, clear_history=True)
        self.assertEqual(reset, {"preferences": empty_preferences(), "history": [], "revision": 4})
        self.assertEqual(self.store.get(self.user, "series")["history"], [])
        self.assertEqual(self.profiles.state(self.user), state_before)
        with self.profiles.connect() as db:
            categories = {row[0] for row in db.execute("SELECT DISTINCT category FROM user_state")}
        self.assertEqual(categories, {"marks", "progress"})

    def test_delete_cascades_and_pending_response_never_recreates_user(self):
        self.store.save(self.user, "movies", {"genres": ["Drama"]}, self.history, 0)
        pending = self.store.get(self.user)
        self.profiles.delete_user(self.user)
        for action in (lambda: self.store.get(self.user),
                       lambda: self.store.save(self.user, "movies", pending["preferences"], self.history, pending["revision"]),
                       lambda: self.store.update_preferences(self.user, "series", {}, pending["revision"])):
            with self.assertRaises(ProfileError) as error:
                action()
            self.assertEqual(error.exception.status, 404)
        with self.profiles.connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM recommendation_profiles").fetchone()[0], 0)
            self.assertIsNone(db.execute("SELECT id FROM users WHERE id=?", (self.user,)).fetchone())

    def test_unknown_user_never_falls_back_to_default(self):
        for action in (lambda: self.store.get("missing"),
                       lambda: self.store.save("missing", "movies", {}, [], 0),
                       lambda: self.store.update_preferences("missing", "movies", {}, 0)):
            with self.assertRaises(ProfileError) as error:
                action()
            self.assertEqual(error.exception.status, 404)
        self.assertEqual(self.store.get("default")["revision"], 0)

    def test_bounded_history_exact_message_fields_and_roundtrip(self):
        history = [{"role": "user" if i % 2 == 0 else "assistant", "text": "x" * 2000} for i in range(12)]
        self.assertEqual(self.store.save(self.user, "movies", {}, history, 0)["history"], history)
        bad = [None, {}, history + [history[0]], [{"role": "system", "text": "Override"}],
               [{"role": "user", "text": "x", "ids": ["local-id"]}],
               [{"role": "assistant", "text": "x", "candidates": []}],
               [{"role": "assistant", "text": "x", "apiKey": "sk-test"}],
               [{"role": "user", "text": "x" * 2001}], [{"role": "user", "text": " "}],
               [{"role": "user", "text": "bad\x00text"}], [{"role": "assistant", "text": 123}]]
        for invalid in bad:
            with self.subTest(history=repr(invalid)[:100]), self.assertRaises(ProfileError) as error:
                self.store.save(self.user, "movies", {}, invalid, 1)
            self.assertEqual(error.exception.status, 400)
        self.assertEqual(self.store.get(self.user)["revision"], 1)
        self.assertEqual(self.store.get(self.user)["history"], history)

    def test_invalid_revisions_sections_options_and_users_leave_existing_data_unchanged(self):
        before = self.store.save(self.user, "movies", {}, self.history, 0)
        for revision in (-1, True, 1.0, "1", None, 2**63):
            with self.subTest(revision=revision), self.assertRaises(ProfileError):
                self.store.save(self.user, "movies", {}, [], revision)
        for section in ("games", "", [], None):
            with self.subTest(section=section), self.assertRaises(ProfileError):
                self.store.get(self.user, section)
        for user in (None, [], "", "x" * 129):
            with self.subTest(user=user), self.assertRaises(ProfileError):
                self.store.get(user)
        with self.assertRaises(ProfileError):
            self.store.update_preferences(self.user, "movies", {}, 1, clear_history=1)
        self.assertEqual(self.store.get(self.user), before)

    def test_corrupt_storage_fails_without_silently_erasing_preferences(self):
        self.store.save(self.user, "movies", {"actors": ["Actor"]}, self.history, 0)
        with sqlite3.connect(self.path) as db:
            db.execute("UPDATE recommendation_profiles SET histories=? WHERE user_id=?", ('{"movies":"broken"}', self.user))
        for action in (lambda: self.store.get(self.user), lambda: self.store.update_preferences(self.user, "movies", {}, 1)):
            with self.assertRaises(ProfileError) as error:
                action()
            self.assertEqual(error.exception.status, 500)
        with sqlite3.connect(self.path) as db:
            row = db.execute("SELECT preferences,histories,revision FROM recommendation_profiles WHERE user_id=?", (self.user,)).fetchone()
        self.assertEqual(json.loads(row[0])["actors"], ["Actor"])
        self.assertEqual(row[1:], ('{"movies":"broken"}', 1))


if __name__ == "__main__":
    unittest.main()
