import io
import json
from pathlib import Path
import sys
import unittest
import urllib.error
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import youtube_search as yt
import control_api as api


class YouTubeTests(unittest.TestCase):
    def setUp(self):
        yt._cache.clear()

    def test_no_key_does_not_call_provider(self):
        with patch.object(yt.urllib.request, 'urlopen') as request:
            self.assertFalse(yt.search('Tetris Game Boy gameplay', '')['configured'])
            request.assert_not_called()

    def test_filters_decodes_and_caches_search(self):
        payload = {'items': [
            {'id': {'videoId': 'abcdefghijk'}, 'snippet': {'title': 'Game &amp; Play', 'channelTitle': 'Channel'}},
            {'id': {'videoId': 'abcdefghijk'}, 'snippet': {}},
            {'id': {'videoId': '../invalid'}, 'snippet': {}},
        ]}
        with patch.object(yt.urllib.request, 'urlopen', return_value=io.BytesIO(json.dumps(payload).encode())) as request:
            result = yt.search('Tetris Game Boy gameplay', 'private-key')
            self.assertEqual(result['results'], [{'id': 'abcdefghijk', 'title': 'Game & Play', 'channel': 'Channel'}])
            self.assertEqual(result, yt.search('Tetris Game Boy gameplay', 'private-key'))
            request.assert_called_once()
            self.assertIn('videoEmbeddable=true', request.call_args.args[0])
            self.assertIn('maxResults=6', request.call_args.args[0])
            self.assertNotIn('private-key', json.dumps(result))

    def test_provider_errors_are_redacted_and_quota_explained(self):
        body = io.BytesIO(json.dumps({'error': {'errors': [{'reason': 'quotaExceeded'}]}}).encode())
        error = urllib.error.HTTPError('https://example/?key=private-key', 403, 'private-key', {}, body)
        with patch.object(yt.urllib.request, 'urlopen', side_effect=error):
            with self.assertRaisesRegex(yt.SearchError, '^YOUTUBE_QUOTA$'):
                yt.search('Tetris gameplay', 'private-key')

    def test_network_failure_is_redacted(self):
        with patch.object(yt.urllib.request, 'urlopen', side_effect=OSError('private-key')):
            with self.assertRaisesRegex(yt.SearchError, '^YOUTUBE_SEARCH_FAILED$'):
                yt.search('Tetris gameplay', 'private-key')

    def test_authenticated_route_validates_and_uses_server_key(self):
        client = api.app.test_client()
        with patch.object(api, 'current_web_pin', return_value='1234'), patch.object(api, 'game_config_value', return_value='server-key'), patch.object(yt, 'search', return_value={'configured': True, 'results': []}) as search:
            self.assertEqual(client.get('/games/youtube?query=Tetris').status_code, 401)
            headers = {'X-Web-Pin': '1234'}
            self.assertEqual(client.get('/games/youtube', headers=headers).status_code, 400)
            self.assertEqual(client.get('/games/youtube?query=' + 'a'*201, headers=headers).status_code, 400)
            response = client.get('/games/youtube?query=Tetris', headers=headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(search.call_args.args[:2], ('Tetris', 'server-key'))
            self.assertNotIn('server-key', response.text)
