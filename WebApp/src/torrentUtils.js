export function torrentQuery(media, mediaType = "movies") {
  if (mediaType === "books") return [media?.spanishTitle || media?.name, 'español'].filter(Boolean).join(' ');
  return [(mediaType === "movies" && media?.englishName) || media?.originalName || media?.name, mediaType === "movies" ? media?.releaseDate?.slice(0, 4) : null].filter(Boolean).join(" ");
}

export function mergeTorrentResults(previous, next) {
  const rows = new Map();
  for (const row of [...previous, ...next]) {
    const old = rows.get(row.infoHash);
    rows.set(row.infoHash, old ? {
      ...(Number(row.seeds) > Number(old.seeds) ? row : old),
      sources: [...new Set([...torrentSources(old), ...torrentSources(row)])],
    } : row);
  }
  return sortTorrents([...rows.values()]);
}

export function torrentJobTitle(job) {
  return job.book?.name || job.series?.name || job.movie?.name || job.name;
}

export function torrentSize(bytes, language = "es") {
  return `${(Math.max(0, Number(bytes) || 0) / 1_000_000).toLocaleString(language, { maximumFractionDigits: 1 })} MB`;
}

export function torrentListSize(bytes) {
  const megabytes = Math.round(Math.max(0, Number(bytes) || 0) / 1_000_000);
  return `${String(megabytes).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} MB`;
}

export function sortTorrents(results, field = "seeds", direction = "desc") {
  const key = field === "sizeBytes" ? "sizeBytes" : "seeds";
  const multiplier = direction === "asc" ? 1 : -1;
  return [...(results || [])].sort((a, b) => multiplier * ((Number(a[key]) || 0) - (Number(b[key]) || 0)) || a.name.localeCompare(b.name));
}

export function torrentSources(torrent) {
  const sources = Array.isArray(torrent?.sources) ? torrent.sources.filter(source => typeof source === "string" && source.trim()).map(source => source.trim()) : [];
  // Responses and saved jobs from before multi-source search came from The Pirate Bay.
  return sources.length ? [...new Set(sources)] : ["The Pirate Bay"];
}

export function torrentLibraryVersion(jobs) {
  return jobs.filter(job => job.item).map(job => `${job.id}:${job.state === "complete" ? "ready" : "imported"}`).sort().join("|");
}

export function hasTorrentLibraryUpdates(previousVersion, nextVersion) {
  // The first snapshot establishes the baseline; history is already in getVideos.
  if (previousVersion === null) return false;
  const previous = new Set(previousVersion.split("|"));
  return nextVersion.split("|").some(entry => entry && !previous.has(entry));
}

export function isTorrentHistory(job) {
  return ["complete", "cancelled"].includes(job.state);
}

const strings = {
  es: {
    warning: "Aviso", downloadAnyway: "Descargar igualmente",
    combinedEpisodesWarning: "El nombre de algún vídeo indica varios capítulos unidos. Puedes descargarlo igualmente; esos capítulos abrirán el mismo vídeo completo.",
    combinedEpisodesAccepted: "Has permitido los capítulos unidos. Los capítulos que compartan vídeo abrirán el archivo completo, sin separarlo.",
    notify: "Avisarme al terminar", stopNotifying: "Dejar de avisar", notificationReady: "Descarga terminada · aviso activado",
    stopNotifyingAll: "Dejar de avisar en todas", stopNotifyingAllTitle: "Desactivar avisos del historial",
    stopNotifyingAllCopy: "¿Quieres desactivar los avisos de todas las descargas del historial que los tienen activados en tu perfil?", cancelNotificationChanges: "Cancelar",
    openSeries: "Ir a la ficha", seriesMissing: "Serie fuera del catálogo",
    openMovie: "Ir a la ficha", openingMovie: "Comprobando catálogo…", close: "Cerrar",
    movieMissing: "Película fuera del catálogo", movieMissingCopy: "«{name}» se descargó, pero ya no está en el catálogo. La descarga sigue guardada en el historial.",
    movieLookupFailed: "No se pudo comprobar el catálogo", movieLookupFailedCopy: "Comprueba la conexión con la Raspberry y vuelve a pulsar «Ir a la ficha».",
    notificationsHint: "Activa el aviso en las descargas que te interesan. Al terminar aparecerá un contador en la campanita junto a Fotos hasta que desactives el aviso aquí.",
    notificationOne: "1 descarga terminada. Ver descargas", notificationMany: "{count} descargas terminadas. Ver descargas",
    notificationsTitle: "Descargas terminadas", noNotifications: "No tienes avisos de descargas terminadas.", viewDownloads: "Ver descargas",
    artworkWarning: "El contenido está en la biblioteca, pero faltan algunos recursos de TMDB.",
    title: "Descargas torrent", searchTitle: "Buscar torrents", search: "Buscar torrents", searching: "Buscando torrents…",
    source: "Fuente", sourcesSearched: "Fuentes consultadas", sourcesUnavailable: "No han respondido estas fuentes; los resultados pueden estar incompletos:",
    seriesHint: "Busca capítulos o packs. Se importan los vídeos identificados por temporada y capítulo; los capítulos que ya tienes se conservan.",
    seriesEmpty: "No hay coincidencias en los resultados consultados. Prueba otra búsqueda o carga más resultados de EZTV.",
    season: "Temporada", episode: "Capítulo", all: "Todos", moreEztv: "Más resultados de EZTV", eztvMissing: "EZTV no está disponible para esta serie porque su ficha no tiene identificador IMDb.",
    eztvHint: "EZTV busca la serie seleccionada y aplica los filtros de temporada y capítulo.",
    episodesImported: "Capítulos añadidos", episodesSkipped: "Capítulos que ya estaban en la biblioteca", movie: "Película", series: "Serie",
    hint: "Se descarga el vídeo principal y, al finalizar, se añade a la biblioteca y se preparan los recursos de TMDB.",
    empty: "No se han encontrado películas. Prueba con otro título o sin el año.", noJobs: "No hay descargas torrent.",
    sortBy: "Ordenar por", sortDirection: "Orden", ascending: "De menor a mayor", descending: "De mayor a menor",
    name: "Torrent", size: "Tamaño", download: "Descargar", starting: "Iniciando…", started: "Descarga añadida. Puedes seguirla en el dashboard y cerrar esta ventana.",
    dashboard: "Ver descargas", refresh: "Actualizar", pause: "Pausar", resume: "Reanudar", cancel: "Cancelar descarga", retry: "Reintentar",
    active: "En curso", history: "Historial", list: "Lista de descargas e historial", remove: "Quitar del historial",
    alreadyDownloaded: "Esta película ya está descargada", overwrite: "Sobrescribir",
    overwriteCopy: "¿Quieres sobrescribirla o cancelar la descarga? La película actual se conservará hasta que termine la nueva descarga.",
    historyHint: "Las descargas finalizadas se conservan aquí. Quitarlas del historial no borra los vídeos.",
    queued: "En cola / buscando peers", downloading: "Descargando", paused: "En pausa", importing: "Añadiendo vídeo",
    metadata: "Preparando recursos de TMDB", complete: "Lista en la biblioteca", failed: "Error", cancelled: "Cancelada",
    demo: "Las descargas están disponibles al conectar con la Raspberry.", pending: "Esperando datos de la Raspberry…", remaining: "restantes",
  },
  ca: {
    warning: "Avís", downloadAnyway: "Descarrega igualment",
    combinedEpisodesWarning: "El nom d’algun vídeo indica diversos capítols units. Pots descarregar-lo igualment; aquests capítols obriran el mateix vídeo complet.",
    combinedEpisodesAccepted: "Has permès els capítols units. Els capítols que comparteixin vídeo obriran l’arxiu complet, sense separar-lo.",
    notify: "Avisa’m en acabar", stopNotifying: "Deixa d’avisar", notificationReady: "Descàrrega acabada · avís activat",
    stopNotifyingAll: "Deixa d’avisar de totes", stopNotifyingAllTitle: "Desactiva els avisos de l’historial",
    stopNotifyingAllCopy: "Vols desactivar els avisos de totes les descàrregues de l’historial que els tenen activats al teu perfil?", cancelNotificationChanges: "Cancel·la",
    openSeries: "Anar a la fitxa", seriesMissing: "Sèrie fora del catàleg",
    openMovie: "Anar a la fitxa", openingMovie: "Comprovant el catàleg…", close: "Tanca",
    movieMissing: "Pel·lícula fora del catàleg", movieMissingCopy: "«{name}» es va descarregar, però ja no és al catàleg. La descàrrega continua desada a l’historial.",
    movieLookupFailed: "No s’ha pogut comprovar el catàleg", movieLookupFailedCopy: "Comprova la connexió amb la Raspberry i torna a prémer «Anar a la fitxa».",
    notificationsHint: "Activa l’avís a les descàrregues que t’interessen. En acabar apareixerà un comptador a la campaneta al costat de Fotos fins que desactivis l’avís aquí.",
    notificationOne: "1 descàrrega acabada. Veure descàrregues", notificationMany: "{count} descàrregues acabades. Veure descàrregues",
    notificationsTitle: "Descàrregues acabades", noNotifications: "No tens avisos de descàrregues acabades.", viewDownloads: "Veure descàrregues",
    artworkWarning: "El contingut és a la biblioteca, però falten alguns recursos de TMDB.",
    title: "Descàrregues torrent", searchTitle: "Cerca torrents", search: "Cerca torrents", searching: "Cercant torrents…",
    source: "Font", sourcesSearched: "Fonts consultades", sourcesUnavailable: "Aquestes fonts no han respost; els resultats poden ser incomplets:",
    seriesHint: "Cerca capítols o packs. S’importen els vídeos identificats per temporada i capítol; els capítols que ja tens es conserven.",
    seriesEmpty: "No hi ha coincidències en els resultats consultats. Prova una altra cerca o carrega més resultats d’EZTV.",
    season: "Temporada", episode: "Capítol", all: "Tots", moreEztv: "Més resultats d’EZTV", eztvMissing: "EZTV no està disponible per a aquesta sèrie perquè la fitxa no té identificador IMDb.",
    eztvHint: "EZTV cerca la sèrie seleccionada i aplica els filtres de temporada i capítol.",
    episodesImported: "Capítols afegits", episodesSkipped: "Capítols que ja eren a la biblioteca", movie: "Pel·lícula", series: "Sèrie",
    hint: "Es descarrega el vídeo principal i, en acabar, s’afegeix a la biblioteca i es preparen els recursos de TMDB.",
    empty: "No s’han trobat pel·lícules. Prova un altre títol o sense l’any.", noJobs: "No hi ha descàrregues torrent.",
    sortBy: "Ordena per", sortDirection: "Ordre", ascending: "De menor a major", descending: "De major a menor",
    name: "Torrent", size: "Mida", download: "Descarrega", starting: "Iniciant…", started: "Descàrrega afegida. Pots seguir-la al dashboard i tancar aquesta finestra.",
    dashboard: "Veure descàrregues", refresh: "Actualitza", pause: "Pausa", resume: "Reprèn", cancel: "Cancel·la la descàrrega", retry: "Torna-ho a provar",
    active: "En curs", history: "Historial", list: "Llista de descàrregues i historial", remove: "Treu de l’historial",
    alreadyDownloaded: "Aquesta pel·lícula ja està descarregada", overwrite: "Sobreescriu",
    overwriteCopy: "Vols sobreescriure-la o cancel·lar la descàrrega? La pel·lícula actual es conservarà fins que acabi la nova descàrrega.",
    historyHint: "Les descàrregues finalitzades es conserven aquí. Treure-les de l’historial no esborra els vídeos.",
    queued: "En cua / cercant peers", downloading: "Descarregant", paused: "En pausa", importing: "Afegint vídeo",
    metadata: "Preparant recursos de TMDB", complete: "A punt a la biblioteca", failed: "Error", cancelled: "Cancel·lada",
    demo: "Les descàrregues estan disponibles en connectar amb la Raspberry.", pending: "Esperant dades de la Raspberry…", remaining: "restants",
  },
  en: {
    warning: "Warning", downloadAnyway: "Download anyway",
    combinedEpisodesWarning: "A video filename indicates multiple episodes joined together. You can download it anyway; those episodes will open the same full video.",
    combinedEpisodesAccepted: "You have allowed combined episodes. Episodes that share a video will open the full file, without splitting it.",
    notify: "Notify me when finished", stopNotifying: "Turn off notification", notificationReady: "Download finished · notification enabled",
    stopNotifyingAll: "Turn off all notifications", stopNotifyingAllTitle: "Turn off history notifications",
    stopNotifyingAllCopy: "Turn off notifications for all downloads in your history that have them enabled for your profile?", cancelNotificationChanges: "Cancel",
    openSeries: "Open series details", seriesMissing: "Series no longer in the catalog",
    openMovie: "Open movie details", openingMovie: "Checking catalog…", close: "Close",
    movieMissing: "Movie no longer in the catalog", movieMissingCopy: "“{name}” was downloaded, but is no longer in the catalog. The download remains in your history.",
    movieLookupFailed: "Could not check the catalog", movieLookupFailedCopy: "Check the connection to your Raspberry and try opening the details again.",
    notificationsHint: "Enable notifications for the downloads you’re interested in. When they finish, a count will appear on the bell next to Pictures until you turn off the notification here.",
    notificationOne: "1 download finished. View downloads", notificationMany: "{count} downloads finished. View downloads",
    notificationsTitle: "Completed downloads", noNotifications: "You have no completed download notifications.", viewDownloads: "View downloads",
    artworkWarning: "The content is in the library, but some TMDB resources are missing.",
    title: "Torrent downloads", searchTitle: "Search torrents", search: "Search torrents", searching: "Searching torrents…",
    source: "Source", sourcesSearched: "Sources searched", sourcesUnavailable: "These sources did not respond; results may be incomplete:",
    seriesHint: "Search for episodes or packs. Videos identified by season and episode are imported; episodes you already have are kept.",
    seriesEmpty: "No matches in the results searched. Try another query or load more EZTV results.",
    season: "Season", episode: "Episode", all: "All", moreEztv: "More EZTV results", eztvMissing: "EZTV is unavailable for this series because its profile has no IMDb identifier.",
    eztvHint: "EZTV searches the selected series using the season and episode filters.",
    episodesImported: "Episodes added", episodesSkipped: "Episodes already in the library", movie: "Movie", series: "Series",
    hint: "The main video downloads first, then it is added to the library and TMDB resources are prepared.",
    empty: "No movies found. Try another title or remove the year.", noJobs: "No torrent downloads.",
    sortBy: "Sort by", sortDirection: "Order", ascending: "Lowest to highest", descending: "Highest to lowest",
    name: "Torrent", size: "Size", download: "Download", starting: "Starting…", started: "Download added. Follow it on the dashboard; you can close this window.",
    dashboard: "View downloads", refresh: "Refresh", pause: "Pause", resume: "Resume", cancel: "Cancel download", retry: "Retry",
    active: "In progress", history: "History", list: "Downloads and history list", remove: "Remove from history",
    alreadyDownloaded: "This movie is already downloaded", overwrite: "Overwrite",
    overwriteCopy: "Overwrite it or cancel the download? The current movie will be kept until the new download finishes.",
    historyHint: "Finished downloads stay here. Removing them from history does not delete the videos.",
    queued: "Queued / finding peers", downloading: "Downloading", paused: "Paused", importing: "Adding video",
    metadata: "Preparing TMDB resources", complete: "Ready in the library", failed: "Error", cancelled: "Cancelled",
    demo: "Connect to the Raspberry to download torrents.", pending: "Waiting for the Raspberry…", remaining: "remaining",
  },
};

export function torrentStrings(language) {
  return strings[String(language).slice(0, 2)] || strings.en;
}
