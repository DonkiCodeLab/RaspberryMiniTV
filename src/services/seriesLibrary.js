import AsyncStorage from "@react-native-async-storage/async-storage";

import { getAvailableSeries } from "./tmdbApi";

const STORAGE_KEY = "series_library_v1";
const EPISODE_ID_RE = /^S\d{2}E\d{2,3}$/i;

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeEpisodeIds(episodeIds) {
  const unique = new Set();

  return (Array.isArray(episodeIds) ? episodeIds : [])
    .map((episodeId) => String(episodeId || "").trim().toUpperCase())
    .filter((episodeId) => EPISODE_ID_RE.test(episodeId))
    .filter((episodeId) => {
      if (unique.has(episodeId)) return false;
      unique.add(episodeId);
      return true;
    })
    .sort();
}

function normalizeRaspberrySync(sync) {
  if (!sync || typeof sync !== "object") return null;

  const directoryName = String(sync?.directoryName || "").trim();
  const directoryPath = String(sync?.directoryPath || "").trim();
  const episodeIds = normalizeEpisodeIds(sync?.episodeIds);
  const syncedAt = String(sync?.syncedAt || "").trim();

  if (!directoryName || !directoryPath) return null;

  return {
    directoryName,
    directoryPath,
    episodeIds,
    syncedAt: syncedAt || new Date().toISOString(),
  };
}

function normalizeSeries(series, index = 0) {
  const id = Number(series?.id);
  const baseKey =
    slugify(series?.key) ||
    slugify(series?.name) ||
    (Number.isFinite(id) ? `series-${id}` : `series-${index + 1}`);

  return {
    key: baseKey,
    id: Number.isFinite(id) ? id : null,
    name: String(series?.name || "").trim() || `Series ${index + 1}`,
    searchQuery: String(series?.searchQuery || "").trim() || undefined,
    selectedImage: String(series?.selectedImage || "").trim() || null,
    selectedImageCrop:
      series?.selectedImageCrop && typeof series.selectedImageCrop === "object"
        ? {
            focusX: Number(series.selectedImageCrop.focusX) || 0.5,
            focusY: Number(series.selectedImageCrop.focusY) || 0.5,
            zoom: Number(series.selectedImageCrop.zoom) || 1,
          }
        : null,
    raspberrySync: normalizeRaspberrySync(series?.raspberrySync),
  };
}

function dedupeSeries(seriesList) {
  const usedKeys = new Set();
  const usedIds = new Set();

  return seriesList.reduce((acc, series, index) => {
    const normalized = normalizeSeries(series, index);
    const idKey = normalized.id ? String(normalized.id) : null;

    if (idKey && usedIds.has(idKey)) return acc;

    let nextKey = normalized.key;
    let suffix = 2;
    while (usedKeys.has(nextKey)) {
      nextKey = `${normalized.key}-${suffix}`;
      suffix += 1;
    }

    usedKeys.add(nextKey);
    if (idKey) usedIds.add(idKey);
    acc.push({ ...normalized, key: nextKey });
    return acc;
  }, []);
}

function isLegacySeedLibrary(seriesList) {
  if (!Array.isArray(seriesList)) return false;

  const normalizedStored = dedupeSeries(seriesList);
  const normalizedFallback = dedupeSeries(getAvailableSeries());

  if (
    !normalizedStored.length ||
    normalizedStored.length !== normalizedFallback.length
  ) {
    return false;
  }

  return normalizedStored.every((series, index) => {
    const fallbackSeries = normalizedFallback[index];

    return (
      series.key === fallbackSeries.key &&
      Number(series.id) === Number(fallbackSeries.id) &&
      series.name === fallbackSeries.name &&
      !series.selectedImage &&
      !series.selectedImageCrop &&
      !series.raspberrySync
    );
  });
}

export async function loadSeriesLibrary() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw == null) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    if (isLegacySeedLibrary(parsed)) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      return [];
    }
    return dedupeSeries(parsed);
  } catch (_err) {
    return [];
  }
}

export async function saveSeriesLibrary(seriesList) {
  const normalized = dedupeSeries(Array.isArray(seriesList) ? seriesList : []);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function addSeriesToLibrary(series) {
  const current = await loadSeriesLibrary();
  const next = dedupeSeries([...current, series]);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function renameSeriesInLibrary(seriesKey, nextName) {
  const trimmedName = String(nextName || "").trim();
  if (!trimmedName) {
    throw new Error("Series name is required.");
  }

  const current = await loadSeriesLibrary();
  const next = current.map((series) =>
    series.key === seriesKey ? { ...series, name: trimmedName } : series
  );
  return saveSeriesLibrary(next);
}

export async function updateSeriesInLibrary(seriesKey, updates = {}) {
  const current = await loadSeriesLibrary();
  const next = current.map((series) => {
    if (series.key !== seriesKey) return series;

    const nextName = String(updates?.name ?? series?.name ?? "").trim();
    const nextSelectedImage = String(updates?.selectedImage ?? series?.selectedImage ?? "").trim();
    const nextSelectedImageCrop =
      updates?.selectedImageCrop && typeof updates.selectedImageCrop === "object"
        ? updates.selectedImageCrop
        : series?.selectedImageCrop || null;

    if (!nextName) {
      throw new Error("Series name is required.");
    }

    return {
      ...series,
      ...updates,
      name: nextName,
      selectedImage: nextSelectedImage || null,
      selectedImageCrop: nextSelectedImageCrop,
    };
  });

  return saveSeriesLibrary(next);
}

export async function removeSeriesFromLibrary(seriesKey) {
  const current = await loadSeriesLibrary();
  const next = current.filter((series) => series.key !== seriesKey);
  return saveSeriesLibrary(next);
}

export async function mergeSeriesIntoLibrary(seriesList) {
  const current = await loadSeriesLibrary();
  const next = [...current];

  (Array.isArray(seriesList) ? seriesList : []).forEach((series, index) => {
    const normalized = normalizeSeries(series, index);

    const existingIndex = next.findIndex((item) => {
      if (normalized.id && item.id && Number(item.id) === Number(normalized.id)) {
        return true;
      }

      return item.key === normalized.key;
    });

    if (existingIndex >= 0) {
      const existing = next[existingIndex];
      next[existingIndex] = {
        ...existing,
        ...normalized,
        key: existing.key || normalized.key,
        searchQuery: normalized.searchQuery || existing.searchQuery,
        raspberrySync: normalized.raspberrySync || existing.raspberrySync || null,
      };
      return;
    }

    next.push(normalized);
  });

  return saveSeriesLibrary(next);
}
