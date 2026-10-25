const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');

test('server address accepts a LAN host, explicit ports and HTTPS without rewriting ports', () => {
  assert.equal(C.serverAddress(' 192.168.1.50:5050/ '), 'http://192.168.1.50:5050');
  assert.equal(C.serverAddress('https://minitv.example/'), 'https://minitv.example');
  assert.equal(C.serverAddress('http://[::1]:5050'), 'http://[::1]:5050');
  for (const value of ['', 'file:///tmp', 'https://user:secret@example.com', 'https://example.com/path', 'example.com?pin=1234', 'example.com#x']) assert.throws(() => C.serverAddress(value));
});

test('catalog uses files that exist, retains identical TMDB movies, and sorts episodes', () => {
  const data = { movieRootFiles: [{relativePath: 'Movies/a.mp4'}, {relativePath: 'Movies/b.mp4'}],
    movieDirectories: [{videos: [{relativePath: 'Movies/a.mp4'}]}],
    mediaLibrary: { movies: {'Movies/a.mp4': { name: 'Saved name', tmdbId: 8 }, 'Movies/b.mp4': {tmdbId: 8}, 'Movies/deleted.mp4': {name: 'Removed'}} },
    directories: [{relativePath: 'TVShows/show', name: 'Show', videos: [{relativePath: 'TVShows/show/S02E02.mp4', file: 'S02E02.mp4'}, {relativePath: 'TVShows/show/S01E03.mp4', file: 'S01E03.mp4'}]}],
    rootFiles: [{relativePath: 'TVShows/loose.mp4'}] };
  const result = C.catalog(data, { movies: {8: {posterPath: '/poster.jpg', releaseDate: '2000-01-01'}} });
  assert.equal(result.movies.length, 2);
  assert.equal(result.movies[0].title, 'Saved name');
  assert.equal(result.movies[0].year, '2000');
  assert.equal(result.movies[1].id, 'Movies/b.mp4');
  assert.equal(result.series.length, 2);
  assert.equal(result.series[0].episodes[0].season, 1);
  assert.equal(result.series[1].episodes[0].path, 'TVShows/loose.mp4');
});

test('progress is compatible with WebApp and completion only marks the current episode', () => {
  const item = {type: 'episode', path: 'TVShows/a/S01E03.mp4', episode: 3, markKey: C.key('season', JSON.stringify(['TVShows/a', 1]))};
  const patch = C.progressPatch(item, 55, 120, true);
  assert.equal(patch.progress['["video","TVShows/a/S01E03.mp4"]'].seconds, 55);
  assert.deepEqual(patch.marks[item.markKey], {episodes: {'3': true}});
  assert.equal(C.progressPatch(item, 0, 0, false).marks, undefined);
  assert.equal(C.time(3661), '1:01:01');
});

test('remote navigation keeps rows and columns and never wraps across the screen', () => {
  const from = {x: 300, y: 300, width: 120, height: 170};
  const next = {x: 450, y: 300, width: 120, height: 170};
  const diagonal = {x: 340, y: 500, width: 120, height: 170};
  assert.equal(C.neighbor(from, [diagonal, next], 'right'), next);
  assert.equal(C.neighbor(from, [diagonal, next], 'down'), diagonal);
  assert.equal(C.neighbor(from, [next], 'left'), null);
});

test('URL queries encode media paths and audio capabilities match backend contract', () => {
  assert.equal(C.query({relativePath: 'Movies/a & b.mp4', subtitles: 'external:x.es.srt'}), 'relativePath=Movies%2Fa%20%26%20b.mp4&subtitles=external%3Ax.es.srt');
  assert.deepEqual(C.audioSupport({canPlayType: type => type.includes('mp4a.40.2') ? 'probably' : ''}), {mp4: ['aac'], webm: ['aac']});
});
