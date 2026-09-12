"""Prepare existing local artwork variants without contacting TMDB.
Run with --check to report missing variants only; safe to resume generation.
"""
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from control_api import load_media_library, tmdb_artwork
from tmdb_cache import IMAGE_RE

def variants(data):
    found = set()
    if isinstance(data, dict):
        for field, widths in (("poster_path", (500, 780)), ("backdrop_path", (1280,)), ("still_path", (780,))):
            path = data.get(field)
            if isinstance(path, str) and IMAGE_RE.fullmatch(path):
                found.update((path, width) for width in widths)
        for field, width in (("posters", 780), ("backdrops", 1280)):
            for item in data.get(field, [])[:7]:
                path = item.get("file_path")
                if isinstance(path, str) and IMAGE_RE.fullmatch(path): found.add((path, width))
        for value in data.values(): found.update(variants(value))
    elif isinstance(data, list):
        for value in data: found.update(variants(value))
    return found

def main():
    library = load_media_library()
    owners = {f'{kind}/{item["tmdbId"]}' for collection, kind in (("movies", "movie"), ("series", "tv")) for item in library.get(collection, {}).values() if item.get('tmdbId')}
    wanted = set()
    for filename, entry in tmdb_artwork.index.items():
        if entry.get('owner') in owners:
            wanted.update(variants(json.loads((tmdb_artwork.root / 'metadata' / filename).read_text())))
    missing = [(p, w) for p, w in wanted if not (tmdb_artwork.root / 'thumbnails' / str(w) / (p.lstrip('/') + '.webp')).is_file()]
    print(json.dumps({'variants': len(wanted), 'missing': len(missing)}), flush=True)
    if '--check' in sys.argv: return
    # Fail closed: even preparation of this existing cache must remain offline.
    tmdb_artwork._download = lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError('Original local ausente'))
    def generate(item):
        try: tmdb_artwork.display_image(*item); return None
        except Exception as exc: return f'{item}: {exc}'
    errors = []
    with ThreadPoolExecutor(max_workers=2) as pool:
        for count, error in enumerate(pool.map(generate, sorted(missing)), 1):
            if error: errors.append(error)
            if count % 100 == 0: print(json.dumps({'completed': count, 'total': len(missing), 'errors': len(errors)}), flush=True)
    print(json.dumps({'complete': len(missing) - len(errors), 'errors': errors}), flush=True)

if __name__ == '__main__': main()
