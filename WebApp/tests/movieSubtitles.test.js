import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

async function client(env) {
  const result = await build({ entryPoints: [new URL("../src/api/raspberryApi.js", import.meta.url).pathname], bundle: true, write: false,
    format: "esm", platform: "browser", define: { "import.meta.env": JSON.stringify(env) } });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

test("subtitle download targets the Raspberry file with its PIN and preserves provider error codes", async () => {
  const previous = { window: globalThis.window, fetch: globalThis.fetch };
  globalThis.window = { location: { origin: "http://localhost:5173" }, sessionStorage: { getItem: () => "test-pin" } };
  try {
    const api = await client({ VITE_RASPBERRY_API_BASE_URL: "http://raspberry:5050" });
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "http://raspberry:5050/movies/subtitles/obtain");
      assert.equal(options.headers["X-Web-Pin"], "test-pin");
      assert.deepEqual(JSON.parse(options.body), { relativePath: "Movies/Alien.mkv", language: "ca" });
      return new Response(JSON.stringify({ error: "Quota", code: "SUBTITLE_LIMIT_REACHED" }), { status: 429 });
    };
    await assert.rejects(api.obtainMovieSubtitles({ relativePath: "Movies/Alien.mkv", language: "ca" }), error => error.code === "SUBTITLE_LIMIT_REACHED" && error.status === 429);
  } finally { Object.assign(globalThis, previous); }
});

test("demo subtitle actions do not make requests or report a saved file", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { assert.fail("Demo must not contact a provider"); };
  try {
    const api = await client({ VITE_WEB_DEV_MODE: "mock" });
    assert.equal((await api.getSubtitleSettings()).demo, true);
    await assert.rejects(api.obtainMovieSubtitles({ relativePath: "Movies/Alien.mkv" }), error => error.code === "SUBTITLE_DEMO");
    await assert.rejects(api.saveSubtitleSettings({ username: "test" }));
  } finally { globalThis.fetch = previous; }
});
