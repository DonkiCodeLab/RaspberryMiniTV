import test from 'node:test';
import assert from 'node:assert/strict';
import { createMovieMetadataLoader } from '../src/movieListMetadata.js';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const result = await build({ entryPoints: [new URL('../src/MovieListTitle.jsx', import.meta.url).pathname], bundle: true, write: false,
  format: 'cjs', platform: 'node', external: ['react'], define: { 'import.meta.env': '{}' }, loader: { '.css': 'empty' } });
const module = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
test('list separates the title and filename from resolution and quality bars', () => {
  const movie = { name: 'Film', fileName: 'renamed.mkv', fileInfo: { originalFileName: 'Film.1080p.BluRay.mkv',
    width: 1920, height: 800, sizeBytes: 1500000000, quality: { level: 4, resolution: '1080p Full HD', source: 'Blu-ray' } } };
  const heading = renderToStaticMarkup(React.createElement(module.exports.default, { movie, language: 'es' }));
  assert.doesNotMatch(heading, /Óptima|1080p Full HD|1500 MB/);
  const metadata = renderToStaticMarkup(React.createElement(module.exports.MovieListFileQuality, { movie, language: 'es' }));
  assert.equal((metadata.match(/class="is-active"/g) || []).length, 4);
  assert.ok(metadata.indexOf('1080p Full HD') < metadata.indexOf('movie-file-info__bars'));
  assert.ok(metadata.indexOf('movie-file-info__bars') < metadata.indexOf('Óptima'));
  const html = heading + metadata;
  assert.match(html, /<h2>Film<\/h2>/);
  assert.match(html, /Film.1080p.BluRay.mkv/);
  assert.match(html, /Óptima/); assert.match(html, /1080p Full HD/);
  assert.match(html, /1500 MB|1\.500 MB/);
  assert.doesNotMatch(html, /<strong>|<b>/);
});
test('a long list limits concurrent probes and reuses metadata for the same file', async () => {
  let active = 0, maximum = 0, calls = 0;
  const load = createMovieMetadataLoader(async path => {
    calls++; active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--; return { fileName: path, sizeBytes: 1000 };
  });
  const results = await Promise.all(Array.from({ length: 15 }, (_, index) => load(`Film-${index}`)));
  assert.equal(maximum, 2); assert.equal(results.length, 15);
  await load('Film-0'); assert.equal(calls, 15);
});
test('leaving the list cancels queued work before it can probe another video', async () => {
  let finish;
  const calls = [];
  const load = createMovieMetadataLoader(path => { calls.push(path); return new Promise(resolve => { finish = resolve; }); }, 1);
  const first = load('first');
  await Promise.resolve();
  const controller = new AbortController();
  const queued = load('cancelled', controller.signal);
  controller.abort();
  await assert.rejects(queued, { name: 'AbortError' });
  finish({ fileName: 'first' }); await first;
  assert.deepEqual(calls, ['first']);
});

test('list entries display saved measurements immediately without requesting metadata', () => {
  const html = renderToStaticMarkup(React.createElement(module.exports.MovieListFileQuality, { language: 'es', movie: {
    name: 'Saved film', fileRelativePath: 'Movies/saved.mkv', fileInfo: {
      sizeBytes: 2000000, quality: { level: 3, resolution: '720p HD', source: 'WEB-DL' },
    },
  } }));
  assert.match(html, /Buena/); assert.match(html, /720p HD/); assert.match(html, /2 MB/);
  assert.doesNotMatch(html, /Consultando|Consultant|Checking/);
});
