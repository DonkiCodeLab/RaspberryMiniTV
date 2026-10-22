import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { canTranslateSubtitle, translationSources, waitForSubtitleTranslation } from '../src/subtitleTranslation.js';
import { LANGUAGES } from '../src/i18n/languages.js';
const result = await build({ entryPoints: [new URL('../src/SubtitleTranslationOffer.jsx', import.meta.url).pathname], bundle: true, write: false,
  format: 'cjs', platform: 'node', external: ['react'], loader: { '.css': 'empty', '.png': 'dataurl' } });
const module = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const tracks = [{ id: 'external:Film.en.srt', language: 'en', kind: 'external', available: true }];
const render = props => renderToStaticMarkup(React.createElement(module.exports.default, { tracks, missingLanguages: ['es'], targetLanguage: 'es', language: 'es', ...props }));
test('each available subtitle offers direct translation without a failed search', () => {
  const renderAction = props => renderToStaticMarkup(React.createElement(module.exports.SubtitleTranslationAction, {
    track: tracks[0], language: 'es', ...props,
  }));
  assert.match(renderAction(), /Traducir subtítulo con la IA/);
  assert.match(renderAction({ busy: true }), /disabled=""/);
  assert.equal(renderAction({ track: { ...tracks[0], available: false } }), '');
});

test('direct translation sends the listed source and chosen target, independently of subtitle search', () => {
  const state = [];
  let cursor = 0;
  const fakeReact = { ...React, useState(initial) {
    const index = cursor++;
    if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
    return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
  } };
  const localModule = { exports: {} };
  const require = createRequire(import.meta.url);
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(name => name === 'react' ? fakeReact : require(name), localModule, localModule.exports);
  const calls = [];
  const renderAction = (extra = {}) => {
    cursor = 0;
    return localModule.exports.SubtitleTranslationAction({ track: tracks[0], language: 'en', onTranslate: (...args) => calls.push(args), ...extra });
  };
  const children = node => React.Children.toArray(node.props.children);
  children(renderAction())[0].props.onClick();
  const panel = children(renderAction())[1];
  const selector = children(children(panel)[0])[1];
  assert.notEqual(selector.props.value, 'en');
  selector.props.onChange('ca');
  const confirm = children(children(renderAction())[1])[1];
  assert.equal(confirm.props.disabled, false);
  confirm.props.onClick();
  assert.deepEqual(calls, [['external:Film.en.srt', 'ca']]);
  selector.props.onChange('en');
  assert.equal(children(children(renderAction())[1])[1].props.disabled, true);
  assert.equal(children(children(renderAction({ busy: true }))[1])[1].props.disabled, true);
});
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
test('every MiniTV language offers AI after a missing subtitle, including distinct Arabic and Pidgin', () => {
  for (const { id } of LANGUAGES) {
    const source = [{ ...tracks[0], language: id === 'en' ? 'fr' : 'en' }];
    assert.equal(canTranslateSubtitle([id], id, source), true, id);
    assert.match(render({ missingLanguages: [id], targetLanguage: id, tracks: source }), /Traducir subtítulo con la IA/);
    assert.equal(canTranslateSubtitle([id], id, [{ ...tracks[0], language: id }]), false, id);
  }
  assert.equal(canTranslateSubtitle(['arz'], 'arz', [{ ...tracks[0], language: 'ara' }]), true);
  assert.equal(canTranslateSubtitle(['pcm'], 'pcm', tracks), true);
});
test('source language aliases exclude the target without treating unknown languages as Spanish', () => {
  for (const [tag, language] of [['fra', 'fr'], ['GER', 'de'], ['jpn', 'ja'], ['zho', 'zh'], ['zh-CN', 'zh'],
    ['pt-PT', 'pt'], ['por', 'pt'], ['hin', 'hi'], ['ben', 'bn'], ['ind', 'id'], ['urd', 'ur'],
    ['rus', 'ru'], ['mar', 'mr'], ['vie', 'vi'], ['tel', 'te'], ['swh', 'sw'], ['hau', 'ha'], ['ar_EG', 'arz']]) {
    assert.deepEqual(translationSources([{ ...tracks[0], language: tag }], language), [], tag);
  }
  assert.equal(translationSources([{ ...tracks[0], language: 'und' }, { ...tracks[0], language: '' }], 'es').length, 2);
});
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
