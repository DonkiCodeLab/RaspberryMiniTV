import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { localizeBook, updateBookMetadata, bookLanguageName, selectBookPageCount } from "../src/bookMetadata.js";
import { buildBookCollections } from "../src/bookLibrary.js";
import { bookStrings } from "../src/bookStrings.js";

const original = {
  title: "Original title", name: "Original title", description: "Original synopsis", isbn: "123", publisher: "Publisher", language: "eng", pageCount: "100",
  relativePath: "Books/book.epub", format: "epub", openLibraryKey: "/works/OL1W", editionKey: "/books/OL2M",
  localizedMetadata: {
    es: { title: "Título", description: "Sinopsis" }, ca: { title: "Títol", description: "Sinopsi" }, en: { title: "Title", description: "Synopsis" },
  },
};

test("catalog pages take precedence over EPUB references without replacing manual counts", () => {
  const file = { pageCount: "200", pageCountSource: "epub-page-list" };
  assert.deepEqual(selectBookPageCount(file, { pageCount: "350" }), { pageCount: "350", pageCountSource: "openlibrary" });
  assert.deepEqual(selectBookPageCount(file, {}), file);
  const manual = { pageCount: "123", pageCountSource: "manual" };
  assert.deepEqual(selectBookPageCount(manual, { pageCount: "350" }), manual);
  assert.deepEqual(selectBookPageCount({ pageCount: "350", pageCountSource: "openlibrary" }, {}), { pageCount: "", pageCountSource: "" });
});

test("system language switches saved book texts offline without changing edition facts", () => {
  for (const language of ["es", "ca", "en"]) {
    const [collection] = buildBookCollections([original], {}, language);
    const book = collection.books[0];
    assert.equal(collection.label, original.localizedMetadata[language].title);
    assert.equal(book.description, original.localizedMetadata[language].description);
    assert.equal(book.descriptionFallback, false);
    for (const key of ["isbn", "publisher", "pageCount", "editionKey", "language"]) assert.equal(book[key], original[key]);
    assert.equal(book.originalMetadata, original);
  }
  const spanish = localizeBook(original, "es");
  assert.equal(localizeBook(spanish, "ca").name, "Títol");
  assert.equal(original.name, "Original title");
});

test("legacy and missing translations retain original text with an explicit fallback", () => {
  const legacy = { ...original, localizedMetadata: undefined };
  assert.equal(localizeBook(legacy, "ca").description, "Original synopsis");
  assert.equal(localizeBook(legacy, "ca").descriptionFallback, true);
  const partial = localizeBook({ ...original, localizedMetadata: { ca: { title: "Títol" } } }, "ca");
  assert.equal(partial.name, "Títol");
  assert.equal(partial.descriptionFallback, true);
});

test("manual text edits stay in their language and survive switching without relabelling a fallback", () => {
  const edited = updateBookMetadata(original, "description", "Editada", "es");
  assert.equal(localizeBook(edited, "es").description, "Editada");
  assert.equal(localizeBook(edited, "ca").description, "Sinopsi");
  assert.equal(edited.description, "Original synopsis");
  assert.equal(original.localizedMetadata.es.description, "Sinopsis");
  const cleared = updateBookMetadata(edited, "description", "", "ca");
  assert.equal(localizeBook(cleared, "ca").description, "");
  assert.equal(localizeBook(cleared, "ca").descriptionFallback, false);
  assert.equal(updateBookMetadata(original, "isbn", "456", "es").isbn, "456");
});

test("book controls and edition language names support all three system languages", () => {
  const keys = Object.keys(bookStrings("es")).sort();
  for (const language of ["es", "ca", "en"]) assert.deepEqual(Object.keys(bookStrings(language)).sort(), keys);
  assert.equal(bookStrings("cat").description, "Sinopsi");
  assert.equal(bookLanguageName("spa, cat, eng", "en"), "Spanish, Catalan, English");
});

test("book API sends the requested language and preserves nested translations in multipart edits", async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  globalThis.window = { location: { origin: "http://localhost:5173", hostname: "localhost" }, sessionStorage: { getItem: () => "test-pin" } };
  const requests = [];
  globalThis.fetch = async (url, options) => { requests.push({ url, options }); return { ok: true, text: async () => '{}' }; };
  try {
    const result = await build({ entryPoints: [new URL("../src/api/raspberryApi.js", import.meta.url).pathname], bundle: true, write: false,
      format: "esm", platform: "browser", define: { "import.meta.env": JSON.stringify({ VITE_RASPBERRY_API_BASE_URL: "http://raspberry:5050" }) } });
    const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
    await api.getBookMetadataDetails(original, { language: "ca" });
    assert.equal(new URL(requests[0].url).searchParams.get("language"), "ca");
    await api.saveBookMetadata(original);
    assert.deepEqual(JSON.parse(requests[1].options.body.get("localizedMetadata")), original.localizedMetadata);
    await api.saveBookMetadata({ ...original, isGraphicNovel: false });
    assert.equal(requests[2].options.body.get("isGraphicNovel"), "false");
    for (const value of [true, false, undefined]) {
      await api.saveBookCollectionMetadata({ collection: "The Boys", name: "Colección", isGraphicNovel: value });
      assert.equal(requests.at(-1).options.body.get("isGraphicNovel"), value === undefined ? null : String(value));
    }
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});
