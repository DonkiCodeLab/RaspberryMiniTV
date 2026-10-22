import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestWithTimeout } from '../src/requestWithTimeout.js';

test('stalled metadata rejects and aborts the request', async () => {
  let signal;
  await assert.rejects(requestWithTimeout(s => { signal = s; return new Promise(() => {}); }, 5), /demasiado/);
  assert.equal(signal.aborted, true);
});
test('successful metadata and errors pass through', async () => {
  assert.deepEqual(await requestWithTimeout(async () => ({ id: 1 }), 50), { id: 1 });
  await assert.rejects(requestWithTimeout(async () => { throw Error('offline'); }), /offline/);
});

test('leaving the screen aborts pending requests even if the reader ignores cancellation', async () => {
  const controller = new AbortController();
  let signal;
  const pending = requestWithTimeout(s => { signal = s; return new Promise(() => {}); }, 1000, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(signal.aborted, true);
  let calls = 0;
  await assert.rejects(requestWithTimeout(() => { calls++; }, 1000, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 0);
});
