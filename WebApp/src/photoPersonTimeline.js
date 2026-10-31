import { photoDateValue, validPhotoDate } from './photoMetadata.js';
import { photoPersonName, UNKNOWN_PERSON_ID } from './photoLibrary.js';
import { daysInMonth } from './personBirthday.js';

// Calendar anniversaries, without converting EXIF dates to another timezone.
function completedMonths(start, end) {
  const [startYear, startMonth, startDay] = start.split('-').map(Number);
  const [endYear, endMonth, endDay] = end.split('-').map(Number);
  return (endYear - startYear) * 12 + endMonth - startMonth - (endDay < startDay ? 1 : 0);
}

// Called with validated calendar dates; shared by face labels and the age rail.
function gestationMonths(birthDate, day) {
  // An intentionally approximate nine-month window, not a known conception date.
  const start = new Date(`${birthDate}T12:00:00Z`), birthDay = start.getUTCDate();
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - 9);
  start.setUTCDate(Math.min(birthDay, daysInMonth(start.getUTCFullYear(), start.getUTCMonth() + 1)));
  return day < birthDate && day >= start.toISOString().slice(0, 10) ? 9 - completedMonths(day, birthDate) : null;
}

function photoAgeLabel(birthDate, takenAt, s) {
  const day = photoDateValue(takenAt);
  if (!validPhotoDate(birthDate) || !validPhotoDate(day)) return null;
  if (day < birthDate) {
    const months = gestationMonths(birthDate, day);
    if (months === null) return null;
    return months === 0 ? s.photoGestationUnderMonth :
      (months === 1 ? s.photoGestationOne : s.photoGestationMonths).replace('{months}', months);
  }
  const totalMonths = completedMonths(birthDate, day), years = Math.floor(totalMonths / 12), months = totalMonths % 12;
  const monthLabel = (months === 1 ? s.photoAgeMonthOne : s.photoAgeMonths).replace('{age}', months);
  let label;
  if (years) {
    label = (years === 1 ? s.photoAgeYearOne : s.photoAgeYears).replace('{age}', years);
    if (months) label = s.photoAgeYearsMonths.replace('{years}', label).replace('{months}', monthLabel);
  } else if (months) label = monthLabel;
  else {
    // The birth date is day one; count calendar days, unaffected by DST.
    const days = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${birthDate}T12:00:00Z`)) / 86400000) + 1;
    label = (days === 1 ? s.photoAgeDayOne : s.photoAgeDays).replace('{age}', days);
  }
  return s.photoAgeLabel.replace('{age}', label);
}

// Timeline years, with gestation grouped at -1; preserve the EXIF calendar day.
export function ageAtPhoto(birthDate, takenAt) {
  const day = photoDateValue(takenAt);
  if (!validPhotoDate(birthDate) || !validPhotoDate(day)) return null;
  if (day < birthDate) return gestationMonths(birthDate, day) === null ? null : -1;
  return Number(day.slice(0, 4)) - Number(birthDate.slice(0, 4)) - (day.slice(5) < birthDate.slice(5) ? 1 : 0);
}

export function photoFaceLabel(face, photo, person, s) {
  const name = photoPersonName(face, s) || s.unnamedFace;
  const age = (face.personId ?? face.id) === UNKNOWN_PERSON_ID ? null : photoAgeLabel(person?.birthDate ?? face.birthDate, photo?.takenAt, s);
  return age === null ? name : `${name} (${age})`;
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
