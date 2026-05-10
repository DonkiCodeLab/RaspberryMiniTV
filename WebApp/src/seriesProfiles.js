const STORAGE_PREFIX = "minitv-web-media-profiles-v1";

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

function getStorageKey(collectionType = "series") {
  return `${STORAGE_PREFIX}:${String(collectionType || "series").trim().toLowerCase()}`;
}

export function loadSeriesProfiles(collectionType = "series") {
  try {
    const storage = getStorage();
    if (!storage) return {};

    const raw = storage.getItem(getStorageKey(collectionType));
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_error) {
    return {};
  }
}

export function saveSeriesProfiles(profiles, collectionType = "series") {
  const safeProfiles = profiles && typeof profiles === "object" ? profiles : {};
  const storage = getStorage();

  if (storage) {
    storage.setItem(getStorageKey(collectionType), JSON.stringify(safeProfiles));
  }

  return safeProfiles;
}

export function updateSeriesProfile(seriesKey, updates = {}, collectionType = "series") {
  const key = String(seriesKey || "").trim();
  if (!key) {
    return loadSeriesProfiles(collectionType);
  }

  const current = loadSeriesProfiles(collectionType);
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
  }, collectionType);
}

export function removeSeriesProfile(seriesKey, collectionType = "series") {
  const key = String(seriesKey || "").trim();
  if (!key) {
    return loadSeriesProfiles(collectionType);
  }

  const current = loadSeriesProfiles(collectionType);
  if (!Object.prototype.hasOwnProperty.call(current, key)) {
    return current;
  }

  const next = { ...current };
  delete next[key];
  return saveSeriesProfiles(next, collectionType);
}
