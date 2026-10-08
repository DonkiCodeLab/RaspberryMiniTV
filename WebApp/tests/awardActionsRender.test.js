import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const result = await build({
  entryPoints: [new URL('../src/OscarLibrary.jsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node',
  external: ['react'], loader: { '.css': 'empty', '.png': 'dataurl' },
  define: { 'import.meta.env': '{"VITE_WEB_DEV_MODE":"mock"}' },
});
const module = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
const OscarLibrary = module.exports.default;

for (const [award, file] of [['oscars', 'oscar_best_picture'], ['palme', 'palme_dor'], ['goya', 'goya_best_picture']]) {
  test(`${award}: missing files offer upload and torrent search; downloaded movies offer playback`, () => {
    const winner = JSON.parse(readFileSync(new URL(`../../DeviceApp/data/${file}.json`, import.meta.url))).winners.at(-1);
    const render = movies => renderToStaticMarkup(React.createElement(OscarLibrary, {
      award, movies, language: 'es', edition: winner.key ?? winner.edition,
      onEditionChange() {}, onOpenMovie() {}, onUploadMovie() {}, onSearchTorrent() {},
    }));
    for (const movies of [[], [{ id: 'metadata-only', tmdbId: winner.tmdbId }]]) {
      const html = render(movies);
      assert.match(html, />Cargar película<\/button>/);
      assert.match(html, />Buscar torrent<\/button>/);
      assert.doesNotMatch(html, /Abrir película/);
    }
    const downloaded = render([{ id: 'local', tmdbId: winner.tmdbId, fileRelativePath: 'Movies/movie.mkv' }]);
    assert.match(downloaded, /Abrir película/);
    assert.doesNotMatch(downloaded, /Cargar película|Buscar torrent/);
  });
}
