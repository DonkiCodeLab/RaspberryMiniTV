"""Prepare persistent Rotten Tomatoes links for the installed movie library."""
import json
import re
from concurrent.futures import ThreadPoolExecutor

from control_api import load_media_library, tmdb_artwork


def main():
    movies = load_media_library().get("movies", {})
    ids = sorted({int(item["tmdbId"]) for item in movies.values() if item.get("tmdbId")})

    def read_movie(movie_id):
        path = f"/movie/{movie_id}"
        return movie_id, tmdb_artwork.json(path, {"language": "es-ES", "append_to_response": "external_ids"})

    with ThreadPoolExecutor(max_workers=3) as executor:
        details = dict(executor.map(read_movie, ids))
    wikidata_ids = sorted({str((data.get("external_ids") or {}).get("wikidata_id") or "")
                           for data in details.values()})
    wikidata_ids = [value for value in wikidata_ids if re.fullmatch(r"Q\d+", value)]
    lookups = {}
    # Batch the one-off migration instead of sending one Internet request per movie.
    # A failed batch aborts before overwriting any stored links.
    for start in range(0, len(wikidata_ids), 20):
        lookups.update(tmdb_artwork._rotten_tomatoes_lookup_many(wikidata_ids[start:start + 20]))
    results = []
    for movie_id, data in details.items():
        result = tmdb_artwork._with_movie_links(f"/movie/{movie_id}", data, lookup=True,
                                               refresh=True, lookup_results=lookups)
        url = result.get("rottenTomatoesUrl", "")
        results.append({"id": movie_id, "status": "direct" if "/m/" in url else "search" if url else "missing"})
    print(json.dumps({"movies": len(movies), "uniqueTmdbIds": len(ids),
                      "withoutTmdbId": sum(not item.get("tmdbId") for item in movies.values()),
                      "results": results}, ensure_ascii=False), flush=True)
    return int(any(item["status"] in {"error", "missing"} for item in results))


if __name__ == "__main__":
    raise SystemExit(main())
