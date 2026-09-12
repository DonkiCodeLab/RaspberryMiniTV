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
    assert.equal(movie.heroImage, 'http://raspberry:5050/tmdb/images/back.jpg?pin=1234&width=1280');
    assert.ok(movie.imageOptions.every(url => url.includes('/tmdb/images/')));
    assert.ok(requests.every(({ options }) => options.headers['X-Web-Pin'] === '1234'));
    assert.equal(tmdb.buildTmdbImageUrl(null), null);
    const api = await loadBrowserModule('../src/api/raspberryApi.js');
    assert.equal(api.localTmdbImageUrl('https://image.tmdb.org/t/p/w500/custom.jpg'), 'http://raspberry:5050/tmdb/images/custom.jpg?pin=1234&width=500');
    assert.equal(api.localTmdbImageUrl('http://old-host/tmdb/images/custom.jpg?pin=old'), 'http://raspberry:5050/tmdb/images/custom.jpg?pin=1234');
    assert.equal(api.localTmdbImageUrl('/my-cover.jpg'), '/my-cover.jpg');
    assert.equal(api.localTmdbImageUrl('http://old-host/tmdb/images/custom.jpg?pin=old&width=500'), 'http://raspberry:5050/tmdb/images/custom.jpg?pin=1234&width=500');
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

test('library loads a single compact local response without detail requests', async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  globalThis.window = { location: { origin: 'http://raspberry:5050', hostname: 'raspberry' }, sessionStorage: { getItem: () => '1234' } };
  const requests = [];
  globalThis.fetch = async url => {
    requests.push(url);
    assert.equal(url, 'http://raspberry:5050/tmdb/library?language=es-ES');
    return { ok: true, text: async () => JSON.stringify({ movies: { 1: { id: 1, name: 'Test', posterPath: '/poster.jpg' } }, series: {} }) };
  };
  try {
    const tmdb = await loadBrowserModule('../src/tmdbApi.js');
    const cards = await tmdb.getLibrarySummaries([{ id: 'Movies/test.mp4', tmdbId: 1 }], [], 'es-ES');
    assert.equal(requests.length, 1);
    assert.equal(cards.movies[1].posterImage, 'http://raspberry:5050/tmdb/images/poster.jpg?pin=1234&width=500');
    assert.equal(cards.movies[1].imageOptions, undefined);
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});

test('opening a series does not fetch its seasons episodes', async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  globalThis.window = { location: { origin: 'http://raspberry:5050', hostname: 'raspberry' }, sessionStorage: { getItem: () => '1234' } };
  const requests = [];
  globalThis.fetch = async url => {
    requests.push(url);
    assert.ok(!url.includes('/season/'), 'chapter metadata must wait until a season is opened');
    const data = url.includes('/images') ? { posters: [] } : {
      id: 1, name: 'Test', overview: 'Stored', poster_path: '/poster.jpg',
      seasons: [{ season_number: 1, episode_count: 10, poster_path: '/season.jpg' }]
    };
    return { ok: true, text: async () => JSON.stringify(data) };
  };
  try {
    const tmdb = await loadBrowserModule('../src/tmdbApi.js');
    const series = await tmdb.getTvSeriesById(1, 'es-ES');
    assert.equal(requests.length, 2);
    assert.equal(series.seasons.length, 1);
    assert.ok(series.seasons[0].image.includes('/season.jpg'));
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});

test('returning to movie and season reuses metadata; episode information waits for selection', async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  globalThis.window = { location: { origin: 'http://raspberry:5050', hostname: 'raspberry' }, sessionStorage: { getItem: () => '1234' } };
  const requests = [];
  globalThis.fetch = async url => {
    requests.push(url);
    const data = url.includes('/episode/') ? { name: 'Pilot', overview: 'Full synopsis' }
      : url.includes('/season/') ? { name: 'Season', season_number: 1, episodes: [{ id: 7, episode_number: 1, name: 'Pilot', still_path: '/still.jpg' }] }
      : url.includes('/images') ? { posters: [] } : { id: 1, title: 'Film', overview: 'Stored' };
    return { ok: true, text: async () => JSON.stringify(data) };
  };
  try {
    const tmdb = await loadBrowserModule('../src/tmdbApi.js');
    await tmdb.getMovieById(777, 'es-ES');
    await tmdb.getMovieById(777, 'es-ES');
    assert.equal(requests.length, 2);
    const params = { seriesId: 777, seasonNumber: 1, language: 'es-ES' };
    const season = await tmdb.getTvSeasonEpisodes(params);
    await tmdb.getTvSeasonEpisodes(params);
    assert.equal(requests.length, 3);
    assert.ok(requests[2].includes('level=cards'));
    assert.equal(season.episodes[0].synopsis, undefined);
    assert.ok(!requests.some(url => url.includes('/episode/')));
    const episode = await tmdb.getTvEpisodeDetails({ ...params, episodeNumber: 1 });
    assert.equal(episode.synopsis, 'Full synopsis');
    await tmdb.getTvEpisodeDetails({ ...params, episodeNumber: 1 });
    assert.equal(requests.length, 4);
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});


test('online preview uses an explicit import route separate from library navigation', async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  globalThis.window = { location: { origin: 'http://raspberry:5050', hostname: 'raspberry' }, sessionStorage: { getItem: () => '1234' } };
  const requests = [];
  globalThis.fetch = async url => {
    requests.push(url);
    const data = url.includes('/images') ? { posters: [] } : { title: 'Preview', overview: 'Overview', poster_path: '/preview.jpg' };
    return { ok: true, text: async () => JSON.stringify(data) };
  };
  try {
    const tmdb = await loadBrowserModule('../src/tmdbApi.js');
    const preview = await tmdb.getMovieById(888, 'es-ES', true);
    assert.ok(requests.every(url => url.includes('/tmdb/import/json/')));
    assert.ok(preview.heroImage.includes('/tmdb/import/images/'));
    requests.length = 0;
    const local = await tmdb.getMovieById(888, 'es-ES');
    assert.equal(requests.length, 2);
    assert.ok(requests.every(url => url.includes('/tmdb/json/')));
    assert.ok(local.heroImage.includes('/tmdb/images/'));
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});
