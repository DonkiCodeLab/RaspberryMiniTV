import base64
from concurrent.futures import ThreadPoolExecutor
import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api
from user_profiles import ProfileStore
from profile_playback import ProfilePlayback


class UserProfileTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / "users.sqlite3"
        self.store = ProfileStore(self.path)
        for target, value in [("USER_PROFILES_PATH", str(self.path)), ("current_web_pin", lambda: "1234")]:
            patcher = patch.object(api, target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = api.app.test_client()
        self.headers = {"X-Web-Pin": "1234"}

    def test_auth_and_fresh_default(self):
        self.assertEqual(self.client.get("/users").status_code, 401)
        self.assertEqual(self.client.patch("/users/default/state", json={}).status_code, 401)
        self.assertFalse(self.path.exists())
        response = self.client.get("/users", headers=self.headers)
        self.assertEqual(response.json["users"], [{"id": "default", "name": "default", "avatar": "avatar-01"}])
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual(self.store.state("default"), {"marks": {}, "progress": {}})

    def test_create_edit_isolation_reopen_and_delete(self):
        user = self.client.post("/users", headers=self.headers, json={"name": " Lisa ", "avatar": "avatar-04"}).json["user"]
        self.assertEqual(user["name"], "Lisa")
        key = '["movie","1"]'
        self.store.patch(user["id"], {"marks": {key: {"favorite": True, "watched": True}},
                                      "progress": {key: {"kind": "video", "seconds": 42.5, "duration": 600}}})
        self.assertEqual(self.store.state("default"), {"marks": {}, "progress": {}})
        self.assertEqual(ProfileStore(self.path).state(user["id"])["progress"][key]["seconds"], 42.5)
        response = self.client.patch(f'/users/{user["id"]}', headers=self.headers, json={"name": "Bart", "avatar": "avatar-03"})
        self.assertEqual(response.json["user"]["id"], user["id"])
        self.assertTrue(self.store.state(user["id"])["marks"][key]["favorite"])
        self.assertEqual(self.client.delete(f'/users/{user["id"]}', headers=self.headers).status_code, 200)
        self.assertEqual(self.client.get(f'/users/{user["id"]}/state', headers=self.headers).status_code, 404)
        self.assertEqual(self.client.patch(f'/users/{user["id"]}/state', headers=self.headers, json={"marks": {key: {"favorite": True}}}).status_code, 404)
        self.assertEqual(self.client.delete('/users/default', headers=self.headers).status_code, 400)
        self.assertEqual(len(self.store.users()), 1)

    def test_atomic_partial_marks_and_concurrent_episodes(self):
        self.store.users()
        key = '["season","1"]'
        self.store.patch("default", {"marks": {key: {"favorite": True, "watched": False}}})
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda index: self.store.patch("default", {"marks": {key: {"episodes": {str(index): True}}}}), range(12)))
        marks = self.store.state("default")["marks"][key]
        self.assertTrue(marks["favorite"])
        self.assertEqual(len(marks["episodes"]), 12)
        self.store.patch("default", {"marks": {key: {"watched": True, "episodes": {}}}})
        self.assertEqual(self.store.state("default")["marks"][key], {"watched": True, "favorite": True, "episodes": {}})

    def test_invalid_payloads_and_photo_validation(self):
        for data in [[], {}, {"name": " "}, {"name": "x" * 41, "avatar": "avatar-01"}, {"name": "Bad", "avatar": "https://remote/a.jpg"}]:
            self.assertEqual(self.client.post("/users", headers=self.headers, json=data).status_code, 400)
        for data in [[], {"marks": {"key": {"favorite": "yes"}}}, {"progress": {"key": {"kind": "video", "seconds": -1}}},
                     {"progress": {"key": {"kind": "book", "cfi": "javascript:alert(1)"}}}]:
            self.assertEqual(self.client.patch("/users/default/state", headers=self.headers, json=data).status_code, 400)
        from PIL import Image
        buffer = io.BytesIO()
        Image.new("RGB", (24, 32), "yellow").save(buffer, format="PNG")
        avatar = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()
        result = self.client.post("/users", headers=self.headers, json={"name": "Photo", "avatar": avatar})
        self.assertEqual(result.status_code, 201)
        self.assertTrue(result.json["user"]["avatar"].startswith("data:image/jpeg;base64,"))
        self.assertEqual(self.client.post("/users", headers=self.headers, json={"name": "Broken", "avatar": "data:image/png;base64,YWJj"}).status_code, 400)

    def test_pages_epub_and_restart(self):
        key = '["book","Books/example.epub"]'
        for progress in [{"kind": "book", "page": 8, "total": 32},
                         {"kind": "book", "cfi": "epubcfi(/6/2!/4/2)", "page": 2, "section": 3},
                         {"kind": "book", "page": 1, "completed": False}]:
            response = self.client.patch("/users/default/state", headers=self.headers, json={"progress": {key: progress}})
            self.assertEqual(response.status_code, 200)
            saved = self.store.state("default")["progress"][key]
            self.assertTrue(saved["opened"])
            self.assertEqual(saved["page"], progress["page"])
        self.assertNotIn("cfi", saved)

    def test_native_playback_owner_and_completion(self):
        user = self.store.save_user({"name": "Viewer", "avatar": "avatar-02"})
        context = {"userId": user["id"], "key": '["video","TVShows/a.mp4"]', "markKey": '["season","1"]', "episodeNumber": 3}
        tracker = ProfilePlayback(self.path, context)
        values = {"time-pos": 45, "duration": 100}
        command = lambda *parts: {"data": values[parts[-1]]}
        tracker.sample(command, force=True)
        self.assertEqual(self.store.state(user["id"])["progress"][context["key"]]["seconds"], 45)
        self.assertEqual(self.store.state("default")["marks"], {})
        self.assertEqual(self.store.state(user["id"])["marks"], {})
        values["time-pos"] = 98
        tracker.sample(command, force=True)
        tracker.sample(lambda *parts: None, force=True, ended=True)
        state = self.store.state(user["id"])
        self.assertTrue(state["progress"][context["key"]]["completed"])
        self.assertEqual(state["marks"][context["markKey"]], {"episodes": {"3": True}})
        self.store.delete_user(user["id"])
        tracker.sample(command, force=True)  # An open player never recreates a deleted profile.

    def test_play_command_carries_resume_owner(self):
        match = {"id": "S01E01", "directory_path": "TVShows/show", "relative_path": "TVShows/show/S01E01.mp4", "full_path": "/tmp/show.mp4"}
        with patch.object(api, "iter_video_entries", return_value=[match]), patch.object(api, "hide_qr"), patch.object(api, "stop_locked"), patch.object(api, "write_menu_command") as command:
            response = self.client.post("/play", headers=self.headers, json={"id": "S01E01", "userId": "default", "startSeconds": 128.5, "markKey": "season", "episodeNumber": 1})
            self.assertEqual(response.status_code, 200)
            payload = command.call_args[0][0]
            self.assertEqual(payload["startSeconds"], 128.5)
            self.assertEqual(payload["profile"]["userId"], "default")
            self.assertEqual(payload["profile"]["key"], '["video","TVShows/show/S01E01.mp4"]')
            self.assertEqual(self.client.post("/play", headers=self.headers, json={"id": "S01E01", "startSeconds": -1}).status_code, 400)


if __name__ == "__main__":
    unittest.main()
