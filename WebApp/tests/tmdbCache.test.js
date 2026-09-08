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
      : { id: 1, title: 'Test', overview: 'Stored overview', poster_path: '/poster.jpg', backdrop_path: '/back.jpg' };
    return { ok: true, text: async () => JSON.stringify(data) };
  };
  try {
    const tmdb = await loadBrowserModule('../src/tmdbApi.js');
    const movie = await tmdb.getMovieById(1, 'es-ES');
    assert.equal(movie.name, 'Test');
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
