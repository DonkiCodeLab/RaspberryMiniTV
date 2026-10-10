import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { emptyTastes } from "../src/recommendations.js";

async function loadAPI(env = {}) {
  const result = await build({ entryPoints: [new URL("../src/api/raspberryApi.js", import.meta.url).pathname], bundle: true,
    write: false, format: "esm", platform: "browser", define: { "import.meta.env": JSON.stringify(env) } });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

test("recommendation requests carry active profile, section and revision with a 120 second cancellable timeout", async () => {
  const oldWindow = globalThis.window, oldFetch = globalThis.fetch, oldSetTimeout = globalThis.setTimeout;
  const calls = [], timeouts = [];
  globalThis.window = { location: { hostname: "raspberry", origin: "http://raspberry:5050" }, sessionStorage: { getItem: () => "test-pin" } };
  globalThis.setTimeout = (callback, duration, ...args) => { timeouts.push(duration); return oldSetTimeout(callback, duration, ...args); };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.headers["X-Web-Pin"], "test-pin");
    assert.equal(options.cache, "no-store");
    return { ok: true, text: async () => '{"ok":true}' };
  };
  try {
    const api = await loadAPI();
    const context = { userId: "alice", section: "series", revision: 7 };
    await api.getAIRecommendations("alice", "series");
    await api.requestAIRecommendations({ ...context, prompt: "I enjoy comedy", language: "en" });
    await api.saveAIRecommendationTastes({ ...context, preferences: emptyTastes() });
    await api.deleteAIRecommendations(context);
    assert.deepEqual(calls.map(call => call.options.method || "GET"), ["GET", "POST", "PATCH", "DELETE"]);
    assert.equal(new URL(calls[0].url).searchParams.get("userId"), "alice");
    assert.equal(new URL(calls[0].url).searchParams.get("section"), "series");
    assert.deepEqual(JSON.parse(calls[3].options.body), context);
    assert.deepEqual(JSON.parse(calls[2].options.body).preferences, emptyTastes());
    assert.ok(timeouts.filter(duration => duration === 120000).length >= 4);
    assert.ok(calls.every(call => new URL(call.url).pathname === "/ai/recommendations"));
    globalThis.fetch = async () => ({ ok: false, status: 409, text: async () => '{"code":"AI_PROFILE_CHANGED","error":"Changed"}' });
    await assert.rejects(api.requestAIRecommendations({ ...context, prompt: "A recommendation", language: "en" }), error => error.code === "AI_PROFILE_CHANGED" && error.status === 409);
    const controller = new AbortController();
    let outgoingSignal;
    globalThis.fetch = (url, options) => { outgoingSignal = options.signal; return new Promise(() => {}); };
    const pending = api.requestAIRecommendations({ ...context, prompt: "A recommendation", language: "en" }, controller.signal);
    controller.abort();
    await assert.rejects(pending, error => error.name === "AbortError");
    assert.equal(outgoingSignal.aborted, true);
    const mock = await loadAPI({ VITE_WEB_DEV_MODE: "mock" });
    globalThis.fetch = () => { throw new Error("Mock must not contact the provider or server"); };
    await assert.rejects(mock.getAIRecommendations("alice", "movies"), error => error.code === "AI_DEMO");
    await assert.rejects(mock.deleteAIRecommendations(context), error => error.code === "AI_DEMO");
  } finally { globalThis.window = oldWindow; globalThis.fetch = oldFetch; globalThis.setTimeout = oldSetTimeout; }
});
