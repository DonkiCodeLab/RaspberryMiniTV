import { facePortraitLayout } from './photoFacePortrait.js';

// Match the full image's aspect ratio so face coordinates share its exact bounds.
export function personPreviewGeometry(anchor, image, viewport) {
  const ratio = image.width > 0 && image.height > 0 ? image.width / image.height : 4 / 3;
  const margin = Math.min(12, viewport.width / 4, viewport.height / 4);
  const width = Math.min(Math.max(460, anchor.width * 2.4), 720, viewport.width - margin * 2,
    Math.min(720, viewport.height * .8, viewport.height - margin * 2) * ratio);
  const height = width / ratio;
  return { width, height,
    left: Math.max(margin, Math.min(anchor.left + (anchor.width - width) / 2, viewport.width - width - margin)),
    top: Math.max(margin, Math.min(anchor.top + (anchor.height - height) / 2, viewport.height - height - margin)) };
}

export function personPreviewPhotos(person, photosById) {
  const ids = new Set(person.photoIds || []);
  const cover = [person.coverFace?.photoId, person.coverPhotoId].find(id => ids.has(id) && photosById.has(id));
  return [...new Set([cover, ...ids])].map(id => photosById.get(id)).filter(Boolean);
}

export function personPreviewFaces(person, photoId) {
  const faces = person.faceBoxes?.[photoId] || [];
  const cover = person.coverFace;
  const candidates = faces.length ? faces : cover?.photoId === photoId ? [cover] : [];
  return candidates.filter(face => facePortraitLayout(face.box, 1, 1))
    .map(face => ({ ...face, personId: person.id, name: person.name }));
}

export function visiblePersonFaces(faces, personId, showOtherFaces, selectedFaceId) {
  return !personId || showOtherFaces ? faces : faces.filter(face => face.personId === personId || face.id === selectedFaceId);
}
