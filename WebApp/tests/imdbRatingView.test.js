import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

async function loadContent() {
  const result = await build({ entryPoints: [new URL("../src/ImdbRating.jsx", import.meta.url).pathname],
    bundle: true, write: false, format: "cjs", platform: "node", external: ["react"],
    loader: { ".css": "empty" }, define: { "import.meta.env": "{}" } });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  return props => renderToStaticMarkup(React.createElement(module.exports.ImdbRatingContent, props));
}

test("IMDb scores keep their ten-point scale, votes, date and provenance in each UI language", async () => {
  const render = await loadContent();
  const data = { imdbId: "tt1234567", rating: 8.7, votes: 123456, updatedAt: 1791583200, stale: false };
  for (const [language, score, votes, updated] of [["es-ES", "8,7", "votos", "Actualizado"], ["ca-ES", "8,7", "vots", "Actualitzat"], ["en-US", "8.7", "votes", "Updated"]]) {
    const html = render({ data, language });
    assert.ok(html.includes(score));
    assert.ok(html.includes(votes));
    assert.ok(html.includes(updated));
    assert.match(html, /\/ 10/);
    assert.match(html, /OMDb/);
    assert.match(html, /https:\/\/www.imdb.com\/title\/tt1234567\//);
    assert.doesNotMatch(html, /TMDB|\/ 5|Reintentar/);
  }
});

test("missing, invalid and unavailable ratings never render a fabricated score", async () => {
  const render = await loadContent();
  for (const rating of [null, undefined, "N/A", 0, 11, NaN]) {
    const html = render({ data: { imdbId: "tt1234567", rating }, language: "es" });
    assert.match(html, /No hay puntuaciones/);
    assert.doesNotMatch(html, /imdb-rating__score/);
  }
  const missing = render({ status: "error", error: { code: "OMDB_NOT_CONFIGURED" }, language: "es", onRetry() {} });
  assert.match(missing, /Configura OMDb en Dashboard/);
  assert.doesNotMatch(missing, /No hay puntuaciones|imdb-rating__score/);
  const loading = render({ status: "loading", language: "en" });
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /Loading ratings/);
  const badId = render({ data: { imdbId: "https://bad.example", rating: 8.7 } });
  assert.doesNotMatch(badId, /href=|bad.example/);
});

test("failed refresh retains the saved score and explicitly marks it as stale", async () => {
  const render = await loadContent();
  const html = render({ data: { imdbId: "tt1234567", rating: 7.4, votes: 123, rottenTomatoes: 90, metacritic: 81, updatedAt: 1791583200, stale: true }, language: "es", onRetry() {} });
  assert.match(html, /7,4/);
  assert.match(html, /90<small> %/);
  assert.match(html, /81<small> \/ 100/);
  assert.match(html, /no se han podido actualizar/);
  assert.match(html, /Reintentar/);
  assert.match(html, /Actualizado:/);
});

test("four providers render stars, their own scales and inline votes without inventing missing scores", async () => {
  const render = await loadContent();
  const data = { imdbId: "tt1234567", rating: 8.7, votes: 123456, rottenTomatoes: 95, metacritic: 77 };
  const html = render({ data, tmdb: { rating: 9, votes: 23456 }, language: "es" });
  assert.match(html, /aria-label="TMDB"/);
  assert.match(html, /4,5<small> \/ 5/);
  assert.equal((html.match(/★/g) || []).length, 4);
  assert.match(html, /<small class="imdb-rating__votes">\(23\.456 votos\)<\/small>/);
  assert.match(html, /<small class="imdb-rating__votes">\(123\.456 votos\)<\/small>/);
  assert.match(html, /Rotten Tomatoes/);
  assert.match(html, /Metacritic/);
  assert.match(html, /8,7<small> \/ 10/);
  assert.match(html, /95<small> %/);
  assert.match(html, /77<small> \/ 100/);
  assert.equal((html.match(/123\.456 votos/g) || []).length, 1);
  assert.doesNotMatch(html, /No disponible|No hay puntuaciones/);
  const onlyRotten = render({ data: { ...data, rating: null, votes: null, metacritic: null }, language: "en" });
  assert.match(onlyRotten, /95<small> %/);
  assert.equal((onlyRotten.match(/Not available/g) || []).length, 2);
  assert.doesNotMatch(onlyRotten, /123,456|\/ 10|\/ 100|No ratings are available/);
  const zero = render({ data: { ...data, rottenTomatoes: 0, metacritic: 0 } });
  assert.match(zero, /0<small> %/);
  assert.match(zero, /0<small> \/ 100/);
  assert.doesNotMatch(zero, /No disponible/);
  for (const value of ["N/A", "95%", -1, 101, 2.5, NaN]) {
    const invalid = render({ data: { ...data, rottenTomatoes: value, metacritic: value } });
    assert.equal((invalid.match(/No disponible/g) || []).length, 2);
    assert.match(invalid, /8,7<small> \/ 10/);
    assert.doesNotMatch(invalid, /<small> %|<small> \/ 100/);
  }
});
