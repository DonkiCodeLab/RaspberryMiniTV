const configuredBaseUrl = (import.meta.env.VITE_RASPBERRY_API_BASE_URL || "").trim();
const WEB_PIN_STORAGE_KEY = "simpsonstv-web-pin";
const MOCK_SERIES_LIBRARY_STORAGE_KEY = "simpsonstv-web-mock-series-library-v1";
const explicitMockMode = (import.meta.env.VITE_WEB_DEV_MODE || "").trim().toLowerCase() === "mock";
const localhostHosts = new Set(["localhost", "127.0.0.1"]);

let mockPlayback = "";
let mockPlaybackDirectory = "";
let mockPlaybackFile = "";

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
  const customSeriesByLabel = new Map(
    customSeries.map((series) => [normalizeLabel(series.name), series])
  );
  const directories = [
    {
      name: "The Simpsons",
      relativePath: "the-simpsons",
      tmdbId: 456,
      videoCount: episodeIds.length,
      episodeCount: episodeIds.length,
      episodeIds,
      videos: episodeIds.map((id) => ({
        id,
        file: `${id}.mp4`,
        relativePath: `the-simpsons/${id}.mp4`,
      })),
    },
  ];

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
    root: "/mock/videos",
    directories: directories.sort((a, b) => a.name.localeCompare(b.name)),
    rootFiles: [],
  };
}

function normalizeLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
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
  let candidate = baseSlug;
  let index = 2;

  while (existingPaths.has(candidate)) {
    candidate = `${baseSlug}-${index}`;
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

export function addSeries({ name, tmdbId }) {
  const safeName = String(name || "").trim();
  const safeTmdbId = Number(tmdbId) || 0;

  if (isMockModeEnabled()) {
    const current = loadMockSeriesLibrary();
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
    const nextItems = current.filter((entry) => entry.relativePath !== safeRelativePath);
    saveMockSeriesLibrary(nextItems);
    return Promise.resolve({ ok: true, items: nextItems, relativePath: safeRelativePath });
  }

  return request(`/series?relativePath=${encodeURIComponent(safeRelativePath)}`, {
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
