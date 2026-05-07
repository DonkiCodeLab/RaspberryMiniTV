const configuredBaseUrl = (import.meta.env.VITE_RASPBERRY_API_BASE_URL || "").trim();
const WEB_PIN_STORAGE_KEY = "simpsonstv-web-pin";
const MOCK_SERIES_LIBRARY_STORAGE_KEY = "simpsonstv-web-mock-series-library-v1";
const MOCK_HIDDEN_SERIES_STORAGE_KEY = "simpsonstv-web-mock-hidden-series-v1";
const explicitMockMode = (import.meta.env.VITE_WEB_DEV_MODE || "").trim().toLowerCase() === "mock";
const localhostHosts = new Set(["localhost", "127.0.0.1"]);
const SUPPORTED_RASPBERRY_LANGUAGES = new Set(["es", "ca", "en"]);

let mockPlayback = "";
let mockPlaybackDirectory = "";
let mockPlaybackFile = "";
let mockLanguage = "es";

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
      name: "The Simpsons",
      relativePath: "TVShows/the-simpsons",
      tmdbId: 456,
      videoCount: episodeIds.length,
      episodeCount: episodeIds.length,
      episodeIds,
      videos: episodeIds.map((id) => ({
        id,
        file: `${id}.mp4`,
        relativePath: `TVShows/the-simpsons/${id}.mp4`,
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
      videoCount: 0,
      episodeCount: 0,
      episodeIds: [],
      videos: [],
    });
  });

  return {
    ok: true,
    root: "/mock/MultimediaContent/Videos",
    moviesRoot: "/mock/MultimediaContent/Videos/Movies",
    tvShowsRoot: "/mock/MultimediaContent/Videos/TVShows",
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
  const response = await fetch(`${getBaseUrl()}${path}`, {
    headers: {
      "Content-Type": "application/json",
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
      },
      playing: mockPlayback || null,
      directory: mockPlaybackDirectory || "",
      file: mockPlaybackFile || null,
      running: Boolean(mockPlayback),
      mock: true,
    });
  }

  return request("/health");
}

export function getVideos() {
  if (isMockModeEnabled()) {
    return Promise.resolve(buildMockVideoLibrary());
  }

  return request("/videos");
}

export function getRaspberryLanguage() {
  if (isMockModeEnabled()) {
    return Promise.resolve({ ok: true, language: mockLanguage, mock: true });
  }

  return request("/settings/language");
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

export function uploadMovieFile({ file, movie, onProgress } = {}) {
  if (!file) {
    return Promise.reject(new Error("Missing file"));
  }

  const movieName = String(movie?.name || "").trim();
  const tmdbId = Number(movie?.id || movie?.tmdbId) || 0;

  if (isMockModeEnabled()) {
    const relativePath = `Movies/${String(file.name || `${movieName || "movie"}.mp4`).trim()}`;
    if (typeof onProgress === "function") {
      onProgress(100);
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
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", movieName);
    formData.append("tmdbId", String(tmdbId));

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${getBaseUrl()}/movies/upload`);

    const storedPin = getStoredWebPin();
    if (storedPin) {
      xhr.setRequestHeader("X-Web-Pin", storedPin);
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || typeof onProgress !== "function") return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
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

    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(formData);
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

export function saveMediaProfile({ collection, relativePath, name, tmdbId, file, heroImage, heroImageCrop }) {
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

export function playEpisode({ id, directory }) {
  if (isMockModeEnabled()) {
    mockPlayback = id;
    mockPlaybackDirectory = directory || "";
    mockPlaybackFile = `${directory || ""}${directory ? "/" : ""}${id}.mp4`;
    return Promise.resolve({
      ok: true,
      playing: id,
      directory: mockPlaybackDirectory,
      file: mockPlaybackFile,
      mock: true,
    });
  }

  return request("/play", {
    method: "POST",
    body: JSON.stringify({
      id,
      directory,
    }),
  });
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
