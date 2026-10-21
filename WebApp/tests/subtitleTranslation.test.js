import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { canTranslateSubtitle, waitForSubtitleTranslation } from '../src/subtitleTranslation.js';
const result = await build({ entryPoints: [new URL('../src/SubtitleTranslationOffer.jsx', import.meta.url).pathname], bundle: true, write: false,
  format: 'cjs', platform: 'node', external: ['react'] });
const module = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const tracks = [{ id: 'external:Film.en.srt', language: 'en', kind: 'external', available: true }];
const render = props => renderToStaticMarkup(React.createElement(module.exports.default, { tracks, missingLanguages: ['es'], targetLanguage: 'es', language: 'es', ...props }));
test('translation offered after a missing target and a subtitle in another language becomes available', () => {
  assert.equal(canTranslateSubtitle(['es'], 'es', []), false);
  assert.equal(canTranslateSubtitle(['es'], 'es', tracks), true);
  assert.equal(canTranslateSubtitle([], 'es', tracks), false);
  assert.equal(canTranslateSubtitle(['es'], 'es', [{ ...tracks[0], language: 'spa' }]), false);
  assert.equal(canTranslateSubtitle(['es'], 'es', [{ ...tracks[0], available: false }]), false);
  assert.match(render(), /Traducir subtítulo con la IA/);
  assert.match(render(), /Subtítulo de origen/);
  assert.equal(render({ missingLanguages: [] }), '');
  assert.equal(render({ tracks: [] }), '');
});
test('running translation prevents another paid click', () => { assert.match(render({ busy: true }), /disabled=""/); });
test('polls background progress until completed and never reports failed files as saved', async () => {
  const updates = [];
  const final = await waitForSubtitleTranslation({ id: 'job', state: 'queued' }, {
    onProgress: job => updates.push(job.state), wait: async () => {}, getStatus: async () => ({ id: 'job', state: 'ready', file: 'Film.es.ai.srt' }) });
  assert.deepEqual(updates, ['queued', 'ready']); assert.equal(final.file, 'Film.es.ai.srt');
  await assert.rejects(waitForSubtitleTranslation({ id: 'job', state: 'failed', code: 'AI_TIMEOUT' }, {}), error => error.code === 'AI_TIMEOUT');
});
test('closing stops polling without creating a new job or retrying OpenAI', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(waitForSubtitleTranslation({ id: 'job', state: 'queued' }, { signal: controller.signal }), { name: 'AbortError' });
});
