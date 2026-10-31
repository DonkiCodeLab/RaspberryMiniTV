import test from 'node:test';
import assert from 'node:assert/strict';
import { photoCoordinates, pendingGps } from '../src/gps.ts';

test('GPS de la fototeca admite ceros y coordenadas numéricas de versiones antiguas', () => {
  assert.deepEqual(photoCoordinates({ latitude: 0, longitude: 0 }), { latitude: 0, longitude: 0 });
  assert.deepEqual(photoCoordinates({ latitude: '41.38', longitude: '2.17' }), { latitude: 41.38, longitude: 2.17 });
  assert.deepEqual(photoCoordinates({ latitude: -90, longitude: 180 }), { latitude: -90, longitude: 180 });
  for (const value of [null, {}, { latitude: null, longitude: null }, { latitude: '', longitude: ' ' },
    { latitude: true, longitude: false }, { latitude: NaN, longitude: 0 }, { latitude: 1, longitude: Infinity },
    { latitude: 91, longitude: 0 }, { latitude: 0, longitude: -181 }]) assert.equal(photoCoordinates(value), null);
});

test('GPS EXIF del selector y la fototeca conserva los hemisferios sin inventar coordenadas', () => {
  assert.deepEqual(photoCoordinates(null, { GPSLatitude: 33.5, GPSLatitudeRef: 'S', GPSLongitude: '70.5', GPSLongitudeRef: 'W' }), { latitude: -33.5, longitude: -70.5 });
  assert.deepEqual(photoCoordinates(null, { '{GPS}': { Latitude: [33, 30, 0], LatitudeRef: 'N', Longitude: [70, 30, 0], LongitudeRef: 'E' } }), { latitude: 33.5, longitude: 70.5 });
  assert.deepEqual(photoCoordinates({ latitude: 41, longitude: 2 }, { GPSLatitude: 1, GPSLongitude: 1 }), { latitude: 41, longitude: 2 });
  for (const exif of [null, {}, { GPSLatitude: 1 }, { GPSLatitude: '', GPSLongitude: '' },
    { GPSLatitude: [33, 60, 0], GPSLongitude: 70 }, { GPSLatitude: 1, GPSLongitude: 1, GPSLongitudeRef: 'bad' }]) assert.equal(photoCoordinates(null, exif), null);
});

test('una exportación antigua sin evaluación GPS no se clasifica como sin ubicación', () => {
  assert.equal(pendingGps({}), 'unknown');
  assert.equal(pendingGps({}, 'without'), 'without');
  assert.equal(pendingGps({}, 'with'), 'unknown');
  assert.equal(pendingGps({ latitude: 0, longitude: 0 }), 'with');
});
