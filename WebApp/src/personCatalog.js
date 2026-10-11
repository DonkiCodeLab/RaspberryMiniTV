import { createContext } from "react";

export const PersonCatalogContext = createContext({ movies: [], onSelectMovie: null });

// Match stable TMDB IDs, including all crew jobs and catalog title overrides.
export function personCatalogMovies(movies, credits) {
  const ids = new Set([...(credits?.cast || []), ...(credits?.crew || [])]
    .map(movie => Number(movie.id)).filter(id => Number.isSafeInteger(id) && id > 0));
  const seen = new Set();
  return movies.filter(movie => {
    const id = Number(movie.tmdbId);
    if (!ids.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
