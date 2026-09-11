"""Generate the current library's small local covers before browsers request them."""
import json
from concurrent.futures import ThreadPoolExecutor

from control_api import load_media_library, tmdb_artwork
from tmdb_cache import LANGUAGES


def main():
    library = load_media_library()
    posters = set()
    for collection, kind in (("movies", "movie"), ("series", "tv")):
        ids = {int(item["tmdbId"]) for item in library.get(collection, {}).values() if item.get("tmdbId")}
        for tmdb_id in ids:
            for language in LANGUAGES:
                path = tmdb_artwork.library_summary(kind, tmdb_id, language).get("posterPath")
                if path:
                    posters.add(path)
    def prepare(path):
        thumbnail = tmdb_artwork.display_image(path, 500)
        source = tmdb_artwork.root / "images" / path.lstrip("/")
        return source.stat().st_size, thumbnail.stat().st_size
    with ThreadPoolExecutor(max_workers=2) as executor:
        sizes = list(executor.map(prepare, sorted(posters)))
    print(json.dumps({"covers": len(sizes), "originalBytes": sum(pair[0] for pair in sizes),
                      "thumbnailBytes": sum(pair[1] for pair in sizes)}), flush=True)


if __name__ == "__main__":
    main()
