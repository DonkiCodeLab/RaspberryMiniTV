import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { afterReviewStage, attachReviewSwipe, faceReviewQueue, nextReviewCard, noFacesReviewQueue, newPersonReviewHandled, reviewBatchPhotos, reviewChanges, reviewIsCurrent, reviewSwipeAction } from '../src/photoReviewWizard.js';
import { photoStrings } from '../src/photoStrings.js';

const photos = [{ id: 'family' }, { id: 'older' }];
const reviews = [
  { id: 'ana', photoId: 'family', faceId: 'a', personId: 'ana', batchId: 'new' },
  { id: 'luis', photoId: 'family', faceId: 'b', personId: 'luis', batchId: 'new' },
  { id: 'old', photoId: 'older', faceId: 'c', personId: 'ana', batchId: 'old' },
  { id: 'none', photoId: 'family', faceId: null, batchId: 'new' },
  { id: 'missing', photoId: 'deleted', faceId: 'd', batchId: 'new' },
];
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

test('third step shows photo counter and reviewed action instead of face identity decisions', () => {
  const s = photoStrings('es');
  const html = renderToStaticMarkup(React.createElement(ReviewCard, {
    review: noFaceReviews[0], photo: { ...noFacePhotos[0], name: 'Paisaje', relativePath: 'test.png' }, people: [], position: 2, total: 5, s,
  }));
  assert.match(html, /Foto 2 de 5/);
  assert.match(html, /Marcar como revisada/);
  assert.match(html, /Quitar referencia de Nuevas/);
  assert.match(html, /Borrar la imagen de Galería/);
  assert.doesNotMatch(html, /Aprobar identidad|Identidad propuesta|← Desconocido/);
  const steps = renderToStaticMarkup(React.createElement(ReviewSteps, { step: 3, s }));
  assert.match(steps, /aria-current="step"[^>]*><span>3<\/span>Fotos sin personas reconocidas/);
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
