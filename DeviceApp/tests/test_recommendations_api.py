from collections import deque
from copy import deepcopy
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api
import ai_recommender
from catalog_ai import AISettings, AIError
from recommendation_profiles import RecommendationProfiles, empty_preferences
from user_profiles import ProfileStore


class RecommendationsApiTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        self.path = root / "profiles.sqlite3"
        self.profiles = ProfileStore(self.path)
        self.user = self.profiles.save_user({"name": "Lisa", "avatar": "avatar-04"})["id"]
        self.store = RecommendationProfiles(self.path)
        self.settings = AISettings(root / "ai.json")
        self.settings.update({"enabled": True, "apiKey": "sk-private-test"})
        self.records = [{"id": "Movies/A.mp4", "fields": {"title": ["A"], "year": 1999},
                         "tmdbId": 20, "watched": False, "favorite": False}]
        for name, value in (("USER_PROFILES_PATH", str(self.path)), ("ai_settings_store", self.settings),
                            ("current_web_pin", lambda: "test-pin"), ("ai_request_times", deque()),
                            ("ai_request_active", False)):
            helper = patch.object(api, name, value)
            helper.start()
            self.addCleanup(helper.stop)
        for name, value in (("list_video_directories", {}), ("build_catalog", {"records": self.records}),
                            ("augment_catalog", self.records), ("tmdb_credentials", {"apiKey": "tmdb-private"})):
            helper = patch.object(api, name, return_value=value)
            mock = helper.start()
            setattr(self, name, mock)
            self.addCleanup(helper.stop)
        self.client = api.app.test_client()
        self.headers = {"X-Web-Pin": "test-pin"}
        self.base = {"userId": self.user, "section": "movies"}
        self.query = {**self.base, "prompt": "Me gusta la comedia", "language": "es", "revision": 0}
        self.result = {"message": "He tenido en cuenta tus gustos.", "question": "¿Algún actor favorito?",
                       "preferences": {**empty_preferences(), "genres": ["Comedia"]}, "warnings": [],
                       "recommendations": [{"tmdbId": 20, "mediaType": "movie", "title": "A", "year": 1999,
                                            "overview": "", "posterPath": "", "reason": "Comedia",
                                            "available": True, "localIds": ["Movies/A.mp4"]}]}

    def get_memory(self, **changes):
        return self.client.get("/ai/recommendations", headers=self.headers, query_string={**self.base, **changes})

    def post(self, **changes):
        return self.client.post("/ai/recommendations", headers=self.headers, json={**self.query, **changes})

    def test_all_methods_require_pin_without_provider_calls(self):
        with patch.object(api, "recommend") as provider:
            for method in ("get", "post", "patch", "delete"):
                self.assertEqual(getattr(self.client, method)("/ai/recommendations").status_code, 401)
            provider.assert_not_called()

    def test_memory_available_when_disabled_and_isolated(self):
        self.settings.update({"enabled": False})
        response = self.get_memory()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual(response.json["preferences"], empty_preferences())
        prefs = {**empty_preferences(), "actors": ["Tom Hanks"]}
        response = self.client.patch("/ai/recommendations", headers=self.headers,
                                     json={**self.base, "preferences": prefs, "revision": 0})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["revision"], 1)
        self.assertEqual(self.get_memory(section="series").json["preferences"], prefs)
        self.assertEqual(self.get_memory(userId="default").json["preferences"], empty_preferences())
        self.assertEqual(self.get_memory(userId="missing").json["code"], "AI_PROFILE_NOT_FOUND")

    def test_invalid_payloads_never_call_provider(self):
        with patch.object(api, "recommend") as provider:
            for changes in ({"revision": True}, {"revision": -1}, {"section": "books"}, {"section": []},
                            {"userId": ""}, {"userId": []}, {"language": []}, {"prompt": ""},
                            {"prompt": "x" * 2001}, {"prompt": "x\x00"}, {"preferences": {}},
                            {"history": []}, {"apiKey": "clientkey"}):
                self.assertEqual(self.post(**changes).status_code, 400, changes)
            response = self.client.patch("/ai/recommendations", headers=self.headers,
                                         json={**self.base, "preferences": {"genres": []}, "revision": 0})
            self.assertEqual(response.status_code, 400)
            self.assertEqual(self.client.delete("/ai/recommendations", headers=self.headers, json=self.base).status_code, 400)
            provider.assert_not_called()

    def test_recommend_saves_active_user_memory_and_uses_only_its_marks(self):
        self.profiles.patch(self.user, {"marks": {'["movie","Movies/A.mp4"]': {"favorite": True}}})
        self.profiles.patch("default", {"marks": {'["movie","Other.mp4"]': {"watched": True}}})
        self.store.save("default", "movies", {"actors": ["Private other actor"]}, [], 0)
        with patch.object(api, "recommend", return_value=deepcopy(self.result)) as provider:
            response = self.post()
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json["recommendations"], self.result["recommendations"])
        self.assertEqual(response.json["revision"], 1)
        self.assertEqual(response.json["history"][0]["text"], self.query["prompt"])
        self.assertEqual(self.get_memory().json["history"], response.json["history"])
        self.assertEqual(provider.call_args.args[4]["preferences"], empty_preferences())
        self.assertEqual(self.augment_catalog.call_args.args[3], self.profiles.state(self.user))
        self.assertNotIn("Private other actor", str(provider.call_args))
        self.assertNotIn("sk-private-test", response.get_data(as_text=True))
        self.assertNotIn("tmdb-private", response.get_data(as_text=True))
        self.assertEqual(self.get_memory(section="series").json["history"], [])

    def test_stale_memory_rejected_before_paid_request(self):
        self.store.update_preferences(self.user, "movies", {}, 0)
        with patch.object(api, "recommend") as provider:
            response = self.post()
            self.assertEqual(response.status_code, 409)
            self.assertEqual(response.json["code"], "AI_PROFILE_CHANGED")
            provider.assert_not_called()
            self.list_video_directories.assert_not_called()
        self.assertEqual(len(api.ai_request_times), 0)

    def test_clear_during_provider_cannot_resurrect_preferences(self):
        def while_waiting(*args):
            self.store.update_preferences(self.user, "movies", {}, 0, clear_history=True)
            return deepcopy(self.result)
        with patch.object(api, "recommend", side_effect=while_waiting):
            response = self.post()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.get_memory().json["preferences"], empty_preferences())
        self.assertEqual(self.get_memory().json["history"], [])
        self.assertFalse(api.ai_request_active)

    def test_delete_user_during_provider_does_not_recreate_it(self):
        def while_waiting(*args):
            self.profiles.delete_user(self.user)
            return deepcopy(self.result)
        with patch.object(api, "recommend", side_effect=while_waiting):
            self.assertEqual(self.post().status_code, 404)
        self.assertEqual(self.get_memory().status_code, 404)
        self.assertFalse(api.ai_request_active)

    def test_reset_clears_both_histories_preserves_marks_and_other_users(self):
        self.profiles.patch(self.user, {"marks": {'["movie","A"]': {"watched": True}}})
        history = [{"role": "user", "text": "Me gusta la comedia"}]
        self.store.save(self.user, "movies", {"genres": ["Comedia"]}, history, 0)
        self.store.save(self.user, "series", {"genres": ["Comedia"]}, history, 1)
        self.store.save("default", "movies", {"genres": ["Drama"]}, history, 0)
        response = self.client.delete("/ai/recommendations", headers=self.headers, json={**self.base, "revision": 2})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["preferences"], empty_preferences())
        self.assertEqual(self.get_memory().json["history"], [])
        self.assertEqual(self.get_memory(section="series").json["history"], [])
        self.assertTrue(self.profiles.state(self.user)["marks"]['["movie","A"]']["watched"])
        self.assertEqual(self.store.get("default")["preferences"]["genres"], ["Drama"])

    def test_provider_error_releases_slot_without_memory_update(self):
        with patch.object(api, "recommend", side_effect=AIError("Servicio no disponible.", "AI_PROVIDER_ERROR", 502)):
            self.assertEqual(self.post().status_code, 502)
        self.assertFalse(api.ai_request_active)
        self.assertEqual(self.get_memory().json["revision"], 0)
        self.assertEqual(self.get_memory().json["history"], [])

    def test_empty_catalog_can_still_recommend_and_history_stays_bounded(self):
        history = [{"role": "user" if i % 2 == 0 else "assistant", "text": str(i)} for i in range(12)]
        self.store.save(self.user, "movies", {}, history, 0)
        self.augment_catalog.return_value = []
        with patch.object(api, "recommend", return_value=deepcopy(self.result)) as provider:
            response = self.post(revision=1)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json["history"]), 12)
        self.assertEqual(response.json["history"][0]["text"], "2")
        self.assertEqual(provider.call_args.args[5], [])

    def test_disabled_unconfigured_and_busy_never_call_provider(self):
        with patch.object(api, "recommend") as provider:
            self.settings.update({"enabled": False})
            self.assertEqual(self.post().json["code"], "AI_DISABLED")
            self.settings.update({"enabled": True, "clearApiKey": True})
            self.assertEqual(self.post().json["code"], "AI_NOT_CONFIGURED")
            self.settings.update({"apiKey": "sk-test"})
            with api.ai_request_slot(10):
                response = self.post()
                self.assertEqual(response.json["code"], "AI_BUSY")
                self.assertEqual(response.headers["Retry-After"], "60")
            provider.assert_not_called()

    def test_real_recommender_verifies_external_title_and_keeps_followup_context(self):
        provider_result = {"message": "Estas opciones pueden encajarte.", "question": "",
                           "preferenceUpdates": [{"field": "genres", "action": "add", "value": "Comedia",
                                                  "evidence": "Me gusta la comedia"}],
                           "recommendations": [
                               {"catalogId": "c1", "title": "", "year": 0, "mediaType": "movie", "reason": "Puede gustarte."},
                               {"catalogId": "", "title": "B", "year": 2000, "mediaType": "movie", "reason": "Otra opción."}]}
        verified = {"tmdbId": 30, "mediaType": "movie", "title": "B", "year": 2000, "overview": "", "posterPath": "/abc.jpg"}
        with patch.object(ai_recommender, "_post_response", return_value=provider_result), \
                patch.object(api, "resolve_tmdb_title", return_value=verified) as resolve:
            response = self.post()
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(len(response.json["recommendations"]), 2)
        resolve.assert_called_once_with("B", "movie", 2000, "es", {"apiKey": "tmdb-private"})
        self.assertTrue(response.json["recommendations"][0]["available"])
        self.assertFalse(response.json["recommendations"][1]["available"])
        self.assertEqual(response.json["recommendations"][1]["localIds"], [])
        self.assertEqual(response.json["preferences"]["genres"], ["Comedia"])
        self.assertIn("1. A\n2. B", response.json["history"][-1]["text"])


if __name__ == "__main__":
    unittest.main()
