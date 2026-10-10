import { formatOmdbCriticScore, formatOmdbRating, isOmdbCriticScore } from "./omdbRatings.js";

export const RATING_SOURCES = [
  { id: "tmdb", label: "TMDB" },
  { id: "imdb", label: "IMDb" },
  { id: "rottenTomatoes", label: "Rotten Tomatoes" },
  { id: "metacritic", label: "Metacritic" },
];
const STORAGE_KEY = "minitv-library-rating-source-v1";

export function ratingSource(value) {
  return RATING_SOURCES.find(source => source.id === value) || RATING_SOURCES[0];
}

export function loadRatingSource() {
  try { return ratingSource(window.localStorage.getItem(STORAGE_KEY)).id; }
  catch { return "tmdb"; }
}

export function saveRatingSource(value) {
  try { window.localStorage.setItem(STORAGE_KEY, ratingSource(value).id); }
  catch { /* The selector still works when browser storage is unavailable. */ }
}

// Null means unavailable; a zero critic score is a valid rating.
export function libraryRatingValue(item, source = "tmdb") {
  const id = ratingSource(source).id;
  if (id === "tmdb") {
    const value = item?.voteAverage;
    return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 10 ? value / 2 : null;
  }
  const value = item?.omdbRatings?.[id === "imdb" ? "rating" : id];
  if (id === "imdb") return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 10 ? value : null;
  return isOmdbCriticScore(value) ? value : null;
}

export function formatLibraryRating(item, source = "tmdb", language = "es", unavailable = "—") {
  const value = libraryRatingValue(item, source);
  if (value === null) return unavailable;
  const id = ratingSource(source).id;
  if (id === "imdb") return `${formatOmdbRating(value, language)} / 10`;
  if (id === "rottenTomatoes") return `${formatOmdbCriticScore(value, language)} %`;
  if (id === "metacritic") return `${formatOmdbCriticScore(value, language)} / 100`;
  return `${new Intl.NumberFormat(language === "cat" ? "ca" : language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)} / 5`;
}

export function compareLibraryRatings(left, right, source = "tmdb", direction = "desc", language = "es") {
  const a = libraryRatingValue(left, source), b = libraryRatingValue(right, source);
  const names = String(left.name || "").localeCompare(String(right.name || ""), language, { sensitivity: "base", numeric: true });
  if (a === null || b === null) return Number(a === null) - Number(b === null) || names;
  return (direction === "desc" ? -1 : 1) * (a - b) || names;
}
