import { test } from "node:test";
import assert from "node:assert/strict";
import { epubPagination } from "../src/epubMetadata.js";

test("EPUB page references include Roman front matter and deduplicate targets", () => {
  assert.deepEqual(epubPagination({ pageList: { totalPages: 99, pageList: [
    { href: "preface.xhtml#i", page: NaN }, { href: "preface.xhtml#ii", page: NaN },
    { href: "text.xhtml#p1", page: 1 }, { href: "text.xhtml#p100", page: 100 },
    { href: "text.xhtml#p100", page: 100 }, { href: "" },
  ] } }), { pageCount: "4", pageCountSource: "epub-page-list" });
});

test("fixed-layout EPUB counts spine pages, while reflowable chapters are not pages", () => {
  const fixed = { packaging: { metadata: { layout: "pre-paginated" }, spine: [{ properties: [] }, { properties: [] }] } };
  assert.deepEqual(epubPagination(fixed), { pageCount: "2", pageCountSource: "epub-fixed" });
  fixed.packaging.spine[1].properties = ["rendition:layout-reflowable"];
  assert.deepEqual(epubPagination(fixed), {});
  assert.deepEqual(epubPagination({ packaging: { spine: [{ properties: [] }, { properties: [] }] } }), {});
  assert.deepEqual(epubPagination({ packaging: { spine: [{ properties: ["rendition:layout-pre-paginated"] }] } }), { pageCount: "1", pageCountSource: "epub-fixed" });
  assert.deepEqual(epubPagination({}), {});
});
