import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function loadBrowserModule(entry) {
  const result = await build({ entryPoints: [new URL(entry, import.meta.url).pathname], bundle: true, write: false,
    format: 'esm', platform: 'browser', define: { 'import.meta.env': '{}' } });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

test('connected catalog uses Raspberry cache and PIN without frontend TMDB credentials', async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  globalThis.window = { location: { origin: 'http://raspberry:5050', hostname: 'raspberry' }, sessionStorage: { getItem: () => '1234' } };
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    assert.ok(url.startsWith('http://raspberry:5050/tmdb/json/'));
    const data = url.includes('/images') ? { posters: [{ file_path: '/poster.jpg' }] }
      : { id: 1, title: 'Test', overview: 'Stored overview', poster_path: '/poster.jpg', backdrop_path: '/back.jpg', external_ids: { wikidata_id: 'Q123' }, rottenTomatoesUrl: 'https://www.rottentomatoes.com/m/stored_test' };
    return { ok: true, text: async () => JSON.stringify(data) };
  };
  try {
    const tmdb = await loadBrowserModule('../src/tmdbApi.js');
    const movie = await tmdb.getMovieById(1, 'es-ES');
    assert.equal(movie.name, 'Test');
    assert.equal(movie.rottenTomatoesUrl, 'https://www.rottentomatoes.com/m/stored_test');
    assert.equal(movie.heroImage, 'http://raspberry:5050/tmdb/images/back.jpg?pin=1234');
    assert.ok(movie.imageOptions.every(url => url.includes('/tmdb/images/')));
    assert.ok(requests.every(({ options }) => options.headers['X-Web-Pin'] === '1234'));
    assert.equal(tmdb.buildTmdbImageUrl(null), null);
    const api = await loadBrowserModule('../src/api/raspberryApi.js');
    assert.equal(api.localTmdbImageUrl('https://image.tmdb.org/t/p/w500/custom.jpg'), 'http://raspberry:5050/tmdb/images/custom.jpg?pin=1234');
    assert.equal(api.localTmdbImageUrl('http://old-host/tmdb/images/custom.jpg?pin=old'), 'http://raspberry:5050/tmdb/images/custom.jpg?pin=1234');
    assert.equal(api.localTmdbImageUrl('/my-cover.jpg'), '/my-cover.jpg');
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});


test('legacy web credentials migrate once and server credentials remain authoritative', async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  globalThis.window = { location: { origin: 'http://raspberry:5050', hostname: 'raspberry' }, sessionStorage: { getItem: () => '1234' } };
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, text: async () => '{}' };
  };
  try {
    const tmdb = await loadBrowserModule('../src/tmdbApi.js');
    tmdb.setTmdbCredentials({ bearerToken: 'legacy-test-token' });
    await tmdb.initializeTmdbCredentials({ apiKey: '', bearerToken: '' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://raspberry:5050/settings/tmdb');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers['X-Web-Pin'], '1234');
    assert.equal(JSON.parse(calls[0].options.body).bearerToken, 'legacy-test-token');
    await tmdb.initializeTmdbCredentials({ apiKey: 'server-test-key', bearerToken: '' });
    assert.equal(calls.length, 1);
    assert.deepEqual(tmdb.readTmdbCredentials(), { apiKey: 'server-test-key', bearerToken: '' });
    tmdb.setTmdbCredentials({ bearerToken: 'legacy-test-token' });
    globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => '{"error":"save failed"}' });
    await assert.rejects(tmdb.initializeTmdbCredentials({}), /save failed/);
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});
