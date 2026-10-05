import { test } from "node:test";
import assert from "node:assert/strict";
import { seriesArtwork } from "../src/seriesArtwork.js";

test("saved series artwork survives summary, detail, language and cache refreshes", () => {
  const profile = { heroImage: "chosen-cover" };
  for (const metadata of [
    {},
    { posterImage: "automatic-summary" },
    { posterImage: "automatic-summary", heroImage: "automatic-header", imageOptions: ["a", "b"] },
    { posterImage: "other-language", heroImage: "new-header", imageOptions: ["c", "d"] },
  ]) {
    assert.deepEqual(seriesArtwork(profile, metadata, "placeholder", value => value && `local/${value}`), {
      heroImage: "local/chosen-cover", posterImage: "local/chosen-cover",
    });
  }
});

test("automatic cover is stable when details or image ordering change", () => {
  const summary = { posterImage: "poster" };
  assert.equal(seriesArtwork({}, summary).posterImage, "poster");
  assert.equal(seriesArtwork({}, { ...summary, heroImage: "backdrop", imageOptions: ["other", "wrong"] }).posterImage, "poster");
  assert.equal(seriesArtwork({}, {}, "placeholder").posterImage, "placeholder");
});

test("changing the saved image updates both surfaces without mutating the profile", () => {
  const profile = Object.freeze({ heroImage: "new-choice" });
  assert.equal(seriesArtwork(profile, { posterImage: "old-poster" }).posterImage, "new-choice");
  assert.equal(seriesArtwork(profile).heroImage, "new-choice");
});
