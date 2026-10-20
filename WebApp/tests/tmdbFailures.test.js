import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const result = await build({
  entryPoints: [new URL("../src/TmdbFailureList.jsx", import.meta.url).pathname],
  bundle: true, write: false, format: "cjs", platform: "node", external: ["react"],
});
const module = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports);
const { default: TmdbFailureList, tmdbFailureKey } = module.exports;
const image = {
  media: "tv/2", kind: "tv", title: "Serie <Especial>", resource: "image", path: "/broken.jpg",
  error: "TMDB respondió con HTTP 404.",
  contexts: [{ type: "still", extra: true, season: 0, episode: 3, episodeName: "El especial" }],
  stages: [{ phase: "images" }, { phase: "thumbnails", width: 780 }],
};
const metadata = {
  media: "movie/3", kind: "movie", title: "Mi película", resource: "metadata", path: "/movie/3",
  error: "Sin conexión", contexts: [{ type: "metadata" }], stages: [{ phase: "metadata" }],
};

test("failure rows show titles, episode context, image role and variants with one image action", () => {
  const html = renderToStaticMarkup(React.createElement(TmdbFailureList, {
    errors: [image, metadata], language: "es", onDiscard() {},
  }));
  for (const text of ["Serie &lt;Especial&gt;", "Mi película", "Temporada 0", "Episodio 3", "El especial",
    "Imagen del episodio", "(extra)", "Original", "Miniatura 780 px", "HTTP 404", "Ficha / datos TMDB"]) {
    assert.ok(html.includes(text), text);
  }
  assert.equal((html.match(/<button/g) || []).length, 1);
  assert.match(html, /role="region" aria-label="Descargas con errores" tabindex="0"/);
  assert.match(html, /Descartar imagen<\/button>/);
  assert.doesNotMatch(html, /<img/);
});

test("in-flight discards disable actions and all three languages label image types", () => {
  for (const [language, button, type] of [["es", "Descartando…", "Carátula / cartel"],
    ["ca", "Descartant…", "Caràtula / cartell"], ["en", "Discarding…", "Cover / poster"]]) {
    const item = { ...image, contexts: [{ type: "poster" }] };
    const html = renderToStaticMarkup(React.createElement(TmdbFailureList, {
      errors: [item], language, busy: tmdbFailureKey(item), onDiscard() {},
    }));
    assert.ok(html.includes(button));
    assert.ok(html.includes(type));
    assert.match(html, /disabled=""/);
  }
  assert.equal(renderToStaticMarkup(React.createElement(TmdbFailureList, { errors: [], language: "es" })), "");
});

test("discard request uses the PIN and invalidates cached metadata only after success", async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  globalThis.window = { location: { origin: "http://raspberry:5050", hostname: "raspberry" }, sessionStorage: { getItem: () => "1234" } };
  const calls = [];
  let rejected = false;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: !rejected, status: rejected ? 500 : 200, text: async () => JSON.stringify(
      rejected ? { error: "disk full" } : { ignoredImages: 1, errors: [] }) };
  };
  try {
    const result = await build({ entryPoints: [new URL("../src/api/raspberryApi.js", import.meta.url).pathname],
      bundle: true, write: false, format: "esm", platform: "browser", define: { "import.meta.env": "{}" } });
    const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
    await api.getCachedTmdbJson("/movie/1");
    await api.getCachedTmdbJson("/movie/1");
    assert.equal(calls.length, 1);
    const status = await api.discardTmdbCacheImage("movie/1", "/broken.jpg");
    assert.equal(status.ignoredImages, 1);
    assert.equal(calls[1].url, "http://raspberry:5050/tmdb/cache/discard-image");
    assert.equal(calls[1].options.method, "POST");
    assert.equal(calls[1].options.headers["X-Web-Pin"], "1234");
    assert.deepEqual(JSON.parse(calls[1].options.body), { media: "movie/1", path: "/broken.jpg" });
    await api.getCachedTmdbJson("/movie/1");
    assert.equal(calls.length, 3);
    rejected = true;
    await assert.rejects(api.discardTmdbCacheImage("movie/1", "/other.jpg"), /disk full/);
    await api.getCachedTmdbJson("/movie/1");
    assert.equal(calls.length, 4);
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});
