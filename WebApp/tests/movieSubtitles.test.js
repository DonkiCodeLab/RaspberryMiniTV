import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LANGUAGES } from "../src/i18n/languages.js";

async function client(env) {
  const result = await build({ entryPoints: [new URL("../src/api/raspberryApi.js", import.meta.url).pathname], bundle: true, write: false,
    format: "esm", platform: "browser", define: { "import.meta.env": JSON.stringify(env) } });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

test("subtitle selector offers every MiniTV language and starts with the interface language", async () => {
  const result = await build({ entryPoints: [new URL("../src/MovieSubtitleDownload.jsx", import.meta.url).pathname],
    bundle: true, write: false, format: "cjs", platform: "node", external: ["react"],
    loader: { ".css": "empty" }, define: { "import.meta.env": "{}" } });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  for (const { id } of LANGUAGES) {
    const html = renderToStaticMarkup(React.createElement(module.exports.default, { relativePath: "Movies/Alien.mkv", language: id }));
    const values = [...html.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(values, LANGUAGES.map(item => item.id));
    assert.match(html, new RegExp(`<option value="${id}"[^>]*selected=""`));
    assert.match(html, /<option value="ar"[^>]*dir="rtl"/);
  }
});

test("search and AI translation requests preserve all 21 target language identities", async () => {
  const previous = { window: globalThis.window, fetch: globalThis.fetch };
  globalThis.window = { location: { origin: "http://localhost:5173" }, sessionStorage: { getItem: () => "test-pin" } };
  try {
    const api = await client({ VITE_RASPBERRY_API_BASE_URL: "http://raspberry:5050" });
    for (const { id } of LANGUAGES) {
      const calls = [];
      globalThis.fetch = async (url, options) => {
        const body = JSON.parse(options.body);
        assert.equal(body.language, id);
        assert.equal(options.headers["X-Web-Pin"], "test-pin");
        calls.push(new URL(url).pathname);
        return calls.length === 1
          ? new Response(JSON.stringify({ code: "SUBTITLE_NOT_FOUND" }), { status: 404 })
          : new Response(JSON.stringify({ id: "translation", state: "queued", language: id }));
      };
      await assert.rejects(api.obtainMovieSubtitles({ relativePath: "Movies/Alien.mkv", language: id }), error => error.code === "SUBTITLE_NOT_FOUND");
      const job = await api.startSubtitleTranslation({ relativePath: "Movies/Alien.mkv", sourceId: "embedded:2", language: id });
      assert.equal(job.language, id);
      assert.deepEqual(calls, ["/movies/subtitles/obtain", "/movies/subtitles/translate"]);
    }
  } finally { Object.assign(globalThis, previous); }
});

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
