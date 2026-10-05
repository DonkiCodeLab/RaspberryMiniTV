// A saved cover is a user choice, not a fallback for automatic TMDB artwork.
// Use this rule for both preloading and rendering, regardless of detail loading.
export function seriesArtwork(profile = {}, metadata = {}, fallback = "", localize = value => value) {
  const saved = localize(profile.heroImage || "");
  return {
    heroImage: saved || metadata.heroImage || fallback,
    posterImage: saved || metadata.posterImage || metadata.heroImage || fallback,
  };
}
