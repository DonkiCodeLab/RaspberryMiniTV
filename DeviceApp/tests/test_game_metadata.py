import copy
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api
import game_metadata as metadata
from game_platforms import resolve_platform

PNG = b"\x89PNG\r\n\x1a\nimage fixture"
RAW = {
    "id": "42", "systeme": {"id": "9"}, "noms": [{"region": "wor", "text": "Tetris"}],
    "synopsis": [{"langue": "en", "text": "Puzzle description"}, {"langue": "es", "text": "Puzzle traducido"}],
    "dates": [{"region": "eu", "text": "1989-09-28"}], "developpeur": {"text": "Nintendo"},
    "editeur": {"text": "Nintendo"}, "joueurs": {"text": "1-2"}, "note": {"text": "18"},
    "genres": [{"noms": [{"langue": "en", "text": "Puzzle"}]}], "extraProviderField": {"preserved": True},
    "medias": [{"type": "box-2D", "url": "https://api.screenscraper.fr/api2/mediaJeu.php?jeuid=42&media=box-2D&devid=secret-id&devpassword=secret-password"},
               *[{"type": "ss", "url": f"https://www.screenscraper.fr/images/shot-{index}.png"} for index in range(7)]],
}


class GameMetadataFixture:
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.credentials = {"SCREENSCRAPER_DEV_ID": "test-dev", "SCREENSCRAPER_DEV_PASSWORD": "test-password"}
        self.service = metadata.GameMetadata(self.root, self.root / "GameCovers", lambda key: self.credentials.get(key, ""), "en")
        self.platform = resolve_platform("tetris.gb")

    def request(self, source, endpoint, params):
        if endpoint == "jeuRecherche":
            return {"response": {"jeux": [copy.deepcopy(RAW)]}}
        return {"response": {"jeu": copy.deepcopy(RAW)}}


class GameMetadataTests(GameMetadataFixture, unittest.TestCase):
    def test_igdb_uses_server_credentials_and_reuses_token(self):
        self.credentials.update(IGDB_CLIENT_ID="test-client", IGDB_CLIENT_SECRET="test-secret")
        metadata._token.clear()
        requests = []
        def respond(req, **kwargs):
            requests.append(req)
            return io.BytesIO(json.dumps({"access_token": "server-token", "expires_in": 3600} if "oauth2" in req.full_url else []).encode())
        with patch.object(metadata.urllib.request, "urlopen", side_effect=respond), patch.object(metadata.time, "sleep"):
            self.service.request_json("igdb", "games", "fields name;")
            self.service.request_json("igdb", "games", "fields name;")
        self.assertEqual(len(requests), 3)
        self.assertNotIn("test-secret", requests[0].full_url)
        self.assertIn(b"client_secret=test-secret", requests[0].data)
        self.assertEqual(requests[1].headers["Authorization"], "Bearer server-token")
        self.assertEqual(requests[1].headers["Client-id"], "test-client")
        metadata._token.clear()

    def test_provider_errors_do_not_expose_credentials(self):
        with patch.object(metadata.urllib.request, "urlopen", side_effect=OSError("secret-password in failed URL")):
            with self.assertRaises(metadata.MetadataError) as raised:
                self.service.request_json("screenscraper", "jeuInfos", {"gameid": 42})
        self.assertNotIn("secret-password", str(raised.exception))

    def test_full_details_cache_local_artwork_and_offline_reuse(self):
        with patch.object(self.service, "request_json", side_effect=self.request) as provider:
            item = self.service.details("screenscraper", 42, self.platform)
            self.assertEqual(item["genres"], ["Puzzle"])
            self.assertEqual(item["developers"], ["Nintendo"])
            self.assertTrue(item["raw"]["extraProviderField"]["preserved"])
            self.assertNotIn("secret-id", json.dumps(item))
            self.assertNotIn("secret-password", json.dumps(item))
            self.assertEqual(len(item["screenshots"]), 7)
            self.credentials.clear()
            self.assertEqual(self.service.details("screenscraper", 42, self.platform), item)
            self.assertEqual(provider.call_count, 1)
        self.credentials.update(SCREENSCRAPER_DEV_ID="test-dev", SCREENSCRAPER_DEV_PASSWORD="test-password")
        opener = Mock()
        opener.open.side_effect = lambda *args, **kwargs: io.BytesIO(PNG)
        with patch.object(metadata.urllib.request, "build_opener", return_value=opener):
            saved = self.service.localize(item, "Games/tetris.gb")
            self.assertEqual(saved["metadataStatus"], "complete")
            self.assertEqual(len(saved["imageOptions"]), 8)
            self.assertEqual(len(saved["screenshots"]), 7)
            self.assertTrue(all((self.root / "GameCovers" / Path(url).name).is_file() for url in saved["imageOptions"]))
            self.assertTrue(all(url.startswith("/game-covers/") for url in saved["imageOptions"]))
            first_request = opener.open.call_args_list[0].args[0].full_url
            self.assertIn("devid=test-dev", first_request)
            self.assertNotIn("secret-id", first_request)
            opener.open.side_effect = AssertionError("Offline: no requests allowed")
            self.assertEqual(self.service.localize(item, "Games/tetris.gb"), saved)

    def test_partial_images_retry_without_redownloading_completed_images(self):
        item = metadata.normalize_screenscraper(RAW, "en")
        opener = Mock()
        def download(req, **kwargs):
            if "shot-2" in req.full_url:
                raise OSError("offline")
            return io.BytesIO(PNG)
        opener.open.side_effect = download
        with patch.object(metadata.urllib.request, "build_opener", return_value=opener):
            saved = self.service.localize(item, "Games/tetris.gb")
            self.assertEqual(saved["metadataStatus"], "partial")
            self.assertEqual(saved["metadataFailedImages"], 1)
            opener.reset_mock()
            opener.open.side_effect = lambda *args, **kwargs: io.BytesIO(PNG)
            retried = self.service.localize(item, "Games/tetris.gb")
            self.assertEqual(retried["metadataStatus"], "complete")
            self.assertEqual(opener.open.call_count, 1)

    def test_images_are_isolated_between_same_title_on_different_consoles(self):
        opener = Mock()
        opener.open.side_effect = lambda *args, **kwargs: io.BytesIO(PNG)
        with patch.object(metadata.urllib.request, "build_opener", return_value=opener):
            first = self.service.download_image(RAW["medias"][1]["url"], "Games/tetris.gb")
            second = self.service.download_image(RAW["medias"][1]["url"], "Games/tetris.gbc")
        self.assertNotEqual(first, second)

    def test_untrusted_urls_redirects_and_non_images_are_rejected(self):
        for url in ("file:///etc/passwd", "http://127.0.0.1/", "https://images.igdb.com.evil.test/image", "https://images.igdb.com:444/image"):
            with self.assertRaises(metadata.MetadataError):
                self.service.download_image(url, "Games/game.gb")
        with self.assertRaises(metadata.MetadataError):
            metadata.ImageRedirect().redirect_request(None, None, 302, "", {}, "http://127.0.0.1/")
        opener = Mock()
        opener.open.return_value = io.BytesIO(b"<html>API quota exceeded</html>")
        with patch.object(metadata.urllib.request, "build_opener", return_value=opener):
            with self.assertRaises(metadata.MetadataError):
                self.service.download_image("https://images.igdb.com/image.jpg", "Games/game.gb")
        self.assertFalse((self.root / "GameCovers").exists())

    def test_platform_validation_and_provider_failure_fallback(self):
        raw = copy.deepcopy(RAW)
        raw["systeme"]["id"] = "12"
        with patch.object(self.service, "request_json", return_value={"response": {"jeu": raw}}):
            with self.assertRaises(metadata.MetadataError):
                self.service.details("screenscraper", 42, self.platform)
        self.credentials.update(IGDB_CLIENT_ID="test", IGDB_CLIENT_SECRET="test")
        requests = []
        def request(source, endpoint, params):
            requests.append((source, endpoint, params))
            if source == "screenscraper":
                raise metadata.MetadataError("unavailable")
            if endpoint == "platforms":
                return [{"id": 33, "name": "Game Boy"}]
            return [{"id": 42, "name": "Tetris", "summary": "IGDB description", "cover": {"image_id": "cover"},
                     "screenshots": [{"image_id": "screenshot"}], "genres": [{"name": "Puzzle"}],
                     "involved_companies": [{"developer": True, "company": {"name": "Nintendo"}}]}]
        with patch.object(self.service, "request_json", side_effect=request):
            search = self.service.search('Tetris (Europe) [!]', self.platform)
            self.assertEqual(search["results"][0]["source"], "igdb")
            self.assertEqual(len(search["warnings"]), 1)
            self.assertIn('search "Tetris"', requests[-1][2])
            self.assertIn("platforms = (33)", requests[-1][2])
            item = self.service.details("igdb", 42, self.platform)
            self.assertEqual(item["developers"], ["Nintendo"])
            self.assertEqual(len(item["screenshots"]), 1)
            self.assertEqual(item["ratingScale"], 100)


class GameMetadataApiTests(GameMetadataFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        (self.root / "Games").mkdir()
        (self.root / "GameCovers").mkdir()
        values = {"MULTIMEDIA_DIR": str(self.root), "GAMES_DIR": str(self.root / "Games"),
                  "GAME_COVERS_DIR": str(self.root / "GameCovers"), "MEDIA_LIBRARY_PATH": str(self.root / "media_library.json"),
                  "LEGACY_MOVIE_LIBRARY_PATH": str(self.root / "legacy.json")}
        for key, value in values.items():
            p = patch.object(api, key, value); p.start(); self.addCleanup(p.stop)
        for name, value in (("ensure_media_directories", None), ("get_library_counts", {}),
                            ("is_authorized_request", True), ("game_metadata_service", self.service)):
            p = patch.object(api, name, return_value=value); p.start(); self.addCleanup(p.stop)
        p = patch.object(self.service, "request_json", side_effect=self.request); p.start(); self.addCleanup(p.stop)
        self.opener = Mock()
        self.opener.open.side_effect = lambda *args, **kwargs: io.BytesIO(PNG)
        p = patch.object(metadata.urllib.request, "build_opener", return_value=self.opener); p.start(); self.addCleanup(p.stop)
        self.client = api.app.test_client()

    def upload(self, **fields):
        return self.client.post("/games/upload", data={"file": (io.BytesIO(b"rom fixture"), "Tetris.gb"),
            "name": "Tetris", "platform": "gb", **fields})

    def test_upload_searches_and_persists_all_details_through_edit_reload_and_delete(self):
        result = self.upload()
        self.assertEqual(result.status_code, 200, result.json)
        item = result.json["item"]
        self.assertEqual(item["metadataStatus"], "complete")
        self.assertEqual(len(item["screenshots"]), 7)
        self.assertEqual(item["description"], "Puzzle description")
        self.credentials.clear()
        self.opener.open.side_effect = AssertionError("No remote calls on reload")
        loaded = api.list_game_entries()[0]
        self.assertEqual(loaded["gameMetadata"]["developers"], ["Nintendo"])
        self.assertNotIn("raw", loaded["gameMetadata"])
        edited = self.client.post("/games/profile", data={"relativePath": item["relativePath"],
            "name": "My title", "description": "My notes", "coverImage": item["coverImage"],
            "imageOptions": json.dumps(item["imageOptions"])})
        self.assertEqual(edited.status_code, 200)
        saved = self.client.get("/games/metadata", query_string={"relativePath": item["relativePath"]}).json["item"]
        self.assertTrue(saved["gameMetadata"]["raw"]["extraProviderField"]["preserved"])
        self.assertEqual(saved["metadataId"], 42)
        self.assertEqual(saved["name"], "My title")
        deleted = self.client.delete("/games", query_string={"relativePath": item["relativePath"]})
        self.assertEqual(deleted.status_code, 200)
        self.assertFalse(list((self.root / "GameCovers").glob("*.png")))
        self.assertEqual(api.list_game_entries(), [])

    def test_explicit_selection_fetches_details_and_preserves_custom_cover_and_text(self):
        item = self.upload(metadataSource="screenscraper", metadataId="42", description="Personal notes",
                           coverFile=(io.BytesIO(PNG), "cover.png")).json["item"]
        self.assertEqual(item["description"], "Personal notes")
        self.assertIn("-cover.png", item["coverImage"])
        self.assertEqual(len(item["imageOptions"]), 9)
        retried = self.client.post("/games/metadata", json={"relativePath": item["relativePath"]}).json["item"]
        self.assertEqual(retried["coverImage"], item["coverImage"])
        self.assertEqual(retried["description"], "Personal notes")

    def test_unconfigured_provider_and_error_keep_rom_and_report_incomplete_profile(self):
        self.credentials.clear()
        item = self.upload().json["item"]
        self.assertEqual(item["metadataStatus"], "not_configured")
        self.assertTrue((self.root / item["relativePath"]).exists())
        with patch.object(self.service, "details", side_effect=metadata.MetadataError("offline")):
            failed = self.upload(metadataSource="screenscraper", metadataId="42").json["item"]
        self.assertEqual(failed["metadataStatus"], "error")
        self.assertEqual(failed["metadataId"], 42)
        self.assertTrue((self.root / failed["relativePath"]).exists())

    def test_ambiguous_titles_do_not_save_a_random_game(self):
        games = [{"source": "screenscraper", "id": ident, "name": "Tetris"} for ident in (42, 43)]
        with patch.object(self.service, "search", return_value={"configured": True, "results": games, "warnings": []}):
            item = self.upload().json["item"]
        self.assertEqual(item["metadataStatus"], "needs_selection")
        self.assertNotIn("gameMetadata", item)

    def test_retry_downloads_missing_artwork_and_requires_authentication(self):
        self.opener.open.side_effect = OSError("Offline")
        item = self.upload(metadataSource="screenscraper", metadataId="42").json["item"]
        self.assertEqual(item["metadataStatus"], "partial")
        self.opener.open.side_effect = lambda *args, **kwargs: io.BytesIO(PNG)
        retried = self.client.post("/games/metadata", json={"relativePath": item["relativePath"]}).json["item"]
        self.assertEqual(retried["metadataStatus"], "complete")
        self.assertEqual(len(retried["screenshots"]), 7)
        self.assertEqual(len(api.list_game_entries()), 1)
        with patch.object(api, "is_authorized_request", return_value=False):
            self.assertEqual(self.client.get("/games/metadata", query_string={"relativePath": item["relativePath"]}).status_code, 401)
            self.assertEqual(self.client.post("/games/metadata", json={"relativePath": item["relativePath"]}).status_code, 401)


if __name__ == "__main__":
    unittest.main()
