import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { aiRequestWithTimeout, aiSettingsPayload, catalogAIIds, catalogItemId, copyAIDebug, filterAICollections, matchesCatalogAI, validateAIResult, readSearchPreferences, saveSearchPreferences } from "../src/catalogAI.js";
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
    assert.equal(catalogAIError({ code: "AI_CATALOG_NOT_UPLOADED" }, language), s.catalogRequired);
    assert.equal(catalogAIError({ code: "AI_CATALOG_QUERY_ERROR" }, language), s.catalogQueryError);
    assert.equal(catalogAIError({ code: "AI_INVALID_PLAN" }, language), s.invalidSelection);
    assert.equal(catalogAIError({ code: "AI_INVALID_IDS" }, language), s.invalidIds);
    assert.equal(catalogAIError({ code: "AI_INCOMPLETE_RESPONSE" }, language), s.incompleteSelection);
    assert.ok(s.debug && s.debugCopy && s.debugRaw);
  }
});

test("debug renders actual model output as escaped text with validation and full provider response", async () => {
  const component = await loadComponent("CatalogAI", {});
  const html = renderToStaticMarkup(React.createElement(component.CatalogAIDebug, { language: "es", report: {
    request: { prompt: "películas con bichos", model: "gpt-4.1-mini", fileIds: ["file-example"] },
    outputText: '<script>alert("test")</script>', stage: "id_validation",
    validation: { reason: "ids_not_in_uploaded_section", invalidIds: [17] },
    provider: { called: true, httpStatus: 200, rawResponse: '{"output":"<img src=x onerror=alert(1)>"}' },
  } }));
  assert.match(html, /Respuesta de la IA/);
  assert.match(html, /Respuesta completa de OpenAI/);
  assert.match(html, /Copiar informe/);
  assert.match(html, /ids_not_in_uploaded_section/);
  assert.match(html, /file-example/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|<img/);
});

test("copy debug works on plain HTTP and restores focus without storing the report", async () => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const previousDocument = globalThis.document;
  let copied, removed = false, focused = false;
  const input = { value: "", style: {}, select() { copied = this.value; }, remove() { removed = true; } };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
  globalThis.document = { activeElement: { focus() { focused = true; } }, createElement: () => input,
    body: { appendChild() {} }, execCommand(command) { assert.equal(command, "copy"); return true; } };
  try {
    const report = { provider: { rawResponse: '{"output":[]}' }, stage: "completed" };
    await copyAIDebug(report);
    assert.deepEqual(JSON.parse(copied), report);
    assert.equal(removed, true);
    assert.equal(focused, true);
  } finally {
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else delete globalThis.navigator;
    globalThis.document = previousDocument;
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
      result: { intent: "count", prompt: "<script>test</script>", message: "Found", count: 2, missingMetadata: 1, catalogStale: true }, visible: 1, language: "en", onClear() {},
    }));
    assert.match(resultHtml, /2 matches/);
    assert.match(resultHtml, /1 visible in this view/);
    assert.match(resultHtml, /Clear AI search/);
    assert.match(resultHtml, /library has changed since the last upload/);
    assert.doesNotMatch(resultHtml, /<script>/);
  } finally { globalThis.window = previousWindow; }
});


test("model selector includes current aliases, preserves custom choices and offers dashboard default", async () => {
  const component = await loadComponent("AIModelSelect", { VITE_WEB_DEV_MODE: "mock" });
  assert.deepEqual(component.modelOptions([{ id: "future-model" }, { id: "chat-latest" }, { id: "chat-latest" }], "saved-custom"),
    ["chat-latest", "future-model", "saved-custom"]);
  for (const language of ["es", "ca", "en"]) {
    const html = renderToStaticMarkup(React.createElement(component.default, { value: "", useDefault: true, language, onChange() {} }));
    assert.match(html, /<select/);
    assert.match(html, /value="" selected/);
    assert.match(html, /chat-latest/);
    assert.match(html, /gpt-6.1-sol/);
    assert.match(html, /gpt-6-luna/);
    assert.match(html, /gpt-6-astra/);
    assert.match(html, /__custom/);
  }
});

test("Codex search defaults and per-provider model preferences survive reopening without storing secrets", () => {
  const previousWindow = globalThis.window;
  let saved = null;
  globalThis.window = { localStorage: { getItem: () => saved, setItem: (key, value) => { saved = value; } } };
  try {
    assert.deepEqual(readSearchPreferences(), { provider: "codex", models: { codex: "", openai: "" } });
    const preferences = { provider: "codex", models: { codex: "selected-codex", openai: "selected-api" } };
    saveSearchPreferences(preferences);
    assert.deepEqual(readSearchPreferences(), preferences);
    saved = '{"provider":"unknown","models":{"codex":"bad model","openai":[]}}';
    assert.deepEqual(readSearchPreferences(), { provider: "codex", models: { codex: "", openai: "" } });
    saved = 'invalid json';
    assert.equal(readSearchPreferences().provider, "codex");
  } finally { globalThis.window = previousWindow; }
});

test("Codex model selection does not substitute API model presets and explains ChatGPT usage", async () => {
  const component = await loadComponent("AIModelSelect", { VITE_WEB_DEV_MODE: "mock" });
  const html = renderToStaticMarkup(React.createElement(component.default, {
    provider: "codex", value: "selected-codex", useDefault: true, language: "es", onChange() {},
  }));
  assert.match(html, /Predeterminado de Codex/);
  assert.match(html, /selected-codex/);
  assert.doesNotMatch(html, /chat-latest|gpt-4.1-mini/);
  for (const language of ["es", "ca", "en"]) {
    assert.equal(catalogAIError({ code: "AI_CODEX_AUTH" }, language), catalogAIStrings(language).codexAuth);
    assert.equal(catalogAIError({ code: "AI_CODEX_FAILED" }, language), catalogAIStrings(language).codexFailed);
  }
});
