import test from 'node:test';
import assert from 'node:assert/strict';
import { ageAtPhoto, photoFaceLabel, personPhotoScrollLabel, sortPersonPhotos } from '../src/photoPersonTimeline.js';
import { photoStrings } from '../src/photoStrings.js';
import { photoPage } from '../src/photoLibrary.js';
import { buildDecadeTicks } from '../src/libraryScroll.js';

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
  for (const date of [null, undefined, '', 'unknown', '2020-02-30', Infinity, '1989-12-31']) assert.equal(ageAtPhoto('1990-01-01', date), null);
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
