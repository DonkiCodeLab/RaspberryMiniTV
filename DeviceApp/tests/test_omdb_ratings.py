import concurrent.futures
import http.client
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
import urllib.error
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api
import omdb_ratings as omdb


MOVIE = {"Response": "True", "imdbID": "tt0111161", "Type": "movie",
         "imdbRating": "9.3", "imdbVotes": "3,100,042"}
SERIES = {**MOVIE, "imdbID": "tt0096697", "Type": "series", "imdbRating": "8.7"}
CRITIC_MOVIE = {**MOVIE, "Ratings": [
    {"Source": "Internet Movie Database", "Value": "9.3/10"},
    {"Source": "Rotten Tomatoes", "Value": "89%"},
    {"Source": "Metacritic", "Value": "82/100"},
], "Metascore": "80"}


class OmdbFixture(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.settings = omdb.OmdbSettings(self.root / "private.json")
        self.settings.update({"apiKey": "test-secret"})
        self.tmdb = Mock()
        self.tmdb.json.side_effect = RuntimeError("Local cache missing")
        self.ratings = omdb.OmdbRatings(self.root / "cache", self.settings.credentials,
                                        self.tmdb, lambda: {"apiKey": "tmdb-secret"})
        self.now = 2000000000
        clock = patch.object(omdb.time, "time", side_effect=lambda: self.now)
        clock.start()
        self.addCleanup(clock.stop)

    def assert_error(self, code, action):
        with self.assertRaises(omdb.OmdbError) as raised:
            action()
        self.assertEqual(raised.exception.code, code)
        return raised.exception


class OmdbRatingsTests(OmdbFixture):
    def test_fresh_cache_survives_restart_and_refreshes_after_seven_days(self):
        with patch.object(omdb, "_download_json", return_value=MOVIE) as download:
            first = self.ratings.get(imdb_id="tt0111161", kind="movie")
            self.assertEqual(first, {"ok": True, "imdbId": "tt0111161", "rating": 9.3,
                                    "rottenTomatoes": None, "metacritic": None,
                                    "votes": 3100042, "updatedAt": self.now, "stale": False})
            restarted = omdb.OmdbRatings(self.ratings.root, self.settings.credentials, self.tmdb, lambda: {})
            self.now += omdb.RATING_TTL - 1
            self.assertEqual(restarted.get(imdb_id="tt0111161"), first)
            self.assertEqual(download.call_count, 1)
            self.now += 2
            self.assertGreater(restarted.get(imdb_id="tt0111161")["updatedAt"], first["updatedAt"])
            self.assertEqual(download.call_count, 2)
            self.assertNotIn("test-secret", json.dumps(json.loads(next((self.ratings.root / "ratings").glob("*.json")).read_text())))

    def test_concurrent_requests_share_one_lookup(self):
        with patch.object(omdb, "_download_json", return_value=MOVIE) as download:
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
                results = list(pool.map(lambda _: self.ratings.get(imdb_id="tt0111161"), range(5)))
            self.assertTrue(all(result["rating"] == 9.3 for result in results))
            download.assert_called_once()

    def test_missing_rating_and_missing_title_are_cached_for_one_day(self):
        for response in ({**MOVIE, "imdbRating": "N/A", "imdbVotes": "N/A"},
                         {"Response": "False", "Error": "Movie not found!"}):
            with self.subTest(response=response), patch.object(omdb, "_download_json", return_value=response) as download:
                first = self.ratings.get(imdb_id="tt0111161")
                self.assertIsNone(first["rating"])
                self.assertIsNone(first["votes"])
                self.assertIsNone(first["rottenTomatoes"])
                self.assertIsNone(first["metacritic"])
                self.now += omdb.MISSING_TTL - 1
                self.ratings.get(imdb_id="tt0111161")
                download.assert_called_once()
                self.now += 2
                self.ratings.get(imdb_id="tt0111161")
                self.assertEqual(download.call_count, 2)
                self.now += omdb.MISSING_TTL + 1

    def test_stale_fallback_and_persistent_global_limit_cooldown(self):
        with patch.object(omdb, "_download_json", return_value=MOVIE):
            first = self.ratings.get(imdb_id="tt0111161")
        self.now += omdb.RATING_TTL + 1
        with patch.object(omdb, "_download_json", side_effect=omdb.OmdbError("OMDB_LIMIT")) as download:
            stale = self.ratings.get(imdb_id="tt0111161")
            self.assertEqual(stale, {**first, "stale": True, "code": "OMDB_LIMIT"})
            restarted = omdb.OmdbRatings(self.ratings.root, self.settings.credentials, self.tmdb, lambda: {})
            self.now += 100
            self.assert_error("OMDB_LIMIT", lambda: restarted.get(imdb_id="tt0096697"))
            self.assertEqual(restarted.get(imdb_id="tt0111161"), stale)
            download.assert_called_once()
            self.now += 3600
            restarted.get(imdb_id="tt0111161")
            self.assertEqual(download.call_count, 2)

    def test_changed_key_bypasses_old_auth_cooldown_and_test_clears_it(self):
        with patch.object(omdb, "_download_json", return_value={"Response": "False", "Error": "Invalid API key!"}):
            self.assert_error("OMDB_AUTH_ERROR", lambda: self.ratings.get(imdb_id="tt0111161"))
        self.settings.update({"apiKey": "new-secret"})
        with patch.object(omdb, "_download_json", return_value=MOVIE) as download:
            self.assertEqual(self.ratings.test_connection(), {"ok": True})
            self.assertEqual(self.ratings.get(imdb_id="tt0111161")["rating"], 9.3)
            self.assertEqual(download.call_count, 2)

    def test_local_movie_imdb_identity_never_contacts_tmdb(self):
        self.tmdb.json.side_effect = None
        self.tmdb.json.return_value = {"id": 278, "external_ids": {"imdb_id": "tt0111161"}}
        with patch.object(omdb, "_download_json", return_value=MOVIE) as download:
            self.assertEqual(self.ratings.get(kind="movie", tmdb_id="278")["rating"], 9.3)
            download.assert_called_once()
            self.assertTrue(download.call_args.args[0].startswith("https://www.omdbapi.com/?"))
            self.tmdb.json.assert_called_once_with("/movie/278", {"language": "es-ES", "append_to_response": "external_ids"}, local_only=True)

    def test_old_series_cache_resolves_external_id_without_changing_tmdb_cache(self):
        self.tmdb.json.side_effect = None
        self.tmdb.json.return_value = {"id": 456, "name": "The Simpsons"}
        with patch.object(omdb, "_download_json", side_effect=[{"id": 456, "imdb_id": "tt0096697"}, SERIES]) as download:
            result = self.ratings.get(kind="tv", tmdb_id="456")
            self.assertEqual(result["imdbId"], "tt0096697")
            self.assertEqual(result["rating"], 8.7)
            self.assertTrue(download.call_args_list[0].args[0].startswith("https://api.themoviedb.org/3/tv/456/external_ids?"))
            self.assertTrue(all(call.kwargs == {"local_only": True} for call in self.tmdb.json.call_args_list))
            self.ratings.get(kind="tv", tmdb_id="456")
            self.assertEqual(download.call_count, 2)

    def test_missing_imdb_identity_has_negative_cache_without_omdb_call(self):
        with patch.object(omdb, "_download_json", return_value={"id": 1, "imdb_id": None}) as download:
            for _ in range(2):
                self.assert_error("OMDB_ID_MISSING", lambda: self.ratings.get(kind="tv", tmdb_id="1"))
            download.assert_called_once()

    def test_wrong_tmdb_identity_is_not_used_and_failure_has_cooldown(self):
        with patch.object(omdb, "_download_json", return_value={"id": 2, "imdb_id": "tt0096697"}) as download:
            for _ in range(2):
                self.assert_error("OMDB_TMDB_ERROR", lambda: self.ratings.get(kind="tv", tmdb_id="1"))
            download.assert_called_once()

    def test_identity_and_credentials_validation_happen_before_network(self):
        with patch.object(omdb, "_download_json") as download:
            for args in ({}, {"imdb_id": "../../private"}, {"imdb_id": "tt12"}, {"kind": "episode", "tmdb_id": "1"},
                         {"kind": "tv", "tmdb_id": "0"}, {"kind": "movie", "tmdb_id": "9007199254740992"}):
                self.assert_error("OMDB_INVALID_ID", lambda: self.ratings.get(**args))
            self.settings.update({"clearApiKey": True})
            self.assert_error("OMDB_NOT_CONFIGURED", lambda: self.ratings.get(kind="tv", tmdb_id="456"))
            download.assert_not_called()
            self.tmdb.json.assert_not_called()

    def test_response_rejects_wrong_title_type_and_invalid_values(self):
        for changes in ({"imdbID": "tt0096697"}, {"Type": "series"}, {"Type": "episode"}, {"imdbRating": "NaN"},
                        {"imdbRating": "0"}, {"imdbRating": "11"}, {"imdbRating": True}, {"imdbVotes": "-1"},
                        {"imdbVotes": "1,2"}, {"Response": "unexpected"}):
            self.assert_error("OMDB_INVALID_RESPONSE", lambda: omdb._parse_rating({**MOVIE, **changes}, "tt0111161", "movie"))
        result = omdb._parse_rating({key: value for key, value in MOVIE.items() if key not in ("imdbVotes", "imdbRating")}, "tt0111161")
        self.assertIsNone(result["rating"])
        self.assertIsNone(result["votes"])

    def test_three_sources_are_separate_and_duplicate_ratings_do_not_sum(self):
        data = {**CRITIC_MOVIE, "Ratings": [*CRITIC_MOVIE["Ratings"],
                {"Source": "Rotten Tomatoes", "Value": "11%"},
                {"Source": "Metacritic", "Value": "99/100"}]}
        result = omdb._parse_rating(data, "tt0111161", "movie")
        self.assertEqual((result["rating"], result["rottenTomatoes"], result["metacritic"]), (9.3, 89, 82))
        self.assertEqual(result["votes"], 3100042)

    def test_critic_scores_accept_zero_and_one_hundred_with_their_exact_units(self):
        for number in (0, 100):
            result = omdb._parse_rating({**MOVIE, "Ratings": [
                {"Source": "Rotten Tomatoes", "Value": f"{number}%"},
                {"Source": "Metacritic", "Value": f"{number}/100"},
            ]}, "tt0111161")
            self.assertEqual(result["rottenTomatoes"], number)
            self.assertEqual(result["metacritic"], number)

    def test_invalid_critic_fields_do_not_discard_valid_imdb_and_never_use_audience_score(self):
        for value in (None, "N/A", "-1%", "101%", "89/100", "89.5%", "89", 89, True, [], {}, "89% extra"):
            data = {**MOVIE, "Ratings": [None, [], {"Source": ["Rotten Tomatoes"], "Value": "90%"},
                    {"Source": "Rotten Tomatoes", "Value": value},
                    {"Source": "rotTEn Tomatoes", "Value": "90%"}], "tomatoUserMeter": "98"}
            result = omdb._parse_rating(data, "tt0111161")
            self.assertEqual(result["rating"], 9.3)
            self.assertIsNone(result["rottenTomatoes"])
            self.assertIsNone(result["metacritic"])
        for value in (None, "N/A", "-1/100", "101/100", "82%", "82.5/100", "82", 82, True, [], {}):
            result = omdb._parse_rating({**MOVIE, "Ratings": [
                {"Source": "Metacritic", "Value": value}], "Metascore": "N/A"}, "tt0111161")
            self.assertEqual(result["rating"], 9.3)
            self.assertIsNone(result["metacritic"])

    def test_metascore_fallback_only_when_ratings_does_not_supply_valid_metacritic(self):
        for ratings in (None, {}, "invalid", [], [{"Source": "Metacritic", "Value": "invalid"}]):
            for metascore in ("0", "82", "100"):
                result = omdb._parse_rating({**MOVIE, "Ratings": ratings, "Metascore": metascore}, "tt0111161")
                self.assertEqual(result["metacritic"], int(metascore))
                self.assertIsNone(result["rottenTomatoes"])
        for metascore in (None, "N/A", "-1", "101", "82/100", "82.5", 82, True, [], {}):
            result = omdb._parse_rating({**MOVIE, "Metascore": metascore}, "tt0111161")
            self.assertIsNone(result["metacritic"])

    def test_optional_critic_scores_persist_without_an_extra_provider_request(self):
        with patch.object(omdb, "_download_json", return_value=CRITIC_MOVIE) as download:
            first = self.ratings.get(imdb_id="tt0111161")
            self.assertEqual((first["rottenTomatoes"], first["metacritic"]), (89, 82))
            saved = json.loads((self.ratings.root / "ratings" / "tt0111161.json").read_text())
            self.assertEqual(saved["version"], omdb.CACHE_VERSION)
            restarted = omdb.OmdbRatings(self.ratings.root, self.settings.credentials, self.tmdb, lambda: {})
            self.assertEqual(restarted.get(imdb_id="tt0111161"), first)
            download.assert_called_once()

    def test_only_critic_score_uses_seven_day_ttl_even_when_it_is_zero(self):
        with patch.object(omdb, "_download_json", return_value={**MOVIE, "imdbRating": "N/A", "Metascore": "0"}) as download:
            first = self.ratings.get(imdb_id="tt0111161")
            self.assertIsNone(first["rating"])
            self.assertIsNone(first["rottenTomatoes"])
            self.assertEqual(first["metacritic"], 0)
            self.now += omdb.RATING_TTL - 1
            self.assertEqual(self.ratings.get(imdb_id="tt0111161"), first)
            download.assert_called_once()
            self.now += 2
            self.ratings.get(imdb_id="tt0111161")
            self.assertEqual(download.call_count, 2)

    def test_old_imdb_only_cache_gets_one_lazy_refresh_and_caches_genuine_null_scores(self):
        target = self.ratings.root / "ratings" / "tt0111161.json"
        legacy = {"imdbId": "tt0111161", "rating": 9.2, "votes": 3000000, "type": "movie", "updatedAt": self.now}
        omdb._write(target, legacy)
        with patch.object(omdb, "_download_json", return_value=MOVIE) as download:
            migrated = self.ratings.get(imdb_id="tt0111161")
            self.assertEqual(migrated["rating"], 9.3)
            self.assertIsNone(migrated["rottenTomatoes"])
            self.assertIsNone(migrated["metacritic"])
            self.assertEqual(json.loads(target.read_text())["version"], omdb.CACHE_VERSION)
            self.ratings.get(imdb_id="tt0111161")
            download.assert_called_once()

    def test_old_imdb_cache_is_returned_stale_when_migration_refresh_fails(self):
        target = self.ratings.root / "ratings" / "tt0111161.json"
        legacy = {"imdbId": "tt0111161", "rating": 9.2, "votes": 3000000, "type": "movie", "updatedAt": self.now}
        omdb._write(target, legacy)
        with patch.object(omdb, "_download_json", side_effect=omdb.OmdbError("OMDB_CONNECTION_ERROR")) as download:
            result = self.ratings.get(imdb_id="tt0111161")
            self.assertEqual(result["rating"], 9.2)
            self.assertTrue(result["stale"])
            self.assertEqual(result["code"], "OMDB_CONNECTION_ERROR")
            self.assertIsNone(result["rottenTomatoes"])
            self.assertIsNone(result["metacritic"])
            self.assertEqual(json.loads(target.read_text()), legacy)
            self.assertEqual(self.ratings.get(imdb_id="tt0111161"), result)
            download.assert_called_once()
        self.now += 61
        with patch.object(omdb, "_download_json", return_value=CRITIC_MOVIE) as download:
            refreshed = self.ratings.get(imdb_id="tt0111161")
            self.assertEqual(refreshed["rottenTomatoes"], 89)
            self.assertFalse(refreshed["stale"])
            self.ratings.get(imdb_id="tt0111161")
            download.assert_called_once()

    def test_download_is_bounded_https_no_redirect_and_errors_are_sanitized(self):
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = json.dumps(MOVIE).encode()
        opener = Mock()
        opener.open.return_value = response
        with patch.object(omdb.urllib.request, "build_opener", return_value=opener) as build:
            self.assertEqual(self.ratings.get(imdb_id="tt0111161")["rating"], 9.3)
            build.assert_called_once_with(omdb._NoRedirect)
            req = opener.open.call_args.args[0]
            self.assertTrue(req.full_url.startswith("https://www.omdbapi.com/?"))
            self.assertEqual(opener.open.call_args.kwargs["timeout"], 8)
            response.read.assert_called_once_with(omdb.MAX_RESPONSE_BYTES + 1)
            self.assertIsNone(omdb._NoRedirect().redirect_request(None, None, 302, "redirect", {}, "https://untrusted.example/"))
            opener.open.side_effect = urllib.error.URLError("secret-key-and-url")
            error = self.assert_error("OMDB_CONNECTION_ERROR", lambda: omdb._download_json("https://www.omdbapi.com/"))
            self.assertNotIn("secret", str(error))
            opener.open.side_effect = None
            response.read.return_value = b"x" * (omdb.MAX_RESPONSE_BYTES + 1)
            self.assert_error("OMDB_INVALID_RESPONSE", lambda: omdb._download_json("https://www.omdbapi.com/"))

    def test_truncated_http_body_keeps_stale_rating(self):
        with patch.object(omdb, "_download_json", return_value=MOVIE):
            first = self.ratings.get(imdb_id="tt0111161")
        self.now += omdb.RATING_TTL + 1
        opener = Mock()
        opener.open.side_effect = http.client.IncompleteRead(b"partial secret response")
        with patch.object(omdb.urllib.request, "build_opener", return_value=opener):
            self.assertEqual(self.ratings.get(imdb_id="tt0111161"),
                             {**first, "stale": True, "code": "OMDB_CONNECTION_ERROR"})

    def test_http_401_quota_response_maps_to_limit_without_exposing_body(self):
        opener = Mock()
        body = io.BytesIO(json.dumps({"Response": "False", "Error": "Request limit reached! test-secret"}).encode())
        opener.open.side_effect = urllib.error.HTTPError("https://www.omdbapi.com/?apikey=test-secret", 401,
                                                       "Unauthorized", {}, body)
        with patch.object(omdb.urllib.request, "build_opener", return_value=opener):
            error = self.assert_error("OMDB_LIMIT", lambda: self.ratings.get(imdb_id="tt0111161"))
            self.assertNotIn("test-secret", str(error))


class OmdbApiTests(OmdbFixture):
    def setUp(self):
        super().setUp()
        for name, value in (("omdb_settings_store", self.settings), ("omdb_ratings", self.ratings),
                            ("current_web_pin", lambda: "test-pin")):
            patcher = patch.object(api, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = api.app.test_client()
        self.headers = {"X-Web-Pin": "test-pin"}

    def test_library_exposes_saved_scores_by_path_without_network_or_credentials(self):
        with patch.object(omdb, "_download_json", return_value=CRITIC_MOVIE):
            self.ratings.get(imdb_id="tt0111161", kind="movie")
        with patch.object(omdb, "_download_json", return_value=SERIES):
            self.ratings.get(imdb_id="tt0096697", kind="tv")
        self.now += omdb.RATING_TTL + 1
        self.settings.update({"clearApiKey": True})
        omdb._write(self.ratings.root / "ids" / "tv-456.json", {"imdbId": "tt0096697"})
        library = {"movies": {"Movies/one.mkv": {"tmdbId": 1, "imdbUrl": "https://www.imdb.com/title/tt0111161/"},
                              "Movies/imdb-only.mkv": {"imdbId": "tt0111161"},
                              "Movies/unknown.mkv": {}},
                   "series": {"TVShows/test": {"tmdbId": 456}}}
        with patch.object(api, "load_media_library", return_value=library), \
                patch.object(api.tmdb_artwork, "library_summary", side_effect=lambda kind, tmdb_id, language: {"id": tmdb_id, "name": "Test"}), \
                patch.object(omdb, "_download_json", side_effect=AssertionError("Must stay offline")) as download, \
                patch.object(omdb, "_write", side_effect=AssertionError("Must not write")):
            self.assertIsNone(self.ratings.peek(imdb_id="tt0111161"))
            response = self.client.get("/tmdb/library", headers=self.headers)
            self.assertEqual(response.status_code, 200)
            scores = response.json["ratings"]
            self.assertEqual(scores["movies"]["Movies/one.mkv"]["rottenTomatoes"], 89)
            self.assertEqual(scores["movies"]["Movies/one.mkv"]["metacritic"], 82)
            self.assertEqual(scores["movies"]["Movies/imdb-only.mkv"]["rating"], 9.3)
            self.assertTrue(scores["movies"]["Movies/one.mkv"]["stale"])
            self.assertNotIn("Movies/unknown.mkv", scores["movies"])
            self.assertEqual(scores["series"]["TVShows/test"]["rating"], 8.7)
            download.assert_not_called()

    def test_all_routes_require_pin_and_disable_http_caching(self):
        with patch.object(omdb, "_download_json") as download:
            for method, route in (("get", "/settings/omdb"), ("post", "/settings/omdb"),
                                  ("post", "/settings/omdb/test"), ("get", "/omdb/ratings?imdbId=tt0111161")):
                response = getattr(self.client, method)(route)
                self.assertEqual(response.status_code, 401)
                self.assertEqual(response.headers["Cache-Control"], "no-store")
            download.assert_not_called()

    def test_settings_show_preserve_replace_and_delete_saved_key(self):
        for response in (self.client.get("/settings/omdb", headers=self.headers),
                         self.client.post("/settings/omdb", headers=self.headers, json={"apiKey": ""})):
            self.assertEqual(response.json, {"ok": True, "settings": {"configured": True, "apiKey": "test-secret"}})
            self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual(self.settings.credentials(), "test-secret")
        self.assertEqual(self.settings.path.stat().st_mode & 0o777, 0o600)
        response = self.client.post("/settings/omdb", headers=self.headers, json={"apiKey": "replacement-key"})
        self.assertEqual(response.json["settings"]["apiKey"], "replacement-key")
        self.assertEqual(response.json, self.client.get("/settings/omdb", headers=self.headers).json)
        response = self.client.post("/settings/omdb", headers=self.headers, json={"clearApiKey": True})
        self.assertEqual(response.json["settings"], {"configured": False, "apiKey": ""})
        self.assertEqual(self.settings.credentials(), "")

    def test_invalid_settings_and_requests_have_stable_errors(self):
        for data in ([], None, {"apiKey": 123}, {"apiKey": "key\ninjected"}, {"clearApiKey": "yes"}, {"url": "https://elsewhere"}):
            response = self.client.post("/settings/omdb", headers=self.headers, json=data)
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json["code"], "OMDB_INVALID_SETTINGS")
        response = self.client.get("/omdb/ratings?imdbId=bad", headers=self.headers)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json["code"], "OMDB_INVALID_ID")

    def test_rating_route_and_explicit_connection_test(self):
        with patch.object(omdb, "_download_json", return_value=CRITIC_MOVIE) as download:
            rating = self.client.get("/omdb/ratings?imdbId=tt0111161&kind=movie", headers=self.headers)
            self.assertEqual(rating.status_code, 200)
            self.assertEqual(rating.json["rating"], 9.3)
            self.assertEqual(rating.json["rottenTomatoes"], 89)
            self.assertEqual(rating.json["metacritic"], 82)
            self.assertEqual(rating.headers["Cache-Control"], "no-store")
            response = self.client.post("/settings/omdb/test", headers=self.headers)
            self.assertEqual(response.json, {"ok": True})
            self.assertEqual(download.call_count, 2)
        with patch.object(omdb, "_download_json", return_value={"Response": "False", "Error": "Invalid API key! test-secret"}):
            response = self.client.post("/settings/omdb/test", headers=self.headers)
            self.assertEqual(response.json["code"], "OMDB_AUTH_ERROR")
            self.assertNotIn("test-secret", response.get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
