import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

async function loadAPI(env = {}) {
  const result = await build({ entryPoints: [new URL("../src/api/raspberryApi.js", import.meta.url).pathname], bundle: true,
    write: false, format: "esm", platform: "browser", define: { "import.meta.env": JSON.stringify(env) } });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

const rating = { ok: true, imdbId: "tt0096697", rating: 8.7, votes: 452000, rottenTomatoes: 95, metacritic: 77, updatedAt: 1791630000, stale: false };

test("OMDb calls authenticated Raspberry routes with saved-key tests and no persistent browser rating cache", async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.window = { location: { hostname: "raspberry", origin: "http://raspberry:5050" },
    sessionStorage: { getItem: () => "test-pin", setItem() { assert.fail("Must not persist the API key in session storage"); } },
    localStorage: { setItem() { assert.fail("Must not persist the API key in local storage"); } } };
  globalThis.fetch = async (url, options) => {
    calls.push({ url: new URL(url), options });
    assert.equal(new URL(url).origin, "http://raspberry:5050");
    assert.equal(options.headers["X-Web-Pin"], "test-pin");
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, text: async () => JSON.stringify(new URL(url).pathname === "/omdb/ratings"
      ? rating : { ok: true, settings: { configured: true, apiKey: "synthetic-key" } }) };
  };
  try {
    const api = await loadAPI();
    assert.deepEqual(await api.getOmdbSettings(), { ok: true, settings: { configured: true, apiKey: "synthetic-key" } });
    assert.equal((await api.saveOmdbSettings({ apiKey: "  synthetic-key  ", unrelated: "ignore" })).settings.apiKey, "synthetic-key");
    await api.saveOmdbSettings({ apiKey: "" });
    await api.saveOmdbSettings({ clearApiKey: true, apiKey: "synthetic-key" });
    await api.testOmdbSettings();
    assert.deepEqual(calls.slice(0, 5).map(({ url }) => url.pathname),
      ["/settings/omdb", "/settings/omdb", "/settings/omdb", "/settings/omdb", "/settings/omdb/test"]);
    assert.deepEqual(JSON.parse(calls[1].options.body), { apiKey: "synthetic-key" });
    assert.deepEqual(JSON.parse(calls[2].options.body), {});
    assert.deepEqual(JSON.parse(calls[3].options.body), { clearApiKey: true });
    assert.equal(calls[4].options.method, "POST");
    assert.equal(calls[4].options.body, undefined, "Test uses only the key already saved on the Raspberry");

    assert.deepEqual(await api.getOmdbRating({ kind: "movie", tmdbId: 17 }), rating);
    await api.getOmdbRating({ kind: "tv", tmdbId: "456" });
    await api.getOmdbRating({ imdbId: " tt0096697 ", kind: "tv", tmdbId: 456 });
    await api.getOmdbRating({ imdbId: "tt0096697" });
    assert.deepEqual(calls.slice(5).map(({ url }) => [url.pathname, url.search]), [
      ["/omdb/ratings", "?kind=movie&tmdbId=17"], ["/omdb/ratings", "?kind=tv&tmdbId=456"],
      ["/omdb/ratings", "?imdbId=tt0096697"], ["/omdb/ratings", "?imdbId=tt0096697"],
    ]);
    assert.equal(calls.slice(4).some(call => `${call.url}${call.options.body || ""}`.includes("synthetic-key")), false);
    const count = calls.length;
    for (const args of [{ imdbId: "../../other" }, { kind: "person", tmdbId: 17 }, { kind: "tv", tmdbId: true },
      { kind: "movie", tmdbId: 1.5 }, { kind: "tv", tmdbId: 0 }, {}]) {
      await assert.rejects(api.getOmdbRating(args), error => ["OMDB_INVALID_ID", "OMDB_ID_MISSING"].includes(error.code));
    }
    assert.equal(calls.length, count, "Invalid identities must never leave the browser");

    globalThis.fetch = async () => ({ ok: false, status: 429, text: async () => '{"ok":false,"code":"OMDB_LIMIT","error":"Limit reached"}' });
    await assert.rejects(api.getOmdbRating({ imdbId: "tt0096697" }), error => error.code === "OMDB_LIMIT" && error.status === 429);
    globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ ...rating, stale: true, code: "OMDB_LIMIT" }) });
    assert.equal((await api.getOmdbRating({ imdbId: "tt0096697" })).rating, 8.7, "A stale rating remains displayable after a provider failure");
    globalThis.fetch = async () => ({ ok: true, text: async () => '<html>Unavailable</html>' });
    await assert.rejects(api.getOmdbRating({ imdbId: "tt0096697" }), error => error.code === "OMDB_INVALID_RESPONSE");
    await assert.rejects(api.getOmdbSettings(), error => error.code === "OMDB_INVALID_RESPONSE");
    await assert.rejects(api.testOmdbSettings(), error => error.code === "OMDB_INVALID_RESPONSE");
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    await assert.rejects(api.getOmdbRating({ imdbId: "tt0096697" }), error => error.code === "OMDB_CONNECTION_ERROR");

    globalThis.fetch = () => { assert.fail("Mock mode must not make a network request"); };
    const mock = await loadAPI({ VITE_WEB_DEV_MODE: "mock" });
    for (const action of [() => mock.getOmdbSettings(), () => mock.saveOmdbSettings({ apiKey: "synthetic-key" }),
      () => mock.testOmdbSettings(), () => mock.getOmdbRating({ imdbId: "tt0096697" })]) {
      await assert.rejects(action(), error => error.code === "OMDB_DEMO");
    }
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});
