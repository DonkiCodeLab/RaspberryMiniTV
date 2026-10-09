import { test } from "node:test";
import assert from "node:assert/strict";
import { gameYear, gameRating } from "../src/gameCardMetadata.js";

test("game cards read release years from metadata and support older catalog fields", () => {
  assert.equal(gameYear({ gameMetadata: { releaseDate: "1989-06-14" } }), "1989");
  assert.equal(gameYear({ gameMetadata: { releaseDate: "1993-06-06" }, year: 1994 }), "1993");
  assert.equal(gameYear({ releaseYear: 1990 }), "1990");
  assert.equal(gameYear({}), "");
});

test("game ratings normalize provider scales to five stars", () => {
  assert.equal(gameRating({ gameMetadata: { rating: 70, ratingScale: 100 } }), "3.5 / 5");
  assert.equal(gameRating({ gameMetadata: { rating: "14", ratingScale: 20 } }), "3.5 / 5");
  assert.equal(gameRating({ gameMetadata: { rating: 0, ratingScale: 20 } }), "0.0 / 5");
  for (const rating of [undefined, null, "", " ", "invalid", -1]) {
    assert.equal(gameRating({ gameMetadata: { rating, ratingScale: 20 } }), "");
  }
  assert.equal(gameRating({ gameMetadata: { rating: 70 } }), "");
  assert.equal(gameRating({}), "");
});
