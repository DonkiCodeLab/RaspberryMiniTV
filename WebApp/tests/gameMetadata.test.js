import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

async function loadApi(env = {}) {
  const result = await build({ entryPoints: [new URL("../src/api/raspberryApi.js", import.meta.url).pathname],
    bundle: true, write: false, format: "esm", platform: "browser", define: { "import.meta.env": JSON.stringify(env) } });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

test("uploads send provider-specific IDs and preserve custom images", async () => {
  const previousWindow = globalThis.window, previousXHR = globalThis.XMLHttpRequest;
  globalThis.window = { location: { origin: "http://raspberry:5050", hostname: "raspberry" }, sessionStorage: { getItem: () => "1234" } };
  const uploads = [];
  globalThis.XMLHttpRequest = class {
    upload = {};
    headers = {};
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    send(form) {
      uploads.push({ form, url: this.url, headers: this.headers });
      this.status = 200; this.responseText = JSON.stringify({ ok: true, item: { metadataStatus: "complete" } });
      this.onload();
    }
  };
  try {
    const api = await loadApi();
    const file = new File(["rom"], "Tetris.gb");
    const coverFile = new File(["cover"], "cover.png");
    const screenshot = new File(["screenshot"], "screenshot.png");
    for (const source of ["igdb", "screenscraper"]) {
      await api.uploadGameFile({ file, game: { source, id: 42, platform: "gb", name: "Tetris", description: "My notes" },
        cover: { file: coverFile, imageFiles: [screenshot] } });
      const { form, url, headers } = uploads.at(-1);
      assert.equal(url, "http://raspberry:5050/games/upload");
      assert.equal(headers["X-Web-Pin"], "1234");
      assert.equal(form.get("metadataSource"), source);
      assert.equal(form.get("metadataId"), "42");
      assert.equal(form.get("screenScraperId"), source === "screenscraper" ? "42" : "0");
      assert.equal(form.get("platform"), "gb");
      assert.equal(form.get("description"), "My notes");
      assert.equal(form.get("coverFile").name, "cover.png");
      assert.equal(form.getAll("imageFiles").length, 1);
    }
  } finally { globalThis.window = previousWindow; globalThis.XMLHttpRequest = previousXHR; }
});

test("detail lookup and retries use the authenticated Raspberry API", async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  globalThis.window = { location: { origin: "http://raspberry:5050", hostname: "raspberry" }, sessionStorage: { getItem: () => "1234" } };
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, text: async () => JSON.stringify({ ok: true, item: { id: 42 } }) };
  };
  try {
    const api = await loadApi();
    await api.getGameMetadata({ source: "igdb", id: 42, extension: "gb", platform: "gb" });
    assert.ok(calls[0].url.startsWith("http://raspberry:5050/games/metadata?"));
    assert.equal(new URL(calls[0].url).searchParams.get("source"), "igdb");
    await api.retryGameMetadata("Games/Tetris.gb", { source: "igdb", id: 42 });
    assert.deepEqual(JSON.parse(calls[1].options.body), { relativePath: "Games/Tetris.gb", source: "igdb", id: 42 });
    assert.ok(calls.every(call => call.options.headers["X-Web-Pin"] === "1234"));
    const preview = new URL(api.gameMetadataImageUrl("https://images.igdb.com/cover.jpg"));
    assert.equal(preview.origin, "http://raspberry:5050");
    assert.equal(preview.pathname, "/games/metadata/image");
    assert.equal(preview.searchParams.get("pin"), "1234");
    assert.equal(api.gameMetadataImageUrl("/game-covers/saved.png"), "http://raspberry:5050/game-covers/saved.png");
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});

test("game downloads target the ROM content endpoint with attachment and authentication", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { origin: "http://raspberry:5050", hostname: "raspberry" }, sessionStorage: { getItem: () => "1234" } };
  try {
    const api = await loadApi();
    const url = new URL(api.getGameDownloadUrl("Game Boy/Tetris & friends.gb"));
    assert.equal(url.pathname, "/games/content");
    assert.equal(url.searchParams.get("relativePath"), "Game Boy/Tetris & friends.gb");
    assert.equal(url.searchParams.get("download"), "1");
    assert.equal(url.searchParams.get("pin"), "1234");
    assert.equal(api.getGameDownloadUrl(""), "");
  } finally { globalThis.window = previousWindow; }
});

test("saving gameplay uses a scoped authenticated request and propagates failures", async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  globalThis.window = { location: { origin: "http://raspberry:5050", hostname: "raspberry" }, sessionStorage: { getItem: () => "1234" } };
  const calls = [];
  const video = { id: "abcdefghijk", name: "Chosen video", channel: "Test channel" };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, text: async () => JSON.stringify({ ok: true, video }) };
  };
  try {
    const api = await loadApi();
    assert.deepEqual((await api.saveGameVideo("Games/Tetris.gb", video)).video, video);
    assert.equal(calls[0].url, "http://raspberry:5050/games/video");
    assert.equal(calls[0].options.headers["X-Web-Pin"], "1234");
    assert.equal(calls[0].options.method, "POST");
    assert.deepEqual(JSON.parse(calls[0].options.body), { relativePath: "Games/Tetris.gb", video });
    await assert.rejects(api.saveGameVideo("Games/Tetris.gb", { id: "invalid" }));
    assert.equal(calls.length, 1);
    globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => JSON.stringify({ error: "Save failed" }) });
    await assert.rejects(api.saveGameVideo("Games/Tetris.gb", video), /Save failed/);
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});

test("mock gameplay selection survives a library reload and preserves other fields", async () => {
  const previousWindow = globalThis.window;
  const game = { relativePath: "Games/Tetris.gb", name: "Tetris", description: "My notes", imageOptions: ["/cover.png"],
    gameMetadata: { videos: [{ video_id: "12345678901", name: "Gameplay" }] } };
  const other = { relativePath: "Games/Mario.gb", name: "Mario" };
  const storage = new Map([["minitv-web-mock-games-library-v1", JSON.stringify([game, other])]]);
  globalThis.window = { location: { hostname: "localhost" }, localStorage: {
    getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value),
  } };
  try {
    const api = await loadApi({ DEV: true });
    const video = { id: "abcdefghijk", name: "Chosen video", channel: "Test channel" };
    await api.saveGameVideo(game.relativePath, video);
    const library = await api.getVideos();
    assert.deepEqual(library.games, [{ ...game, preferredVideo: video }, other]);
    await assert.rejects(api.saveGameVideo("Games/missing.gb", video), /Game not found/);
  } finally { globalThis.window = previousWindow; }
});
