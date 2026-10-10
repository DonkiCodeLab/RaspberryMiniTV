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
    [{ id: 9, key: "person:9", name: "Creator", profilePath: null }]);
});

test("portraits survive merged credits and creators reject invalid image paths", () => {
  const credits = normalizeMediaCredits({
    cast: [{ id: 1, name: "Actor", character: "First", profile_path: "/actor.jpg" },
      { id: 1, name: "Actor", character: "Second", profile_path: null }],
    crew: [{ id: 2, name: "Filmmaker", job: "Director" },
      { id: 2, name: "Filmmaker", job: "Writer", profile_path: "/writer.png" }],
  });
  assert.equal(credits.cast[0].profilePath, "/actor.jpg");
  assert.equal(credits.directors[0].profilePath, "/writer.png");
  assert.equal(credits.writers[0].profilePath, "/writer.png");
  assert.equal(normalizeCreators([{ name: "Creator", profile_path: "/creator.webp" }])[0].profilePath, "/creator.webp");
  for (const profile_path of ["https://example.com/person.jpg", "/../private.jpg", "/person.svg", "", null]) {
    assert.equal(normalizeCreators([{ name: "Creator", profile_path }])[0].profilePath, null);
  }
});

test("missing local metadata and old servers remain pending, while network failures are errors", () => {
  assert.equal(mediaCreditsFailure({ code: "TMDB_LOCAL_MISSING", status: 409 }), "pending");
  assert.equal(mediaCreditsFailure({ status: 400 }), "pending");
  assert.equal(mediaCreditsFailure({ status: 404 }), "pending");
  assert.equal(mediaCreditsFailure({ status: 500 }), "error");
  assert.equal(mediaCreditsFailure(new TypeError("Failed to fetch")), "error");
});

test("cast panel renders all roles and expandable credits in each supported language", async context => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { origin: "http://raspberry:5050", hostname: "raspberry" }, sessionStorage: { getItem: () => "test-pin" } };
  context.after(() => { globalThis.window = previousWindow; });
  const result = await build({ entryPoints: [new URL("../src/MediaCredits.jsx", import.meta.url).pathname],
    bundle: true, write: false, format: "cjs", platform: "node", external: ["react"],
    loader: { ".css": "empty" }, define: { "import.meta.env": "{}" } });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  const credits = normalizeMediaCredits({
    cast: Array.from({ length: 14 }, (_, index) => ({ id: index + 1, name: `Actor ${index}`, order: index,
      profile_path: index === 0 ? null : `/actor-${index}.jpg`,
      total_episode_count: 10, roles: [{ character: `Character ${index}` }] })),
    crew: [{ id: 99, name: "A Director", job: "Director", profile_path: "/director.jpg" },
      { id: 100, name: "A Writer", job: "Writer", profile_path: "/writer.jpg" }],
  });
  for (const [language, heading, expanded] of [["es", "Reparto y equipo", "Ver 2 más"], ["ca", "Repartiment i equip", "Veure’n 2 més"], ["en-US", "Cast and crew", "Show 2 more"]]) {
    const html = renderToStaticMarkup(React.createElement(module.exports.MediaCreditsContent, { credits, language,
      creators: [{ id: 101, name: "A Creator", profile_path: "/creator.jpg" }] }));
    assert.ok(html.includes(heading));
    assert.ok(html.includes(expanded));
    assert.match(html, /<details class="media-credits"[^>]*><summary class="media-credits__summary">/);
    assert.doesNotMatch(html, /<details[^>]*\sopen(?:[\s=>])/);
    assert.match(html, /Actor 13/);
    assert.match(html, /Character 13/);
    assert.match(html, /A Director/);
    assert.match(html, /media-credits__avatar/);
    assert.match(html, /<span>A0<\/span>/);
    for (const filename of ["actor-13.jpg", "director.jpg", "writer.jpg", "creator.jpg"]) assert.ok(html.includes(filename));
    assert.match(html, /loading="lazy"/);
    assert.match(html, /width=185|\/w185\//);
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
