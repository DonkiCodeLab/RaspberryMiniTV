import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { browserPlaybackStrings } from "../src/browserPlaybackStrings.js";
import { prepareBrowserPlayback } from "../src/browserPlayback.js";

const result = await build({
  entryPoints: [new URL("../src/PreparedBrowserVideo.jsx", import.meta.url).pathname],
  bundle: true, write: false, format: "cjs", platform: "node", external: ["react"],
  loader: { ".css": "empty" },
});
const module = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const render = props => renderToStaticMarkup(React.createElement(module.exports.PlaybackPreparation, props));

test("compatible videos and saved browser copies never show a conversion dialog", async () => {
  const url = "http://minitv.test/media/stream?relativePath=Movies/test.mp4&pin=fixture";
  assert.equal(renderToStaticMarkup(React.createElement(module.exports.default, { url })), "");
  for (const converted of [false, true]) {
    const states = [{ id: "job", state: "checking" },
      { id: "job", state: "ready", converted, cacheKey: "a".repeat(64) }];
    const displayed = [];
    await prepareBrowserPlayback(url, {
      supportedAudio: { mp4: ["aac"], webm: ["opus"] }, pollMs: 0,
      onStatus: status => displayed.push(render({ status })),
    }, async () => new Response(JSON.stringify(states.shift()), { status: 200 }));
    assert.deepEqual(displayed, ["", ""]);
  }
});

test("confirmed queued conversions show progress and failed checks still offer retry", () => {
  for (const state of ["queued", "converting", "finalizing"]) {
    assert.match(render({ status: { state } }), /<progress/);
  }
  const failed = render({ status: { state: "checking" }, error: "NETWORK" });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Reintentar/);
});

test("interrupted playback never claims that audio is being prepared", () => {
  for (const language of ["es", "ca", "en"]) {
    const s = browserPlaybackStrings(language);
    for (const error of ["PLAYBACK_NETWORK", "PLAYBACK_DECODE", "PLAYBACK_UNSUPPORTED", "PLAYBACK_ABORTED", "PLAYBACK_FAILED"]) {
      const html = render({ language, status: { state: "ready", percent: 100 }, error });
      assert.ok(html.includes(s.playbackFailed));
      assert.ok(html.includes(s.errors[error]));
      assert.ok(!html.includes(s.converting));
      assert.ok(!html.includes(s.failed));
      assert.match(html, /role="alert"/);
      assert.match(html, /aria-busy="false"/);
      assert.doesNotMatch(html, /<progress|library-loading__spinner/);
      assert.ok(html.includes(s.retry));
    }
  }
});

test("actual preparation keeps its progress display and conversion errors", () => {
  const html = render({ status: { state: "converting", percent: 42, elapsedSeconds: 65 } });
  assert.match(html, /Preparando audio compatible/);
  assert.match(html, /<progress[^>]*value="42"/);
  assert.match(html, /1:05/);
  const failed = render({ status: { state: "failed" }, error: "NO_SPACE" });
  assert.match(failed, /No se ha podido preparar el vídeo/);
  assert.match(failed, /No hay suficiente espacio/);
  assert.doesNotMatch(failed, /Se ha interrumpido la reproducción/);
});
