const STORAGE_KEY = "simpsonstv-web-series-profiles-v1";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeHeroImageCrop(crop) {
  if (!crop || typeof crop !== "object") return null;

  return {
    focusX: clamp(Number(crop.focusX) || 0.5, 0, 1),
    focusY: clamp(Number(crop.focusY) || 0.5, 0, 1),
    zoom: clamp(Number(crop.zoom) || 1, 1, 3),
  };
}

function getStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function loadSeriesProfiles() {
  try {
    const storage = getStorage();
    if (!storage) return {};

    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_error) {
    return {};
  }
}

export function saveSeriesProfiles(profiles) {
  const safeProfiles = profiles && typeof profiles === "object" ? profiles : {};
  const storage = getStorage();

  if (storage) {
    storage.setItem(STORAGE_KEY, JSON.stringify(safeProfiles));
  }

  return safeProfiles;
}

export function updateSeriesProfile(seriesKey, updates = {}) {
  const key = String(seriesKey || "").trim();
  if (!key) {
    return loadSeriesProfiles();
  }

  const current = loadSeriesProfiles();
  const currentEntry = current[key] && typeof current[key] === "object" ? current[key] : {};

  return saveSeriesProfiles({
    ...current,
    [key]: {
      ...currentEntry,
      name: String(updates?.name || "").trim() || currentEntry.name || "",
      heroImage: String(updates?.heroImage || "").trim() || currentEntry.heroImage || "",
      heroImageCrop:
        normalizeHeroImageCrop(updates?.heroImageCrop) ||
        normalizeHeroImageCrop(currentEntry.heroImageCrop),
    },
  });
}

export function removeSeriesProfile(seriesKey) {
  const key = String(seriesKey || "").trim();
  if (!key) {
    return loadSeriesProfiles();
  }

  const current = loadSeriesProfiles();
  if (!Object.prototype.hasOwnProperty.call(current, key)) {
    return current;
  }

  const next = { ...current };
  delete next[key];
  return saveSeriesProfiles(next);
}
