import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

async function loadAPI(env = {}) {
  const result = await build({ entryPoints: [new URL("../src/api/raspberryApi.js", import.meta.url).pathname], bundle: true,
    write: false, format: "esm", platform: "browser", define: { "import.meta.env": JSON.stringify(env) } });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

test("AI uses authenticated Raspberry endpoints, keeps keys off storage and tests saved credentials without a request body", async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.window = { location: { hostname: "raspberry", origin: "http://raspberry:5050" }, sessionStorage: { getItem: () => "test-pin" },
    localStorage: { setItem() { throw new Error("AI must not persist secrets in browser storage"); } } };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    assert.equal(new URL(url).origin, "http://raspberry:5050");
    assert.equal(options.headers["X-Web-Pin"], "test-pin");
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, text: async () => '{"ok":true,"settings":{"enabled":true,"configured":true,"apiKey":"sk-synthetic-test","model":"gpt-4.1-mini","requestsPerMinute":10}}' };
  };
  try {
    const api = await loadAPI();
    assert.equal((await api.getAISettings()).settings.apiKey, "sk-synthetic-test");
    assert.equal((await api.saveAISettings({ enabled: true, apiKey: "sk-synthetic-test", model: "gpt-4.1-mini", requestsPerMinute: 10 })).settings.apiKey, "sk-synthetic-test");
    await api.testAISettings();
    await api.searchCatalogAI({ section: "books", prompt: "Books by an author", language: "en", model: "chat-latest" });
    assert.deepEqual(calls.map(({ url }) => new URL(url).pathname), ["/settings/ai", "/settings/ai", "/settings/ai/test", "/ai/search"]);
    assert.equal(calls[2].options.body, undefined);
    assert.equal(calls[3].options.body.includes("sk-synthetic-test"), false);
    assert.deepEqual(JSON.parse(calls[3].options.body), { provider: "openai", section: "books", prompt: "Books by an author", language: "en", model: "chat-latest" });
    await api.getAICatalog();
    await api.uploadAICatalog();
    assert.equal(new URL(calls[4].url).pathname, "/settings/ai/catalog");
    assert.equal(new URL(calls[5].url).pathname, "/settings/ai/catalog");
    assert.equal(calls[5].options.method, "POST");
    assert.equal(calls[5].options.body, undefined);
    await api.getAIModels();
    assert.equal(new URL(calls[6].url).pathname, "/settings/ai/models");
    assert.equal(calls[6].options.body, undefined);
    globalThis.fetch = async () => ({ ok: false, status: 429, text: async () => '{"ok":false,"code":"AI_RATE_LIMIT","error":"Rate limit"}' });
    await assert.rejects(api.searchCatalogAI({ section: "movies", prompt: "Movies", language: "es" }), error => error.code === "AI_RATE_LIMIT" && error.status === 429);
    const debug = { stage: "id_validation", provider: { rawResponse: '{"output":[]}' }, validation: { invalidIds: [17] } };
    globalThis.fetch = async () => ({ ok: false, status: 502, text: async () => JSON.stringify({ ok: false, code: "AI_INVALID_IDS", error: "Invalid IDs", debug }) });
    await assert.rejects(api.searchCatalogAI({ section: "movies", prompt: "Bichos", language: "es" }), error => {
      assert.deepEqual(error.debug, debug);
      return error.code === "AI_INVALID_IDS";
    });
    const mock = await loadAPI({ VITE_WEB_DEV_MODE: "mock" });
    globalThis.fetch = () => { throw new Error("mock must not call a server"); };
    await assert.rejects(mock.saveAISettings({ apiKey: "sk-synthetic-test" }), error => error.code === "AI_DEMO");
    await assert.rejects(mock.searchCatalogAI({ section: "movies", prompt: "Movies", language: "es" }), error => error.code === "AI_DEMO");
    await assert.rejects(mock.uploadAICatalog(), error => error.code === "AI_DEMO");
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});

test("catalogue searches use the OpenAI API even with an old Codex preference", async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.window = { location: { hostname: "raspberry", origin: "http://raspberry:5050" },
    sessionStorage: { getItem: () => "test-pin" } };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.headers["X-Web-Pin"], "test-pin");
    return { ok: true, text: async () => '{"ok":true,"models":[]}' };
  };
  try {
    const api = await loadAPI();
    await api.getAIModels();
    assert.equal(new URL(calls[0].url).search, "");
    await api.searchCatalogAI({ provider: "codex", model: "api-model", section: "movies", prompt: "Apollo" });
    assert.equal(new URL(calls[1].url).pathname, "/ai/search");
    const body = JSON.parse(calls[1].options.body);
    assert.equal(body.provider, "openai");
    assert.equal(body.model, "api-model");
    assert.equal(body.requestId, undefined);
    assert.equal(calls.length, 2);
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});
