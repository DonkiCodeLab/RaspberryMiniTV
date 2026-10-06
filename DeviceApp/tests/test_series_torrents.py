import copy
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import torrent_downloads as torrents
import control_api as api
from test_torrent_downloads import FakeTransmission

INFO_HASH = "e" * 40


def eztv_row(**changes):
    return {"hash": INFO_HASH, "title": "Example S01E02 1080p", "imdb_id": "1234567", "season": "1",
            "episode": "2", "size_bytes": "1000", "seeds": "5", "peers": "2", **changes}


class SeriesSearchTests(unittest.TestCase):
    def setUp(self):
        torrents.SEARCH_CACHE.clear()

    def test_eztv_exact_imdb_episode_filters_and_pagination(self):
        payload = {"torrents_count": 234, "torrents": [eztv_row(), eztv_row(imdb_id="7654321"),
                   eztv_row(season="2"), eztv_row(episode="3"), eztv_row(hash="not a hash"), None]}
        with patch.object(torrents, "_search_json", return_value=payload) as fetch:
            found = torrents.search_eztv("tt1234567", 1, 2)
        self.assertEqual(len(found["results"]), 1)
        self.assertEqual(found["results"][0]["sources"], ["EZTV"])
        self.assertEqual(found["nextEztvPage"], 2)
        query = parse_qs(urlsplit(fetch.call_args.args[0]).query)
        self.assertEqual(query, {"imdb_id": ["1234567"], "limit": ["100"], "page": ["1"]})
        with patch.object(torrents, "_search_json", return_value={"torrents_count": 0, "torrents": []}):
            self.assertEqual(torrents.search_eztv("tt1234567"), {"results": [], "nextEztvPage": None})

    def test_eztv_malformed_response_and_missing_id_do_not_browse_unrelated_shows(self):
        with patch.object(torrents, "_search_json") as fetch:
            for imdb_id in (None, "", "https://example.com", "tt123abc"):
                with self.assertRaises(ValueError):
                    torrents.search_eztv(imdb_id)
            fetch.assert_not_called()
        with patch.object(torrents, "_search_json", return_value={"torrents": "bad"}):
            with self.assertRaises(torrents.TorrentError):
                torrents.search_eztv("tt1234567")

    def test_series_categories_exclude_movies_even_with_wrong_tv_parent(self):
        base = {"info_hash": INFO_HASH, "name": "Example", "size": 1000, "seeders": 5}
        rows = [{**base, "category": "201"}, {**base, "category": "205"}]
        self.assertEqual(len(torrents.normalize_results(rows, "series")), 1)
        knaben = {"hash": INFO_HASH, "title": "Example", "bytes": 1000, "seeders": 5}
        rows = [{**knaben, "categoryId": [2000000, 3001000]}, {**knaben, "categoryId": [2000000, 2001000]}]
        self.assertEqual(len(torrents.normalize_knaben_results({"hits": rows}, "series")), 1)

    def test_scope_cache_and_eztv_more_pages_are_separate_from_movies(self):
        with patch.object(torrents, "search_pirate_bay", return_value=[]) as piratebay, \
                patch.object(torrents, "search_knaben", return_value=[]) as knaben, \
                patch.object(torrents, "search_eztv", return_value={"results": [], "nextEztvPage": 2}) as eztv:
            torrents.search_torrents("Example")
            eztv.assert_not_called()
            found = torrents.search_torrents("Example", "series", "tt1234567", 0, 2)
            piratebay.assert_called_with("Example S00E02", "series")
            knaben.assert_called_with("Example S00E02", "series")
            eztv.assert_called_once_with("tt1234567", 0, 2, 1)
            self.assertEqual([s["name"] for s in found["sources"]], ["The Pirate Bay", "Knaben", "EZTV"])
            torrents.search_torrents("Example", "series", "tt1234567", 0, 2)
            self.assertEqual(eztv.call_count, 1)
            torrents.search_torrents("Example", "series", "tt1234567", 0, 2, 2)
            self.assertEqual(piratebay.call_count, 2)
            eztv.assert_called_with("tt1234567", 0, 2, 2)

    def test_missing_imdb_and_eztv_failure_keep_other_sources_usable(self):
        with patch.object(torrents, "search_pirate_bay", return_value=[]), \
                patch.object(torrents, "search_knaben", return_value=[]), \
                patch.object(torrents, "search_eztv", side_effect=torrents.TorrentError("offline")) as eztv:
            missing = torrents.search_torrents("Example", "series")
            eztv.assert_not_called()
            self.assertEqual(missing["sources"][-1]["reason"], "missing_imdb")
            failed = torrents.search_torrents("Example", "series", "tt1234567")
            self.assertEqual(failed["sources"][-1]["status"], "error")
            self.assertEqual(failed["nextEztvPage"], 1)

    def test_invalid_scopes_are_rejected_before_network(self):
        with patch.object(torrents, "_search_json") as fetch:
            for kwargs in ({"media_type": "other"}, {"media_type": []}, {"season": -1}, {"season": True}, {"season": 100},
                           {"episode": 1}, {"media_type": "series", "eztv_page": 101}, {"imdb_id": "https://bad"}):
                with self.assertRaises(ValueError):
                    torrents.search_torrents("Example", **kwargs)
            fetch.assert_not_called()


class SeriesDownloadTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name).resolve()
        self.rpc = FakeTransmission()
        self.movie_import = Mock()
        self.movie_artwork = Mock()
        self.movie_prepare = Mock()
        self.series_import = Mock(return_value={"relativePath": "TVShows/example", "episodeIds": ["S01E01", "S01E02"]})
        self.series_artwork = Mock(return_value={"state": "running"})
        self.series_prepare = Mock()
        self.manager = self.new_manager()

    def new_manager(self):
        manager = torrents.TorrentDownloads(self.root / "Torrents", self.movie_import, self.movie_artwork, self.movie_prepare,
                                           self.rpc, self.series_import, self.series_artwork, self.series_prepare)
        manager.start = Mock()
        return manager

    def add(self, **changes):
        return self.manager.add({"infoHash": INFO_HASH, "name": "Example S01 Pack", "mediaType": "series",
                                 "series": {"id": 123, "name": "Example"}, "sources": ["EZTV"], **changes})

    def ready(self, progress=100):
        row = self.rpc.rows[INFO_HASH]
        files = [{"name": name, "length": 100, "bytesCompleted": progress} for name in
                 ("Pack/Example.S01E01.mkv", "Pack/Season 1/Example.1x02.mp4", "Pack/Sample.S01E01.mkv", "Pack/featurette.mkv")]
        row.update(metadataPercentComplete=1, files=files, status=4, percentDone=progress / 100, leftUntilDone=(100-progress)*2)
        for entry in files:
            path = Path(row["downloadDir"]) / entry["name"]
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"v" * 100)
        return row

    def test_pack_selects_all_episodes_and_waits_for_completion(self):
        self.add()
        self.manager.tick()
        self.series_import.assert_not_called()
        row = self.ready(30)
        self.manager.tick()
        selection = next(args for method, args in self.rpc.calls if method == "torrent-set")
        self.assertEqual(selection["files-wanted"], [0, 1])
        self.assertEqual(selection["files-unwanted"], [2, 3])
        self.manager.tick()
        self.assertEqual(self.manager.jobs[INFO_HASH]["sizeBytes"], 200)
        self.assertEqual(self.manager.jobs[INFO_HASH]["progress"], 30)
        self.series_import.assert_not_called()
        self.ready()
        self.manager.tick()
        args = self.series_import.call_args.args
        self.assertEqual([ep["id"] for ep in args[1]], ["S01E01", "S01E02"])
        self.assertEqual(self.manager.jobs[INFO_HASH]["state"], "metadata")
        self.assertNotIn(INFO_HASH, self.rpc.rows)
        self.movie_import.assert_not_called()
        self.movie_artwork.assert_not_called()
        self.series_artwork.return_value = {"state": "complete"}
        self.manager.tick()
        self.assertEqual(self.manager.jobs[INFO_HASH]["state"], "complete")

    def test_episode_filter_and_pause_survive_restart(self):
        self.add(seasonNumber=1, episodeNumber=2)
        self.ready(30)
        self.manager.tick()
        self.assertEqual(self.manager.jobs[INFO_HASH]["videoIndices"], [1])
        self.manager.action(INFO_HASH, "pause")
        restarted = self.new_manager()
        restarted.tick()
        self.assertEqual(restarted.jobs[INFO_HASH]["state"], "paused")
        self.assertEqual(restarted.jobs[INFO_HASH]["episodeNumber"], 2)
        restarted.action(INFO_HASH, "resume")
        self.ready()
        restarted.tick()
        self.assertEqual([ep["id"] for ep in self.series_import.call_args.args[1]], ["S01E02"])

    def test_cancellation_and_tmdb_retry_use_series_callbacks(self):
        self.add()
        self.ready()
        self.manager.action(INFO_HASH, "cancel")
        self.manager.tick()
        self.series_import.assert_not_called()
        self.add()
        self.ready()
        self.series_artwork.return_value = {"state": "failed", "error": "TMDB failed"}
        self.manager.tick()
        self.manager.tick()
        self.assertEqual(self.manager.jobs[INFO_HASH]["state"], "failed")
        self.manager.action(INFO_HASH, "retry")
        self.series_prepare.assert_called_once_with(123)
        self.movie_prepare.assert_not_called()

    def test_two_episodes_of_series_and_movie_with_same_tmdb_id_can_coexist(self):
        self.add(seasonNumber=1, episodeNumber=1)
        self.add(infoHash="f" * 40, seasonNumber=1, episodeNumber=2)
        self.manager.add({"infoHash": "a" * 40, "movie": {"id": 123, "name": "Movie"}})
        self.assertEqual(len(self.manager.jobs), 3)
        with self.assertRaises(ValueError):
            self.add(seasonNumber=1, episodeNumber=3)
        with self.assertRaises(ValueError):
            self.manager.add({"infoHash": INFO_HASH, "movie": {"id": 123, "name": "Movie"}})

    def test_unknown_duplicate_multiepisode_and_unsafe_names_fail_before_import(self):
        for names in (["movie.mkv"], ["Show.S01E01E02.mkv"], ["Show.S01E01-02.mkv"],
                      ["Show.S01E01.mkv", "Show.1x01.mp4"], ["../Show.S01E01.mkv"]):
            with self.subTest(names=names), self.assertRaises((ValueError, torrents.TorrentError)):
                torrents.series_video_files([{"name": name, "length": 100} for name in names])
        self.assertEqual(torrents.episode_numbers("Special.S00E01.mkv"), (0, 1))

    def test_missing_downloaded_episode_prevents_entire_import(self):
        self.add()
        row = self.ready()
        self.manager.tick()
        (Path(row["downloadDir"]) / row["files"][1]["name"]).unlink()
        self.manager.tick()
        self.assertEqual(self.manager.jobs[INFO_HASH]["state"], "failed")
        self.series_import.assert_not_called()


class SeriesImportTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name).resolve()
        (self.root / "TVShows").mkdir()
        (self.root / "Movies").mkdir()
        for name, value in {"TVSHOWS_DIR": str(self.root / "TVShows"), "MOVIES_DIR": str(self.root / "Movies"),
                            "VIDEOS_DIR": str(self.root), "MEDIA_LIBRARY_PATH": str(self.root / "library.json"),
                            "LEGACY_MOVIE_LIBRARY_PATH": str(self.root / "legacy.json")}.items():
            p = patch.object(api, name, value); p.start(); self.addCleanup(p.stop)
        p = patch.object(api, "ensure_media_directories"); p.start(); self.addCleanup(p.stop)
        self.job = {"id": INFO_HASH, "mediaType": "series", "series": {"id": 123, "name": "Example"}}
        self.episodes = []
        for n in (1, 2):
            source = self.root / f"source{n}.mkv"
            source.write_bytes(f"new episode {n}".encode())
            self.episodes.append({"source": source, "seasonNumber": 1, "episodeNumber": n, "id": f"S01E{n:02d}"})

    def test_complete_pack_flows_through_manager_into_library_and_survives_cleanup(self):
        rpc = FakeTransmission()
        manager = torrents.TorrentDownloads(self.root / "Torrents", Mock(), Mock(), Mock(), rpc,
                                           api.import_torrent_series, lambda _: {"state": "complete"}, Mock())
        manager.start = Mock()
        manager.add({"infoHash": INFO_HASH, "mediaType": "series", "series": self.job["series"]})
        row = rpc.rows[INFO_HASH]
        files = []
        for number in (1, 2):
            filename = f"Pack/Season 1/Example.S01E{number:02d}.mkv"
            source = Path(row["downloadDir"]) / filename
            source.parent.mkdir(parents=True, exist_ok=True)
            source.write_bytes(b"complete video")
            files.append({"name": filename, "length": source.stat().st_size, "bytesCompleted": source.stat().st_size})
        row.update(files=files, metadataPercentComplete=1, percentDone=1, leftUntilDone=0, status=4)
        with patch.object(api, "queue_tmdb_artwork"):
            manager.tick()
            manager.tick()
        job = manager.snapshot()["jobs"][0]
        self.assertEqual(job["state"], "complete")
        self.assertNotIn(INFO_HASH, rpc.rows)
        self.assertEqual(job["item"]["episodeIds"], ["S01E01", "S01E02"])
        self.assertEqual(len(api.load_media_library()["series"]), 1)
        for video in job["item"]["episodes"]:
            self.assertEqual((self.root / video["relativePath"]).read_bytes(), b"complete video")

    def test_pack_is_registered_before_artwork_and_reimport_is_idempotent(self):
        def check(kind, item, refresh=False):
            self.assertEqual(kind, "tv")
            self.assertTrue(refresh)
            self.assertEqual(item["episodeIds"], ["S01E01", "S01E02"])
            self.assertIn(item["relativePath"], api.load_media_library()["series"])
            for video in item["episodes"]:
                self.assertTrue((self.root / video["relativePath"]).is_file())
        with patch.object(api, "queue_tmdb_artwork", side_effect=check):
            first = api.import_torrent_series(self.job, self.episodes)
            self.assertEqual(api.import_torrent_series(self.job, self.episodes), first)
        self.assertEqual(first["importedEpisodeIds"], ["S01E01", "S01E02"])
        for episode in self.episodes:
            episode["source"].unlink()
        self.assertEqual(len(list((self.root / first["relativePath"]).glob("*.mkv"))), 2)
        self.assertEqual(api.load_media_library()["movies"], {})

    def existing_series(self):
        folder = self.root / "TVShows/custom-name"
        folder.mkdir()
        old = folder / "Old.S01E01.mp4"
        old.write_bytes(b"keep original")
        with patch.object(api, "queue_tmdb_artwork"):
            api.upsert_series_metadata("TVShows/custom-name", {"name": "Custom name", "tmdbId": 123, "heroImage": "custom.jpg"})
        return old

    def test_existing_series_profile_and_episodes_are_preserved(self):
        old = self.existing_series()
        with patch.object(api, "queue_tmdb_artwork"):
            item = api.import_torrent_series({**self.job, "overwriteExisting": True}, self.episodes)
        self.assertEqual(item["relativePath"], "TVShows/custom-name")
        self.assertEqual(item["name"], "Custom name")
        self.assertEqual(item["heroImage"], "custom.jpg")
        self.assertEqual(item["skippedEpisodeIds"], ["S01E01"])
        self.assertEqual(item["importedEpisodeIds"], ["S01E02"])
        self.assertEqual(old.read_bytes(), b"keep original")

    def test_save_failure_rolls_back_new_files_preserving_existing_episodes(self):
        old = self.existing_series()
        before = copy.deepcopy(api.load_media_library())
        with patch.object(api, "save_media_library", side_effect=OSError("disk full")), patch.object(api, "queue_tmdb_artwork") as artwork:
            with self.assertRaises(OSError):
                api.import_torrent_series(self.job, self.episodes)
        self.assertEqual(list(old.parent.iterdir()), [old])
        self.assertEqual(api.load_media_library(), before)
        artwork.assert_not_called()
        self.assertTrue(all(ep["source"].exists() for ep in self.episodes))

    def test_partial_publication_rolls_back_and_can_retry(self):
        link = os.link
        calls = 0
        def fail_second(*args):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError("disk full")
            return link(*args)
        with patch.object(api.os, "link", side_effect=fail_second), patch.object(api, "queue_tmdb_artwork"):
            with self.assertRaises(OSError):
                api.import_torrent_series(self.job, self.episodes)
        self.assertFalse(list((self.root / "TVShows").rglob("*.mkv")))
        with patch.object(api, "queue_tmdb_artwork"):
            self.assertEqual(len(api.import_torrent_series(self.job, self.episodes)["episodes"]), 2)

    def test_restart_recovers_hardlink_left_before_catalog_commit(self):
        folder = self.root / "TVShows/example-123"
        folder.mkdir()
        os.link(self.episodes[0]["source"], folder / f"S01E01-{INFO_HASH[:12]}.mkv")
        with patch.object(api, "queue_tmdb_artwork"):
            item = api.import_torrent_series(self.job, self.episodes)
        self.assertEqual(item["importedEpisodeIds"], ["S01E01", "S01E02"])
        self.assertEqual(len(list(folder.iterdir())), 2)

    def test_symlink_destination_cannot_escape_library(self):
        outside = self.root / "outside"
        outside.mkdir()
        (self.root / "TVShows/example-123").symlink_to(outside)
        with patch.object(api, "queue_tmdb_artwork"), self.assertRaises(ValueError):
            api.import_torrent_series(self.job, self.episodes)
        self.assertEqual(list(outside.iterdir()), [])

    def test_search_route_passes_series_context_and_series_jobs_do_not_use_movie_conflicts(self):
        client = api.app.test_client()
        with patch.object(api, "is_authorized_request", return_value=True), \
                patch.object(api, "search_torrents", return_value={"results": []}) as search:
            response = client.get("/torrents/search?q=Example&mediaType=series&imdbId=tt1234567&seasonNumber=1&episodeNumber=2&eztvPage=3")
            self.assertEqual(response.status_code, 200)
            search.assert_called_once_with("Example", media_type="series", imdb_id="tt1234567", season="1", episode="2", eztv_page="3")
        manager = Mock()
        manager.add.return_value = self.job
        with patch.object(api, "is_authorized_request", return_value=True), patch.object(api, "get_movie_torrents", return_value=manager), \
                patch.object(api, "load_movie_library", side_effect=AssertionError("not a movie")):
            response = client.post("/torrents", json={"infoHash": INFO_HASH, "mediaType": "series", "series": {"id": 123, "name": "Example"}})
            self.assertEqual(response.status_code, 202)


if __name__ == "__main__":
    unittest.main()
