import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readResponseWithProgress } from '../src/api/readResponseWithProgress.js';

for (const compressed of [false, true]) {
  test(`split UTF-8 and decoded progress (compressed: ${compressed})`, async () => {
    const expected = '{"title":"Película 📺"}';
    const bytes = new TextEncoder().encode(expected);
    const progress = [];
    const response = new Response(new ReadableStream({ start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    } }), { headers: compressed
      ? { 'Content-Encoding': 'gzip', 'Content-Length': '10', 'X-Decoded-Content-Length': String(bytes.length) }
      : { 'Content-Length': String(bytes.length) } });
    assert.equal(await readResponseWithProgress(response, value => progress.push(value)), expected);
    assert.equal(progress[1].completed, 1);
    assert.ok(progress.every(value => value.total === bytes.length));
    assert.deepEqual(progress.at(-1), { completed: bytes.length, total: bytes.length });
  });
}
test('unknown compressed length stays indeterminate until completion', async () => {
  const progress = [];
  await readResponseWithProgress(new Response('abc', { headers: { 'Content-Encoding': 'gzip', 'Content-Length': '23' } }), value => progress.push(value));
  assert.equal(progress[1].total, 0);
  assert.deepEqual(progress.at(-1), { completed: 3, total: 3 });
});
test('stream failures propagate', async () => {
  const response = new Response(new ReadableStream({ start(controller) { controller.error(new Error('disconnected')); } }));
  await assert.rejects(readResponseWithProgress(response, () => {}), /disconnected/);
});
