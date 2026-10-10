const strings = {
  es: { search: 'Buscar torrent', title: 'Ficha del libro · Open Library', close: 'Cerrar', loading: 'Buscando la ficha en castellano…', lookup: 'Buscar ficha', query: 'Título o autor', choose: 'Seleccionar esta edición', spanishTitle: 'Título en castellano', confirm: 'Buscar torrents de este libro', missing: 'No hemos podido identificar una edición en castellano. Busca y selecciona su ficha; puedes indicar el título español antes de buscar torrents.', hint: 'Búsqueda por el título en castellano. Revisa el nombre y el idioma del resultado. Se importa un EPUB o PDF; los libros que ya tienes se conservan.', empty: 'No se han encontrado libros. Prueba con otra forma del título en castellano.', importing: 'Añadiendo libro', book: 'Libro', original: 'Título del palmarés', source: 'Ver ficha en Open Library', retry: 'Reintentar', demo: 'Conecta con la Raspberry para consultar Open Library y buscar torrents.', noSynopsis: 'Esta ficha no tiene sinopsis disponible.', change: 'Cambiar ficha' },
  ca: { search: 'Cerca torrent', title: 'Fitxa del llibre · Open Library', close: 'Tanca', loading: 'Cercant la fitxa en castellà…', lookup: 'Cerca fitxa', query: 'Títol o autor', choose: 'Selecciona aquesta edició', spanishTitle: 'Títol en castellà', confirm: 'Cerca torrents d’aquest llibre', missing: 'No hem pogut identificar una edició en castellà. Cerca i selecciona la fitxa; pots indicar el títol espanyol abans de cercar torrents.', hint: 'Cerca pel títol en castellà. Revisa el nom i l’idioma del resultat. S’importa un EPUB o PDF; es conserven els llibres que ja tens.', empty: 'No s’han trobat llibres. Prova una altra forma del títol en castellà.', importing: 'Afegint llibre', book: 'Llibre', original: 'Títol del palmarès', source: 'Veure fitxa a Open Library', retry: 'Torna-ho a provar', demo: 'Connecta amb la Raspberry per consultar Open Library i cercar torrents.', noSynopsis: 'Aquesta fitxa no té sinopsi disponible.', change: 'Canvia la fitxa' },
  en: { search: 'Search torrent', title: 'Book details · Open Library', close: 'Close', loading: 'Finding the Spanish edition…', lookup: 'Find book details', query: 'Title or author', choose: 'Select this edition', spanishTitle: 'Spanish title', confirm: 'Search torrents for this book', missing: 'We could not identify a Spanish edition. Find and select its record; you can enter the Spanish title before searching torrents.', hint: 'Search using the Spanish title. Check the result’s name and language. One EPUB or PDF is imported; books you already have are kept.', empty: 'No books found. Try another spelling of the Spanish title.', importing: 'Adding book', book: 'Book', original: 'Official award title', source: 'View on Open Library', retry: 'Retry', demo: 'Connect to the Raspberry to look up Open Library and search torrents.', noSynopsis: 'No synopsis is available for this edition.', change: 'Change book details' },
};
export function bookTorrentStrings(language = 'es') { return strings[String(language).slice(0, 2)] || strings.es; }

// Never relabel an untranslated title as Spanish or use a publication year as part of the search.
export function spanishBookTitle(book) {
  if (book?.localizedMetadata?.es?.title) return book.localizedMetadata.es.title.trim();
  if (String(book?.language || '').split(',').some(code => ['spa', 'es', 'es-ES'].includes(code.trim()))) return String(book.title || book.name || '').trim();
  return '';
}

// The award's original title is safe as a Spanish fallback only for Premio Planeta.
export function awardTorrentBook(winner, metadata = winner.metadata) {
  const book = metadata?.originalMetadata || metadata || {};
  const title = spanishBookTitle(book) || (winner.award === 'planeta' ? String(winner.title || '').trim() : '');
  return title ? { ...book, author: book.author || winner.author, title, name: title, spanishTitle: title } : null;
}
