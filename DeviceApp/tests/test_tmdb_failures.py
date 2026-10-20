import hashlib
import json
import sys
import tempfile
import threading
import unittest
import urllib.parse
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tmdb_cache import TmdbCache, TmdbError, atomic_write
import control_api as api


class TmdbFailureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.cache = TmdbCache(self.temp.name, lambda: {}, include_credits=False)

    def metadata(self, path, data, **params):
        digest = hashlib.sha256((path + "?" + urllib.parse.urlencode(sorted(params.items()))).encode()).hexdigest()
        atomic_write(self.cache.root / "metadata" / (digest + ".json"), json.dumps(data).encode())

    def failed(self, media="movie/1", error="/bad.jpg: TMDB respondió con HTTP 404.", **extra):
        kind, tmdb_id = media.split("/")
        self.cache.jobs[media] = {"kind": kind, "id": int(tmdb_id), "state": "failed",
                                  "error": error, "images": [], **extra}
        return self.cache.jobs[media]

    def test_legacy_errors_gain_title_type_and_group_original_and_thumbnails_offline(self):
        self.metadata("/movie/1", {"title": "Una película", "poster_path": "/bad.jpg"},
                      language="es-ES", append_to_response="external_ids")
        self.failed(error="/bad.jpg: HTTP 404; Miniatura /bad.jpg (780): HTTP 404")
        with patch.object(self.cache, "_download", side_effect=AssertionError("offline")):
            status = self.cache.status(detailed=True)
        self.assertEqual(len(status["errors"]), 1)
        item = status["errors"][0]
        self.assertEqual(item["title"], "Una película")
        self.assertEqual(item["resource"], "image")
        self.assertEqual(item["contexts"], [{"type": "poster", "extra": False}])
        self.assertEqual(len(item["stages"]), 2)
        self.assertEqual(status["failed"], 1)
        reopened = TmdbCache(self.temp.name, lambda: {})
        self.assertEqual(reopened.jobs["movie/1"]["failures"], self.cache.jobs["movie/1"]["failures"])

    def test_episode_variants_keep_season_zero_episode_number_and_names(self):
        self.metadata("/tv/2", {"name": "Serie", "seasons": [{"season_number": 0}]}, language="es-ES")
        self.metadata("/tv/2/season/0", {"season_number": 0, "episodes": [
            {"episode_number": 3, "name": "Especial", "still_path": "/main.jpg"}]}, language="es-ES")
        self.metadata("/tv/2/season/0/episode/3/images", {"stills": [{"file_path": "/bad.jpg"}]})
        self.failed("tv/2", "/bad.jpg: HTTP 404; Miniatura /main.jpg (780): corrupt")
        items = {item["path"]: item for item in self.cache.status(detailed=True)["errors"]}
        self.assertEqual(items["/bad.jpg"]["contexts"], [
            {"season": 0, "episode": 3, "type": "still", "extra": True}])
        self.assertEqual(items["/main.jpg"]["contexts"][0]["episodeName"], "Especial")
        self.assertEqual(items["/main.jpg"]["contexts"][0]["season"], 0)

    def test_primary_image_also_in_gallery_is_not_labelled_extra(self):
        self.metadata("/movie/1", {"title": "Película", "poster_path": "/bad.jpg"},
                      language="es-ES", append_to_response="external_ids")
        self.metadata("/movie/1/images", {"posters": [{"file_path": "/bad.jpg"}]})
        self.failed()
        usages = self.cache.status(detailed=True)["errors"][0]["contexts"]
        self.assertEqual(usages, [{"type": "poster", "extra": False}])

    def test_new_worker_failures_keep_all_resources_and_do_not_repeat_failed_originals(self):
        self.metadata("/movie/1", {"title": "Película", "poster_path": "/bad.jpg"},
                      language="es-ES", append_to_response="external_ids")
        with patch.object(self.cache, "start"):
            self.cache.enqueue("movie", 1)
        def data(path, params=None, **kwargs):
            return {"posters": [{"file_path": "/extra.jpg"}]} if path.endswith("/images") else {
                "title": "Película", "poster_path": "/bad.jpg"}
        with patch.object(self.cache, "json", side_effect=data), patch.object(self.cache, "_with_movie_links"), \
                patch.object(self.cache, "image", side_effect=OSError("HTTP 404")) as image, \
                patch.object(self.cache, "display_image") as thumbnail:
            self.cache._run()
        self.assertEqual(image.call_count, 2)
        thumbnail.assert_not_called()
        errors = self.cache.status(detailed=True)["errors"]
        self.assertEqual(len(errors), 2)
        self.assertEqual({item["contexts"][0]["extra"] for item in errors}, {True, False})

    def test_discard_survives_restart_refresh_and_prevents_read_download_and_selection(self):
        self.failed()
        # Even an already cached original or thumbnail cannot be served after dismissal.
        atomic_write(self.cache.root / "images/bad.jpg", b"corrupt")
        atomic_write(self.cache.root / "thumbnails/780/bad.jpg.webp", b"thumbnail")
        self.cache.discard_image("movie/1", "/bad.jpg")
        reopened = TmdbCache(self.temp.name, lambda: {}, include_credits=False)
        self.assertEqual(reopened.status(detailed=True)["complete"], 1)
        self.assertEqual(reopened.status()["ignoredImages"], 1)
        with patch.object(reopened, "_download", side_effect=AssertionError("must not retry")):
            for read in (lambda: reopened.image("/bad.jpg"), lambda: reopened.display_image("/bad.jpg", 780),
                         lambda: reopened.display_image("/bad.jpg", 780, local_only=True),
                         lambda: reopened.display_image("/bad.jpg", 342, preview=True)):
                with self.assertRaises(TmdbError) as error:
                    read()
                self.assertEqual(error.exception.code, "TMDB_IMAGE_IGNORED")
            with patch.object(reopened, "start"):
                reopened.enqueue("movie", 1, refresh=True)
            with patch.object(reopened, "json", return_value={"poster_path": "/bad.jpg"}), \
                    patch.object(reopened, "_with_movie_links"):
                reopened._run()
        self.assertEqual(reopened.status()["complete"], 1)
        original = {"poster_path": "/bad.jpg", "heroImage": "https://image.tmdb.org/t/p/w780/bad.jpg",
                    "posters": [{"file_path": "/bad.jpg"}, {"file_path": "/good.jpg"}]}
        filtered = reopened.without_ignored_images(original)
        self.assertIsNone(filtered["poster_path"])
        self.assertIsNone(filtered["heroImage"])
        self.assertEqual(filtered["posters"], [{"file_path": "/good.jpg"}])
        self.assertEqual(original["poster_path"], "/bad.jpg")

    def test_shared_discard_keeps_other_images_and_metadata_errors_failed(self):
        self.failed()
        self.failed("movie/2", "/bad.jpg: HTTP 404; /good.jpg: timeout; /movie/2: network unavailable")
        self.cache.discard_image("movie/1", "/bad.jpg")
        status = self.cache.status(detailed=True)
        self.assertEqual(status["complete"], 1)
        self.assertEqual(status["failed"], 1)
        self.assertEqual({item["path"] for item in status["errors"]}, {"/good.jpg", "/movie/2"})
        self.assertFalse(self.cache.jobs["movie/2"].get("thumbnailsReady"))

    def test_discard_during_shared_image_download_does_not_publish_or_fail_other_title(self):
        self.failed()
        with patch.object(self.cache, "start"):
            self.cache.enqueue("movie", 2)
        started, release = threading.Event(), threading.Event()
        def download(*args):
            started.set()
            self.assertTrue(release.wait(4))
            return b"image", "image/jpeg"
        with patch.object(self.cache, "json", return_value={"poster_path": "/bad.jpg"}), \
                patch.object(self.cache, "_with_movie_links"), patch.object(self.cache, "_download", side_effect=download):
            worker = threading.Thread(target=self.cache._run)
            worker.start()
            try:
                self.assertTrue(started.wait(3))
                self.cache.discard_image("movie/1", "/bad.jpg")
            finally:
                release.set()
                worker.join(4)
        self.assertFalse(worker.is_alive())
        self.assertEqual(self.cache.status()["complete"], 2)
        self.assertFalse((self.cache.root / "images/bad.jpg").exists())

    def test_truncated_legacy_errors_are_not_marked_complete_after_discard(self):
        self.failed(error="/bad.jpg: " + "x" * 3990)
        self.cache.discard_image("movie/1", "/bad.jpg")
        self.assertEqual(self.cache.status()["failed"], 1)
        self.assertEqual(self.cache.status(detailed=True)["errors"][0]["resource"], "metadata")

    def test_failed_discard_write_does_not_change_memory_or_jobs(self):
        self.failed()
        with patch("tmdb_cache.atomic_write", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                self.cache.discard_image("movie/1", "/bad.jpg")
        self.assertFalse(self.cache.ignored_images)
        self.assertEqual(self.cache.jobs["movie/1"]["state"], "failed")

    def test_api_requires_pin_validates_failure_and_filters_metadata_and_image_fallback(self):
        self.failed()
        self.metadata("/movie/1", {"title": "TMDB title", "poster_path": "/bad.jpg"},
                      language="es-ES", append_to_response="external_ids")
        library = {"movies": {"movie.mp4": {"tmdbId": 1, "name": "Mi película"}}}
        client = api.app.test_client()
        with patch.object(api, "is_authorized_request", return_value=False):
            self.assertEqual(client.post("/tmdb/cache/discard-image", json={"media": "movie/1", "path": "/bad.jpg"}).status_code, 401)
        with patch.object(api, "tmdb_artwork", self.cache), patch.object(api, "is_authorized_request", return_value=True), \
                patch.object(api, "load_media_library", return_value=library), patch.object(self.cache, "start"), \
                patch.object(self.cache, "storage_background", return_value={}):
            self.assertEqual(client.get("/tmdb/cache").json["errors"][0]["title"], "Mi película")
            for payload in ([], {"media": []}, {"media": "movie/1", "path": "/other.jpg"},
                            {"media": "movie/1", "path": "/../bad.jpg"}, {"media": "movie/9", "path": "/bad.jpg"}):
                self.assertEqual(client.post("/tmdb/cache/discard-image", json=payload).status_code, 400)
            response = client.post("/tmdb/cache/discard-image", json={"media": "movie/1", "path": "/bad.jpg"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json["errors"], [])
            self.assertEqual(response.json["ignoredImages"], 1)
            with patch.object(api.oscar_artwork, "display_image") as fallback:
                self.assertEqual(client.get("/tmdb/images/bad.jpg?width=780").json["code"], "TMDB_IMAGE_IGNORED")
                fallback.assert_not_called()
            self.assertIsNone(client.get("/tmdb/json/movie/1?language=es-ES&append_to_response=external_ids").json["poster_path"])
            self.assertEqual(client.get("/tmdb/library").json["movies"]["1"]["posterPath"], "")
            with patch.object(api, "list_video_directories", return_value={"heroImage": "https://image.tmdb.org/t/p/w780/bad.jpg"}):
                self.assertIsNone(client.get("/videos").json["heroImage"])


if __name__ == "__main__":
    unittest.main()
