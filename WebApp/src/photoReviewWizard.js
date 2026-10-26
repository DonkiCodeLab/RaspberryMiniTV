import { isNewPhotoPerson, photosWithoutPeople } from './photoLibrary.js';
import { validNewPersonName } from './photoPeopleBatch.js';

// A proposal is a single face; shared photos must not collapse distinct identities.
export function faceReviewQueue(reviews = [], photos = [], batchId) {
  const available = new Set(photos.map(photo => photo.id));
  return reviews.filter(review => review.faceId && available.has(review.photoId) &&
    (batchId === undefined || review.batchId === batchId));
}

// Only pending no-face tokens belong to New; historical photos have no token.
export function noFacesReviewQueue(reviews = [], photos = [], batchId) {
  const available = new Set(photosWithoutPeople(photos).map(photo => photo.id)), seen = new Set();
  return reviews.filter(review => {
    if (review.faceId || review.reviewed || !available.has(review.photoId) || seen.has(review.photoId) ||
      batchId !== undefined && review.batchId !== batchId) return false;
    seen.add(review.photoId);
    return true;
  });
}

export function reviewIsCurrent(review, details) {
  return !!details && (review.faceId ? details.faces.some(face => face.id === review.faceId && face.reviewId === review.id) :
    details.noFacesReviewId === review.id && details.faces.length === 0);
}

export function nextReviewCard(queue, cursor, fresh, withoutFaces = false) {
  const valid = new Set((withoutFaces ? noFacesReviewQueue : faceReviewQueue)(fresh.reviews, fresh.photos).map(review => review.id));
  while (cursor < queue.length && !valid.has(queue[cursor].id)) cursor++;
  return cursor;
}

export function afterReviewStage(withoutFaces) {
  return withoutFaces ? 'new-people-intro' : 'no-faces-intro';
}

export function newPeopleReviewQueue(library, batchOnly = false) {
  const ids = new Set(library.faces.batchPhotoIds || []);
  return library.people.filter(person => isNewPhotoPerson(person) &&
    (!batchOnly || person.photoIds.some(id => ids.has(id))));
}

// A group needs no further identity when every one of its faces was edited
// individually. Use the loaded faces, including detections without rectangles.
export function newPersonReviewHandled(person, drafts) {
  return person.photoIds.length > 0 && person.photoIds.every(photoId => {
    const draft = drafts[photoId];
    if (!draft) return false;
    if (draft.delete) return true;
    const faces = draft.sourceFaces?.filter(face => face.personId === person.id) || [];
    return faces.length > 0 && faces.every(face => draft.croppedFaceIds?.includes(face.id) || draft.changes.some(change =>
      change.faceId === face.id && (change.action === 'remove' || change.action === 'assign' &&
        (change.personId || validNewPersonName(change.name)))));
  });
}

export function reviewHandled(review, drafts) {
  const draft = drafts[review.photoId];
  return !!draft && (draft.delete || draft.reviewIds.includes(review.id) ||
    draft.croppedFaceIds?.includes(review.faceId) || draft.changes.some(change => change.faceId === review.faceId));
}

export function reviewBatchPhotos(drafts) {
  return Object.values(drafts).map(({ photoId, expectedPath, version, reviewIds, changes, edits, delete: remove }) =>
    ({ photoId, expectedPath, version, reviewIds, changes, edits, delete: !!remove }));
}

export function reviewChanges(assignments, additions) {
  return [...Object.entries(assignments).map(([faceId, value]) => ({ action: 'assign', faceId, ...value })),
    ...additions.map(({ assignment, box }) => ({ action: 'add', ...assignment, box }))];
}

export function reviewSwipeAction(x, y, width) {
  return Math.abs(x) >= Math.min(110, Math.max(60, width * .22)) && Math.abs(x) > Math.abs(y) * 1.3 ?
    (x > 0 ? 'approve' : 'unknown') : null;
}

export function attachReviewSwipe(element, onMove, onDecide) {
  let gesture = null, suppressClick = false;
  const reset = () => {
    const current = gesture; gesture = null;
    if (current && element.hasPointerCapture?.(current.id)) element.releasePointerCapture(current.id);
    onMove(0);
  };
  const down = event => {
    if (gesture) { suppressClick = true; reset(); return; }
    if (event.button !== 0 || event.isPrimary === false) return;
    suppressClick = false;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
    element.setPointerCapture?.(event.pointerId);
  };
  const move = event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const x = event.clientX - gesture.x, y = event.clientY - gesture.y;
    if (Math.hypot(x, y) > 10) suppressClick = true;
    if (Math.abs(x) > Math.abs(y)) onMove(x);
  };
  const up = event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const action = reviewSwipeAction(event.clientX - gesture.x, event.clientY - gesture.y, element.getBoundingClientRect().width);
    reset();
    if (action) { suppressClick = true; onDecide(action); }
  };
  const click = event => { if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; } };
  const listeners = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: reset, lostpointercapture: reset, click };
  for (const [type, listener] of Object.entries(listeners)) element.addEventListener(type, listener, type === 'click');
  return () => { for (const [type, listener] of Object.entries(listeners)) element.removeEventListener(type, listener, type === 'click'); reset(); };
}
