import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeOmdbLibrary, omdbLibraryStrings } from "../src/omdbLibrary.js";

const snapshot = { ok: true, configured: true, total: 5, ready: 2,
  missingIds: [{ kind: "movie", title: "Unknown movie", path: "Movies/unknown.mkv" }],
  job: { state: "running", total: 5, processed: 3, ready: 1, unavailable: 1, failed: 1,
    currentTitle: "Next movie", code: null, startedAt: 1791630000, finishedAt: null } };

test("library snapshots preserve cached outcomes without claiming they were newly fetched", () => {
  assert.deepEqual(normalizeOmdbLibrary(snapshot), snapshot);
  const completed = { ...snapshot, ready: 5,
    job: { ...snapshot.job, state: "completed", processed: 5, ready: 3, currentTitle: "", finishedAt: 1791630020 } };
  assert.deepEqual(normalizeOmdbLibrary(completed), completed);
  const paused = { ...snapshot, job: { ...snapshot.job, state: "paused", code: "OMDB_LIMIT" } };
  assert.deepEqual(normalizeOmdbLibrary(paused), paused);
  const withoutIds = { ...snapshot, total: 0, ready: 0,
    job: { ...snapshot.job, state: "idle", total: 0, processed: 0, ready: 0, unavailable: 0, failed: 0, currentTitle: "", startedAt: null } };
  assert.deepEqual(normalizeOmdbLibrary(withoutIds), withoutIds, "Unidentified entries do not count towards the eligible total");
  const cleaned = normalizeOmdbLibrary({ ...snapshot, apiKey: "secret", job: { ...snapshot.job, error: "secret", code: "raw secret" } });
  assert.equal(cleaned.apiKey, undefined);
  assert.equal(cleaned.job.error, undefined);
  assert.equal(cleaned.job.code, null);
});

test("malformed statuses and inconsistent progress cannot appear as successful updates", () => {
  for (const value of [null, {}, { ...snapshot, ok: false }, { ...snapshot, configured: "true" },
    { ...snapshot, total: -1 }, { ...snapshot, ready: 6 }, { ...snapshot, missingIds: null },
    { ...snapshot, missingIds: [{ kind: "book", title: "Book", path: "book.epub" }] },
    { ...snapshot, job: null }, { ...snapshot, job: { ...snapshot.job, state: "success" } },
    { ...snapshot, job: { ...snapshot.job, processed: 7 } },
    { ...snapshot, job: { ...snapshot.job, processed: 2 } },
    { ...snapshot, job: { ...snapshot.job, ready: "1" } },
    { ...snapshot, job: { ...snapshot.job, unavailable: 0.5 } },
    { ...snapshot, job: { ...snapshot.job, startedAt: "today" } },
    { ...snapshot, job: { ...snapshot.job, finishedAt: NaN } },
    { ...snapshot, job: { ...snapshot.job, code: {} } }]) {
    assert.throws(() => normalizeOmdbLibrary(value), error => error.code === "OMDB_INVALID_RESPONSE");
  }
});

test("library progress and actions are translated with locale aliases", () => {
  assert.equal(omdbLibraryStrings("EN-US"), omdbLibraryStrings("en"));
  assert.equal(omdbLibraryStrings("ca-ES"), omdbLibraryStrings("ca"));
  assert.equal(omdbLibraryStrings("cat"), omdbLibraryStrings("ca"));
  assert.equal(omdbLibraryStrings("other"), omdbLibraryStrings("es"));
  assert.equal(omdbLibraryStrings("es").title, "Actualizar fichas existentes");
  assert.match(omdbLibraryStrings("en").progress(1500, 2000), /1,500 of 2,000 titles checked/);
  for (const language of ["es", "ca", "en"]) {
    const t = omdbLibraryStrings(language);
    assert.deepEqual(Object.keys(t).sort(), Object.keys(omdbLibraryStrings("es")).sort());
    assert.deepEqual(Object.keys(t.states).sort(), ["completed", "idle", "paused", "pausing", "running"]);
    assert.ok(t.current("Next movie").includes("Next movie"));
    assert.ok(t.completed(snapshot.job).includes("3"));
    assert.ok(t.inventory(2, 5).includes("2"));
    assert.ok(t.missingIds(4).includes("4"));
    assert.ok(t.failed(1).includes("1"));
    assert.ok(t.unavailable(1).includes("1"));
    assert.ok(t.refresh);
    assert.ok(t.continues.includes("Raspberry"));
  }
});
