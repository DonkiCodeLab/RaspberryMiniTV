import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeOmdbRating, formatOmdbRating, formatOmdbCriticScore, formatOmdbVotes, formatOmdbUpdatedAt,
  omdbError, omdbStrings, omdbSettingsPayload, omdbRequestWithTimeout } from "../src/omdbRatings.js";

const rating = { ok: true, imdbId: "tt0096697", rating: 8.7, votes: 452000, rottenTomatoes: 95, metacritic: 77, updatedAt: 1791630000, stale: false };

test("ratings retain unavailable or stale data and reject malformed upstream values", () => {
  assert.deepEqual(normalizeOmdbRating(rating), rating);
  const unavailable = { ...rating, rating: null, votes: null, updatedAt: null };
  assert.deepEqual(normalizeOmdbRating(unavailable), unavailable);
  assert.equal(formatOmdbRating(unavailable.rating, "es"), "—");
  assert.equal(formatOmdbRating(0, "es"), "—");
  const stale = { ...rating, stale: true, code: "OMDB_LIMIT" };
  assert.deepEqual(normalizeOmdbRating(stale), stale);
  for (const change of [{ rating: "N/A" }, { rating: "8.7" }, { rating: 11 }, { rating: 0 }, { rating: -1 }, { rating: NaN },
    { votes: "452,000" }, { votes: -1 }, { votes: 0.5 }, { updatedAt: Infinity }, { imdbId: "tt123" },
    { stale: "false" }, { ok: false }]) {
    assert.throws(() => normalizeOmdbRating({ ...rating, ...change }), error => error.code === "OMDB_INVALID_RESPONSE");
  }
  assert.throws(() => normalizeOmdbRating(null), error => error.code === "OMDB_INVALID_RESPONSE");
});

test("all UI labels and errors are localized and never display raw errors or secrets", () => {
  assert.equal(formatOmdbRating(8.7, "es"), "8,7");
  assert.equal(formatOmdbRating(8.7, "ca"), "8,7");
  assert.equal(formatOmdbRating(8.7, "en"), "8.7");
  assert.equal(formatOmdbVotes(452000, "en"), "452,000");
  assert.equal(formatOmdbVotes(null, "es"), "—");
  assert.equal(formatOmdbUpdatedAt(null, "en"), "");
  assert.ok(formatOmdbUpdatedAt(rating.updatedAt, "en").includes("2026"));
  assert.equal(omdbStrings("cat"), omdbStrings("ca"));
  assert.equal(omdbStrings("ca-ES"), omdbStrings("ca"));
  assert.equal(omdbStrings("EN-US"), omdbStrings("en"));
  assert.equal(omdbStrings("es-ES"), omdbStrings("es"));
  assert.equal(formatOmdbRating(8.7, "EN-US"), "8.7");
  assert.equal(omdbStrings("unknown"), omdbStrings("es"));
  for (const language of ["es", "ca", "en"]) {
    const t = omdbStrings(language);
    assert.deepEqual(Object.keys(t).sort(), Object.keys(omdbStrings("es")).sort());
    assert.equal(omdbError({ code: "OMDB_NOT_CONFIGURED" }, language), t.notConfigured);
    assert.equal(omdbError({ code: "OMDB_AUTH_ERROR" }, language), t.errors.auth);
    assert.equal(omdbError({ code: "OMDB_LIMIT" }, language), t.errors.limit);
    assert.equal(omdbError({ code: "UNKNOWN", message: "secret-api-key" }, language), t.errors.generic);
    assert.ok(t.votes(452000).includes(formatOmdbVotes(452000, language)));
  }
});

test("optional critic scores preserve zero, partial coverage and compatibility with IMDb-only servers", () => {
  const { rottenTomatoes, metacritic, ...oldResponse } = rating;
  assert.deepEqual(normalizeOmdbRating(oldResponse), { ...oldResponse, rottenTomatoes: null, metacritic: null });
  for (const value of [null, undefined, "N/A", "95%", "77/100", "", true, -1, 101, 7.5, NaN, Infinity]) {
    const normalized = normalizeOmdbRating({ ...rating, rottenTomatoes: value, metacritic: value });
    assert.equal(normalized.rating, rating.rating, "Invalid optional scores must not discard IMDb");
    assert.equal(normalized.rottenTomatoes, null);
    assert.equal(normalized.metacritic, null);
    assert.equal(formatOmdbCriticScore(value, "es"), "—");
  }
  for (const value of [0, 1, 99, 100]) {
    const normalized = normalizeOmdbRating({ ...rating, rottenTomatoes: value, metacritic: value });
    assert.equal(normalized.rottenTomatoes, value);
    assert.equal(normalized.metacritic, value);
    assert.equal(formatOmdbCriticScore(value, "en"), String(value));
  }
  const partial = normalizeOmdbRating({ ...rating, rating: null, votes: null, metacritic: null });
  assert.equal(partial.rottenTomatoes, 95);
  assert.equal(partial.rating, null);
  assert.equal(partial.metacritic, null);
});

test("blank settings preserve the saved key and explicit removal takes precedence", () => {
  assert.deepEqual(omdbSettingsPayload("  abc123  "), { apiKey: "abc123" });
  assert.deepEqual(omdbSettingsPayload("  "), {});
  assert.deepEqual(omdbSettingsPayload(), {});
  assert.deepEqual(omdbSettingsPayload("abc123", true), { clearApiKey: true });
});

test("requests settle and abort a stalled operation on timeout or navigation", async () => {
  let timedSignal;
  await assert.rejects(omdbRequestWithTimeout(signal => {
    timedSignal = signal;
    return new Promise(() => {});
  }, undefined, 5), error => error.code === "OMDB_TIMEOUT");
  assert.equal(timedSignal.aborted, true);

  const controller = new AbortController();
  let navigationSignal;
  const pending = omdbRequestWithTimeout(signal => {
    navigationSignal = signal;
    return new Promise(() => {});
  }, controller.signal, 10000);
  controller.abort();
  await assert.rejects(pending, error => error.name === "AbortError");
  assert.equal(navigationSignal.aborted, true);
  await assert.rejects(omdbRequestWithTimeout(() => {
    assert.fail("An already-aborted operation must not make a request");
  }, controller.signal), error => error.name === "AbortError");
  assert.equal(await omdbRequestWithTimeout(async () => "ready", undefined, 10000), "ready");
});
