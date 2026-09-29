import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { buildBookCollections } from "../src/bookLibrary.js";

const volume = (number, overrides = {}) => ({
  name: `The Boys ${number}`, file: `The Boys ${number}.cbz`, collection: "The Boys",
  relativePath: `Books/The Boys/The Boys ${number}.cbz`, format: "cbz", ...overrides,
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
