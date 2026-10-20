import test from 'node:test';
import assert from 'node:assert/strict';
import { watchPhotoLibrary } from '../src/photoLibraryRefresh.js';

function fixture(working = false) {
  let current = { revision: 'a', working }, status = { ...current }, allowed = true;
  let reads = 0, refreshes = 0, id = 0;
  const timers = new Map(), errors = [];
  const updates = watchPhotoLibrary({
    current: () => current, canCheck: () => allowed,
    readStatus: async () => { reads++; return status; },
    refresh: async () => { refreshes++; current = { ...status }; },
    onError: error => errors.push(error),
    schedule: (callback, delay) => { assert.equal(delay, 15000); timers.set(++id, callback); return id; },
    cancel: key => timers.delete(key),
  });
  return { updates, timers, errors, setStatus: value => { status = value; }, allow: value => { allowed = value; },
    counts: () => ({ reads, refreshes }) };
}

test('an idle library schedules no polls and focus probes do not reload unchanged data', async () => {
  const f = fixture(); f.updates.sync();
  assert.equal(f.timers.size, 0);
  await f.updates.check(); await f.updates.check();
  assert.deepEqual(f.counts(), { reads: 2, refreshes: 0 });
  assert.equal(f.timers.size, 0);
});

test('background work probes status and reloads only new revisions, then stops when complete', async () => {
  const f = fixture(true); f.updates.sync();
  assert.equal(f.timers.size, 1);
  await f.updates.check();
  assert.deepEqual(f.counts(), { reads: 1, refreshes: 0 });
  f.setStatus({ revision: 'b', working: true }); await f.updates.check();
  assert.deepEqual(f.counts(), { reads: 2, refreshes: 1 });
  assert.equal(f.timers.size, 1);
  f.setStatus({ revision: 'c', working: false }); await f.updates.check();
  assert.deepEqual(f.counts(), { reads: 3, refreshes: 2 });
  assert.equal(f.timers.size, 0);
});

test('hidden pages and the upload dialog suspend requests until the next visible check', async () => {
  const f = fixture(true); f.updates.sync();
  f.allow(false); f.updates.sync(); await f.updates.check();
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.counts(), { reads: 0, refreshes: 0 });
  f.allow(true); f.setStatus({ revision: 'new-import', working: false }); await f.updates.check();
  assert.deepEqual(f.counts(), { reads: 1, refreshes: 1 });
  assert.equal(f.timers.size, 0);
});

test('concurrent events share one probe and unmount prevents late refreshes', async () => {
  let resolve, reads = 0, refreshes = 0;
  const updates = watchPhotoLibrary({ current: () => ({ revision: 'a', working: false }), canCheck: () => true,
    readStatus: () => { reads++; return new Promise(done => { resolve = done; }); },
    refresh: async () => { refreshes++; }, onError: assert.fail,
    schedule: () => assert.fail('No timer after unmount'), cancel: () => {},
  });
  const pending = updates.check(); await updates.check(); updates.stop();
  resolve({ revision: 'b', working: false }); await pending;
  assert.equal(reads, 1); assert.equal(refreshes, 0);
});

test('face analysis refreshes progress frequently, then stops polling once paused', async () => {
  let current = { revision: 'a', working: true, faces: { running: true } }, scheduled;
  const updates = watchPhotoLibrary({ current: () => current, canCheck: () => true,
    readStatus: async () => ({ revision: 'b', working: false }),
    refresh: async () => { current = { revision: 'b', working: false, faces: { state: 'paused', running: false } }; },
    onError: assert.fail, schedule: (callback, delay) => { scheduled = delay; return 1; }, cancel: () => { scheduled = null; } });
  updates.sync(); assert.equal(scheduled, 2000);
  await updates.check(); assert.equal(scheduled, null);
  updates.stop();
});
