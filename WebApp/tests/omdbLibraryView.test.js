import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const result = await build({ entryPoints: [new URL("../src/OmdbLibraryUpdate.jsx", import.meta.url).pathname],
  bundle: true, write: false, format: "cjs", platform: "node", external: ["react"],
  loader: { ".css": "empty" }, define: { "import.meta.env": "{}" } });
const module = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const render = props => renderToStaticMarkup(React.createElement(module.exports.OmdbLibraryUpdateContent, props));
const idle = { state: "idle", total: 0, processed: 0, ready: 0, unavailable: 0, failed: 0, currentTitle: "", code: null, startedAt: null, finishedAt: null };
const snapshot = (job = {}, other = {}) => ({ ok: true, configured: true, total: 10, ready: 2, missingIds: [], job: { ...idle, ...job }, ...other });

test("bulk update requires a saved key and pending titles; status remains accessible", () => {
  for (const data of [snapshot({}, { configured: false }), snapshot({}, { total: 0, ready: 0 }), snapshot({}, { ready: 10 })]) {
    const html = render({ snapshot: data });
    assert.match(html, /disabled="">Actualizar fichas<\/button>/);
    assert.match(html, /<button[^>]*(?<!disabled="")>Actualizar estado<\/button>/);
    assert.doesNotMatch(html, /<progress|Actualización terminada/);
  }
  const available = render({ snapshot: snapshot() });
  assert.match(available, /type="button">Actualizar fichas<\/button>/);
  assert.match(available, /2 de 10 fichas al día/);
  assert.match(render({ snapshot: snapshot(), disabled: true }), /disabled="">Actualizar fichas<\/button>/);
});

test("running updates show real progress and remain pausable while credentials are edited", () => {
  const html = render({ snapshot: snapshot({ state: "running", total: 10, processed: 3, ready: 2, unavailable: 1, currentTitle: "Un título" }), disabled: true });
  assert.match(html, /Actualizando/);
  assert.match(html, /3 de 10 fichas revisadas/);
  assert.match(html, /<progress value="3" max="10"/);
  assert.match(html, /Revisando: Un título/);
  assert.match(html, /type="button">Pausar<\/button>/);
  assert.match(html, /aunque cierres/);
  assert.doesNotMatch(html, /Actualización terminada/);
  const pausing = render({ snapshot: snapshot({ state: "pausing", total: 10 }) });
  assert.match(pausing, /disabled="">Pausar<\/button>/);
});

test("quota pauses retain progress, explain the problem and offer resume", () => {
  const html = render({ snapshot: snapshot({ state: "paused", total: 10, processed: 3, ready: 3, code: "OMDB_LIMIT" }) });
  assert.match(html, /En pausa/);
  assert.match(html, /3 de 10 fichas revisadas/);
  assert.match(html, /límite de consultas/);
  assert.match(html, /type="button">Continuar actualización<\/button>/);
  assert.doesNotMatch(html, /Actualización terminada|10 fichas revisadas;/);
  const removedAll = render({ snapshot: snapshot({ state: "paused", total: 10 }, { total: 0, ready: 0 }) });
  assert.match(removedAll, /type="button">Continuar actualización<\/button>/);
});

test("finished jobs distinguish available, absent and failed ratings and escape title text", () => {
  const html = render({ snapshot: snapshot({ state: "completed", total: 10, processed: 10, ready: 7, unavailable: 2, failed: 1 },
    { ready: 9, missingIds: [{ kind: "tv", title: "<script>title</script>", path: "series/show" }] }) });
  assert.match(html, /10 fichas revisadas; 7 con puntuaciones disponibles/);
  assert.match(html, /2 fichas sin puntuaciones disponibles en OMDb/);
  assert.match(html, /1 ficha no se ha podido consultar/);
  assert.match(html, /1 ficha sin identificador/);
  assert.match(html, /&lt;script&gt;title&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>|10 con puntuaciones disponibles/);
  assert.match(html, /type="button">Reintentar<\/button>/);
  const unidentified = render({ snapshot: snapshot({}, { total: 0, ready: 0, missingIds: [{ kind: "movie", title: "A movie", path: "movies/one" }] }) });
  assert.match(unidentified, /necesitan un identificador/);
  assert.doesNotMatch(unidentified, /Todavía no hay películas/);
});

test("status actions are named in every language and old servers give an actionable error", () => {
  for (const [language, label] of [["es-ES", "Actualizar estado"], ["ca-ES", "Actualitzar l’estat"], ["en-US", "Refresh status"]]) {
    const html = render({ snapshot: snapshot(), language });
    assert.ok(html.includes(label), language);
    assert.doesNotMatch(html, /<button[^>]*><\/button>/);
  }
  const html = render({ error: { code: "OMDB_LIBRARY_UNAVAILABLE" }, language: "es" });
  assert.match(html, /role="alert"/);
  assert.match(html, /Actualiza la aplicación de la Raspberry/);
  assert.doesNotMatch(html, /Cargando estado/);
  const offline = render({ snapshot: snapshot({ state: "running", total: 10 }), error: { code: "OMDB_TIMEOUT" } });
  assert.match(offline, /La actualización puede seguir en marcha/);
});
