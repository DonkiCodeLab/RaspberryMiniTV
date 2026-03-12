import AsyncStorage from "@react-native-async-storage/async-storage";

import { getAvailableSeries } from "./tmdbApi";

const STORAGE_KEY = "series_library_v1";

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

export async function loadSeriesLibrary() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw == null) {
      return dedupeSeries(getAvailableSeries());
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return dedupeSeries(parsed);
  } catch (_err) {
    return dedupeSeries(getAvailableSeries());
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

export async function removeSeriesFromLibrary(seriesKey) {
  const current = await loadSeriesLibrary();
  const next = current.filter((series) => series.key !== seriesKey);
  return saveSeriesLibrary(next);
}
