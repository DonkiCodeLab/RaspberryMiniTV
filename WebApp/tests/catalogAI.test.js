import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { aiRequestWithTimeout, aiSettingsPayload, catalogAIIds, catalogItemId, filterAICollections, matchesCatalogAI, validateAIResult } from "../src/catalogAI.js";
import { catalogAIError, catalogAIStrings } from "../src/catalogAIStrings.js";

test("AI filters use exact local paths, reject names/TMDB IDs and intersect existing filters", () => {
  const movie = { id: "Movies/a.mp4", fileRelativePath: "Movies/a.mp4", tmdbId: 1, name: "Same title", favorite: true };
  const duplicate = { id: "Movies/b.mp4", fileRelativePath: "Movies/b.mp4", tmdbId: 1, name: "Same title", favorite: false };
  const result = { intent: "filter", ids: ["Movies/a.mp4", "Movies/b.mp4", "not-in-library"] };
  const ids = catalogAIIds(result);
  assert.deepEqual([movie, duplicate].filter(item => item.favorite && matchesCatalogAI("movies", item, ids)), [movie]);
  assert.equal(matchesCatalogAI("movies", movie, new Set(["1"])), false);
  assert.equal(matchesCatalogAI("movies", movie, new Set(["Same title"])), false);
  assert.equal(catalogItemId("series", { id: 1, directoryPath: "TVShows/My Show" }), "TVShows/My Show");
  assert.equal(catalogItemId("pictures", { relativePath: "vacations/2024.jpg" }), "vacations/2024.jpg");
  assert.equal(matchesCatalogAI("pictures", { relativePath: "2024.jpg" }, new Set()), false);
  assert.equal(matchesCatalogAI("games", { relativePath: "Games/a.gb" }, null), true);
  assert.equal(catalogAIIds({ intent: "clarify", ids: [] }), null);
  assert.equal(catalogAIIds({ intent: "unsupported", ids: [] }), null);
});

test("AI book results filter collection membership and inner volumes without altering the saved cover", () => {
  const first = { relativePath: "Books/Collection/first.epub" }, second = { relativePath: "Books/Collection/second.epub" };
  const collections = [{ key: "collection", coverBook: first, books: [first, second] },
    { key: "other", books: [{ relativePath: "Books/other.epub" }] }];
  const ids = catalogAIIds({ intent: "count", ids: [second.relativePath] });
  const filtered = filterAICollections(collections, ids);
  assert.equal(filtered.length, 1);
  assert.deepEqual(filtered[0].books, [second]);
  assert.equal(filtered[0].coverBook, first);
  assert.deepEqual(collections[0].books, [first, second]);
  assert.deepEqual(collections[0].books.filter(book => matchesCatalogAI("books", book, ids)), [second]);
  assert.deepEqual(filterAICollections(collections, new Set()), []);
  assert.equal(filterAICollections(collections, null), collections);
});

test("invalid responses and responses from another section cannot become an applied filter", () => {
  const result = { ok: true, section: "movies", intent: "filter", message: "Matches", ids: ["Movies/a.mp4", "Movies/a.mp4"], count: 1, total: 10 };
  assert.deepEqual(validateAIResult(result, "movies").ids, ["Movies/a.mp4"]);
  assert.throws(() => validateAIResult(result, "series"));
  assert.throws(() => validateAIResult({ ...result, ids: [17] }, "movies"));
  assert.throws(() => validateAIResult({ ...result, count: "1" }, "movies"));
  assert.throws(() => validateAIResult({ ...result, intent: "delete" }, "movies"));
});

test("empty API key retains the saved secret and explicit deletion cannot also send a key", () => {
  const settings = { enabled: true, model: " gpt-4.1-mini ", requestsPerMinute: "10", configured: true };
  assert.deepEqual(aiSettingsPayload(settings, ""), { enabled: true, model: "gpt-4.1-mini", requestsPerMinute: 10 });
  assert.equal(aiSettingsPayload(settings, " sk-synthetic-test ").apiKey, "sk-synthetic-test");
  assert.deepEqual(aiSettingsPayload(settings, "sk-synthetic-test", true), { enabled: true, model: "gpt-4.1-mini", requestsPerMinute: 10, clearApiKey: true });
});

test("AI requests abort on section changes and timeout even when a response body never settles", async () => {
  const controller = new AbortController();
  let outgoingSignal;
  const pending = aiRequestWithTimeout(signal => { outgoingSignal = signal; return new Promise(() => {}); }, controller.signal, 500);
  controller.abort();
  await assert.rejects(pending, error => error.name === "AbortError");
  assert.equal(outgoingSignal.aborted, true);
  let timeoutSignal;
  await assert.rejects(aiRequestWithTimeout(signal => { timeoutSignal = signal; return new Promise(() => {}); }, undefined, 5), error => error.code === "AI_TIMEOUT");
  assert.equal(timeoutSignal.aborted, true);
  let called = false;
  await assert.rejects(aiRequestWithTimeout(() => { called = true; }, controller.signal), error => error.name === "AbortError");
  assert.equal(called, false);
  assert.deepEqual(await aiRequestWithTimeout(async () => ({ ids: [] })), { ids: [] });
});

test("each section has localized examples and photos promise filename search only", () => {
  for (const language of ["es", "ca", "en"]) {
    const s = catalogAIStrings(language);
    assert.equal(Object.keys(s.samples).length, 5);
    assert.ok(Object.values(s.samples).every(examples => examples.length >= 2));
    assert.ok(s.picturesHint);
    assert.notEqual(catalogAIError({ code: "AI_RATE_LIMIT" }, language), s.error);
    assert.equal(catalogAIError({ code: "AI_NOT_CONFIGURED" }, language), s.setup);
    assert.equal(catalogAIError({ code: "AI_AUTH_ERROR" }, language), s.authError);
  }
});

async function loadComponent(name, env = {}) {
  const result = await build({ entryPoints: [new URL(`../src/${name}.jsx`, import.meta.url).pathname],
    bundle: true, write: false, format: "cjs", platform: "node", external: ["react"],
    loader: { ".css": "empty" }, define: { "import.meta.env": JSON.stringify(env) } });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  return module.exports;
}

test("AI search and settings render localized connection requirements in mock mode without accepting credentials", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { hostname: "localhost", origin: "http://localhost:5173" } };
  try {
    const component = await loadComponent("CatalogAI", { VITE_WEB_DEV_MODE: "mock" });
    const html = renderToStaticMarkup(React.createElement(component.default, { section: "pictures", language: "es" }));
    assert.match(html, /por nombre de archivo/);
    assert.match(html, /Conecta con la Raspberry/);
    assert.match(html, /<textarea[^>]*disabled/);
    const Settings = await loadComponent("OpenAISettings", { VITE_WEB_DEV_MODE: "mock" });
    const settings = renderToStaticMarkup(React.createElement(Settings.default, { language: "en" }));
    assert.match(settings, /Connect to your Raspberry/);
    assert.doesNotMatch(settings, /type="password"/);
    const resultHtml = renderToStaticMarkup(React.createElement(component.CatalogAIResult, {
      result: { intent: "count", prompt: "<script>test</script>", message: "Found", count: 2, missingMetadata: 1 }, visible: 1, language: "en", onClear() {},
    }));
    assert.match(resultHtml, /2 matches/);
    assert.match(resultHtml, /1 visible in this view/);
    assert.match(resultHtml, /Clear AI search/);
    assert.doesNotMatch(resultHtml, /<script>/);
  } finally { globalThis.window = previousWindow; }
});
