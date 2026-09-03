export const MEDIA_MARKS_KEY = "minitv-web-media-marks-v1";

export function mediaMarkKey(type, id) {
  return JSON.stringify([type, String(id)]);
}

export function seasonMarkKey(seriesId, seasonNumber) {
  return mediaMarkKey("season", JSON.stringify([String(seriesId), Number(seasonNumber)]));
}

export function episodeWatched(marks, seasonKey, episodeNumber) {
  const season = marks[seasonKey];
  return Boolean(season?.episodes?.[episodeNumber] ?? season?.watched);
}

export function markEpisode(marks, seasonKey, episodeNumber, watched) {
  const season = marks[seasonKey] || {};
  return { ...marks, [seasonKey]: { ...season, episodes: { ...season.episodes, [episodeNumber]: watched } } };
}

export function markSeason(marks, seasonKey, watched) {
  return { ...marks, [seasonKey]: { watched, episodes: {} } };
}

export function loadMediaMarks() {
  try {
    const value = JSON.parse(window.localStorage.getItem(MEDIA_MARKS_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}
