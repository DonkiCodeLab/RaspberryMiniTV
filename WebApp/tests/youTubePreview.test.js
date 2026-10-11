import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";

const compiled = await build({ entryPoints: [new URL("../src/YouTubePreview.jsx", import.meta.url).pathname],
  bundle: true, write: false, format: "cjs", platform: "node", external: ["react"] });

function harness(ready = true) {
  const effects = [], visibility = [], calls = [];
  const timers = new Map();
  let nextTimer = 0;
  const container = { appendChild() {}, replaceChildren() { calls.push("clear"); } };
  const iframe = { setAttribute() {} };
  let options;
  const player = { getIframe: () => iframe, unMute: () => calls.push("unmute"),
    setVolume: value => calls.push(["volume", value]), playVideo: () => calls.push("play"),
    destroy: () => calls.push("destroy") };
  const YT = { PlayerState: { PLAYING: 1 }, Player: function (_, config) { options = config; return player; } };
  const window = { location: { origin: "http://localhost" }, YT: ready ? YT : undefined,
    setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: id => timers.delete(id) };
  const document = { createElement: () => ({ remove() {} }), head: { appendChild() {} } };
  const react = { createElement: () => null, useRef: () => ({ current: container }),
    useState: () => [false, value => visibility.push(value)], useEffect: effect => effects.push(effect) };
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports, require: () => react, window, document });
  module.exports.default({ videoId: "abcdefghijk", title: "Trailer" });
  return { start: effects[0], calls, visibility, player, get options() { return options; },
    window, YT, api: module.exports.loadYouTubeApi,
    flushTimers() { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } } };
}

test("hover previews request sound, hide controls and show only active playback", async () => {
  const h = harness();
  const stop = h.start();
  await Promise.resolve();
  assert.equal(h.options.playerVars.controls, 0);
  assert.equal(h.options.playerVars.disablekb, 1);
  assert.equal(h.options.playerVars.fs, 0);
  h.options.events.onReady({ target: h.player });
  assert.deepEqual(h.calls, ["unmute", ["volume", 100], "play"]);
  h.options.events.onStateChange({ data: 1 });
  assert.equal(h.visibility.at(-1), false);
  h.flushTimers();
  assert.equal(h.visibility.at(-1), true);
  for (const data of [0, 2, 3, 5, -1]) {
    h.options.events.onStateChange({ data });
    assert.equal(h.visibility.at(-1), false);
  }
  h.options.events.onAutoplayBlocked();
  assert.equal(h.visibility.at(-1), false);
  stop();
  assert.deepEqual(h.calls.slice(-2), ["destroy", "clear"]);
  const count = h.visibility.length;
  h.options.events.onStateChange({ data: 1 });
  assert.equal(h.visibility.length, count);
});

test("pausing or leaving during startup cancels the pending preview reveal", async () => {
  for (const end of ["pause", "blocked", "error", "leave"]) {
    const h = harness();
    const stop = h.start();
    await Promise.resolve();
    assert.equal(h.options.playerVars.autoplay, 0);
    h.options.events.onStateChange({ data: 1 });
    if (end === "pause") h.options.events.onStateChange({ data: 2 });
    if (end === "blocked") h.options.events.onAutoplayBlocked();
    if (end === "error") h.options.events.onError();
    if (end === "leave") stop();
    h.flushTimers();
    assert.equal(h.visibility.at(-1), false);
    if (end !== "leave") stop();
  }
});

test("leaving the poster before YouTube loads prevents late audio playback", async () => {
  const h = harness(false);
  const stop = h.start();
  assert.equal(h.api(), h.api());
  stop();
  h.window.YT = h.YT;
  h.window.onYouTubeIframeAPIReady();
  await Promise.resolve();
  assert.equal(h.options, undefined);
  assert.deepEqual(h.calls, ["clear"]);
});
