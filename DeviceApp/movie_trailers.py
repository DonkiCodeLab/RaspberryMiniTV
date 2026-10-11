"""Resolve movie trailers without overwriting a user's saved selection."""
import re

# This franchise anniversary montage is incorrectly attached to individual Bond films in TMDB.
UNRELATED_VIDEO_IDS = {"Ha94ny648TQ"}

VIDEO_ID = re.compile(r"[A-Za-z0-9_-]{11}")


def normalize_video(video):
    if not isinstance(video, dict) or not isinstance(video.get('id'), str) or not VIDEO_ID.fullmatch(video['id']):
        raise ValueError('Invalid YouTube video identifier')
    if any(not isinstance(video.get(key, ''), str) for key in ('name', 'channel')):
        raise ValueError('Invalid video details')
    return {'id': video['id'], 'name': video.get('name', '').strip()[:300] or 'YouTube',
            'channel': video.get('channel', '').strip()[:200]}


def find_trailer(tmdb, tmdb_id, name, language, search, kind="movie"):
    if kind not in {"movie", "tv"}:
        raise ValueError("Invalid media type")
    # Prefer a trailer attached to the exact movie and marked official by TMDB.
    details = {}
    if tmdb_id:
        for locale in dict.fromkeys((language, 'en-US')):
            try:
                details = tmdb.json(f'/{kind}/{int(tmdb_id)}',
                                    {'language': locale, 'append_to_response': 'videos'})
                videos = [v for v in (details.get('videos') or {}).get('results', [])
                          if v.get('site') == 'YouTube' and v.get('type') == 'Trailer'
                          and VIDEO_ID.fullmatch(str(v.get('key') or ''))
                          and v.get('key') not in UNRELATED_VIDEO_IDS]
                videos.sort(key=lambda v: bool(v.get('official')), reverse=True)
                if videos:
                    return normalize_video({'id': videos[0]['key'], 'name': videos[0].get('name') or 'Trailer'})
            except (OSError, ValueError, RuntimeError):
                continue
    year = str(details.get('first_air_date' if kind == 'tv' else 'release_date') or '')[:4]
    query = f"{name} {year} trailer oficial".strip()[:200]
    results = search(query).get('results', [])
    if results:
        video = results[0]
        return normalize_video({'id': video['id'], 'name': video.get('title', ''), 'channel': video.get('channel', '')})
    return None
