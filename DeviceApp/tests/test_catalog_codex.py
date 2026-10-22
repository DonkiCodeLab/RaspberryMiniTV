import json
import os
from pathlib import Path
import pwd
import sys
import tempfile
import threading
import unittest
from collections import deque
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import catalog_codex as codex
import control_api as api
from catalog_ai import AIError, AISettings


def selection(ids=(), **changes):
    return {"intent": "filter", "message": "Coincidencias", "ids": list(ids), "all": False, **changes}


class CatalogueAgentTests(unittest.TestCase):
    def setUp(self):
        self.records = [{"id": "Movies/private/path.mp4", "fields": {"title": ["Interstellar"], "year": 2014},
                         "watched": False, "favorite": True}]

    def test_snapshot_hides_paths_and_preserves_metadata_and_profile_marks(self):
        local, public = codex.prepare_records("movies", self.records)
        self.assertEqual(local[0]["path"], self.records[0]["id"])
        self.assertEqual(public[0]["title"], ["Interstellar"])
        self.assertEqual(public[0]["watched"], False)
        self.assertEqual(public[0]["favorite"], True)
        self.assertNotIn("private/path", json.dumps(public))
        self.assertNotEqual(local[0]["id"], codex.prepare_records("series", self.records)[0][0]["id"])

    def test_selection_rejects_invented_ids_and_always_closes_process(self):
        with patch.object(codex.CatalogAgent, "run", return_value=selection([999])), patch.object(codex.CatalogAgent, "close") as close:
            with self.assertRaises(AIError) as raised:
                codex.query_codex_catalog("x", "movies", "es", None, self.records, "request-1", {})
            self.assertEqual(raised.exception.code, "AI_INVALID_IDS")
            close.assert_called_once()
            self.assertNotIn("request-1", codex._jobs)

    def test_catalogue_tool_is_paginated_and_cannot_execute_browser_supplied_operations(self):
        agent = codex.CatalogAgent([{"id": i, "title": [str(i)]} for i in range(35)])
        agent.thread = {"id": "catalog-thread"}
        base = {"threadId": "catalog-thread", "tool": codex.TOOL_NAME, "arguments": {"offset": 0}}
        with patch.object(agent, "_write") as write:
            agent._server_request({"id": 1, "method": "item/tool/call", "params": base})
            result = write.call_args.args[0]["result"]
            self.assertTrue(result["success"])
            self.assertEqual(json.loads(result["contentItems"][0]["text"])["nextOffset"], 30)
            for changes in ({"threadId": "development-thread"}, {"tool": "exec"}, {"namespace": "foreign"},
                            {"arguments": {"offset": True}}, {"arguments": {"offset": -1}},
                            {"arguments": {"offset": 0, "sql": "DROP TABLE users"}}):
                agent._server_request({"id": 2, "method": "item/tool/call", "params": {**base, **changes}})
                self.assertFalse(write.call_args.args[0]["result"]["success"])
            agent._server_request({"id": 3, "method": "item/fileChange/requestApproval", "params": {}})
            self.assertEqual(write.call_args.args[0]["result"], {"decision": "decline"})
            agent._server_request({"id": 4, "method": "item/permissions/requestApproval", "params": {}})
            self.assertEqual(write.call_args.args[0]["result"]["permissions"], {})

    def test_cancel_before_registration_is_not_lost(self):
        request_id = "cancel-before-start"
        codex.cancel_codex_search(request_id)
        seen = []
        def run(agent, *args):
            seen.append(agent.cancelled.is_set())
            raise AIError("Cancel", "AI_CANCELLED", 409)
        with patch.object(codex.CatalogAgent, "run", run), patch.object(codex.CatalogAgent, "close") as close:
            with self.assertRaises(AIError):
                codex.query_codex_catalog("x", "movies", "es", None, self.records, request_id, {})
            self.assertEqual(seen, [True])
            close.assert_called_once()

    def test_real_transport_reads_catalogue_and_uses_selected_model_in_ephemeral_thread(self):
        if os.geteuid() == 0:
            self.skipTest("Production refuses to run Codex as root")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "workspace" / ".git").mkdir(parents=True)
            executable = root / "fake-codex"
            executable.write_text("#!" + sys.executable + "\n" + r'''
import json, sys
def emit(value): print(json.dumps(value), flush=True)
for line in sys.stdin:
    message = json.loads(line)
    method = message.get('method')
    if message.get('id') == 'tool-read':
        result = message['result']; assert result['success']
        data = json.loads(result['contentItems'][0]['text']); assert data['records'][0]['title'] == ['Interstellar']
        output = json.dumps({'intent':'filter','message':'Coincidencias','ids':[data['records'][0]['id']],'all':False})
        emit({'method':'item/completed','params':{'threadId':'t','turnId':'u','item':{'id':'answer','type':'agentMessage','text':output,'phase':'final_answer'}}})
        emit({'method':'turn/completed','params':{'threadId':'t','turn':{'id':'u','status':'completed','items':[]}}})
        continue
    if 'id' not in message: continue
    result = {}
    if method == 'initialize': assert message['params']['capabilities']['experimentalApi']
    elif method == 'account/read': result = {'account':{'type':'chatgpt'}}
    elif method == 'config/read': result = {'config':{'mcp_servers':{'private':{}},'plugins':{'private-plugin':{}}}}
    elif method == 'thread/start':
        params = message['params']; assert params['model'] == 'chosen-model'
        assert params['ephemeral'] and params['sandbox'] == 'read-only' and params['approvalPolicy'] == 'never'
        assert params['config']['mcp_servers']['private']['enabled'] is False
        assert params['config']['plugins']['private-plugin']['enabled'] is False
        assert params['dynamicTools'][0]['name'] == 'minitv_catalog_read'
        result = {'thread':{'id':'t','turns':[]},'model':'chosen-model'}
    elif method == 'turn/start':
        assert message['params']['sandboxPolicy']['access']['readableRoots'] == []
        emit({'id':message['id'],'result':{'turn':{'id':'u','status':'inProgress'}}})
        emit({'id':'tool-read','method':'item/tool/call','params':{'threadId':'t','turnId':'u','tool':'minitv_catalog_read','arguments':{'offset':0}}})
        continue
    emit({'id':message['id'],'result':result})
''')
            executable.chmod(0o700)
            config = root / "config.json"
            config.write_text(json.dumps({"binary": str(executable), "user": pwd.getpwuid(os.getuid()).pw_name,
                "home": str(root), "workspace": str(root / "workspace"), "salt": "00", "passwordHash": "test"}))
            config.chmod(0o600)
            diagnostics = {}
            with patch.dict(os.environ, {"MINITV_CODEX_CONFIG": str(config)}):
                result = codex.query_codex_catalog("Like Interstellar", "movies", "es", "chosen-model", self.records, "transport", diagnostics)
            self.assertEqual(result["ids"], [self.records[0]["id"]])
            self.assertEqual(diagnostics["provider"]["toolReads"], 1)
            self.assertEqual(diagnostics["provider"]["status"], "completed")

    def test_failure_timeout_and_disconnect_never_apply_results(self):
        for outcome in ("failed", "interrupted", "timeout", "disconnect", "no-read"):
            agent = codex.CatalogAgent([])
            def rpc(method, params):
                if method == "thread/start": return {"thread": {"id": "t", "turns": []}}
                if method == "turn/start" and outcome in {"failed", "interrupted", "no-read"}:
                    agent._notification({"method": "turn/completed", "params": {"threadId": "t", "turn": {
                        "id": "u", "status": "completed" if outcome == "no-read" else outcome, "items": [
                            {"id": "a", "type": "agentMessage", "text": json.dumps(selection())}]}}})
                return {}
            with self.subTest(outcome=outcome), patch.object(agent, "require_account"), patch.object(agent, "rpc", side_effect=rpc), patch.object(codex, "QUERY_TIMEOUT", -1 if outcome == "timeout" else 10):
                with self.assertRaises(AIError) as raised:
                    agent.run("x", "movies", "es", None)
                self.assertIn(raised.exception.code, {"AI_CODEX_FAILED", "AI_TIMEOUT", "AI_CODEX_UNAVAILABLE", "AI_INVALID_RESPONSE"})


class CodexSearchApiTests(unittest.TestCase):
    def setUp(self):
        root = tempfile.TemporaryDirectory()
        self.addCleanup(root.cleanup)
        self.settings = AISettings(Path(root.name) / "ai.json")  # No API key, API disabled.
        for name, value in (("ai_settings_store", self.settings), ("current_web_pin", lambda: "test-pin"),
                            ("ai_request_times", deque()), ("ai_request_active", False)):
            patcher = patch.object(api, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = api.app.test_client()
        self.headers = {"X-Web-Pin": "test-pin"}
        self.query = {"provider": "codex", "section": "movies", "prompt": "Like Interstellar", "language": "es",
                      "requestId": "unique-request-123456", "model": "chosen-model"}
        self.records = [{"id": "Movies/new.mp4", "fields": {"title": ["New title"]}}]

    def test_pin_required_for_models_search_and_cancel(self):
        with patch.object(api, "list_codex_models") as models, patch.object(api, "query_codex_catalog") as search, patch.object(api, "cancel_codex_search") as cancel:
            self.assertEqual(self.client.get("/settings/ai/models?provider=codex").status_code, 401)
            self.assertEqual(self.client.post("/ai/search", json=self.query).status_code, 401)
            self.assertEqual(self.client.post("/ai/search/cancel", json={"requestId": self.query["requestId"]}).status_code, 401)
            for method in (models, search, cancel): method.assert_not_called()

    def test_search_uses_live_catalogue_without_api_key_upload_or_fallback(self):
        with patch.object(api, "list_video_directories", return_value={}), patch.object(api, "build_catalog", return_value={"records": self.records, "missingMetadata": 0}), \
             patch.object(api, "query_codex_catalog", return_value=selection(["Movies/new.mp4"])) as search, \
             patch.object(api, "query_catalog_file") as direct, patch.object(api, "CatalogFileStore") as uploaded:
            response = self.client.post("/ai/search", json=self.query, headers=self.headers)
            self.assertEqual(response.status_code, 200, response.json)
            self.assertEqual(response.json["ids"], ["Movies/new.mp4"])
            self.assertEqual(search.call_args.args[3], "chosen-model")
            self.assertEqual(search.call_args.args[4], self.records)
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            search.side_effect = AIError("Codex limit", "AI_CODEX_FAILED", 502)
            self.assertEqual(self.client.post("/ai/search", json=self.query, headers=self.headers).status_code, 502)
            direct.assert_not_called()
            uploaded.assert_not_called()
            self.assertFalse(api.ai_request_active)

    def test_deleted_items_filtered_and_empty_catalogue_does_not_spend(self):
        with patch.object(api, "list_video_directories", return_value={}), patch.object(api, "build_catalog", side_effect=[
            {"records": self.records, "missingMetadata": 0}, {"records": [], "missingMetadata": 0}]), \
             patch.object(api, "query_codex_catalog", return_value=selection(["Movies/new.mp4"])):
            result = self.client.post("/ai/search", json=self.query, headers=self.headers)
            self.assertEqual(result.json["ids"], [])
        with patch.object(api, "list_video_directories", return_value={}), patch.object(api, "build_catalog", return_value={"records": [], "missingMetadata": 0}), patch.object(api, "query_codex_catalog") as search:
            self.assertEqual(self.client.post("/ai/search", json=self.query, headers=self.headers).json["total"], 0)
            search.assert_not_called()

    def test_watched_and_favorite_marks_come_from_the_selected_profile(self):
        profile_path = self.settings.path.parent / "profiles.sqlite3"
        store = api.ProfileStore(profile_path)
        store.patch("default", {"marks": {'["movie","Movies/new.mp4"]': {"watched": True, "favorite": True}}})
        with patch.object(api, "USER_PROFILES_PATH", str(profile_path)), \
             patch.object(api, "list_video_directories", return_value={"movieRootFiles": [{"relativePath": "Movies/new.mp4"}]}), \
             patch.object(api, "build_catalog", return_value={"records": self.records, "missingMetadata": 0}), \
             patch.object(api, "query_codex_catalog", return_value=selection()) as search:
            response = self.client.post("/ai/search", json={**self.query, "userId": "default"}, headers=self.headers)
            self.assertEqual(response.status_code, 200, response.json)
            records = search.call_args.args[4]
            self.assertTrue(records[0]["watched"])
            self.assertTrue(records[0]["favorite"])
            self.assertNotIn("watched", self.records[0])

    def test_invalid_provider_and_id_rejected_before_model_and_models_use_codex(self):
        with patch.object(api, "list_video_directories") as scan:
            for changes in ({"provider": []}, {"provider": "unknown"}, {"requestId": ""}, {"model": "bad model"}, {"userId": []}):
                self.assertEqual(self.client.post("/ai/search", json={**self.query, **changes}, headers=self.headers).status_code, 400)
            scan.assert_not_called()
        with patch.object(api, "list_codex_models", return_value={"ok": True, "models": [{"id": "chosen-model"}], "configured": True}) as models, patch.object(api, "list_models") as direct:
            result = self.client.get("/settings/ai/models?provider=codex", headers=self.headers)
            self.assertEqual(result.json["models"], [{"id": "chosen-model"}])
            models.assert_called_once()
            direct.assert_not_called()


if __name__ == "__main__":
    unittest.main()
