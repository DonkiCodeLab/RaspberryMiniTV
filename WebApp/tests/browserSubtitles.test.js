import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { preferredSubtitle, styleSubtitleCues, subtitleUrl } from "../src/browserSubtitles.js";
const result = await build({ entryPoints: [new URL("../src/BrowserSubtitles.jsx", import.meta.url).pathname], bundle: true,
  write: false, format: "cjs", platform: "node", external: ["react"], loader: { ".css": "empty" } });
const module = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const tracks = [{ id: "external:film.es.srt", kind: "external", language: "es", available: true },
  { id: "embedded:2", kind: "embedded", language: "eng", available: true }];
const render = (items, props = {}) => renderToStaticMarkup(React.createElement(module.exports.SubtitleSelectors,
  { tracks: items, primary: items[0]?.id || "", auxiliary: "", language: "es", ...props }));
test("zero tracks renders nothing; one has only the main selector; two enable the auxiliary", () => {
  assert.equal(render([]), "");
  assert.equal((render(tracks.slice(0, 1)).match(/<select/g) || []).length, 1);
  const html = render(tracks);
  assert.equal((html.match(/<select/g) || []).length, 2);
  assert.match(html, /auxiliar · arriba/);
  assert.match(html, /value="" selected="">Desactivado/);
});
test("unsupported image tracks are labeled, disabled and cannot enable the auxiliary", () => {
  const html = render([tracks[0], { id: 'embedded:3', kind: 'embedded', available: false }]);
  assert.equal((html.match(/<select/g) || []).length, 1);
  assert.match(html, /disabled=""[^>]*>.*No compatible/);
});
test("the same track cannot be selected in both positions", () => {
  assert.match(render(tracks), /value="external:film.es.srt" disabled=""/);
});
test("default matches the UI language and ignores unavailable tracks", () => {
  assert.equal(preferredSubtitle(tracks, 'en'), 'embedded:2');
  assert.equal(preferredSubtitle([{ ...tracks[1], available: false }, tracks[0]], 'en'), tracks[0].id);
});
test("subtitle URLs retain authentication and refer to original rather than converted video", () => {
  const url = subtitleUrl('http://minitv/media/stream?relativePath=Movies%2Ffilm.mkv&pin=secret&browserCopy=cached&download=1', 'embedded:2');
  assert.equal(url.searchParams.get('pin'), 'secret');
  assert.equal(url.searchParams.get('relativePath'), 'Movies/film.mkv');
  assert.equal(url.searchParams.get('subtitles'), 'embedded:2');
  assert.equal(url.searchParams.has('browserCopy'), false);
  assert.equal(url.searchParams.has('download'), false);
});
test("dual cues keep timestamps and position auxiliary at top with a separate color class", () => {
  const make = () => ({ cues: [{ text: '<i>Hello</i>', startTime: 4, endTime: 6 }] });
  const top = make(), bottom = make();
  styleSubtitleCues(top, true); styleSubtitleCues(bottom, false);
  assert.equal(top.mode, 'showing'); assert.equal(bottom.mode, 'showing');
  assert.equal(top.cues[0].line, 5); assert.equal(top.cues[0].snapToLines, false);
  assert.equal(bottom.cues[0].line, -2); assert.equal(bottom.cues[0].snapToLines, true);
  assert.match(top.cues[0].text, /<c.auxiliary>/);
  assert.equal(top.cues[0].startTime, 4); assert.equal(bottom.cues[0].endTime, 6);
});
