import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

async function loadTmdb() {
  const result = await build({ entryPoints: [new URL("../src/tmdbApi.js", import.meta.url).pathname],
    bundle: true, write: false, format: "esm", platform: "browser", define: { "import.meta.env": "{}" } });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

test("credits browse local cache without credentials or language parameters; previews use explicit import route", async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  globalThis.window = { location: { origin: "http://raspberry:5050", hostname: "raspberry" }, sessionStorage: { getItem: () => "1234" } };
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push(url);
    const parsed = new URL(url);
    assert.equal(parsed.origin, "http://raspberry:5050");
    assert.equal(parsed.search, "");
    assert.equal(options.headers["X-Web-Pin"], "1234");
    const data = { cast: [{ id: 1, name: "Actor", character: "Lead" }], crew: [] };
    return { ok: true, text: async () => JSON.stringify(data) };
  };
  try {
    const tmdb = await loadTmdb();
    const movie = await tmdb.getMediaCredits("movie", 17);
    assert.deepEqual(movie.cast[0].characters, ["Lead"]);
    assert.equal(new URL(requests[0]).pathname, "/tmdb/json/movie/17/credits");
    const portrait = new URL(tmdb.buildTmdbImageUrl("/actor.jpg", "w185"));
    assert.equal(portrait.pathname, "/tmdb/images/actor.jpg");
    assert.equal(portrait.searchParams.get("width"), "185");
    assert.equal(portrait.searchParams.get("pin"), "1234");
    assert.equal(new URL(tmdb.buildTmdbImageUrl("/actor.jpg", "w185", true)).pathname, "/tmdb/import/images/actor.jpg");
    await tmdb.getMediaCredits("movie", 17);
    assert.equal(requests.length, 1, "reopening the same title reuses the existing local request cache");
    await tmdb.getMediaCredits("tv", 18);
    assert.equal(new URL(requests[1]).pathname, "/tmdb/json/tv/18/aggregate_credits");
    await tmdb.getMediaCredits("movie", 17, true);
    assert.equal(new URL(requests[2]).pathname, "/tmdb/import/json/movie/17/credits");
    await assert.rejects(tmdb.getMediaCredits("movie", "../../other"), /Invalid TMDB/);
    await assert.rejects(tmdb.getMediaCredits("person", 17), /Invalid TMDB/);
    assert.equal(requests.length, 3);
    globalThis.fetch = async () => ({ ok: true, text: async () => '{"id":19}' });
    await assert.rejects(tmdb.getMediaCredits("movie", 19), /Invalid TMDB credits response/);
    globalThis.fetch = async () => ({ ok: false, status: 409, text: async () => '{"error":"Pending","code":"TMDB_LOCAL_MISSING"}' });
    await assert.rejects(tmdb.getMediaCredits("movie", 20), error => error.code === "TMDB_LOCAL_MISSING");
  } finally {
    globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
  }
});

test("person profiles load on demand, reuse cache and fall back to English biographies", async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  globalThis.window = { location: { origin: "http://raspberry:5050", hostname: "raspberry" }, sessionStorage: { getItem: () => "1234" } };
  const requests = [];
  globalThis.fetch = async url => {
    requests.push(url);
    assert.equal(new URL(url).pathname, "/tmdb/import/json/person/42");
    const english = new URL(url).searchParams.get("language") === "en-US";
    return { ok: true, text: async () => JSON.stringify({ id: 42, name: "Actor", biography: english ? "An actor's biography." : "", imdb_id: "nm0000042" }) };
  };
  try {
    const tmdb = await loadTmdb();
    const person = await tmdb.getPersonDetails(42, "es-ES");
    assert.equal(person.biography, "An actor's biography.");
    assert.equal(person.imdbUrl, "https://www.imdb.com/name/nm0000042/");
    await tmdb.getPersonDetails(42, "es-ES");
    assert.equal(requests.length, 2);
    await assert.rejects(tmdb.getPersonDetails("../movie/1"), /Invalid TMDB person ID/);
    globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ id: 43, name: "Unknown", imdb_id: "javascript:alert(1)" }) });
    const missing = await tmdb.getPersonDetails(43, "en-US");
    assert.equal(missing.biography, "");
    assert.equal(missing.imdbUrl, "");
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});
