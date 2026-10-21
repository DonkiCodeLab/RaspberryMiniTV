import { test } from "node:test";
import assert from "node:assert/strict";
import { createBrowserBack } from "../src/browserBack.js";

function fixture() {
  const entries = [{ external: true }, { unrelatedState: "preserved" }];
  const listeners = new Set();
  const traversals = [];
  let index = 1;
  const browser = {
    history: {
      get state() { return entries[index]; },
      pushState(state) {
        entries.splice(index + 1, Infinity, state);
        index += 1;
      },
      back() { traversals.push(-1); },
      forward() { traversals.push(1); },
    },
    addEventListener(type, listener) { assert.equal(type, "popstate"); listeners.add(listener); },
    removeEventListener(type, listener) { listeners.delete(listener); },
  };
  async function settle() {
    for (let attempts = 0; attempts < 20; attempts++) {
      await Promise.resolve();
      if (!traversals.length) return;
      const target = index + traversals.shift();
      if (target < 0 || target >= entries.length) continue;
      index = target;
      if (!entries[index].external) for (const listener of listeners) listener({ state: entries[index] });
    }
    assert.fail("History traversal did not settle");
  }
  const navigation = createBrowserBack(browser);
  return { browser, navigation, settle, entries, get index() { return index; } };
}

test("browser Back follows episode → season → series → library, then leaves normally", async () => {
  const f = fixture();
  let page = "series", episodeOpen = true;
  const closeEpisode = () => { episodeOpen = false; f.navigation.remove("episode"); };
  const goToLibrary = () => { page = "library"; f.navigation.remove("page"); };
  const goToSeries = () => { page = "series"; f.navigation.set("page", goToLibrary); };
  page = "season";
  f.navigation.set("page", goToSeries);
  f.navigation.set("episode", closeEpisode, 10);
  await f.settle();
  assert.equal(f.index, 2);
  f.browser.history.back(); await f.settle();
  assert.equal(episodeOpen, false);
  assert.equal(page, "season");
  f.browser.history.back(); await f.settle();
  assert.equal(page, "series");
  f.browser.history.back(); await f.settle();
  assert.equal(page, "library");
  assert.equal(f.index, 1);
  f.browser.history.back(); await f.settle();
  assert.equal(f.index, 0);
});

test("sibling movies and rerenders use the latest Back action without growing history", async () => {
  const f = fixture();
  let result = "";
  for (const movie of ["first", "second", "third"]) {
    f.navigation.set("movie", () => { result = movie; f.navigation.remove("movie"); });
    await f.settle();
  }
  assert.equal(f.entries.length, 3);
  assert.equal(f.browser.history.state.unrelatedState, "preserved");
  f.browser.history.back(); await f.settle();
  assert.equal(result, "third");
  assert.equal(f.index, 1);
});

test("dashboard returns to its origin before the origin's parent", async () => {
  const f = fixture();
  let page = "dashboard";
  const backFromSeason = () => { page = "series"; f.navigation.remove("page"); };
  f.navigation.set("page", () => { page = "season"; f.navigation.set("page", backFromSeason); });
  await f.settle();
  f.browser.history.back(); await f.settle();
  assert.equal(page, "season");
  f.browser.history.back(); await f.settle();
  assert.equal(page, "series");
});

test("the UI Back button consumes the guard without invoking Back again", async () => {
  const f = fixture();
  let calls = 0;
  f.navigation.set("page", () => { calls++; });
  await f.settle();
  f.navigation.remove("page");
  await f.settle();
  assert.equal(calls, 0);
  assert.equal(f.index, 1);
  f.browser.history.back(); await f.settle();
  assert.equal(f.index, 0);
});

test("an overlay closes before the page and its removal preserves the page's handler", async () => {
  const f = fixture();
  const calls = [];
  f.navigation.set("page", () => { calls.push("page"); f.navigation.remove("page"); });
  f.navigation.set("episode", () => { calls.push("episode"); f.navigation.remove("episode"); }, 10);
  f.navigation.set("player", () => { calls.push("player"); f.navigation.remove("player"); }, 30);
  await f.settle();
  for (let count = 0; count < 3; count++) { f.browser.history.back(); await f.settle(); }
  assert.deepEqual(calls, ["player", "episode", "page"]);
  assert.equal(f.index, 1);
});

test("StrictMode setup/cleanup/setup does not add duplicate guards", async () => {
  const f = fixture();
  const back = () => {};
  f.navigation.set("page", back);
  f.navigation.remove("page");
  f.navigation.set("page", back);
  await f.settle();
  assert.equal(f.entries.length, 3);
  f.navigation.remove("page");
  f.navigation.set("page", back);
  await f.settle();
  assert.equal(f.entries.length, 3);
  assert.equal(f.index, 2);
});

test("the most recently opened dialog wins ties, even after rerendering its parent", async () => {
  const f = fixture();
  const calls = [];
  const closeParent = () => { calls.push("parent"); f.navigation.remove("parent"); };
  f.navigation.set("child", null, 40);
  f.navigation.set("parent", closeParent, 40);
  await f.settle();
  f.navigation.set("child", () => { calls.push("child"); f.navigation.remove("child"); }, 40);
  f.navigation.set("parent", closeParent, 40);
  await f.settle();
  f.browser.history.back(); await f.settle();
  f.browser.history.back(); await f.settle();
  assert.deepEqual(calls, ["child", "parent"]);
});

test("a busy dialog or cancelled close keeps browser Back inside the same screen", async () => {
  const f = fixture();
  let busy = true;
  f.navigation.set("dialog", () => { if (!busy) f.navigation.remove("dialog"); }, 40);
  await f.settle();
  f.browser.history.back(); await f.settle();
  assert.equal(f.index, 2);
  busy = false;
  f.browser.history.back(); await f.settle();
  assert.equal(f.index, 1);
});

test("a new screen opened during guard cleanup is not accidentally closed", async () => {
  const f = fixture();
  let calls = 0;
  f.navigation.set("page", () => {});
  await f.settle();
  f.navigation.remove("page");
  await Promise.resolve(); // history.back is asynchronous, like the browser.
  f.navigation.set("page", () => { calls++; f.navigation.remove("page"); });
  await f.settle();
  assert.equal(calls, 0);
  assert.equal(f.index, 2);
  f.browser.history.back(); await f.settle();
  assert.equal(calls, 1);
});

test("a reload at the library root removes the old guard", async () => {
  const f = fixture();
  f.navigation.set("page", () => {});
  await f.settle();
  f.navigation.dispose();
  const reloaded = createBrowserBack(f.browser);
  await f.settle();
  assert.equal(f.index, 1);
  f.browser.history.back(); await f.settle();
  assert.equal(f.index, 0);
  reloaded.dispose();
});

test("Forward to an obsolete guard neither invokes Back nor traps the user", async () => {
  const f = fixture();
  let calls = 0;
  f.navigation.set("page", () => { calls++; f.navigation.remove("page"); });
  await f.settle();
  f.browser.history.back(); await f.settle();
  f.browser.history.forward(); await f.settle();
  assert.equal(calls, 1);
  assert.equal(f.index, 1);
  f.browser.history.back(); await f.settle();
  assert.equal(f.index, 0);
});
