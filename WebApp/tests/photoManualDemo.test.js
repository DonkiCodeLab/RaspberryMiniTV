import test from 'node:test';
import assert from 'node:assert/strict';
import { photoDemo } from '../src/api/photoDemo.js';

test('manual boxes persist in the local demo and follow reassignment, merging and removal', async () => {
  const previous = globalThis.indexedDB;
  let stored = { galleryVersion: 1, folders: [], photos: [{ id: 'photo', name: 'Photo', relativePath: 'photo.jpg', folderIds: [] }],
    people: [{ id: 'unknown', name: 'Desconocido', photoIds: [] }], jobs: [], faces: {} };
  globalThis.indexedDB = { open() {
    const request = {};
    queueMicrotask(() => {
      request.result = { close() {}, transaction() {
        const tx = { objectStore: () => ({
          get() { const query = {}; queueMicrotask(() => { query.result = structuredClone(stored); query.onsuccess(); }); return query; },
          put(value) { stored = structuredClone(value); queueMicrotask(() => tx.oncomplete()); },
        }) };
        return tx;
      } };
      request.onsuccess();
    });
    return request;
  } };
  try {
    const box = { x: .1, y: .2, width: .2, height: .3 };
    const created = await photoDemo('photos/photo/faces', { box, name: 'Ana' });
    const details = await photoDemo('photos/photo/faces');
    assert.equal(details.faces[0].id, created.faceId);
    assert.deepEqual(details.faces[0].box, box);
    const library = await photoDemo('library');
    const ana = library.people.find(person => person.id === created.personId);
    assert.deepEqual(ana.photoIds, ['photo']);
    assert.deepEqual(ana.coverFace.box, box);
    assert.equal(library.photos[0].faceCount, 1);
    const assigned = await photoDemo(`photos/photo/faces/${created.faceId}/assign`, { name: 'Luis' });
    assert.notEqual(assigned.personId, created.personId);
    assert.equal((await photoDemo('photos/photo/faces')).faces[0].name, 'Luis');
    await photoDemo(`people/${assigned.personId}/merge`, { personId: 'unknown' });
    assert.equal((await photoDemo('photos/photo/faces')).faces[0].personId, 'unknown');
    await photoDemo('people/unknown/remove', { ids: ['photo'] });
    assert.equal((await photoDemo('photos/photo/faces')).faces[0].personId, null);
  } finally { globalThis.indexedDB = previous; }
});
