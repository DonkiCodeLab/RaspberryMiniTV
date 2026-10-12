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
      const create = (name, parent = '') => {
        name = String(name || '').trim();
        if (!name || name.length > 100 || /[/\\]/.test(name)) throw new Error('Escribe un nombre válido.');
        if (library.folders.some(f => f.parent === parent && f.name.toLowerCase() === name.toLowerCase())) throw new Error('Ya existe una carpeta con ese nombre.');
        const folder = { id: crypto.randomUUID(), name, parent, created: Date.now() / 1000 };
        library.folders.push(folder); return folder;
      };
      let result;
      if (action === 'folders') result = create(data.name, data.parent);
      else if (action === 'upload') {
        const folderId = data.folderId || create(data.albumName, data.parent || 'uploads').id;
        for (const file of data.files) {
          const id = crypto.randomUUID();
          library.photos.push({ id, relativePath: id, folderId, name: file.name, uploadedAt: Date.now() / 1000,
            size: file.size, takenAt: null, latitude: null, longitude: null, blob: file });
        }
        result = { ok: true, folderId, saved: data.files.map(file => file.name) };
      } else if (action === 'move') {
        const folderId = data.name ? create(data.name, data.parent).id : data.folderId;
        if (!library.folders.some(f => f.id === folderId)) throw new Error('Selecciona una carpeta.');
        for (const photo of library.photos) if (data.ids.includes(photo.id)) photo.folderId = folderId;
        result = { ok: true, folderId };
      } else if (action !== 'library') throw new Error('Conecta la Raspberry para usar esta función.');
      if (action !== 'library') await new Promise((resolve, reject) => {
        const tx = db.transaction('library', 'readwrite'); tx.objectStore('library').put(library, 'data');
        tx.oncomplete = resolve; tx.onerror = () => reject(new Error('No se ha podido guardar. Revisa el espacio del navegador.')); tx.onabort = tx.onerror;
      });
      const photos = library.photos.map(({ blob, ...photo }) => {
        if (blob && !urls.has(photo.relativePath)) urls.set(photo.relativePath, URL.createObjectURL(blob));
        return photo;
      });
      return result || { ...library, photos };
    } finally { db.close(); }
  };
  const next = operation.then(run, run); operation = next.catch(() => {}); return next;
}
