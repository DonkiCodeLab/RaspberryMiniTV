import io
import sys
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from email.message import Message
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tmdb_cache import TmdbCache
from tmdb_resources import PacedResource, DOWNLOAD_BYTES_PER_SECOND, DOWNLOAD_CHUNK_BYTES
import control_api as api


class Response(io.BytesIO):
    def __init__(self, data, content_type="application/json"):
        super().__init__(data)
        self.headers = Message()
        self.headers["Content-Type"] = content_type


class TmdbDownloadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.cache = TmdbCache(self.temp.name, lambda: {"apiKey": "test"})

    def test_interactive_work_passes_queued_background_work(self):
        resource = PacedResource(0)
        waiting = [threading.Event(), threading.Event()]
        order = []

        def run(background, event):
            with resource.acquire(background=background, check_cancelled=event.set):
                order.append("background" if background else "interactive")

        with ThreadPoolExecutor(max_workers=2) as pool:
            with resource.acquire(background=True, check_cancelled=lambda: None):
                background = pool.submit(run, True, waiting[0])
                self.assertTrue(waiting[0].wait(2))
                interactive = pool.submit(run, False, waiting[1])
                self.assertTrue(waiting[1].wait(2))
                self.assertEqual(order, [])
            interactive.result(timeout=2)
            background.result(timeout=2)
        self.assertEqual(order, ["interactive", "background"])

    def test_resource_leaves_a_pause_between_operations(self):
        resource = PacedResource(0.03)
        with resource.acquire(background=True, check_cancelled=lambda: None):
            pass
        earliest = resource.ready_at
        with resource.acquire(background=False, check_cancelled=lambda: None):
            self.assertGreaterEqual(time.monotonic(), earliest)

    def test_cancelled_waiter_leaves_queue_without_taking_resource(self):
        resource = PacedResource(0)
        waiting, cancelled = threading.Event(), threading.Event()

        def check():
            waiting.set()
            if cancelled.is_set():
                raise RuntimeError("cancelled")

        def run():
            with resource.acquire(background=False, check_cancelled=check):
                self.fail("cancelled operation ran")

        with ThreadPoolExecutor(max_workers=1) as pool:
            with resource.acquire(background=True, check_cancelled=lambda: None):
                future = pool.submit(run)
                self.assertTrue(waiting.wait(2))
                cancelled.set()
                with self.assertRaisesRegex(RuntimeError, "cancelled"):
                    future.result(timeout=2)
                self.assertEqual(resource.interactive_waiters, 0)
        with resource.acquire(background=True, check_cancelled=lambda: None):
            pass

    def test_download_reads_small_chunks_at_the_byte_budget(self):
        payload = b"x" * (DOWNLOAD_BYTES_PER_SECOND * 2)
        response = Mock(wraps=io.BytesIO(payload))
        elapsed = [0.0]

        def wait(seconds):
            elapsed[0] += max(0, seconds)

        with patch("tmdb_cache.time.monotonic", side_effect=lambda: elapsed[0]), \
                patch.object(self.cache, "_wait", side_effect=wait):
            self.assertEqual(self.cache._read_response(response, len(payload)), payload)
        self.assertGreaterEqual(elapsed[0], 2)
        self.assertTrue(all(0 < call.args[0] <= DOWNLOAD_CHUNK_BYTES for call in response.read.call_args_list))

    def test_slow_chunk_does_not_allow_a_catchup_burst(self):
        elapsed = [0.0]
        chunks = iter([b"x" * DOWNLOAD_CHUNK_BYTES] * 3 + [b""])
        waits = []

        def read(_):
            if elapsed[0] == 0:
                elapsed[0] = 5.0
            return next(chunks)

        def wait(seconds):
            waits.append(max(0, seconds))
            elapsed[0] += max(0, seconds)

        with patch("tmdb_cache.time.monotonic", side_effect=lambda: elapsed[0]), \
                patch.object(self.cache, "_wait", side_effect=wait):
            self.cache._read_response(Mock(read=read), DOWNLOAD_CHUNK_BYTES * 3)
        self.assertEqual(waits, [0, 0.125, 0.125])

    def test_read_checks_size_and_cancellation_before_publishing(self):
        with patch.object(self.cache, "_wait"):
            for payload, limit in ((b"", 100), (b"too large", 2)):
                with self.subTest(payload=payload), self.assertRaises(ValueError):
                    self.cache._read_response(io.BytesIO(payload), limit)
        self.cache.worker_context.job = ("movie/1", 0)

        def cancel(_):
            self.cache.generations["movie/1"] = 1

        with patch.object(self.cache, "_wait", side_effect=cancel), self.assertRaisesRegex(RuntimeError, "cancelada"):
            self.cache._read_response(io.BytesIO(b"x" * DOWNLOAD_CHUNK_BYTES * 2), DOWNLOAD_CHUNK_BYTES * 3)

    def test_retries_release_capacity_during_backoff(self):
        resource = PacedResource(0)
        opener = Mock()
        opener.open.side_effect = [OSError("offline"), Response(b'{"ok":true}')]
        backoffs = []

        def wait(seconds):
            if seconds >= 1:
                self.assertFalse(resource.active)
                backoffs.append(seconds)

        with patch("tmdb_cache.METADATA_DOWNLOADS", resource), \
                patch("tmdb_cache.urllib.request.build_opener", return_value=opener), \
                patch.object(self.cache, "_wait", side_effect=wait):
            data, _ = self.cache._download("https://api.themoviedb.org/3/search/tv", {}, 1024)
        self.assertEqual(data, b'{"ok":true}')
        self.assertEqual(backoffs, [1])
        self.assertEqual(opener.open.call_count, 2)
        self.assertTrue(all(call.kwargs["timeout"] == 10 for call in opener.open.call_args_list))

    def test_caches_share_image_capacity_but_text_and_login_keep_responding(self):
        other = TmdbCache(Path(self.temp.name) / "awards", lambda: {})
        image_resource = PacedResource(0)
        metadata_resource = PacedResource(0)
        started, release, second_started, second_waiting = (threading.Event() for _ in range(4))
        opener = Mock()

        class SlowImage(Response):
            def read(self, size):
                started.set()
                if not release.wait(3):
                    raise RuntimeError("test did not release image")
                return super().read(size)

        def open_url(request, **_):
            if request.full_url.endswith("/first.jpg"):
                return SlowImage(b"first", "image/jpeg")
            if request.full_url.endswith("/second.jpg"):
                second_started.set()
                return Response(b"second", "image/jpeg")
            return Response(b'{"results":[]}')

        opener.open.side_effect = open_url
        with patch("tmdb_cache.IMAGE_DOWNLOADS", image_resource), \
                patch("tmdb_cache.METADATA_DOWNLOADS", metadata_resource), \
                patch("tmdb_cache.urllib.request.build_opener", return_value=opener), \
                patch.object(self.cache, "_wait"), patch.object(other, "_wait"), \
                patch.object(other, "_check_worker", side_effect=second_waiting.set), \
                patch.object(api, "current_web_pin", return_value="1234"), \
                ThreadPoolExecutor(max_workers=3) as pool:
            first = pool.submit(self.cache._download, "https://image.tmdb.org/t/p/original/first.jpg", {}, 1024)
            try:
                self.assertTrue(started.wait(2))
                second = pool.submit(other._download, "https://image.tmdb.org/t/p/original/second.jpg", {}, 1024)
                self.assertTrue(second_waiting.wait(2))
                query = pool.submit(other._download, "https://api.themoviedb.org/3/search/tv", {}, 1024)
                self.assertEqual(query.result(timeout=2)[0], b'{"results":[]}')
                self.assertFalse(second_started.is_set())
                with api.app.test_client() as client:
                    self.assertEqual(client.post("/web/auth", json={"pin": "1234"}).status_code, 200)
                    with client.get("/") as response:
                        self.assertEqual(response.status_code, 200)
            finally:
                release.set()
            self.assertEqual(first.result(timeout=2)[0], b"first")
            self.assertEqual(second.result(timeout=2)[0], b"second")

    def test_preview_uses_small_upstream_and_reuses_it_offline(self):
        from PIL import Image
        raw = io.BytesIO()
        Image.new("RGB", (342, 513), "navy").save(raw, "JPEG")
        with patch.object(self.cache, "_download", return_value=(raw.getvalue(), "image/jpeg")) as download, \
                patch.object(api, "tmdb_artwork", self.cache), \
                patch.object(api, "is_authorized_request", return_value=True):
            client = api.app.test_client()
            response = client.get("/tmdb/import/images/poster.jpg?width=342")
            self.assertEqual(response.status_code, 200)
            response.close()
            download.assert_called_once_with("https://image.tmdb.org/t/p/w342/poster.jpg", {}, 8 * 1024 * 1024)
            self.assertFalse((self.cache.root / "images/poster.jpg").exists())
            response = client.get("/tmdb/images/poster.jpg?width=342")
            self.assertEqual(response.status_code, 200)
            response.close()
            self.assertEqual(download.call_count, 1)

    def test_preview_reuses_existing_original_without_downloading(self):
        from PIL import Image
        source = self.cache.root / "images/poster.jpg"
        source.parent.mkdir()
        Image.new("RGB", (1000, 1500), "navy").save(source, "JPEG")
        with patch.object(self.cache, "_download", side_effect=AssertionError("offline")):
            thumbnail = self.cache.display_image("/poster.jpg", 342, preview=True)
        with Image.open(thumbnail) as image:
            self.assertEqual(image.size, (342, 513))
        self.assertTrue(source.is_file())


if __name__ == "__main__":
    unittest.main()
