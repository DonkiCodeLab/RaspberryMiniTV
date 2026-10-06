import copy
import io
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import torrent_downloads as torrents


def result(info_hash="a" * 40, seeds=3, source="The Pirate Bay"):
    return {"infoHash": info_hash, "name": "Sintel", "sizeBytes": 1000,
            "seeds": seeds, "leechers": 1, "sources": [source]}


class TorrentSearchTests(unittest.TestCase):
    def setUp(self):
        with torrents.SEARCH_CACHE_LOCK:
            torrents.SEARCH_CACHE.clear()

    def test_knaben_filters_movies_and_malformed_rows_and_keeps_origin(self):
        movie = {"hash": "A" * 40, "title": "Sintel", "bytes": "1000", "seeders": 8,
                 "liveSeeders": 0, "peers": "4", "tracker": "1337x", "categoryId": [2000000, 3001000]}
        rows = [movie, None, {**movie, "categoryId": [2000000, 2001000]},
                {**movie, "hash": None, "id": "b" * 40, "link": "https://example.com/file.torrent"},
                {**movie, "categoryId": "3000000"}, {**movie, "bytes": -1},
                {**movie, "hash": "0" * 40}, {**movie, "title": {}},
                {**movie, "categoryId": [5001000]}, {**movie, "hash": "invalid"}]
        found = torrents.normalize_knaben_results({"hits": rows})
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0], {**result(seeds=0, source="1337x (Knaben)"), "leechers": 4})
        for bad in (None, [], {}, {"hits": "bad"}):
            with self.assertRaises(torrents.TorrentError):
                torrents.normalize_knaben_results(bad)

    def test_knaben_request_uses_v2_and_all_movie_subcategories(self):
        with patch.object(torrents, "_search_json", return_value={"hits": []}) as fetch:
            self.assertEqual(torrents.search_knaben("Título & 2010"), [])
        url = urlsplit(fetch.call_args.args[0])
        query = parse_qs(url.query)
        self.assertEqual(url.netloc, "api.knaben.org")
        self.assertEqual(url.path, "/v2/search")
        self.assertEqual(query["q"], ["Título & 2010"])
        self.assertEqual(query["c"][0].split(","), [str(c) for c in range(3000000, 3008001, 1000)])
        self.assertNotIn("xxx", query)
        self.assertNotIn("unsafe", query)

    def test_merging_retains_each_origin_without_adding_seed_counts(self):
        rows = [result(), result(seeds=9, source="1337x (Knaben)"),
                result(seeds=7, source="1337x (Knaben)"), result("b" * 40, 15)]
        before = copy.deepcopy(rows)
        found = torrents.merge_torrent_results(rows)
        self.assertEqual([row["seeds"] for row in found], [15, 9])
        self.assertEqual(found[1]["sources"], ["The Pirate Bay", "1337x (Knaben)"])
        self.assertEqual(rows, before)

    def test_partial_failure_preserves_results_and_is_not_cached(self):
        with patch.object(torrents, "search_pirate_bay", side_effect=torrents.TorrentError("offline")), \
                patch.object(torrents, "search_knaben", return_value=[result(source="1337x (Knaben)")]) as knaben:
            found = torrents.search_torrents("Sintel")
            self.assertEqual(found["results"][0]["sources"], ["1337x (Knaben)"])
            self.assertEqual([s["status"] for s in found["sources"]], ["error", "ok"])
            torrents.search_torrents("Sintel")
            self.assertEqual(knaben.call_count, 2)

    def test_empty_success_is_different_from_all_providers_failing(self):
        with patch.object(torrents, "search_pirate_bay", side_effect=torrents.TorrentError("offline")), \
                patch.object(torrents, "search_knaben", return_value=[]):
            found = torrents.search_torrents("No match")
            self.assertEqual(found["results"], [])
            self.assertEqual(found["sources"][1]["status"], "ok")
        with patch.object(torrents, "search_pirate_bay", side_effect=torrents.TorrentError("offline")), \
                patch.object(torrents, "search_knaben", side_effect=torrents.TorrentError("offline")):
            with self.assertRaisesRegex(torrents.TorrentError, "The Pirate Bay ni Knaben"):
                torrents.search_torrents("No match")

    def test_sources_run_concurrently(self):
        barrier = threading.Barrier(2, timeout=2)

        def search(query):
            barrier.wait()
            return [result()]

        with patch.object(torrents, "search_pirate_bay", side_effect=search), \
                patch.object(torrents, "search_knaben", side_effect=search):
            found = torrents.search_torrents("Sintel")
        self.assertEqual([s["status"] for s in found["sources"]], ["ok", "ok"])

    def test_slow_source_does_not_hide_the_fast_source(self):
        release = threading.Event()
        finished = threading.Event()
        fast_finished = threading.Event()
        original_wait = torrents.wait

        def slow(query):
            try:
                release.wait(2)
                return []
            finally:
                finished.set()

        def fast(query):
            fast_finished.set()
            return [result()]

        def short_wait(futures, timeout):
            self.assertTrue(fast_finished.wait(1))
            return original_wait(futures, timeout=0.02)

        try:
            with patch.object(torrents, "search_pirate_bay", side_effect=fast), \
                    patch.object(torrents, "search_knaben", side_effect=slow), \
                    patch.object(torrents, "wait", side_effect=short_wait):
                found = torrents.search_torrents("Sintel")
            self.assertEqual(len(found["results"]), 1)
            self.assertEqual(found["sources"][1]["status"], "error")
        finally:
            release.set()
            self.assertTrue(finished.wait(1))

    def test_cache_is_bounded_expires_and_returns_independent_data(self):
        with patch.object(torrents, "search_pirate_bay", return_value=[result()]) as piratebay, \
                patch.object(torrents, "search_knaben", return_value=[]):
            torrents.search_torrents("Sintel")["results"][0]["sources"].append("mutated")
            self.assertEqual(torrents.search_torrents("Sintel")["results"][0]["sources"], ["The Pirate Bay"])
            self.assertEqual(piratebay.call_count, 1)
            with patch.object(torrents, "SEARCH_CACHE_SECONDS", 0):
                torrents.search_torrents("Sintel")
            self.assertEqual(piratebay.call_count, 2)
            for i in range(35):
                torrents.search_torrents(f"query {i}")
            self.assertEqual(len(torrents.SEARCH_CACHE), 32)

    def test_search_rejects_invalid_query_without_network(self):
        with patch.object(torrents, "_search_json") as fetch:
            for query in (None, "  ", "x" * 201):
                with self.assertRaises(ValueError):
                    torrents.search_torrents(query)
            fetch.assert_not_called()

    def test_upstream_response_size_and_json_are_checked(self):
        for body in (b"x" * (4 * 1024 * 1024 + 1), b"<html>unavailable</html>"):
            with patch.object(torrents.urllib.request, "urlopen", return_value=io.BytesIO(body)):
                with self.assertRaisesRegex(torrents.TorrentError, "Knaben"):
                    torrents._search_json("https://api.knaben.org/v2/search?q=Sintel", "Knaben")


if __name__ == "__main__":
    unittest.main()
