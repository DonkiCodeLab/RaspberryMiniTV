import test from 'node:test';
import assert from 'node:assert/strict';
import { saveFreeDownloadNames } from '../src/freeDownloadNames.js';

const draft = (path, name, directory = false) => ({
  path, originalName: path.split('/').at(-1), name, directory, error: '',
});

test('saving a directory edits changed files and folders only, preserving paths and unchanged entries', async () => {
  const entries = [draft('Pack/Season 1', 'Temporada 1', true), draft('Pack/film.mkv', 'Película.mkv'), draft('Pack/readme.txt', 'readme.txt')];
  const original = structuredClone(entries), calls = [];
  const result = await saveFreeDownloadNames('job', entries, async (id, change) => {
    calls.push({ id, ...change });
    return { job: { id }, path: `Pack/${change.name}`, name: change.name };
  });
  assert.deepEqual(calls, [
    { id: 'job', action: 'rename', path: 'Pack/Season 1', name: 'Temporada 1' },
    { id: 'job', action: 'rename', path: 'Pack/film.mkv', name: 'Película.mkv' },
  ]);
  assert.equal(result.saved, 2);
  assert.equal(result.failed, 0);
  assert.deepEqual(result.entries.map(entry => [entry.path, entry.originalName]), [
    ['Pack/Temporada 1', 'Temporada 1'], ['Pack/Película.mkv', 'Película.mkv'], ['Pack/readme.txt', 'readme.txt'],
  ]);
  assert.deepEqual(entries, original);
});

test('a failed name keeps its draft while other changes save; retry sends only the remaining change', async () => {
  const entries = [draft('Pack/one.mkv', 'Uno.mkv'), draft('Pack/two.mkv', 'Dos.mkv'), draft('Pack/Folder', 'Carpeta', true)];
  let active = 0, maxActive = 0;
  const result = await saveFreeDownloadNames('job', entries, async (id, change) => {
    active++; maxActive = Math.max(active, maxActive);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    if (change.path === 'Pack/two.mkv') throw new Error('El nombre ya existe.');
    return { job: { id }, path: `Pack/${change.name}`, name: change.name };
  });
  assert.equal(maxActive, 1);
  assert.equal(result.saved, 2);
  assert.equal(result.failed, 1);
  assert.deepEqual(result.entries[1], { ...entries[1], error: 'El nombre ya existe.' });
  const retried = [];
  const retry = await saveFreeDownloadNames('job', result.entries, async (id, change) => {
    retried.push(change);
    return { job: { id }, path: `Pack/${change.name}`, name: change.name };
  });
  assert.deepEqual(retried, [{ action: 'rename', path: 'Pack/two.mkv', name: 'Dos.mkv' }]);
  assert.equal(retry.saved, 1);
  assert.equal(retry.failed, 0);
  assert.ok(retry.entries.every(entry => !entry.error && entry.originalName === entry.name));
});

test('reverting a failed draft to its original name clears its error without a request', async () => {
  const entry = { ...draft('Pack/film.mkv', 'film.mkv'), error: 'Old error' };
  const result = await saveFreeDownloadNames('job', [entry], () => assert.fail('Unchanged name must not be sent'));
  assert.equal(result.saved, 0);
  assert.equal(result.failed, 0);
  assert.equal(result.entries[0].error, '');
});
