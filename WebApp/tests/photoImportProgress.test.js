import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { photoImportStrings } from '../src/photoImportStrings.js';

const require = createRequire(import.meta.url);
const result = await build({
  entryPoints: [new URL('../src/PhotoUploadDialog.jsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node',
  external: ['react', 'react-dom'], loader: { '.css': 'empty' },
  define: { 'import.meta.env': '{"VITE_WEB_DEV_MODE":"mock"}' },
});
const module = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
const { ImportProgress, ImportFailures } = module.exports;
const render = (props = {}, language = 'es') => {
  const t = photoImportStrings(language);
  return renderToStaticMarkup(React.createElement(ImportProgress, {
    title: t.saving, done: 19999, total: 20000, countLabel: t.photosProcessed,
    active: true, updatedAt: Date.now(), t, language, ...props,
  }));
};

test('a nearly complete import does not round up to 100% before the final confirmation', () => {
  const html = render();
  assert.match(html, /99,9%/);
  assert.match(html, /value="99.9"/);
  assert.doesNotMatch(html, /100,0%/);
  assert.match(render({ done: 20000 }), /100,0%/);
});

test('folder discovery has an indeterminate progress bar until the total is known', () => {
  const html = render({ done: 47, total: null, countLabel: 'archivos encontrados' });
  assert.match(html, /47 archivos encontrados/);
  assert.match(html, /<progress max="100"/);
  assert.doesNotMatch(html, /\d[,.]\d%/);
});

test('pending work reports missing progress; paused work has no running spinner or stale warning', () => {
  const updatedAt = Date.now() - 45000;
  assert.match(render({ updatedAt }), /Tiempo sin recibir avances:/);
  const paused = render({ updatedAt, active: false });
  assert.doesNotMatch(paused, /library-loading__spinner|Tiempo sin recibir avances:/);
});

test('progress is localized in each supported language', () => {
  for (const language of ['es', 'ca', 'en']) {
    const t = photoImportStrings(language), html = render({}, language);
    for (const key of ['discovering', 'indexing', 'filesFound', 'photosRead', 'readingHint', 'currentBatch', 'batchSent', 'confirming', 'interrupted', 'photosAttempted', 'notImported', 'finishedWithErrors', 'failedHint', 'showFailures', 'downloadFailures', 'retryFailed']) assert.ok(t[key]);
    assert.ok(html.includes(t.elapsed));
    assert.ok(html.includes(t.photosProcessed));
  }
});

test('unreadable photos remain visible with their full path, reason and downloadable report', () => {
  const t = photoImportStrings('es');
  const failures = Array.from({ length: 25 }, (_, index) => ({
    entry: { file: { name: 'same.jpeg', webkitRelativePath: `Export/${index}/same.jpeg` } }, error: 'Imagen incompleta',
  }));
  const html = renderToStaticMarkup(React.createElement(ImportFailures, { failures, t }));
  assert.match(html, /25 fotos sin importar/);
  assert.match(html, /Export\/0\/same.jpeg/);
  assert.match(html, /Imagen incompleta/);
  assert.ok(html.includes(t.downloadFailures));
  assert.equal((html.match(/<li>/g) || []).length, 20);
  assert.equal(renderToStaticMarkup(React.createElement(ImportFailures, { failures: [], t })), '');
});
