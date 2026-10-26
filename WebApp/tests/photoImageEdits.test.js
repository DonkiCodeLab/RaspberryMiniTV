import test from 'node:test';
import assert from 'node:assert/strict';
import { editBox, visibleBox } from '../src/photoImageEdits.js';
import { newPeopleReviewQueue, reviewBatchPhotos, reviewHandled } from '../src/photoReviewWizard.js';
import { createImportId } from '../src/photoImport.js';

test('drawing after rotation and crop converts back to original coordinates before saving', () => {
  const original = { x: .2, y: .3, width: .1, height: .2 };
  const edits = [{ rotate: 1 }, { crop: { x: .1, y: .1, width: .8, height: .8 } }, { scale: .5 }, { rotate: -1 }];
  const drawn = editBox(original, edits);
  const restored = editBox(drawn, edits, true);
  for (const key of Object.keys(original)) assert.ok(Math.abs(restored[key] - original[key]) < 1e-10);
});
test('four quarter turns restore the face and cropping hides faces outside the remaining image', () => {
  const original = { x: .1, y: .2, width: .2, height: .3 };
  for (const rotation of [-1, 1]) {
    const result = editBox(original, Array.from({ length: 4 }, () => ({ rotate: rotation })));
    for (const key of Object.keys(original)) assert.ok(Math.abs(result[key] - original[key]) < 1e-10);
  }
  assert.equal(visibleBox(editBox(original, [{ crop: { x: .5, y: .5, width: .5, height: .5 } }])), null);
  assert.deepEqual(visibleBox({ x: -.1, y: .2, width: .3, height: .4 }), { x: 0, y: .2, width: .19999999999999998, height: .4000000000000001 });
});
test('draft IDs work without crypto.randomUUID on the Raspberry HTTP origin', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: values => { values.fill(42); return values; } } });
  try { assert.match(createImportId(), /^[a-f0-9]{32}$/); } finally { Object.defineProperty(globalThis, 'crypto', descriptor); }
});
test('one photo draft covers approvals, edits to other proposed faces and deletions', () => {
  const drafts = { p: { photoId: 'p', expectedPath: 'p.jpg', version: 'v1', reviewIds: ['r1'], changes: [{ action: 'assign', faceId: 'f2', name: 'Eva' }], edits: [{ rotate: 1 }], delete: false } };
  assert.equal(reviewHandled({ id: 'r1', photoId: 'p', faceId: 'f1' }, drafts), true);
  assert.equal(reviewHandled({ id: 'r2', photoId: 'p', faceId: 'f2' }, drafts), true);
  assert.equal(reviewHandled({ id: 'r3', photoId: 'p', faceId: 'f3' }, drafts), false);
  assert.equal(reviewBatchPhotos(drafts).length, 1);
  drafts.p.delete = true;
  assert.equal(reviewHandled({ id: 'r3', photoId: 'p', faceId: 'f3' }, drafts), true);
});
test('last step contains unnamed groups from the selected batch including groups on several photos', () => {
  const library = { faces: { batchPhotoIds: ['new'] }, people: [
    { id: 'a', name: 'Ana', photoIds: ['new'] }, { id: 'b', name: 'Persona 2', photoIds: ['old', 'new'] },
    { id: 'c', name: 'Persona 3', photoIds: ['old'] }, { id: 'unknown', name: 'Desconocido', photoIds: ['new'] },
  ] };
  assert.deepEqual(newPeopleReviewQueue(library, true).map(p => p.id), ['b']);
  assert.deepEqual(newPeopleReviewQueue(library).map(p => p.id), ['b', 'c']);
});
