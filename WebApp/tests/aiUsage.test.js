import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { usageRange, usageValue, formatUsageMoney } from '../src/aiUsage.js';
import { aiUsageStrings } from '../src/aiUsageStrings.js';

test('UTC presets handle Mondays, year boundaries and leap years', () => {
  assert.deepEqual(usageRange('week', new Date('2025-01-01T12:30:00Z')), { start: '2024-12-30', end: '2025-01-01' });
  assert.deepEqual(usageRange('month', new Date('2024-02-29T23:30:00Z')), { start: '2024-02-01', end: '2024-02-29' });
  assert.deepEqual(usageRange('year', new Date('2026-10-21T12:00:00Z')), { start: '2026-01-01', end: '2026-10-21' });
});

test('missing costs remain gaps and small costs are visible instead of rounding to zero', () => {
  const point = { calls: 3, unknown: 3, estimatedUsd: 0, reportedUsd: null, tokens: 40 };
  assert.equal(usageValue(point, 'cost', 'local'), null);
  assert.equal(usageValue(point, 'calls', 'local'), 3);
  assert.equal(usageValue(point, 'cost', 'reported'), null);
  assert.equal(usageValue({ ...point, missingTokens: 3 }, 'tokens', 'local'), null);
  assert.equal(usageValue({ ...point, reportedUsd: -.05 }, 'cost', 'reported'), -.05);
  assert.match(formatUsageMoney(.00002, 'en-US'), /0\.00002/);
  assert.equal(formatUsageMoney(null), '—');
});

async function loadComponents(env = {}) {
  const result = await build({ entryPoints: [new URL('../src/OpenAIUsage.jsx', import.meta.url).pathname],
    bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'], loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify(env) } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  return module.exports;
}

test('results distinguish API outcomes from estimated costs and escape upstream values', async () => {
  const { UsageResults } = await loadComponents();
  const data = {
    summary: { calls: 1, tokens: 20, unknown: 1, missingTokens: 0, estimatedUsd: 0 },
    reported: { usd: null, days: 0, totalDays: 1 }, series: [], breakdown: [], page: 0, hasMore: false,
    since: 1, pricingDate: '2026-10-21',
    calls: [{ id: '1', started: 1, operation: 'search', model: '<script>alert(1)</script>', status: 'unknown',
      usage: { input_tokens: 10, output_tokens: 10 }, cost_status: 'unknown_tariff', estimatedUsd: null }],
  };
  const html = renderToStaticMarkup(React.createElement(UsageResults, {
    data, filters: { page: 0 }, setFilters() {}, language: 'es', source: 'local', metric: 'cost',
  }));
  assert.match(html, /Sin confirmar/);
  assert.match(html, /Llamadas sin coste estimado/);
  assert.match(html, /Coste comunicado por OpenAI/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('mock mode requires connection and never displays fabricated usage or an Admin key form', async () => {
  const { default: Component } = await loadComponents({ VITE_WEB_DEV_MODE: 'mock' });
  const html = renderToStaticMarkup(React.createElement(Component, { language: 'es' }));
  assert.match(html, /Conecta con la Raspberry/);
  assert.doesNotMatch(html, /type="password"|<table|<svg/);
  for (const language of ['es', 'ca', 'en']) {
    assert.deepEqual(Object.keys(aiUsageStrings(language)).sort(), Object.keys(aiUsageStrings('en')).sort());
  }
});

test('opening usage fetches fresh totals and keeps visible translations up to date', async () => {
  const compiled = await build({ entryPoints: [new URL('../src/OpenAIUsage.jsx', import.meta.url).pathname],
    bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'], loader: { '.css': 'empty' },
    plugins: [{ name: 'usage-api', setup(builder) {
      builder.onResolve({ filter: /api\/raspberryApi$/ }, () => ({ path: 'usage-api', external: true }));
    } }] });
  const state = [], effects = [], refs = [], calls = [], timers = new Set(), listeners = new Map();
  let cursor = 0, tree;
  const fakeReact = { ...React,
    useState(initial) {
      const i = cursor++;
      if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial;
      return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }];
    },
    useRef(initial) { const i = cursor++; return refs[i] ||= { current: initial }; },
    useEffect(effect, deps) {
      const i = cursor++, old = effects[i];
      if (!old || deps.some((value, index) => value !== old.deps[index])) {
        effects[i] = { effect, deps, previous: old?.cleanup, pending: true };
      }
    },
  };
  const document = { visibilityState: 'visible',
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const api = { isMockMode: () => false, getAIUsage: (filters, signal) => new Promise(resolve => calls.push({ signal, resolve })) };
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports, AbortController, document,
    require: name => name === 'react' ? fakeReact : api,
    setInterval: fn => { timers.add(fn); return fn; }, clearInterval: fn => timers.delete(fn) });
  function render(active) {
    cursor = 0;
    tree = module.exports.default({ language: 'es', active });
    for (const effect of effects) if (effect?.pending) {
      effect.previous?.(); effect.cleanup = effect.effect(); effect.pending = false;
    }
  }
  const tick = () => { for (const fn of timers) fn(); };
  const settle = async (index, total) => {
    calls[index].resolve({ summary: { calls: total }, billing: { projectId: '', apiKeyId: '' } });
    await new Promise(resolve => setImmediate(resolve));
  };
  render(false);
  assert.equal(calls.length, 0);
  render(true);
  assert.equal(calls.length, 1);
  tick(); assert.equal(calls.length, 1, 'do not overlap pending requests');
  await settle(0, 0);
  tick(); assert.equal(calls.length, 2);
  await settle(1, 2);
  render(true);
  const findData = node => {
    if (Array.isArray(node)) return node.map(findData).find(Boolean);
    if (!node || typeof node !== 'object') return null;
    return node.props?.data || findData(node.props?.children);
  };
  assert.equal(findData(tree).summary.calls, 2, 'new subtitle usage replaces the initial zero');
  document.visibilityState = 'hidden'; tick(); assert.equal(calls.length, 2);
  document.visibilityState = 'visible'; listeners.get('visibilitychange')(); assert.equal(calls.length, 3);
  render(false);
  assert.equal(calls[2].signal.aborted, true);
  assert.equal(timers.size, 0); assert.equal(listeners.size, 0);
  await settle(2, 99);
  render(true);
  assert.equal(calls.length, 4, 'reopening fetches fresh data');
  render(false);
});

test('metering endpoints use PIN, no-store and separate Admin configuration from query parameters', async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch, calls = [];
  globalThis.window = { location: { hostname: 'raspberry', origin: 'http://raspberry:5050' },
    sessionStorage: { getItem: () => 'test-pin' }, localStorage: { setItem() { throw new Error('No secrets in browser storage'); } } };
  globalThis.fetch = async (url, options) => {
    calls.push({ url: new URL(url), options });
    return { ok: true, text: async () => '{"ok":true}' };
  };
  try {
    const bundle = await build({ entryPoints: [new URL('../src/api/raspberryApi.js', import.meta.url).pathname], bundle: true,
      write: false, format: 'esm', platform: 'browser', define: { 'import.meta.env': '{}' } });
    const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
    await api.getAIUsage({ start: '2026-10-01', end: '2026-10-21', period: 'week', operation: 'subtitle', model: '', page: 1 });
    await api.saveAIBilling({ adminKey: 'sk-admin-test', projectId: 'proj_test' });
    await api.syncAIBilling({ start: '2026-10-01', end: '2026-10-21' });
    assert.equal(calls[0].url.searchParams.get('period'), 'week');
    assert.equal(calls[0].url.searchParams.has('model'), false);
    assert.equal(calls[1].url.pathname, '/settings/ai/billing');
    assert.equal(calls[2].url.pathname, '/settings/ai/billing/sync');
    assert.deepEqual(JSON.parse(calls[2].options.body), { start: '2026-10-01', end: '2026-10-21' });
    for (const call of calls) {
      assert.equal(call.options.headers['X-Web-Pin'], 'test-pin');
      assert.equal(call.options.cache, 'no-store');
      assert.doesNotMatch(call.url.href, /sk-admin/);
    }
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});
