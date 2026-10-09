import { requestWithTimeout } from '../requestWithTimeout.js';
import { GAME_SYSTEMS } from "../gameSystems";
import { uploadBookBatch } from "./bookUploadBatch.js";
import { DEFAULT_USER, EMPTY_STATE, mergeProfileState } from "../profileState.js";
const configuredBaseUrl = (import.meta.env.VITE_RASPBERRY_API_BASE_URL || "").trim();
const WEB_PIN_STORAGE_KEY = "minitv-web-pin";
const MOCK_SERIES_LIBRARY_STORAGE_KEY = "minitv-web-mock-series-library-v1";
const MOCK_HIDDEN_SERIES_STORAGE_KEY = "minitv-web-mock-hidden-series-v1";
const MOCK_GAMES_LIBRARY_STORAGE_KEY = "minitv-web-mock-games-library-v1";
const explicitMockMode = (import.meta.env.VITE_WEB_DEV_MODE || "").trim().toLowerCase() === "mock";
const localhostHosts = new Set(["localhost", "127.0.0.1"]);
const SUPPORTED_RASPBERRY_LANGUAGES = new Set(["es", "ca", "en"]);

let mockPlayback = "";
let mockPlaybackDirectory = "";
let mockPlaybackFile = "";
let mockLanguage = "es";
let mockWeatherLocation = "Madrid";
let mockTmdbSettings = {
  apiKey: String(import.meta.env.VITE_TMDB_API_KEY || import.meta.env.EXPO_PUBLIC_TMDB_API_KEY || "").trim(),
  bearerToken: String(import.meta.env.VITE_TMDB_BEARER_TOKEN || import.meta.env.EXPO_PUBLIC_TMDB_BEARER_TOKEN || "").trim(),
};
let mockBirthdays = [];
let mockAlarmSounds = ["alarma_clasica.mp3", "despertador.mp3", "campana.mp3"];
let mockAlarms = [
  { id: 1, enabled: false, time: "07:30", sound: mockAlarmSounds[0] },
  { id: 2, enabled: false, time: "08:00", sound: mockAlarmSounds[0] },
  { id: 3, enabled: false, time: "08:30", sound: mockAlarmSounds[0] },
];

function normalizeAlarmEntry(entry, index, sounds = mockAlarmSounds) {
  const fallbackTimes = ["07:30", "08:00", "08:30"];
  const fallbackSound = sounds[0] || "";
  const sound = String(entry?.sound || entry?.soundFile || "").trim();
  return {
    id: index + 1,
    enabled: Boolean(entry?.enabled),
    time: /^\d{2}:\d{2}$/.test(String(entry?.time || "")) ? entry.time : fallbackTimes[index],
    sound: sounds.includes(sound) ? sound : fallbackSound,
  };
}

function normalizeAlarms(alarms, sounds = mockAlarmSounds) {
  const source = Array.isArray(alarms) ? alarms : [];
  return [0, 1, 2].map((index) => normalizeAlarmEntry(source[index], index, sounds));
}

function buildMockVideoLibrary() {
  const episodeIds = [
    "S01E01",
    "S01E02",
    "S01E03",
    "S02E01",
    "S02E02",
    "S02E03",
    "S03E01",
    "S03E02",
  ];

  const customSeries = loadMockSeriesLibrary();
  const hiddenSeries = loadMockHiddenSeries();
  const customSeriesByLabel = new Map(
    customSeries.map((series) => [normalizeLabel(series.name), series])
  );
  const directories = [
    {
      name: "Demo Series",
      relativePath: "TVShows/demo-series",
      tmdbId: 456,
      videoCount: episodeIds.length,
      episodeCount: episodeIds.length,
      episodeIds,
      videos: episodeIds.map((id) => ({
        id,
        file: `${id}.mp4`,
        relativePath: `TVShows/demo-series/${id}.mp4`,
      })),
    },
  ].filter((directory) => !hiddenSeries.has(directory.relativePath));

  directories.forEach((directory) => {
    const customEntry = customSeriesByLabel.get(normalizeLabel(directory.name));
    if (customEntry?.tmdbId) {
      directory.tmdbId = customEntry.tmdbId;
    }
  });

  customSeries.forEach((series) => {
    const alreadyIncluded = directories.some(
      (directory) =>
        directory.relativePath === series.relativePath ||
        normalizeLabel(directory.name) === normalizeLabel(series.name)
    );
    if (alreadyIncluded) return;

    directories.push({
      name: series.name,
      relativePath: series.relativePath,
      tmdbId: series.tmdbId,
      videoCount: Array.isArray(series.videos) ? series.videos.length : 0,
      episodeCount: Array.isArray(series.episodeIds) ? series.episodeIds.length : 0,
      episodeIds: Array.isArray(series.episodeIds) ? series.episodeIds : [],
      videos: Array.isArray(series.videos) ? series.videos : [],
    });
  });

  const mockGames = loadMockGamesLibrary();

  return {
    ok: true,
    root: "/mock/MultimediaContent/Videos",
    moviesRoot: "/mock/MultimediaContent/Videos/Movies",
    tvShowsRoot: "/mock/MultimediaContent/Videos/TVShows",
    gamesRoot: "/mock/MultimediaContent/Games",
    libraryCounts: {
      series: { count: directories.length, usedGb: 7.2, percentUsed: 1.4 },
      movies: { count: 0, usedGb: 0, percentUsed: 0 },
      games: { count: mockGames.length, usedGb: mockGames.length ? 0.1 : 0, percentUsed: mockGames.length ? 0.1 : 0 },
    },
    games: mockGames,
    directories: directories.sort((a, b) => a.name.localeCompare(b.name)),
    rootFiles: [],
    movieDirectories: [],
    movieRootFiles: [],
  };
}

function normalizeLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeRaspberryLanguage(language) {
  const safeLanguage = String(language || "").trim().toLowerCase();
  if (safeLanguage === "cat") return "ca";
  return SUPPORTED_RASPBERRY_LANGUAGES.has(safeLanguage) ? safeLanguage : "es";
}

function getLocalStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function loadMockSeriesLibrary() {
  try {
    const storage = getLocalStorage();
    if (!storage) return [];

    const raw = storage.getItem(MOCK_SERIES_LIBRARY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function loadMockHiddenSeries() {
  try {
    const storage = getLocalStorage();
    if (!storage) return new Set();

    const raw = storage.getItem(MOCK_HIDDEN_SERIES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map((value) => String(value || "").trim()).filter(Boolean) : []);
  } catch (_error) {
    return new Set();
  }
}

function saveMockHiddenSeries(items) {
  const storage = getLocalStorage();
  const safeItems = Array.from(
    new Set(Array.isArray(items) ? items.map((value) => String(value || "").trim()).filter(Boolean) : [])
  );

  if (storage) {
    storage.setItem(MOCK_HIDDEN_SERIES_STORAGE_KEY, JSON.stringify(safeItems));
  }

  return new Set(safeItems);
}

function loadMockGamesLibrary() {
  const storage = getLocalStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(MOCK_GAMES_LIBRARY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function saveMockGamesLibrary(items) {
  const storage = getLocalStorage();
  const safeItems = Array.isArray(items) ? items : [];
  if (storage) {
    storage.setItem(MOCK_GAMES_LIBRARY_STORAGE_KEY, JSON.stringify(safeItems));
  }
  return safeItems;
}

function saveMockSeriesLibrary(items) {
  const storage = getLocalStorage();
  const safeItems = Array.isArray(items) ? items : [];

  if (storage) {
    storage.setItem(MOCK_SERIES_LIBRARY_STORAGE_KEY, JSON.stringify(safeItems));
  }

  return safeItems;
}

function createMockSeriesRelativePath(name, existingPaths) {
  const baseSlug =
    String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "serie";
  let candidate = `TVShows/${baseSlug}`;
  let index = 2;

  while (existingPaths.has(candidate)) {
    candidate = `TVShows/${baseSlug}-${index}`;
    index += 1;
  }

  return candidate;
}

function isLocalhost() {
  if (typeof window === "undefined") return false;
  return localhostHosts.has(window.location.hostname);
}

function isMockModeEnabled() {
  return explicitMockMode || (import.meta.env.DEV && !configuredBaseUrl && isLocalhost());
}

function getBaseUrl() {
  if (isMockModeEnabled()) {
    return "mock://local";
  }

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  return window.location.origin.replace(/\/+$/, "");
}

async function request(path, options = {}) {
  const storedPin = getStoredWebPin();
  const isFormDataBody = typeof FormData !== "undefined" && options.body instanceof FormData;
  const response = await fetch(`${getBaseUrl()}${path}`, {
    headers: {
      ...(isFormDataBody ? {} : { "Content-Type": "application/json" }),
      ...(storedPin ? { "X-Web-Pin": storedPin } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await response.text();
  const payload = text ? tryParseJson(text) : null;

  if (!response.ok) {
    const error = new Error(payload?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = payload?.code;
    throw error;
  }

  return payload;
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return { raw: value };
  }
}

export function getApiBaseUrl() {
  return getBaseUrl();
}

export function isMockMode() {
  return isMockModeEnabled();
}

export function searchMediaTorrents(query, signal, options = {}) {
  if (isMockModeEnabled()) return Promise.resolve({ results: [], demo: true });
  const params = new URLSearchParams({ q: query });
  for (const key of ["mediaType", "imdbId", "seasonNumber", "episodeNumber", "eztvPage"]) {
    if (options[key] !== undefined && options[key] !== null && options[key] !== "") params.set(key, String(options[key]));
  }
  return request(`/torrents/search?${params}`, { signal });
}

export function startMediaTorrent(torrent, media, { mediaType = "movies", overwriteExisting = false, seasonNumber, episodeNumber } = {}) {
  if (isMockModeEnabled()) return Promise.reject(new Error("Conecta con la Raspberry para descargar torrents."));
  return request("/torrents", { method: "POST", body: JSON.stringify({
    infoHash: torrent.infoHash, name: torrent.name, sizeBytes: torrent.sizeBytes, sources: torrent.sources, overwriteExisting,
    mediaType, seasonNumber, episodeNumber,
    [mediaType === "books" ? "book" : mediaType === "series" ? "series" : "movie"]: mediaType === "books"
      ? { name: media.name, openLibraryKey: media.openLibraryKey, editionKey: media.editionKey }
      : { id: media.id, name: media.name },
  }) });
}

export function getMovieTorrents(signal) {
  if (isMockModeEnabled()) return Promise.resolve({ jobs: [], demo: true });
  return request("/torrents", { signal });
}

export function controlMovieTorrent(id, action) {
  return request(`/torrents/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ action }) });
}

export function getStoredWebPin() {
  if (isMockModeEnabled()) {
    return "mock-mode";
  }
  return window.sessionStorage.getItem(WEB_PIN_STORAGE_KEY) || "";
}

export function setStoredWebPin(pin) {
  if (!pin) {
    window.sessionStorage.removeItem(WEB_PIN_STORAGE_KEY);
    return;
  }
  window.sessionStorage.setItem(WEB_PIN_STORAGE_KEY, pin);
}

export function authWebPin(pin) {
  if (isMockModeEnabled()) {
    return Promise.resolve({ ok: true, mock: true, pin });
  }

  return request("/web/auth", {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
}

export function getHealth() {
  if (isMockModeEnabled()) {
    return Promise.resolve({
      ok: true,
      ts: Math.floor(Date.now() / 1000),
      language: mockLanguage,
      storage: {
        totalGb: 512,
        usedGb: 128.4,
        freeGb: 383.6,
        percentUsed: 25.1,
        multimediaUsedGb: 46.8,
        multimediaPercentUsed: 9.1,
      },
      libraryCounts: {
        series: { count: 1, usedGb: 7.2, percentUsed: 1.4 },
        movies: { count: 0, usedGb: 0, percentUsed: 0 },
        games: { count: 0, usedGb: 0, percentUsed: 0 },
      },
      playing: mockPlayback || null,
      directory: mockPlaybackDirectory || "",
      file: mockPlaybackFile || null,
      running: Boolean(mockPlayback),
      mock: true,
    });
  }

  return requestWithTimeout(signal => request("/health", { signal }));
}

export function getVideos() {
  if (isMockModeEnabled()) {
    return Promise.resolve(buildMockVideoLibrary());
  }

  // The full catalog also travels over remote Raspberry connections.
  return requestWithTimeout(signal => request("/videos", { signal }), 30000);
}

export function getRaspberryLanguage() {
  if (isMockModeEnabled()) {
    return Promise.resolve({ ok: true, language: mockLanguage, mock: true });
  }

  return requestWithTimeout(signal => request("/settings/language", { signal }));
}

export function updateRaspberryLanguage(language) {
  const nextLanguage = normalizeRaspberryLanguage(language);

  if (isMockModeEnabled()) {
    mockLanguage = nextLanguage;
    return Promise.resolve({ ok: true, language: nextLanguage, mock: true });
  }

  return request("/settings/language", {
    method: "POST",
    body: JSON.stringify({
      language: nextLanguage,
    }),
  });
}

export function getRaspberryAlarms() {
  if (isMockModeEnabled()) {
    return Promise.resolve({
      ok: true,
      alarms: normalizeAlarms(mockAlarms, mockAlarmSounds),
      sounds: mockAlarmSounds,
      mock: true,
    });
  }

  return request("/settings/alarms");
}

export function updateRaspberryAlarms(alarms) {
  if (isMockModeEnabled()) {
    mockAlarms = normalizeAlarms(alarms, mockAlarmSounds);
    return Promise.resolve({ ok: true, alarms: mockAlarms, sounds: mockAlarmSounds, mock: true });
  }

  return request("/settings/alarms", {
    method: "POST",
    body: JSON.stringify({
      alarms,
    }),
  });
}

export function getRaspberryWeatherSettings() {
  if (isMockModeEnabled()) {
    return Promise.resolve({ ok: true, location: mockWeatherLocation, details: null, mock: true });
  }
  return request("/settings/weather");
}

export function updateRaspberryWeatherLocation(location) {
  const safeLocation = String(location || "").trim().slice(0, 120);
  if (isMockModeEnabled()) {
    mockWeatherLocation = safeLocation;
    return Promise.resolve({ ok: true, location: mockWeatherLocation, details: null, mock: true });
  }
  return request("/settings/weather", {
    method: "POST",
    body: JSON.stringify({ location: safeLocation }),
  });
}

export function getRaspberryTmdbSettings() {
  if (isMockModeEnabled()) {
    return Promise.resolve({ ok: true, ...mockTmdbSettings, mock: true });
  }
  return request("/settings/tmdb");
}

export function updateRaspberryTmdbSettings({ apiKey, bearerToken }) {
  const nextSettings = {
    apiKey: String(apiKey || "").trim().slice(0, 256),
    bearerToken: String(bearerToken || "").trim().slice(0, 2048),
  };
  if (isMockModeEnabled()) {
    mockTmdbSettings = nextSettings;
    return Promise.resolve({ ok: true, ...mockTmdbSettings, mock: true });
  }
  return request("/settings/tmdb", {
    method: "POST",
    body: JSON.stringify(nextSettings),
  });
}

export function getRaspberryBirthdays() {
  if (isMockModeEnabled()) return Promise.resolve({ ok: true, birthdays: mockBirthdays, mock: true });
  return request("/settings/birthdays");
}

export function updateRaspberryBirthdays(birthdays) {
  if (isMockModeEnabled()) {
    mockBirthdays = Array.isArray(birthdays) ? birthdays : [];
    return Promise.resolve({ ok: true, birthdays: mockBirthdays, mock: true });
  }
  return request("/settings/birthdays", {
    method: "POST",
    body: JSON.stringify({ birthdays }),
  });
}

export function getAlarmSoundUrl(filename) {
  const safeFilename = encodeURIComponent(String(filename || "").trim());
  if (!safeFilename || isMockModeEnabled()) {
    return "";
  }
  return `${getBaseUrl()}/alarm-sounds/${safeFilename}`;
}

export function addSeries({ name, tmdbId }) {
  const safeName = String(name || "").trim();
  const safeTmdbId = Number(tmdbId) || 0;

  if (isMockModeEnabled()) {
    const current = loadMockSeriesLibrary();
    const hiddenSeries = loadMockHiddenSeries();
    const existingPaths = new Set(current.map((entry) => entry.relativePath));
    const normalizedName = normalizeLabel(safeName);
    const existing =
      current.find((entry) => Number(entry.tmdbId) === safeTmdbId) ||
      current.find((entry) => normalizeLabel(entry.name) === normalizedName);

    let item = existing;

    if (existing) {
      item = {
        ...existing,
        name: safeName,
        tmdbId: safeTmdbId,
      };
    } else {
      item = {
        name: safeName,
        tmdbId: safeTmdbId,
        relativePath: createMockSeriesRelativePath(safeName, existingPaths),
      };
    }

    const nextItems = existing
      ? current.map((entry) => (entry.relativePath === existing.relativePath ? item : entry))
      : [...current, item];

    saveMockSeriesLibrary(nextItems);
    if (item?.relativePath && hiddenSeries.has(item.relativePath)) {
      hiddenSeries.delete(item.relativePath);
      saveMockHiddenSeries(Array.from(hiddenSeries));
    }
    return Promise.resolve({ ok: true, item, items: nextItems });
  }

  return request("/series", {
    method: "POST",
    body: JSON.stringify({
      name: safeName,
      tmdbId: safeTmdbId,
    }),
  });
}

export function removeSeries(relativePath) {
  const safeRelativePath = String(relativePath || "").trim();
  if (!safeRelativePath) {
    return Promise.reject(new Error("Missing relativePath"));
  }

  if (isMockModeEnabled()) {
    const current = loadMockSeriesLibrary();
    const hiddenSeries = loadMockHiddenSeries();
    const nextItems = current.filter((entry) => entry.relativePath !== safeRelativePath);
    hiddenSeries.add(safeRelativePath);
    saveMockSeriesLibrary(nextItems);
    saveMockHiddenSeries(Array.from(hiddenSeries));
    return Promise.resolve({ ok: true, items: nextItems, relativePath: safeRelativePath });
  }

  return request(`/series?relativePath=${encodeURIComponent(safeRelativePath)}`, {
    method: "DELETE",
  });
}

export function removeSeriesEpisode(relativePath) {
  const safeRelativePath = String(relativePath || "").trim();
  if (!safeRelativePath) {
    return Promise.reject(new Error("Missing relativePath"));
  }

  if (isMockModeEnabled()) {
    const current = loadMockSeriesLibrary();
    const nextItems = current.map((entry) => {
      if (!safeRelativePath.startsWith(`${entry.relativePath}/`)) return entry;
      const nextVideos = Array.isArray(entry.videos)
        ? entry.videos.filter((video) => video.relativePath !== safeRelativePath)
        : [];
      return {
        ...entry,
        videos: nextVideos,
        episodeIds: nextVideos.map((video) => video.id).filter(Boolean),
      };
    });
    saveMockSeriesLibrary(nextItems);
    return Promise.resolve({ ok: true, relativePath: safeRelativePath, removed: true, items: nextItems, mock: true });
  }

  return request(`/series/episode?relativePath=${encodeURIComponent(safeRelativePath)}`, {
    method: "DELETE",
  });
}

export function removeSeriesSeason(relativePath, seasonNumber) {
  const safeRelativePath = String(relativePath || "").trim();
  const safeSeasonNumber = Number(seasonNumber) || 0;
  if (!safeRelativePath || !safeSeasonNumber) {
    return Promise.reject(new Error("Missing season"));
  }

  if (isMockModeEnabled()) {
    const prefix = `S${String(safeSeasonNumber).padStart(2, "0")}E`;
    const current = loadMockSeriesLibrary();
    const nextItems = current.map((entry) => {
      if (entry.relativePath !== safeRelativePath) return entry;
      const nextVideos = Array.isArray(entry.videos)
        ? entry.videos.filter((video) => !String(video.id || "").toUpperCase().startsWith(prefix))
        : [];
      return {
        ...entry,
        videos: nextVideos,
        episodeIds: nextVideos.map((video) => video.id).filter(Boolean),
      };
    });
    saveMockSeriesLibrary(nextItems);
    return Promise.resolve({ ok: true, relativePath: safeRelativePath, seasonNumber: safeSeasonNumber, items: nextItems, mock: true });
  }

  return request(
    `/series/season?relativePath=${encodeURIComponent(safeRelativePath)}&seasonNumber=${encodeURIComponent(String(safeSeasonNumber))}`,
    {
      method: "DELETE",
    }
  );
}

function createAbortError() {
  const error = new Error("Upload canceled");
  error.name = "AbortError";
  return error;
}

function attachUploadAbort(xhr, signal, reject) {
  if (!signal) return () => {};
  if (signal.aborted) {
    xhr.abort();
    reject(createAbortError());
    return () => {};
  }
  const handleAbort = () => {
    xhr.abort();
    reject(createAbortError());
  };
  signal.addEventListener("abort", handleAbort, { once: true });
  return () => signal.removeEventListener("abort", handleAbort);
}

export async function checkUploadConflicts(options) {
  if (isMockModeEnabled()) return { conflicts: [] };
  return request("/uploads/check", { method: "POST", body: JSON.stringify(options) });
}

export async function uploadMovieSubtitles({ relativePath, file, signal } = {}) {
  if (!relativePath || !file || !/\.srt$/i.test(file.name)) {
    throw new Error("Selecciona un archivo .srt para esta película.");
  }
  if (!file.size || file.size > 5 * 1024 * 1024) {
    throw new Error("El archivo SRT debe tener contenido y no superar los 5 MB.");
  }
  if (isMockModeEnabled()) return { ok: true, mock: true };
  const body = new FormData();
  body.append("relativePath", relativePath);
  body.append("file", file);
  return request("/movies/subtitles", { method: "POST", body, signal });
}

export async function getSubtitleSettings(signal) {
  if (isMockModeEnabled()) return { configured: false, demo: true };
  return request("/settings/subtitles", { signal });
}

export async function getGameSettings(signal) {
  if (isMockModeEnabled()) return { demo: true, present: {}, igdb: false, screenscraper: false };
  return request("/settings/games", { signal });
}

export async function searchYoutubeGameplay(query, signal) {
  if (isMockModeEnabled()) return { configured: false, results: [], demo: true };
  return request(`/games/youtube?${new URLSearchParams({ query })}`, { signal });
}

export async function saveGameSettings(settings) {
  if (isMockModeEnabled()) throw new Error("Game settings require a backend.");
  return request("/settings/games", { method: "POST", body: JSON.stringify(settings) });
}

export async function getMediaSubtitles(relativePath, signal) {
  if (isMockModeEnabled()) return { external: null, embedded: [], embeddedStatus: "unknown" };
  return request(`/media/subtitles?${new URLSearchParams({ relativePath })}`, { signal });
}

export async function saveSubtitleSettings(settings) {
  if (isMockModeEnabled()) throw new Error("OpenSubtitles: conecta con la Raspberry para configurar la cuenta.");
  return request("/settings/subtitles", { method: "POST", body: JSON.stringify(settings) });
}

export async function obtainMovieSubtitles({ relativePath, language = "es" }) {
  if (isMockModeEnabled()) {
    const error = new Error("Conecta con la Raspberry para descargar subtítulos.");
    error.code = "SUBTITLE_DEMO";
    throw error;
  }
  return request("/movies/subtitles/obtain", { method: "POST", body: JSON.stringify({ relativePath, language }) });
}

export function uploadMovieFile({ file, movie, overwriteExisting = false, onProgress, signal } = {}) {
  if (!file) {
    return Promise.reject(new Error("Missing file"));
  }

  const movieName = String(movie?.name || "").trim();
  const tmdbId = Number(movie?.id || movie?.tmdbId) || 0;

  if (isMockModeEnabled()) {
    const relativePath = `Movies/${String(file.name || `${movieName || "movie"}.mp4`).trim()}`;
    if (typeof onProgress === "function") {
      onProgress({
        percent: 100,
        fileName: file.name,
        status: "done",
      });
    }
    return Promise.resolve({
      ok: true,
      mock: true,
      item: {
        name: movieName || file.name,
        tmdbId,
        file: file.name,
        relativePath,
      },
    });
  }

  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      overwriteExisting: String(overwriteExisting),
      filename: file.name || "movie.mp4",
      name: movieName,
      tmdbId: String(tmdbId),
    });

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${getBaseUrl()}/movies/upload/raw?${params.toString()}`);
    const detachAbort = attachUploadAbort(xhr, signal, reject);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");

    const storedPin = getStoredWebPin();
    if (storedPin) {
      xhr.setRequestHeader("X-Web-Pin", storedPin);
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || typeof onProgress !== "function") return;
      onProgress({
        percent: Math.round((event.loaded / event.total) * 100),
        fileName: file.name,
        status: event.loaded >= event.total ? "saving" : "uploading",
      });
    };

    xhr.onload = () => {
      detachAbort();
      const payload = xhr.responseText ? tryParseJson(xhr.responseText) : null;
      if (xhr.status >= 200 && xhr.status < 300) {
        if (typeof onProgress === "function") {
          onProgress({
            percent: 100,
            fileName: file.name,
            status: "done",
          });
        }
        resolve(payload);
        return;
      }

      const error = new Error(payload?.error || `HTTP ${xhr.status}`);
      error.status = xhr.status;
      reject(error);
    };

    xhr.onerror = () => {
      detachAbort();
      reject(new Error("Upload failed"));
    };
    xhr.onabort = () => detachAbort();
    xhr.send(file);
  });
}

export function uploadSeriesFiles({ files, series, directoryName, heroImage, heroImageCrop, overwriteExisting = true, onProgress, signal } = {}) {
  const safeFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  if (!safeFiles.length) {
    return Promise.reject(new Error("Missing files"));
  }

  const seriesName = String(series?.name || "").trim();
  const tmdbId = Number(series?.id || series?.tmdbId) || 0;

  if (isMockModeEnabled()) {
    const current = loadMockSeriesLibrary();
    const existingPaths = new Set(current.map((entry) => entry.relativePath));
    const existingItem = current.find((entry) => Number(entry?.tmdbId) === tmdbId);
    const relativePath = existingItem?.relativePath || createMockSeriesRelativePath(seriesName || directoryName || "serie", existingPaths);
    const uploadedVideos = safeFiles.map((file) => ({
      id: String(file.name || "").match(/S\d{2}E\d{2}/i)?.[0]?.toUpperCase() || "",
      file: file.name,
      relativePath: `${relativePath}/${file.name}`,
    }));
    const uploadedIds = new Set(uploadedVideos.map((video) => video.id));
    const videos = [
      ...(existingItem?.videos || []).filter((video) => !overwriteExisting || !uploadedIds.has(video.id)),
      ...uploadedVideos,
    ];
    const item = {
      ...existingItem,
      name: seriesName,
      tmdbId,
      relativePath,
      videos,
      episodeIds: videos.map((video) => video.id).filter(Boolean),
      heroImage: heroImage || "",
      heroImageCrop: heroImageCrop || null,
    };
    saveMockSeriesLibrary(existingItem ? current.map((entry) => entry === existingItem ? item : entry) : [...current, item]);
    if (typeof onProgress === "function") {
      onProgress({
        percent: 100,
        current: safeFiles.length,
        total: safeFiles.length,
        fileName: safeFiles.at(-1)?.name || "",
        status: "done",
      });
    }
    return Promise.resolve({
      ok: true,
      mock: true,
      item,
    });
  }

  const sortedFiles = [...safeFiles].sort((a, b) =>
    String(a?.webkitRelativePath || a?.name || "").localeCompare(String(b?.webkitRelativePath || b?.name || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );
  const uploadOneFile = (file, index) =>
    new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("files", file, file.webkitRelativePath || file.name);
      formData.append("name", seriesName);
      formData.append("directoryName", String(directoryName || "").trim());
      formData.append("tmdbId", String(tmdbId));
      formData.append("heroImage", String(heroImage || ""));
      formData.append("heroImageCrop", JSON.stringify(heroImageCrop || null));
      formData.append("overwriteExisting", overwriteExisting ? "true" : "false");

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${getBaseUrl()}/series/upload`);
      const detachAbort = attachUploadAbort(xhr, signal, reject);

      const storedPin = getStoredWebPin();
      if (storedPin) {
        xhr.setRequestHeader("X-Web-Pin", storedPin);
      }

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || typeof onProgress !== "function") return;
        onProgress({
          percent: Math.round((event.loaded / event.total) * 100),
          current: index + 1,
          total: sortedFiles.length,
          fileName: file.name,
          status: event.loaded >= event.total ? "saving" : "uploading",
        });
      };

      xhr.onload = () => {
        detachAbort();
        const payload = xhr.responseText ? tryParseJson(xhr.responseText) : null;
        if (xhr.status >= 200 && xhr.status < 300) {
          if (typeof onProgress === "function") {
            onProgress({
              percent: 100,
              current: index + 1,
              total: sortedFiles.length,
              fileName: file.name,
              status: index + 1 === sortedFiles.length ? "done" : "saving",
            });
          }
          resolve(payload);
          return;
        }

        const error = new Error(payload?.error || `HTTP ${xhr.status}`);
        error.status = xhr.status;
        error.files = payload?.files || [];
        reject(error);
      };

      xhr.onerror = () => {
        detachAbort();
        reject(new Error("Upload failed"));
      };
      xhr.onabort = () => detachAbort();
      xhr.send(formData);
    });

  return sortedFiles.reduce(
    (promise, file, index) =>
      promise.then(async (lastResponse) => {
        if (signal?.aborted) {
          throw createAbortError();
        }
        if (typeof onProgress === "function") {
          onProgress({
            percent: 0,
            current: index + 1,
            total: sortedFiles.length,
            fileName: file.name,
            status: "uploading",
          });
        }
        return uploadOneFile(file, index).then((response) => response || lastResponse);
      }),
    Promise.resolve(null)
  );
}

export function searchGameMetadata({ query, extension, platform } = {}) {
  const safeQuery = String(query || "").trim();
  const safeExtension = String(extension || "").trim().toLowerCase();
  if (!safeQuery || !safeExtension) {
    return Promise.resolve({ ok: true, configured: false, results: [] });
  }

  if (isMockModeEnabled()) {
    return Promise.resolve({
      ok: true,
      configured: true,
      mock: true,
      defaultCover: "",
      results: [
        {
          id: Date.now(),
          name: safeQuery,
          description: "Ficha de prueba para validar el flujo de subida de juegos.",
          covers: [],
          source: "mock",
        },
      ],
    });
  }

  return request(`/games/search?query=${encodeURIComponent(safeQuery)}&extension=${encodeURIComponent(safeExtension)}&platform=${encodeURIComponent(platform || "")}`);
}

export function getGameMetadata({ source, id, extension, platform } = {}) {
  return request(`/games/metadata?${new URLSearchParams({ source, id, extension, platform })}`);
}

export function retryGameMetadata(relativePath, selection) {
  return request("/games/metadata", { method: "POST", body: JSON.stringify({ relativePath, source: selection?.source, id: selection?.id }) });
}

export function gameMetadataImageUrl(url) {
  if (!url) return "";
  if (url.startsWith("/game-covers/")) return `${getBaseUrl()}${url}`;
  if (isMockModeEnabled()) return url;
  return `${getBaseUrl()}/games/metadata/image?${new URLSearchParams({ url, pin: getStoredWebPin() || "" })}`;
}

export async function uploadGameFile({ file, game, cover, onProgress, signal } = {}) {
  if (!file) {
    return Promise.reject(new Error("Missing file"));
  }

  const gameName = String(game?.name || "").trim() || String(file.name || "").replace(/\.[^.]+$/, "");
  const description = String(game?.description || "").trim();
  const coverFile = cover?.file instanceof File ? cover.file : null;
  const imageFiles = Array.isArray(cover?.imageFiles)
    ? cover.imageFiles.filter((entry) => entry instanceof File)
    : [];
  const imagePreviewUrls = Array.isArray(cover?.imagePreviewUrls) ? cover.imagePreviewUrls : [];
  const coverUrl = String(cover?.url || "").trim();
  const source = String(game?.source || (coverFile || imageFiles.length ? "local" : coverUrl ? "screenscraper" : "default")).trim();
  const metadataSource = ["screenscraper", "igdb"].includes(game?.source) ? game.source : "";
  const metadataId = metadataSource ? Number(game?.id || game?.metadataId) || 0 : 0;
  const screenScraperId = metadataSource === "screenscraper" ? metadataId : 0;

  if (isMockModeEnabled()) {
    const current = loadMockGamesLibrary();
    const extension = String(file.name || "").split(".").pop()?.toLowerCase() || "";
    const platformName = GAME_SYSTEMS.find(s => s.id === game?.platform)?.name || "Game Boy";
    const readImage = imageFile => new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(imageFile);
    });
    const savedCover = coverFile ? await readImage(coverFile) : coverUrl;
    const savedImages = await Promise.all(imageFiles.map(readImage));
    const item = {
      name: gameName,
      description,
      file: file.name,
      relativePath: `Games/${file.name}`,
      platformName,
      platform: game?.platform,
      coverImage: savedCover || "",
      imageOptions: [savedCover, ...savedImages].filter(Boolean),
      source,
    };
    saveMockGamesLibrary([...current, item]);
    if (typeof onProgress === "function") {
      onProgress(100);
    }
    return Promise.resolve({ ok: true, mock: true, item });
  }

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", gameName);
    formData.append("platform", game?.platform || "");
    formData.append("description", description);
    if (coverFile) {
      formData.append("coverFile", coverFile);
    }
    imageFiles.forEach((imageFile) => {
      formData.append("imageFiles", imageFile);
    });
    formData.append("coverUrl", coverUrl);
    formData.append("source", source);
    formData.append("screenScraperId", String(screenScraperId));
    formData.append("metadataSource", metadataSource);
    formData.append("metadataId", String(metadataId));

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${getBaseUrl()}/games/upload`);
    const detachAbort = attachUploadAbort(xhr, signal, reject);

    const storedPin = getStoredWebPin();
    if (storedPin) {
      xhr.setRequestHeader("X-Web-Pin", storedPin);
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || typeof onProgress !== "function") return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      detachAbort();
      const payload = xhr.responseText ? tryParseJson(xhr.responseText) : null;
      if (xhr.status >= 200 && xhr.status < 300) {
        if (typeof onProgress === "function") {
          onProgress(100);
        }
        resolve(payload);
        return;
      }

      const error = new Error(payload?.error || `HTTP ${xhr.status}`);
      error.status = xhr.status;
      reject(error);
    };

    xhr.onerror = () => {
      detachAbort();
      reject(new Error("Upload failed"));
    };
    xhr.onabort = () => detachAbort();
    xhr.send(formData);
  });
}

export function updateGameFileMetadata({
  relativePath,
  name,
  description,
  coverFile,
  coverImage,
  imageFiles,
  imageOptions,
} = {}) {
  const safeRelativePath = String(relativePath || "").trim();
  if (!safeRelativePath) {
    return Promise.reject(new Error("Missing relativePath"));
  }

  const safeName = String(name || "").trim();
  const safeDescription = String(description || "").trim();
  const safeCoverImage = String(coverImage || "").trim();
  const safeImageFiles = Array.isArray(imageFiles)
    ? imageFiles.filter((entry) => entry instanceof File)
    : [];
  const safeImageOptions = Array.isArray(imageOptions)
    ? imageOptions.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];

  if (isMockModeEnabled()) {
    const current = loadMockGamesLibrary();
    const item = current.find((entry) => entry.relativePath === safeRelativePath) || {};
    const newCoverPreview = coverFile instanceof File ? URL.createObjectURL(coverFile) : "";
    const newImagePreviews = safeImageFiles.map((imageFile) => URL.createObjectURL(imageFile));
    const nextCoverImage = newCoverPreview || safeCoverImage || item.coverImage || "";
    const nextItem = {
      ...item,
      name: safeName || item.name || item.file || safeRelativePath,
      description: safeDescription,
      coverImage: nextCoverImage,
      imageOptions: Array.from(
        new Set([nextCoverImage, ...safeImageOptions, ...newImagePreviews].filter(Boolean))
      ),
      source: "local",
    };
    saveMockGamesLibrary(
      current.map((entry) => (entry.relativePath === safeRelativePath ? nextItem : entry))
    );
    return Promise.resolve({ ok: true, mock: true, item: nextItem });
  }

  const formData = new FormData();
  formData.append("relativePath", safeRelativePath);
  formData.append("name", safeName);
  formData.append("description", safeDescription);
  formData.append("coverImage", safeCoverImage);
  formData.append("imageOptions", JSON.stringify(safeImageOptions));
  if (coverFile instanceof File) {
    formData.append("coverFile", coverFile);
  }
  safeImageFiles.forEach((imageFile) => {
    formData.append("imageFiles", imageFile);
  });

  return request("/games/profile", {
    method: "POST",
    body: formData,
  });
}

export function saveMovieFileMetadata({ relativePath, name, tmdbId }) {
  const safeRelativePath = String(relativePath || "").trim();
  const safeName = String(name || "").trim();
  const safeTmdbId = Number(tmdbId) || 0;
  if (!safeRelativePath || !safeName || !safeTmdbId) {
    return Promise.reject(new Error("Missing movie metadata"));
  }

  if (isMockModeEnabled()) {
    return Promise.resolve({
      ok: true,
      mock: true,
      item: {
        relativePath: safeRelativePath,
        name: safeName,
        tmdbId: safeTmdbId,
        file: safeRelativePath.split("/").pop() || "",
      },
    });
  }

  return request("/movies", {
    method: "POST",
    body: JSON.stringify({
      relativePath: safeRelativePath,
      name: safeName,
      tmdbId: safeTmdbId,
    }),
  });
}

export function saveMediaProfile({ collection, relativePath, name, tmdbId, file, heroImage, heroImageCrop, imdbUrl, rottenTomatoesUrl }) {
  const safeCollection = collection === "movies" ? "movies" : "series";
  const safeRelativePath = String(relativePath || "").trim();
  if (!safeRelativePath) {
    return Promise.reject(new Error("Missing relativePath"));
  }

  if (isMockModeEnabled()) {
    return Promise.resolve({
      ok: true,
      mock: true,
      item: {
        collection: safeCollection,
        relativePath: safeRelativePath,
        name: String(name || "").trim(),
        tmdbId: Number(tmdbId) || 0,
        file: String(file || "").trim(),
        heroImage: String(heroImage || "").trim(),
        heroImageCrop: heroImageCrop || null,
        imdbUrl: String(imdbUrl || "").trim(),
        rottenTomatoesUrl: String(rottenTomatoesUrl || "").trim(),
      },
    });
  }

  return request("/media/profile", {
    method: "POST",
    body: JSON.stringify({
      collection: safeCollection,
      relativePath: safeRelativePath,
      name,
      tmdbId,
      file,
      heroImage,
      heroImageCrop,
      imdbUrl,
      rottenTomatoesUrl,
    }),
  });
}

export function removeMovieFile(relativePath) {
  const safeRelativePath = String(relativePath || "").trim();
  if (!safeRelativePath) {
    return Promise.reject(new Error("Missing relativePath"));
  }

  if (isMockModeEnabled()) {
    return Promise.resolve({ ok: true, relativePath: safeRelativePath, removed: true, mock: true });
  }

  return request(`/movies?relativePath=${encodeURIComponent(safeRelativePath)}`, {
    method: "DELETE",
  });
}

export function removeGameFile(relativePath) {
  const safeRelativePath = String(relativePath || "").trim();
  if (!safeRelativePath) {
    return Promise.reject(new Error("Missing relativePath"));
  }

  if (isMockModeEnabled()) {
    const current = loadMockGamesLibrary();
    const nextItems = current.filter((entry) => entry.relativePath !== safeRelativePath);
    saveMockGamesLibrary(nextItems);
    return Promise.resolve({ ok: true, relativePath: safeRelativePath, removed: true, mock: true });
  }

  return request(`/games?relativePath=${encodeURIComponent(safeRelativePath)}`, {
    method: "DELETE",
  });
}

export function playGameFile(relativePath) {
  const safeRelativePath = String(relativePath || "").trim();
  if (!safeRelativePath) {
    return Promise.reject(new Error("Missing relativePath"));
  }

  if (isMockModeEnabled()) {
    const fileName = safeRelativePath.split("/").pop() || safeRelativePath;
    mockPlayback = fileName;
    mockPlaybackDirectory = "Games";
    mockPlaybackFile = safeRelativePath;
    return Promise.resolve({
      ok: true,
      playing: fileName,
      directory: "Games",
      file: safeRelativePath,
      mock: true,
    });
  }

  return request("/games/play", {
    method: "POST",
    body: JSON.stringify({ relativePath: safeRelativePath }),
  });
}

export function getGameDownloadUrl(relativePath) {
  const path = String(relativePath || "").trim();
  if (!path) return "";
  const params = new URLSearchParams({ relativePath: path, download: "1" });
  const storedPin = getStoredWebPin();
  if (storedPin && !isMockModeEnabled()) params.set("pin", storedPin);
  return `${getBaseUrl()}/games/content?${params.toString()}`;
}

export function getBrowserGameUrl(relativePath, systemId) {
  const params = new URLSearchParams({
    relativePath: String(relativePath || "").trim(),
    system: String(systemId || "").trim(),
  });
  const storedPin = getStoredWebPin();
  if (storedPin && !isMockModeEnabled()) params.set("pin", storedPin);
  return `${getBaseUrl()}/games/browser?${params.toString()}`;
}

export function playEpisode({ id, directory, output = "minitv", userId, startSeconds = 0, markKey, episodeNumber }) {
  if (isMockModeEnabled()) {
    mockPlayback = id;
    mockPlaybackDirectory = directory || "";
    mockPlaybackFile = `${directory || ""}${directory ? "/" : ""}${id}.mp4`;
    return Promise.resolve({
      ok: true,
      playing: id,
      directory: mockPlaybackDirectory,
      file: mockPlaybackFile,
      output,
      mock: true,
    });
  }

  return request("/play", {
    method: "POST",
    body: JSON.stringify({
      id,
      directory,
      output,
      userId, startSeconds, markKey, episodeNumber,
    }),
  });
}

export function getMediaStreamUrl(relativePath) {
  const safeRelativePath = String(relativePath || "").trim();
  if (!safeRelativePath) return "";

  const params = new URLSearchParams({ relativePath: safeRelativePath });
  const storedPin = getStoredWebPin();
  if (storedPin && !isMockModeEnabled()) params.set("pin", storedPin);
  return `${getBaseUrl()}/media/stream?${params.toString()}`;
}

export function getPictureContentUrl(relativePath) {
  const safeRelativePath = String(relativePath || "").trim();
  if (!safeRelativePath) return "";
  const params = new URLSearchParams({ relativePath: safeRelativePath });
  const storedPin = getStoredWebPin();
  if (storedPin && !isMockModeEnabled()) params.set("pin", storedPin);
  return `${getBaseUrl()}/pictures/content?${params.toString()}`;
}

export function uploadPictureFiles({ files, onProgress, signal } = {}) {
  const safeFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  if (!safeFiles.length) return Promise.reject(new Error("Missing pictures"));
  if (isMockModeEnabled()) {
    return Promise.resolve({ ok: true, mock: true, saved: safeFiles.map((file) => file.webkitRelativePath || file.name) });
  }
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    safeFiles.forEach((file) => formData.append("files", file, file.webkitRelativePath || file.name));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${getBaseUrl()}/pictures/upload`);
    const detachAbort = attachUploadAbort(xhr, signal, reject);
    const storedPin = getStoredWebPin();
    if (storedPin) xhr.setRequestHeader("X-Web-Pin", storedPin);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && typeof onProgress === "function") {
        onProgress({ percent: Math.round((event.loaded / event.total) * 100), current: safeFiles.length, total: safeFiles.length, status: event.loaded >= event.total ? "saving" : "uploading" });
      }
    };
    xhr.onload = () => {
      detachAbort();
      const payload = xhr.responseText ? tryParseJson(xhr.responseText) : null;
      if (xhr.status >= 200 && xhr.status < 300) return resolve(payload);
      const error = new Error(payload?.error || `HTTP ${xhr.status}`);
      error.status = xhr.status;
      reject(error);
    };
    xhr.onerror = () => { detachAbort(); reject(new Error("Upload failed")); };
    xhr.onabort = () => detachAbort();
    xhr.send(formData);
  });
}

export function getBookContentUrl(relativePath, { render } = {}) {
  const safeRelativePath = String(relativePath || "").trim();
  if (!safeRelativePath) return "";
  const params = new URLSearchParams({ relativePath: safeRelativePath });
  if (render) params.set("render", render);
  const storedPin = getStoredWebPin();
  if (storedPin && !isMockModeEnabled()) params.set("pin", storedPin);
  return `${getBaseUrl()}/books/content?${params.toString()}`;
}

export async function getBookContent(relativePath, { signal, format = "pdf" } = {}) {
  const url = getBookContentUrl(relativePath, { render: /\.(cbr|cbz)$/i.test(relativePath) && format === "pdf" ? "pdf" : undefined });
  if (!url) throw new Error("Missing book path");

  const storedPin = getStoredWebPin();
  const response = await fetch(url, {
    headers: storedPin ? { "X-Web-Pin": storedPin } : {},
    signal,
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.error) message = payload.error;
    } catch (_error) {
      // Keep the HTTP status when the server did not return JSON.
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const data = new Uint8Array(await response.arrayBuffer());
  const pdfHeader = String.fromCharCode(...data.subarray(0, 1024));
  if (!data.length || (format === "pdf" && !pdfHeader.includes("%PDF-")) ||
      (format === "epub" && (data[0] !== 0x50 || data[1] !== 0x4b))) {
    throw new Error(`El servidor no devolvió un archivo ${format.toUpperCase()} válido.`);
  }
  return data;
}

export function openBookOnRaspberry(relativePath, { userId, resume = false } = {}) {
  const safeRelativePath = String(relativePath || "").trim();
  if (!safeRelativePath) return Promise.reject(new Error("Missing book path"));
  if (isMockModeEnabled()) return Promise.resolve({ ok: true, mock: true });
  return request("/books/open", {
    method: "POST",
    body: JSON.stringify({ relativePath: safeRelativePath, userId, resume }),
  });
}

export function getBookCoverUrl(relativePath) {
  const safeRelativePath = String(relativePath || "").trim();
  if (!safeRelativePath) return "";
  const params = new URLSearchParams({ relativePath: safeRelativePath });
  const storedPin = getStoredWebPin();
  if (storedPin && !isMockModeEnabled()) params.set("pin", storedPin);
  return `${getBaseUrl()}/books/cover?${params.toString()}`;
}

export function getBookDisplayCoverUrl(book) {
  const coverUrl = String(book?.coverUrl || "").trim();
  if (coverUrl.startsWith("/book-covers/")) return `${getBaseUrl()}${coverUrl}`;
  return coverUrl || getBookCoverUrl(book?.relativePath);
}

export async function uploadBookFiles({ files, collection = "", title = "", metadata, overwriteExisting = false, onProgress, onReport, signal } = {}) {
  const safeFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  if (!safeFiles.length) throw new Error("Missing book files");
  return uploadBookBatch({ files: safeFiles, onProgress, onReport, signal,
    uploadOne: (file, progress) => uploadBookRequest({ files: [file], collection, overwriteExisting, title: safeFiles.length === 1 ? title : "",
      metadata: safeFiles.length === 1 ? metadata : typeof metadata?.isGraphicNovel === "boolean" ? { isGraphicNovel: metadata.isGraphicNovel } : undefined,
      onProgress: progress, signal }),
  });
}

async function uploadBookRequest({ files, collection = "", title = "", metadata, overwriteExisting = false, onProgress, signal } = {}) {
  const safeFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  if (!safeFiles.length) throw new Error("Missing book files");
  if (isMockModeEnabled()) {
    if (typeof onProgress === "function") {
      onProgress({ percent: 100, fileName: safeFiles.at(-1)?.name || "", status: "done" });
    }
    return { ok: true, mock: true, items: [] };
  }
  const form = new FormData();
  safeFiles.forEach((file) => form.append("files", file, file.webkitRelativePath || file.name));
  form.append("overwriteExisting", String(overwriteExisting));
  form.append("collection", collection);
  form.append("title", title);
  if (metadata) {
    const { coverFile, relativePath, ...fields } = metadata;
    form.append("metadata", JSON.stringify(fields));
    if (coverFile instanceof File) form.append("coverFile", coverFile);
  }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(createAbortError()); return; }
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${getBaseUrl()}/books/upload`);
    const detachAbort = attachUploadAbort(xhr, signal, reject);
    const storedPin = getStoredWebPin();
    if (storedPin) xhr.setRequestHeader("X-Web-Pin", storedPin);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || typeof onProgress !== "function") return;
      onProgress({
        percent: Math.round((event.loaded / event.total) * 100),
        fileName: safeFiles.length === 1 ? safeFiles[0].name : `${safeFiles.length} libros`,
        status: event.loaded >= event.total ? "saving" : "uploading",
      });
    };
    xhr.onload = () => {
      detachAbort();
      const payload = xhr.responseText ? tryParseJson(xhr.responseText) : null;
      if (xhr.status >= 200 && xhr.status < 300) {
        if (typeof onProgress === "function") {
          onProgress({ percent: 100, fileName: safeFiles.length === 1 ? safeFiles[0].name : `${safeFiles.length} libros`, status: "done" });
        }
        resolve(payload);
        return;
      }
      const error = new Error(payload?.error || (xhr.status === 413 ? "El servidor ha rechazado el tamaño del archivo (HTTP 413)." : `Error del servidor (HTTP ${xhr.status}).`));
      error.status = xhr.status;
      reject(error);
    };
    xhr.onerror = () => {
      detachAbort();
      reject(new Error("Se ha perdido la conexión con la Mini TV durante la subida. Comprueba la red y que la Mini TV siga encendida."));
    };
    xhr.onabort = () => detachAbort();
    xhr.send(form);
  });
}

export function removeBookFile(relativePath) {
  return request(`/books?relativePath=${encodeURIComponent(relativePath)}`, { method: "DELETE" });
}

export function searchBookMetadata(query, language = "es", { signal } = {}) {
  const params = new URLSearchParams({ query: String(query || "").trim(), language });
  return request(`/books/search?${params.toString()}`, { signal });
}

export function getBookMetadataDetails(result, { signal, language = "es" } = {}) {
  const params = new URLSearchParams({ workKey: result.openLibraryKey || "", editionKey: result.editionKey || "", language });
  return request(`/books/metadata?${params}`, { signal });
}

export function saveBookMetadata(profile) {
  const form = new FormData();
  Object.entries(profile || {}).forEach(([key, value]) => {
    if (key !== "coverFile" && value !== undefined && value !== null) form.append(key, key === "localizedMetadata" ? JSON.stringify(value) : String(value));
  });
  if (profile?.coverFile instanceof File) form.append("coverFile", profile.coverFile);
  return request("/books/profile", { method: "POST", body: form });
}

export function saveBookCollectionMetadata(profile) {
  const form = new FormData();
  form.append("collection", String(profile?.collection || ""));
  if (profile?.author !== undefined) form.append("author", String(profile.author || ""));
  form.append("name", String(profile?.name || ""));
  form.append("coverUrl", String(profile?.coverUrl || ""));
  if (typeof profile?.isGraphicNovel === "boolean") form.append("isGraphicNovel", String(profile.isGraphicNovel));
  if (profile?.coverFile instanceof File) form.append("coverFile", profile.coverFile);
  return request("/books/collection/profile", { method: "POST", body: form });
}

export function removeBookCollection(collection) {
  return request(`/books/collection?collection=${encodeURIComponent(collection)}`, { method: "DELETE" });
}

export async function captureCameraImage() {
  if (isMockModeEnabled()) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#111d26"/><circle cx="640" cy="330" r="105" fill="none" stroke="#ffd429" stroke-width="22"/><circle cx="640" cy="330" r="42" fill="#ffd429"/><path d="M470 235h95l32-45h86l32 45h95c28 0 50 22 50 50v250c0 28-22 50-50 50H470c-28 0-50-22-50-50V285c0-28 22-50 50-50Z" fill="none" stroke="#eef2f6" stroke-width="18"/><text x="640" y="650" text-anchor="middle" fill="#eef2f6" font-family="sans-serif" font-size="38">Vista previa de cámara</text></svg>`;
    return new Blob([svg], { type: "image/svg+xml" });
  }

  const storedPin = getStoredWebPin();
  const response = await fetch(`${getBaseUrl()}/camera/capture`, {
    headers: storedPin ? { "X-Web-Pin": storedPin } : {},
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = tryParseJson(await response.text());
    const error = new Error(payload?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.blob();
}

export function controlPlaybackSubtitles(action) {
  if (isMockModeEnabled()) return Promise.resolve({ ok: true, queued: true });
  return request("/playback/subtitles", { method: "POST", body: JSON.stringify({ action }) });
}

export function volumeUp() {
  if (isMockModeEnabled()) {
    return Promise.resolve({ ok: true, mock: true });
  }

  return request("/volume/up", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function volumeDown() {
  if (isMockModeEnabled()) {
    return Promise.resolve({ ok: true, mock: true });
  }

  return request("/volume/down", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function stopPlayback() {
  if (isMockModeEnabled()) {
    mockPlayback = "";
    mockPlaybackDirectory = "";
    mockPlaybackFile = "";
    return Promise.resolve({ ok: true, mock: true });
  }

  return request("/stop", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function powerOffRaspberry() {
  if (isMockModeEnabled()) {
    mockPlayback = "";
    mockPlaybackDirectory = "";
    mockPlaybackFile = "";
    return Promise.resolve({ ok: true, mock: true, shuttingDown: true });
  }

  return request("/poweroff", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function gameSystemArtwork(systemId, file, reset = false) {
  const key = `minitv-system-art-${systemId}`;
  if (isMockModeEnabled()) {
    if (reset) localStorage.removeItem(key);
    if (file) {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
      });
      localStorage.setItem(key, data);
    }
    return { image: localStorage.getItem(key) || '' };
  }
  const body = new FormData();
  if (file) body.append('image', file);
  if (reset) body.append('reset', '1');
  const response = await fetch(`${getBaseUrl()}/games/systems/${encodeURIComponent(systemId)}/artwork`, {
    method: file || reset ? 'POST' : 'GET',
    headers: { 'X-Web-Pin': getStoredWebPin() },
    ...(file || reset ? { body } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not save image');
  if (result.image?.startsWith('/')) result.image = `${getBaseUrl()}${result.image}`;
  return result;
}

// TMDB requests go through the Raspberry's persistent cache in connected mode.
export function getCachedLibrarySummaries(language) {
  return requestWithTimeout(signal => request(`/tmdb/library?${new URLSearchParams({ language })}`, { signal }));
}

const localMetadataRequests = new Map();
export function clearLocalMetadataCache() { localMetadataRequests.clear(); }
export function prepareTmdbTitle(kind, id) {
  clearLocalMetadataCache();
  return request('/tmdb/prepare', { method: 'POST', body: JSON.stringify({ kind, id }) });
}

export function getCachedTmdbJson(path, { language, query = {}, importPreview = false } = {}) {
  const params = new URLSearchParams();
  if (language) params.set("language", language);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  const endpoint = `/tmdb/${importPreview ? "import/" : ""}json${path}?${params}`;
  const key = `${getBaseUrl()}:${getStoredWebPin()}:${endpoint}`;
  if (!localMetadataRequests.has(key)) {
    const started = Date.now();
    console.info(`[Datos locales] Leyendo ${path}`);
    localMetadataRequests.set(key, requestWithTimeout(signal => request(endpoint, { signal })).then(data => {
      console.info(`[Datos locales] Listo ${path}: ${Date.now() - started} ms`);
      return data;
    }).catch(error => {
      localMetadataRequests.delete(key);
      throw error;
    }));
  }
  return localMetadataRequests.get(key);
}

export function getTmdbCacheStatus(start = false) {
  if (isMockModeEnabled()) return Promise.reject(new Error("Conecta con la Raspberry para descargar el catálogo."));
  return requestWithTimeout(signal => request("/tmdb/cache", { ...(start ? { method: "POST" } : {}), signal }));
}

export function getOscarCatalog(language) {
  return requestWithTimeout(signal => request(`/oscars?${new URLSearchParams({ language })}`, { signal }));
}

export function prepareOscarCatalog() {
  return requestWithTimeout(signal => request('/oscars/prepare', { method: 'POST', signal }));
}

export function oscarImageUrl(path, width = 500) {
  if (!path) return '';
  return `${getBaseUrl()}/oscars/images${path}?${new URLSearchParams({ pin: getStoredWebPin(), width })}`;
}

export function getAwardCatalog(award, language) {
  return requestWithTimeout(signal => request(`/awards/${award}?${new URLSearchParams({ language })}`, { signal }));
}

export function prepareAwardCatalog(award) {
  return requestWithTimeout(signal => request(`/awards/${award}/prepare`, { method: 'POST', signal }));
}

export function awardImageUrl(award, path, width = 500) {
  if (!path) return '';
  return `${getBaseUrl()}/awards/${award}/images${path}?${new URLSearchParams({ pin: getStoredWebPin(), width })}`;
}

export function localTmdbImageUrl(value) {
  if (!value || isMockModeEnabled()) return value;
  const remote = String(value).match(/^https:\/\/image\.tmdb\.org\/t\/p\/[^/]+(\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp|svg))$/);
  const local = String(value).match(/\/tmdb\/images(\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp|svg))(?:\?.*)?$/);
  const path = remote?.[1] || local?.[1];
  if (!path) return value;
  const params = new URLSearchParams({ pin: getStoredWebPin() });
  const requestedWidth = String(value).match(/\/t\/p\/w(342|500|780|1280)\//)?.[1]
    || String(value).match(/[?&]width=(342|500|780|1280)(?:&|$)/)?.[1];
  if (requestedWidth) params.set("width", requestedWidth);
  return `${getBaseUrl()}/tmdb/images${path}?${params}`;
}

export function cancelTmdbCacheDownload() {
  return request("/tmdb/cache", { method: "DELETE" });
}

export function getSystemUpdate(signal) {
  if (isMockModeEnabled()) return Promise.resolve({ state: "unavailable" });
  return request("/system/update", { signal, cache: "no-store" });
}

export function startSystemUpdate(signal) {
  if (isMockModeEnabled()) return Promise.reject(new Error("Actualización no disponible en modo demo."));
  return request("/system/update", { method: "POST", signal });
}

const MOCK_USERS_KEY = "minitv-user-profiles-v1";
function mockUsers() {
  const raw = window.localStorage.getItem(MOCK_USERS_KEY);
  return raw ? JSON.parse(raw) : { users: [{ ...DEFAULT_USER }], states: {} };
}
function saveMockUsers(data) { window.localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(data)); }

export async function getUsers() {
  if (isMockModeEnabled()) return { users: mockUsers().users };
  return request("/users");
}
export async function createUser(data) {
  if (!isMockModeEnabled()) return request("/users", { method: "POST", body: JSON.stringify(data) });
  const store = mockUsers();
  const user = { ...data, id: crypto.randomUUID() };
  store.users.push(user); saveMockUsers(store);
  return { user };
}
export async function editUser(id, data) {
  if (!isMockModeEnabled()) return request(`/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) });
  const store = mockUsers();
  const user = { ...data, id };
  store.users = store.users.map(item => item.id === id ? user : item); saveMockUsers(store);
  return { user };
}
export async function deleteUser(id) {
  if (id === "default") throw new Error("El perfil default se conserva para iniciar la app.");
  if (!isMockModeEnabled()) return request(`/users/${encodeURIComponent(id)}`, { method: "DELETE" });
  const store = mockUsers();
  store.users = store.users.filter(item => item.id !== id); delete store.states[id]; saveMockUsers(store);
  return { ok: true };
}
export async function getUserState(id) {
  if (!isMockModeEnabled()) return request(`/users/${encodeURIComponent(id)}/state`);
  const store = mockUsers();
  if (!store.users.some(user => user.id === id)) throw Object.assign(new Error("El usuario ya no existe."), { status: 404 });
  return store.states[id] || { ...EMPTY_STATE };
}
export async function patchUserState(id, patch) {
  if (!isMockModeEnabled()) return request(`/users/${encodeURIComponent(id)}/state`, { method: "PATCH", body: JSON.stringify(patch), keepalive: true });
  const store = mockUsers();
  if (!store.users.some(user => user.id === id)) throw Object.assign(new Error("El usuario ya no existe."), { status: 404 });
  store.states[id] = mergeProfileState(store.states[id], patch); saveMockUsers(store);
  return { ok: true };
}

export function testServiceCredentials(provider, credentials) {
  if (isMockModeEnabled()) return Promise.reject(new Error("Demo mode"));
  return request(`/settings/services/${provider}/test`, { method: "POST", body: JSON.stringify(credentials) });
}
