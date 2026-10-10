import { test } from "node:test";
import assert from "node:assert/strict";
import { compareLibraryRatings, formatLibraryRating, libraryRatingValue, loadRatingSource, saveRatingSource } from "../src/libraryRatings.js";
import { compareLibraryItems, libraryScrollLabel } from "../src/libraryScroll.js";

const titles = [
  { name: "A", voteAverage: 9, omdbRatings: { rating: 5, rottenTomatoes: 0, metacritic: 90 } },
  { name: "B", voteAverage: 6, omdbRatings: { rating: 8, rottenTomatoes: 95, metacritic: 70 } },
  { name: "Missing", voteAverage: 0 },
];

test("the chosen provider controls movie and series sorting, including genuine zero scores", () => {
  for (const [source, expected] of [["tmdb", ["A", "B"]], ["imdb", ["B", "A"]], ["rottenTomatoes", ["B", "A"]], ["metacritic", ["A", "B"]]]) {
    for (const direction of ["asc", "desc"]) {
      const names = [...(direction === "desc" ? expected : [...expected].reverse()), "Missing"];
      assert.deepEqual([...titles].sort((a, b) => compareLibraryItems(a, b, "rating", direction, "es", source)).map(item => item.name), names);
      assert.deepEqual([...titles].sort((a, b) => compareLibraryRatings(a, b, source, direction)).map(item => item.name), names);
    }
  }
  const tied = [{ name: "Álbum 10" }, { name: "Álbum 2" }];
  assert.deepEqual(tied.sort((a, b) => compareLibraryRatings(a, b, "imdb")).map(item => item.name), ["Álbum 2", "Álbum 10"]);
});

test("cards and navigation labels retain each provider's scale and localized decimals", () => {
  assert.equal(formatLibraryRating(titles[0], "tmdb", "es"), "4,5 / 5");
  assert.equal(formatLibraryRating(titles[0], "imdb", "en"), "5.0 / 10");
  assert.equal(formatLibraryRating(titles[0], "rottenTomatoes", "ca"), "0 %");
  assert.equal(formatLibraryRating(titles[0], "metacritic", "es"), "90 / 100");
  assert.equal(libraryScrollLabel(titles[0], "rating", "es", "imdb"), "5,0");
  assert.equal(libraryScrollLabel(titles[0], "rating", "es", "rottenTomatoes"), "0 %");
  assert.equal(libraryScrollLabel(titles[0], "rating", "es", "metacritic"), "90");
  assert.equal(libraryScrollLabel(titles[2], "rating", "es", "metacritic"), "—");
});

test("missing and invalid scores do not fall back to another provider or become zero", () => {
  for (const value of [undefined, null, "N/A", "8.5", -1, NaN, Infinity, 101]) {
    const item = { voteAverage: value, omdbRatings: { rating: value, rottenTomatoes: value, metacritic: value } };
    for (const source of ["tmdb", "imdb", "rottenTomatoes", "metacritic"]) {
      assert.equal(libraryRatingValue(item, source), null);
      assert.equal(formatLibraryRating(item, source, "es", "No disponible"), "No disponible");
    }
  }
  assert.equal(libraryRatingValue({ voteAverage: 10 }, "imdb"), null);
  assert.equal(libraryRatingValue({ voteAverage: 0 }, "tmdb"), null);
  assert.equal(libraryRatingValue({ omdbRatings: { rating: 0 } }, "imdb"), null);
});

test("the shared choice survives reloads and unavailable storage defaults to TMDB", () => {
  const previous = globalThis.window;
  const data = new Map();
  globalThis.window = { localStorage: { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) } };
  try {
    assert.equal(loadRatingSource(), "tmdb");
    saveRatingSource("metacritic");
    assert.equal(loadRatingSource(), "metacritic");
    saveRatingSource("unknown");
    assert.equal(loadRatingSource(), "tmdb");
    globalThis.window = { get localStorage() { throw new Error("Unavailable"); } };
    assert.doesNotThrow(() => saveRatingSource("imdb"));
    assert.equal(loadRatingSource(), "tmdb");
  } finally { globalThis.window = previous; }
});
