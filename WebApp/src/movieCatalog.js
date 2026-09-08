// File paths identify movies; TMDB is optional descriptive metadata.
export function getRaspberryMovieLibraryItems(videos) {
  const entries = [
    ...(Array.isArray(videos?.movieRootFiles) ? videos.movieRootFiles : []),
    ...(Array.isArray(videos?.movieDirectories) ? videos.movieDirectories : [])
      .flatMap((bucket) => Array.isArray(bucket?.videos) ? bucket.videos : []),
  ];
  const metadata = videos?.mediaLibrary?.movies || {};
  const seen = new Set();
  return entries.flatMap((entry) => {
    const path = String(entry?.relativePath || '').trim();
    if (!path || seen.has(path)) return [];
    seen.add(path);
    const profile = metadata[path] || {};
    const fileName = String(entry.file || path.split('/').pop());
    return [{
      id: path,
      tmdbId: Number(profile.tmdbId || entry.tmdbId) || 0,
      name: String(profile.name || entry.name || fileName.replace(/\.[^.]+$/, '')),
      fileRelativePath: path,
      fileName,
    }];
  });
}

export function getMovieTmdbId(movie) {
  return Math.max(0, Number(movie.tmdbId ?? movie.id) || 0);
}

// One unavailable TMDB title must not discard metadata for the other movies.
export async function loadMovieDetails(movies, fetchMovie, language) {
  return Object.fromEntries(await Promise.all(movies.map(async (movie) => {
    const tmdbId = getMovieTmdbId(movie);
    let details = null;
    if (tmdbId) {
      try { details = await fetchMovie(tmdbId, language); } catch { /* Keep the file visible. */ }
    }
    return [String(movie.id), details];
  })));
}
