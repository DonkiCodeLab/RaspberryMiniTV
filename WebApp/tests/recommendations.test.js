import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { draftToTastes, emptyTastes, recommendationKey, recommendationLibraryTarget, recommendationTorrentTarget, tastesToDraft, validRecommendations, validTastePreferences, validateRecommendationMemory } from "../src/recommendations.js";
import { recommendationStrings, recommendationWarning } from "../src/recommendationStrings.js";
import { torrentQuery } from "../src/torrentUtils.js";

const card = (changes = {}) => ({ tmdbId: 17, mediaType: "movie", title: "A film", year: 2000, overview: "Overview", reason: "An AI suggestion", available: false, localIds: [], ...changes });

test("recommendation memory belongs to the exact active user and section, with a valid CAS revision", () => {
  const memory = { ok: true, userId: "alice", section: "movies", revision: 4, preferences: emptyTastes(), history: [{ role: "user", text: "I like comedy" }] };
  assert.equal(validateRecommendationMemory(memory, "alice", "movies"), memory);
  assert.throws(() => validateRecommendationMemory(memory, "bob", "movies"));
  assert.throws(() => validateRecommendationMemory(memory, "alice", "series"));
  assert.throws(() => validateRecommendationMemory({ ...memory, revision: null }, "alice", "movies"));
  assert.throws(() => validateRecommendationMemory({ ...memory, preferences: { genres: [] } }, "alice", "movies"));
  assert.throws(() => validateRecommendationMemory({ ...memory, history: [{ role: "system", text: "No" }] }, "alice", "movies"));
});

test("taste editing preserves names with punctuation, removes blank duplicates and respects backend limits", () => {
  const preferences = { ...emptyTastes(), genres: ["Comedy"], actors: ["Smith, Jr."] };
  const draft = tastesToDraft(preferences);
  assert.equal(draft.actors, "Smith, Jr.");
  draft.genres = " Comedy \n\nComedy\nDrama";
  const edited = draftToTastes(draft);
  assert.deepEqual(edited.genres, ["Comedy", "Drama"]);
  assert.deepEqual(edited.actors, ["Smith, Jr."]);
  assert.equal(validTastePreferences(edited), true);
  assert.equal(validTastePreferences({ ...edited, genres: Array.from({ length: 13 }, (_, index) => `Genre ${index}`) }), false);
  assert.equal(validTastePreferences({ ...edited, actors: ["x".repeat(101)] }), false);
  assert.equal(validTastePreferences({ ...edited, actors: [" "] }), false);
  assert.deepEqual(preferences.genres, ["Comedy"]);
});

test("only verified external titles and real local identities produce recommendation cards", () => {
  const local = card({ tmdbId: 0, available: true, localIds: ["Movies/local.mp4"] });
  const local2 = card({ tmdbId: 0, available: true, localIds: ["Movies/other.mp4"] });
  const items = [card(), card(), card({ mediaType: "tv" }), card({ tmdbId: -1 }), card({ tmdbId: 0 }),
    card({ available: true }), card({ available: "yes" }), local, local2, local];
  assert.deepEqual(validRecommendations(items, "movies"), [items[0], local, local2]);
  assert.deepEqual(validRecommendations(items, "series"), [items[2]]);
  assert.notEqual(recommendationKey(local), recommendationKey(local2));
  assert.equal(recommendationKey(local), recommendationKey({ ...local, title: "A renamed title" }));
});

test("library actions match exact local paths and IDs, including local titles without a TMDB match", () => {
  const movies = [{ id: "Movies/original.mp4", fileRelativePath: "Movies/original.mp4", tmdbId: 17 },
    { id: "Movies/remake.mp4", fileRelativePath: "Movies/remake.mp4", tmdbId: 18 },
    { id: "Movies/local.mp4", fileRelativePath: "Movies/local.mp4", tmdbId: 0 }];
  const series = [{ id: 19, directoryPath: "TVShows/show" }];
  assert.deepEqual(recommendationLibraryTarget(card({ available: true, localIds: ["Movies/original.mp4"] }), movies, series), { section: "movies", id: "Movies/original.mp4" });
  assert.equal(recommendationLibraryTarget(card({ available: true, localIds: ["Movies/remake.mp4"] }), movies, series), null);
  assert.equal(recommendationLibraryTarget(card({ available: true, localIds: ["Movies/deleted.mp4"] }), movies, series), null);
  assert.deepEqual(recommendationLibraryTarget(card({ tmdbId: 0, available: true, localIds: ["Movies/local.mp4"] }), movies, series), { section: "movies", id: "Movies/local.mp4" });
  assert.deepEqual(recommendationLibraryTarget(card({ tmdbId: 19, mediaType: "tv", available: true, localIds: ["TVShows/show"] }), movies, series), { section: "series", id: "TVShows/show" });
});

test("torrent actions open a validated movie or TV TMDB identity, never a model-generated torrent URL", () => {
  const movie = recommendationTorrentTarget(card({ url: "https://example.invalid/file.torrent" }));
  assert.deepEqual(movie, { tmdbId: 17, mediaType: "movie", title: "A film", source: "recommendation" });
  const series = recommendationTorrentTarget(card({ mediaType: "tv" }));
  assert.equal(series.mediaType, "tv");
  assert.equal(recommendationTorrentTarget(card({ tmdbId: 0 })), null);
  assert.equal(recommendationTorrentTarget(card({ tmdbId: "17" })), null);
  // The existing torrent component auto-searches this query after the modal
  // resolves the selected TMDB profile (including IMDb for series providers).
  assert.equal(torrentQuery({ name: "Localized", originalName: "Original", releaseDate: "2000-01-01" }, "movies"), "Original 2000");
  assert.equal(torrentQuery({ name: "Localized", originalName: "Original", firstAirDate: "2000-01-01" }, "series"), "Original");
});

async function loadComponent(name, env = {}) {
  const result = await build({ entryPoints: [new URL(`../src/${name}.jsx`, import.meta.url).pathname], bundle: true, write: false,
    format: "cjs", platform: "node", external: ["react"], loader: { ".css": "empty" }, define: { "import.meta.env": JSON.stringify(env) } });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  return module.exports;
}

test("cards distinguish installed titles from torrent searches and label reasons as AI suggestions", async () => {
  const { RecommendationCards } = await loadComponent("Recommendations");
  const html = renderToStaticMarkup(React.createElement(RecommendationCards, { language: "es", recommendations: [
    card({ available: true, localIds: ["Movies/a.mp4"] }), card({ tmdbId: 18, title: "Another <script>title</script>" }),
  ], onOpenLibrary() {}, onSearchTorrent() {} }));
  assert.match(html, /Ver en mi biblioteca/);
  assert.match(html, /Buscar torrent/);
  assert.match(html, /No está en tu biblioteca/);
  assert.match(html, /Por qué podría gustarte · IA/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img|href=/);
  assert.match(html, /tú eliges qué descargar/);
});

test("recommendations show active profile and disclosure; other sections keep ordinary search", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { hostname: "localhost", origin: "http://localhost:5173" } };
  try {
    const { default: Recommendations } = await loadComponent("Recommendations", { VITE_WEB_DEV_MODE: "mock" });
    const html = renderToStaticMarkup(React.createElement(Recommendations, { user: { id: "alice", name: "Alice" }, section: "movies", language: "en" }));
    assert.match(html, /Recommendations for/);
    assert.match(html, /Alice/);
    assert.match(html, /recent conversation/);
    assert.match(html, /watched and favorite marks/);
    assert.match(html, /media files are not sent/);
    const { default: CatalogAI } = await loadComponent("CatalogAI", { VITE_WEB_DEV_MODE: "mock" });
    const movie = renderToStaticMarkup(React.createElement(CatalogAI, { section: "movies", language: "es" }));
    assert.match(movie, /Recomiéndame/);
    const book = renderToStaticMarkup(React.createElement(CatalogAI, { section: "books", language: "es" }));
    assert.doesNotMatch(book, /Recomiéndame/);
  } finally { globalThis.window = previousWindow; }
});

test("warnings and shared user taste controls are translated", () => {
  for (const language of ["es", "ca", "en"]) {
    const s = recommendationStrings(language);
    assert.ok(s.forget && s.forgetNote && s.conflict && s.tasteLimit);
    for (const code of ["AI_RECOMMENDATION_UNVERIFIED", "AI_RECOMMENDATION_LOOKUP_FAILED", "AI_RECOMMENDATION_ALREADY_WATCHED", "AI_PREFERENCE_UPDATE_IGNORED", "AI_PREFERENCE_LIMIT"]) {
      assert.notEqual(recommendationWarning(code, language), s.warning);
    }
  }
});
