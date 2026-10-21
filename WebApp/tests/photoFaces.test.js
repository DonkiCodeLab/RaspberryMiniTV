import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { photoStrings } from '../src/photoStrings.js';
import { photosWithoutPeople } from '../src/photoLibrary.js';

async function load(file) {
  const result = await build({ entryPoints: [new URL(file, import.meta.url).pathname], bundle: true, write: false,
    format: 'cjs', platform: 'node', external: ['react'], define: { 'import.meta.env': '{"VITE_WEB_DEV_MODE":"mock"}' } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  return module.exports;
}
const { FaceRectangles } = await load('../src/PhotoViewerImage.jsx');
const { FaceNameEditor, PhotoFaceList } = await load('../src/PhotoFaceViewer.jsx');
const { PersonEditor } = await load('../src/PhotoPeople.jsx');
const s = photoStrings('es');
const faces = [
  { id: 'face-a', personId: 'ana', name: 'Ana', box: { x: .1, y: .2, width: .25, height: .3 } },
  { id: 'face-b', personId: null, name: null, box: { x: .6, y: .3, width: .2, height: .4 } },
  { id: 'legacy', personId: 'old', name: 'Old', box: null },
];

test('face rectangles use oriented image fractions, highlight the selected person and select a face ID', () => {
  let chosen;
  const props = { faces, selectedFaceId: 'face-b', highlightPersonId: 'ana', onSelect: id => { chosen = id; }, s };
  const html = renderToStaticMarkup(React.createElement(FaceRectangles, props));
  assert.equal((html.match(/<button/g) || []).length, 2);
  assert.match(html, /left:10%;top:20%;width:25%;height:30%/);
  assert.match(html, /is-highlighted/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /Nombre de esta cara: Sin asignar/);
  FaceRectangles(props)[1].props.onClick({ stopPropagation() {} });
  assert.equal(chosen, 'face-b');
});

test('name editor offers known names and new-person creation in every language', () => {
  for (const language of ['es', 'en', 'ca']) {
    const strings = photoStrings(language);
    const html = renderToStaticMarkup(React.createElement(FaceNameEditor, { face: faces[0], people: [{ id: 'ana', name: 'Ana' }], s: strings }));
    assert.match(html, /value="ana" selected=""/);
    assert.ok(html.includes(strings.newPerson));
    const unnamed = renderToStaticMarkup(React.createElement(FaceNameEditor, { face: faces[1], people: [], s: strings }));
    assert.match(unnamed, /<input/);
    assert.match(unnamed, /maxLength="100"/);
  }
});

test('No people contains only reviewed originals with zero detections, including none of the pending or failed photos', () => {
  const photos = [
    { id: 'empty', faceState: 'done', faceCount: 0 },
    { id: 'pending', faceState: 'pending', faceCount: 0 },
    { id: 'error', faceState: 'error', faceCount: 0 },
    { id: 'unassigned', faceState: 'done', faceCount: 1 },
    { id: 'generated', faceState: 'done', faceCount: 0, sourceId: 'original' },
    { id: 'legacy' },
  ];
  assert.deepEqual(photosWithoutPeople(photos).map(photo => photo.id), ['empty']);
});

test('person albums offer renaming and merging with another known person, excluding themselves', () => {
  for (const language of ['es', 'en', 'ca']) {
    const strings = photoStrings(language);
    const person = { id: 'source', name: 'Persona 1' };
    const html = renderToStaticMarkup(React.createElement(PersonEditor, { person, people: [person,
      { id: 'target', name: 'Ana' }, { id: 'empty', name: 'Luis' }], s: strings }));
    assert.match(html, /<input[^>]+value="Persona 1"/);
    assert.match(html, /<option value="target">Ana<\/option>/);
    assert.match(html, /<option value="empty">Luis<\/option>/);
    assert.doesNotMatch(html, /<option value="source"/);
    assert.ok(html.includes(strings.mergeWith));
    assert.ok(html.includes(`disabled="">${strings.mergePeople}`));
    const alone = renderToStaticMarkup(React.createElement(PersonEditor, { person, people: [person], s: strings }));
    assert.match(alone, /<select[^>]+disabled=""/);
    assert.ok(alone.includes(strings.noOtherPeople));
  }
});

test('face correction list selects the exact detection, including legacy faces without rectangles', () => {
  let selected;
  const props = { faces, selectedId: 'face-b', highlightPersonId: 'ana', onSelect: id => { selected = id; }, s };
  const html = renderToStaticMarkup(React.createElement(PhotoFaceList, props));
  assert.equal((html.match(/<button/g) || []).length, 3);
  assert.match(html, /1 · Ana/);
  assert.match(html, /3 · Old/);
  assert.match(html, /is-highlighted/);
  assert.match(html, /aria-pressed="true"/);
  PhotoFaceList(props).props.children[2].props.children[2].props.onClick();
  assert.equal(selected, 'legacy');
  const busy = renderToStaticMarkup(React.createElement(PhotoFaceList, { ...props, busy: true }));
  assert.equal((busy.match(/disabled=""/g) || []).length, 3);
});
