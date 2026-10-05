export function epubPagination(epub) {
  const pages = epub.pageList?.pageList || [];
  // Count distinct page targets, including Roman-numbered front matter. The last
  // numeric label (and epub.js totalPages) is not a count of the book's pages.
  const targets = new Set(pages.map(page => page.href).filter(Boolean));
  if (targets.size) return { pageCount: String(targets.size), pageCountSource: "epub-page-list" };

  const spine = epub.packaging?.spine || [];
  const defaultLayout = epub.packaging?.metadata?.layout;
  const fixed = spine.length && spine.every(item => {
    const properties = item.properties || [];
    if (properties.includes("rendition:layout-reflowable")) return false;
    return properties.includes("rendition:layout-pre-paginated") || defaultLayout === "pre-paginated";
  });
  return fixed ? { pageCount: String(spine.length), pageCountSource: "epub-fixed" } : {};
}
