import { deleteDemoPhotos, reviewDemoPeople } from './photoDemoPeopleBatch.js';
import { descendantIds, folderTrail, hasLocation, isIdentifiedPhotoPerson, UNKNOWN_PERSON_ID } from '../photoLibrary.js';
import { hashPhoto } from '../photoHash.js';
import { validBirthday } from '../personBirthday.js';
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

function assignmentPerson(library, data) {
  if (data.personId) {
    const person = library.people.find(person => person.id === data.personId);
    if (!isIdentifiedPhotoPerson(person)) throw new Error('Selecciona una persona con nombre, Desconocido o escribe un nombre nuevo.');
    return person;
  }
  const name = String(data.name || '').trim();
  if (!name || name.length > 100 || /[/\\]/.test(name) || !isIdentifiedPhotoPerson({ id: 'new', name })) throw new Error('Escribe un nombre válido para identificar a esta persona.');
  let person = library.people.find(person => isIdentifiedPhotoPerson(person) && person.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  if (!person) { person = { id: crypto.randomUUID(), name, photoIds: [] }; library.people.push(person); }
  return person;
}
export const demoPhotoUrl = path => urls.get(path) || '';
export function migratePhotoDemo(library) {
  library.people ||= [];
  const missingUnknown = !library.people.some(person => person.id === UNKNOWN_PERSON_ID);
  if (missingUnknown) library.people.push({ id: UNKNOWN_PERSON_ID, name: 'Desconocido', created: 0, photoIds: [] });
  if (library.galleryVersion === 1) return missingUnknown;
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
          deleteDemoPhotos(library, ids);
          result = { ok: true, deleted: photos.length };
        }
      } else if (action.startsWith('metadata/')) {
        const raw = library.metadata?.[action.slice('metadata/'.length)];
        if (!raw) throw new Error('Esta foto no tiene metadatos importados.');
        return raw;
      } else if (/^photos\/[^/]+\/faces$/.test(action)) {
        const photo = library.photos.find(photo => photo.id === action.split('/')[1]);
        if (!photo) throw new Error('No se encuentra la foto.');
        const faces = library.manualFaces?.[photo.id] || [];
        if (!Object.keys(data).length) return { photoId: photo.id, faces, state: photo.faceState || 'pending', canDetect: false, scan: { state: 'idle', error: '' }, batchRunning: false };
        const box = data.box;
        if (!box || ['x', 'y', 'width', 'height'].some(key => !Number.isFinite(box[key])) || box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0 || box.x + box.width > 1.000001 || box.y + box.height > 1.000001) throw new Error('Define un recuadro válido dentro de la foto.');
        const person = assignmentPerson(library, data);
        const face = { id: crypto.randomUUID(), personId: person.id, name: person.name, box, manual: true };
        library.manualFaces ||= {}; library.manualFaces[photo.id] = [...faces, face];
        person.photoIds = [...new Set([...person.photoIds, photo.id])];
        result = { ok: true, faceId: face.id, personId: person.id };
      } else if (/^photos\/[^/]+\/faces\/[^/]+\/remove$/.test(action)) {
        const [, photoId, , faceId] = action.split('/');
        const faces = library.manualFaces?.[photoId] || [], face = faces.find(face => face.id === faceId);
        if (!face) throw new Error('Esta cara ya no está disponible.');
        library.manualFaces[photoId] = faces.filter(face => face.id !== faceId);
        const person = library.people.find(person => person.id === face.personId);
        if (person && !library.manualFaces[photoId].some(face => face.personId === person.id)) {
          person.photoIds = person.photoIds.filter(id => id !== photoId);
          if (person.coverPhotoId === photoId) delete person.coverPhotoId;
        }
        result = { ok: true, faceId };
      } else if (/^photos\/[^/]+\/faces\/[^/]+\/assign$/.test(action)) {
        const [, photoId, , faceId] = action.split('/');
        const face = library.manualFaces?.[photoId]?.find(face => face.id === faceId);
        if (!face) throw new Error('Esta cara ya no está disponible.');
        const target = assignmentPerson(library, data);
        const previous = library.people.find(person => person.id === face.personId);
        face.personId = target.id; face.name = target.name;
        if (previous && !library.manualFaces[photoId].some(face => face.personId === previous.id)) previous.photoIds = previous.photoIds.filter(id => id !== photoId);
        target.photoIds = [...new Set([...target.photoIds, photoId])];
        result = { ok: true, personId: target.id };
      } else if (action === 'people/scan' || action === 'people/pause' || /^photos\/[^/]+\/detect$/.test(action)) {
        throw new Error('Conecta la Raspberry para analizar las fotos.');
      } else if (action === 'photos/download') {
        if (!Array.isArray(data.ids) || !data.ids.length || data.ids.length > 5000) throw new Error('Selecciona entre 1 y 5000 fotos.');
        const photos = [...new Set(data.ids)].map(id => library.photos.find(photo => photo.id === id));
        if (photos.some(photo => !photo?.blob)) throw new Error('Una foto ya no está disponible. Actualiza la biblioteca.');
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        for (const photo of photos) zip.file(`${photo.id}/${photo.name.replace(/[/\\]/g, '_')}`, await photo.blob.arrayBuffer());
        return zip.generateAsync({ type: 'blob', compression: 'STORE' });
      } else if (action === 'people/review') {
        result = reviewDemoPeople(library, data);
      } else if (['people/merge', 'people/delete', 'people/download'].includes(action)) {
        if (!Array.isArray(data.ids) || !data.ids.length || data.ids.some(id => typeof id !== 'string')) throw new Error('Selecciona las personas para esta acción.');
        const sources = [...new Set(data.ids)].map(id => library.people.find(person => person.id === id && !person.appleKey));
        if (sources.some(person => !person)) throw new Error('Esta persona ya no está disponible. Actualiza la biblioteca.');
        if (action === 'people/download') {
          const ids = new Set(sources.flatMap(person => person.photoIds));
          const photos = library.photos.filter(photo => ids.has(photo.id));
          if (!photos.length) throw new Error('Estas personas no tienen fotos para descargar.');
          const { default: JSZip } = await import('jszip');
          const zip = new JSZip();
          for (const photo of photos) {
            if (!photo.blob) throw new Error('No se encuentra la foto.');
            // Demo storage uses UUID paths; include the original filename too.
            const name = photo.name.replace(/[/\\]/g, '_');
            zip.file(`${photo.id}/${name}`, await photo.blob.arrayBuffer());
          }
          return zip.generateAsync({ type: 'blob', compression: 'STORE' });
        }
        const target = library.people.find(person => person.id === (action === 'people/delete' ? UNKNOWN_PERSON_ID : data.personId));
        if (!target || target.appleKey || sources.includes(target) || sources.some(person => person.id === UNKNOWN_PERSON_ID)) throw new Error('Selecciona otra persona existente para unir los álbumes.');
        for (const source of sources) {
          for (const faces of Object.values(library.manualFaces || {})) for (const face of faces) if (face.personId === source.id) { face.personId = target.id; face.name = target.name; }
          target.photoIds = [...new Set([...target.photoIds, ...source.photoIds])];
          target.coverPhotoId ||= source.coverPhotoId;
          if (target.id !== UNKNOWN_PERSON_ID) target.birthDate ||= source.birthDate;
        }
        library.people = library.people.filter(person => !sources.includes(person));
        result = { ok: true, ...(action === 'people/merge' ? { personId: target.id } : {}) };
      } else if (/^people\/[^/]+\/merge$/.test(action)) {
        const source = library.people.find(p => p.id === action.split('/')[1]);
        const target = library.people.find(p => p.id === data.personId);
        if (!source || !target || source === target || source.appleKey || target.appleKey || source.id === UNKNOWN_PERSON_ID) throw new Error('Selecciona otra persona existente para unir los álbumes.');
        for (const faces of Object.values(library.manualFaces || {})) for (const face of faces) if (face.personId === source.id) { face.personId = target.id; face.name = target.name; }
        target.photoIds = [...new Set([...target.photoIds, ...source.photoIds])];
        target.coverPhotoId ||= source.coverPhotoId;
        if (target.id !== UNKNOWN_PERSON_ID) target.birthDate ||= source.birthDate;
        library.people = library.people.filter(p => p !== source);
        result = { ok: true, personId: target.id };
      } else if (/^people\/[^/]+\/birthday$/.test(action)) {
        const person = library.people.find(p => p.id === action.split('/')[1]);
        if (!person || person.id === UNKNOWN_PERSON_ID) throw new Error('Selecciona una persona con nombre.');
        if (data.birthDate !== '' && !validBirthday(data.birthDate)) throw new Error('Introduce una fecha de nacimiento válida que no sea futura.');
        person.birthDate = data.birthDate; result = { ok: true };
      } else if (/^people\/[^/]+\/cover$/.test(action)) {
        const person = library.people.find(p => p.id === action.split('/')[1]);
        if (!person?.photoIds.includes(data.photoId)) throw new Error('La portada debe ser una foto de esta persona.');
        person.coverPhotoId = data.photoId; result = { ok: true };
      } else if (/^people\/[^/]+$/.test(action)) {
        const person = library.people.find(p => p.id === action.split('/')[1]);
        if (person?.id === UNKNOWN_PERSON_ID) throw new Error('La carpeta Desconocido es fija y no se puede renombrar.');
        if (!person || !data.name?.trim()) throw new Error('Escribe un nombre válido.');
        person.name = data.name.trim(); result = { ok: true };
      } else if (/^people\/[^/]+\/remove$/.test(action)) {
        const person = library.people.find(p => p.id === action.split('/')[1]);
        if (person) person.photoIds = person.photoIds.filter(id => !data.ids.includes(id));
        if (person) for (const id of data.ids) for (const face of library.manualFaces?.[id] || []) if (face.personId === person.id) { face.personId = null; face.name = null; }
        result = { ok: true };
      } else if (action !== 'library') throw new Error('Conecta la Raspberry para usar esta función.');
      for (const person of library.people) {
        if (!person.photoIds.includes(person.coverPhotoId)) person.coverPhotoId = null;
        person.faceBoxes = {};
        person.coverFace = null;
        for (const [photoId, faces] of Object.entries(library.manualFaces || {})) {
          const matches = faces.filter(face => face.personId === person.id);
          for (const face of matches) face.name = person.name;
          if (matches.length) {
            person.faceBoxes[photoId] = matches.map(({ id, box }) => ({ id, box }));
            person.coverFace ||= { ...person.faceBoxes[photoId][0], photoId };
          }
        }
      }
      for (const photo of library.photos) if (library.manualFaces?.[photo.id]) photo.faceCount = library.manualFaces[photo.id].length;
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
      const { metadata, importSessions, importBatches, importFiles, personReviewBatches, ...publicLibrary } = library;
      return result || { ...publicLibrary, people: library.people.filter(p => !p.appleKey && (p.photoIds.length || p.id === UNKNOWN_PERSON_ID)),
        knownPeople: library.people.filter(isIdentifiedPhotoPerson).map(({ id, name }) => ({ id, name })), photos };
    } finally { db.close(); }
  };
  const next = operation.then(run, run); operation = next.catch(() => {}); return next;
}
