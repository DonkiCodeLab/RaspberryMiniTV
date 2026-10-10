import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { gameVideos } from "../src/gameVideos.js";

const require = createRequire(import.meta.url);

test("dashboard system update renders without a global React", async () => {
  const SystemUpdate = await loadComponent("SystemUpdate");
  const html = renderToStaticMarkup(React.createElement(SystemUpdate, { language: "es" }));
  assert.match(html, /Actualizar Raspberry y web/);
  assert.match(html, /Actualizar desde Git/);
});

async function loadComponent(name) {
  const result = await build({
    entryPoints: [new URL(`../src/${name}.jsx`, import.meta.url).pathname],
    bundle: true, write: false, format: "cjs", platform: "node",
    external: ["react"], loader: { ".css": "empty", ".png": "dataurl" },
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

test("gameplay is preferred over trailers and unsafe video IDs are excluded", async () => {
  const Video = await loadComponent("GameVideo");
  const html = renderToStaticMarkup(React.createElement(Video, {
    metadata: { name: 'Tetris', videos: [
      { name: 'Trailer', video_id: 'abcdefghijk' },
      { name: 'Gameplay', video_id: '12345678901' },
      { name: 'Gameplay', video_id: '../malicious' },
    ] }, platform: 'gb', t: key => key,
  }));
  assert.match(html, /youtube-nocookie.com\/embed\/12345678901/);
  assert.doesNotMatch(html, /malicious/);
  assert.match(html, /Tetris\+Game\+Boy\+gameplay/);
  assert.doesNotMatch(html, /autoplay=1/);
  assert.equal((html.match(/<iframe/g) || []).length, 1);
  assert.doesNotMatch(html, /class="youtube-gameplay-search"/);
});

test("a profile without video shows an explicit fallback without an empty player", async () => {
  const Video = await loadComponent("GameVideo");
  const html = renderToStaticMarkup(React.createElement(Video, {
    metadata: { name: 'Tetris' }, platform: 'gb', t: key => key,
  }));
  assert.match(html, /games_video_missing/);
  assert.match(html, /youtube.com\/results/);
  assert.doesNotMatch(html, /<iframe/);
});

test("saved video is the default after remount, ahead of gameplay and without duplicates", async () => {
  const Video = await loadComponent("GameVideo");
  const metadata = { name: "Tetris", videos: [
    { name: "Gameplay", video_id: "12345678901" },
    { name: "Trailer", video_id: "abcdefghijk" },
  ] };
  const preferredVideo = { id: "abcdefghijk", name: "My choice", channel: "My channel" };
  assert.equal(gameVideos(metadata, preferredVideo).length, 2);
  assert.equal(gameVideos(metadata, { id: "../unsafe" })[0].id, "12345678901");
  const html = renderToStaticMarkup(React.createElement(Video, {
    metadata, preferredVideo, platform: "gb", t: key => key, onSaveVideo() {},
  }));
  assert.match(html, /youtube-nocookie.com\/embed\/abcdefghijk/);
  assert.match(html, /My choice/);
  assert.match(html, /My channel/);
  assert.match(html, /disabled="">games_video_saved/);
  const withoutProvider = renderToStaticMarkup(React.createElement(Video, {
    metadata: { name: "Tetris" }, preferredVideo, platform: "gb", t: key => key,
  }));
  assert.match(withoutProvider, /youtube-nocookie.com\/embed\/abcdefghijk/);
  assert.doesNotMatch(withoutProvider, /games_video_missing|games_video_save/);
});

test("game details keep the saved cover and respect images removed from the gallery", async () => {
  const Details = await loadComponent("GameDetails");
  const html = renderToStaticMarkup(React.createElement(Details, {
    game: { name: "Tetris", file: "Tetris.gb", relativePath: "Games/Tetris.gb", platform: "gb",
      coverImage: "/cover.png", imageOptions: ["/cover.png", "/kept.png", "/kept.png"],
      screenshots: ["/removed.png"], metadataStatus: "complete",
      gameMetadata: { description: "A saved synopsis", genres: ["Puzzle"] } },
    browserSupported: true, onRefresh() {}, t: (key, values = {}) => `${key}${values.number || ""}`,
  }));
  assert.match(html, /src="\/cover.png" alt="Tetris"/);
  assert.match(html, /src="\/kept.png"/);
  assert.doesNotMatch(html, /\/removed.png/);
  assert.match(html, /A saved synopsis/);
  assert.match(html, /Puzzle/);
  assert.doesNotMatch(html, /games_metadata_retry/);
});

test("partial dates and zero ratings do not produce invented dates or missing scales", async () => {
  const Details = await loadComponent("GameMetadataDetails");
  const html = renderToStaticMarkup(React.createElement(Details, {
    game: { file: "Tetris.gb", metadataStatus: "complete",
      gameMetadata: { releaseDate: "1989", rating: 0, developers: "Nintendo" } },
    onRefresh() {}, t: key => key,
  }));
  assert.match(html, /<dd>1989<\/dd>/);
  assert.match(html, /<dd>0<\/dd>/);
  assert.match(html, /Nintendo/);
  assert.doesNotMatch(html, /undefined|NaN|Invalid Date/);
});

test("YouTube settings are separate from game metadata providers", async () => {
  const Settings = await loadComponent("GameProviderSettings");
  const games = renderToStaticMarkup(React.createElement(Settings, { language: "en" }));
  const youtube = renderToStaticMarkup(React.createElement(Settings, { language: "en", youtube: true }));
  assert.match(games, /IGDB/);
  assert.doesNotMatch(games, /YouTube/);
  assert.match(youtube, /YouTube Data API v3/);
  assert.doesNotMatch(youtube, /IGDB|ScreenScraper/);
});

test("credential test is hidden until credentials exist", async () => {
  const Test = await loadComponent("ServiceCredentialTest");
  assert.equal(renderToStaticMarkup(React.createElement(Test, { language: "en", credentials: {}, configured: false })), "");
  assert.match(renderToStaticMarkup(React.createElement(Test, { language: "en", credentials: { apiKey: "key" }, configured: true })), /Test credentials/);
});
