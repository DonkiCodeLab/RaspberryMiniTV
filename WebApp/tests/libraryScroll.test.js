import { test } from "node:test";
import assert from "node:assert/strict";
import { libraryScrollLabel, scrollIndexAtPosition, buildRatingScale, nearestRailTick } from "../src/libraryScroll.js";

test("navigation labels follow localized names, dates and the displayed five-star scale", () => {
  assert.equal(libraryScrollLabel({ name: "  ¡Ágora!" }), "A");
  assert.equal(libraryScrollLabel({ name: "Ñandú" }), "Ñ");
  assert.equal(libraryScrollLabel({ label: "1984" }), "0–9");
  assert.equal(libraryScrollLabel({ name: "" }), "#");
  assert.equal(libraryScrollLabel({ releaseDate: "2025-03-01" }, "year"), "2025");
  assert.equal(libraryScrollLabel({ year: 1998 }, "year"), "1998");
  assert.equal(libraryScrollLabel({}, "year"), "—");
  assert.equal(libraryScrollLabel({ voteAverage: 8.6 }, "rating", "es"), "★ 4,3");
  assert.equal(libraryScrollLabel({ voteAverage: 0 }, "rating"), "—");
  assert.equal(libraryScrollLabel({ omdbRatings: { rating: 7.3 } }, "rating", "es", "imdb"), "7,3");
  assert.equal(libraryScrollLabel({ omdbRatings: { rating: 7.3 } }, "rating", "en", "imdb"), "7.3");
  assert.equal(libraryScrollLabel({}, "rating", "es", "imdb"), "—");
});

test("IMDb rail prints only integers while decimal ratings remain reachable in either direction", () => {
  const labels = ["3,0", "3,5", "7,3", "7,4", "9,3", "10,0"];
  for (const direction of ["asc", "desc"]) {
    const ordered = direction === "asc" ? labels : [...labels].reverse();
    const scale = buildRatingScale(ordered, direction);
    assert.deepEqual(scale.marks.map(([label]) => label), (direction === "asc" ? [...Array(10).keys()] : [...Array(10).keys()].reverse()).map(String));
    const fraction = value => direction === "asc" ? value / 10 : 1 - value / 10;
    for (const value of [3, 3.5, 7.3, 7.4, 9.3, 10]) {
      assert.equal(scale.values[nearestRailTick(scale.positions, fraction(value))], value);
    }
    assert.equal(scale.values[nearestRailTick(scale.positions, fraction(7.32))], 7.3);
    assert.equal(scale.values[nearestRailTick(scale.positions, fraction(7.38))], 7.4);
    assert.equal(scale.values[nearestRailTick(scale.positions, fraction(0))], 3);
  }
});

test("unrated movies get a separate final stop without turning into zero-rated movies", () => {
  for (const direction of ["asc", "desc"]) {
    const labels = direction === "asc" ? ["3.0", "9.3", "—"] : ["9.3", "3.0", "—"];
    const scale = buildRatingScale(labels, direction);
    assert.equal(scale.values[2], null);
    assert.deepEqual(scale.marks.at(-1), ["—", 1]);
    assert.equal(nearestRailTick(scale.positions, 1), 2);
    for (const index of [0, 1]) assert.equal(nearestRailTick(scale.positions, scale.positions[index]), index);
  }
  assert.deepEqual(buildRatingScale(["—"]), { max: 10, values: [null], positions: [0], marks: [["—", 0]] });
});

for (const source of ["rottenTomatoes", "metacritic"]) test(`${source} uses ten-point marks and keeps exact ratings, zero and missing scores distinct`, () => {
  const labels = [0, 13, 86, 87, 96, 100].map(value => libraryScrollLabel({ omdbRatings: { [source]: value } }, "rating", "es", source));
  for (const direction of ["asc", "desc"]) {
    const ordered = direction === "asc" ? labels : [...labels].reverse();
    for (const missing of [false, true]) {
      const scale = buildRatingScale(missing ? [...ordered, "—"] : ordered, direction, source);
      const marks = Array.from({ length: 11 }, (_, index) => String(index * 10));
      if (direction === "desc") marks.reverse();
      if (missing) marks.push("—");
      assert.equal(scale.max, 100);
      assert.deepEqual(scale.marks.map(([label]) => label), marks);
      const fraction = value => (direction === "asc" ? value / 100 : 1 - value / 100) * (missing ? 10 / 11 : 1);
      for (const value of [0, 13, 86, 87, 96, 100]) {
        assert.equal(scale.values[nearestRailTick(scale.positions, fraction(value))], value);
      }
      if (missing) assert.equal(scale.values[nearestRailTick(scale.positions, 1)], null);
    }
  }
});

test("scroll tracking follows the first card of each row and handles list layouts", () => {
  assert.equal(scrollIndexAtPosition([100, 100, 100, 500, 500, 900], 550), 3);
  assert.equal(scrollIndexAtPosition([100, 100, 100, 500], 0), 0);
  assert.equal(scrollIndexAtPosition([100, 200, 300], 250), 1);
  assert.equal(scrollIndexAtPosition([100, 200, 300], 500), 2);
});

test("all sort criteria support both directions and leave unknown metadata last", async () => {
  const { compareLibraryItems } = await import("../src/libraryScroll.js");
  const items = [
    { name: "Zeta", releaseDate: "1999-01-01", voteAverage: 8 },
    { name: "Álbum 10", releaseDate: "2025-02-01", voteAverage: 4 },
    { name: "Álbum 2", voteAverage: 0 },
  ];
  const order = (sort, direction) => [...items].sort((a, b) => compareLibraryItems(a, b, sort, direction)).map(item => item.name);
  assert.deepEqual(order("name", "asc"), ["Álbum 2", "Álbum 10", "Zeta"]);
  assert.deepEqual(order("name", "desc"), ["Zeta", "Álbum 10", "Álbum 2"]);
  assert.deepEqual(order("year", "asc"), ["Zeta", "Álbum 10", "Álbum 2"]);
  assert.deepEqual(order("year", "desc"), ["Álbum 10", "Zeta", "Álbum 2"]);
  assert.deepEqual(order("rating", "asc"), ["Álbum 10", "Zeta", "Álbum 2"]);
  assert.deepEqual(order("rating", "desc"), ["Zeta", "Álbum 10", "Álbum 2"]);
});

test("decades retain available years and card indexes in either sort direction", async () => {
  const { buildDecadeTicks } = await import("../src/libraryScroll.js");
  assert.deepEqual(buildDecadeTicks(["1980", "1980", "1989", "1990", "2005", "—"]), [
    { label: "1980", index: 0, years: [["1980", 0], ["1989", 2]] },
    { label: "1990", index: 3, years: [["1990", 3]] },
    { label: "2000", index: 4, years: [["2005", 4]] },
    { label: "—", index: 5, years: [["—", 5]] },
  ]);
  assert.deepEqual(buildDecadeTicks(["2026", "2020", "1999", "1991", "—"]), [
    { label: "2020", index: 0, years: [["2026", 0], ["2020", 1]] },
    { label: "1990", index: 2, years: [["1999", 2], ["1991", 3]] },
    { label: "—", index: 4, years: [["—", 4]] },
  ]);
  assert.deepEqual(buildDecadeTicks([]), []);
});

test('author navigation uses author initials rather than book titles', () => {
  assert.equal(libraryScrollLabel({ name: 'Zeta', author: 'Álvaro' }, 'author'), 'A');
  assert.equal(libraryScrollLabel({ name: 'Zeta' }, 'author'), '#');
});
