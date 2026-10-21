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
const { PhotoGrid, PhotoPagination, DeletePhotoChoices, AlbumCard, PersonPortrait } = module.exports;
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

test('photo tiles request favorites without a watched button', () => {
  const calls = [];
  renderToStaticMarkup(React.createElement(PhotoGrid, {page: photoPage(photos.slice(0,2)), selected:new Set(), s,
    language:'es', renderMarks:(...args) => { calls.push(args); return null; }}));
  assert.deepEqual(calls, [['picture','0.jpg',false], ['picture','1.jpg',false]]);
});

test('album deletion explicitly offers reference-only or global deletion; Gallery only offers global deletion', () => {
  const album = renderToStaticMarkup(React.createElement(DeletePhotoChoices, { album: true, s }));
  const gallery = renderToStaticMarkup(React.createElement(DeletePhotoChoices, { album: false, s }));
  assert.match(album, /Quitar solo de este álbum/);
  assert.match(album, /Borrar la imagen de Galería/);
  assert.doesNotMatch(gallery, /Quitar solo/);
  assert.match(gallery, /No se puede deshacer/);
  const actions = [];
  const choices = DeletePhotoChoices({ album: true, s, onDelete: scope => actions.push(scope) });
  choices.props.children[0].props.onClick();
  choices.props.children[1].props.onClick();
  assert.deepEqual(actions, ['album', 'gallery']);
});

test('choosing a person cover uses the selected image instead of opening a blocking viewer', () => {
  const chosen = [];
  const props = { page: photoPage(photos.slice(0, 2)), selected: new Set(), s, language: 'es',
    coverMode: true, coverPhotoId: '0', onCover: id => chosen.push(id), onOpen: () => assert.fail('Must not open the viewer') };
  const html = renderToStaticMarkup(React.createElement(PhotoGrid, props));
  assert.match(html, /Usar como portada: Photo 1/);
  assert.match(html, /photo-cover-label">Portada/);
  const grid = PhotoGrid(props);
  grid.props.children[1].props.children[0].props.onClick();
  assert.deepEqual(chosen, ['1']);
});

test('person albums use face portraits and never fall back to a misleading group photo', () => {
  const person = { id: 'person:ana', name: 'Ana', coverFace: { photoId: '1', box: { x: .6, y: .2, width: .2, height: .3 } } };
  const html = renderToStaticMarkup(React.createElement(AlbumCard, { folder: person, photos: photos.slice(0, 2), s, language: 'es' }));
  assert.match(html, /photo-album--person/);
  assert.match(html, /photo-person-portrait__crop/);
  assert.match(html, /alt="Ana"/);
  const missing = renderToStaticMarkup(React.createElement(PersonPortrait, { person: { ...person, coverFace: null }, photo: photos[0], s }));
  assert.doesNotMatch(missing, /<img/);
  assert.ok(missing.includes(s.faceCoverMissing));
  const wrongPhoto = renderToStaticMarkup(React.createElement(PersonPortrait, { person, photo: photos[0], s }));
  assert.doesNotMatch(wrongPhoto, /<img/);
  const album = renderToStaticMarkup(React.createElement(AlbumCard, { folder: { id: 'holiday', name: 'Holiday' }, photos: photos.slice(0, 2), s, language: 'es' }));
  assert.doesNotMatch(album, /photo-person-portrait/);
  assert.match(album, /alt="Photo 0"/);
});
