import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { awardTorrentBook, spanishBookTitle, bookTorrentStrings } from '../src/bookTorrentUtils.js';
import { torrentQuery, torrentJobTitle, hasTorrentLibraryUpdates, torrentLibraryVersion } from '../src/torrentUtils.js';

test('Spanish book query never falls back to original English title or edition year', () => {
  const book = { title: 'The Road', originalName: 'The Road', language: 'eng', year: '2006', localizedMetadata: { es: { title: 'La carretera' } } };
  assert.equal(spanishBookTitle(book), 'La carretera');
  assert.equal(torrentQuery({ ...book, spanishTitle: spanishBookTitle(book) }, 'books'), 'La carretera español');
  assert.equal(spanishBookTitle({ title: 'The Road', language: 'eng' }), '');
  assert.equal(spanishBookTitle({ title: 'La carretera', language: 'spa' }), 'La carretera');
  assert.equal(spanishBookTitle({ title: 'La carretera', language: '' }), '');
});

test('book download dashboard names and library refresh use imported book records', () => {
  const job = { id: 'a', state: 'downloading', mediaType: 'books', book: { name: 'La carretera' }, name: 'release.epub' };
  assert.equal(torrentJobTitle(job), 'La carretera');
  assert.equal(hasTorrentLibraryUpdates(torrentLibraryVersion([job]), torrentLibraryVersion([{ ...job, state: 'complete', item: { relativePath: 'Books/book.epub' } }])), true);
  for (const lang of ['es', 'ca', 'en']) assert.ok(bookTorrentStrings(lang).hint && bookTorrentStrings(lang).empty);
});

test('book torrent API posts Open Library identity without movie identifiers or untrusted artwork', async () => {
  const result = await build({ entryPoints: [new URL('../src/api/raspberryApi.js', import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'node', define: { 'import.meta.env': '{"VITE_RASPBERRY_API_BASE_URL":"http://raspberry.test"}' } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  const savedFetch = globalThis.fetch, savedWindow = globalThis.window;
  let call;
  globalThis.window = { location: { hostname: 'raspberry.test', origin: 'http://raspberry.test' }, localStorage: { getItem() { return ''; } }, sessionStorage: { getItem() { return ''; } } };
  globalThis.fetch = async (url, init) => { call = { url, init }; return { ok: true, json: async () => ({ job: {} }), text: async () => JSON.stringify({ job: {} }) }; };
  try {
    await module.exports.startMediaTorrent({ infoHash: 'a'.repeat(40), name: 'Libro epub' }, { name: 'La carretera', openLibraryKey: '/works/OL1W', editionKey: '/books/OL2M', coverUrl: 'untrusted', id: 999 }, { mediaType: 'books' });
    const body = JSON.parse(call.init.body);
    assert.equal(body.mediaType, 'books');
    assert.deepEqual(body.book, { name: 'La carretera', openLibraryKey: '/works/OL1W', editionKey: '/books/OL2M' });
    assert.equal(body.movie, undefined);
    await module.exports.searchMediaTorrents('La carretera español', undefined, { mediaType: 'books' });
    const params = new URL(call.url).searchParams;
    assert.equal(params.get('mediaType'), 'books');
    assert.equal(params.get('q'), 'La carretera español');
  } finally { globalThis.fetch = savedFetch; globalThis.window = savedWindow; }
});


test('award torrent search starts with cached Spanish title regardless of display language', () => {
  const original = { title: 'The Road', language: 'eng', openLibraryKey: '/works/OL1W', localizedMetadata: { es: { title: 'La carretera' } } };
  const winner = { title: 'The Road', author: 'Cormac McCarthy', award: 'pulitzer', metadata: { ...original, title: 'La carretera (català)', originalMetadata: original } };
  const book = awardTorrentBook(winner);
  assert.equal(book.spanishTitle, 'La carretera');
  assert.equal(book.openLibraryKey, '/works/OL1W');
  assert.equal(torrentQuery(book, 'books'), 'La carretera español');
  assert.equal(awardTorrentBook({ ...winner, metadata: null }), null);
});

test('Planeta can search immediately without an Open Library record', () => {
  const book = awardTorrentBook({ title: 'La hermandad', author: 'Example', award: 'planeta' });
  assert.equal(book.spanishTitle, 'La hermandad');
  assert.equal(torrentQuery(book, 'books'), 'La hermandad español');
});
