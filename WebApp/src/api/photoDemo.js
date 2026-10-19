import { hasLocation } from '../photoLibrary.js';
// Local demo albums persist in IndexedDB, including image blobs, without network uploads.
const urls = new Map();
let operation = Promise.resolve();
const initial = () => ({ folders: [{ id: 'uploads', name: 'Uploads', parent: '', created: Date.now() / 1000 },
  { id: 'ai', name: 'Diviértete con la IA', parent: '', created: Date.now() / 1000 }], photos: [], people: [], jobs: [],
  faces: { available: false, pending: 0, running: false }, aiReady: false, demo: true });
const open = () => new Promise((resolve, reject) => {
  const request = indexedDB.open('minitv-photo-demo-v1', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('library');
  request.onerror = () => reject(new Error('No se puede abrir la biblioteca local.'));
  request.onsuccess = () => resolve(request.result);
});
export const demoPhotoUrl = path => urls.get(path) || '';
export function photoDemo(action, data = {}) {
  const run = async () => {
    const db = await open();
    try {
      const library = await new Promise((resolve, reject) => {
        const query = db.transaction('library').objectStore('library').get('data');
        query.onsuccess = () => resolve(query.result || initial()); query.onerror = () => reject(query.error);
      });
      library.revision ||= 'demo-empty'; library.working = false;
      if (action === 'status') return { revision: library.revision, working: false };
      const create = (name, parent = '') => {
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
        const folderId = info?.geolocatedOnly ? 'uploads' : (info && library.importSessions[info.session]) || data.folderId || create(data.albumName, data.parent || 'uploads').id;
        if (info) library.importSessions[info.session] = folderId;
        let imported = 0, duplicates = 0;
        for (const [index, file] of data.files.entries()) {
          const digest = info ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('') : '';
          let photo = digest && library.photos.find(p => p.id === library.importFiles[digest]);
          const id = crypto.randomUUID();
          if (photo) { duplicates++; photo.folderIds = [...new Set([...(photo.folderIds || []), folderId])]; }
          else {
            imported++;
            photo = { id, relativePath: id, folderId, folderIds: [], name: file.name, uploadedAt: Date.now() / 1000,
              size: file.size, takenAt: null, latitude: null, longitude: null, blob: file };
            library.photos.push(photo);
            if (digest) library.importFiles[digest] = photo.id;
          }
          const record = info?.records[index];
          if (record?.metadata) {
            const { people, locationKnown, ...metadata } = record.metadata;
            Object.assign(photo, metadata, { metadataSource: metadata.appleId ? 'apple-photos' : 'sidecar' });
            library.metadata[photo.id] = record.raw;
            for (const person of (info.geolocatedOnly ? [] : people)) {
              const key = person.id || `name:${person.name}`;
              let known = library.people.find(p => p.appleKey === key);
              if (!known) { known = { id: crypto.randomUUID(), appleKey: key, name: person.name, photoIds: [] }; library.people.push(known); }
              if (!known.photoIds.includes(photo.id)) known.photoIds.push(photo.id);
            }
            if (!info.geolocatedOnly && info.preserveAlbums) for (const name of metadata.albums) {
              const safe = name.replace(/[/\\\x00-\x1f]/g, ' · ').trim().slice(0, 100);
              if (!safe || safe === '.' || safe === '..') continue;
              const folder = library.folders.find(f => f.parent === folderId && f.name.toLowerCase() === safe.toLowerCase()) || create(safe, folderId);
              photo.folderIds = [...new Set([...photo.folderIds, folder.id])];
            }
          }
        }
        result = { ok: true, folderId, saved: data.files.map(file => file.name), imported, duplicates };
        if (batchKey) library.importBatches[batchKey] = result;
      } else if (action === 'move') {
        const folderId = data.name ? create(data.name, data.parent).id : data.folderId;
        if (!library.folders.some(f => f.id === folderId)) throw new Error('Selecciona una carpeta.');
        for (const photo of library.photos) if (data.ids.includes(photo.id)) { photo.folderId = folderId; photo.folderIds = []; }
        result = { ok: true, folderId };
      } else if (action.startsWith('metadata/')) {
        const raw = library.metadata?.[action.slice('metadata/'.length)];
        if (!raw) throw new Error('Esta foto no tiene metadatos importados.');
        return raw;
      } else if (/^people\/[^/]+$/.test(action)) {
        const person = library.people.find(p => p.id === action.split('/')[1]);
        if (!person || !data.name?.trim()) throw new Error('Escribe un nombre válido.');
        person.name = data.name.trim(); result = { ok: true };
      } else if (/^people\/[^/]+\/remove$/.test(action)) {
        const person = library.people.find(p => p.id === action.split('/')[1]);
        if (person) person.photoIds = person.photoIds.filter(id => !data.ids.includes(id));
        result = { ok: true };
      } else if (action !== 'library') throw new Error('Conecta la Raspberry para usar esta función.');
      if (action !== 'library') {
        library.revision = crypto.randomUUID();
        await new Promise((resolve, reject) => {
          const tx = db.transaction('library', 'readwrite'); tx.objectStore('library').put(library, 'data');
          tx.oncomplete = resolve; tx.onerror = () => reject(new Error('No se ha podido guardar. Revisa el espacio del navegador.')); tx.onabort = tx.onerror;
        });
      }
      const photos = library.photos.map(({ blob, ...photo }) => {
        if (blob && !urls.has(photo.relativePath)) urls.set(photo.relativePath, URL.createObjectURL(blob));
        return photo;
      });
      const { metadata, importSessions, importBatches, importFiles, ...publicLibrary } = library;
      return result || { ...publicLibrary, people: library.people.filter(p => p.photoIds.length), photos };
    } finally { db.close(); }
  };
  const next = operation.then(run, run); operation = next.catch(() => {}); return next;
}
