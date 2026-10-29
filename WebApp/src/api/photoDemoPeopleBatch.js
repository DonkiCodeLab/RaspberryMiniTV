import { isNewPhotoPerson, isIdentifiedPhotoPerson, UNKNOWN_PERSON_ID } from '../photoLibrary.js';
import { validNewPersonName } from '../photoPeopleBatch.js';

export function deleteDemoPhotos(library, ids) {
  const paths = new Set(library.photos.filter(photo => ids.has(photo.id)).map(photo => photo.relativePath));
  library.photos = library.photos.filter(photo => !ids.has(photo.id));
  for (const person of library.people) person.photoIds = person.photoIds.filter(id => !ids.has(id));
  for (const id of ids) { delete library.metadata?.[id]; delete library.manualFaces?.[id]; delete library.imageEditSources?.[id]; }
  for (const [digest, id] of Object.entries(library.importFiles || {})) if (ids.has(id)) delete library.importFiles[digest];
  for (const [batch, receipt] of Object.entries(library.importBatches || {})) if (receipt.saved.some(path => paths.has(path))) delete library.importBatches[batch];
}

export function reviewDemoPeople(library, { requestId, changes }) {
  if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(requestId) || !Array.isArray(changes) || !changes.length || changes.length > 5000) throw new Error('Prepara entre 1 y 5000 cambios con un identificador de revisión válido.');
  const fields = { rename: ['id', 'action', 'name'], merge: ['id', 'action', 'personId'], delete: ['id', 'action'], deletePhotos: ['id', 'action', 'photoIds'] };
  for (const change of changes) {
    const allowed = change && Object.hasOwn(fields, change.action) && fields[change.action];
    if (!allowed || Object.keys(change).length !== allowed.length || !allowed.every(key => Object.hasOwn(change, key))) throw new Error('Prepara una sola acción válida por persona.');
  }
  const payload = JSON.stringify(changes.map(change => Object.fromEntries(Object.keys(change).sort().map(key => [key, change[key]]))));
  const previous = library.personReviewBatches?.[requestId];
  if (previous) {
    if (previous.payload !== payload) throw new Error('Esta revisión ya se usó para otros cambios.');
    return previous.result;
  }
  const sources = new Set(), photos = new Set();
  const prepared = changes.map(change => {
    const person = library.people.find(person => person.id === change.id);
    if (!isNewPhotoPerson(person) || sources.has(change.id)) throw new Error('Una persona ha cambiado o tiene más de una acción. Revisa sus cambios.');
    sources.add(change.id);
    const target = library.people.find(person => person.id === (change.action === 'delete' ? UNKNOWN_PERSON_ID : change.personId));
    if (change.action === 'rename' && !validNewPersonName(change.name)) throw new Error('Escribe un nombre válido para identificar a esta persona.');
    if (['merge', 'delete'].includes(change.action) && (!isIdentifiedPhotoPerson(target) || target === person)) throw new Error('Elige una persona identificada como destino.');
    if (change.action === 'deletePhotos') {
      if (!Array.isArray(change.photoIds) || !change.photoIds.length || change.photoIds.length > 5000 || change.photoIds.some(id => typeof id !== 'string')) throw new Error('Selecciona entre 1 y 5000 fotos.');
      const ids = new Set(change.photoIds);
      if (ids.size !== person.photoIds.length || person.photoIds.some(id => !ids.has(id)) || [...ids].some(id => !library.photos.some(photo => photo.id === id))) throw new Error('Han cambiado las fotos de una ficha. Revisa su borrado.');
      for (const id of ids) photos.add(id);
    }
    return { ...change, person, target };
  });
  if (photos.size > 5000) throw new Error('Selecciona como máximo 5000 fotos por revisión.');
  for (const { action, person, target, name } of prepared) {
    if (action === 'rename') person.name = name.trim();
    if (['merge', 'delete'].includes(action)) {
      for (const faces of Object.values(library.manualFaces || {})) for (const face of faces) if (face.personId === person.id) { face.personId = target.id; face.name = target.name; face.manual = true; }
      target.photoIds = [...new Set([...target.photoIds, ...person.photoIds])];
      target.coverPhotoId ||= person.coverPhotoId;
      if (target.id !== UNKNOWN_PERSON_ID) target.birthDate ||= person.birthDate;
      library.people = library.people.filter(other => other !== person);
    }
  }
  deleteDemoPhotos(library, photos);
  const result = { ok: true, applied: changes.length, deletedPhotos: photos.size, cleanupPending: 0 };
  library.personReviewBatches ||= {};
  library.personReviewBatches[requestId] = { payload, result };
  return result;
}
