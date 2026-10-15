import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { gameConsoleFrame } from "../src/gameConsoleFrames.js";

const result = await build({
  entryPoints: [new URL("../src/HandheldKeyboardHelp.jsx", import.meta.url).pathname],
  bundle: true, write: false, format: "cjs", platform: "node", external: ["react"],
});
const module = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const Help = module.exports.default;
const renderHelp = (systemId, annotated, pressedInputs = new Set()) => renderToStaticMarkup(React.createElement(Help, {
  systemId, annotated, frame: gameConsoleFrame(systemId), pressedInputs, t: key => key,
}));

test("each handheld shows its actual keyboard mappings in both help modes", () => {
  for (const system of ["gb", "gbc", "gba"]) {
    for (const annotated of [true, false]) {
      const html = renderHelp(system, annotated);
      const keycaps = [...html.matchAll(/<kbd[^>]*>([^<]+)<\/kbd>/g)].map(match => match[1]);
      assert.deepEqual(keycaps, ["↑", "←", "↓", "→", "Z", "X", "Enter", "V", ...(system === "gba" ? ["Q", "E"] : [])]);
      assert.equal(html.includes("<svg"), annotated);
      assert.equal(html.includes("gameboy_quick_guide"), !annotated);
      assert.equal((html.match(/<circle /g) || []).length, annotated ? (system === "gba" ? 7 : 5) : 0);
      assert.doesNotMatch(html, /NaN|undefined/);
    }
  }
});

test("help uses the same pressed input state as the console for simultaneous keys", () => {
  for (const annotated of [true, false]) {
    const html = renderHelp("gba", annotated, new Set([7, 8, 10]));
    assert.deepEqual([...html.matchAll(/<kbd class="is-pressed">([^<]+)<\/kbd>/g)].map(match => match[1]), ["→", "Z", "Q"]);
    assert.doesNotMatch(renderHelp("gba", annotated), /is-pressed/);
  }
});
