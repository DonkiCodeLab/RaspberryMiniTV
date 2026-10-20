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
const { FaceNameEditor } = await load('../src/PhotoFaceViewer.jsx');
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
