import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { completedTorrentNotifications, torrentNotificationKey } from '../src/torrentNotifications.js';
import { mergeProfileState, EMPTY_STATE } from '../src/profileState.js';
import { torrentStrings } from '../src/torrentUtils.js';

const require = createRequire(import.meta.url);
const result = await build({
  entryPoints: [new URL('../src/TorrentDownloads.jsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node',
  external: ['react', 'react-dom'], loader: { '.css': 'empty', '.png': 'dataurl' },
  define: { 'import.meta.env': '{"VITE_WEB_DEV_MODE":"mock"}' },
});
const module = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
const { default: TorrentDownloads, TorrentNotificationBadge } = module.exports;
const jobs = ['First movie', 'Second movie'].map((name, index) => ({
  id: `movie-${index}`, createdAt: index + 1, state: 'complete', movie: { id: index + 1, name },
}));
const render = (rows, preferences = {}, language = 'es') => renderToStaticMarkup(React.createElement(TorrentDownloads, {
  downloads: { jobs: rows, loaded: true }, language, notificationsReady: true,
  notificationPreferences: preferences, onNotificationChange() {}, onOpenMovie() {},
}));
const badge = (rows, preferences) => renderToStaticMarkup(React.createElement(TorrentNotificationBadge, {
  count: completedTorrentNotifications(rows, preferences).length,
}));

test('dismissing completed notifications removes each button and decrements the badge to nothing', () => {
  let state = mergeProfileState(EMPTY_STATE, {
    torrentNotifications: Object.fromEntries(jobs.map(job => [torrentNotificationKey(job), true])),
  });
  assert.match(badge(jobs, state.torrentNotifications), />2<\/span>/);
  for (const [index, job] of jobs.entries()) {
    assert.match(render([job], state.torrentNotifications), /Dejar de avisar:/);
    state = mergeProfileState(state, { torrentNotifications: { [torrentNotificationKey(job)]: false } });
    const html = render([job], state.torrentNotifications);
    assert.doesNotMatch(html, /torrent-job__notify|Avisarme al terminar|Dejar de avisar:/);
    assert.match(html, /Ir a la ficha/);
    if (index === 0) assert.match(badge(jobs, state.torrentNotifications), />1<\/span>/);
  }
  assert.equal(badge(jobs, state.torrentNotifications), '');
  const restored = JSON.parse(JSON.stringify(state));
  assert.equal(badge(jobs, restored.torrentNotifications), '');
  assert.doesNotMatch(render(jobs, restored.torrentNotifications), /torrent-job__notify/);
});

test('only unfinished downloads allow enabling notifications; history only allows dismissing existing ones', () => {
  for (const state of ['queued', 'downloading', 'paused', 'importing', 'metadata', 'failed']) {
    assert.match(render([{ ...jobs[0], state }]), /Avisarme al terminar/);
  }
  for (const state of ['complete', 'cancelled']) {
    assert.doesNotMatch(render([{ ...jobs[0], state }]), /torrent-job__notify/);
  }
});

test('movie detail links appear for completed movies, including old jobs, and never for other media or incomplete jobs', () => {
  assert.match(render(jobs), /Ir a la ficha/);
  assert.match(render([{ ...jobs[0], mediaType: 'movies' }]), /Ir a la ficha/);
  for (const mediaType of ['series', 'books']) {
    assert.doesNotMatch(render([{ ...jobs[0], mediaType }]), /Ir a la ficha/);
  }
  for (const state of ['queued', 'downloading', 'metadata', 'failed', 'cancelled']) {
    assert.doesNotMatch(render([{ ...jobs[0], state }]), /Ir a la ficha/);
  }
});

test('movie lookup, missing catalog entry and dismissal labels exist in every supported language', () => {
  for (const language of ['es', 'ca', 'en']) {
    const s = torrentStrings(language);
    for (const key of ['openMovie', 'openingMovie', 'movieMissing', 'movieMissingCopy', 'movieLookupFailed', 'movieLookupFailedCopy', 'close']) {
      assert.ok(s[key]);
    }
    assert.ok(s.movieMissingCopy.includes('{name}'));
    assert.ok(render(jobs, {}, language).includes(s.openMovie));
  }
});

test('combined episode warning replaces retry with download anyway in every language', () => {
  const job = { id: 'combined', mediaType: 'series', series: { name: 'Friends' }, state: 'failed',
    canDownloadAnyway: true, error: 'Old rejection', errorFile: 'Friends.S10E17E18.mkv' };
  for (const language of ['es', 'ca', 'en']) {
    const s = torrentStrings(language);
    const html = render([job], {}, language);
    assert.ok(html.includes(s.downloadAnyway));
    assert.ok(html.includes(s.combinedEpisodesWarning));
    assert.ok(html.includes(`>${s.warning}</span>`));
    assert.ok(!html.includes(`>${s.retry}</button>`));
    assert.ok(!html.includes(job.error));
    assert.ok(html.includes(job.errorFile));
    const accepted = render([{ ...job, state: 'downloading', canDownloadAnyway: false, error: '', allowCombinedEpisodes: true }], {}, language);
    assert.ok(accepted.includes(s.combinedEpisodesAccepted));
    assert.ok(!accepted.includes(s.downloadAnyway));
  }
});

test('unrelated download failures retain retry and cannot bypass the error', () => {
  const html = render([{ id: 'other', state: 'failed', error: 'Disk full' }]);
  assert.match(html, />Reintentar<\/button>/);
  assert.match(html, /Disk full/);
  assert.doesNotMatch(html, /Descargar igualmente/);
});
