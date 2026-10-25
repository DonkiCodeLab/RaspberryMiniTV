import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { photoPage, photoDeleteRequest } from '../src/photoLibrary.js';
import { photoStrings } from '../src/photoStrings.js';
import { photoImportStrings } from '../src/photoImportStrings.js';

const require = createRequire(import.meta.url);
const result = await build({
  entryPoints: [new URL('../src/PhotosLibrary.jsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node',
  external: ['react', 'react-dom'], loader: { '.css': 'empty', '.png': 'dataurl' },
  define: { 'import.meta.env': '{"VITE_WEB_DEV_MODE":"mock"}' },
});
const module = { exports: {} };
// Render dialog content inline while keeping the real viewer and face editor.
const requireForRender = name => name === 'react-dom' ? { ...require(name), createPortal: children => children } : require(name);
new Function('require', 'module', 'exports', 'document', result.outputFiles[0].text)(requireForRender, module, module.exports, { body: {} });
const { PhotoGrid, PhotoPagination, DeletePhotoChoices, AlbumCard, PersonPortrait, Viewer } = module.exports;
const photos = Array.from({ length: 33091 }, (_, id) => ({ id: String(id), name: `Photo ${id}`, relativePath: `${id}.jpg` }));
const s = photoStrings('es');

test('opening a photo from No people renders its image and Add face controls', () => {
  const photo = { id: 'no-faces', name: 'IMG_0746.JPG', relativePath: 'IMG_0746.JPG', faceState: 'done', faceCount: 0 };
  let initial;
  const grid = PhotoGrid({ page: photoPage([photo]), selected: new Set(), s, language: 'es',
    onOpen: index => { initial = index; } });
  grid.props.children[0].props.children[0].props.onClick();
  assert.equal(initial, 0);
  const html = renderToStaticMarkup(React.createElement(Viewer, { photos: [photo], initial, faces: {}, s, language: 'es' }));
  assert.match(html, /<dialog[^>]*photo-dialog--viewer/);
  assert.match(html, /<img[^>]*photo-viewer__full[^>]*alt="IMG_0746.JPG"/);
  assert.ok(html.includes(s.addFace));
  assert.ok(html.includes(s.faceListEmpty));
  assert.ok(html.includes(`aria-label="${s.close}"`));
});

test('the photo viewer renders imported metadata in the selected language', () => {
  const photo = { id: 'imported', name: 'Holiday.jpg', relativePath: 'Holiday.jpg', title: 'London',
    appleFavorite: true, description: 'A family trip', albums: ['Summer'], keywords: ['Travel'] };
  for (const language of ['es', 'ca', 'en']) {
    const strings = photoStrings(language), imported = photoImportStrings(language);
    const html = renderToStaticMarkup(React.createElement(Viewer, { photos: [photo], initial: 0, faces: {}, s: strings, language }));
    for (const value of [imported.favorite, imported.albums, imported.keywords, 'London', 'A family trip', 'Summer', 'Travel']) {
      assert.ok(html.includes(value), `Missing ${value} in ${language}`);
    }
    assert.ok(html.includes(strings.addFace));
  }
});

test('every photo card with valid GPS offers a minimap without changing selection or cover actions', () => {
  const located = { id: 'gps', name: 'Barcelona.jpg', relativePath: 'gps.jpg', latitude: 41.3874, longitude: 2.1686 };
  for (const language of ['es', 'ca', 'en']) for (const mode of [{}, { actionMode: true }, { coverMode: true }, { person: { id: 'ana', name: 'Ana' } }]) {
    const strings = photoStrings(language);
    const props = { page: photoPage([located, { ...located, id: 'zero', latitude: 0, longitude: 0 },
      { ...located, id: 'missing', latitude: null }, { ...located, id: 'invalid', longitude: 200 }]),
      selected: new Set(), s: strings, language, ...mode };
    const html = renderToStaticMarkup(React.createElement(PhotoGrid, props));
    assert.equal((html.match(/class="photo-location-button"/g) || []).length, 2);
    assert.ok(html.includes(`${strings.showPhotoMap}: Barcelona.jpg`));
    assert.match(html, /aria-haspopup="dialog"/);
    assert.match(html, /41.3874°, 2.1686°/);
    assert.ok(html.includes(strings.noGps));
    assert.doesNotMatch(html, /leaflet-container|<dialog/);
  }
});

test('person photo tiles mark only that person in each photo and keep the full image visible', () => {
  const photos = [{ id: 'a', name: 'Group', relativePath: 'a.jpg', width: 1200, height: 800 },
    { id: 'b', name: 'Portrait', relativePath: 'b.jpg', width: 800, height: 1200 }];
  const person = { id: 'ana', name: 'Ana', faceBoxes: {
    a: [{ id: 'one', box: { x: .6, y: .2, width: .2, height: .3 } }],
    b: [{ id: 'two', box: { x: .1, y: .4, width: .3, height: .2 } }],
    other: [{ id: 'unrelated', box: { x: 0, y: 0, width: 1, height: 1 } }],
  } };
  const props = { page: photoPage(photos), selected: new Set(), s, language: 'es' };
  const html = renderToStaticMarkup(React.createElement(PhotoGrid, { ...props, person }));
  assert.equal((html.match(/class="photo-person-match__box"/g) || []).length, 2);
  assert.match(html, /left:60%;top:20%;width:20%;height:30%/);
  assert.match(html, /left:10%;top:40%;width:30%;height:20%/);
  assert.equal((html.match(/aria-label="Ana"/g) || []).length, 2);
  const normal = renderToStaticMarkup(React.createElement(PhotoGrid, props));
  assert.doesNotMatch(normal, /photo-person-match/);
  const legacy = renderToStaticMarkup(React.createElement(PhotoGrid, { ...props, person: { id: 'legacy', name: 'Legacy' } }));
  assert.doesNotMatch(legacy, /photo-person-match__box/);
});

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

test('person tiles offer compact favorite, original download and deletion of just the clicked photo', () => {
  const photo = photos[0], calls = [], deleted = [];
  const props = { page: photoPage([photo]), selected: new Set(), s, language: 'es', person: { id: 'ana', name: 'Ana' },
    renderMarks: (...args) => { calls.push(args); return null; }, onDelete: photo => deleted.push(photo.id) };
  const html = renderToStaticMarkup(React.createElement(PhotoGrid, props));
  assert.deepEqual(calls, [['picture', photo.relativePath, false, true, true]]);
  assert.match(html, /class="photo-card-actions"/);
  assert.match(html, /download="Photo 0"/);
  assert.ok(html.includes(`aria-label="${s.downloadOriginal}"`));
  assert.ok(html.includes(`aria-label="${s.deletePhotos}"`));
  assert.doesNotMatch(html, />No favorito</);
  const grid = PhotoGrid(props);
  grid.props.children[0].props.children.find(child => child?.props?.className === 'photo-card-actions').props.children[2].props.onClick();
  assert.deepEqual(deleted, [photo.id]);
});

test('Unknown edit mode selects individual photos without opening the viewer and can delete that subset', () => {
  const selected = new Set(['0']), toggled = [];
  const props = { page: photoPage(photos.slice(0, 3)), selected, actionMode: true, s, language: 'es',
    person: { id: 'unknown', name: s.unknownPerson }, toggle: id => toggled.push(id),
    onOpen: () => assert.fail('Selection must not open the viewer') };
  const html = renderToStaticMarkup(React.createElement(PhotoGrid, props));
  assert.match(html, /aria-label="Seleccionar: Photo 0" aria-pressed="true"/);
  assert.match(html, /aria-label="Seleccionar: Photo 1" aria-pressed="false"/);
  const grid = PhotoGrid(props);
  grid.props.children[1].props.children[0].props.onClick();
  assert.deepEqual(toggled, ['1']);
  assert.deepEqual(photoDeleteRequest([...selected], 'gallery', 'person:unknown', 'unknown'), {
    path: 'photos/delete', payload: { ids: ['0'], scope: 'gallery' },
  });
});

test('person deletion offers reference removal or global deletion and routes them to separate operations', () => {
  const person = { id: 'ana', name: 'Ana' }, actions = [];
  const html = renderToStaticMarkup(React.createElement(DeletePhotoChoices, { person, s }));
  assert.ok(html.includes(s.removeMatches));
  assert.ok(html.includes(s.removePersonReferenceHint));
  assert.ok(html.includes(s.deleteGalleryHint));
  assert.ok(!html.includes(s.removeReferenceHint));
  const choices = DeletePhotoChoices({ person, s, onDelete: scope => actions.push(scope) });
  choices.props.children[0].props.onClick();
  choices.props.children[1].props.onClick();
  assert.deepEqual(actions, ['person', 'gallery']);
  assert.deepEqual(photoDeleteRequest(['a'], actions[0], 'person:ana', person.id), {
    path: 'people/ana/remove', payload: { ids: ['a'] },
  });
  assert.deepEqual(photoDeleteRequest(['a'], actions[1], 'person:ana', person.id), {
    path: 'photos/delete', payload: { ids: ['a'], scope: 'gallery' },
  });
  assert.deepEqual(photoDeleteRequest(['a'], 'album', 'holiday'), {
    path: 'photos/delete', payload: { ids: ['a'], scope: 'album', folderId: 'holiday' },
  });
  assert.throws(() => photoDeleteRequest(['a'], 'person'), /Invalid/);
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
