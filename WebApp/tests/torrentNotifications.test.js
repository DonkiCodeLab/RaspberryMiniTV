import { test } from "node:test";
import assert from "node:assert/strict";
import { completedTorrentNotifications, torrentNotificationKey, torrentNotificationLabel, wantsTorrentNotification } from "../src/torrentNotifications.js";
import { EMPTY_STATE, mergeProfileState } from "../src/profileState.js";
import { torrentStrings } from "../src/torrentUtils.js";

const movie = { id: "movie-hash", createdAt: 100, state: "downloading", progress: 20 };
const key = torrentNotificationKey(movie);

test("only selected downloads notify, after import and metadata have finished", () => {
  const preferences = { [key]: true };
  for (const state of ["queued", "downloading", "paused", "importing", "metadata", "failed", "cancelled"]) {
    assert.deepEqual(completedTorrentNotifications([{ ...movie, state, progress: 100 }], preferences), []);
  }
  const finished = { ...movie, state: "complete" };
  assert.deepEqual(completedTorrentNotifications([finished]), []);
  assert.deepEqual(completedTorrentNotifications([finished], preferences), [finished]);
  assert.deepEqual(completedTorrentNotifications([finished], { [key]: false }), []);
  assert.deepEqual(completedTorrentNotifications([], preferences), []);
});

test("subscriptions survive reloads and independent profile edits without notifying another profile", () => {
  const saved = mergeProfileState(EMPTY_STATE, { torrentNotifications: { [key]: true, other: true } });
  const reloaded = JSON.parse(JSON.stringify(saved));
  const withMarks = mergeProfileState(reloaded, { marks: { movie: { watched: true } } });
  const finished = { ...movie, state: "complete" };
  assert.equal(completedTorrentNotifications([finished], withMarks.torrentNotifications).length, 1);
  assert.equal(completedTorrentNotifications([finished], EMPTY_STATE.torrentNotifications).length, 0);
  const disabled = mergeProfileState(withMarks, { torrentNotifications: { [key]: false } });
  assert.deepEqual(disabled.torrentNotifications, { [key]: false, other: true });
  assert.equal(completedTorrentNotifications([finished], disabled.torrentNotifications).length, 0);
  assert.equal(disabled.marks.movie.watched, true);
  assert.deepEqual(mergeProfileState({ marks: {}, progress: {} }, {}).torrentNotifications, {});
});

test("restarting a torrent preserves the archived alert and does not subscribe its new run", () => {
  const preferences = { [key]: true };
  const archived = { ...movie, id: `${movie.id}-history-123456789`, state: "complete" };
  const restarted = { ...movie, createdAt: 200 };
  assert.equal(torrentNotificationKey(archived), key);
  assert.equal(wantsTorrentNotification(restarted, preferences), false);
  assert.deepEqual(completedTorrentNotifications([archived, { ...restarted, state: "complete" }], preferences), [archived]);
});

test("movies, series and books contribute to a single count and all controls are translated", () => {
  const jobs = ["movies", "series", "books"].map(mediaType => ({ ...movie, id: mediaType, mediaType, state: "complete" }));
  const preferences = Object.fromEntries(jobs.map(job => [torrentNotificationKey(job), true]));
  assert.equal(completedTorrentNotifications(jobs, preferences).length, 3);
  for (const language of ["es", "ca", "en"]) {
    const strings = torrentStrings(language);
    for (const name of ["notify", "stopNotifying", "notificationReady", "notificationsHint"]) assert.ok(strings[name]);
    assert.match(torrentNotificationLabel(1, strings), /^1 /);
    assert.match(torrentNotificationLabel(3, strings), /^3 /);
  }
});
