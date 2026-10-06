import { test } from "node:test";
import assert from "node:assert/strict";
import { hasTorrentLibraryUpdates, isTorrentHistory, mergeTorrentResults, torrentJobTitle, torrentQuery, torrentSize, torrentSources, torrentLibraryVersion, sortTorrents, torrentStrings } from "../src/torrentUtils.js";

test("movie search prefers original title and release year", () => {
  assert.equal(torrentQuery({ name: "Título", originalName: "Original", releaseDate: "1968-10-01" }), "Original 1968");
  assert.equal(torrentQuery({ name: "Título" }), "Título");
});
test("series search uses original name without the movie release year", () => {
  assert.equal(torrentQuery({ name: "Serie", originalName: "Original", releaseDate: "2020-01-01", firstAirDate: "2020-01-01" }, "series"), "Original");
  assert.equal(torrentJobTitle({ series: { name: "Series" } }), "Series");
  assert.equal(torrentJobTitle({ movie: { name: "Old movie job" } }), "Old movie job");
});
test("additional EZTV pages merge duplicate hashes without losing their sources", () => {
  const old = [{ infoHash: "a", name: "Episode", seeds: 4, sources: ["The Pirate Bay"] }];
  const more = [{ infoHash: "a", name: "Episode", seeds: 8, sources: ["EZTV"] }, { infoHash: "b", name: "Other episode", seeds: 2, sources: ["EZTV"] }];
  const rows = mergeTorrentResults(old, more);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].seeds, 8);
  assert.deepEqual(rows[0].sources, ["The Pirate Bay", "EZTV"]);
  assert.deepEqual(old[0].sources, ["The Pirate Bay"]);
});
test("torrent size uses decimal megabytes and seeds are sorted numerically without mutating results", () => {
  assert.equal(torrentSize(1500000, "en"), "1.5 MB");
  const rows = [{ name: "low", seeds: "9" }, { name: "high", seeds: "100" }];
  assert.equal(sortTorrents(rows)[0].name, "high");
  assert.equal(rows[0].name, "low");
});
test("library refresh happens on import and TMDB completion, not on progress updates", () => {
  const job = { id: "hash", state: "downloading", progress: 50 };
  assert.equal(torrentLibraryVersion([job]), "");
  job.item = { relativePath: "Movies/film.mkv" }; job.state = "metadata";
  const imported = torrentLibraryVersion([job]);
  job.state = "failed";
  assert.equal(torrentLibraryVersion([job]), imported);
  job.state = "complete";
  assert.notEqual(torrentLibraryVersion([job]), imported);
});
test("all UI states and controls are translated", () => {
  for (const language of ["es-ES", "ca-ES", "en-US"]) {
    const strings = torrentStrings(language);
    for (const key of ["queued", "downloading", "paused", "importing", "metadata", "complete", "failed", "cancelled", "retry", "cancel", "pause", "resume", "remove", "history", "historyHint", "active", "list", "source", "sourcesSearched", "sourcesUnavailable", "seriesHint", "seriesEmpty", "season", "episode", "moreEztv", "eztvMissing", "eztvHint", "episodesImported", "episodesSkipped", "movie", "series"])
      assert.ok(strings[key]);
  }
});

test("sources remain compatible with old API responses and saved downloads", () => {
  assert.deepEqual(torrentSources({}), ["The Pirate Bay"]);
  assert.deepEqual(torrentSources({ sources: [] }), ["The Pirate Bay"]);
  assert.deepEqual(torrentSources({ sources: ["The Pirate Bay", "1337x (Knaben)", "The Pirate Bay", null, " "] }), ["The Pirate Bay", "1337x (Knaben)"]);
});

test("finished and cancelled jobs belong to history while retries remain available", () => {
  for (const state of ["complete", "cancelled"]) assert.ok(isTorrentHistory({ state }));
  for (const state of ["queued", "downloading", "paused", "importing", "metadata", "failed"]) assert.equal(isTorrentHistory({ state }), false);
});

test("removing history does not reload the movie library, but a simultaneous completion does", () => {
  assert.equal(hasTorrentLibraryUpdates("a:ready|b:ready", "b:ready"), false);
  assert.equal(hasTorrentLibraryUpdates("a:ready", ""), false);
  assert.equal(hasTorrentLibraryUpdates("a:ready|b:imported", "b:ready"), true);
  assert.equal(hasTorrentLibraryUpdates("", "a:imported"), true);
});
