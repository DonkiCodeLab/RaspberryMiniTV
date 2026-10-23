import test from 'node:test';
import assert from 'node:assert/strict';
import { photoCountryView } from '../src/photoCountryView.js';

test('the minimap frames the country for photos on several continents and keeps the exact point in view', () => {
  for (const [code, latitude, longitude] of [
    ['ES', 41.3874, 2.1686], ['GB', 51.5074, -.1278], ['US', 40.7128, -74.006],
    ['BR', -23.5505, -46.6333], ['AU', -33.8688, 151.2093], ['JP', 35.6762, 139.6503],
    ['SG', 1.3521, 103.8198], ['ZA', -33.9249, 18.4241], ['LS', -29.31, 27.48],
  ]) {
    const result = photoCountryView({ latitude, longitude });
    assert.equal(result.code, code, `${latitude}, ${longitude}`);
    assert.equal(result.center[0], latitude);
    assert.ok(Math.abs(result.center[1] - longitude) % 360 < 1e-8);
    assert.ok(result.bounds[0][0] <= latitude && result.bounds[1][0] >= latitude);
    assert.ok(result.bounds[0][1] <= result.center[1] && result.bounds[1][1] >= result.center[1]);
    assert.equal(result.maxZoom, 7);
  }
});

test('overseas territory and dateline geometry do not turn the minimap into a world view', () => {
  const spain = photoCountryView({ latitude: 41.3874, longitude: 2.1686 });
  assert.ok(spain.bounds[1][0] - spain.bounds[0][0] < 12, 'Mainland photos use a country scale without distant islands widening it');
  const france = photoCountryView({ latitude: 48.8566, longitude: 2.3522 });
  assert.equal(france.code, 'FR');
  assert.ok(france.bounds[1][1] - france.bounds[0][1] < 20);
  assert.ok(france.bounds[0][0] > 35);
  const fiji = photoCountryView({ latitude: -18.1248, longitude: 178.4501 });
  assert.equal(fiji.code, 'FJ');
  assert.ok(fiji.bounds[1][1] - fiji.bounds[0][1] < 10);
});

test('missing and invalid GPS do not open a map, while zero coordinates and ocean points have a centered fallback', () => {
  for (const photo of [{}, { latitude: null, longitude: 0 }, { latitude: '41', longitude: 2 },
    { latitude: NaN, longitude: 2 }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 }]) assert.equal(photoCountryView(photo), null);
  for (const [latitude, longitude] of [[0, 0], [0, -140]]) {
    assert.deepEqual(photoCountryView({ latitude, longitude }), { center: [latitude, longitude], zoom: 5 });
  }
});
