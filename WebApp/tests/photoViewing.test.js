import test from 'node:test';
import assert from 'node:assert/strict';
import { sortPhotos, photoPage } from '../src/photoLibrary.js';
import { createThumbnailQueue } from '../src/photoThumbnails.js';

test('date order uses capture instants, keeps unknown dates last both ways and does not mutate the catalogue', () => {
  const photos = [
    { id: 'unknown', name: 'a', takenAt: null },
    { id: 'recent', name: 'b', takenAt: '2024-03-01T00:30:00+01:00', uploadedAt: 1 },
    { id: 'old', name: 'c', takenAt: '2024-02-29T22:00:00Z', uploadedAt: 5 },
    { id: 'invalid', name: 'd', takenAt: 'broken' },
  ];
  assert.deepEqual(sortPhotos(photos).map(p => p.id), ['recent', 'old', 'unknown', 'invalid']);
  assert.deepEqual(sortPhotos(photos, 'takenAt', 'asc').map(p => p.id), ['old', 'recent', 'unknown', 'invalid']);
  assert.deepEqual(sortPhotos(photos, 'uploadedAt', 'desc').map(p => p.id), ['old', 'recent', 'unknown', 'invalid']);
  assert.equal(photos[0].id, 'unknown');
  const many = Array.from({length:220}, (_, i) => ({id:String(i), name:`photo ${i}`, takenAt:1700000000+i}));
  assert.equal(photoPage(sortPhotos(many), 2).items[0].id, '119');
  assert.equal(photoPage(sortPhotos(many, 'takenAt', 'asc'), 2).items[0].id, '100');
});

test('thumbnail requests are bounded and off-screen queued work can be cancelled before any transfer', async () => {
  const active = new Map(), started = [];
  const load = (url, signal) => new Promise((resolve, reject) => {
    started.push(url); active.set(url, resolve);
    signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), {once:true});
  });
  const request = createThumbnailQueue(load, 2), cancelled = new AbortController();
  const a = request('a'), b = request('b'), c = request('c', cancelled.signal), d = request('d');
  const rejection = assert.rejects(c, {name:'AbortError'});
  await new Promise(setImmediate);
  assert.deepEqual(started, ['a','b']);
  cancelled.abort(); await rejection;
  active.get('a')('a'); await a; await new Promise(setImmediate);
  assert.deepEqual(started, ['a','b','d']);
  active.get('b')('b'); active.get('d')('d'); await Promise.all([b,d]);
});

test('cancelling an in-flight thumbnail releases a slot for the new page', async () => {
  const controller = new AbortController(), started = [];
  const request = createThumbnailQueue((url, signal) => {
    started.push(url);
    if (url === 'new') return Promise.resolve(url);
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('cancelled','AbortError')), {once:true}));
  }, 1);
  const previous = request('old', controller.signal), next = request('new');
  const rejection = assert.rejects(previous, {name:'AbortError'});
  await new Promise(setImmediate); controller.abort(); await rejection;
  assert.equal(await next, 'new'); assert.deepEqual(started, ['old','new']);
});
