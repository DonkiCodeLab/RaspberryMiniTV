import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

async function loadAPI(env = {}) {
  const result = await build({ entryPoints: [new URL("../src/api/raspberryApi.js", import.meta.url).pathname], bundle: true,
    write: false, format: "esm", platform: "browser", define: { "import.meta.env": JSON.stringify(env) } });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

const snapshot = { ok: true, configured: true, total: 4, ready: 1, missingIds: [],
  job: { state: "running", total: 4, processed: 1, ready: 1, unavailable: 0, failed: 0,
    currentTitle: "A movie", code: null, startedAt: 1791630000, finishedAt: null } };

test("bulk update polls status without starting jobs and sends only explicit start/pause actions", async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.window = { location: { hostname: "raspberry", origin: "http://raspberry:5050" }, sessionStorage: { getItem: () => "test-pin" } };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    assert.equal(url, "http://raspberry:5050/omdb/library");
    assert.equal(options.headers["X-Web-Pin"], "test-pin");
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, text: async () => JSON.stringify(snapshot) };
  };
  try {
    const api = await loadAPI();
    assert.deepEqual(await api.getOmdbLibrary(), snapshot);
    await api.getOmdbLibrary();
    await api.updateOmdbLibrary("start");
    await api.updateOmdbLibrary("pause");
    assert.equal(calls.length, 4, "Status must be refreshed each time without a browser cache");
    assert.deepEqual(calls.map(call => call.options.method || "GET"), ["GET", "GET", "POST", "POST"]);
    assert.equal(calls[0].options.body, undefined);
    assert.equal(calls[1].options.body, undefined);
    assert.deepEqual(JSON.parse(calls[2].options.body), { action: "start" });
    assert.deepEqual(JSON.parse(calls[3].options.body), { action: "pause" });
    await assert.rejects(api.updateOmdbLibrary("restart"), error => error.code === "OMDB_INVALID_ACTION");
    assert.equal(calls.length, 4);

    globalThis.fetch = async () => ({ ok: false, status: 404, text: async () => '<html>Not found</html>' });
    await assert.rejects(api.getOmdbLibrary(), error => error.code === "OMDB_LIBRARY_UNAVAILABLE" && error.status === 404);
    globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => '{"error":"Unauthorized","code":"OMDB_AUTH_ERROR"}' });
    await assert.rejects(api.updateOmdbLibrary("start"), error => error.code === "OMDB_AUTH_ERROR" && error.status === 401);
    globalThis.fetch = async () => ({ ok: true, text: async () => '{}' });
    await assert.rejects(api.getOmdbLibrary(), error => error.code === "OMDB_INVALID_RESPONSE");
    await assert.rejects(api.updateOmdbLibrary("pause"), error => error.code === "OMDB_INVALID_RESPONSE");

    const controller = new AbortController();
    let requestSignal;
    globalThis.fetch = (_url, options) => { requestSignal = options.signal; return new Promise(() => {}); };
    const pending = api.getOmdbLibrary(controller.signal);
    controller.abort();
    await assert.rejects(pending, error => error.name === "AbortError");
    assert.equal(requestSignal.aborted, true);

    globalThis.fetch = () => { assert.fail("Mock mode must not make a network request"); };
    const mock = await loadAPI({ VITE_WEB_DEV_MODE: "mock" });
    await assert.rejects(mock.getOmdbLibrary(), error => error.code === "OMDB_DEMO");
    await assert.rejects(mock.updateOmdbLibrary("start"), error => error.code === "OMDB_DEMO");
    await assert.rejects(mock.updateOmdbLibrary("pause"), error => error.code === "OMDB_DEMO");
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});
