export function indexPhotoReviews(reviews = []) {
  const byPhoto = new Map(), byPerson = new Map(), matchPhotoIds = new Set(), noFacePhotoIds = new Set();
  for (const review of reviews) {
    if (!byPhoto.has(review.photoId)) byPhoto.set(review.photoId, []);
    byPhoto.get(review.photoId).push(review);
    if (review.faceId && review.personId) {
      matchPhotoIds.add(review.photoId);
      if (!byPerson.has(review.personId)) byPerson.set(review.personId, new Set());
      byPerson.get(review.personId).add(review.photoId);
    } else if (!review.faceId) noFacePhotoIds.add(review.photoId);
  }
  return { byPhoto, byPerson, matchPhotoIds, noFacePhotoIds };
}

export function reviewsForPhotos(reviews, photos, personId) {
  const ids = new Set(photos.map(photo => photo.id));
  return (reviews || []).filter(review => ids.has(review.photoId) && (!personId || review.personId === personId));
}

export function pendingFacePreview(photoId, reviews, people) {
  const faces = [], names = new Set();
  for (const review of reviews) {
    const person = people.find(person => person.id === review.personId);
    if (!person) continue;
    names.add(person.name);
    const face = person.faceBoxes?.[photoId]?.find(face => face.id === review.faceId);
    if (face) faces.push({ ...face, personId: person.id, name: person.name, birthDate: person.birthDate });
  }
  return { name: [...names].join(', '), faceBoxes: { [photoId]: faces } };
}
