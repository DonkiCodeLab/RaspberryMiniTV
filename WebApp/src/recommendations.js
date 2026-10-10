export const TASTE_FIELDS = ["genres", "actors", "directors", "likedTitles", "dislikedGenres", "dislikedTitles"];

export function emptyTastes() {
  return Object.fromEntries(TASTE_FIELDS.map(field => [field, []]));
}

export function tastesToDraft(preferences) {
  return Object.fromEntries(TASTE_FIELDS.map(field => [field, (preferences?.[field] || []).join("\n")]));
}

export function draftToTastes(draft) {
  return Object.fromEntries(TASTE_FIELDS.map(field => [field,
    [...new Set(String(draft?.[field] || "").split(/\r?\n/).map(value => value.trim()).filter(Boolean))],
  ]));
}

export function validTastePreferences(preferences) {
  return Boolean(preferences) && TASTE_FIELDS.every(field => Array.isArray(preferences[field]) && preferences[field].length <= 12 &&
    preferences[field].every(value => typeof value === "string" && value.trim().length > 0 && value.length <= 100));
}

export function validateRecommendationMemory(data, userId, section) {
  if (!data || data.ok !== true || data.userId !== userId || data.section !== section ||
      !Number.isSafeInteger(data.revision) || data.revision < 0 || !validTastePreferences(data.preferences) ||
      !Array.isArray(data.history) || data.history.some(turn => !["user", "assistant"].includes(turn?.role) || typeof turn.text !== "string")) {
    throw new Error("Invalid recommendation memory");
  }
  return data;
}

export function validRecommendations(items, section) {
  const type = section === "series" ? "tv" : "movie";
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter(item => {
    if (!item || item.mediaType !== type || !Number.isSafeInteger(item.tmdbId) || item.tmdbId < 0 ||
        typeof item.title !== "string" || !item.title.trim() || typeof item.reason !== "string" ||
        typeof item.available !== "boolean" || !Array.isArray(item.localIds) || item.localIds.some(id => typeof id !== "string" || !id) ||
        (item.available && !item.localIds.length) || (!item.tmdbId && !item.available) || seen.has(recommendationKey(item))) return false;
    seen.add(recommendationKey(item));
    return true;
  });
}

export function recommendationKey(item) {
  return item.tmdbId > 0 ? `${item.mediaType}:${item.tmdbId}` : JSON.stringify([item.mediaType, ...item.localIds.slice().sort()]);
}

// Exact local identities keep a namesake, remake or another media type from
// becoming the destination of a recommendation's library button.
export function recommendationLibraryTarget(recommendation, movies, series) {
  const ids = new Set(recommendation?.localIds || []);
  if (recommendation?.mediaType === "movie") {
    const item = movies.find(movie => ids.has(movie.fileRelativePath || movie.relativePath || String(movie.id))
      && (!recommendation.tmdbId || Number(movie.tmdbId) === recommendation.tmdbId));
    return item ? { section: "movies", id: item.id } : null;
  }
  if (recommendation?.mediaType === "tv") {
    const item = series.find(show => ids.has(show.directoryPath || show.relativePath) && (!recommendation.tmdbId || Number(show.id || show.tmdbId) === recommendation.tmdbId));
    return item ? { section: "series", id: item.directoryPath || item.relativePath } : null;
  }
  return null;
}

export function recommendationTorrentTarget(recommendation) {
  if (!recommendation || !["movie", "tv"].includes(recommendation.mediaType) ||
      !Number.isSafeInteger(recommendation.tmdbId) || recommendation.tmdbId <= 0) return null;
  return { tmdbId: recommendation.tmdbId, mediaType: recommendation.mediaType,
    title: recommendation.title, source: "recommendation" };
}
