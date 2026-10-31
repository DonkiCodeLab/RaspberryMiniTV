import test from 'node:test';
import assert from 'node:assert/strict';
import { ageAtPhoto, photoAgeLabel, photoFaceLabel, personPhotoScrollLabel, personPhotoYearTicks, sortPersonPhotos } from '../src/photoPersonTimeline.js';
import { photoStrings } from '../src/photoStrings.js';
import { photoPage } from '../src/photoLibrary.js';
import { buildDecadeTicks } from '../src/libraryScroll.js';

test('cinema ages match face labels across gestation, newborn days, months and years', () => {
  for (const language of ['es', 'ca', 'en']) {
    const s = photoStrings(language), birthDate = '2020-05-10';
    for (const takenAt of ['2020-02-10', '2020-05-10', '2020-05-13', '2020-07-10', '2022-08-10T00:15:00+14:00']) {
      const age = photoAgeLabel(birthDate, takenAt, s);
      assert.ok(age);
      assert.equal(photoFaceLabel({ personId: 'ana', name: 'Ana', birthDate }, { takenAt }, undefined, s), `Ana (${age})`);
    }
    assert.equal(photoAgeLabel('', '2020-05-10', s), null);
    assert.equal(photoAgeLabel(birthDate, null, s), null);
    assert.equal(photoAgeLabel(birthDate, '2018-05-10', s), null);
  }
});

test('cinema year marks cover empty, single, same-year and long collections in either direction', () => {
  assert.deepEqual(personPhotoYearTicks([]), []);
  assert.deepEqual(personPhotoYearTicks([{ takenAt: '2020-05-10' }]), [{ label: '2020', index: 0, position: 0 }]);
  assert.deepEqual(personPhotoYearTicks([{}, {}]), [{ label: '—', index: 0, position: 0 }]);
  const photos = Array.from({ length: 230 }, (_, id) => ({ id, takenAt: `${1800 + id}-05-10` }));
  for (const direction of ['asc', 'desc']) {
    const sorted = sortPersonPhotos([...photos, { id: 'undated' }], '1800-05-10', 'year', direction);
    const ticks = personPhotoYearTicks(sorted);
    assert.ok(ticks.length <= 8);
    assert.equal(ticks[0].index, 0);
    assert.equal(ticks[0].label, direction === 'asc' ? '1800' : '2029');
    assert.deepEqual(ticks.at(-1), { label: '—', index: 230, position: 1 });
    for (const [i, tick] of ticks.entries()) {
      assert.equal(tick.label, personPhotoScrollLabel(sorted[tick.index]));
      if (i) assert.ok(tick.position - ticks[i - 1].position >= .16);
    }
  }
});

test('cinema year marks stay separated when most photos belong to a single year', () => {
  const photos = [...Array.from({ length: 1000 }, () => ({ takenAt: '2020-01-01' })), { takenAt: '2021-01-01' }, { takenAt: '2022-01-01' }, {}];
  assert.deepEqual(personPhotoYearTicks(photos), [{ label: '2020', index: 0, position: 0 }, { label: '—', index: 1002, position: 1 }]);
});

test('photo ages count completed years on the capture day, including birthdays, leap days and old photos', () => {
  assert.equal(ageAtPhoto('1990-05-10', '2014-05-09'), 23);
  assert.equal(ageAtPhoto('1990-05-10', '2014-05-10'), 24);
  assert.equal(ageAtPhoto('1990-05-10', '1990-05-10'), 0);
  assert.equal(ageAtPhoto('2000-02-29', '2001-02-28'), 0);
  assert.equal(ageAtPhoto('2000-02-29', '2001-03-01'), 1);
  assert.equal(ageAtPhoto('1850-10-23', '1880-10-23'), 30);
  assert.equal(ageAtPhoto('0001-01-01', '0099-12-31'), 98);
  assert.equal(ageAtPhoto('1960-01-01', 0), 10);
  assert.equal(ageAtPhoto('1950-01-01', -315619200), 10);
});

test('photo ages preserve the capture timezone and never invent an age for missing or inconsistent dates', () => {
  assert.equal(ageAtPhoto('1990-05-10', '2014-05-10T00:15:00+14:00'), 24);
  assert.equal(ageAtPhoto('1990-05-10', '2014-05-09T23:45:00-12:00'), 23);
  for (const birthDate of [null, '', 'unknown', '2000-02-30', '2020-01-01']) assert.equal(ageAtPhoto(birthDate, '2014-05-10'), null);
  for (const date of [null, undefined, '', 'unknown', '2020-02-30', Infinity, '1989-03-31']) assert.equal(ageAtPhoto('1990-01-01', date), null);
});

test('face labels use the assigned person and localized ages, preserving plain names when the age is unavailable', () => {
  const face = { personId: 'ana', name: 'Ana', birthDate: '1980-01-01' }, photo = { takenAt: '2014-05-10' };
  for (const language of ['es', 'en', 'ca']) {
    const s = photoStrings(language);
    assert.equal(photoFaceLabel(face, photo, { birthDate: '1990-05-10' }, s), `Ana (${s.personAge.replace('{age}', 24)})`);
    assert.equal(photoFaceLabel(face, photo, { birthDate: '2013-05-10' }, s), `Ana (${s.personAgeOne.replace('{age}', 1)})`);
    assert.equal(photoFaceLabel(face, {}, undefined, s), 'Ana');
    assert.equal(photoFaceLabel(face, photo, { birthDate: '' }, s), 'Ana');
    assert.equal(photoFaceLabel({ personId: 'unknown', name: 'Unknown', birthDate: '1980-01-01' }, photo, undefined, s), s.unknownPerson);
  }
});

test('face ages show completed years and months, using months alone before the first birthday', () => {
  const face = { personId: 'baby', name: 'Leo', birthDate: '2020-05-10' }, s = photoStrings('es');
  for (const [takenAt, expected] of [
    ['2020-06-09', '31 días'], ['2020-06-10', '1 mes'], ['2021-01-10', '8 meses'],
    ['2021-05-09', '11 meses'], ['2021-05-10', '1 año'], ['2021-06-10', '1 año y 1 mes'],
    ['2022-05-10', '2 años'], ['2022-06-10', '2 años y 1 mes'], ['2022-08-10', '2 años y 3 meses'],
    ['2022-08-09T23:59:00-12:00', '2 años y 2 meses'],
  ]) assert.equal(photoFaceLabel(face, { takenAt }, undefined, s), `Leo (${expected})`, takenAt);
});

test('newborn days start at one and respect calendar days, leap days, ancient years and EXIF offsets', () => {
  const s = photoStrings('es');
  for (const [birthDate, takenAt, expected] of [
    ['2024-02-28', '2024-02-28', '1 día'], ['2024-02-28', '2024-02-29', '2 días'],
    ['2024-02-28', '2024-03-01', '3 días'], ['2023-02-28', '2023-03-01', '2 días'],
    ['2026-03-28', '2026-03-30T00:15:00+02:00', '3 días'],
    ['2026-10-24', '2026-10-26T23:45:00-12:00', '3 días'],
    ['0099-12-31', '0100-01-01', '2 días'], ['0001-01-01', '0001-01-02', '2 días'],
    ['2024-01-31', '2024-02-29', '30 días'], ['2024-01-31', '2024-03-01', '1 mes'],
    ['2024-02-29', '2025-02-28', '11 meses'], ['2024-02-29', '2025-03-01', '1 año'],
  ]) assert.equal(photoFaceLabel({ personId: 'baby', name: 'Leo', birthDate }, { takenAt }, undefined, s), `Leo (${expected})`);
});

test('prenatal labels estimate gestation only inside the nine-month window before the stored birthday', () => {
  const face = { personId: 'baby', name: 'Leo', birthDate: '2026-10-31' }, s = photoStrings('es');
  for (const [takenAt, expected] of [
    ['2026-01-30', 'Leo'], ['2026-01-31', 'Leo (Menos de 1 mes de gestación (aprox.))'],
    ['2026-02-28', 'Leo (≈ 1 mes de gestación)'], ['2026-07-31', 'Leo (≈ 6 meses de gestación)'],
    ['2026-10-30T23:45:00-12:00', 'Leo (≈ 9 meses de gestación)'],
    ['2026-10-31T00:15:00+14:00', 'Leo (1 día)'],
    ['2026-11-01', 'Leo (2 días)'],
  ]) assert.equal(photoFaceLabel(face, { takenAt }, undefined, s), expected, takenAt);
  const monthEnd = { ...face, birthDate: '2026-11-30' };
  assert.equal(photoFaceLabel(monthEnd, { takenAt: '2026-02-27' }, undefined, s), 'Leo');
  assert.equal(photoFaceLabel(monthEnd, { takenAt: '2026-02-28' }, undefined, s), 'Leo (Menos de 1 mes de gestación (aprox.))');
  const prenatal = { takenAt: '2026-07-31' };
  assert.equal(photoFaceLabel(face, prenatal, { birthDate: '' }, s), 'Leo');
  assert.equal(photoFaceLabel({ ...face, personId: 'unknown' }, prenatal, undefined, s), s.unknownPerson);
});

test('detailed face ages and gestation labels use the selected language and the latest assigned birthday', () => {
  const face = { personId: 'baby', name: 'Leo', birthDate: '1980-01-01' }, person = { birthDate: '2020-05-10' };
  const dates = ['2020-05-10', '2020-05-11', '2020-06-10', '2021-01-10', '2021-06-10', '2022-08-10', '2020-02-10'];
  const cases = {
    es: ['1 día', '2 días', '1 mes', '8 meses', '1 año y 1 mes', '2 años y 3 meses', '≈ 6 meses de gestación'],
    en: ['1 day old', '2 days old', '1 month old', '8 months old', '1 year and 1 month old', '2 years and 3 months old', '≈ 6 months of gestation'],
    ca: ['1 dia', '2 dies', '1 mes', '8 mesos', '1 any i 1 mes', '2 anys i 3 mesos', '≈ 6 mesos de gestació'],
  };
  for (const [language, expected] of Object.entries(cases)) {
    const s = photoStrings(language);
    dates.forEach((takenAt, index) => assert.equal(photoFaceLabel(face, { takenAt }, person, s), `Leo (${expected[index]})`));
  }
});

test('person photos follow capture dates in either direction, independent of upload dates, with undated photos last', () => {
  const photos = [
    { id: 'late', name: 'A', takenAt: '2000-05-10T20:00:00+02:00', uploadedAt: 1 },
    { id: 'early', name: 'Z', takenAt: '2000-05-10T09:00:00+02:00', uploadedAt: 2 },
    { id: 'before', name: 'B', takenAt: '2000-05-09', uploadedAt: 999999 },
    { id: 'missing', name: 'C', uploadedAt: 9999999999 },
    { id: 'invalid', name: 'D', takenAt: '2000-02-30' },
  ];
  for (const field of ['year', 'age']) {
    assert.deepEqual(sortPersonPhotos(photos, '1990-05-10', field).map(p => p.id), ['before', 'early', 'late', 'missing', 'invalid']);
    assert.deepEqual(sortPersonPhotos(photos, '1990-05-10', field, 'desc').map(p => p.id), ['late', 'early', 'before', 'missing', 'invalid']);
  }
  assert.equal(photos[0].id, 'late');
});

test('the age rail groups every gestation photo at -1 and orders them by capture date before birth', () => {
  const birthDate = '2026-11-30';
  const photos = [
    { id: 'year', takenAt: '2027-11-30' }, { id: 'birth', takenAt: '2026-11-30T00:15:00+14:00' },
    { id: 'late', takenAt: '2026-11-29T23:45:00-12:00' }, { id: 'early', takenAt: '2026-02-28' },
    { id: 'middle', takenAt: '2026-08-30' }, { id: 'outside', takenAt: '2026-02-27' }, { id: 'missing' },
  ];
  const asc = sortPersonPhotos(photos, birthDate, 'age');
  assert.deepEqual(asc.map(photo => photo.id), ['early', 'middle', 'late', 'birth', 'year', 'missing', 'outside']);
  assert.deepEqual(asc.map(photo => personPhotoScrollLabel(photo, birthDate, 'age')), ['-1', '-1', '-1', '0', '1', '—', '—']);
  const desc = sortPersonPhotos(photos, birthDate, 'age', 'desc');
  assert.deepEqual(desc.map(photo => photo.id), ['year', 'birth', 'late', 'middle', 'early', 'outside', 'missing']);
  assert.deepEqual(desc.map(photo => personPhotoScrollLabel(photo, birthDate, 'age')), ['1', '0', '-1', '-1', '-1', '—', '—']);
  assert.equal(personPhotoScrollLabel(photos[3], birthDate, 'year'), '2026');
  assert.equal(personPhotoScrollLabel(photos[3], '', 'age'), '—');
});

test('year and age labels span the whole collection, including targets beyond the first page', () => {
  const photos = Array.from({ length: 230 }, (_, id) => ({ id: String(id), name: String(id), takenAt: `${1800 + id}-10-23` }));
  const sorted = sortPersonPhotos(photos, '1800-10-23');
  const years = sorted.map(photo => personPhotoScrollLabel(photo, '1800-10-23'));
  const target = buildDecadeTicks(years).find(tick => tick.label === '1990');
  assert.equal(target.index, 190);
  const page = photoPage(sorted, Math.floor(target.index / 100) + 1);
  assert.equal(page.items[target.index - page.offset].takenAt, '1990-10-23');
  assert.equal(personPhotoScrollLabel(sorted[0], '1800-10-23', 'age'), '0');
  assert.equal(personPhotoScrollLabel(sorted[190], '1800-10-23', 'age'), '190');
  assert.equal(personPhotoScrollLabel({ takenAt: '1990-01-01' }, '2000-01-01', 'age'), '—');
  assert.equal(personPhotoScrollLabel({}, '1800-10-23'), '—');
});
