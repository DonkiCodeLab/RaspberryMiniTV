export function buildBookCollections(books = [], profiles = {}, language = "es") {
  const groups = new Map();
  const compare = (left, right) => String(left).localeCompare(String(right), language, { sensitivity: "base", numeric: true });

  // Use file order so editing a title never changes which volume represents a collection.
  [...books].sort((left, right) => compare(left.file || left.relativePath, right.file || right.relativePath)).forEach((book) => {
    const key = book.collection || `__book__${book.relativePath}`;
    if (!groups.has(key)) {
      const profile = book.collection ? profiles[key] : null;
      const label = profile?.name || book.collection || book.name;
      groups.set(key, {
        key,
        label,
        isCollection: Boolean(book.collection),
        coverUrl: profile?.coverUrl || "",
        coverBook: { ...book, name: label, coverUrl: profile?.coverUrl || book.coverUrl || "" },
        books: [],
      });
    }
    groups.get(key).books.push(book);
  });

  return [...groups.values()].sort((left, right) => compare(left.label, right.label));
}
