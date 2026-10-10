import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mediaCreditsFailure, normalizeCreators, normalizeMediaCredits } from "../src/mediaCredits.js";

test("movie credits preserve people IDs, merge roles and recognize directors and writers", () => {
  const credits = normalizeMediaCredits({
    cast: [
      { id: 1, name: "Actor One", character: "Narrator", order: 2 },
      { id: 2, name: "Actor Two", character: "Lead", order: 0 },
      { id: 1, name: "Actor One", character: "Narrator", order: 2 },
      { id: 1, name: "Actor One", character: "Friend", order: 1 },
      { id: 3, name: "Actor One", character: "Namesake", order: 3 },
    ],
    crew: [
      { id: 10, name: "Filmmaker", job: "Director", department: "Directing" },
      { id: 10, name: "Filmmaker", job: "Screenplay", department: "Writing" },
      { id: 10, name: "Filmmaker", job: "Producer", department: "Production" },
      { id: 11, name: "Novelist", job: "Novel", department: "Writing" },
      { id: 12, name: "Assistant", job: "Assistant Director", department: "Directing" },
    ],
  });
  assert.deepEqual(credits.cast.map(person => person.id), [2, 1, 3]);
  assert.deepEqual(credits.cast[1].characters, ["Narrator", "Friend"]);
  assert.deepEqual(credits.directors.map(person => person.id), [10]);
  assert.deepEqual(credits.writers.map(person => person.id), [10, 11]);
  assert.deepEqual(credits.directors[0].jobs, ["Director", "Screenplay", "Producer"]);
});

test("series aggregate credits combine characters and jobs without duplicate people or episode overcounting", () => {
  const credits = normalizeMediaCredits({
    cast: [
      { id: 1, name: "Voice", order: 0, total_episode_count: 20,
        roles: [{ character: "First", episode_count: 12 }, { character: "Second", episode_count: 16 }] },
      { id: 1, name: "Voice", order: 2, total_episode_count: 20,
        roles: [{ character: "Second", episode_count: 16 }, { character: "Third", episode_count: 2 }] },
    ],
    crew: [
      { id: 2, name: "Director", department: "Directing", jobs: [{ job: "Director", episode_count: 10 }, { job: "Director", episode_count: 5 }] },
      { id: 3, name: "Writer", jobs: [{ job: "Teleplay", episode_count: 8 }, { job: "Story", episode_count: 3 }] },
      { id: 4, name: "Music", department: "Sound", jobs: [{ job: "Original Music Composer" }] },
    ],
  });
  assert.equal(credits.cast.length, 1);
  assert.deepEqual(credits.cast[0].characters, ["First", "Second", "Third"]);
  assert.equal(credits.cast[0].episodeCount, 20);
  assert.deepEqual(credits.directors.map(person => person.name), ["Director"]);
  assert.deepEqual(credits.directors[0].jobs, ["Director"]);
  assert.deepEqual(credits.writers.map(person => person.name), ["Writer"]);
});

test("credits tolerate sparse records, preserve billing order and deduplicate creators", () => {
  const credits = normalizeMediaCredits({ cast: [null, {}, { name: " Unknown " }, { name: "Unknown", character: "Self" },
    { id: 5, original_name: "Original", order: 0 }], crew: null });
  assert.equal(credits.cast.length, 2);
  assert.equal(credits.cast[0].name, "Original");
  assert.deepEqual(credits.cast[1].characters, ["Self"]);
  assert.deepEqual(credits.directors, []);
  assert.deepEqual(normalizeMediaCredits(null), { cast: [], directors: [], writers: [] });
  assert.deepEqual(normalizeCreators([{ id: 9, name: "Creator" }, { id: 9, name: "Creator" }, null]),
    [{ id: 9, key: "person:9", name: "Creator" }]);
});

test("missing local metadata and old servers remain pending, while network failures are errors", () => {
  assert.equal(mediaCreditsFailure({ code: "TMDB_LOCAL_MISSING", status: 409 }), "pending");
  assert.equal(mediaCreditsFailure({ status: 400 }), "pending");
  assert.equal(mediaCreditsFailure({ status: 404 }), "pending");
  assert.equal(mediaCreditsFailure({ status: 500 }), "error");
  assert.equal(mediaCreditsFailure(new TypeError("Failed to fetch")), "error");
});

test("cast panel renders all roles and expandable credits in each supported language", async () => {
  const result = await build({ entryPoints: [new URL("../src/MediaCredits.jsx", import.meta.url).pathname],
    bundle: true, write: false, format: "cjs", platform: "node", external: ["react"],
    loader: { ".css": "empty" }, define: { "import.meta.env": "{}" } });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  const credits = normalizeMediaCredits({
    cast: Array.from({ length: 14 }, (_, index) => ({ id: index + 1, name: `Actor ${index}`, order: index,
      total_episode_count: 10, roles: [{ character: `Character ${index}` }] })),
    crew: [{ id: 99, name: "A Director", job: "Director" }],
  });
  for (const [language, heading, expanded] of [["es", "Reparto y equipo", "Ver 2 más"], ["ca", "Repartiment i equip", "Veure’n 2 més"], ["en-US", "Cast and crew", "Show 2 more"]]) {
    const html = renderToStaticMarkup(React.createElement(module.exports.MediaCreditsContent, { credits, language }));
    assert.ok(html.includes(heading));
    assert.ok(html.includes(expanded));
    assert.match(html, /<details/);
    assert.match(html, /Actor 13/);
    assert.match(html, /Character 13/);
    assert.match(html, /A Director/);
    assert.doesNotMatch(html, /<img/);
  }
  const pending = renderToStaticMarkup(React.createElement(module.exports.MediaCreditsContent,
    { status: "pending", language: "es", onRetry() {} }));
  assert.match(pending, /pendientes de completar/);
  assert.match(pending, /Reintentar/);
  assert.doesNotMatch(pending, /no incluye/);
  const empty = renderToStaticMarkup(React.createElement(module.exports.MediaCreditsContent,
    { status: "ready", credits: normalizeMediaCredits(null), language: "es" }));
  assert.match(empty, /no incluye reparto/);
});
