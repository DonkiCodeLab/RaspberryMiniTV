import { sortPhotoPeople } from './photoPeopleSort.js';

export const SPECIAL_FOLDERS = ['gallery', 'map', 'people', 'albums', 'ai'];
export const PHOTO_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,.heic,.heif';
export const STYLES = { lego: 'LEGO', foam: 'Gomaespuma', minecraft: 'Minecraft', ghibli: 'Studio Ghibli' };
export const PHOTO_PAGE_SIZE = 100;
export const UNKNOWN_PERSON_ID = 'unknown';

export function isNewPhotoPerson(person) {
  return !!person?.id && person.id !== UNKNOWN_PERSON_ID && !person.id.startsWith('apple-') && !person.appleKey &&
    typeof person.name === 'string' && /^(?:persona|person)\s+\d+$/i.test(person.name.trim());
}

// Detector-generated labels are groups awaiting a name, not identified people.
export function isIdentifiedPhotoPerson(person) {
  return !!person?.id && !person.id.startsWith('apple-') && !person.appleKey &&
    (person.id === UNKNOWN_PERSON_ID || (typeof person.name === 'string' && !!person.name.trim() &&
      !/^(?:persona|person)\s+\d+$/i.test(person.name.trim())));
}

export function photoAssignmentOptions(people, s) {
  return photoPeopleOptions(people.filter(isIdentifiedPhotoPerson), s);
}

// Draft identities only exist in the browser. Submit their name so the batch
// resolves every occurrence to the same real person inside its transaction.
export function photoAssignmentValue(people, personId) {
  const person = people.find(person => person.id === personId);
  return person?.draftName ? { name: person.draftName } : { personId };
}

export function photoAssignmentLabel(person, s) {
  return person.draftName ? s.reviewDraftPerson.replace('{name}', person.name) : person.name;
}

export function photoPersonName(person, s) {
  return (person.personId ?? person.id) === UNKNOWN_PERSON_ID ? s.unknownPerson : person.name;
}

export function photoPeopleOptions(people, s) {
  const unknown = people.find(person => person.id === UNKNOWN_PERSON_ID) || { id: UNKNOWN_PERSON_ID, photoIds: [] };
  return [{ ...unknown, name: s.unknownPerson }, ...sortPhotoPeople(people.filter(person => person.id !== UNKNOWN_PERSON_ID))];
}

export function photoDeleteRequest(ids, scope, folderId, personId) {
  if (scope === 'person' && personId) return { path: `people/${personId}/remove`, payload: { ids } };
  if (scope === 'gallery' || scope === 'album') return {
    path: 'photos/delete', payload: { ids, scope, ...(scope === 'album' ? { folderId } : {}) },
  };
  throw new Error('Invalid photo deletion scope');
}

export function photosWithoutPeople(photos) {
  return photos.filter(photo => !photo.sourceId && photo.faceState === 'done' && photo.faceCount === 0);
}

export function sortPhotos(photos, field = 'takenAt', direction = 'desc') {
  const time = photo => {
    const value = photo[field];
    return value == null || value === '' ? NaN : typeof value === 'number' ? value * 1000 : Date.parse(value);
  };
  const dated = photos.map(photo => ({ photo, time: time(photo) }));
  dated.sort((a, b) => {
    const validA = Number.isFinite(a.time), validB = Number.isFinite(b.time);
    if (validA !== validB) return validA ? -1 : 1;
    const order = validA ? (a.time - b.time) * (direction === 'asc' ? 1 : -1) : 0;
    return order || String(a.photo.name).localeCompare(String(b.photo.name), undefined, { numeric: true }) || String(a.photo.id).localeCompare(String(b.photo.id));
  });
  return dated.map(entry => entry.photo);
}

export function photoPage(items, requested = 1) {
  const pages = Math.max(1, Math.ceil(items.length / PHOTO_PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.trunc(requested) || 1));
  const offset = (page - 1) * PHOTO_PAGE_SIZE;
  return { items: items.slice(offset, offset + PHOTO_PAGE_SIZE), page, pages, offset, total: items.length };
}

// Build associations once per catalogue update, rather than searching every
// person's photo list for every photo and every render.
export function indexPhotos(photos, people) {
  const byId = new Map(photos.map(photo => [photo.id, photo]));
  const byPerson = new Map(), namesByPhoto = new Map(), byFolder = new Map();
  for (const person of people) {
    const ids = new Set(person.photoIds);
    byPerson.set(person.id, [...ids].map(id => byId.get(id)).filter(Boolean));
    for (const id of ids) {
      if (!namesByPhoto.has(id)) namesByPhoto.set(id, []);
      namesByPhoto.get(id).push(person.name);
    }
  }
  for (const photo of photos) for (const id of new Set([photo.folderId, ...(photo.folderIds || [])])) {
    if (!byFolder.has(id)) byFolder.set(id, []);
    byFolder.get(id).push(photo);
  }
  return { byId, byPerson, namesByPhoto, byFolder };
}

export function descendantIds(folders, id) {
  const found = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) if (found.has(folder.parent) && !found.has(folder.id)) { found.add(folder.id); changed = true; }
  }
  return found;
}

export function folderTrail(folders, id) {
  const result = [], visited = new Set();
  while (id && !visited.has(id)) {
    visited.add(id);
    const folder = folders.find(item => item.id === id);
    if (!folder) break;
    result.unshift(folder); id = folder.parent;
  }
  return result;
}

export function hasLocation(photo) {
  return Number.isFinite(photo.latitude) && Number.isFinite(photo.longitude) && Math.abs(photo.latitude) <= 90 && Math.abs(photo.longitude) <= 180;
}

// Web Mercator screen-space clustering, including neighbors across the date line.
export function clusterPhotos(photos, zoom, radius = 76) {
  const world = 256 * 2 ** zoom;
  const buckets = new Map(), clusters = [];
  const columns = Math.ceil(world / radius);
  const key = (x, y) => `${((x % columns) + columns) % columns}:${y}`;
  for (const photo of photos.filter(hasLocation)) {
    const lat = Math.max(-85.0511, Math.min(85.0511, photo.latitude)) * Math.PI / 180;
    const x = ((photo.longitude + 180) / 360 * world) % world;
    const y = (1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2 * world;
    const bx = Math.floor(x / radius), by = Math.floor(y / radius);
    let match;
    for (let dx = -1; dx <= 1 && !match; dx++) for (let dy = -1; dy <= 1 && !match; dy++) {
      match = (buckets.get(key(bx + dx, by + dy)) || []).find(cluster => {
        const horizontal = Math.min(Math.abs(cluster.x - x), world - Math.abs(cluster.x - x));
        return Math.hypot(horizontal, cluster.y - y) <= radius;
      });
    }
    if (match) match.photos.push(photo);
    else {
      const cluster = { x, y, latitude: photo.latitude, longitude: photo.longitude, photos: [photo] };
      clusters.push(cluster);
      const bucket = key(bx, by);
      buckets.set(bucket, [...(buckets.get(bucket) || []), cluster]);
    }
  }
  return clusters;
}

export function visibleMapClusters(photos, zoom, bounds, limit = 100) {
  const visible = photos.filter(photo => {
    if (!hasLocation(photo)) return false;
    const { south, north, west, east } = bounds;
    if (photo.latitude < south || photo.latitude > north) return false;
    if (east - west >= 360) return true;
    const offset = ((photo.longitude - west) % 360 + 360) % 360;
    return offset <= ((east - west) % 360 + 360) % 360;
  });
  // Keep every visible photo represented, coalescing groups at dense zooms.
  let clusters = clusterPhotos(visible, zoom);
  while (clusters.length > limit) clusters = clusterPhotos(visible, --zoom);
  return clusters;
}

export function pendingVariants(photos) {
  const existing = new Set(photos.filter(p => p.sourceId).map(p => `${p.sourceId}:${p.style}`));
  return photos.filter(p => !p.sourceId).reduce((total, photo) => total + Object.keys(STYLES).filter(style => !existing.has(`${photo.id}:${style}`)).length, 0);
}
