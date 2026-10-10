import json
from pathlib import Path
import sys
import tempfile
import unittest
from collections import deque
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api
from catalog_ai import AIError, AISettings


class CatalogAIApiTests(unittest.TestCase):
    def setUp(self):
        root = tempfile.TemporaryDirectory()
        self.addCleanup(root.cleanup)
        self.path = Path(root.name) / "ai.json"
        self.settings = AISettings(self.path)
        self.settings.update({"enabled": True, "apiKey": "sk-test-secret", "requestsPerMinute": 10})
        for name, value in (("ai_settings_store", self.settings), ("current_web_pin", lambda: "test-pin"),
                            ("ai_request_times", deque()), ("ai_request_active", False)):
            patcher = patch.object(api, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = api.app.test_client()
        self.headers = {"X-Web-Pin": "test-pin"}
        self.query = {"section": "movies", "prompt": "Películas con Tom Hanks", "language": "es"}
        self.plan = {"intent": "filter", "message": "Películas con Tom Hanks", "groups": [
            {"conditions": [{"field": "actor", "op": "contains", "value": "Tom Hanks"}]}]}
        self.records = [
            {"id": "Movies/apollo.mp4", "fields": {"title": ["Apollo 13"], "actor": ["Tom Hanks"], "year": 1995}},
            {"id": "Movies/other.mp4", "fields": {"title": ["Other"], "actor": ["Another Actor"], "year": 1995}},
        ]

    def search(self, **changes):
        return self.client.post("/ai/search", headers=self.headers, json={**self.query, **changes})

    def test_all_routes_require_pin(self):
        with patch.object(api, "plan_query") as planner, patch.object(api, "test_connection") as connection:
            for route, method in (("/settings/ai", "get"), ("/settings/ai", "post"),
                                  ("/settings/ai/test", "post"), ("/ai/search", "post")):
                self.assertEqual(getattr(self.client, method)(route).status_code, 401)
            planner.assert_not_called()
            connection.assert_not_called()

    def test_settings_redact_key_preserve_blank_and_explicitly_delete(self):
        response = self.client.get("/settings/ai", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json["settings"]["configured"])
        self.assertNotIn("sk-test-secret", response.get_data(as_text=True))
        self.assertNotIn("apiKey", response.json["settings"])
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        response = self.client.post("/settings/ai", headers=self.headers, json={"apiKey": "", "model": "gpt-4.1-mini"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.settings.credentials()["apiKey"], "sk-test-secret")
        response = self.client.post("/settings/ai", headers=self.headers, json={"clearApiKey": True})
        self.assertFalse(response.json["settings"]["configured"])
        self.assertFalse(self.settings.credentials()["apiKey"])
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)

    def test_invalid_request_and_disabled_settings_never_call_provider_or_scan(self):
        with patch.object(api, "plan_query") as planner, patch.object(api, "list_video_directories") as scan:
            for data in ([], {**self.query, "section": []}, {**self.query, "section": "secrets"},
                         {**self.query, "prompt": " "}, {**self.query, "prompt": "x" * 2001},
                         {**self.query, "language": []}, {**self.query, "apiKey": "client-secret"}):
                response = self.client.post("/ai/search", headers=self.headers, json=data)
                self.assertEqual(response.status_code, 400)
            self.settings.update({"enabled": False})
            self.assertEqual(self.search().json["code"], "AI_DISABLED")
            self.settings.update({"enabled": True, "clearApiKey": True})
            self.assertEqual(self.search().json["code"], "AI_NOT_CONFIGURED")
            planner.assert_not_called()
            scan.assert_not_called()

    def test_executes_validated_plan_on_real_records_and_returns_no_credentials(self):
        with patch.object(api, "list_video_directories", return_value={"local": "snapshot"}) as scan, \
                patch.object(api, "build_catalog", return_value={"records": self.records, "missingMetadata": 1}) as catalog, \
                patch.object(api, "plan_query", return_value=self.plan) as planner:
            response = self.search()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["ids"], ["Movies/apollo.mp4"])
        self.assertEqual(response.json["count"], 1)
        self.assertEqual(response.json["total"], 2)
        self.assertEqual(response.json["missingMetadata"], 1)
        self.assertNotIn("sk-test-secret", response.get_data(as_text=True))
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        scan.assert_called_once_with()
        catalog.assert_called_once_with("movies", {"local": "snapshot"}, api.tmdb_artwork, "es")
        # Only the prompt and bounded settings reach the provider; no records or files.
        self.assertEqual(planner.call_args.args[:3], (self.query["prompt"], "movies", "es"))
        self.assertEqual(len(planner.call_args.args), 4)
        self.assertNotIn("records", planner.call_args.args[3])

    def test_clarification_does_not_execute_filter_and_empty_catalog_does_not_spend(self):
        with patch.object(api, "list_video_directories", return_value={}), \
                patch.object(api, "build_catalog", return_value={"records": self.records, "missingMetadata": 0}), \
                patch.object(api, "plan_query", return_value={"intent": "clarify", "message": "¿Qué actor?", "groups": []}), \
                patch.object(api, "execute_plan") as execute:
            response = self.search()
        self.assertEqual(response.json["intent"], "clarify")
        self.assertEqual(response.json["ids"], [])
        execute.assert_not_called()
        with patch.object(api, "list_video_directories", return_value={}), \
                patch.object(api, "build_catalog", return_value={"records": [], "missingMetadata": 0}), \
                patch.object(api, "plan_query") as planner:
            response = self.search()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["total"], 0)
        planner.assert_not_called()

    def test_invalid_plan_fails_closed_and_provider_error_releases_slot(self):
        with patch.object(api, "list_video_directories", return_value={}), \
                patch.object(api, "build_catalog", return_value={"records": self.records, "missingMetadata": 0}), \
                patch.object(api, "plan_query", return_value={**self.plan, "groups": [{"conditions": [
                    {"field": "shell", "op": "contains", "value": "do something"}]}]}), \
                patch.object(api, "execute_plan") as execute:
            response = self.search()
        self.assertEqual(response.status_code, 502)
        execute.assert_not_called()
        self.assertFalse(api.ai_request_active)
        with patch.object(api, "test_connection", side_effect=AIError("Proveedor no disponible.", code="AI_PROVIDER_ERROR", status=502)):
            response = self.client.post("/settings/ai/test", headers=self.headers)
        self.assertEqual(response.status_code, 502)
        self.assertFalse(api.ai_request_active)

    def test_test_connection_accepts_disabled_and_uses_saved_credentials(self):
        self.settings.update({"enabled": False})
        with patch.object(api, "test_connection") as connection:
            response = self.client.post("/settings/ai/test", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(connection.call_args.args[0]["apiKey"], "sk-test-secret")
        self.assertNotIn("sk-test-secret", response.get_data(as_text=True))

    def test_rate_limit_is_shared_by_tests_and_searches_and_expires(self):
        self.settings.update({"requestsPerMinute": 1})
        with patch.object(api, "test_connection"), patch.object(api.time, "monotonic", return_value=100):
            self.assertEqual(self.client.post("/settings/ai/test", headers=self.headers).status_code, 200)
            response = self.search()
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json["code"], "AI_RATE_LIMIT")
        self.assertEqual(response.headers["Retry-After"], "60")
        with patch.object(api, "test_connection"), patch.object(api.time, "monotonic", return_value=160):
            self.assertEqual(self.client.post("/settings/ai/test", headers=self.headers).status_code, 200)

    def test_parallel_requests_rejected_and_lock_is_always_released(self):
        with api.ai_request_slot(10), patch.object(api, "plan_query") as planner:
            response = self.search()
            self.assertEqual(response.status_code, 429)
            self.assertEqual(response.json["code"], "AI_BUSY")
            planner.assert_not_called()
        self.assertFalse(api.ai_request_active)
        with self.assertRaises(RuntimeError):
            with api.ai_request_slot(10):
                raise RuntimeError("test failure")
        self.assertFalse(api.ai_request_active)


if __name__ == "__main__":
    unittest.main()
