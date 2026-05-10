const STORAGE_PREFIX = "minitv-web-media-library-v1";

function getStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function normalizeCollectionType(collectionType) {
  return String(collectionType || "").trim().toLowerCase() || "series";
}

function getStorageKey(collectionType) {
  return `${STORAGE_PREFIX}:${normalizeCollectionType(collectionType)}`;
}

function normalizeItem(item) {
  if (!item || typeof item !== "object") return null;

  const id = Number(item.id) || 0;
  if (!id) return null;

  const name = String(item.name || "").trim();
  if (!name) return null;

  const fileRelativePath = String(item.fileRelativePath || item.relativePath || "").trim();
  const fileName = String(item.fileName || item.file || "").trim();

  return {
    id,
    name,
    ...(fileRelativePath ? { fileRelativePath } : {}),
    ...(fileName ? { fileName } : {}),
  };
}

export function loadMediaLibrary(collectionType) {
  try {
    const storage = getStorage();
    if (!storage) return [];

    const raw = storage.getItem(getStorageKey(collectionType));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];

    return parsed.map(normalizeItem).filter(Boolean);
  } catch (_error) {
    return [];
  }
}

export function saveMediaLibrary(collectionType, items) {
  const safeItems = Array.isArray(items) ? items.map(normalizeItem).filter(Boolean) : [];
  const storage = getStorage();

  if (storage) {
    storage.setItem(getStorageKey(collectionType), JSON.stringify(safeItems));
  }

  return safeItems;
}

export function upsertMediaLibraryItem(collectionType, item) {
  const normalized = normalizeItem(item);
  if (!normalized) {
    return loadMediaLibrary(collectionType);
  }

  const current = loadMediaLibrary(collectionType);
  const existingIndex = current.findIndex((entry) => Number(entry.id) === normalized.id);

  if (existingIndex >= 0) {
    const next = [...current];
    next[existingIndex] = normalized;
    return saveMediaLibrary(collectionType, next);
  }

  return saveMediaLibrary(collectionType, [...current, normalized]);
}

export function removeMediaLibraryItem(collectionType, itemId) {
  const safeId = Number(itemId) || 0;
  if (!safeId) {
    return loadMediaLibrary(collectionType);
  }

  const current = loadMediaLibrary(collectionType);
  return saveMediaLibrary(
    collectionType,
    current.filter((entry) => Number(entry.id) !== safeId)
  );
}
