import { photoDateValue, validPhotoDate } from './photoMetadata.js';
import { photoPersonName, UNKNOWN_PERSON_ID } from './photoLibrary.js';

// Use the capture's calendar day, preserving an EXIF timezone offset.
export function ageAtPhoto(birthDate, takenAt) {
  const day = photoDateValue(takenAt);
  if (!validPhotoDate(birthDate) || !validPhotoDate(day) || day < birthDate) return null;
  return Number(day.slice(0, 4)) - Number(birthDate.slice(0, 4)) - (day.slice(5) < birthDate.slice(5) ? 1 : 0);
}

export function photoFaceLabel(face, photo, person, s) {
  const name = photoPersonName(face, s) || s.unnamedFace;
  const age = (face.personId ?? face.id) === UNKNOWN_PERSON_ID ? null : ageAtPhoto(person?.birthDate ?? face.birthDate, photo?.takenAt);
  return age === null ? name : `${name} (${(age === 1 ? s.personAgeOne : s.personAge).replace('{age}', age)})`;
}

export function personPhotoScrollLabel(photo, birthDate, field = 'year') {
  if (field === 'age') return String(ageAtPhoto(birthDate, photo.takenAt) ?? '—');
  const date = photoDateValue(photo.takenAt);
  return validPhotoDate(date) ? date.slice(0, 4) : '—';
}

export function sortPersonPhotos(photos, birthDate, field = 'year', direction = 'asc') {
  const sign = direction === 'desc' ? -1 : 1;
  return photos.map(photo => {
    const date = photoDateValue(photo.takenAt);
    const day = validPhotoDate(date) ? date : '';
    const time = typeof photo.takenAt === 'number' ? photo.takenAt * 1000 : Date.parse(photo.takenAt);
    return { photo, day, time: day && Number.isFinite(time) ? time : 0, value: field === 'age' ? ageAtPhoto(birthDate, photo.takenAt) : day ? Number(day.replaceAll('-', '')) : null };
  }).sort((a, b) => {
    if (a.value === null || b.value === null) {
      const missing = Number(a.value === null) - Number(b.value === null);
      if (missing) return missing;
    }
    return sign * ((a.value ?? 0) - (b.value ?? 0) || a.day.localeCompare(b.day) || a.time - b.time) ||
      String(a.photo.name).localeCompare(String(b.photo.name), undefined, { numeric: true }) || String(a.photo.id).localeCompare(String(b.photo.id));
  }).map(entry => entry.photo);
}
