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
