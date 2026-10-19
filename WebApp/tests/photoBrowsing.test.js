import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { photoPage } from '../src/photoLibrary.js';
import { photoStrings } from '../src/photoStrings.js';

const require = createRequire(import.meta.url);
const result = await build({
  entryPoints: [new URL('../src/PhotosLibrary.jsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node',
  external: ['react', 'react-dom'], loader: { '.css': 'empty', '.png': 'dataurl' },
  define: { 'import.meta.env': '{"VITE_WEB_DEV_MODE":"mock"}' },
});
const module = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
const { PhotoGrid, PhotoPagination } = module.exports;
const photos = Array.from({ length: 33091 }, (_, id) => ({ id: String(id), name: `Photo ${id}`, relativePath: `${id}.jpg` }));
const s = photoStrings('es');

test('large photo albums only mount the current 100 tiles and retain viewer offsets', () => {
  const page = photoPage(photos, 2);
  const props = { page, selected: new Set(), actionMode: false, s, language: 'es' };
  const html = renderToStaticMarkup(React.createElement(PhotoGrid, props));
  assert.equal((html.match(/class="photo-tile"/g) || []).length, 100);
  assert.match(html, /Photo 100/);
  assert.match(html, /Photo 199/);
  assert.doesNotMatch(html, /Photo 200[<"]/);
  let opened;
  const element = PhotoGrid({ ...props, onOpen: index => { opened = index; } });
  element.props.children[0].props.children[0].props.onClick();
  assert.equal(opened, 100);
  element.props.children[99].props.children[0].props.onClick();
  assert.equal(opened, 199);
});

test('pagination reports ranges and disables unavailable directions', () => {
  const first = renderToStaticMarkup(React.createElement(PhotoPagination, { page: photoPage(photos), s }));
  const last = renderToStaticMarkup(React.createElement(PhotoPagination, { page: photoPage(photos, 331), s }));
  assert.match(first, /1–100 \/ 33091 fotos/);
  assert.match(last, /33001–33091 \/ 33091 fotos/);
  assert.match(first, /disabled="">Anterior/);
  assert.match(last, /disabled="">Siguiente/);
  for (const language of ['es', 'ca', 'en']) for (const key of ['pages', 'page', 'selectPage']) assert.ok(photoStrings(language)[key]);
});
