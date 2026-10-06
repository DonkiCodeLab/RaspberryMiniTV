import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";

const require = createRequire(import.meta.url);

async function loadComponent(name) {
  const result = await build({
    entryPoints: [new URL(`../src/${name}.jsx`, import.meta.url).pathname],
    bundle: true, write: false, format: "cjs", platform: "node",
    external: ["react"], loader: { ".css": "empty" },
    define: { "import.meta.env": "{}" },
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports);
  return module.exports.default;
}

test("GB upload metadata picker renders without a global React", async () => {
  const Picker = await loadComponent("GameMetadataPicker");
  const html = renderToStaticMarkup(React.createElement(Picker, {
    initialQuery: "Tetris (World)", platform: "gb", extension: "gb",
    onSelect() {}, onBusy() {}, t: key => key,
  }));
  assert.match(html, /game-metadata-picker/);
  assert.match(html, /value="Tetris"/);
});

test("game metadata details render without a global React", async () => {
  const Details = await loadComponent("GameMetadataDetails");
  const html = renderToStaticMarkup(React.createElement(Details, {
    game: { name: "Tetris", file: "Tetris.gb", platform: "gb",
      metadataStatus: "not_configured", gameMetadata: { developers: ["Nintendo"] } },
    onRefresh() {}, t: key => key,
  }));
  assert.match(html, /Nintendo/);
  assert.match(html, /games_api_not_configured/);
  assert.match(html, /games_metadata_retry/);
});
