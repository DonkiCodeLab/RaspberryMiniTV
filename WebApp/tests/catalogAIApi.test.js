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
    return { ok: true, text: async () => '{"ok":true,"settings":{"enabled":true,"configured":true,"model":"gpt-4.1-mini","requestsPerMinute":10}}' };
  };
  try {
    const api = await loadAPI();
    await api.getAISettings();
    await api.saveAISettings({ enabled: true, apiKey: "sk-synthetic-test", model: "gpt-4.1-mini", requestsPerMinute: 10 });
    await api.testAISettings();
    await api.searchCatalogAI({ section: "books", prompt: "Books by an author", language: "en" });
    assert.deepEqual(calls.map(({ url }) => new URL(url).pathname), ["/settings/ai", "/settings/ai", "/settings/ai/test", "/ai/search"]);
    assert.equal(calls[2].options.body, undefined);
    assert.equal(calls[3].options.body.includes("sk-synthetic-test"), false);
    assert.deepEqual(JSON.parse(calls[3].options.body), { section: "books", prompt: "Books by an author", language: "en" });
    globalThis.fetch = async () => ({ ok: false, status: 429, text: async () => '{"ok":false,"code":"AI_RATE_LIMIT","error":"Rate limit"}' });
    await assert.rejects(api.searchCatalogAI({ section: "movies", prompt: "Movies", language: "es" }), error => error.code === "AI_RATE_LIMIT" && error.status === 429);
    const mock = await loadAPI({ VITE_WEB_DEV_MODE: "mock" });
    globalThis.fetch = () => { throw new Error("mock must not call a server"); };
    await assert.rejects(mock.saveAISettings({ apiKey: "sk-synthetic-test" }), error => error.code === "AI_DEMO");
    await assert.rejects(mock.searchCatalogAI({ section: "movies", prompt: "Movies", language: "es" }), error => error.code === "AI_DEMO");
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});
