import { PHOTO_ACCEPT, hasLocation } from './photoLibrary.js';

export const IMPORT_ACCEPT = `${PHOTO_ACCEPT},.json`;
export const MAX_SIDECAR_BYTES = 2 * 1024 * 1024;
export const isPhotoFile = file => PHOTO_ACCEPT.split(',').some(ext => file.name.toLowerCase().endsWith(ext));
// LAN/Tailscale deployments use HTTP, where crypto.randomUUID is unavailable.
export const createImportId = () => [...crypto.getRandomValues(new Uint8Array(16))].map(v => v.toString(16).padStart(2, '0')).join('');
const strings = value => [...new Set((Array.isArray(value) ? value : typeof value === 'string' ? [value] : [])
  .filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()))];
const text = value => typeof value === 'string' ? value : '';

function parsePhotoMetadata(content) {
  try { return JSON.parse(content); }
  catch {
    // Older OSXPhotos exports can include Python's non-finite numbers in
    // media_analysis. Treat these as missing values, leaving quoted text intact.
    // JSON.parse still rejects any other malformed content.
    return JSON.parse(content.replace(/"(?:[^"\\]|\\.)*"|\bNaN\b|-?Infinity\b/g,
      token => token.startsWith('"') ? token : 'null'));
  }
}

// Accept the full OSXPhotos dump and its ExifTool JSON sidecars. Never confuse
// keywords (which may contain names) with explicit person associations.
export function normalizePhotoMetadata(raw) {
  const data = Array.isArray(raw) && raw.length === 1 ? raw[0] : raw;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid photo metadata');
  const tag = (...names) => names.map(n => data[n]).find(v => v !== undefined && v !== null);
  const location = Array.isArray(data.location) ? data.location : [];
  const coordinate = (value, ref, max) => {
    if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) return null;
    const n = Number(value), signed = /^(S|W)$/i.test(ref || '') ? -Math.abs(n) : n;
    return Number.isFinite(signed) && Math.abs(signed) <= max ? signed : null;
  };
  let latitude = coordinate(tag('EXIF:GPSLatitude', 'GPSLatitude') ?? location[0], tag('EXIF:GPSLatitudeRef', 'GPSLatitudeRef'), 90);
  let longitude = coordinate(tag('EXIF:GPSLongitude', 'GPSLongitude') ?? location[1], tag('EXIF:GPSLongitudeRef', 'GPSLongitudeRef'), 180);
  if (latitude === null || longitude === null) latitude = longitude = null;
  let takenAt = text(tag('date', 'EXIF:DateTimeOriginal', 'DateTimeOriginal', 'XMP:CreateDate', 'CreateDate'))
    .replace(/^(\d{4}):(\d{2}):(\d{2}) /, '$1-$2-$3T');
  const offset = text(tag('EXIF:OffsetTimeOriginal', 'OffsetTimeOriginal'));
  if (/^[+-]\d{2}:\d{2}$/.test(offset) && !/(Z|[+-]\d{2}:\d{2})$/.test(takenAt)) takenAt += offset;
  if (!takenAt || !/^\d{4}-\d{2}-\d{2}[T ]/.test(takenAt) || Number.isNaN(Date.parse(takenAt))) takenAt = null;
  const peopleInfo = Array.isArray(data.person_info) ? data.person_info : [];
  const people = peopleInfo.filter(p => p && typeof p.name === 'string' && p.name && p.name !== '_UNKNOWN_PERSON')
    .map(p => ({ id: text(p.uuid), name: p.name }));
  for (const name of strings(tag('persons', 'XMP:PersonInImage', 'PersonInImage'))) {
    if (name !== '_UNKNOWN_PERSON' && !people.some(p => p.name === name)) people.push({ id: '', name });
  }
  return { title: text(tag('title', 'XMP:Title', 'Title', 'IPTC:ObjectName')),
    description: text(tag('description', 'XMP:Description', 'Description', 'IPTC:Caption-Abstract')),
    appleId: text(data.uuid), takenAt, latitude, longitude, people,
    albums: strings(data.albums), keywords: strings(tag('keywords', 'IPTC:Keywords', 'XMP:TagsList', 'Keywords', 'XMP:Subject')),
    appleFavorite: data.favorite === true || Number(tag('XMP:Rating', 'Rating')) === 5,
    // Explicitly removed location in the library must override original EXIF.
    locationKnown: (Array.isArray(data.location) && data.location.length === 2 && data.location.every(v => v === null)) || latitude !== null,
  };
}

export async function preparePhotoImport(files, { onProgress, signal, geolocatedOnly = false } = {}) {
  const checkCancelled = () => { if (signal?.aborted) throw new DOMException('Import cancelled', 'AbortError'); };
  const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));
  checkCancelled();
  if (onProgress) {
    onProgress({ phase: 'indexing', done: 0, total: null, fileName: '' });
    await yieldToBrowser();
    checkCancelled();
  }
  const path = file => (file.importPath || file.webkitRelativePath || file.name).normalize('NFC');
  const visible = [...files].filter(f => !path(f).split('/').some(p => p.startsWith('.')));
  if (visible.some(f => path(f).split('/').some(p => p.endsWith('.photoslibrary')))) throw new Error('libraryPackage');
  const photos = visible.filter(isPhotoFile);
  const sidecars = new Map();
  for (const file of visible.filter(f => /\.json$/i.test(f.name))) {
    const key = path(file).toLocaleLowerCase();
    if (sidecars.has(key)) throw new Error('ambiguousSidecar');
    sidecars.set(key, file);
  }
  const stems = new Map();
  for (const file of photos) {
    const stem = path(file).replace(/\.[^.]+$/, '').toLocaleLowerCase();
    stems.set(stem, (stems.get(stem) || 0) + 1);
  }
  const entries = [], warnings = [], used = new Set();
  let reviewed = 0, withoutLocation = 0;
  let lastReport = performance.now();
  if (onProgress) {
    onProgress({ phase: 'reading', done: 0, total: photos.length, fileName: photos[0]?.name || '' });
    await yieldToBrowser();
  }
  for (const file of photos) {
    checkCancelled();
    const key = path(file).toLocaleLowerCase(), stem = key.replace(/\.[^.]+$/, '');
    const sidecar = sidecars.get(`${key}.minitv.json`) || sidecars.get(`${key}.json`) ||
      (stems.get(stem) === 1 ? sidecars.get(`${stem}.json`) : null);
    let metadata = null, raw = null;
    if (sidecar) {
      used.add(sidecar);
      if (sidecar.size > MAX_SIDECAR_BYTES) throw new Error(`sidecarTooLarge:${sidecar.name}`);
      try { raw = parsePhotoMetadata(await sidecar.text()); metadata = normalizePhotoMetadata(raw); }
      catch { throw new Error(`invalidSidecar:${sidecar.name}`); }
    }
    checkCancelled();
    if (geolocatedOnly && !hasLocation(metadata || {})) withoutLocation++;
    else {
      if (file.size > 50 * 1024 * 1024) throw new Error(`photoTooLarge:${file.name}`);
      entries.push({ file, metadata, raw });
    }
    reviewed++;
    if (onProgress && (performance.now() - lastReport >= 100 || reviewed === photos.length)) {
      onProgress({ phase: 'reading', done: reviewed, total: photos.length, fileName: file.name });
      lastReport = performance.now();
      // Let React paint even when the selection has no asynchronous sidecars.
      await yieldToBrowser();
    }
  }
  checkCancelled();
  const ignored = visible.filter(f => !isPhotoFile(f) && !used.has(f) && !/\.json$/i.test(f.name));
  if (ignored.length) warnings.push({ type: 'ignored', count: ignored.length, names: ignored.slice(0, 4).map(f => f.name) });
  const unmatched = [...sidecars.values()].filter(f => !used.has(f));
  if (unmatched.length) warnings.push({ type: 'unmatched', count: unmatched.length });
  return { entries, warnings, geolocatedOnly, withoutLocation, reviewed };
}

export function importSummary(entries) {
  return { count: entries.length, bytes: entries.reduce((n, e) => n + e.file.size, 0),
    locations: entries.filter(e => e.metadata?.latitude != null).length,
    people: new Set(entries.flatMap(e => e.metadata?.people.map(p => p.id || p.name) || [])).size,
    albums: new Set(entries.flatMap(e => e.metadata?.albums || [])).size,
    enriched: entries.filter(e => e.metadata).length };
}

export function importBatches(entries) {
  const batches = []; let batch = [], bytes = 0;
  for (const entry of entries) {
    if (batch.length && (batch.length >= 20 || bytes + entry.file.size > 80 * 1024 * 1024)) {
      batches.push(batch); batch = []; bytes = 0;
    }
    batch.push(entry); bytes += entry.file.size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export function accumulateImportResult(current, response, batch) {
  const rejected = (response.rejected || []).map(failure => ({ ...failure, entry: batch[failure.index] }));
  return { folderId: response.folderId, imported: current.imported + (response.imported ?? batch.length - rejected.length),
    duplicates: current.duplicates + (response.duplicates || 0), rejected: [...current.rejected, ...rejected] };
}
