import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { indexPhotoReviews, reviewsForPhotos, pendingFacePreview } from '../src/photoReviews.js';
import { photoStrings } from '../src/photoStrings.js';

async function load(file) {
  const result = await build({ entryPoints: [new URL(file, import.meta.url).pathname], bundle: true, write: false,
    format: 'cjs', platform: 'node', external: ['react', 'react-dom'], loader: { '.css': 'empty', '.png': 'dataurl' },
    define: { 'import.meta.env': '{"VITE_WEB_DEV_MODE":"mock"}' } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  return module.exports;
}
const { PhotoReviewAction } = await load('../src/PhotoReviews.jsx');
const { PhotoFaceList } = await load('../src/PhotoFaceViewer.jsx');
const { PhotoGrid, AlbumCard } = await load('../src/PhotosLibrary.jsx');
const reviews = [
  { id: 'one', photoId: 'shared', faceId: 'ana-face', personId: 'ana' },
  { id: 'two', photoId: 'shared', faceId: 'luis-face', personId: 'luis' },
  { id: 'three', photoId: 'landscape', faceId: null, personId: null },
];
const box = { x: .1, y: .2, width: .2, height: .3 };
const people = [
  { id: 'ana', name: 'Ana', faceBoxes: { shared: [{ id: 'ana-face', box }, { id: 'already-reviewed', box }] } },
  { id: 'luis', name: 'Luis', faceBoxes: { shared: [{ id: 'luis-face', box: { ...box, x: .6 } }] } },
];

test('review folders count photos once and separate new faceless photos from person matches', () => {
  const index = indexPhotoReviews(reviews);
  assert.deepEqual([...index.matchPhotoIds], ['shared']);
  assert.deepEqual([...index.noFacePhotoIds], ['landscape']);
  assert.deepEqual([...index.byPerson.get('ana')], ['shared']);
  assert.equal(index.byPhoto.get('shared').length, 2);
  assert.equal(indexPhotoReviews().matchPhotoIds.size, 0);
});

test('bulk validation only includes selected visible photos and the current person', () => {
  assert.deepEqual(reviewsForPhotos(reviews, [{ id: 'shared' }]).map(r => r.id), ['one', 'two']);
  assert.deepEqual(reviewsForPhotos(reviews, [{ id: 'shared' }], 'ana').map(r => r.id), ['one']);
  assert.deepEqual(reviewsForPhotos(reviews, [{ id: 'landscape' }]).map(r => r.id), ['three']);
  assert.deepEqual(reviewsForPhotos(reviews, [{ id: 'stale' }]), []);
});

test('pending previews show only pending faces with the correct person for each rectangle', () => {
  const preview = pendingFacePreview('shared', reviews, people);
  assert.equal(preview.name, 'Ana, Luis');
  assert.deepEqual(preview.faceBoxes.shared.map(face => [face.id, face.name]), [['ana-face', 'Ana'], ['luis-face', 'Luis']]);
});

test('photo and per-face confirmation send the exact review tokens and disable during saving', () => {
  const s = photoStrings('es');
  let confirmed;
  const props = { reviews: reviews.slice(0, 2), s, onConfirm: ids => { confirmed = ids; } };
  PhotoReviewAction(props).props.children[1].props.onClick();
  assert.deepEqual(confirmed, ['one', 'two']);
  assert.match(renderToStaticMarkup(React.createElement(PhotoReviewAction, { ...props, busy: true })), /disabled=""/);
  assert.equal(PhotoReviewAction({ ...props, reviews: [] }), null);
  const listProps = { faces: [{ id: 'ana-face', personId: 'ana', name: 'Ana', reviewId: 'one' },
    { id: 'already-reviewed', personId: 'ana', name: 'Ana' }], s, onConfirm: id => { confirmed = id; } };
  const html = renderToStaticMarkup(React.createElement(PhotoFaceList, listProps));
  assert.equal((html.match(/photo-face-list__confirm/g) || []).length, 1);
  assert.match(html, /Confirmar coincidencia: Ana/);
  PhotoFaceList(listProps).props.children[2].props.children[0].props.children[2].props.onClick();
  assert.equal(confirmed, 'one');
});

test('pending folder tiles highlight matches, name people and offer validation without editing', () => {
  const s = photoStrings('es');
  const photo = { id: 'shared', name: 'Family', relativePath: 'family.jpg', width: 1200, height: 800 };
  const html = renderToStaticMarkup(React.createElement(PhotoGrid, {
    page: { items: [photo], offset: 0 }, selected: new Set(), s, language: 'es', reviewingMatches: true,
    reviewItems: indexPhotoReviews(reviews).byPhoto, reviewPeople: people,
  }));
  assert.match(html, /Ana, Luis/);
  assert.match(html, /aria-label="Ana"/);
  assert.match(html, /aria-label="Luis"/);
  assert.match(html, /Validar coincidencias/);
  const folder = renderToStaticMarkup(React.createElement(AlbumCard, {
    folder: { id: 'pendingValidation', name: s.pendingValidation }, photos: [photo], s, language: 'es',
  }));
  assert.match(folder, /Pendientes de validar/);
  assert.match(folder, /1 fotos/);
  assert.doesNotMatch(folder, /photo-person-portrait/);
});

test('pending photos can be checked directly while the image still opens for review', () => {
  const toggled = [], opened = [];
  const photo = { id: 'shared', name: 'Family', relativePath: 'family.jpg' };
  for (const actionMode of [false, true]) {
    const props = { page: { items: [photo], offset: 100 }, selected: new Set(['shared']),
      s: photoStrings('es'), language: 'es', reviewingMatches: true, actionMode,
      toggle: id => toggled.push(id), onOpen: index => opened.push(index) };
    const html = renderToStaticMarkup(React.createElement(PhotoGrid, props));
    assert.equal((html.match(/type="checkbox"/g) || []).length, 1);
    assert.match(html, /aria-label="Seleccionar: Family" checked=""/);
    const tile = PhotoGrid(props).props.children[0];
    const checkbox = tile.props.children.find(child => child?.props?.className === 'photo-review-check').props.children;
    checkbox.props.onChange();
    assert.deepEqual(toggled, actionMode ? ['shared', 'shared'] : ['shared']);
    tile.props.children[0].props.onClick();
    assert.deepEqual(opened, [100]);
    if (actionMode) assert.deepEqual(toggled, ['shared', 'shared', 'shared']);
    const busyTile = PhotoGrid({ ...props, reviewBusy: true }).props.children[0];
    assert.equal(busyTile.props.children.find(child => child?.props?.className === 'photo-review-check').props.children.props.disabled, true);
    if (actionMode) assert.equal(busyTile.props.children[0].props.disabled, true);
  }
});
