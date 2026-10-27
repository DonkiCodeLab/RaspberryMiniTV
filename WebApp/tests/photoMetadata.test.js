import test from 'node:test';
import assert from 'node:assert/strict';
import { dateLabel, photoDateValue, photoMetadataPatch, validPhotoDate } from '../src/photoMetadata.js';

test('capture dates keep the photographed calendar day even with a timezone offset', () => {
  assert.equal(photoDateValue('1985-01-03T23:45:12-07:00'), '1985-01-03');
  assert.equal(dateLabel('1985-01-03T23:45:12-07:00', 'en', 'Unknown'), 'Jan 3, 1985');
  assert.equal(dateLabel(null, 'en', 'Unknown'), 'Unknown');
  assert.equal(dateLabel(0, 'en', 'Unknown'), 'Unknown');
  const uploaded = Date.parse('2024-01-01T23:30:00Z');
  assert.equal(dateLabel(uploaded / 1000, 'es', 'Unknown'), new Date(uploaded).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }));
  assert.equal(photoDateValue(0), '1970-01-01');
  assert.equal(photoDateValue(NaN), '');
  for (const value of ['0001-01-01', '1900-01-01', '2000-02-29', '2024-02-29']) assert.equal(validPhotoDate(value), true, value);
  for (const value of ['', null, '0000-01-01', '1900-02-29', '2023-02-29', '2024-04-31', '2024-1-1']) assert.equal(validPhotoDate(value), false, value);
});

test('date-only edits keep the time, offset and unrelated photo metadata', () => {
  const photo = { takenAt: '2022-08-17T23:45:12-07:00', latitude: 41, longitude: 2 };
  assert.deepEqual(photoMetadataPatch(photo, { takenAt: '1985-01-03' }), { takenAt: '1985-01-03T23:45:12-07:00' });
  assert.deepEqual(photoMetadataPatch({}, { takenAt: '1960-02-29' }), { takenAt: '1960-02-29' });
  assert.deepEqual(photoMetadataPatch(photo, { latitude: 0, longitude: -180 }), { latitude: 0, longitude: -180 });
  assert.equal(photo.latitude, 41);
});

test('metadata editing rejects partial GPS, invalid dates and unrelated fields', () => {
  for (const patch of [{}, [], null, { takenAt: '2023-02-29' }, { takenAt: null }, { latitude: 0 }, { longitude: 0 },
    { latitude: true, longitude: 0 }, { latitude: '41', longitude: 2 }, { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: 181 }, { latitude: null, longitude: null }, { latitude: NaN, longitude: 0 },
    { latitude: Infinity, longitude: 0 }, { name: 'New name' }]) assert.throws(() => photoMetadataPatch({}, patch));
});
