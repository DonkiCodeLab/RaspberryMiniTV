import http.client
import io
import json
from pathlib import Path
import sys
import unittest
import urllib.error
import urllib.parse
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import recommendation_catalog as catalog
from catalog_ai import AIError


def mark_key(kind, value):
    return json.dumps([kind, str(value)], ensure_ascii=False, separators=(",", ":"))


class AugmentCatalogTests(unittest.TestCase):
    def test_movie_scan_profile_identity_and_exact_personal_path_marks(self):
        records = [{"id": 'Movies/Volver "edición".mp4', "fields": {"title": ["Volver"]}},
                   {"id": "Movies/copy.mp4", "fields": {"title": ["Volver"]}}]
        snapshot = {"movieRootFiles": [{"relativePath": records[0]["id"], "tmdbId": 999},
                                        {"relativePath": records[1]["id"], "tmdbId": 751}],
                    "mediaLibrary": {"movies": {records[0]["id"]: {"tmdbId": 751},
                                                  "Movies/stale.mp4": {"tmdbId": 100}}}}
        state = {"marks": {mark_key("movie", records[0]["id"]): {"watched": True, "favorite": True},
                           mark_key("movie", 751): {"watched": True}}}
        result = catalog.augment_catalog(records, snapshot, "movies", state)
        self.assertEqual([item["tmdbId"] for item in result], [751, 751])
        self.assertTrue(result[0]["watched"])
        self.assertTrue(result[0]["favorite"])
        self.assertFalse(result[1]["watched"], "another file copy does not inherit a TMDB-id mark")
        self.assertEqual([item["id"] for item in result], [item["id"] for item in records])
        self.assertNotIn("tmdbId", records[0], "input records are not modified")
        self.assertFalse(catalog.augment_catalog(records, snapshot, "movies", {})[0]["watched"])

    def test_nested_directory_profile_and_file_override(self):
        snapshot = {"movieDirectories": [{"relativePath": "Movies/discs", "videos": [
            {"relativePath": "Movies/discs/a.mp4"}, {"relativePath": "Movies/discs/b.mp4"}]}],
                    "mediaLibrary": {"movies": {"Movies/discs": {"tmdbId": 98}, "Movies/discs/b.mp4": {"tmdbId": 100}}}}
        records = [{"id": "Movies/discs/a.mp4"}, {"id": "Movies/discs/b.mp4"}, {"id": "Movies/no-scan.mp4", "tmdbId": 123}]
        result = catalog.augment_catalog(records, snapshot, "movies", {})
        self.assertEqual([item["tmdbId"] for item in result], [98, 100, 0])

    def test_series_numeric_or_path_marks_and_no_inferred_watched_progress(self):
        records = [{"id": "TVShows/breaking-bad"}, {"id": "TVShows/unknown"}]
        snapshot = {"directories": [{"relativePath": records[0]["id"], "tmdbId": 1396}, {"relativePath": records[1]["id"]}]}
        state = {"marks": {mark_key("series", 1396): {"favorite": True},
                           mark_key("series", records[0]["id"]): {"watched": True},
                           mark_key("series", records[1]["id"]): {"watched": True, "favorite": True},
                           mark_key("season", '["1396",1]'): {"watched": True}},
                 "progress": {"anything": {"completed": True}}}
        result = catalog.augment_catalog(records, snapshot, "series", state)
        self.assertTrue(result[0]["favorite"])
        self.assertFalse(result[0]["watched"])
        self.assertTrue(result[1]["watched"])
        state["marks"][mark_key("series", 1396)]["watched"] = True
        self.assertTrue(catalog.augment_catalog(records, snapshot, "series", state)[0]["watched"])

    def test_invalid_section_rejected(self):
        with self.assertRaises(AIError):
            catalog.augment_catalog([], {}, "books", {})


class ResolveTitleTests(unittest.TestCase):
    def setUp(self):
        self.opener = MagicMock()
        self.response = self.opener.open.return_value.__enter__.return_value
        self.movie = {"id": 751, "title": "Volver", "original_title": "Volver", "release_date": "2006-03-17",
                      "overview": "Un regreso inesperado.", "poster_path": "/Valid_123-poster.jpg"}
        self.set_results([self.movie])
        patcher = patch.object(catalog.urllib.request, "build_opener", return_value=self.opener)
        self.build = patcher.start()
        self.addCleanup(patcher.stop)

    def set_results(self, results, **extra):
        self.response.read.return_value = json.dumps({"results": results, "total_pages": 1, **extra}).encode()

    def resolve(self, title="Volver", media_type="movie", year=2006, language="es", credentials=None):
        return catalog.resolve_tmdb_title(title, media_type, year, language, credentials or {"bearerToken": "private-bearer"})

    def test_fixed_request_bearer_priority_limits_and_verified_fields(self):
        card = self.resolve(credentials={"apiKey": "unused-secret", "bearerToken": "private-bearer"})
        self.assertEqual(card, {"tmdbId": 751, "mediaType": "movie", "title": "Volver", "year": 2006,
                                "overview": "Un regreso inesperado.", "posterPath": "/Valid_123-poster.jpg"})
        request = self.opener.open.call_args.args[0]
        url = urllib.parse.urlparse(request.full_url)
        query = urllib.parse.parse_qs(url.query)
        self.assertEqual((url.scheme, url.netloc, url.path), ("https", "api.themoviedb.org", "/3/search/movie"))
        self.assertEqual(query, {"query": ["Volver"], "language": ["es-ES"], "include_adult": ["false"], "page": ["1"], "primary_release_year": ["2006"]})
        self.assertEqual(request.get_header("Authorization"), "Bearer private-bearer")
        self.assertNotIn("unused-secret", request.full_url)
        self.assertEqual(self.opener.open.call_args.kwargs, {"timeout": 12})
        self.assertEqual(self.response.read.call_args.args, (1024 * 1024 + 1,))
        self.assertEqual(self.opener.open.call_count, 1)
        self.assertIs(self.build.call_args.args[0], catalog._NoRedirect)

    def test_tv_uses_first_air_date_year_and_api_key(self):
        self.set_results([{"id": 1396, "name": "Breaking Bad", "original_name": "Breaking Bad", "first_air_date": "2008-01-20", "overview": "A teacher"}])
        card = self.resolve("Breaking Bad", "tv", "2008", "ca-ES", {"apiKey": "private-key"})
        request = self.opener.open.call_args.args[0]
        parsed = urllib.parse.urlparse(request.full_url)
        self.assertEqual(parsed.path, "/3/search/tv")
        self.assertEqual(urllib.parse.parse_qs(parsed.query)["first_air_date_year"], ["2008"])
        self.assertEqual(urllib.parse.parse_qs(parsed.query)["api_key"], ["private-key"])
        self.assertEqual(card["tmdbId"], 1396)
        self.assertEqual(card["mediaType"], "tv")
        self.assertEqual(card["posterPath"], "")

    def test_exact_localized_original_aliases_and_normalization_no_fuzzy_matches(self):
        self.set_results([{**self.movie, "title": "Señales: El regreso", "original_title": "Signs: The Return"}])
        self.assertEqual(self.resolve("SENALES EL REGRESO")["tmdbId"], 751)
        self.assertEqual(self.resolve("Signs — The Return")["tmdbId"], 751)
        self.assertIsNone(self.resolve("Signs"))
        self.assertIsNone(self.resolve("Señales El regresso"))

    def test_year_disambiguates_remakes_duplicate_id_is_not_ambiguous(self):
        old = {**self.movie, "id": 1, "release_date": "1980-01-01"}
        self.set_results([old, self.movie])
        self.assertEqual(self.resolve()["tmdbId"], 751)
        self.assertIsNone(self.resolve(year=1981))
        self.assertIsNone(self.resolve(year=None))
        self.set_results([self.movie, dict(self.movie)])
        self.assertEqual(self.resolve()["tmdbId"], 751)
        self.set_results([self.movie, {**self.movie, "id": 99}])
        self.assertIsNone(self.resolve())
        self.set_results([self.movie], total_pages=2)
        self.assertIsNone(self.resolve(), "unexamined pages may contain another exact title")

    def test_unknown_year_never_substitutes_requested_year(self):
        self.set_results([{**self.movie, "release_date": ""}])
        self.assertIsNone(self.resolve())
        card = self.resolve(year=0)
        self.assertEqual(card["year"], 0)
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.opener.open.call_args.args[0].full_url).query)
        self.assertNotIn("primary_release_year", query)
        self.set_results([{**self.movie, "release_date": "2006-99-99"}])
        self.assertIsNone(self.resolve())

    def test_unsafe_posters_and_untrusted_extra_fields_never_return(self):
        for poster in ("https://evil.example/poster.jpg", "//evil.example/p.jpg", "/../p.jpg", "/p.jpg?secret=private", "/subdir/p.jpg", None):
            self.set_results([{**self.movie, "poster_path": poster, "apiKey": "private-key", "file": "Movies/private.mp4"}])
            card = self.resolve()
            self.assertEqual(card["posterPath"], "")
            self.assertNotIn("private", json.dumps(card))
        self.set_results([{**self.movie, "id": True}, {**self.movie, "id": -1}, {**self.movie, "adult": True}])
        self.assertIsNone(self.resolve())

    def test_bad_inputs_and_missing_credentials_do_not_make_requests(self):
        cases = [("", "movie", 2006, "es", {"apiKey": "key"}), ("Title\x00", "movie", 2006, "es", {"apiKey": "key"}),
                 ("x" * 201, "movie", 2006, "es", {"apiKey": "key"}), ("Title", "movie/../../", 2006, "es", {"apiKey": "key"}),
                 ("Title", "movie", True, "es", {"apiKey": "key"}), ("Title", "movie", 2006.0, "es", {"apiKey": "key"}),
                 ("Title", "movie", 999, "es", {"apiKey": "key"}), ("Title", "movie", 2006, "arbitrary", {"apiKey": "key"}),
                 ("Title", "movie", 2006, "es", {}), ("Title", "movie", 2006, "es", {"bearerToken": "bad\r\nheader"})]
        for args in cases:
            with self.subTest(args=args), self.assertRaises(AIError):
                catalog.resolve_tmdb_title(*args)
        self.opener.open.assert_not_called()

    def test_transport_errors_are_sanitized_and_never_retried(self):
        for status, code in ((401, "AI_TMDB_AUTH_ERROR"), (403, "AI_TMDB_AUTH_ERROR"), (429, "AI_TMDB_RATE_LIMIT"),
                             (500, "AI_TMDB_UNAVAILABLE"), (302, "AI_TMDB_UNAVAILABLE")):
            self.opener.open.reset_mock()
            self.opener.open.side_effect = urllib.error.HTTPError("https://api.themoviedb.org?api_key=private-key", status, "private-key", {}, io.BytesIO(b"private-key"))
            with self.subTest(status=status), self.assertRaises(AIError) as error:
                self.resolve()
            self.assertEqual(error.exception.code, code)
            self.assertNotIn("private-key", str(error.exception))
            self.assertEqual(self.opener.open.call_count, 1)
        for exception, code in ((TimeoutError("private-key"), "AI_TMDB_TIMEOUT"),
                                (urllib.error.URLError(TimeoutError()), "AI_TMDB_TIMEOUT"),
                                (http.client.IncompleteRead(b"private-key"), "AI_TMDB_UNAVAILABLE")):
            self.opener.open.side_effect = exception
            with self.subTest(exception=exception), self.assertRaises(AIError) as error:
                self.resolve()
            self.assertEqual(error.exception.code, code)
            self.assertNotIn("private-key", str(error.exception))

    def test_oversized_malformed_and_error_payloads_fail_safely(self):
        for raw in (b"", b"private-key", b"x" * (catalog.MAX_RESPONSE_BYTES + 1), b'[]', b'{"results":{}}',
                    b'{"results":[],"success":false}', b'{"results":[],"total_pages":"many"}'):
            self.response.read.return_value = raw
            with self.subTest(length=len(raw)), self.assertRaises(AIError) as error:
                self.resolve()
            self.assertEqual(error.exception.code, "AI_TMDB_INVALID_RESPONSE")
            self.assertNotIn("private-key", str(error.exception))


if __name__ == "__main__":
    unittest.main()
