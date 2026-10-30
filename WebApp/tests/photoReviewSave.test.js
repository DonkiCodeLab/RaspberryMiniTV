import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewSubmission, saveReviewSubmission, readReviewSnapshot, writeReviewSnapshot } from '../src/photoReviewSave.js';

const payload = () => ({ requestId: 'review-checkpoint-12345', photos: [
  { photoId: 'one', changes: [{ action: 'add', name: 'Eva' }] },
  { photoId: 'two', changes: [{ action: 'assign', faceId: 'face', name: 'Eva' }] },
], people: [{ id: 'group', name: 'Eva' }] });
const snapshot = () => { const p = payload(); return { step: 'faces-review', cursor: 12,
  drafts: Object.fromEntries(p.photos.map(photo => [photo.photoId, photo])), peopleDrafts: p.people,
  submission: reviewSubmission(p), committed: false }; };
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; };

test('a failed checkpoint keeps earlier saves and resumes only the remaining photos and groups', async () => {
  let state = snapshot(); const sent = [], session = storage(), local = storage();
  const checkpoint = next => { state = next; writeReviewSnapshot('review', next, session, local); };
  await assert.rejects(saveReviewSubmission(state, { checkpoint, send: async part => {
    sent.push(part); if (part.photos[0]?.photoId === 'two') throw new Error('HTTP 500');
  } }), /HTTP 500/);
  assert.equal(state.submission.next, 1);
  assert.deepEqual(Object.keys(state.drafts), ['two']);
  assert.equal(state.peopleDrafts.length, 1);
  // Closing the tab leaves the durable copy with the acknowledged position.
  state = readReviewSnapshot('review', storage(), local);
  const retried = [];
  state = await saveReviewSubmission(state, { checkpoint, send: async part => { retried.push(part); } });
  assert.deepEqual(retried[0], sent[1]);
  assert.equal(retried.length, 2);
  assert.equal(retried[1].people[0].id, 'group');
  assert.deepEqual(state.drafts, {}); assert.deepEqual(state.peopleDrafts, []);
  assert.equal(state.committed, true);
});

test('a lost response reuses the exact receipt key instead of repeating manual additions', async () => {
  let state = snapshot(), lost = true, writes = 0; const receipts = new Map();
  const send = async part => {
    if (!receipts.has(part.requestId)) { writes++; receipts.set(part.requestId, JSON.stringify(part)); }
    else assert.equal(receipts.get(part.requestId), JSON.stringify(part));
    if (lost) { lost = false; throw new Error('connection lost'); }
  };
  await assert.rejects(saveReviewSubmission(state, { send, checkpoint: next => { state = next; } }));
  assert.equal(state.submission.next, 0);
  state = await saveReviewSubmission(state, { send, checkpoint: next => { state = next; } });
  assert.equal(writes, 3); assert.equal(state.submission.next, 3);
  // A failed library refresh must not submit any saved operation again.
  await saveReviewSubmission(state, { send: () => assert.fail('already saved'), checkpoint: () => {} });
});

test('pause finishes and checkpoints the current item without starting another', async () => {
  let paused = false, state = snapshot(), calls = 0;
  state = await saveReviewSubmission(state, { send: async () => { calls++; paused = true; },
    paused: () => paused, checkpoint: next => { state = next; } });
  assert.equal(calls, 1); assert.equal(state.submission.next, 1);
  assert.deepEqual(Object.keys(state.drafts), ['two']);
});

test('legacy drafts check their original receipt before splitting or resubmitting', async () => {
  for (const found of [true, false]) {
    let state = { ...snapshot(), submission: payload() }, checked = false; const sent = [];
    state = await saveReviewSubmission(state, { receipt: async id => {
      assert.equal(id, payload().requestId); checked = true; return { found };
    }, send: async part => { assert.equal(checked, true); sent.push(part); }, checkpoint: next => { state = next; } });
    assert.equal(sent.length, found ? 0 : 3);
    assert.deepEqual(state.drafts, {}); assert.equal(state.committed, true);
  }
});

test('storage loss stops before another operation and keeps the remaining draft in memory', async () => {
  let state = snapshot(), calls = 0;
  await assert.rejects(saveReviewSubmission(state, { send: async () => { calls++; },
    checkpoint: next => { state = next; throw new Error('storage full'); } }), /storage full/);
  assert.equal(calls, 1); assert.equal(state.submission.next, 1);
  assert.deepEqual(Object.keys(state.drafts), ['two']);
});

test('draft storage migrates old tabs, tolerates one blocked store and chooses the latest checkpoint', () => {
  const session = storage(), local = storage(), blocked = { getItem() { throw Error(); }, setItem() { throw Error(); } };
  session.setItem('review', JSON.stringify({ step: 'no-faces-confirm', drafts: { original: {} } }));
  assert.deepEqual(readReviewSnapshot('review', session, local).drafts, { original: {} });
  writeReviewSnapshot('review', snapshot(), blocked, local);
  assert.equal(readReviewSnapshot('review', session, local).step, 'faces-review');
  assert.equal(readReviewSnapshot('review', blocked, local).step, 'faces-review');
  assert.throws(() => writeReviewSnapshot('review', snapshot(), blocked, blocked));
});
