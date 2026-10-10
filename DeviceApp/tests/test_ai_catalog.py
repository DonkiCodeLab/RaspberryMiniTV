import hashlib
import json
import sys
import tempfile
import unittest
import urllib.parse
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ai_catalog import SECTION_FIELDS, build_catalog, execute_plan
from tmdb_cache import TmdbCache


def condition(field, value, op="contains"):
    return {"field": field, "value": value, "op": op}


def plan(*groups, intent="filter"):
    return {"intent": intent, "message": "", "groups": [{"conditions": list(group)} for group in groups]}


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / "metadata").mkdir()
        self.cache = TmdbCache(self.root, lambda: self.fail("Credentials must not be accessed"))
        self.movie = {"id": 98, "title": "Gladiador", "original_title": "Gladiator", "release_date": "2000-05-04",
                      "overview": "Un general romano busca justicia.", "genres": [{"id": 28, "name": "Acción"}]}
        self.credits = {"id": 98, "cast": [{"id": 934, "name": "Russell Crowe", "original_name": "Russell Crowe", "character": "Maximus"}],
                        "crew": [{"id": 578, "name": "Ridley Scott", "job": "Director"},
                                 {"id": 101, "name": "David Franzoni", "job": "Screenplay"},
                                 {"id": 102, "name": "Other Director", "job": "Assistant Director"}]}
        self.snapshot = {"movieRootFiles": [{"relativePath": "Movies/gladiador.mp4", "file": "gladiador.mp4", "tmdbId": 98}],
                         "mediaLibrary": {"movies": {"Movies/gladiador.mp4": {"name": "Mi Gladiador", "tmdbId": 98},
                                                      "Movies/deleted.mp4": {"name": "Deleted", "tmdbId": 98}}}}

    def cache_json(self, path, data, params=None):
        key = hashlib.sha256((path + "?" + urllib.parse.urlencode(sorted((params or {}).items()))).encode()).hexdigest()
        (self.root / "metadata" / (key + ".json")).write_text(json.dumps(data))

    def cache_movie(self):
        self.cache_json("/movie/98", self.movie, {"language": "es-ES", "append_to_response": "external_ids"})
        self.cache_json("/movie/98/credits", self.credits)

    def test_movie_joins_scan_paths_with_profiles_and_raw_credits_without_io_side_effects(self):
        self.cache_movie()
        before = {path: path.read_bytes() for path in self.root.rglob("*") if path.is_file()}
        with patch.object(self.cache, "_download", side_effect=AssertionError("No network")):
            catalog = build_catalog("movies", self.snapshot, self.cache)
        self.assertEqual(catalog["missingMetadata"], 0)
        self.assertEqual(len(catalog["records"]), 1, "stale profile must not appear")
        record = catalog["records"][0]
        self.assertEqual(record["id"], "Movies/gladiador.mp4")
        self.assertEqual(record["fields"]["title"], ["Mi Gladiador", "Gladiador", "Gladiator"])
        self.assertEqual(record["fields"]["actor"], ["Russell Crowe"])
        self.assertEqual(record["fields"]["director"], ["Ridley Scott"])
        self.assertEqual(record["fields"]["writer"], ["David Franzoni"])
        self.assertEqual(record["fields"]["year"], 2000)
        self.assertIn("action", record["fields"]["genre"])
        self.assertEqual(before, {path: path.read_bytes() for path in self.root.rglob("*") if path.is_file()})

    def test_nested_movie_directory_profile_and_file_override_share_one_metadata_read(self):
        self.cache_movie()
        scan = {"movieDirectories": [{"relativePath": "Movies/collection", "videos": [
            {"relativePath": "Movies/collection/disc1.mp4", "file": "disc1.mp4"},
            {"relativePath": "Movies/collection/disc2.mp4", "file": "disc2.mp4", "tmdbId": 0},
        ]}], "movieRootFiles": [{"relativePath": "Movies/collection/disc1.mp4", "tmdbId": 98}],
            "mediaLibrary": {"movies": {"Movies/collection": {"name": "Collection", "tmdbId": 98},
                                         "Movies/collection/disc2.mp4": {"name": "Second disc"}}}}
        with patch.object(self.cache, "json", wraps=self.cache.json) as cached:
            records = build_catalog("movies", scan, self.cache)["records"]
        self.assertEqual([r["id"] for r in records], ["Movies/collection/disc1.mp4", "Movies/collection/disc2.mp4"])
        self.assertEqual(records[1]["fields"]["title"][0], "Second disc")
        self.assertEqual(records[1]["fields"]["actor"], ["Russell Crowe"])
        self.assertEqual(cached.call_count, 2, "duplicate editions read each cached detail once")
        self.assertTrue(all(call.kwargs == {"local_only": True} for call in cached.call_args_list))

    def test_appended_movie_credits_compatibility_does_not_promote_or_download(self):
        self.cache_json("/movie/98", {**self.movie, "credits": {key: value for key, value in self.credits.items() if key != "id"}},
                        {"append_to_response": "credits"})
        before = set(self.root.rglob("*"))
        catalog = build_catalog("movies", self.snapshot, self.cache)
        self.assertEqual(catalog["missingMetadata"], 0)
        self.assertEqual(catalog["records"][0]["fields"]["director"], ["Ridley Scott"])
        self.assertEqual(set(self.root.rglob("*")), before)

    def test_series_aggregate_jobs_created_by_and_real_directory_path(self):
        show = {"id": 1396, "name": "Breaking Bad", "original_name": "Breaking Bad", "first_air_date": "2008-01-20",
                "overview": "Un profesor cambia de vida.", "genres": [{"id": 18, "name": "Drama"}],
                "created_by": [{"id": 666, "name": "Vince Gilligan"}]}
        credits = {"id": 1396, "cast": [{"id": 17419, "name": "Bryan Cranston", "roles": [{"character": "Walter White", "episode_count": 62}]}],
                   "crew": [{"id": 666, "name": "Vince Gilligan", "jobs": [{"job": "Director", "episode_count": 5}, {"job": "Writer", "episode_count": 15}]},
                            {"id": 667, "name": "Camera Director", "jobs": [{"job": "Director of Photography", "episode_count": 10}]}]}
        self.cache_json("/tv/1396", show, {"language": "ca-ES"})
        self.cache_json("/tv/1396/aggregate_credits", credits)
        scan = {"directories": [{"relativePath": "TVShows/breaking-bad", "name": "breaking-bad", "tmdbId": 1396}],
                "mediaLibrary": {"series": {"TVShows/breaking-bad": {"name": "Mi serie", "tmdbId": 1396}, "TVShows/stale": {"tmdbId": 1396}}}}
        catalog = build_catalog("series", scan, self.cache, "cat")
        record = catalog["records"][0]
        self.assertEqual(catalog["missingMetadata"], 0)
        self.assertEqual(record["id"], "TVShows/breaking-bad")
        self.assertEqual(record["fields"]["actor"], ["Bryan Cranston"])
        for field in ("director", "writer", "creator"):
            self.assertEqual(record["fields"][field], ["Vince Gilligan"])

    def test_corrupt_or_wrong_identity_cache_remains_searchable_by_filename_only(self):
        self.cache_json("/movie/98", {**self.movie, "id": 99}, {"language": "es-ES", "append_to_response": "external_ids"})
        self.cache_json("/movie/98/credits", {**self.credits, "id": 99})
        catalog = build_catalog("movies", self.snapshot, self.cache)
        self.assertEqual(catalog["missingMetadata"], 1)
        self.assertEqual(catalog["records"][0]["fields"]["actor"], [])
        self.assertIsNone(catalog["records"][0]["fields"]["year"])

    def test_valid_empty_cast_is_not_reported_as_missing_credits(self):
        self.cache_movie()
        self.cache_json("/movie/98/credits", {"id": 98, "cast": [], "crew": []})
        self.assertEqual(build_catalog("movies", self.snapshot, self.cache)["missingMetadata"], 0)

    def test_malformed_appended_people_do_not_bypass_local_cache_validation(self):
        self.cache_json("/movie/98", {**self.movie, "credits": {"cast": [{"name": "Invented person"}], "crew": []}},
                        {"append_to_response": "credits"})
        catalog = build_catalog("movies", self.snapshot, self.cache)
        self.assertEqual(catalog["missingMetadata"], 1)
        self.assertEqual(catalog["records"][0]["fields"]["actor"], [])

    def test_book_localization_collections_and_unknown_work_year(self):
        scan = {"books": [{"relativePath": "Books/Orwell/1984.epub", "name": "1984", "title": "1984", "author": "George Orwell", "collection": "Orwell",
                           "year": "1949", "publisher": "Una editorial", "subjects": "Science fiction, surveillance", "description": "Original", "localizedMetadata": {
                               "ca": {"title": "Mil nou-cents vuitanta-quatre", "description": "Vigilància del pensament", "subjects": "Ciència-ficció, vigilància"}}},
                          {"relativePath": "Books/unknown.epub", "title": "Unknown", "publishDate": "2021"}],
                "bookCollections": {"Orwell": {"name": "Biblioteca Orwell", "author": "George Orwell"}}}
        catalog = build_catalog("books", scan, self.cache, "ca-ES")
        first, second = catalog["records"]
        self.assertIn("Mil nou-cents vuitanta-quatre", first["fields"]["title"])
        self.assertIn("Biblioteca Orwell", first["fields"]["title"])
        self.assertEqual(first["fields"]["overview"], ["Vigilància del pensament"])
        self.assertIn("science fiction", first["fields"]["genre"])
        self.assertEqual(first["fields"]["year"], 1949)
        self.assertIsNone(second["fields"]["year"], "edition date must not invent work year")
        self.assertEqual(catalog["missingMetadata"], 1)

    def test_games_and_pictures_keep_scan_ids_and_do_not_infer_photo_capture_year(self):
        scan = {"games": [{"relativePath": "Games/avenging-spirit.gb", "name": "Avenging Spirit", "platform": "gameboy", "platformName": "Game Boy",
                           "gameMetadata": {"releaseDate": "1992-11-06", "developers": ["Jaleco"], "publishers": ["Nintendo"], "genres": ["Platform"], "description": "Ghost adventure"}}],
                "pictures": [{"relativePath": "Viajes/foto.jpg", "name": "foto.jpg", "modifiedAt": 1700000000}]}
        game = build_catalog("games", scan, self.cache)["records"][0]
        self.assertEqual(game["id"], "Games/avenging-spirit.gb")
        self.assertEqual(game["fields"]["year"], 1992)
        self.assertIn("plataformas", game["fields"]["genre"])
        self.assertEqual(execute_plan([game], plan([condition("platform", "Game Boy"), condition("publisher", "Nintendo")])), [game["id"]])
        picture = build_catalog("pictures", scan, self.cache)["records"][0]
        self.assertEqual(picture["id"], "Viajes/foto.jpg")
        self.assertIsNone(picture["fields"]["year"])
        self.assertEqual(execute_plan([picture], plan([condition("title", "viajes")])), [picture["id"]])

    def test_unknown_section_rejected_and_all_sections_have_only_allowed_fields(self):
        with self.assertRaises(ValueError):
            build_catalog("secrets", {}, self.cache)
        for section in SECTION_FIELDS:
            self.assertEqual(build_catalog(section, {}, self.cache), {"records": [], "missingMetadata": 0})


class PlanTests(unittest.TestCase):
    def setUp(self):
        self.records = [
            {"id": "Movies/a.mp4", "fields": {"title": ["El laberinto del fauno"], "actor": ["Ivana Baquero"], "director": ["Guillermo del Toro"], "genre": ["Fantasía"], "year": 2006}},
            {"id": "Movies/b.mp4", "fields": {"title": ["Volver"], "actor": ["Penélope Cruz"], "director": ["Pedro Almodóvar"], "genre": ["Comedia"], "year": 2006}},
            {"id": "Movies/c.mp4", "fields": {"title": ["Ayer-hoy"], "actor": [], "director": [], "genre": [], "year": None}},
        ]

    def test_and_or_and_accent_case_punctuation_normalization(self):
        query = plan([condition("actor", "PENELOPE, CRUZ"), condition("year", "2000", "gte")],
                     [condition("director", "del-toro"), condition("genre", "fantasy")])
        self.assertEqual(execute_plan(self.records, query), ["Movies/a.mp4", "Movies/b.mp4"])
        self.assertEqual(execute_plan(self.records, plan([condition("title", "ayer hoy")])), ["Movies/c.mp4"])
        self.assertEqual(execute_plan(self.records, plan([condition("actor", "Penelope", "eq")])), [])
        self.assertEqual(execute_plan(self.records, plan([condition("actor", "penélope CRUZ", "eq")])), ["Movies/b.mp4"])

    def test_numeric_year_range_and_unknown_year_are_not_zero(self):
        self.assertEqual(execute_plan(self.records, plan([condition("year", "2006", "eq")])), ["Movies/a.mp4", "Movies/b.mp4"])
        self.assertEqual(execute_plan(self.records, plan([condition("year", "2005", "lte")])), [])
        self.assertEqual(execute_plan(self.records, plan([condition("year", "2006", "gte"), condition("year", "2006", "lte")])), ["Movies/a.mp4", "Movies/b.mp4"])

    def test_negative_filters_require_known_metadata(self):
        self.assertEqual(execute_plan(self.records, plan([condition("actor", "Penelope Cruz", "not_contains")])), ["Movies/a.mp4"])
        self.assertEqual(execute_plan(self.records, plan([condition("genre", "comedy", "not_contains")])), ["Movies/a.mp4"])

    def test_count_all_and_count_filtered_are_distinct_from_empty_filter(self):
        self.assertEqual(execute_plan(self.records, plan(intent="count")), [record["id"] for record in self.records])
        self.assertEqual(execute_plan(self.records, plan([condition("actor", "cruz")], intent="count")), ["Movies/b.mp4"])
        self.assertEqual(execute_plan(self.records, plan(intent="clarify")), [])
        self.assertEqual(execute_plan(self.records, plan(intent="unsupported")), [])
        with self.assertRaises(ValueError):
            execute_plan(self.records, plan())

    def test_entire_plan_rejected_before_matching_any_valid_or_arm(self):
        invalid = [condition("__class__", "x"), condition("actor", "x", "regex"),
                   condition("year", "2000", "contains"), condition("actor", "x", "gte"),
                   condition("title", " "), condition("year", "20O6", "eq"), condition("year", "0", "eq"),
                   condition("year", "2000.0", "eq"), condition("title", ".*"),
                   condition("title", "a" * 161),
                   {"field": ["title"], "op": "contains", "value": "x"},
                   condition("title", {"code": "eval"}), condition("year", 2006, "eq")]
        for criterion in invalid:
            with self.subTest(criterion=criterion):
                for records in (self.records, []):
                    with self.assertRaises(ValueError):
                        execute_plan(records, plan([condition("title", "Volver")], [criterion]))
        for malformed in (None, {}, {"intent": "filter", "groups": "all"}, plan([]), plan([condition("title", "Volver")], intent="unsupported")):
            with self.subTest(plan=malformed), self.assertRaises(ValueError):
                execute_plan(self.records, malformed)
        for oversized in (plan(*[[condition("title", "x")]] * 9), plan([condition("title", "x")] * 9)):
            with self.assertRaises(ValueError):
                execute_plan(self.records, oversized)

    def test_deduplicates_paths_without_accepting_model_supplied_ids(self):
        query = plan([condition("year", "2006", "eq")])
        query["ids"] = ["Movies/invented.mp4"]
        self.assertEqual(execute_plan([*self.records, self.records[0]], query), ["Movies/a.mp4", "Movies/b.mp4"])


if __name__ == "__main__":
    unittest.main()
