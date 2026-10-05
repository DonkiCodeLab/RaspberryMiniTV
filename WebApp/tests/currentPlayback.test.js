import { test } from "node:test";
import assert from "node:assert/strict";
import { playbackArtwork, refreshCurrentPlayback } from "../src/currentPlayback.js";

test("Control prefers the poster and updates metadata arriving after playback begins", () => {
  assert.equal(playbackArtwork({ posterImage: "poster", heroImage: "backdrop" }), "poster");
  const initial = { kind: "movie", playbackId: "FILM", directory: "Movies", filePath: "Movies/film.mp4", image: "placeholder", paused: true };
  const hydrated = refreshCurrentPlayback(initial, { ...initial, image: "poster", paused: false });
  assert.equal(hydrated.image, "poster");
  assert.equal(hydrated.paused, true);
  assert.equal(refreshCurrentPlayback(hydrated, { ...hydrated, paused: false }), hydrated);
  assert.equal(refreshCurrentPlayback(hydrated, null), null);
});

test("changing the playing file replaces the previous cover and pause state", () => {
  const old = { kind: "movie", playbackId: "FILM", directory: "Movies", filePath: "Movies/a.mp4", image: "a", paused: true };
  const next = { ...old, filePath: "Movies/b.mp4", image: "b", paused: false };
  assert.deepEqual(refreshCurrentPlayback(old, next), next);
});
