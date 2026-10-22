import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { requestTmdbStatus } from '../src/tmdbStatusRequest.js';

test('slow status stays pending past ten seconds and polls a single calculation until ready', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  let finish;
  let settled = false;
  const pending = requestTmdbStatus(options => {
    calls.push(options);
    return calls.length === 1 ? new Promise(resolve => { finish = resolve; })
      : Promise.resolve(calls.length < 3 ? { calculating: true } : { total: 440, ready: 440 });
  }).then(result => { settled = true; return result; });
  t.mock.timers.tick(30000);
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(calls[0].signal.aborted, false);
  finish({ calculating: true });
  await new Promise(setImmediate);
  t.mock.timers.tick(1000);
  await new Promise(setImmediate);
  assert.equal(settled, false);
  t.mock.timers.tick(1000);
  assert.deepEqual(await pending, { total: 440, ready: 440 });
  assert.deepEqual(calls.map(call => call.refresh), [true, false, false]);
});

test('failed checks are terminal and pending calculation waits can be cancelled', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  await assert.rejects(requestTmdbStatus(() => { calls++; throw Error('disk unavailable'); }), /disk unavailable/);
  t.mock.timers.tick(60000);
  assert.equal(calls, 1);
  const controller = new AbortController();
  const pending = requestTmdbStatus(async () => { calls++; return { calculating: true }; }, { signal: controller.signal });
  await new Promise(setImmediate);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  t.mock.timers.tick(60000);
  assert.equal(calls, 2);
});

test('an unresponsive server produces a final status error with an aborted request', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  const pending = requestTmdbStatus(options => { signal = options.signal; return new Promise(() => {}); });
  const assertion = assert.rejects(pending, /estado de TMDB.*no responde/);
  t.mock.timers.tick(120000);
  await assertion;
  assert.equal(signal.aborted, true);
});

test('both API reads opt into background status, retain PIN authentication, and starts stay POST', async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  globalThis.window = { location: { origin: 'http://raspberry:5050', hostname: 'raspberry' }, sessionStorage: { getItem: () => 'test-pin' } };
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, text: async () => '{"total":440,"ready":440}' };
  };
  try {
    const result = await build({ entryPoints: [new URL('../src/api/raspberryApi.js', import.meta.url).pathname],
      bundle: true, write: false, format: 'esm', platform: 'browser', define: { 'import.meta.env': '{}' } });
    const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
    for (const read of [api.getTmdbCacheStatus, api.getTmdbCreditsStatus]) {
      assert.equal((await read()).total, 440);
      await read(true);
    }
    for (const [index, call] of calls.entries()) {
      const url = new URL(call.url);
      assert.equal(call.options.headers['X-Web-Pin'], 'test-pin');
      assert.equal(call.options.cache, 'no-store');
      assert.equal(call.options.method || 'GET', index % 2 ? 'POST' : 'GET');
      assert.equal(url.search, index % 2 ? '' : '?background=1&refresh=1');
    }
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});
