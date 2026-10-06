import io
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import torrent_downloads as torrents

HASH = 'a' * 40
SOURCE = {'name': 'Public indexer', 'url': 'http://localhost:9117/api/torznab', 'apiKey': 'secret'}


def feed(category=2000, info_hash=HASH, extra='', link=''):
    return f'''<rss xmlns:torznab="http://torznab.com/schemas/2015/feed"><channel><item>
    <title>Sintel</title><size>1000</size><link>{link}</link>
    <torznab:attr name="category" value="{category}"/>
    <torznab:attr name="infohash" value="{info_hash}"/>
    <torznab:attr name="seeders" value="3"/><torznab:attr name="peers" value="5"/>
    {extra}</item></channel></rss>'''.encode()


class TorznabTests(unittest.TestCase):
    def setUp(self):
        torrents.SEARCH_CACHE.clear()
        self.env = patch.dict(os.environ, {'MINITV_TORZNAB_SOURCES': '[]'})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_normalizes_and_filters(self):
        rows = torrents.normalize_torznab_results(feed(), 'Example')
        self.assertEqual(rows[0], {'infoHash': HASH, 'name': 'Sintel', 'sizeBytes': 1000,
                                  'seeds': 3, 'leechers': 2, 'sources': ['Example']})
        for raw in (feed(5000), feed(info_hash='bad'), feed(info_hash='0' * 40),
                    feed(extra='<torznab:attr name="private" value="1"/>')):
            self.assertEqual(torrents.normalize_torznab_results(raw, 'Example'), [])
        self.assertEqual(len(torrents.normalize_torznab_results(feed(5030), 'Example', 'series')), 1)

    def test_magnet_hex_and_base32(self):
        for value in (HASH.upper(), torrents.base64.b32encode(bytes.fromhex(HASH)).decode()):
            rows = torrents.normalize_torznab_results(feed(info_hash='', link=f'magnet:?xt=urn:btih:{value}'), 'Example')
            self.assertEqual(rows[0]['infoHash'], HASH)

    def test_bad_xml_and_api_errors_are_failures(self):
        for raw in (b'<error code="100"/>', b'<html/>', b'broken', b'<!DOCTYPE rss><rss><channel/></rss>'):
            with self.assertRaises(torrents.TorrentError):
                torrents.normalize_torznab_results(raw, 'Example')
        self.assertEqual(torrents.normalize_torznab_results(b'<rss><channel/></rss>', 'Example'), [])

    def test_request_and_response_limits(self):
        with patch.object(torrents.urllib.request, 'urlopen', return_value=io.BytesIO(feed())) as fetch:
            self.assertEqual(len(torrents.search_torznab('Sintel & title', 'movies', SOURCE)), 1)
            query = parse_qs(urlsplit(fetch.call_args.args[0].full_url).query)
            self.assertEqual(query['q'], ['Sintel & title'])
            self.assertEqual(query['cat'], ['2000'])
            self.assertEqual(query['apikey'], ['secret'])
        with patch.object(torrents.urllib.request, 'urlopen', return_value=io.BytesIO(b'x' * (4 * 1024 * 1024 + 1))):
            with self.assertRaises(torrents.TorrentError):
                torrents.search_torznab('Sintel', 'movies', SOURCE)

    def test_config_validation(self):
        for value in ('null', '{}', '[null]', '[{}]', '[{"name":"bad","url":"file:///tmp/test"}]'):
            with patch.dict(os.environ, {'MINITV_TORZNAB_SOURCES': value}):
                with self.assertRaises(ValueError):
                    torrents.torznab_sources()

    def test_integration_partial_failure_deduplication_and_configuration_cache(self):
        row = torrents.normalize_torznab_results(feed(), SOURCE['name'])[0]
        with patch.object(torrents, 'search_pirate_bay', return_value=[]), \
                patch.object(torrents, 'search_knaben', return_value=[]), \
                patch.object(torrents, 'search_torznab', return_value=[row]) as search:
            self.assertEqual(len(torrents.search_torrents('Sintel')['sources']), 2)
            with patch.dict(os.environ, {'MINITV_TORZNAB_SOURCES': torrents.json.dumps([SOURCE])}):
                found = torrents.search_torrents('Sintel')
                self.assertEqual(found['sources'][-1]['name'], SOURCE['name'])
                self.assertEqual(found['results'], [row])
                self.assertNotIn('secret', str(found))
                self.assertEqual(search.call_count, 1)
                torrents.SEARCH_CACHE.clear()
                search.side_effect = torrents.TorrentError('offline')
                found = torrents.search_torrents('Sintel')
                self.assertEqual(found['sources'][-1]['status'], 'error')
                self.assertEqual(found['results'], [])


if __name__ == '__main__':
    unittest.main()
