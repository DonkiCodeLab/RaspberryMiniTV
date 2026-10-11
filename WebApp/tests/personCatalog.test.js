import test from "node:test";
import assert from "node:assert/strict";
import { personCatalogMovies } from "../src/personCatalog.js";

test("person filmography matches catalog IDs across cast and crew without duplicates", () => {
  const movies = [
    { id: "local-a", tmdbId: "12", name: "Custom title" },
    { id: "local-b", tmdbId: 13, name: "Directed movie" },
    { id: "copy", tmdbId: 12 },
    { id: "unrelated", tmdbId: 14, name: "Custom title" },
    { id: "missing", tmdbId: null },
  ];
  assert.deepEqual(personCatalogMovies(movies, {
    cast: [{ id: 12 }, { id: 99 }], crew: [{ id: 12 }, { id: 13 }, { id: 0 }],
  }), movies.slice(0, 2));
  assert.deepEqual(personCatalogMovies(movies, null), []);
  assert.deepEqual(personCatalogMovies([], { cast: [{ id: 12 }] }), []);
});
