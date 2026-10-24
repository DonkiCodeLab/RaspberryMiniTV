import { facePortraitLayout } from './photoFacePortrait.js';

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
