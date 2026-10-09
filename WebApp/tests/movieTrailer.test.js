import { test } from "node:test";
import assert from "node:assert/strict";
import { selectMovieTrailer } from "../src/movieTrailer.js";

test("movie trailer selection prefers official YouTube trailers and rejects unrelated or invalid videos", () => {
  const official = { site: "YouTube", type: "Trailer", key: "abcdefghijk", official: true };
  const unofficial = { ...official, key: "12345678901", official: false };
  const rows = Object.freeze([
    { ...official, type: "Clip" }, { ...official, site: "Vimeo" },
    { ...official, key: "invalid/url" }, unofficial, official,
  ]);
  assert.equal(selectMovieTrailer(rows), official);
  assert.equal(selectMovieTrailer([unofficial]), unofficial);
  assert.equal(selectMovieTrailer(undefined), null);
  assert.equal(selectMovieTrailer([{ ...official, type: "Teaser" }]), null);
});
