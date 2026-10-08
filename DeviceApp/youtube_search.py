"""Small server-side YouTube search client; never return provider error bodies or keys."""
import html
import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

_cache = {}
_lock = threading.Lock()


class SearchError(Exception):
    pass


def search(query, api_key, language='es', use_cache=True):
    if not api_key:
        return {'configured': False, 'results': []}
    # Credential changes must not reuse another account's cached responses.
    import hashlib
    cache_key = (query, language, hashlib.sha256(api_key.encode()).hexdigest())
    with _lock:
        cached = _cache.get(cache_key)
        if use_cache and cached and cached[0] > time.monotonic():
            return cached[1]
        params = urllib.parse.urlencode({'part': 'snippet', 'type': 'video', 'q': query,
            'maxResults': 6, 'videoEmbeddable': 'true', 'videoSyndicated': 'true',
            'relevanceLanguage': language, 'key': api_key})
        try:
            with urllib.request.urlopen('https://www.googleapis.com/youtube/v3/search?' + params, timeout=12) as response:
                payload = json.load(response)
        except urllib.error.HTTPError as error:
            code = 'YOUTUBE_SEARCH_FAILED'
            try:
                details = json.loads(error.read(65536)).get('error', {})
                reasons = {entry.get('reason') for entry in details.get('errors', [])}
                if reasons & {'quotaExceeded', 'dailyLimitExceeded'}:
                    code = 'YOUTUBE_QUOTA'
                elif error.code in (400, 401, 403):
                    code = 'YOUTUBE_CONFIG_ERROR'
            except (ValueError, TypeError, AttributeError):
                pass
            raise SearchError(code) from None
        except (OSError, ValueError):
            raise SearchError('YOUTUBE_SEARCH_FAILED') from None
        if not isinstance(payload, dict) or not isinstance(payload.get('items'), list):
            raise SearchError('YOUTUBE_SEARCH_FAILED')
        results, seen = [], set()
        for item in payload['items']:
            if not isinstance(item, dict):
                continue
            identity, snippet = item.get('id'), item.get('snippet')
            if not isinstance(identity, dict) or not isinstance(snippet, dict):
                continue
            video_id = identity.get('videoId')
            if not isinstance(video_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id) or video_id in seen:
                continue
            seen.add(video_id)
            results.append({'id': video_id, 'title': html.unescape(str(snippet.get('title') or 'YouTube')),
                            'channel': html.unescape(str(snippet.get('channelTitle') or ''))})
        result = {'configured': True, 'results': results}
        if len(_cache) >= 128:
            _cache.clear()
        _cache[cache_key] = (time.monotonic() + 900, result)
        return result
