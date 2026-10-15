import { test } from "node:test";
import assert from "node:assert/strict";
import { observeTelevisionImage } from "../src/televisionArtwork.js";

function artwork({ complete = false, naturalWidth = 0, decoding = true } = {}) {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  const listeners = new Map();
  const image = {
    complete, naturalWidth,
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: type => listeners.delete(type),
    ...(decoding ? { decode: () => promise } : {}),
  };
  return { image, resolve, reject, listeners, emit: type => listeners.get(type)?.() };
}

test("a downloaded shell stays hidden until decoding has finished", async () => {
  const image = artwork(), states = [];
  observeTelevisionImage(image.image, status => states.push(status));
  image.image.complete = true;
  image.image.naturalWidth = 3840;
  image.emit("load");
  assert.deepEqual(states, []);
  image.resolve();
  await Promise.resolve();
  assert.deepEqual(states, ["ready"]);
  assert.equal(image.listeners.size, 0);
});

test("late completions from rapid shell selections cannot reveal the current screen", async () => {
  const old = artwork(), current = artwork(), states = [];
  const cancel = observeTelevisionImage(old.image, status => states.push(["old", status]));
  cancel();
  observeTelevisionImage(current.image, status => states.push(["current", status]));
  old.resolve();
  await Promise.resolve();
  assert.deepEqual(states, []);
  current.resolve();
  await Promise.resolve();
  assert.deepEqual(states, [["current", "ready"]]);
});

test("failed downloads or decodes report an error without revealing the screen", async () => {
  for (const errorEvent of [false, true]) {
    const image = artwork(), states = [];
    observeTelevisionImage(image.image, status => states.push(status));
    if (errorEvent) image.emit("error");
    image.reject(new Error("Cannot decode image"));
    await Promise.resolve();
    assert.deepEqual(states, ["error"]);
  }
});

test("leaving a failed or pending shell removes listeners and ignores its result", async () => {
  const image = artwork(), states = [];
  const cancel = observeTelevisionImage(image.image, status => states.push(status));
  cancel();
  image.reject(new Error("Superseded"));
  await Promise.resolve();
  assert.deepEqual(states, []);
  assert.equal(image.listeners.size, 0);
});

test("browsers without decode handle cached, loading and broken images", () => {
  for (const [naturalWidth, expected] of [[3840, "ready"], [0, "error"]]) {
    const cached = artwork({ decoding: false, complete: true, naturalWidth }), states = [];
    observeTelevisionImage(cached.image, status => states.push(status));
    assert.deepEqual(states, [expected]);
  }
  const pending = artwork({ decoding: false }), states = [];
  observeTelevisionImage(pending.image, status => states.push(status));
  assert.deepEqual(states, []);
  pending.image.naturalWidth = 3840;
  pending.emit("load");
  assert.deepEqual(states, ["ready"]);
});
