import test from "node:test";
import assert from "node:assert/strict";
import { browserVideoError, prepareBrowserPlayback, supportedBrowserAudio, playbackTime } from "../src/browserPlayback.js";
import { browserPlaybackStrings } from "../src/browserPlaybackStrings.js";

const url = "http://minitv.test/media/stream?relativePath=TVShows%2FAlien%2FS01E01.mp4&pin=fixture";
const supportedAudio = { mp4: ["aac"], webm: ["opus"] };
const key = "a".repeat(64);
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

test("a video that already played reports the actual media error and its interruption position", () => {
  for (const [code, expected] of [[1, "PLAYBACK_ABORTED"], [2, "PLAYBACK_NETWORK"], [3, "PLAYBACK_DECODE"], [4, "PLAYBACK_UNSUPPORTED"], [99, "PLAYBACK_FAILED"]]) {
    const video = { error: { code }, currentTime: 367.25 };
    assert.deepEqual(browserVideoError({ target: video, currentTarget: video }), { code: expected, seconds: 367.25 });
    for (const language of ["es", "ca", "en"]) assert.ok(browserPlaybackStrings(language).errors[expected]);
  }
});

test("subtitle errors and events without a media error do not terminate video playback", () => {
  const video = { error: null, currentTime: 90 };
  assert.equal(browserVideoError({ target: video, currentTarget: video }), null);
  const track = { tagName: "TRACK" };
  assert.equal(browserVideoError({ target: track, currentTarget: video }), null);
  video.error = { code: 3 };
  assert.equal(browserVideoError({ target: track, currentTarget: video }), null);
  video.currentTime = NaN;
  assert.deepEqual(browserVideoError({ target: video, currentTarget: video }), { code: "PLAYBACK_DECODE", seconds: null });
});

test("checks the browser's codec support separately for each container", () => {
  assert.deepEqual(supportedBrowserAudio({ canPlayType: type => type === 'audio/mp4; codecs="mp4a.40.2"' || type === 'audio/webm; codecs="opus"' ? "probably" : "" }), supportedAudio);
});

test("prepares, polls real progress, and preserves source authentication in compatible playback", async () => {
  const states = [{ id: "job", state: "checking" }, { id: "job", state: "converting", percent: 42 }, { id: "job", state: "finalizing", percent: 99 }, { id: "job", state: "ready", converted: true, cacheKey: key }];
  const seen = [], requests = [];
  const result = await prepareBrowserPlayback(url, { supportedAudio, onStatus: value => seen.push(value), pollMs: 0 }, async (target, options) => {
    requests.push({ target, options });
    return response(states[requests.length - 1]);
  });
  assert.equal(new URL(result).searchParams.get("browserCopy"), key);
  assert.equal(new URL(result).searchParams.get("pin"), "fixture");
  assert.deepEqual(seen, states);
  assert.equal(requests[0].options.method, "POST");
  assert.equal(JSON.parse(requests[0].options.body).relativePath, "TVShows/Alien/S01E01.mp4");
  for (const { target, options } of requests) {
    assert.equal(target.origin, "http://minitv.test");
    assert.equal(target.searchParams.has("pin"), false);
    assert.equal(options.headers["X-Web-Pin"], "fixture");
    assert.equal(options.cache, "no-store");
  }
});

test("compatible videos and previews retain their original URL", async () => {
  assert.equal(await prepareBrowserPlayback(url, { supportedAudio }, async () => response({ id: "job", state: "ready", converted: false })), url);
  assert.equal(await prepareBrowserPlayback("https://example.org/preview.mp4", {}, () => assert.fail("must bypass preparation")), "https://example.org/preview.mp4");
});

test("recovers job status after a server restart and reuses the prepared copy", async () => {
  const replies = [response({ id: "old", state: "converting" }), response({ errorCode: "JOB_NOT_FOUND" }, 404), response({ id: "new", state: "ready", converted: true, cacheKey: key })];
  const methods = [];
  await prepareBrowserPlayback(url, { supportedAudio, pollMs: 0 }, async (_, options) => { methods.push(options.method); return replies.shift(); });
  assert.deepEqual(methods, ["POST", "GET", "POST"]);
});

test("closing stops polling; errors never fall through to silent original playback", async () => {
  const controller = new AbortController();
  let count = 0;
  await assert.rejects(prepareBrowserPlayback(url, { supportedAudio, signal: controller.signal, onStatus: () => controller.abort() }, async () => {
    count++; return response({ id: "job", state: "converting", percent: 30 });
  }), { name: "AbortError" });
  assert.equal(count, 1);
  await assert.rejects(prepareBrowserPlayback(url, { supportedAudio }, async () => response({ id: "job", state: "failed", errorCode: "NO_SPACE" })), /NO_SPACE/);
  await assert.rejects(prepareBrowserPlayback(url, { supportedAudio }, async () => response({}, 404)), /BACKEND_MISSING/);
  await assert.rejects(prepareBrowserPlayback(url, { supportedAudio }, async () => response({}, 401)), /UNAUTHORIZED/);
});

test("retry is explicit and all preparation errors are translated", async () => {
  await prepareBrowserPlayback(url, { supportedAudio, retry: true }, async (_, options) => {
    assert.equal(JSON.parse(options.body).retry, true);
    return response({ id: "job", state: "ready", converted: false });
  });
  assert.equal(playbackTime(125), "2:05");
  for (const language of ["ca", "en"]) {
    assert.deepEqual(Object.keys(browserPlaybackStrings(language)), Object.keys(browserPlaybackStrings("es")));
    assert.deepEqual(Object.keys(browserPlaybackStrings(language).errors), Object.keys(browserPlaybackStrings("es").errors));
  }
});
