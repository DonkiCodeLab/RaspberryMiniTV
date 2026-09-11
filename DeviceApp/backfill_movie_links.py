"""Prepare persistent Rotten Tomatoes links for the installed movie library."""
import json
from concurrent.futures import ThreadPoolExecutor

from control_api import load_media_library, tmdb_artwork


def main():
    movies = load_media_library().get("movies", {})
    ids = sorted({int(item["tmdbId"]) for item in movies.values() if item.get("tmdbId")})

    def prepare(movie_id):
        try:
            path = f"/movie/{movie_id}"
            data = tmdb_artwork.json(path, {"language": "es-ES", "append_to_response": "external_ids"})
            result = tmdb_artwork._with_movie_links(path, data, lookup=True)
            url = result.get("rottenTomatoesUrl", "")
            return {"id": movie_id, "status": "direct" if "/m/" in url else "search" if url else "missing"}
        except Exception as exc:
            return {"id": movie_id, "status": "error", "error": str(exc)}

    with ThreadPoolExecutor(max_workers=3) as executor:
        results = list(executor.map(prepare, ids))
    print(json.dumps({"movies": len(movies), "uniqueTmdbIds": len(ids),
                      "withoutTmdbId": sum(not item.get("tmdbId") for item in movies.values()),
                      "results": results}, ensure_ascii=False), flush=True)
    return int(any(item["status"] in {"error", "missing"} for item in results))


if __name__ == "__main__":
    raise SystemExit(main())
