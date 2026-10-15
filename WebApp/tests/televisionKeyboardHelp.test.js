import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { gameConsoleFrame } from "../src/gameConsoleFrames.js";

const result = await build({
  entryPoints: [new URL("../src/TelevisionKeyboardHelp.jsx", import.meta.url).pathname],
  bundle: true, write: false, format: "cjs", platform: "node", external: ["react"],
});
const module = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const Help = module.exports.default;
const render = (props = {}) => renderToStaticMarkup(React.createElement(Help, {
  frame: gameConsoleFrame("megadrive"), pressedInputs: new Set(), t: key => key, ...props,
}));
const keys = html => [...html.matchAll(/<kbd[^>]*>([^<]+)<\/kbd>/g)].map(match => match[1]);

test("controller annotations label the physical buttons with the actual Sega mapping", () => {
  const html = render({ annotations: true });
  assert.deepEqual(keys(html), ["↑", "←", "↓", "→", "Z", "X", "C", "Enter"]);
  assert.match(html, /<svg/);
  assert.doesNotMatch(html, /NaN|undefined/);
});

test("the compact guide retains all controls when annotations or the controller are hidden", () => {
  const html = render({ compact: true });
  assert.deepEqual(keys(html), ["↑", "←", "↓", "→", "Z", "X", "C", "Enter", "A", "S", "D", "V"]);
  assert.doesNotMatch(html, /<svg|television-help__on-button/);
  assert.match(html, /browser_game_six_buttons/);
});

test("the guide highlights Sega A with Z and Sega X with A independently", () => {
  const html = render({ compact: true, pressedInputs: new Set([1, 10]) });
  assert.deepEqual([...html.matchAll(/<kbd class="is-pressed">([^<]+)<\/kbd>/g)].map(match => match[1]), ["Z", "A"]);
});
