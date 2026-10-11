"""Fill missing movie trailers, preserving existing choices and catalog fields."""
import json
from concurrent.futures import ThreadPoolExecutor
import catalog_store
import movie_trailers
import youtube_search
from control_api import (load_media_library, save_media_library, tmdb_artwork,
                         game_config_value, MEDIA_LIBRARY_PATH, LEGACY_MOVIE_LIBRARY_PATH)


def main():
    movies = load_media_library()['movies']
    pending = [(path, movie) for path, movie in movies.items() if not movie.get('preferredVideo')]
    outcomes = []

    def lookup(entry):
        path, movie = entry
        try:
            video = movie_trailers.find_trailer(tmdb_artwork, movie.get('tmdbId'), movie.get('name', ''), 'es-ES',
                lambda query: youtube_search.search(query, game_config_value('YOUTUBE_API_KEY'), 'es'))
            return path, movie, video, None
        except (OSError, ValueError, RuntimeError, youtube_search.SearchError) as error:
            return path, movie, None, type(error).__name__

    # Bound provider traffic; serialize catalog writes and recheck user choices.
    with ThreadPoolExecutor(max_workers=3) as executor:
        for path, movie, video, error in executor.map(lookup, pending):
            status = 'error' if error else 'missing'
            if video:
                with catalog_store.transaction(MEDIA_LIBRARY_PATH, LEGACY_MOVIE_LIBRARY_PATH):
                    library = load_media_library()
                    current = library['movies'].get(path)
                    if current is not None and not current.get('preferredVideo') and current.get('tmdbId') == movie.get('tmdbId'):
                        current['preferredVideo'] = video
                        save_media_library(library)
                        status = 'saved'
                    else:
                        status = 'preserved'
            outcome = {'movie': movie.get('name'), 'status': status, 'video': video}
            if error:
                outcome['error'] = error
            outcomes.append(outcome)
            print(json.dumps(outcome, ensure_ascii=False), flush=True)
    print(json.dumps({'movies': len(movies), 'saved': sum(x['status'] == 'saved' for x in outcomes),
                      'preserved': len(movies) - len(pending) + sum(x['status'] == 'preserved' for x in outcomes),
                      'unresolved': sum(x['status'] in ('missing', 'error') for x in outcomes)}), flush=True)


if __name__ == '__main__':
    main()
