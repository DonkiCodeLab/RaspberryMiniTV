import { intlLocale } from './i18n/languages.js';
import { libraryScrollLabel } from './libraryScroll.js';
import { currentAge } from './personBirthday.js';

const photoCount = person => new Set(person.photoIds || []).size;

export function sortPhotoPeople(people, field = 'name', direction = 'asc', language = 'es', today = new Date()) {
  const collator = new Intl.Collator(intlLocale(language), { sensitivity: 'base', numeric: true });
  const sign = direction === 'desc' ? -1 : 1;
  return people.map(person => ({ person, age: currentAge(person.birthDate, today), count: photoCount(person) }))
    .sort((a, b) => {
      const names = collator.compare(a.person.name || '', b.person.name || '');
      const fallback = names || b.count - a.count || collator.compare(a.person.id, b.person.id);
      if (field === 'age') {
        if (a.age === null || b.age === null) return Number(a.age === null) - Number(b.age === null) || fallback;
        return sign * (a.age - b.age) || fallback;
      }
      if (field === 'photoCount') return sign * (a.count - b.count) || fallback;
      return sign * names || b.count - a.count || collator.compare(a.person.id, b.person.id);
    }).map(entry => entry.person);
}

export function photoPeopleScrollLabel(person, field = 'name', language = 'es', today = new Date()) {
  if (field === 'age') return String(currentAge(person.birthDate, today) ?? '—');
  if (field === 'photoCount') return String(photoCount(person));
  return libraryScrollLabel(person, 'name', language);
}
