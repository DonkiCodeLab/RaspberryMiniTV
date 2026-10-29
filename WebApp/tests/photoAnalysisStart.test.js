import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { photoStrings } from '../src/photoStrings.js';

const bundle = await build({ entryPoints: [new URL('../src/PhotoReviewWizard.jsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react', 'react-dom'],
  loader: { '.css': 'empty', '.png': 'dataurl' }, define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'photo-api', setup(build) {
    build.onResolve({ filter: /\/api\/raspberryApi\.js$/ }, () => ({ path: 'photo-api', external: true }));
  } }] });

function renderWizard(t, { faces = {}, saved = {}, language = 'es', initialLimit = 100, request = async () => ({ ok: true }) } = {}) {
  const effects = [], elements = [], calls = [];
  const require = createRequire(import.meta.url), module = { exports: {} };
  const createElement = React.createElement;
  t.mock.method(React, 'useEffect', callback => { effects.push(callback); });
  t.mock.method(React, 'createElement', (...args) => {
    const element = createElement(...args); elements.push(element); return element;
  });
  const storage = new Map();
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: () => JSON.stringify(saved),
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } });
  t.after(() => {
    if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage);
    else delete globalThis.sessionStorage;
  });
  const api = { getPictureContentUrl: path => `/pictures/${path}`, photoRequest: (...args) => { calls.push(args); return request(...args); } };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
    name => name === 'photo-api' ? api : require(name), module, module.exports);
  const s = photoStrings(language);
  const html = renderToStaticMarkup(createElement(module.exports.default, { Modal: ({ children }) => createElement('section', null, children),
    library: { people: [], photos: [], reviews: [], faces: { available: true, pending: 250, ...faces } }, s,
    initialLimit, scanPayload: { limit: initialLimit }, onRefresh: async () => true, onClose: () => {} }));
  // Run mount effects too: server rendering alone would miss an accidental automatic request.
  for (const effect of effects) effect();
  return { html, calls, s, button: label => elements.find(element => element.type === 'button' && element.props.children === label) };
}

test('opening or reopening step one never starts analysis, including legacy launch payloads', async t => {
  for (const saved of [{}, { step: 'scan' }]) {
    await t.test(saved.step ? 'reopened' : 'first opening', t => {
      const { html, calls, s, button } = renderWizard(t, { saved, initialLimit: 37,
        faces: { state: 'complete', done: 100, total: 100, percent: 100 } });
      assert.match(html, /aria-current="step"[^>]*><span>1<\/span>/);
      assert.match(html, /min="1" max="250" step="1" value="37"/);
      assert.equal(button(s.reviewStartBatch).props.disabled, false);
      assert.deepEqual(calls, []);
    });
  }
});

test('only Start submits the chosen size, and repeated clicks cannot launch duplicate requests', async t => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const { calls, s, button } = renderWizard(t, { initialLimit: 37, request: () => pending });
  assert.deepEqual(calls, []);
  const start = button(s.reviewStartBatch);
  const first = start.props.onClick();
  const second = start.props.onClick();
  assert.deepEqual(calls, [['people/scan', { limit: 37 }]]);
  finish({ ok: true });
  await Promise.all([first, second]);
});

test('active and paused batches require an explicit action and keep their pause/resume controls', async t => {
  for (const [faces, label, path] of [
    [{ state: 'running', running: true }, 'pauseFaces', 'people/pause'],
    [{ state: 'paused', remaining: 23 }, 'resumeFaces', 'people/scan'],
    [{ state: 'error', remaining: 23 }, 'resumeFaces', 'people/scan'],
  ]) await t.test(faces.state, async t => {
    const { html, calls, s, button } = renderWizard(t, { faces });
    assert.doesNotMatch(html, /type="number"/);
    assert.deepEqual(calls, []);
    await button(s[label]).props.onClick();
    assert.deepEqual(calls, [[path, {}]]);
  });
});

test('Start remains disabled without pending photos, without an engine, or with an invalid size', async t => {
  for (const options of [{ faces: { pending: 0 } }, { faces: { available: false } }, { initialLimit: 1.5 }]) {
    await t.test(JSON.stringify(options), t => {
      const { s, button, calls } = renderWizard(t, options);
      assert.equal(button(s.reviewStartBatch).props.disabled, true);
      assert.deepEqual(calls, []);
    });
  }
});

test('the explicit Start action is translated and small queues cap the initial size', async t => {
  for (const language of ['es', 'en', 'ca']) await t.test(language, t => {
    const { html, calls, s, button } = renderWizard(t, { language, faces: { pending: 3 } });
    assert.match(html, /max="3" step="1" value="3"/);
    assert.ok(s.reviewStartBatch);
    assert.equal(button(s.reviewStartBatch).props.disabled, false);
    assert.deepEqual(calls, []);
  });
});
