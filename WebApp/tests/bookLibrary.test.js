import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { buildBookCollections } from "../src/bookLibrary.js";
import { isGraphicNovel } from "../src/bookMetadata.js";

const volume = (number, overrides = {}) => ({
  name: `The Boys ${number}`, file: `The Boys ${number}.cbz`, collection: "The Boys",
  relativePath: `Books/The Boys/The Boys ${number}.cbz`, format: "cbz", ...overrides,
});

test("book types respect explicit choices, infer legacy comics and split mixed collections", () => {
  assert.equal(isGraphicNovel({ format: "CBR" }), true);
  assert.equal(isGraphicNovel({ relativePath: "Books/old.cbz" }), true);
  assert.equal(isGraphicNovel({ format: "pdf" }), false);
  assert.equal(isGraphicNovel({ format: "cbz", isGraphicNovel: false }), false);
  assert.equal(isGraphicNovel({ format: "epub", isGraphicNovel: true }), true);
  const books = [volume(1), volume(2, { isGraphicNovel: false }), volume(3, { format: "pdf", isGraphicNovel: true })];
  const novels = buildBookCollections(books, {}, "es", { type: "novel" });
  const graphics = buildBookCollections(books, {}, "es", { type: "graphic" });
  assert.deepEqual(novels[0].books.map(book => book.file), ["The Boys 2.cbz"]);
  assert.deepEqual(graphics[0].books.map(book => book.file), ["The Boys 1.cbz", "The Boys 3.cbz"]);
  assert.equal(novels[0].coverBook.file, "The Boys 2.cbz");
  assert.deepEqual(buildBookCollections([volume(1)], {}, "es", { type: "novel" }), []);
});

test("name and descending year sorting use localized titles, keep unknown years last and stable covers", () => {
  const standalone = (name, year, extra = {}) => ({ name, year, file: `${name}.pdf`, relativePath: `Books/${name}.pdf`, ...extra });
  const books = [standalone("Zeta", "2020", { localizedMetadata: { es: { title: "Álbum 2" } } }), standalone("Álbum 10", "2020"), standalone("Nuevo", "2025"), standalone("Sin año", ""),
    volume(1, { year: "1990", name: "Zeta" }), volume(2, { year: "2026", name: "Alfa" })];
  const names = buildBookCollections(books);
  assert.deepEqual(names.map(item => item.label), ["Álbum 2", "Álbum 10", "Nuevo", "Sin año", "The Boys"]);
  const years = buildBookCollections(books, {}, "es", { sort: "year" });
  assert.deepEqual(years.map(item => item.label), ["Nuevo", "Álbum 2", "Álbum 10", "The Boys", "Sin año"]);
  const group = years.find(item => item.isCollection);
  assert.equal(group.year, 1990);
  assert.equal(group.coverBook.file, "The Boys 1.cbz");
  assert.deepEqual(group.books.map(book => book.year), ["2026", "1990"]);
  assert.equal(books[0].name, "Zeta");
});

test("the library contains one entry per collection and keeps standalone books separate", () => {
  const books = [volume(10), volume(2), volume(1), volume(1, { collection: "", relativePath: "Books/single.pdf", file: "single.pdf", format: "pdf" })];
  const entries = buildBookCollections(books);
  assert.equal(entries.length, 2);
  const collection = entries.find(entry => entry.isCollection);
  assert.deepEqual(collection.books.map(book => book.file), ["The Boys 1.cbz", "The Boys 2.cbz", "The Boys 10.cbz"]);
  assert.equal(collection.coverBook.relativePath, volume(1).relativePath);
  assert.equal(entries.find(entry => !entry.isCollection).books.length, 1);
  assert.equal(books[0].file, "The Boys 10.cbz");
});

test("the first volume remains the cover after renaming, and custom collection artwork takes precedence", () => {
  const books = [volume(2), volume(1, { name: "Z: un título personalizado", coverUrl: "/book-covers/first.png?v=1" })];
  const automatic = buildBookCollections(books)[0];
  assert.equal(automatic.coverBook.coverUrl, books[1].coverUrl);
  assert.equal(automatic.coverUrl, "", "inherited covers must not be saved as collection overrides");
  const customized = buildBookCollections(books, { "The Boys": { name: "Mi colección", coverUrl: "/book-covers/custom.png?v=2" } })[0];
  assert.equal(customized.key, "The Boys");
  assert.equal(customized.label, "Mi colección");
  assert.equal(customized.coverBook.coverUrl, "/book-covers/custom.png?v=2");
  assert.equal(buildBookCollections([volume(2)])[0].coverBook.relativePath, volume(2).relativePath);
  assert.deepEqual(buildBookCollections([]), []);
});

test("book artwork uses the configured API host and preserves cover versions and authenticated extraction", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { origin: "http://localhost:5173", hostname: "localhost" }, sessionStorage: { getItem: () => "test-pin" } };
  try {
    const result = await build({ entryPoints: [new URL("../src/api/raspberryApi.js", import.meta.url).pathname], bundle: true, write: false,
      format: "esm", platform: "browser", define: { "import.meta.env": JSON.stringify({ VITE_RASPBERRY_API_BASE_URL: "http://raspberry:5050" }) } });
    const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
    assert.equal(api.getBookDisplayCoverUrl({ coverUrl: "/book-covers/first.png?v=2" }), "http://raspberry:5050/book-covers/first.png?v=2");
    const extracted = new URL(api.getBookDisplayCoverUrl(volume(1)));
    assert.equal(extracted.origin, "http://raspberry:5050");
    assert.equal(extracted.searchParams.get("relativePath"), volume(1).relativePath);
    assert.equal(extracted.searchParams.get("pin"), "test-pin");
    assert.equal(api.getBookDisplayCoverUrl({ coverUrl: "https://covers.example/1.jpg" }), "https://covers.example/1.jpg");
    assert.equal(api.getBookDisplayCoverUrl(null), "");
  } finally { globalThis.window = previousWindow; }
});

test("changing book direction sorts collections and volumes without changing their covers", () => {
  const books = [volume(1, { name: "Alfa", year: 2024 }), volume(2, { name: "Zeta", year: 1990 }), volume(3, { name: "Sin fecha" })];
  const byName = buildBookCollections(books, {}, "es", { sort: "name", direction: "desc" })[0];
  assert.deepEqual(byName.books.map(book => book.name), ["Zeta", "Sin fecha", "Alfa"]);
  const byYear = buildBookCollections(books, {}, "es", { sort: "year", direction: "asc" })[0];
  assert.deepEqual(byYear.books.map(book => book.name), ["Zeta", "Alfa", "Sin fecha"]);
  assert.equal(byName.coverBook.relativePath, books[0].relativePath);
  assert.equal(byYear.coverBook.relativePath, books[0].relativePath);
});

test("book search matches title, author, year and combined terms without accents or case", async () => {
  const { matchesBookQuery } = await import("../src/bookLibrary.js");
  const book = { name: "Alas de ónix", author: "Rebecca Yarros", year: "2025" };
  for (const query of ["onix", "ÓNIX", "  rebecca  ", "YARROS", "2025", "Yarros 2025", "alas onix"]) {
    assert.equal(matchesBookQuery(book, query), true, query);
  }
  assert.equal(matchesBookQuery(book, "2024"), false);
  assert.equal(matchesBookQuery(book, "Yarros 2024"), false);
  assert.equal(matchesBookQuery(book, "Empireo", "Empíreo"), true);
  assert.equal(matchesBookQuery({ publishDate: "2001-08-15" }, "2001"), true);
  assert.equal(matchesBookQuery({}, "2025"), false);
  assert.equal(matchesBookQuery({}, "  "), true);
});

test("author sorting works for collections and volumes in both directions with unknown authors last", () => {
  const books = [volume(1, { author: "Zoé" }), volume(2, { author: "Álvaro" }), volume(3),
    { name: "Solo", relativePath: "Books/solo.epub", author: "Marta" },
    { name: "Unknown", relativePath: "Books/unknown.epub" }];
  const asc = buildBookCollections(books, {}, "es", { sort: "author", direction: "asc" });
  const desc = buildBookCollections(books, {}, "es", { sort: "author", direction: "desc" });
  assert.deepEqual(asc.map(item => item.label), ["The Boys", "Solo", "Unknown"]);
  assert.deepEqual(desc.map(item => item.label), ["Solo", "The Boys", "Unknown"]);
  assert.deepEqual(asc[0].books.map(item => item.author), ["Álvaro", "Zoé", undefined]);
  assert.deepEqual(desc[1].books.map(item => item.author), ["Zoé", "Álvaro", undefined]);
  assert.equal(asc[0].coverBook.relativePath, desc[1].coverBook.relativePath);
});

test("collection author overrides volume authors for display and author sorting", () => {
  const books = [volume(1, { author: "Volume author" }), volume(2, { author: "Other author" })];
  const collection = buildBookCollections(books, { "The Boys": { author: "Collection author" } })[0];
  assert.equal(collection.author, "Collection author");
  assert.equal(collection.books[0].author, "Volume author");
  assert.equal(buildBookCollections(books, { "The Boys": { author: "" } })[0].author, "Other author, Volume author");
});
