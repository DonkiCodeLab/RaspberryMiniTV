import { descendantIds, folderTrail, hasLocation } from '../photoLibrary.js';
import { hashPhoto } from '../photoHash.js';
// Local demo albums persist in IndexedDB, including image blobs, without network uploads.
const urls = new Map();
let operation = Promise.resolve();
const initial = () => ({ galleryVersion: 1, folders: [{ id: 'gallery', name: 'Galería', parent: '', created: Date.now() / 1000 },
  { id: 'albums', name: 'Álbumes personales', parent: '', created: Date.now() / 1000 },
  { id: 'ai', name: 'Diviértete con la IA', parent: '', created: Date.now() / 1000 }], photos: [], people: [], jobs: [],
  faces: { available: false, pending: 0, running: false }, aiReady: false, demo: true });
const open = () => new Promise((resolve, reject) => {
  const request = indexedDB.open('minitv-photo-demo-v1', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('library');
  request.onerror = () => reject(new Error('No se puede abrir la biblioteca local.'));
  request.onsuccess = () => resolve(request.result);
});
export const demoPhotoUrl = path => urls.get(path) || '';
export function migratePhotoDemo(library) {
  if (library.galleryVersion === 1) return false;
  const removed = new Set([...descendantIds(library.folders, 'uploads'), ...descendantIds(library.folders, 'gallery')]);
  removed.delete('gallery');
  library.folders = library.folders.filter(folder => !removed.has(folder.id));
  for (const root of initial().folders) if (!library.folders.some(folder => folder.id === root.id)) library.folders.push(root);
  for (const folder of library.folders) if (!folder.parent && !['gallery', 'albums', 'ai'].includes(folder.id)) folder.parent = 'albums';
  for (const photo of library.photos) {
    photo.folderIds = [...new Set([photo.folderId, ...(photo.folderIds || [])])].filter(id => id && id !== 'gallery' && !removed.has(id));
    photo.folderId = 'gallery';
  }
  for (const [key, folder] of Object.entries(library.importSessions || {})) if (removed.has(folder)) library.importSessions[key] = 'gallery';
  for (const result of Object.values(library.importBatches || {})) if (removed.has(result.folderId)) result.folderId = 'gallery';
  library.galleryVersion = 1;
  return true;
}
export function photoDemo(action, data = {}) {
  const run = async () => {
    const db = await open();
    try {
      const library = await new Promise((resolve, reject) => {
        const query = db.transaction('library').objectStore('library').get('data');
        query.onsuccess = () => resolve(query.result || initial()); query.onerror = () => reject(query.error);
      });
      const migrated = migratePhotoDemo(library);
      library.revision ||= 'demo-empty'; library.working = false;
      if (action === 'status') return { revision: library.revision, working: false };
      if (action === 'import/check') return { missing: data.digests.flatMap((digest, index) =>
        library.photos.some(photo => photo.id === library.importFiles?.[digest] && photo.blob) ? [] : [index]) };
      const create = (name, parent = 'albums') => {
        parent ||= 'albums';
        if (!['albums', 'ai'].includes(folderTrail(library.folders, parent)[0]?.id)) throw new Error('Galería no tiene subcarpetas. Crea un álbum personal.');
        name = String(name || '').trim();
        if (!name || name.length > 100 || /[/\\]/.test(name)) throw new Error('Escribe un nombre válido.');
        if (library.folders.some(f => f.parent === parent && f.name.toLowerCase() === name.toLowerCase())) {
          throw Object.assign(new Error('Ya existe una carpeta con ese nombre.'), { status: 409 });
        }
        const folder = { id: crypto.randomUUID(), name, parent, created: Date.now() / 1000 };
        library.folders.push(folder); return folder;
      };
      let result;
      if (action === 'folders') result = create(data.name, data.parent);
      else if (action === 'upload') {
        const info = data.importData;
        if (info?.geolocatedOnly && info.records.some(record => !hasLocation(record.metadata || {}))) throw new Error('Esta importación solo admite fotos con coordenadas válidas.');
        library.importSessions ||= {}; library.importBatches ||= {}; library.importFiles ||= {}; library.metadata ||= {};
        const batchKey = info ? `${info.session}:${info.batch}` : '';
        if (batchKey && library.importBatches[batchKey]) return library.importBatches[batchKey];
        const parent = data.parent === 'uploads' ? 'gallery' : data.parent || 'gallery';
        const folderId = info?.geolocatedOnly || data.folderId === 'uploads' ? 'gallery' : (info && library.importSessions[info.session]) || data.folderId || (parent === 'gallery' ? 'gallery' : create(data.albumName, parent).id);
        if (!library.folders.some(folder => folder.id === folderId) || ['albums', 'ai'].includes(folderId)) throw new Error('Selecciona un álbum o Galería.');
        if (info) library.importSessions[info.session] = folderId;
        let imported = 0, duplicates = 0;
        const saved = [];
        const filesByIndex = new Map(data.files.map((file, index) => [info?.fileIndices?.[index] ?? index, file]));
        for (let index = 0; index < (info?.digests?.length ?? data.files.length); index++) {
          const file = filesByIndex.get(index);
          const digest = info?.digests?.[index] || (file ? await hashPhoto(file) : '');
          if (file && info?.digests && await hashPhoto(file) !== digest) throw new Error('La foto ha cambiado durante la importación.');
          let photo = digest && library.photos.find(p => p.id === library.importFiles[digest]);
          if (!photo && !file) throw Object.assign(new Error('Una foto ya no está guardada. Reintenta para enviarla.'), { status: 409 });
          const id = crypto.randomUUID();
          if (photo) { duplicates++; }
          else {
            imported++;
            photo = { id, relativePath: id, folderId: 'gallery', folderIds: [], name: file.name, uploadedAt: Date.now() / 1000,
              size: file.size, takenAt: null, latitude: null, longitude: null, blob: file };
            library.photos.push(photo);
            if (digest) library.importFiles[digest] = photo.id;
          }
          if (folderId !== 'gallery') photo.folderIds = [...new Set([...(photo.folderIds || []), folderId])];
          saved.push(photo.relativePath);
          const record = info?.records[index];
          if (record?.metadata) {
            const { people, locationKnown, ...metadata } = record.metadata;
            Object.assign(photo, metadata, { metadataSource: metadata.appleId ? 'apple-photos' : 'sidecar' });
            library.metadata[photo.id] = record.raw;
            if (!info.geolocatedOnly && info.preserveAlbums) for (const name of metadata.albums) {
              const safe = name.replace(/[/\\\x00-\x1f]/g, ' · ').trim().slice(0, 100);
              if (!safe || safe === '.' || safe === '..') continue;
              const albumParent = folderId === 'gallery' ? 'albums' : folderId;
              const folder = library.folders.find(f => f.parent === albumParent && f.name.toLowerCase() === safe.toLowerCase()) || create(safe, albumParent);
              photo.folderIds = [...new Set([...photo.folderIds, folder.id])];
            }
          }
        }
        result = { ok: true, folderId, saved, imported, duplicates, rejected: [] };
        if (batchKey) library.importBatches[batchKey] = result;
      } else if (action === 'move' || action === 'albums/add') {
        if (!Array.isArray(data.ids) || !data.ids.length || data.ids.some(id => !library.photos.some(photo => photo.id === id))) throw new Error('Actualiza la selección de fotos.');
        const folderId = data.name ? create(data.name, data.parent).id : data.folderId;
        if (!library.folders.some(f => f.id === folderId) || ['gallery', 'albums', 'ai'].includes(folderId)) throw new Error('Selecciona un álbum.');
        for (const photo of library.photos) if (data.ids.includes(photo.id)) photo.folderIds = [...new Set([...(photo.folderIds || []), folderId])];
        result = { ok: true, folderId };
      } else if (action === 'photos/delete') {
        if (!['album', 'gallery'].includes(data.scope) || !Array.isArray(data.ids) || !data.ids.length || data.ids.length > 5000) throw new Error('Selecciona las fotos y el tipo de borrado.');
        const ids = new Set(data.ids);
        const photos = library.photos.filter(photo => ids.has(photo.id));
        if (photos.length !== ids.size) throw new Error('Una foto ya no está disponible.');
        if (data.scope === 'album') {
          if (['gallery', 'albums', 'ai'].includes(data.folderId) || photos.some(photo => !photo.folderIds?.includes(data.folderId))) throw new Error('Una referencia ya no está en este álbum.');
          for (const photo of photos) photo.folderIds = photo.folderIds.filter(id => id !== data.folderId);
          result = { ok: true, removed: photos.length };
        } else {
          const paths = new Set(photos.map(photo => photo.relativePath));
          library.photos = library.photos.filter(photo => !ids.has(photo.id));
          for (const person of library.people) person.photoIds = person.photoIds.filter(id => !ids.has(id));
          for (const id of ids) if (library.metadata) delete library.metadata[id];
          for (const [digest, id] of Object.entries(library.importFiles || {})) if (ids.has(id)) delete library.importFiles[digest];
          for (const [batch, receipt] of Object.entries(library.importBatches || {})) if (receipt.saved.some(path => paths.has(path))) delete library.importBatches[batch];
          result = { ok: true, deleted: photos.length };
        }
      } else if (action.startsWith('metadata/')) {
        const raw = library.metadata?.[action.slice('metadata/'.length)];
        if (!raw) throw new Error('Esta foto no tiene metadatos importados.');
        return raw;
      } else if (/^photos\/[^/]+\/faces$/.test(action)) {
        const photo = library.photos.find(photo => photo.id === action.split('/')[1]);
        if (!photo) throw new Error('No se encuentra la foto.');
        return { photoId: photo.id, faces: [], state: 'pending', canDetect: false, scan: { state: 'idle', error: '' }, batchRunning: false };
      } else if (action === 'people/scan' || action === 'people/pause' || /^photos\/[^/]+\/detect$/.test(action)) {
        throw new Error('Conecta la Raspberry para analizar las fotos.');
      } else if (/^people\/[^/]+\/cover$/.test(action)) {
        const person = library.people.find(p => p.id === action.split('/')[1]);
        if (!person?.photoIds.includes(data.photoId)) throw new Error('La portada debe ser una foto de esta persona.');
        person.coverPhotoId = data.photoId; result = { ok: true };
      } else if (/^people\/[^/]+$/.test(action)) {
        const person = library.people.find(p => p.id === action.split('/')[1]);
        if (!person || !data.name?.trim()) throw new Error('Escribe un nombre válido.');
        person.name = data.name.trim(); result = { ok: true };
      } else if (/^people\/[^/]+\/remove$/.test(action)) {
        const person = library.people.find(p => p.id === action.split('/')[1]);
        if (person) person.photoIds = person.photoIds.filter(id => !data.ids.includes(id));
        result = { ok: true };
      } else if (action !== 'library') throw new Error('Conecta la Raspberry para usar esta función.');
      for (const person of library.people) if (!person.photoIds.includes(person.coverPhotoId)) person.coverPhotoId = null;
      if (action !== 'library' || migrated) {
        library.revision = crypto.randomUUID();
        await new Promise((resolve, reject) => {
          const tx = db.transaction('library', 'readwrite'); tx.objectStore('library').put(library, 'data');
          tx.oncomplete = resolve; tx.onerror = () => reject(new Error('No se ha podido guardar. Revisa el espacio del navegador.')); tx.onabort = tx.onerror;
        });
      }
      const existingPaths = new Set(library.photos.map(photo => photo.relativePath));
      for (const [path, url] of urls) if (!existingPaths.has(path)) { URL.revokeObjectURL(url); urls.delete(path); }
      const photos = library.photos.map(({ blob, ...photo }) => {
        if (blob && !urls.has(photo.relativePath)) urls.set(photo.relativePath, URL.createObjectURL(blob));
        return photo;
      });
      const { metadata, importSessions, importBatches, importFiles, ...publicLibrary } = library;
      return result || { ...publicLibrary, people: library.people.filter(p => !p.appleKey && p.photoIds.length), photos };
    } finally { db.close(); }
  };
  const next = operation.then(run, run); operation = next.catch(() => {}); return next;
}
