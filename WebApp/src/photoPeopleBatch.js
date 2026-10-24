import { isNewPhotoPerson, photoAssignmentOptions } from './photoLibrary.js';

export const validNewPersonName = name => typeof name === 'string' && !!name.trim() && name.trim().length <= 100 &&
  !['.', '..'].includes(name.trim()) && !/[/\\\x00-\x1f]/.test(name) && !isNewPhotoPerson({ id: 'new', name });

// Each card stages exactly one operation; changing its choice replaces the previous one.
export function updatePersonDraft(drafts, person, change) {
  const next = { ...drafts };
  if (!change || change.action === 'rename' && !change.name || change.action === 'merge' && !change.personId) delete next[person.id];
  else next[person.id] = { ...change, sourceName: person.name,
    ...(change.action === 'deletePhotos' ? { photoIds: [...new Set(person.photoIds || [])] } : {}) };
  return next;
}

export function peopleBatchEntries(drafts, people, knownPeople, s) {
  const sources = new Map(people.map(person => [person.id, person]));
  const targets = new Map(photoAssignmentOptions(knownPeople, s).map(person => [person.id, person]));
  return Object.entries(drafts).map(([id, draft]) => {
    const person = sources.get(id), target = targets.get(draft.personId);
    let error = !isNewPhotoPerson(person) ? s.batchPersonChanged : '';
    if (!error && draft.action === 'rename' && !validNewPersonName(draft.name)) error = s.batchInvalidName;
    if (!error && draft.action === 'merge' && (!target || target.id === id)) error = s.batchTargetChanged;
    if (!error && draft.action === 'deletePhotos') {
      const current = new Set(person.photoIds || []), selected = draft.photoIds || [];
      if (!selected.length || current.size !== selected.length || selected.some(photoId => !current.has(photoId))) error = s.batchPhotosChanged;
    }
    if (!['rename', 'merge', 'delete', 'deletePhotos'].includes(draft.action)) error = s.batchPersonChanged;
    const payload = { id, action: draft.action, ...(draft.action === 'rename' ? { name: draft.name.trim() } :
      draft.action === 'merge' ? { personId: draft.personId } : draft.action === 'deletePhotos' ? { photoIds: draft.photoIds } : {}) };
    return { person: person || { id, name: draft.sourceName || id }, target, payload, error };
  });
}

export function peopleBatchCounts(entries) {
  const counts = { rename: 0, merge: 0, delete: 0, deletePhotos: 0 };
  for (const entry of entries) counts[entry.payload.action]++;
  return { ...counts, photos: new Set(entries.flatMap(entry => entry.payload.action === 'deletePhotos' ? entry.payload.photoIds : [])).size };
}

export function peopleBatchDescription(entry, s) {
  return entry.payload.action === 'rename' ? s.batchRenameTo.replace('{name}', entry.payload.name) :
    entry.payload.action === 'merge' ? s.batchMergeInto.replace('{name}', entry.target?.name || s.choosePerson) :
    entry.payload.action === 'deletePhotos' ? s.batchDeleteOriginals.replace('{count}', entry.payload.photoIds.length) : s.deletePersonKeepPhotos;
}
