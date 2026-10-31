import { intlLocale } from './i18n/languages.js';
import { libraryScrollLabel } from './libraryScroll.js';
import { currentAge } from './personBirthday.js';

export const photoPersonPhotoCount = person => Array.isArray(person.photoIds) ? new Set(person.photoIds).size :
  Number.isFinite(person.photoCount) ? Math.max(0, person.photoCount) : 0;

export function sortPhotoPeople(people, field = 'name', direction = 'asc', language = 'es', today = new Date()) {
  const collator = new Intl.Collator(intlLocale(language), { sensitivity: 'base', numeric: true });
  const sign = direction === 'desc' ? -1 : 1;
  // Names are stored in one field: group by the first word before considering surnames.
  return people.map(person => ({ person, name: (person.name || '').trim(),
    firstName: (person.name || '').trim().split(/\s+/u)[0],
    age: currentAge(person.birthDate, today), count: photoPersonPhotoCount(person) }))
    .sort((a, b) => {
      const names = collator.compare(a.name, b.name);
      const fallback = names || b.count - a.count || collator.compare(a.person.id, b.person.id);
      if (field === 'age') {
        if (a.age === null || b.age === null) return Number(a.age === null) - Number(b.age === null) || fallback;
        return sign * (a.age - b.age) || fallback;
      }
      if (field === 'photoCount') return sign * (a.count - b.count) || fallback;
      return sign * collator.compare(a.firstName, b.firstName) || b.count - a.count ||
        sign * names || collator.compare(a.person.id, b.person.id);
    }).map(entry => entry.person);
}

export function photoPeopleScrollLabel(person, field = 'name', language = 'es', today = new Date()) {
  if (field === 'age') return String(currentAge(person.birthDate, today) ?? '—');
  if (field === 'photoCount') return String(photoPersonPhotoCount(person));
  return libraryScrollLabel(person, 'name', language);
}
