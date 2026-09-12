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
