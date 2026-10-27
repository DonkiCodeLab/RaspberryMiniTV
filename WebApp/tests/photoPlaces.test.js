import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaceResolver, placeKey, placeLabel } from '../src/photoPlaces.js';

const barcelona = { status: 'found', city: 'Barcelona', country: 'Spain', countryCode: 'ES' };
const point = { latitude: 41.385012, longitude: 2.173012 };

test('place keys support zero and reject invalid or absent GPS', () => {
  assert.equal(placeKey(point), '41.3850,2.1730');
  assert.equal(placeKey({ latitude: -0.000001, longitude: 0 }), '0.0000,0.0000');
  for (const invalid of [{}, { latitude: null, longitude: 0 }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: NaN }]) {
    assert.equal(placeKey(invalid), '');
  }
});

test('place labels translate countries, preserve local city names and allow partial results', () => {
  assert.equal(placeLabel(barcelona, 'es'), 'Barcelona, España');
  assert.equal(placeLabel(barcelona, 'ca'), 'Barcelona, Espanya');
  assert.equal(placeLabel(barcelona, 'en'), 'Barcelona, Spain');
  assert.equal(placeLabel({ status: 'found', country: 'Atlantis' }, 'es'), 'Atlantis');
  assert.equal(placeLabel({ status: 'found', city: 'Singapore', country: 'Singapore' }, 'en'), 'Singapore');
  assert.equal(placeLabel({ status: 'unavailable' }, 'es'), '');
});

test('photo and map reuse one pending request and cached results; moving creates a new lookup', async () => {
  const calls = []; let complete;
  const resolver = createPlaceResolver(data => { calls.push(data); return new Promise(resolve => { complete = resolve; }); });
  const first = resolver.resolve(point), second = resolver.resolve({ ...point, latitude: 41.385013 });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { latitude: 41.385, longitude: 2.173 });
  complete(barcelona);
  assert.deepEqual(await first, barcelona);
  assert.deepEqual(await second, barcelona);
  assert.deepEqual(await resolver.resolve(point), barcelona);
  assert.equal(calls.length, 1);
  const madrid = { latitude: 40.4168, longitude: -3.7038 };
  assert.equal(resolver.peek(madrid), undefined);
  const moved = resolver.resolve(madrid);
  complete({ ...barcelona, city: 'Madrid' });
  assert.equal((await moved).city, 'Madrid');
  assert.equal(resolver.peek(point).city, 'Barcelona');
});

test('unavailable and throttled responses expire before being retried', async () => {
  let now = 0, calls = 0;
  const resolver = createPlaceResolver(async () => { calls++; throw new Error('Offline'); }, () => now);
  assert.equal((await resolver.resolve(point)).status, 'unavailable');
  await resolver.resolve(point); assert.equal(calls, 1);
  now = 60001; await resolver.resolve(point); assert.equal(calls, 2);
  const limited = createPlaceResolver(async () => { calls++; return { status: 'busy', retryAfter: 1.1 }; }, () => now);
  await limited.resolve(point); await limited.resolve(point); assert.equal(calls, 3);
  now += 1150; await limited.resolve(point); assert.equal(calls, 4);
  assert.equal((await limited.resolve({})).status, 'not_found'); assert.equal(calls, 4);
});
