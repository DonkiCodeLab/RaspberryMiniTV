import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookCoverPreloadQueue, preloadBookLibraryCovers } from '../src/preloadBookLibraryCovers.js';

const books = Array.from({ length: 30 }, (_, i) => ({
  name: `Book ${String(i).padStart(2, '0')}`, relativePath: `book-${i}`, format: i < 15 ? 'epub' : 'cbz',
}));
const coverUrl = book => book.coverUrl || book.relativePath;

test('warms the first twelve entries of each tab before deeper books, including custom collection covers', () => {
  const queue = bookCoverPreloadQueue(books, {}, 'es', coverUrl);
  assert.deepEqual(queue.slice(0, 24).map(item => item.url), [
    ...books.slice(0, 12), ...books.slice(15, 27),
  ].map(coverUrl));
  assert.equal(queue.length, 30);
  const grouped = books.slice(0, 2).map(book => ({ ...book, collection: 'Saga' }));
  assert.deepEqual(bookCoverPreloadQueue(grouped, { Saga: { coverUrl: 'custom' } }, 'es', coverUrl)
    .map(item => item.url), ['custom', 'book-0', 'book-1']);
});

test('background batches load all covers with at most two requests, and cancellation stops later batches', async () => {
  let active = 0, maximum = 0, loaded = 0;
  await preloadBookLibraryCovers(books, {}, 'es', coverUrl, {
    log: () => {},
    createImage: () => ({ set src(url) {
      active++; maximum = Math.max(maximum, active);
      queueMicrotask(() => { active--; loaded++; this.onload?.(); });
    } }),
  });
  assert.equal(loaded, 30);
  assert.equal(maximum, 2);
  const controller = new AbortController();
  let requests = 0;
  await preloadBookLibraryCovers(books.map(book => ({ ...book, relativePath: `cancel-${book.relativePath}` })), {}, 'es', coverUrl, {
    signal: controller.signal, log: () => {},
    createImage: () => ({ set src(url) {
      if (url) { requests++; queueMicrotask(() => controller.abort()); }
    } }),
  });
  assert.equal(requests, 2);
});
