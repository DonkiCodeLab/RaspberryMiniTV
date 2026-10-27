import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { afterReviewStage, attachReviewSwipe, faceReviewQueue, nextReviewCard, noFacesReviewQueue, newPersonReviewHandled, reviewBatchPhotos, reviewChanges, reviewIsCurrent, reviewSwipeAction, reviewPeopleOptions, reviewAlbumOptions, validReviewAlbumName } from '../src/photoReviewWizard.js';
import { photoAssignmentValue } from '../src/photoLibrary.js';
import { photoStrings } from '../src/photoStrings.js';

const photos = [{ id: 'family' }, { id: 'older' }];
const reviews = [
  { id: 'ana', photoId: 'family', faceId: 'a', personId: 'ana', batchId: 'new' },
  { id: 'luis', photoId: 'family', faceId: 'b', personId: 'luis', batchId: 'new' },
  { id: 'old', photoId: 'older', faceId: 'c', personId: 'ana', batchId: 'old' },
  { id: 'none', photoId: 'family', faceId: null, batchId: 'new' },
  { id: 'missing', photoId: 'deleted', faceId: 'd', batchId: 'new' },
];
const folders = [{ id: 'albums', name: 'Personal' }, { id: 'ai', name: 'AI' }, { id: 'gallery', name: 'Gallery' },
  { id: 'family-album', name: 'Familia', parent: 'albums' }, { id: 'trip', name: 'Viaje', parent: 'family-album' },
  { id: 'generated', name: 'AI only', parent: 'ai' }];
test('album options include nested personal albums and reusable drafts, excluding duplicates and deleted photos', () => {
  const drafts = { one: { albums: [{ name: ' Verano ' }, { name: 'FAMILIA' }, { name: 'bad/name' }] },
    two: { albums: [{ name: 'verano' }] }, deleted: { delete: true, albums: [{ name: 'Deleted' }] } };
  const options = reviewAlbumOptions(folders, drafts);
  assert.deepEqual(options.map(option => option.label), ['Familia', 'Familia / Viaje', 'Verano']);
  const verano = options.find(option => option.pending);
  assert.deepEqual(verano.assignment, { name: 'Verano' });
  const nextDraft = { photoId: 'three', changes: [], reviewIds: [], albums: [verano.assignment] };
  assert.deepEqual(reviewBatchPhotos({ three: nextDraft })[0].albums, [{ name: 'Verano' }]);
  assert.deepEqual(reviewAlbumOptions(folders, JSON.parse(JSON.stringify(drafts))), options);
  assert.deepEqual(reviewAlbumOptions(folders, { three: nextDraft }), options);
  assert.equal(reviewAlbumOptions(folders, {}).length, 2);
  assert.equal(newPersonReviewHandled({ id: 'new', photoIds: ['three'] }, { three: nextDraft }), false);
});
test('new album names use the folder naming rules without imposing person naming rules', () => {
  for (const name of ['', '  ', '.', '..', 'bad/name', 'bad\\name', 'bad\nname', 'x'.repeat(101), null]) assert.equal(validReviewAlbumName(name), false, String(name));
  for (const name of [' Viaje 2026 ', 'Persona 1', 'Álbum familiar']) assert.equal(validReviewAlbumName(name), true);
});
test('draft names become reusable choices without creating people or sending temporary IDs', () => {
  const known = [{ id: 'ana', name: 'Ana' }], box = { x: .2, y: .3, width: .1, height: .2 };
  const drafts = { first: { photoId: 'first', changes: [{ action: 'add', box, name: ' Eva ' }] } };
  const choices = reviewPeopleOptions(known, drafts), eva = choices.find(p => p.name === 'Eva');
  assert.ok(eva.draftName);
  assert.equal(known.length, 1);
  assert.deepEqual(photoAssignmentValue(choices, 'ana'), { personId: 'ana' });
  drafts.second = { photoId: 'second', changes: [{ action: 'add', box, ...photoAssignmentValue(choices, eva.id) }] };
  assert.deepEqual(reviewBatchPhotos(drafts).map(p => p.changes[0].name.trim()), ['Eva', 'Eva']);
  assert.ok(reviewBatchPhotos(drafts).every(p => !('personId' in p.changes[0])));
  const restored = reviewPeopleOptions(known, JSON.parse(JSON.stringify(drafts)));
  assert.deepEqual(restored, choices); // reopening preserves the same option, without duplicates
  delete drafts.first;
  assert.deepEqual(reviewPeopleOptions(known, drafts), choices); // a surviving reference keeps the name
  delete drafts.second;
  assert.deepEqual(reviewPeopleOptions(known, drafts), known); // discard removes unused names
});

test('draft choices exclude invalid, removed, deleted and cropped faces and deduplicate existing names', () => {
  const known = [{ id: 'unknown' }, { id: 'ana', name: 'Ana' }, { id: 'auto', name: 'Persona 2' }];
  const drafts = {
    one: { changes: [
      ...['', 'Persona 3', 'bad/name', ' ANA ', 'Eva', 'eva'].map(name => ({ action: 'assign', faceId: name, name })),
      { action: 'remove', name: 'Removed' }, { action: 'assign', faceId: 'cropped', name: 'Outside' },
    ], croppedFaceIds: ['cropped'] },
    deleted: { delete: true, changes: [{ action: 'assign', name: 'Deleted' }] },
    cropped: { changes: [{ action: 'add', name: 'Outside crop', box: { x: .7, y: .7, width: .1, height: .1 } }],
      edits: [{ crop: { x: 0, y: 0, width: .4, height: .4 } }] },
  };
  const choices = reviewPeopleOptions(known, drafts, [{ id: 'group', name: 'Marta' }, { id: 'other', name: 'EVA' }]);
  assert.deepEqual(choices.map(p => p.name), [undefined, 'Ana', 'Eva', 'Marta']);
});

test('batch review keeps two faces in one photo separate and excludes old, deleted and faceless entries', () => {
  assert.deepEqual(faceReviewQueue(reviews, photos, 'new').map(r => r.id), ['ana', 'luis']);
  assert.deepEqual(faceReviewQueue(reviews, photos).map(r => r.id), ['ana', 'luis', 'old']);
  assert.deepEqual(faceReviewQueue(reviews, photos, null), []);
});
test('staged face corrections and additions produce one bounded photo operation', () => {
  const box = { x: .2, y: .3, width: .1, height: .2 };
  assert.deepEqual(reviewChanges({ a: { personId: 'unknown' }, b: { name: 'Eva' } }, [{ id: 'draft-1', box, assignment: { name: 'Marta' } }]), [
    { action: 'assign', faceId: 'a', personId: 'unknown' }, { action: 'assign', faceId: 'b', name: 'Eva' },
    { action: 'add', box, name: 'Marta' },
  ]);
});
test('editing all new faces in a shared photo resolves their groups without changing the recognized person', () => {
  const people = ['one', 'two', 'three'].map(id => ({ id, photoIds: ['group-photo'] }));
  const draft = { photoId: 'group-photo', sourceFaces: [
    ...people.map(person => ({ id: `face-${person.id}`, personId: person.id })), { id: 'me', personId: 'known' },
  ], changes: people.map(person => ({ action: 'assign', faceId: `face-${person.id}`, personId: 'unknown' })), reviewIds: [] };
  assert.ok(people.every(person => newPersonReviewHandled(person, { 'group-photo': draft })));
  assert.equal(newPersonReviewHandled({ id: 'known', photoIds: ['group-photo'] }, { 'group-photo': draft }), false);
  const [payload] = reviewBatchPhotos({ 'group-photo': draft });
  assert.deepEqual(payload.changes, draft.changes);
  assert.equal('sourceFaces' in payload, false); // local progress metadata is not sent to the API
});
test('a new group remains pending until all its faces in all photos have valid decisions', () => {
  const person = { id: 'one', photoIds: ['first', 'second'] };
  const drafts = { first: { sourceFaces: [{ id: 'a', personId: 'one' }], changes: [{ action: 'assign', faceId: 'a', personId: 'unknown' }] },
    second: { sourceFaces: [{ id: 'b', personId: 'one' }, { id: 'boxless', personId: 'one' }], changes: [] } };
  assert.equal(newPersonReviewHandled(person, drafts), false);
  drafts.second.changes.push({ action: 'assign', faceId: 'b', name: '' });
  assert.equal(newPersonReviewHandled(person, drafts), false);
  drafts.second.changes[0].name = 'Eva';
  assert.equal(newPersonReviewHandled(person, drafts), false);
  drafts.second.changes.push({ action: 'assign', faceId: 'boxless', personId: 'unknown' });
  assert.equal(newPersonReviewHandled(person, drafts), true);
  assert.equal(newPersonReviewHandled(person, { first: drafts.first }), false);
  assert.equal(newPersonReviewHandled(person, { first: drafts.first, second: { changes: [] } }), false);
  assert.equal(newPersonReviewHandled({ id: 'one', photoIds: [] }, {}), false);
});
test('removed, cropped and deleted faces also finish a group without assigning its remaining photos by accident', () => {
  const person = { id: 'one', photoIds: ['first', 'second'] };
  const drafts = { first: { sourceFaces: [{ id: 'a', personId: 'one' }, { id: 'b', personId: 'one' }],
    changes: [{ action: 'remove', faceId: 'a' }], croppedFaceIds: ['b'] }, second: { delete: true } };
  assert.equal(newPersonReviewHandled(person, drafts), true);
  drafts.first.croppedFaceIds = [];
  assert.equal(newPersonReviewHandled(person, drafts), false);
});
test('swipe requires a deliberate horizontal gesture and maps left/right consistently on narrow and wide screens', () => {
  assert.equal(reviewSwipeAction(-80, 5, 300), 'unknown');
  assert.equal(reviewSwipeAction(120, 10, 700), 'approve');
  assert.equal(reviewSwipeAction(40, 0, 300), null);
  assert.equal(reviewSwipeAction(90, 100, 300), null);
});
function fixture() {
  const listeners = new Map(), moves = [], decisions = [], captures = new Set();
  const element = { addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key),
    getBoundingClientRect: () => ({ width: 320 }), setPointerCapture: id => captures.add(id),
    hasPointerCapture: id => captures.has(id), releasePointerCapture: id => captures.delete(id) };
  const destroy = attachReviewSwipe(element, x => moves.push(x), action => decisions.push(action));
  const fire = (type, x = 0, y = 0, extra = {}) => {
    const event = { button: 0, pointerId: 1, clientX: x, clientY: y, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...extra };
    listeners.get(type)?.(event); return event;
  };
  return { fire, decisions, moves, destroy, listeners, captures };
}
test('click opens the photo, dragging suppresses opening and sends exactly one decision', () => {
  const f = fixture();
  f.fire('pointerdown'); f.fire('pointerup', 2, 2); assert.equal(f.fire('click').prevented, undefined);
  f.fire('pointerdown'); f.fire('pointermove', 100, 4); assert.equal(f.moves.at(-1), 100);
  f.fire('pointerup', 100, 4); f.fire('pointerup', 100, 4);
  assert.deepEqual(f.decisions, ['approve']); assert.equal(f.fire('click').prevented, true);
  f.fire('pointerdown'); f.fire('pointermove', -90, 0); f.fire('pointercancel'); f.fire('pointerup', -90, 0);
  assert.deepEqual(f.decisions, ['approve']); assert.equal(f.captures.size, 0);
  f.destroy(); assert.equal(f.listeners.size, 0);
});
test('vertical scrolling, short drags and a second touch never approve a face', () => {
  const f = fixture();
  f.fire('pointerdown'); f.fire('pointermove', 10, 140); f.fire('pointerup', 10, 140);
  assert.equal(f.fire('click').prevented, true);
  f.fire('pointerdown'); f.fire('pointermove', 30, 0); f.fire('pointerup', 30, 0);
  assert.equal(f.fire('click').prevented, true);
  f.fire('pointerdown'); f.fire('pointerdown', 5, 5, { pointerId: 2, isPrimary: false }); f.fire('pointerup', 120, 0);
  assert.deepEqual(f.decisions, []); f.destroy();
});
test('wizard labels are translated and counters preserve their placeholders', () => {
  for (const language of ['es', 'en', 'ca']) {
    const s = photoStrings(language);
    assert.match(s.reviewPosition, /\{current\}.*\{total\}/);
    assert.match(s.reviewIntro, /\{faces\}.*\{people\}.*\{photos\}/);
    assert.match(s.reviewNoFacesPosition, /\{current\}.*\{total\}/);
    for (const key of ['reviewSave', 'reviewApprove', 'reviewUnsaved', 'reviewRemoveHint', 'reviewStepNoFaces', 'reviewSaveReviewed', 'reviewRemoveNewHint', 'reviewResume', 'reviewResumeHint', 'reviewNewPeopleResolved', 'reviewNewPeopleNeedsIdentity']) assert.ok(s[key]);
  }
});

const noFacePhotos = [
  { id: 'new-a', faceState: 'done', faceCount: 0 }, { id: 'new-b', faceState: 'done', faceCount: 0 },
  { id: 'old', faceState: 'done', faceCount: 0 }, { id: 'historical', faceState: 'done', faceCount: 0 },
  { id: 'pending', faceState: 'pending', faceCount: 0 }, { id: 'error', faceState: 'error', faceCount: 0 },
  { id: 'has-face', faceState: 'done', faceCount: 1 }, { id: 'derived', faceState: 'done', faceCount: 0, sourceId: 'new-a' },
];
const noFaceReviews = noFacePhotos.filter(photo => photo.id !== 'historical').map(photo => ({ id: photo.id, photoId: photo.id, faceId: null, batchId: 'batch' }));
noFaceReviews.find(review => review.id === 'old').reviewed = true;

test('third step only includes new analyzed faceless originals with pending tokens, once per photo', () => {
  const entries = [...noFaceReviews, { ...noFaceReviews[0], id: 'duplicate' },
    { id: 'missing', photoId: 'missing', faceId: null, batchId: 'batch' }];
  assert.deepEqual(noFacesReviewQueue(entries, noFacePhotos, 'batch').map(review => review.id), ['new-a', 'new-b']);
  assert.deepEqual(noFacesReviewQueue(entries, noFacePhotos, 'other-batch'), []);
  assert.deepEqual(noFacesReviewQueue(entries, noFacePhotos).map(review => review.id), ['new-a', 'new-b']);
});

test('photo details must still match the exact pending token before editing or marking reviewed', () => {
  const review = noFaceReviews[0];
  assert.equal(reviewIsCurrent(review, null), false);
  assert.equal(reviewIsCurrent(review, { faces: [], noFacesReviewId: review.id }), true);
  assert.equal(reviewIsCurrent(review, { faces: [], noFacesReviewId: 'replaced' }), false);
  assert.equal(reviewIsCurrent(review, { faces: [{ id: 'new-face' }], noFacesReviewId: review.id }), false);
  assert.equal(reviewIsCurrent(reviews[0], { faces: [{ id: 'a', reviewId: 'ana' }] }), true);
});

test('advancing skips reviewed, deleted or externally assigned photos without restarting the total', () => {
  const queue = noFacesReviewQueue(noFaceReviews, noFacePhotos);
  const fresh = { reviews: noFaceReviews.filter(review => review.id !== 'new-a'), photos: noFacePhotos };
  assert.equal(nextReviewCard(queue, 0, fresh, true), 1);
  assert.equal(nextReviewCard(queue, 1, { ...fresh, photos: noFacePhotos.filter(photo => photo.id !== 'new-b') }, true), 2);
  assert.equal(nextReviewCard(queue, 1, { ...fresh, photos: noFacePhotos.map(photo => ({ ...photo, faceCount: 1 })) }, true), 2);
  assert.equal(nextReviewCard(queue, 0, { reviews: noFaceReviews, photos: noFacePhotos }, true), 0); // failed save stays here
  assert.equal(afterReviewStage(false), 'no-faces-intro'); // no face matches still lead to step 3
  assert.equal(afterReviewStage(true), 'new-people-intro');
});

const bundle = await build({ entryPoints: [new URL('../src/PhotoReviewWizard.jsx', import.meta.url).pathname], bundle: true, write: false,
  format: 'cjs', platform: 'node', external: ['react', 'react-dom'], loader: { '.css': 'empty', '.png': 'dataurl' },
  define: { 'import.meta.env': '{"VITE_WEB_DEV_MODE":"mock"}' } });
const module = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { default: Wizard, ReviewCard, ReviewSteps } = module.exports;

test('all three photo review modes expose personal albums and retain staged links on reopening', () => {
  for (const mode of ['faces', 'no-faces', 'new-person']) {
    const draft = { changes: [], edits: [], albums: [{ name: 'Verano' }] };
    const html = renderToStaticMarkup(React.createElement(ReviewCard, {
      review: { id: 'review', ...(mode === 'no-faces' ? {} : { faceId: 'face' }) },
      groupPerson: mode === 'new-person' ? { id: 'new' } : undefined,
      photo: { id: 'photo', name: 'Photo', folderIds: ['family-album'] }, people: [], position: 1, total: 2, s: photoStrings('es'),
      albumOptions: reviewAlbumOptions(folders, { photo: draft }), draft,
    }));
    assert.match(html, /Añadir a álbum personal/);
    assert.match(html, /Nuevo álbum personal/);
    assert.match(html, /Familia \/ Viaje/);
    assert.match(html, /Verano · pendiente de validar/);
    assert.match(html, /Deshacer la incorporación a «Verano»/);
    assert.match(html, /✓ Familia/);
    assert.doesNotMatch(html, /AI only/);
    if (mode === 'faces') assert.match(html, /← Desconocido/); // linking an album must not decide the identity
  }
});

test('third step exposes face editing, rotation, resizing and zoom immediately, alongside the next action', () => {
  const s = photoStrings('es');
  const html = renderToStaticMarkup(React.createElement(ReviewCard, {
    review: noFaceReviews[0], photo: { ...noFacePhotos[0], name: 'Paisaje', relativePath: 'test.png' }, people: [], position: 2, total: 5, s,
  }));
  assert.match(html, /Foto 2 de 5/);
  assert.match(html, /Marcar como revisada/);
  assert.match(html, /Quitar referencia de Nuevas/);
  assert.match(html, /Borrar la imagen de Galería/);
  for (const label of [s.addFace, s.reviewRotateLeft, s.reviewRotateRight, s.reviewResize, s.zoomIn, s.zoomOut, s.facesInPhoto]) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /Aprobar identidad|Identidad propuesta|← Desconocido|Volver a la tarjeta|photo-review-deck/);
  const steps = renderToStaticMarkup(React.createElement(ReviewSteps, { step: 3, s }));
  assert.match(steps, /aria-current="step"[^>]*><span>3<\/span>Fotos sin personas reconocidas/);
});

test('returning to a faceless photo keeps its staged person and image edits visible in the inline editor', () => {
  const html = renderToStaticMarkup(React.createElement(ReviewCard, {
    review: noFaceReviews[0], photo: { ...noFacePhotos[0], name: 'Paisaje', relativePath: 'test.png' }, people: [], position: 1, total: 2, s: photoStrings('es'),
    draft: { changes: [{ action: 'add', box: { x: .2, y: .3, width: .1, height: .2 }, name: 'Eva' }], edits: [{ rotate: 1 }, { scale: .8 }] },
  }));
  assert.match(html, /Eva/);
  assert.match(html, /Deshacer edición/);
  assert.match(html, /Anotar cambios y marcar revisada/);
  assert.doesNotMatch(html, /photo-review-deck/);
});

test('direct new-photo entry counts only New, and an empty person step still offers step three', () => {
  const s = photoStrings('es'), props = { s, Modal: ({ children }) => React.createElement('section', null, children),
    library: { photos: noFacePhotos, reviews: noFaceReviews, people: [], faces: { state: 'idle' } } };
  const direct = renderToStaticMarkup(React.createElement(Wizard, { ...props, mode: 'noFaces' }));
  assert.match(direct, /Fotos nuevas por revisar: 2/);
  assert.match(direct, /Revisar fotos nuevas/);
  const emptyPeople = renderToStaticMarkup(React.createElement(Wizard, { ...props, mode: 'review' }));
  assert.match(emptyPeople, /Siguiente: fotos sin personas reconocidas/);
  assert.doesNotMatch(emptyPeople, /¡Revisión terminada!/);
});

test('new people can reopen the fourth step even when there are no pending matches or faceless photos', () => {
  const html = renderToStaticMarkup(React.createElement(Wizard, { s: photoStrings('es'), mode: 'newPeople',
    Modal: ({ children }) => React.createElement('section', null, children),
    library: { photos: [], reviews: [], people: [{ id: 'new', name: 'Persona 1', photoIds: ['group'] }], faces: {} } }));
  assert.match(html, /Personas nuevas por identificar: 1/);
  assert.match(html, /aria-current="step"[^>]*><span>4<\/span>/);
});
