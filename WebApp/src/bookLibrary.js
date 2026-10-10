import { isGraphicNovel, localizeBook } from "./bookMetadata.js";
import { compareLibraryItems } from "./libraryScroll.js";

export function buildBookCollections(books = [], profiles = {}, language = "es", { type, sort = "name", direction = sort === "year" ? "desc" : "asc" } = {}) {
  const groups = new Map();
  const compare = (left, right) => String(left).localeCompare(String(right), language, { sensitivity: "base", numeric: true });
  const year = book => Number(String(book.year || "").match(/\b\d{4}\b/)?.[0]) || 0;
  const compareBooks = (left, right) => compareLibraryItems(left, right, sort, direction, language);

  // Use file order so editing a title never changes which volume represents a collection.
  books.filter(book => !type || isGraphicNovel(book) === (type === "graphic"))
    .map(book => localizeBook(book, language)).sort((left, right) => compare(left.file || left.relativePath, right.file || right.relativePath)).forEach((book) => {
    const key = book.collection || `__book__${book.relativePath}`;
    if (!groups.has(key)) {
      const profile = book.collection ? profiles[key] : null;
      const label = profile?.name || book.collection || book.name;
      groups.set(key, {
        key,
        label,
        isCollection: Boolean(book.collection),
        author: String(profile?.author || "").trim(),
        coverUrl: profile?.coverUrl || "",
        coverBook: { ...book, name: label, coverUrl: profile?.coverUrl || book.coverUrl || "" },
        books: [],
      });
    }
    groups.get(key).books.push(book);
  });

  const collections = [...groups.values()].map(group => {
    const years = group.books.map(year).filter(Boolean);
    // A collection's publication year is the earliest known year of its visible volumes.
    const author = group.author || [...new Set(group.books.map(book => String(book.author || "").trim()).filter(Boolean))].sort(compare).join(", ");
    return { ...group, author, year: years.length ? Math.min(...years) : 0, books: group.books.sort(compareBooks) };
  });
  return collections.sort((left, right) => compareLibraryItems(left, right, sort, direction, language));
}

export function matchesBookQuery(book, query, collectionTitle = "") {
  const normalize = value => String(value || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const year = String(book.year || "").match(/\b\d{4}\b/)?.[0] || "";
  const text = normalize([collectionTitle, book.name, book.title, book.subtitle, book.author, year].filter(Boolean).join(" "));
  return words.every(word => text.includes(word));
}
