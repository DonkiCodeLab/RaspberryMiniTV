import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { formatSystemUpdateDate, systemUpdateCommitUrl } from "../src/systemUpdateHistory.js";

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
  repositoryUrl: "https://github.com/example/minitv",
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
  assert.match(html, /aria-expanded="false" aria-controls="[^"]+"/);
  assert.match(html, /<div id="[^"]+" hidden=""/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.doesNotMatch(html, /<a\b|<dialog\b/);
  assert.match(html, /Carga más rápida\.\n\nConserva los álbumes\./);
});

test("expanding a version includes every commit and its full description", () => {
  const html = render({ history: [{ ...success, commits: [...success.commits,
    { hash: "fedcba9876543210", subject: "Corrige los subtítulos", body: "Respeta el idioma elegido." }] }] });
  assert.equal((html.match(/aria-expanded="false"/g) || []).length, 1);
  assert.equal((html.match(/aria-haspopup="dialog"/g) || []).length, 2);
  assert.match(html, /Corrige los subtítulos/);
  assert.match(html, /Respeta el idioma elegido/);
});

test("legacy history can use the current repository but explicit unknown origins stay unlinked", () => {
  const { repositoryUrl, ...legacy } = success;
  assert.match(render({ history: [legacy], repositoryUrl }), /aria-haspopup="dialog"/);
  for (const origin of [null, "https://other.example/org/repo", "javascript:alert(1)"]) {
    const html = render({ history: [{ ...success, repositoryUrl: origin }], repositoryUrl });
    assert.doesNotMatch(html, /aria-haspopup="dialog"/);
    assert.match(html, /No se conoce el repositorio/);
  }
});

test("commit links use the full hash and only accept canonical GitHub repository URLs", () => {
  const hash = "abcdef1234567890abcdef1234567890abcdef12";
  assert.equal(systemUpdateCommitUrl(success.repositoryUrl, hash), `${success.repositoryUrl}/commit/${hash}`);
  for (const repository of [null, "https://github.com.evil.example/a/b", "https://github.com/a/..", "https://token@github.com/a/b", "https://github.com/a/b?token=secret"]) {
    assert.equal(systemUpdateCommitUrl(repository, hash), null);
  }
  for (const invalidHash of [null, "", "abcdef1/../../settings", "not-a-commit"]) {
    assert.equal(systemUpdateCommitUrl(success.repositoryUrl, invalidHash), null);
  }
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
