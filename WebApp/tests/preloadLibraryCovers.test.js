import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preloadLibraryCovers } from '../src/preloadLibraryCovers.js';

test('preloads both libraries with at most six concurrent images and deduplicates URLs', async () => {
  let active = 0, maximum = 0;
  const loaded = [];
  await preloadLibraryCovers([...Array.from({length: 20}, (_, i) => `cover-${i}`), 'cover-0', ''], {
    createImage: () => ({ set src(url) {
      active++; maximum = Math.max(maximum, active);
      queueMicrotask(() => { active--; loaded.push(url); this.onload(); });
    } })
  });
  assert.equal(loaded.length, 20);
  assert.equal(maximum, 6);
});

test('broken or stalled covers do not trap the loading dialog', async () => {
  await preloadLibraryCovers(['broken'], { createImage: () => ({ set src(url) { if(url) queueMicrotask(() => this.onerror()); } }) });
  await preloadLibraryCovers(['stalled'], { timeoutMs: 5, createImage: () => ({}) });
  const controller = new AbortController();
  controller.abort();
  await preloadLibraryCovers(['unused'], { signal: controller.signal, createImage: () => { throw Error('cancelled'); } });
});

test('reports named pending covers and separates success, errors and timeouts without logging PINs', async () => {
  const events = [], progress = [];
  await preloadLibraryCovers([
    { url: 'http://local/good.jpg?pin=secret', name: 'Película: Good' },
    { url: 'http://local/broken.jpg?pin=secret', name: 'Serie: Broken' },
    { url: 'http://local/stalled.jpg?pin=secret', name: 'Película: Stalled' },
  ], {
    timeoutMs: 10,
    log: (event, data) => events.push({ event, data }),
    onProgress: value => progress.push(value),
    createImage: () => ({ set src(url) {
      if (url.includes('good')) queueMicrotask(() => this.onload?.());
      if (url.includes('broken')) queueMicrotask(() => this.onerror?.());
    } }),
  });
  assert.ok(progress.some(p => p.active.some(item => item.name === 'Película: Stalled')));
  assert.deepEqual(progress.at(-1), { completed: 3, total: 3, loaded: 1, failed: 1, timedOut: 1, active: [] });
  assert.equal(JSON.stringify(events).includes('secret'), false);
  assert.ok(events.some(e => e.event === 'Portada: tiempo agotado' && e.data.name === 'Película: Stalled'));
});

test('decode and load callbacks count once and cancellation is not counted as success', async () => {
  let latest;
  await preloadLibraryCovers(['good'], {
    log: () => {}, onProgress: p => latest = p,
    createImage: () => ({ decode: () => Promise.resolve(), set src(url) { queueMicrotask(() => this.onload?.()); } }),
  });
  assert.equal(latest.loaded, 1);
  const controller = new AbortController();
  const task = preloadLibraryCovers(['pending'], { signal: controller.signal, log: () => {}, onProgress: p => latest = p, createImage: () => ({}) });
  controller.abort();
  await task;
  assert.equal(latest.loaded, 0);
  assert.equal(latest.completed, 0);
  assert.deepEqual(latest.active, []);
});

test('cards reuse the decoded preload image without assigning src again', async () => {
  const { acquireLibraryCover } = await import('../src/preloadLibraryCovers.js');
  let assigned = 0, decoded = false;
  const image = { parentElement: null, decode: async () => { decoded = true; }, set src(value) { assigned++; this.url = value; }, get src() { return this.url; } };
  await preloadLibraryCovers(['reuse-cover'], { createImage: () => image, log: () => {} });
  assert.equal(decoded, true);
  assert.equal(acquireLibraryCover('reuse-cover'), image);
  assert.equal(assigned, 1);
  image.parentElement = {};
  const duplicate = acquireLibraryCover('reuse-cover', () => ({}));
  assert.notEqual(duplicate, image);
  image.parentElement = null;
  assert.equal(acquireLibraryCover('reuse-cover'), image);
  assert.equal(assigned, 1);
});

test('preload waits for decoding even if load fires first', async () => {
  let resolveDecode, finished = false;
  const task = preloadLibraryCovers(['decode-first'], {
    log: () => {}, createImage: () => ({
      decode: () => new Promise(resolve => { resolveDecode = resolve; }),
      set src(value) { queueMicrotask(() => this.onload?.()); },
    }),
  }).then(() => { finished = true; });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(finished, false);
  resolveDecode();
  await task;
  assert.equal(finished, true);
});
