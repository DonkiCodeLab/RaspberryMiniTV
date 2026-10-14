import email
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from collections import deque
from unittest.mock import MagicMock, patch
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import catalog_file as files
import control_api as api
from catalog_ai import AIError, AISettings


def snapshot():
    return {
        "movieRootFiles": [{"relativePath": "Movies/Dune.mp4", "name": "Dune"},
                           {"relativePath": "Movies/Arrival.mp4", "name": "Arrival"}],
        "directories": [{"relativePath": "TVShows/Dark", "name": "Dark"}],
        "books": [{"relativePath": "Books/Dune.epub", "name": "Dune", "collection": "Private collection",
                   "originalMetadata": {"title": "Dune", "author": "Frank Herbert", "year": "1965",
                                        "description": "Do not upload this synopsis"}}],
        "games": [{"relativePath": "Games/Dune.sfc", "name": "Dune", "platform": "snes",
                   "gameMetadata": {"name": "Dune", "developers": ["Cryo"], "releaseDate": "1992-01-01",
                                    "description": "Do not upload this game synopsis"}}],
        "pictures": [{"relativePath": "Pictures/private.jpg", "name": "Private photo"}],
        "mediaLibrary": {"movies": {"Movies/deleted.mp4": {"name": "Deleted movie"}}},
    }


def selection(ids=(), intent="filter", all_items=False):
    return {"intent": intent, "ids": list(ids), "message": "Selección por temas.", "all": all_items}


class CatalogFileTests(unittest.TestCase):
    def setUp(self):
        self.settings = {"apiKey": "sk-synthetic-test", "enabled": True}
        self.exported = files.export_catalog(snapshot(), None)
        self.saved = {"records": self.exported["records"], "fileId": "file-synthetic"}

    def test_compact_export_excludes_paths_synopses_photos_and_deleted_profiles(self):
        content = self.exported["content"].decode()
        for forbidden in (".mp4", ".epub", "Books/", "Movies/", "synopsis", "Private photo", "Private collection", "Deleted movie", "sk-"):
            self.assertNotIn(forbidden, content)
        self.assertIn("Frank Herbert", content)
        self.assertIn("1965", content)
        self.assertIn("Cryo", content)
        self.assertEqual(self.exported["counts"], {"movies": 2, "series": 1, "books": 1, "games": 1})
        reordered = snapshot()
        reordered["movieRootFiles"].reverse()
        self.assertEqual(self.exported["checksum"], files.export_catalog(reordered, None)["checksum"])
        self.assertEqual(self.exported["content"], files.export_catalog(reordered, None)["content"])

    def test_export_is_bounded_without_silent_truncation(self):
        with patch.object(files, "MAX_FILE_BYTES", 10), self.assertRaises(AIError) as error:
            files.export_catalog(snapshot(), None)
        self.assertEqual(error.exception.code, "AI_CATALOG_TOO_LARGE")

    def test_uploaded_snapshot_persists_privately_and_is_bound_to_credentials(self):
        with tempfile.TemporaryDirectory() as root:
            store = files.CatalogFileStore(Path(root) / "ai.json")
            self.assertIsNone(store.load(self.settings))
            saved = store.save(self.exported, "file-synthetic", self.settings)
            self.assertEqual(files.CatalogFileStore(Path(root) / "ai.json").load(self.settings), saved)
            self.assertEqual(store.path.stat().st_mode & 0o777, 0o600)
            self.assertNotIn(self.settings["apiKey"], store.path.read_text())
            self.assertIsNone(store.load({"apiKey": "another-key"}))
            with patch.object(files.os, "replace", side_effect=OSError("failure")), self.assertRaises(AIError):
                store.save(self.exported, "file-replacement", self.settings)
            self.assertEqual(store.load(self.settings)["fileId"], "file-synthetic")
            store.path.write_text('{"version":1}')
            with self.assertRaises(AIError) as error:
                store.load(self.settings)
            self.assertEqual(error.exception.code, "AI_CATALOG_STORAGE_ERROR")

    def test_selection_rejects_invented_cross_section_ids_and_drops_deleted_items(self):
        movies = [item for item in self.saved["records"] if item["section"] == "movies"]
        book = next(item for item in self.saved["records"] if item["section"] == "books")
        for identifier in (-1, 2 ** 52, True, "12", book["id"], 1):
            with self.subTest(identifier=identifier), self.assertRaises(AIError):
                files.resolve_selection(selection([identifier]), self.saved, "movies", movies)
        self.assertEqual(files.resolve_selection(selection([movies[0]["id"], movies[0]["id"], movies[1]["id"]]),
                                                self.saved, "movies", movies[1:]), [movies[1]["path"]])
        new = {"id": 42, "section": "movies", "path": "Movies/new.mp4"}
        self.assertEqual(files.resolve_selection(selection(intent="count", all_items=True), self.saved, "movies", movies + [new]),
                         [item["path"] for item in movies])
        for bad in (selection([movies[0]["id"]], intent="clarify"), selection([movies[0]["id"]], all_items=True),
                    {**selection(), "extra": 1}, {**selection(), "message": "x" * 601},
                    {**selection(), "ids": [0] * (files.MAX_MATCHES + 1)}):
            with self.subTest(bad=bad), self.assertRaises(AIError):
                files.validate_selection(bad)

    def test_upload_is_multipart_user_data_and_query_attaches_only_saved_file(self):
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = b'{"id":"file-uploaded"}'
        opener = MagicMock()
        opener.open.return_value = response
        with patch("catalog_ai.urllib.request.build_opener", return_value=opener):
            self.assertEqual(files.upload_catalog(self.exported, self.settings), "file-uploaded")
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, files.FILES_URL)
        self.assertEqual(request.get_header("Authorization"), "Bearer sk-synthetic-test")
        message = email.message_from_bytes(("Content-Type: " + request.get_header("Content-type") + "\r\n\r\n").encode() + request.data)
        parts = message.get_payload()
        self.assertEqual(parts[0].get_payload(decode=True), b"user_data")
        self.assertEqual(parts[1].get_filename(), "minitv-catalog.txt")
        self.assertEqual(parts[1].get_payload(decode=True), self.exported["content"])
        with patch.object(files, "_post_response", return_value=[]) as post:
            files.query_catalog_file("Historias sobre poder", "movies", "es", self.settings, self.saved)
        body = post.call_args.args[1]
        self.assertEqual(body["input"][0]["content"][0], {"type": "input_file", "file_id": "file-synthetic"})
        self.assertIs(body["store"], False)
        self.assertNotIn("text", body)
        self.assertNotIn("Movies/", json.dumps(body))
        self.assertNotIn("sk-synthetic-test", json.dumps(body))
        self.assertNotIn("tools", body)
        self.assertIn("conocimiento de las obras", body["instructions"])
        self.assertEqual(body["input"][0]["content"][1]["text"], "Historias sobre poder")

    def test_file_transport_errors_are_safe_and_do_not_retry(self):
        opener = MagicMock()
        opener.open.side_effect = urllib.error.HTTPError(files.FILES_URL, 400, "sk-synthetic-test", {}, io.BytesIO(b"secret"))
        with patch("catalog_ai.urllib.request.build_opener", return_value=opener), self.assertRaises(AIError) as error:
            files.upload_catalog(self.exported, self.settings)
        self.assertEqual(error.exception.code, "AI_CATALOG_FILE_ERROR")
        self.assertNotIn("sk-synthetic-test", str(error.exception))
        self.assertEqual(opener.open.call_count, 1)
        with patch.object(files, "_request_json") as request:
            with self.assertRaises(AIError):
                files.delete_catalog_file("../other-file", self.settings)
            with self.assertRaises(AIError):
                files.upload_catalog(files.export_catalog({}, None), self.settings)
            request.assert_not_called()

    def test_query_only_allows_ids_from_the_active_section_even_with_shared_titles(self):
        # Dune is present as a movie, book and game, each with a different ID.
        for section in files.SECTIONS:
            report = {}
            with self.subTest(section=section), patch.object(files, "_post_response", return_value=[]) as post:
                files.query_catalog_file("Dune", section, "es", self.settings, self.saved, diagnostics=report)
                body = post.call_args.args[1]
                self.assertNotIn("text", body)
                self.assertIn(f'section="{section}"', body["instructions"])
                self.assertLess(len(body["instructions"]), 650)
                self.assertIn("exclusivamente un array JSON", body["instructions"])
                self.assertEqual(body["input"][0]["content"][1]["text"], "Dune")
                self.assertEqual(report["request"]["instructions"], body["instructions"])
                self.assertEqual(report["scope"]["section"], section)
                self.assertEqual(report["scope"]["idConstraint"], "server_validation")

    def test_large_sections_use_the_whole_file_without_enumerating_ids(self):
        saved = {"fileId": "file-large", "records": [{"id": 4_000_000_000_000_000 + index, "section": "books"} for index in range(2000)]}
        last = saved["records"][-1]["id"]
        with patch.object(files, "_post_response", return_value=[last]) as post:
            result = files.query_catalog_file("Historias sobre poder", "books", "es", self.settings, saved)
        body = post.call_args.args[1]
        self.assertEqual(result["ids"], [last])
        self.assertNotIn("text", body)
        self.assertNotIn(str(last), json.dumps(body))
        self.assertEqual(body["input"][0]["content"][0]["file_id"], "file-large")

    def test_only_arrays_are_accepted_including_empty_and_integer_arrays(self):
        for raw in ({"ids": [1]}, selection(), "[1]", None, 1, [True], [1.1], [0] * 2001):
            with self.subTest(raw=str(raw)[:80]), patch.object(files, "_post_response", return_value=raw):
                with self.assertRaises(AIError):
                    files.query_catalog_file("Dune", "movies", "es", self.settings, self.saved)
        for raw in ([], [1, 2], [4503599627370495]):
            with patch.object(files, "_post_response", return_value=raw):
                self.assertEqual(files.query_catalog_file("Dune", "movies", "es", self.settings, self.saved)["ids"], raw)

    def test_quoted_ids_preserve_exact_values_and_existing_catalogue_mapping(self):
        for section in files.SECTIONS:
            current = [item for item in self.saved["records"] if item["section"] == section]
            identifiers = [item["id"] for item in current]
            raw = [str(identifier) for identifier in identifiers]
            with self.subTest(section=section), patch.object(files, "_post_response", return_value=raw):
                result = files.query_catalog_file("Historias sobre poder", section, "es", self.settings, self.saved)
            self.assertEqual(result["ids"], identifiers)
            self.assertEqual(files.resolve_selection(result, self.saved, section, current), [item["path"] for item in current])
            self.assertEqual(raw, [str(identifier) for identifier in identifiers])

    def test_quoted_ids_reject_rounding_notation_whitespace_and_noncanonical_values(self):
        for identifier in ("01", " 12", "12 ", "12\n", "+12", "-1", "1e3", "12.0", "１２", "", str(2 ** 52), True, None):
            with self.subTest(identifier=identifier), patch.object(files, "_post_response", return_value=[identifier]):
                with self.assertRaises(AIError) as error:
                    files.query_catalog_file("Historias sobre poder", "movies", "es", self.settings, self.saved)
                self.assertEqual(error.exception.code, "AI_INVALID_PLAN")



class CatalogFileApiTests(unittest.TestCase):
    def setUp(self):
        root = tempfile.TemporaryDirectory()
        self.addCleanup(root.cleanup)
        self.settings = AISettings(Path(root.name) / "ai.json")
        self.settings.update({"enabled": True, "apiKey": "sk-synthetic-test"})
        self.snapshot = snapshot()
        for name, value in (("ai_settings_store", self.settings), ("current_web_pin", lambda: "test-pin"),
                            ("ai_request_times", deque()), ("ai_request_active", False), ("tmdb_artwork", None)):
            patcher = patch.object(api, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.scan = patch.object(api, "list_video_directories", return_value=self.snapshot).start()
        self.upload = patch.object(api, "upload_catalog", return_value="file-first").start()
        self.delete = patch.object(api, "delete_catalog_file").start()
        self.addCleanup(patch.stopall)
        self.client = api.app.test_client()
        self.headers = {"X-Web-Pin": "test-pin"}
        self.store = files.CatalogFileStore(self.settings.path)

    def post_upload(self):
        return self.client.post("/settings/ai/catalog", headers=self.headers)

    def search(self, section="movies"):
        return self.client.post("/ai/search", headers=self.headers, json={"section": section, "language": "es", "prompt": "Sobre poder"})

    def test_model_list_requires_pin_and_never_returns_saved_credentials(self):
        with patch.object(api, "list_models", return_value=[{"id": "chat-latest", "created": 12}]) as models:
            self.assertEqual(self.client.get("/settings/ai/models").status_code, 401)
            models.assert_not_called()
            response = self.client.get("/settings/ai/models", headers=self.headers)
            self.assertEqual(response.json["models"], [{"id": "chat-latest", "created": 12}])
            self.assertEqual(response.json["defaultModel"], self.settings.public()["model"])
            self.assertNotIn("apiKey", response.get_data(as_text=True))
            self.assertNotIn("sk-synthetic-test", response.get_data(as_text=True))
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            models.side_effect = AIError("Unavailable", "AI_TIMEOUT", 504)
            self.assertEqual(self.client.get("/settings/ai/models", headers=self.headers).json["code"], "AI_TIMEOUT")
            models.reset_mock()
            self.settings.update({"clearApiKey": True})
            self.assertEqual(self.client.get("/settings/ai/models", headers=self.headers).json["models"], [])
            models.assert_not_called()

    def test_selected_model_is_forwarded_without_modifying_saved_settings(self):
        self.post_upload()
        original = self.settings.credentials()
        movie = next(item for item in self.store.load(original)["records"] if item["section"] == "movies")
        opener = self.provider(json.dumps(self.provider_payload([movie["id"]])).encode())
        query = {"section": "movies", "language": "es", "prompt": "Dune", "model": "chat-latest"}
        with patch("catalog_ai.urllib.request.build_opener", return_value=opener):
            response = self.client.post("/ai/search", headers=self.headers, json=query)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["ids"], [movie["path"]])
        self.assertEqual(response.json["debug"]["request"]["model"], "chat-latest")
        self.assertEqual(json.loads(opener.open.call_args.args[0].data)["model"], "chat-latest")
        self.assertEqual(self.settings.credentials(), original)
        with patch.object(api, "query_catalog_file") as provider:
            for model in (None, "", "https://evil.invalid", "a" * 101, 1, {}, "gpt-4.1\n"):
                self.assertEqual(self.client.post("/ai/search", headers=self.headers, json={**query, "model": model}).status_code, 400)
            provider.assert_not_called()

    def test_manual_upload_only_pin_and_status_no_external_calls(self):
        for method in ("get", "post"):
            self.assertEqual(getattr(self.client, method)("/settings/ai/catalog").status_code, 401)
        self.upload.assert_not_called()
        response = self.client.get("/settings/ai/catalog", headers=self.headers)
        self.assertFalse(response.json["catalog"]["uploaded"])
        self.assertEqual(response.json["catalog"]["currentCount"], 5)
        self.upload.assert_not_called()
        self.assertEqual(self.search().json["code"], "AI_CATALOG_NOT_UPLOADED")
        self.settings.update({"enabled": False})
        response = self.post_upload()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["catalog"]["fileId"], "file-first")
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertNotIn("sk-synthetic-test", response.get_data(as_text=True))
        self.assertNotIn("Movies/", response.get_data(as_text=True))
        self.upload.assert_called_once()
        self.assertEqual(self.client.post("/settings/ai/catalog", headers=self.headers, json={"fileId": "file-forged"}).status_code, 400)

    def test_queries_use_saved_snapshot_validate_ids_and_detect_pending_changes(self):
        self.post_upload()
        saved = self.store.load(self.settings.credentials())
        movie = next(item for item in saved["records"] if item["section"] == "movies")
        with patch.object(api, "query_catalog_file", return_value=selection([movie["id"]])) as query:
            response = self.search()
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json["ids"], [movie["path"]])
            self.assertEqual(response.json["count"], 1)
            self.assertFalse(response.json["catalogStale"])
            self.assertEqual(query.call_args.args[-1]["fileId"], "file-first")
            self.snapshot["movieRootFiles"] = [{"relativePath": "Movies/new.mp4", "name": "New"}]
            response = self.search()
            self.assertEqual(response.json["ids"], [])
            self.assertTrue(response.json["catalogStale"])
        status = self.client.get("/settings/ai/catalog", headers=self.headers).json["catalog"]
        self.assertTrue(status["stale"])
        self.upload.assert_called_once()
        with patch.object(api, "query_catalog_file", return_value=selection([1])):
            self.assertEqual(self.search().json["code"], "AI_INVALID_IDS")
        self.assertFalse(api.ai_request_active)

    def test_failed_replacement_keeps_previous_snapshot_then_success_cleans_it_up(self):
        self.post_upload()
        self.upload.side_effect = AIError("Upload failed", "AI_TIMEOUT", 504)
        self.assertEqual(self.post_upload().status_code, 504)
        self.assertEqual(self.store.load(self.settings.credentials())["fileId"], "file-first")
        self.delete.assert_not_called()
        self.upload.side_effect = None
        self.upload.return_value = "file-second"
        response = self.post_upload()
        self.assertEqual(response.json["catalog"]["fileId"], "file-second")
        self.delete.assert_called_once_with("file-first", self.settings.credentials())
        self.upload.return_value = "file-third"
        self.delete.side_effect = AIError("Cleanup failed", "AI_TIMEOUT", 504)
        self.assertTrue(self.post_upload().json["cleanupPending"])
        self.assertEqual(self.store.load(self.settings.credentials())["fileId"], "file-third")

    def test_key_changes_and_overlapping_operations_cannot_mix_snapshots(self):
        self.post_upload()
        with api.ai_request_slot(10):
            self.assertEqual(self.post_upload().json["code"], "AI_BUSY")
        self.upload.assert_called_once()
        original = self.settings.credentials()
        def change_key(*args):
            self.settings.update({"apiKey": "sk-other"})
            return "file-raced"
        self.upload.side_effect = change_key
        response = self.post_upload()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json["code"], "AI_CATALOG_SETTINGS_CHANGED")
        self.delete.assert_called_once_with("file-raced", original)
        self.assertEqual(self.store.load(original)["fileId"], "file-first")
        self.assertEqual(self.search().json["code"], "AI_CATALOG_NOT_UPLOADED")

    def test_corrupt_manifest_can_be_repaired_with_explicit_upload(self):
        self.store.path.write_text("broken")
        self.assertEqual(self.post_upload().status_code, 200)
        self.assertEqual(self.store.load(self.settings.credentials())["fileId"], "file-first")

    def provider_payload(self, value):
        return {"id": "resp-diagnostic", "model": "gpt-4.1-mini", "status": "completed",
                "usage": {"input_tokens": 450, "output_tokens": 70},
                "output": [{"type": "message", "status": "completed", "role": "assistant",
                            "content": [{"type": "output_text", "text": json.dumps(value, ensure_ascii=False)}]}]}

    def provider(self, raw):
        opener = MagicMock()
        response = opener.open.return_value.__enter__.return_value
        response.status = 200
        response.headers = {"x-request-id": "req-diagnostic"}
        response.read.return_value = raw
        return opener

    def test_debug_retains_original_response_when_catalog_rejects_ids(self):
        self.post_upload()
        output = [1]
        raw = json.dumps(self.provider_payload(output), ensure_ascii=False).encode()
        opener = self.provider(raw)
        with patch("catalog_ai.urllib.request.build_opener", return_value=opener):
            response = self.search()
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json["code"], "AI_INVALID_IDS")
        report = response.json["debug"]
        self.assertEqual(report["provider"]["rawResponse"], raw.decode())
        self.assertEqual(json.loads(report["outputText"]), output)
        self.assertEqual(report["request"]["fileIds"], ["file-first"])
        self.assertEqual(report["provider"]["requestId"], "req-diagnostic")
        self.assertEqual(report["stage"], "id_validation")
        self.assertEqual(report["validation"]["invalidIds"], [1])
        self.assertEqual(report["matching"]["invalidIds"], [1])
        self.assertEqual(opener.open.call_count, 1)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertNotIn("sk-synthetic-test", response.get_data(as_text=True))

    def test_cross_section_provider_ids_are_rejected_in_every_section(self):
        self.post_upload()
        records = self.store.load(self.settings.credentials())["records"]
        for section in files.SECTIONS:
            foreign = next(item for item in records if item["section"] != section)
            opener = self.provider(json.dumps(self.provider_payload([str(foreign["id"])])).encode())
            with self.subTest(section=section), patch("catalog_ai.urllib.request.build_opener", return_value=opener):
                response = self.search(section)
                self.assertEqual(response.status_code, 502)
                self.assertEqual(response.json["code"], "AI_INVALID_IDS")
                self.assertEqual(response.json["debug"]["matching"]["invalidIds"], [foreign["id"]])
                self.assertEqual(response.json["debug"]["scope"]["section"], section)
                self.assertEqual(response.json["debug"]["scope"]["idConstraint"], "server_validation")
                body = json.loads(opener.open.call_args.args[0].data)
                self.assertNotIn("text", body)
                self.assertIn(f'section="{section}"', body["instructions"])

    def test_debug_identifies_incomplete_json_and_selection_validation_separately(self):
        self.post_upload()
        payload = self.provider_payload(selection())
        incomplete = {**payload, "status": "incomplete", "incomplete_details": {"reason": "max_output_tokens"}}
        invalid_json = self.provider_payload(selection())
        invalid_json["output"][0]["content"][0]["text"] = '{"ids":['
        cases = [(incomplete, "provider_status", "AI_INCOMPLETE_RESPONSE"),
                 (invalid_json, "model_json", "AI_INVALID_PLAN"),
                 (self.provider_payload({**selection(), "message": "first\nsecond"}), "selection_validation", "AI_INVALID_PLAN")]
        for payload, stage, code in cases:
            raw = json.dumps(payload).encode()
            with self.subTest(stage=stage), patch("catalog_ai.urllib.request.build_opener", return_value=self.provider(raw)):
                response = self.search()
            self.assertEqual(response.json["code"], code)
            self.assertEqual(response.json["debug"]["stage"], stage)
            self.assertEqual(response.json["debug"]["provider"]["rawResponse"], raw.decode())
        self.assertEqual(response.json["debug"]["validation"]["reason"], "expected_id_array")

    def test_debug_handles_http_errors_and_invalid_or_oversized_payloads_without_exposing_key(self):
        self.post_upload()
        from catalog_ai import MAX_RESPONSE_BYTES
        error_body = b'{"error":{"message":"Rejected sk-synthetic-test", "code":"invalid_api_key"}}'
        opener = self.provider(b"")
        opener.open.side_effect = urllib.error.HTTPError(files.FILES_URL, 401, "Unauthorized", {"x-request-id": "req-auth"}, io.BytesIO(error_body))
        with patch("catalog_ai.urllib.request.build_opener", return_value=opener):
            response = self.search()
        self.assertEqual(response.json["debug"]["provider"]["httpStatus"], 401)
        self.assertIn("invalid_api_key", response.json["debug"]["provider"]["rawResponse"])
        self.assertNotIn("sk-synthetic-test", response.get_data(as_text=True))
        self.assertIn("[REDACTED]", response.get_data(as_text=True))
        for raw, truncated in ((b"<html>Upstream failure</html>", False), (b"x" * (MAX_RESPONSE_BYTES + 1), True)):
            with patch("catalog_ai.urllib.request.build_opener", return_value=self.provider(raw)):
                response = self.search()
            self.assertEqual(response.json["code"], "AI_INVALID_RESPONSE")
            self.assertEqual(response.json["debug"]["provider"]["truncated"], truncated)
            self.assertLessEqual(len(response.json["debug"]["provider"]["rawResponse"]), MAX_RESPONSE_BYTES)

    def test_debug_success_does_not_leak_into_a_later_request_without_provider_response(self):
        self.post_upload()
        movie = next(item for item in self.store.load(self.settings.credentials())["records"] if item["section"] == "movies")
        raw = json.dumps(self.provider_payload([str(movie["id"])])).encode()
        with patch("catalog_ai.urllib.request.build_opener", return_value=self.provider(raw)):
            response = self.search()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["ids"], [movie["path"]])
        self.assertEqual(response.json["debug"]["parsedOutput"], [str(movie["id"])])
        self.assertEqual(response.json["debug"]["matching"]["matchedCount"], 1)
        self.assertEqual(response.json["debug"]["stage"], "completed")
        self.settings.update({"enabled": False})
        response = self.search()
        self.assertFalse(response.json["debug"]["provider"]["called"])
        self.assertIsNone(response.json["debug"]["provider"]["rawResponse"])
        self.assertNotIn("resp-diagnostic", response.get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
