import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { hashPhoto, HASH_CHUNK_BYTES } from '../src/photoHash.js';
import { createPhotoHasher, transferPhotoBatch } from '../src/photoImportTransfer.js';

const entry = (text, name = 'same.jpg') => ({ file: new File([text], name), metadata: { title: text }, raw: { original: text } });
const options = { importData: { session: 'session', batch: '0', geolocatedOnly: true }, albumName: 'Mac' };

test('incremental SHA-256 matches independent vectors without Web Crypto and reads bounded chunks', async () => {
  for (const bytes of [Buffer.alloc(0), Buffer.from('abc'), Buffer.alloc(HASH_CHUNK_BYTES * 3 + 17, 219)]) {
    const blob = new Blob([bytes]), reads = [], progress = [];
    const file = { size: blob.size, slice(start, end) { reads.push(end - start); return blob.slice(start, end); } };
    const digest = await hashPhoto(file, done => progress.push(done));
    assert.equal(digest, createHash('sha256').update(bytes).digest('hex'));
    assert.ok(reads.every(size => size <= HASH_CHUNK_BYTES));
    if (bytes.length) assert.equal(progress.at(-1), bytes.length);
  }
});

test('reimport sends zero photo files while preserving every metadata record and receipt', async () => {
  const batch = [entry('photo A'), entry('photo B', 'renamed.jpg')];
  let uploaded;
  const response = await transferPhotoBatch(batch, options, {
    hash: hashPhoto,
    check: async digests => { assert.equal(digests.length, 2); return { missing: [] }; },
    upload: async value => { uploaded = value; return { imported: 0, duplicates: 2 }; },
  });
  assert.equal(response.duplicates, 2);
  assert.deepEqual(uploaded.files, []);
  assert.deepEqual(uploaded.importData.fileIndices, []);
  assert.deepEqual(uploaded.importData.records, batch.map(({ metadata, raw }) => ({ metadata, raw })));
  assert.equal(uploaded.importData.session, options.importData.session);
});

test('same filenames with different contents only send missing content and preserve failure indices', async () => {
  const batch = [entry('old'), entry('new'), entry('old', 'renamed.jpg')];
  const response = await transferPhotoBatch(batch, options, {
    hash: hashPhoto,
    check: async digests => { assert.equal(digests[0], digests[2]); assert.notEqual(digests[0], digests[1]); return { missing: [1] }; },
    upload: async data => {
      assert.deepEqual(data.files, [batch[1].file]);
      assert.deepEqual(data.importData.fileIndices, [1]);
      assert.equal(data.importData.records.length, 3);
      return { rejected: [{ index: 1 }], duplicates: 2 };
    },
  });
  assert.equal(response.rejected[0].index, 1);
});

test('a missing reference is rechecked once, then sent with the same receipt and no rehash', async () => {
  let attempts = 0, checks = 0, hashes = 0;
  const batch = [entry('new')];
  await transferPhotoBatch(batch, options, {
    hash: async file => { hashes++; return hashPhoto(file); },
    check: async () => ({ missing: checks++ ? [0] : [] }),
    upload: async data => {
      assert.equal(data.importData.batch, '0');
      if (!attempts++) { assert.equal(data.files.length, 0); throw Object.assign(new Error('Missing'), { status: 409 }); }
      assert.equal(data.files[0], batch[0].file); return { imported: 1 };
    },
  });
  assert.equal(hashes, 1); assert.equal(checks, 2); assert.equal(attempts, 2);
});

test('invalid preflight and connection errors never fall back to transferring all originals', async () => {
  for (const missing of [null, [true], [1], [0, 0], [-1]]) {
    await assert.rejects(transferPhotoBatch([entry('x')], options, { hash: hashPhoto,
      check: async () => ({ missing }), upload: async () => assert.fail('must not upload') }));
  }
  let checks = 0;
  await assert.rejects(transferPhotoBatch([entry('x')], options, { hash: hashPhoto,
    check: async () => { checks++; throw new Error('offline'); }, upload: async () => assert.fail('must not upload') }));
  assert.equal(checks, 1);
});

test('one worker caches immutable files for resume and is terminated on cancellation', async () => {
  const controller = new AbortController();
  let created = 0, posted = 0, terminated = 0;
  const worker = { postMessage() { posted++; queueMicrotask(() => this.onmessage({ data: { digest: 'a'.repeat(64) } })); }, terminate() { terminated++; } };
  const hasher = createPhotoHasher(controller.signal, () => { created++; return worker; });
  const file = entry('x').file;
  await hasher.hash(file); await hasher.hash(file);
  assert.equal(created, 1); assert.equal(posted, 1);
  worker.postMessage = () => {};
  const pending = hasher.hash(entry('y').file);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(hasher.hash(file), { name: 'AbortError' });
  assert.equal(terminated, 1);
});
