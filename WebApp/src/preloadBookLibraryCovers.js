import { buildBookCollections } from './bookLibrary.js';
import { preloadLibraryCovers } from './preloadLibraryCovers.js';

export function bookCoverPreloadQueue(books, profiles, language, coverUrl) {
  const libraries = ['novel', 'graphic'].map(type =>
    buildBookCollections(books, profiles, language, { type }));
  // Give both tabs an initial screenful before warming deeper collections/volumes.
  const entries = [
    ...libraries.flatMap(groups => groups.slice(0, 12).map(group => group.coverBook)),
    ...libraries.flatMap(groups => groups.slice(12).map(group => group.coverBook)),
    ...libraries.flatMap(groups => groups.flatMap(group => group.books)),
  ];
  return [...new Map(entries.map(book => {
    const url = coverUrl(book);
    return [url, { url, name: `Libro: ${book.name}` }];
  }).filter(([url]) => url)).values()];
}

export async function preloadBookLibraryCovers(books, profiles, language, coverUrl, options = {}) {
  const queue = bookCoverPreloadQueue(books, profiles, language, coverUrl);
  // Small batches avoid the global preload deadline dropping the tail of a large library.
  // Only two requests at once leave capacity for browsing while warming in the background.
  for (let offset = 0; offset < queue.length && !options.signal?.aborted; offset += 12) {
    await preloadLibraryCovers(queue.slice(offset, offset + 12), {
      ...options, preserve: true, concurrency: 2, timeoutMs: 1500,
    });
  }
}
