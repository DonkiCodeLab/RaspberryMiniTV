import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { freeDownloadStrings } from '../src/freeDownloadStrings.js';
import { canStartFreeTorrent, hasTorrentLibraryUpdates, torrentLibraryVersion, upsertTorrentJob, torrentJobGroup } from '../src/torrentUtils.js';

test('standalone download requests need no title and preserve authenticated nested paths', async () => {
  const buildResult = await build({ entryPoints: [new URL('../src/api/raspberryApi.js', import.meta.url).pathname],
    bundle: true, write: false, format: 'esm', platform: 'browser', define: { 'import.meta.env': '{}' } });
  const api = await import(`data:text/javascript;base64,${Buffer.from(buildResult.outputFiles[0].text).toString('base64')}`);
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.window = { location: { hostname: 'raspberry', origin: 'http://raspberry' }, sessionStorage: { getItem: () => 'fixture-pin' } };
  globalThis.fetch = async (url, options) => {
    calls.push({ url: new URL(url), options });
    return { ok: true, text: async () => '{"job":{},"entries":[]}' };
  };
  try {
    const controller = new AbortController();
    await api.startMediaTorrent({ infoHash: 'a'.repeat(40), name: 'Dataset' }, undefined, { mediaType: 'generic', signal: controller.signal });
    assert.equal(calls[0].options.signal, controller.signal);
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.mediaType, 'generic');
    for (const key of ['movie', 'series', 'book']) assert.equal(body[key], undefined);
    await api.searchMediaTorrents('Dataset', undefined, { mediaType: 'generic' });
    assert.equal(calls[1].url.searchParams.get('mediaType'), 'generic');
    await api.getFreeDownloadContents('a'.repeat(40), 'Carpeta/Temporada 1/ñ');
    assert.equal(calls[2].url.searchParams.get('path'), 'Carpeta/Temporada 1/ñ');
    const selection = { action: 'import', path: 'Carpeta/film.mkv', mediaType: 'movies', media: { id: 123, name: 'Film' } };
    await api.changeFreeDownloadContents('a'.repeat(40), selection);
    assert.deepEqual(JSON.parse(calls[3].options.body), selection);
    await api.getMovieTorrents();
    assert.equal(calls[4].options.cache, 'no-store');
    for (const call of calls) assert.equal(call.options.headers['X-Web-Pin'], 'fixture-pin');
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});

test('confirmed downloads enter the list immediately without duplicating or losing other jobs', () => {
  const movie = { id: 'movie', mediaType: 'movies', state: 'complete', createdAt: 1 };
  const free = { id: 'free', name: 'Dataset', mediaType: 'generic', state: 'queued', createdAt: 2 };
  const original = [movie];
  const accepted = upsertTorrentJob(original, free);
  assert.deepEqual(original, [movie]);
  assert.deepEqual(accepted, [free, movie]);
  const progressed = { ...free, state: 'downloading', progress: 42 };
  assert.deepEqual(upsertTorrentJob(accepted, progressed), [progressed, movie]);
  for (const state of ['queued', 'downloading', 'paused', 'failed']) {
    assert.equal(torrentJobGroup({ ...free, state }), 'active');
  }
  for (const state of ['complete', 'cancelled']) {
    assert.equal(torrentJobGroup({ ...free, state }), 'generic');
  }
  assert.equal(torrentJobGroup(movie), 'history');
});

test('free search can reuse cancelled history and failed catalog attempts without hijacking active jobs', () => {
  assert.equal(canStartFreeTorrent(undefined), true);
  for (const mediaType of ['movies', 'series', 'books', 'generic', undefined]) {
    assert.equal(canStartFreeTorrent({ mediaType, state: 'cancelled' }), true);
    assert.equal(canStartFreeTorrent({ mediaType, state: 'complete' }), mediaType !== 'generic');
    assert.equal(canStartFreeTorrent({ mediaType, state: 'failed' }), mediaType !== 'generic');
    assert.equal(canStartFreeTorrent({ mediaType, state: 'failed', item: { relativePath: 'existing' } }), false);
    for (const state of ['queued', 'downloading', 'paused', 'importing', 'metadata']) {
      assert.equal(canStartFreeTorrent({ mediaType, state }), false);
    }
  }
});

test('each later import from a standalone download refreshes the library in other clients', () => {
  const job = { id: 'free', mediaType: 'generic', state: 'complete' };
  assert.equal(torrentLibraryVersion([job]), '');
  const first = torrentLibraryVersion([{ ...job, lastImportAt: 1 }]);
  const second = torrentLibraryVersion([{ ...job, lastImportAt: 2 }]);
  assert.ok(hasTorrentLibraryUpdates('', first));
  assert.ok(hasTorrentLibraryUpdates(first, second));
  assert.equal(hasTorrentLibraryUpdates(second, ''), false);
  for (const language of ['es', 'ca', 'en']) {
    for (const key of Object.keys(freeDownloadStrings('es'))) assert.ok(freeDownloadStrings(language)[key]);
  }
});
