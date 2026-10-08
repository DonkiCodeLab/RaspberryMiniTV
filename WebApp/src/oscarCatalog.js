// Match by TMDB identity and an actual library file, never by a translated title.
export function matchOscarMovies(winners, movies) {
  const downloaded = new Map();
  for (const movie of movies) {
    if (movie.tmdbId && movie.fileRelativePath && !downloaded.has(Number(movie.tmdbId))) {
      downloaded.set(Number(movie.tmdbId), movie);
    }
  }
  return winners.map(winner => ({ ...winner, movie: downloaded.get(Number(winner.tmdbId)) || null }));
}

export function oscarSelectionIndex(winners, edition) {
  const index = winners.findIndex(winner => (winner.key ?? winner.edition) === edition);
  return index < 0 ? Math.max(0, winners.length - 1) : index;
}

export const oscarStrings = {
  es: {
    view: 'Vista Óscar', title: 'Una historia de cine', eyebrow: 'LA COLECCIÓN ÓSCAR',
    subtitle: 'Todas las ganadoras a mejor película. Un viaje, año a año.',
    award: 'MEJOR PELÍCULA', ceremony: 'Ceremonia', edition: 'Edición', available: 'En tu biblioteca',
    unavailable: 'No descargada', open: 'Abrir película', upload: 'Cargar película', searchTorrent: 'Buscar torrent', previous: 'Edición anterior', next: 'Edición siguiente',
    timeline: 'Recorrer las ediciones de los Óscar', permanent: 'Las películas se van. Su historia se queda.',
    saved: 'Las fichas y sus imágenes se conservan aunque borres la película.',
    preparing: 'Guardando fichas e imágenes', preparingCovers: 'Preparando portadas', images: 'imágenes', retry: 'Reintentar', failed: 'Hay imágenes pendientes de preparar.',
    loading: 'Leyendo la colección…', connection: 'No se pudo cargar la colección.',
    preview: 'Conecta con la Raspberry para guardar las fichas y portadas de esta colección.',
    source: 'Palmarés de la Academia', collection: 'descargadas', poster: 'Portada de',
  },
  ca: {
    view: 'Vista Òscar', title: 'Una història de cinema', eyebrow: 'LA COL·LECCIÓ ÒSCAR',
    subtitle: 'Totes les guanyadores a millor pel·lícula. Un viatge, any a any.',
    award: 'MILLOR PEL·LÍCULA', ceremony: 'Cerimònia', edition: 'Edició', available: 'A la teva biblioteca',
    unavailable: 'No descarregada', open: 'Obrir pel·lícula', upload: 'Carregar pel·lícula', searchTorrent: 'Cercar torrent', previous: 'Edició anterior', next: 'Edició següent',
    timeline: 'Recórrer les edicions dels Òscar', permanent: 'Les pel·lícules se’n van. La seva història es queda.',
    saved: 'Les fitxes i les imatges es conserven encara que esborris la pel·lícula.',
    preparing: 'Desant fitxes i imatges', preparingCovers: 'Preparant portades', images: 'imatges', retry: 'Torna-ho a provar', failed: 'Hi ha imatges pendents de preparar.',
    loading: 'Llegint la col·lecció…', connection: 'No s’ha pogut carregar la col·lecció.',
    preview: 'Connecta amb la Raspberry per desar les fitxes i portades d’aquesta col·lecció.',
    source: 'Palmarès de l’Acadèmia', collection: 'descarregades', poster: 'Portada de',
  },
  en: {
    view: 'Oscars view', title: 'A history of cinema', eyebrow: 'THE OSCARS COLLECTION',
    subtitle: 'Every Best Picture winner. A journey through the years.',
    award: 'BEST PICTURE', ceremony: 'Ceremony', edition: 'Edition', available: 'In your library',
    unavailable: 'Not downloaded', open: 'Open movie', upload: 'Upload movie', searchTorrent: 'Search torrents', previous: 'Previous edition', next: 'Next edition',
    timeline: 'Explore the Academy Awards editions', permanent: 'Movies come and go. Their story stays.',
    saved: 'Details and artwork are kept even when you delete the movie.',
    preparing: 'Saving details and artwork', preparingCovers: 'Preparing posters', images: 'images', retry: 'Retry', failed: 'Some artwork still needs to be prepared.',
    loading: 'Reading the collection…', connection: 'Could not load the collection.',
    preview: 'Connect to the Raspberry to save this collection’s details and artwork.',
    source: 'Academy winners', collection: 'downloaded', poster: 'Poster for',
  },
};
