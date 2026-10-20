import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { photoStrings } from '../src/photoStrings.js';

const result = await build({ entryPoints: [new URL('../src/PhotoPeople.jsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'] });
const module = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { PeopleAnalysis, PersonEditor } = module.exports;
const s = photoStrings('es');
const render = faces => renderToStaticMarkup(React.createElement(PeopleAnalysis, { faces, peopleCount: 2, s }));

test('analysis displays actual progress with Pause inline and no blocking dialog', () => {
  const html = render({ available: true, state: 'running', running: true, total: 20, done: 7, percent: 35, pending: 13 });
  assert.match(html, /35%/);
  assert.match(html, /7 \/ 20 fotos revisadas/);
  assert.match(html, /2 personas/);
  assert.match(html, />Pausar<\/button>/);
  assert.doesNotMatch(html, /<dialog|aria-modal/);
});

test('paused work can continue, finishing a photo disables its control, and unavailable engines cannot start', () => {
  assert.match(render({ available: true, state: 'paused', remaining: 3 }), />Continuar analizando<\/button>/);
  assert.match(render({ available: true, state: 'paused', running: true, pausing: true }), /disabled="">Terminando la foto actual…/);
  assert.match(render({ available: false, pending: 3 }), /disabled="">Analizar/);
  assert.match(render({ available: true, state: 'complete', percent: 100, total: 3, done: 3, failed: 1, pending: 1 }), /1 con error/);
});

test('person details remain editable while analysis is running and localize in all three languages', () => {
  for (const language of ['es', 'ca', 'en']) {
    const strings = photoStrings(language);
    for (const key of ['pauseFaces', 'resumeFaces', 'facesProgress', 'chooseCover', 'coverSaved']) assert.ok(strings[key]);
    const html = renderToStaticMarkup(React.createElement(PersonEditor, { person: { id: '1', name: 'Ana' }, s: strings, choosingCover: true }));
    assert.match(html, /value="Ana"/);
    assert.match(html, /aria-pressed="true"/);
    assert.doesNotMatch(html, /<dialog|aria-modal/);
  }
});
