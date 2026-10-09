import pulitzer from '../../DeviceApp/data/pulitzer_fiction.json';
import planeta from '../../DeviceApp/data/planeta_novel.json';
import { bookLanguage, isGraphicNovel } from './bookMetadata.js';

export const bookAwardCatalogs = { pulitzer, planeta };
const translations = {
  es: { view: 'Libros premiados', selector: 'Seleccionar premio', pulitzer: 'Pulitzer · Ficción', planeta: 'Planeta · Novela', pulitzerSubtitle: 'Las obras ganadoras del Pulitzer de Ficción, año a año. Novelas y libros de relatos desde 1948.', planetaSubtitle: 'Las novelas ganadoras del Premio Planeta desde 1952, presentadas inéditas y escritas en castellano.', year: 'Año del premio', previous: 'Libro anterior', next: 'Libro siguiente', timeline: 'Recorrer los libros premiados', collection: 'en tu biblioteca', open: 'Leer libro', upload: 'Cargar libro', source: 'Palmarés oficial', noAward: 'Años sin premio', shared: 'Premio compartido', loading: 'Buscando portada y sinopsis…', unavailable: 'No está en tu biblioteca', missingMetadata: 'Portada y sinopsis no disponibles.', retry: 'Reintentar', original: 'Título del palmarés', coverage: 'Ediciones incluidas' },
  ca: { view: 'Llibres premiats', selector: 'Seleccionar premi', pulitzer: 'Pulitzer · Ficció', planeta: 'Planeta · Novel·la', pulitzerSubtitle: 'Les obres guanyadores del Pulitzer de Ficció, any a any. Novel·les i llibres de relats des de 1948.', planetaSubtitle: 'Les novel·les guanyadores del Premi Planeta des de 1952, presentades inèdites i escrites en castellà.', year: 'Any del premi', previous: 'Llibre anterior', next: 'Llibre següent', timeline: 'Recórrer els llibres premiats', collection: 'a la teva biblioteca', open: 'Llegir llibre', upload: 'Carregar llibre', source: 'Palmarès oficial', noAward: 'Anys sense premi', shared: 'Premi compartit', loading: 'Cercant portada i sinopsi…', unavailable: 'No és a la teva biblioteca', missingMetadata: 'Portada i sinopsi no disponibles.', retry: 'Tornar-ho a provar', original: 'Títol del palmarès', coverage: 'Edicions incloses' },
  en: { view: 'Award-winning books', selector: 'Select award', pulitzer: 'Pulitzer · Fiction', planeta: 'Planeta · Novel', pulitzerSubtitle: 'Every Pulitzer Prize for Fiction winner, year by year. Novels and short-story collections since 1948.', planetaSubtitle: 'Every Premio Planeta winner since 1952, submitted as an unpublished novel written in Spanish.', year: 'Award year', previous: 'Previous book', next: 'Next book', timeline: 'Explore award-winning books', collection: 'in your library', open: 'Read book', upload: 'Upload book', source: 'Official winners', noAward: 'Years with no award', shared: 'Shared prize', loading: 'Finding cover and synopsis…', unavailable: 'Not in your library', missingMetadata: 'Cover and synopsis unavailable.', retry: 'Retry', original: 'Official award title', coverage: 'Included editions' },
};
export function bookAwardStrings(language = 'es') { return translations[bookLanguage(language)]; }
const normalize = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const titles = book => [book.title, book.originalTitle, book.name, ...(book.aliases || []), ...Object.values(book.localizedMetadata || {}).map(value => value.title)].filter(Boolean).map(normalize);

// Require both title and author when no shared work identity is available.
// Never identify an award by author alone or treat graphic adaptations as winners.
export function matchesAwardBook(winner, book) {
  if (isGraphicNovel(book)) return false;
  const original = book.originalMetadata || book;
  if (winner.openLibraryKey && original.openLibraryKey) return winner.openLibraryKey === original.openLibraryKey;
  const authors = [winner.author, ...(winner.authorAliases || [])].map(normalize);
  return authors.includes(normalize(original.author)) && titles(winner).some(title => titles(original).includes(title));
}
export function matchAwardBooks(winners, books = []) {
  return winners.map(winner => ({ ...winner, book: books.find(book => book.relativePath && matchesAwardBook(winner, book)) || null }));
}
export function bookAwardSelectionIndex(winners, key) {
  const index = winners.findIndex(winner => winner.key === key);
  return index < 0 ? winners.length - 1 : index;
}
