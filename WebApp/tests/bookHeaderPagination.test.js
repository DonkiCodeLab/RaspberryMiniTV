import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncEpubPreviewPages } from '../src/bookHeaderPagination.js';

function rendition(page = 1, total = 6) {
  return {
    page, calls: [],
    async currentLocation() {
      return {
        start: { cfi: `start:${this.page}` }, end: { cfi: `end:${this.page}` },
        atStart: this.page === 1, atEnd: this.page === total,
      };
    },
    async display(cfi) {
      this.calls.push(['display', cfi]);
      const [edge, value] = cfi.split(':');
      // A CFI at the leading column boundary may resolve to the preceding page.
      this.page = Math.max(1, Number(value) - (edge === 'start' ? 1 : 0));
    },
    async next() { this.calls.push(['next']); this.page = Math.min(total, this.page + 1); },
    async prev() { this.calls.push(['prev']); this.page = Math.max(1, this.page - 1); },
  };
}

test('preparing adjacent EPUB pages never moves or restores the leading page', async () => {
  const readers = [rendition(3), rendition(), rendition()];
  const slots = readers.map(() => ({ hidden: false }));
  const state = await syncEpubPreviewPages(readers, slots);
  assert.deepEqual(readers.map(reader => reader.page), [3, 4, 5]);
  assert.deepEqual(readers[0].calls, []);
  assert.deepEqual(state, { cfi: 'start:3', start: false, end: false });
});

test('all EPUB pages remain reachable forwards and backwards, including both boundaries', async () => {
  const readers = [rendition(2), rendition()];
  const slots = readers.map(() => ({ hidden: false }));
  let state = await syncEpubPreviewPages(readers, slots);
  const visited = new Set(readers.map(reader => reader.page));
  for (let first = 3; first <= 5; first++) {
    assert.equal(state.end, false);
    await readers[0].next();
    state = await syncEpubPreviewPages(readers, slots);
    assert.deepEqual(readers.map(reader => reader.page), [first, first + 1]);
    readers.forEach(reader => visited.add(reader.page));
  }
  assert.equal(state.end, true);
  for (let first = 4; first >= 1; first--) {
    assert.equal(state.start, false);
    await readers[0].prev();
    state = await syncEpubPreviewPages(readers, slots);
    assert.deepEqual(readers.map(reader => reader.page), [first, first + 1]);
    readers.forEach(reader => visited.add(reader.page));
  }
  assert.equal(state.start, true);
  assert.equal(state.end, false);
  assert.deepEqual([...visited].sort(), [1, 2, 3, 4, 5, 6]);
});

test('trailing slots hide at the end and reappear on return', async () => {
  const readers = [rendition(5), rendition(), rendition()];
  const slots = readers.map(() => ({ hidden: false }));
  assert.equal((await syncEpubPreviewPages(readers, slots)).end, true);
  assert.deepEqual(slots.map(slot => slot.hidden), [false, false, true]);
  await readers[0].prev();
  await syncEpubPreviewPages(readers, slots);
  assert.deepEqual(readers.map(reader => reader.page), [4, 5, 6]);
  assert.deepEqual(slots.map(slot => slot.hidden), [false, false, false]);
});

test('a single page uses its own beginning and end state', async () => {
  const reader = rendition(1, 1);
  assert.deepEqual(await syncEpubPreviewPages([reader], [{ hidden: false }]), { cfi: 'start:1', start: true, end: true });
});

test('a disposed preview stops before navigating the next slot', async () => {
  let disposed = false;
  const readers = [rendition(), rendition()];
  readers[1].display = async () => { disposed = true; };
  assert.equal(await syncEpubPreviewPages(readers, [{}, {}], () => disposed), null);
  assert.deepEqual(readers[1].calls, []);
});
