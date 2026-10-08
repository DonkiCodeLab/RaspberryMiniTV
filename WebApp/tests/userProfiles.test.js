import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { DEFAULT_USER, EMPTY_STATE, mergeProfileState, marksPatch, completionMarks, progressLabel } from "../src/profileState.js";
import { episodeWatched, markEpisode, markSeason } from "../src/mediaMarks.js";

test("fresh profiles are empty; fields and season exceptions merge independently", () => {
  assert.equal(DEFAULT_USER.id, "default");
  assert.deepEqual(EMPTY_STATE, { marks: {}, progress: {} });
  const state = mergeProfileState(EMPTY_STATE, { marks: { movie: { favorite: true }, season: { watched: false, episodes: { 1: true } } } });
  const next = mergeProfileState(state, { marks: { movie: { watched: true }, season: { episodes: { 2: true } } } });
  assert.deepEqual(next.marks.movie, { favorite: true, watched: true });
  assert.ok(episodeWatched(next.marks, "season", 1));
  assert.ok(episodeWatched(next.marks, "season", 2));
  assert.ok(!episodeWatched(next.marks, "season", 3));
  assert.deepEqual(marksPatch(next.marks, markEpisode(next.marks, "season", 3, true)), { season: { episodes: { 3: true } } });
  const reset = marksPatch(next.marks, markSeason(next.marks, "season", false));
  assert.deepEqual(mergeProfileState(next, { marks: reset }).marks.season.episodes, {});
});

test("completion marks the right movie/book or episode without making it a favorite", () => {
  assert.deepEqual(completionMarks({ markKey: "movie" }, { completed: false }), {});
  assert.deepEqual(completionMarks({ markKey: "movie" }, { completed: true }), { movie: { watched: true } });
  assert.deepEqual(completionMarks({ markKey: "season", episodeNumber: 4 }, { completed: true }), { season: { episodes: { 4: true } } });
  assert.equal(progressLabel({ kind: "video", seconds: 3662.8 }), "1:01:02");
  assert.equal(progressLabel({ kind: "book", page: 3, section: 2 }), "Página 3 · sección 2");
});

test("mock CRUD persists separate profiles; deleting one keeps default and never resurrects it", async () => {
  const result = await build({ entryPoints: [new URL("../src/api/raspberryApi.js", import.meta.url).pathname], bundle: true,
    write: false, format: "esm", platform: "browser", define: { "import.meta.env": JSON.stringify({ VITE_WEB_DEV_MODE: "mock" }) } });
  const previous = globalThis.window;
  const storage = new Map();
  globalThis.window = { localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) } };
  try {
    const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
    const { user } = await api.createUser({ name: "Lisa", avatar: "avatar-04" });
    await api.patchUserState(user.id, { marks: { movie: { favorite: true } }, progress: { movie: { kind: "video", seconds: 28, opened: true } } });
    assert.deepEqual(await api.getUserState("default"), EMPTY_STATE);
    assert.equal((await api.getUserState(user.id)).progress.movie.seconds, 28);
    await api.editUser(user.id, { name: "Bart", avatar: "avatar-03" });
    assert.equal((await api.getUsers()).users[1].name, "Bart");
    assert.equal((await api.getUserState(user.id)).marks.movie.favorite, true);
    await api.deleteUser(user.id);
    await assert.rejects(api.patchUserState(user.id, { marks: {} }), error => error.status === 404);
    await assert.rejects(api.deleteUser("default"));
    assert.deepEqual((await api.getUsers()).users, [DEFAULT_USER]);
  } finally { globalThis.window = previous; }
});
