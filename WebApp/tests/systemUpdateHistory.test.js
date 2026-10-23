import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { formatSystemUpdateDate } from "../src/systemUpdateHistory.js";

const require = createRequire(import.meta.url);
const result = await build({
  entryPoints: [new URL("../src/SystemUpdateHistory.jsx", import.meta.url).pathname],
  bundle: true, write: false, format: "cjs", platform: "node",
  external: ["react"], loader: { ".css": "empty" },
});
const module = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports);
const History = module.exports.default;
const completedAt = new Date(2026, 9, 22, 9, 5, 6).toISOString();
const success = {
  runId: "success", state: "succeeded", completedAt,
  previousCommit: "1111111122222222", commit: "abcdef1234567890",
  commits: [{ hash: "abcdef1234567890", subject: "Mejora las fotos <script>alert(1)</script>", body: "Carga más rápida.\n\nConserva los álbumes." }],
};
const render = props => renderToStaticMarkup(React.createElement(History, { language: "es", ...props }));

test("formats local day, month, year and 24-hour time with seconds and leading zeroes", () => {
  assert.equal(formatSystemUpdateDate(completedAt), "22/10/2026 09:05:06");
  assert.equal(formatSystemUpdateDate(new Date(2026, 0, 2, 0, 0, 9).toISOString()), "02/01/2026 00:00:09");
  for (const value of [null, undefined, "", "bad-date", 0]) assert.equal(formatSystemUpdateDate(value), "");
});

test("shows an honest empty history without inventing a last update", () => {
  const html = render({});
  assert.match(html, /Todavía no hay actualizaciones completadas/);
  assert.match(html, /Las próximas actualizaciones/);
  assert.doesNotMatch(html, /<time|Invalid Date/);
});

test("renders the last success and commit summaries in a keyboard-accessible history", () => {
  const html = render({ history: [success] });
  assert.match(html, /Última actualización completada: <time[^>]+>22\/10\/2026 09:05:06/);
  assert.match(html, /class="system-update-history__scroll" role="region" aria-labelledby="system-update-history-title" tabindex="0"/);
  assert.match(html, /Completada/);
  assert.match(html, /abcdef12/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /<details><summary>Ver descripción del commit/);
  assert.match(html, /Carga más rápida\.\n\nConserva los álbumes\./);
});

test("a failed attempt stays in the history without replacing the last completed update", () => {
  const failed = { ...success, runId: "failed", state: "failed", completedAt: new Date(2026, 9, 23, 14, 6, 7).toISOString() };
  const html = render({ history: [failed, success] });
  assert.match(html, /Última actualización completada: <time[^>]+>22\/10\/2026 09:05:06/);
  assert.ok(html.indexOf("23/10/2026 14:06:07") < html.lastIndexOf("22/10/2026 09:05:06"));
  assert.match(html, /Fallida/);
  assert.match(html, /Git cambió, pero la actualización no llegó a completarse/);
});

test("distinguishes an up-to-date rebuild, failure, and unavailable commit information", () => {
  assert.match(render({ history: [{ ...success, previousCommit: success.commit, commits: [] }] }), /Git ya estaba al día/);
  assert.match(render({ history: [{ ...success, commits: [] }] }), /Se cambió de versión de Git/);
  const failed = render({ history: [{ ...success, state: "failed", commits: [] }] });
  assert.match(failed, /La actualización no se completó/);
  assert.doesNotMatch(failed, /Se recompiló la web/);
  assert.match(render({ history: [{ ...success, commits: null }] }), /No se pudo recuperar el resumen/);
});

test("keeps every entry available and supports the existing UI languages", () => {
  const history = Array.from({ length: 45 }, (_, index) => ({ ...success, runId: `run-${index}` }));
  assert.equal((render({ history }).match(/class="system-update-history__entry"/g) || []).length, 45);
  assert.match(render({ language: "ca", history: [success] }), /Última actualització completada/);
  assert.match(render({ language: "en", history: [success] }), /Last completed update/);
});
