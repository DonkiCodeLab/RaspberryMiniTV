import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const panels = await Promise.all(['TmdbCachePanel', 'TmdbCreditsCompletion'].map(async name => {
  const result = await build({ entryPoints: [new URL(`../src/${name}.jsx`, import.meta.url).pathname],
    bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
    plugins: [{ name: 'api-fixture', setup(build) {
      build.onResolve({ filter: /api\/raspberryApi$/ }, () => ({ path: 'api', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        export const isMockMode = () => false;
        export const getTmdbCacheStatus = (...args) => tmdbTestApi.read(...args);
        export const getTmdbCreditsStatus = (...args) => tmdbTestApi.read(...args);
        export const clearLocalMetadataCache = () => {};
        export const cancelTmdbCacheDownload = () => {};
        export const discardTmdbCacheImage = () => {};
      ` }));
    } }] });
  return { name, source: result.outputFiles[0].text };
}));

function harness(source) {
  const slots = [], effects = [], timers = new Map(), calls = [];
  let cursor = 0, tree, timerId = 0;
  const hooks = { ...React,
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useCallback(callback) { const i = cursor++; return slots[i] ||= callback; },
    useEffect(effect, deps) { const i = cursor++; if (!effects[i]) effects[i] = { effect, deps }; },
  };
  const api = { read(start, signal) { return new Promise((resolve, reject) => calls.push({ start, signal, resolve, reject })); } };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: () => hooks,
    tmdbTestApi: api, AbortController,
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  });
  function render() {
    cursor = 0;
    tree = module.exports.default({ language: 'es' });
    for (const effect of effects) if (effect && !effect.cleanup) effect.cleanup = effect.effect();
    return renderToStaticMarkup(tree);
  }
  function findButton(label, node = tree) {
    if (Array.isArray(node)) return node.map(child => findButton(label, child)).find(Boolean);
    if (!node || typeof node !== 'object') return null;
    return node.type === 'button' && node.props.children === label ? node : findButton(label, node.props?.children);
  }
  return { calls, render,
    retry() { findButton('Actualizar estado').props.onClick(); },
    poll() { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } },
    unmount() { for (const effect of effects) effect?.cleanup?.(); },
    remount() { for (const effect of effects) if (effect) effect.cleanup = effect.effect(); },
  };
}
const complete = { total: 440, complete: 440, ready: 440, pending: 0, running: 0, remaining: 0, failed: 0,
  storage: { available: true, calculating: false, gb: 82, percent: 4 } };
const flush = () => new Promise(setImmediate);

for (const panel of panels) {
  test(`${panel.name}: loading, final error, manual retry and final result are distinct states`, async () => {
    const h = harness(panel.source);
    assert.match(h.render(), /library-loading__spinner/);
    assert.doesNotMatch(h.render(), /role="alert"|440|Todas las fichas/);
    assert.equal(h.calls.length, 1);
    h.poll();
    assert.equal(h.calls.length, 1, 'pending reads must not overlap');
    h.calls[0].reject(Error('No se puede leer el disco.'));
    await flush();
    assert.match(h.render(), /role="alert"[^>]*>No se puede leer el disco/);
    assert.doesNotMatch(h.render(), /library-loading__spinner|Todas las fichas/);
    h.poll();
    assert.equal(h.calls.length, 1, 'terminal errors must not silently restart');
    h.retry();
    assert.match(h.render(), /library-loading__spinner/);
    assert.doesNotMatch(h.render(), /role="alert"/);
    h.calls[1].resolve(complete);
    await flush();
    assert.match(h.render(), /440/);
    assert.doesNotMatch(h.render(), /role="alert"|library-loading__spinner/);
    h.poll();
    assert.match(h.render(), /440/, 'automatic refresh must not collapse the last valid counters');
    h.calls[2].reject(Error('Conexión interrumpida.'));
    await flush();
    assert.match(h.render(), /role="alert"/);
    assert.doesNotMatch(h.render(), /440|Todas las fichas/, 'stale success must not accompany a failed check');
    h.unmount();
  });

  test(`${panel.name}: leaving aborts the check and ignores late replies after remount`, async () => {
    const h = harness(panel.source);
    h.render();
    h.unmount();
    assert.equal(h.calls[0].signal.aborted, true);
    h.remount();
    assert.equal(h.calls.length, 2);
    h.calls[0].resolve(complete);
    await flush();
    assert.match(h.render(), /library-loading__spinner/);
    assert.doesNotMatch(h.render(), /440/);
    h.calls[1].resolve({ ...complete, total: 1, ready: 1, complete: 1 });
    await flush();
    assert.doesNotMatch(h.render(), /440|library-loading__spinner/);
    h.unmount();
  });
}

test('storage still being calculated never presents the previous size as the final size', async () => {
  const h = harness(panels[0].source);
  h.render();
  h.calls[0].resolve({ ...complete, storage: { ...complete.storage, calculating: true } });
  await flush();
  assert.match(h.render(), /Calculando el espacio.*|library-loading__spinner/);
  assert.doesNotMatch(h.render(), /82,00 GB/);
  h.unmount();
});
