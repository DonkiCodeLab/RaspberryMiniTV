export const MEDIA_MARKS_KEY = "minitv-web-media-marks-v1";

export function mediaMarkKey(type, id) {
  return JSON.stringify([type, String(id)]);
}

export function seasonMarkKey(seriesId, seasonNumber) {
  return mediaMarkKey("season", JSON.stringify([String(seriesId), Number(seasonNumber)]));
}

export function episodeWatched(marks, seasonKey, episodeNumber) {
  const season = marks[seasonKey];
  return Boolean(season?.episodes?.[episodeNumber] ?? season?.watched ?? marks[seriesKeyForSeason(seasonKey)]?.watched);
}

export function markEpisode(marks, seasonKey, episodeNumber, watched) {
  const season = marks[seasonKey] || {};
  return { ...marks, [seasonKey]: { ...season, episodes: { ...season.episodes, [episodeNumber]: watched } } };
}

export function markSeason(marks, seasonKey, watched) {
  return { ...marks, [seasonKey]: { watched, episodes: {} } };
}

function seriesKeyForSeason(key) {
  try {
    const [type, id] = JSON.parse(key);
    return type === "season" ? mediaMarkKey("series", JSON.parse(id)[0]) : null;
  } catch { return null; }
}

export function markSeries(marks, seriesId, watched) {
  const key = mediaMarkKey("series", seriesId);
  const next = { ...marks, [key]: { ...marks[key], watched } };
  for (const seasonKey of Object.keys(marks)) {
    if (seriesKeyForSeason(seasonKey) === key) {
      next[seasonKey] = { ...marks[seasonKey], watched, episodes: {} };
    }
  }
  return next;
}

export function seriesWatched(marks, seriesId) {
  const key = mediaMarkKey("series", seriesId);
  if (!marks[key]?.watched) return false;
  return Object.entries(marks).every(([seasonKey, season]) =>
    seriesKeyForSeason(seasonKey) !== key ||
    (season.watched !== false && !Object.values(season.episodes || {}).includes(false)));
}

export function loadMediaMarks() {
  try {
    const value = JSON.parse(window.localStorage.getItem(MEDIA_MARKS_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}
