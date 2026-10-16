import { test } from "node:test";
import assert from "node:assert/strict";
import { lockBodyScroll } from "../src/bodyScrollLock.js";

for (const overflow of ["", "auto", "scroll", "hidden"]) {
  test(`closing a modal restores the original overflow (${JSON.stringify(overflow)})`, () => {
    const body = { style: { overflow } };
    const close = lockBodyScroll(body);
    assert.equal(body.style.overflow, "hidden");
    close();
    assert.equal(body.style.overflow, overflow);
  });
}

for (const order of [[0, 1, 2], [2, 1, 0], [1, 0, 2]]) {
  test(`overlapping dialogs keep scrolling locked until all close in order ${order}`, () => {
    const body = { style: { overflow: "" } };
    const close = Array.from({ length: 3 }, () => lockBodyScroll(body));
    for (const index of order.slice(0, -1)) {
      close[index]();
      assert.equal(body.style.overflow, "hidden");
    }
    close[order.at(-1)]();
    assert.equal(body.style.overflow, "");
  });
}

test("episode details can rerender during playback without leaving the library locked", () => {
  const body = { style: { overflow: "" } };
  let closeDetails = lockBodyScroll(body);
  const closePlayer = lockBodyScroll(body);

  // The episode effect restarts when the parent supplies a new onClose callback.
  for (let render = 0; render < 5; render += 1) {
    closeDetails();
    assert.equal(body.style.overflow, "hidden");
    closeDetails = lockBodyScroll(body);
  }

  closePlayer();
  assert.equal(body.style.overflow, "hidden");
  closeDetails();
  assert.equal(body.style.overflow, "");
});

test("repeated cleanup cannot release another modal's lock", () => {
  const body = { style: { overflow: "auto" } };
  const closeFirst = lockBodyScroll(body);
  const closeSecond = lockBodyScroll(body);
  closeFirst();
  closeFirst();
  assert.equal(body.style.overflow, "hidden");
  closeSecond();
  assert.equal(body.style.overflow, "auto");

  body.style.overflow = "scroll";
  const closeNext = lockBodyScroll(body);
  closeFirst();
  closeSecond();
  assert.equal(body.style.overflow, "hidden");
  closeNext();
  assert.equal(body.style.overflow, "scroll");
});

test("effect setup and cleanup can repeat across successive playback sessions", () => {
  const body = { style: { overflow: "" } };
  for (let session = 0; session < 3; session += 1) {
    const cleanup = lockBodyScroll(body);
    cleanup();
    const close = lockBodyScroll(body);
    assert.equal(body.style.overflow, "hidden");
    close();
    assert.equal(body.style.overflow, "");
  }
});
