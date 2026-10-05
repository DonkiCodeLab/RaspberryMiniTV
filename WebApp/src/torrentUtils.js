export function torrentQuery(movie) {
  return [movie?.originalName || movie?.name, movie?.releaseDate?.slice(0, 4)].filter(Boolean).join(" ");
}

export function torrentSize(bytes, language = "es") {
  return `${(Math.max(0, Number(bytes) || 0) / 1_000_000).toLocaleString(language, { maximumFractionDigits: 1 })} MB`;
}

export function sortTorrents(results) {
  return [...(results || [])].sort((a, b) => (Number(b.seeds) || 0) - (Number(a.seeds) || 0) || a.name.localeCompare(b.name));
}

export function torrentLibraryVersion(jobs) {
  return jobs.filter(job => job.item).map(job => `${job.id}:${job.state === "complete" ? "ready" : "imported"}`).sort().join("|");
}

export function hasTorrentLibraryUpdates(previousVersion, nextVersion) {
  const previous = new Set(previousVersion.split("|"));
  return nextVersion.split("|").some(entry => entry && !previous.has(entry));
}

export function isTorrentHistory(job) {
  return ["complete", "cancelled"].includes(job.state);
}

const strings = {
  es: {
    title: "Descargas torrent", searchTitle: "Torrents en The Pirate Bay", search: "Buscar torrents", searching: "Buscando torrents…",
    hint: "Ordenados por seeds. Se descarga el vídeo principal y, al finalizar, se añade a la biblioteca y se preparan los recursos de TMDB.",
    empty: "No se han encontrado películas. Prueba con otro título o sin el año.", noJobs: "No hay descargas torrent.",
    name: "Torrent", size: "Tamaño", download: "Descargar", starting: "Iniciando…", started: "Descarga añadida. Puedes seguirla en el dashboard y cerrar esta ventana.",
    dashboard: "Ver descargas", refresh: "Actualizar", pause: "Pausar", resume: "Reanudar", cancel: "Cancelar descarga", retry: "Reintentar",
    active: "En curso", history: "Historial", list: "Lista de descargas e historial", remove: "Quitar del historial",
    alreadyDownloaded: "Esta película ya está descargada", overwrite: "Sobrescribir",
    overwriteCopy: "¿Quieres sobrescribirla o cancelar la descarga? La película actual se conservará hasta que termine la nueva descarga.",
    historyHint: "Las descargas finalizadas se conservan aquí. Quitarlas del historial no borra las películas.",
    queued: "En cola / buscando peers", downloading: "Descargando", paused: "En pausa", importing: "Añadiendo vídeo",
    metadata: "Preparando recursos de TMDB", complete: "Lista en la biblioteca", failed: "Error", cancelled: "Cancelada",
    demo: "Las descargas están disponibles al conectar con la Raspberry.", pending: "Esperando datos de la Raspberry…", remaining: "restantes",
  },
  ca: {
    title: "Descàrregues torrent", searchTitle: "Torrents a The Pirate Bay", search: "Cerca torrents", searching: "Cercant torrents…",
    hint: "Ordenats per seeds. Es descarrega el vídeo principal i, en acabar, s’afegeix a la biblioteca i es preparen els recursos de TMDB.",
    empty: "No s’han trobat pel·lícules. Prova un altre títol o sense l’any.", noJobs: "No hi ha descàrregues torrent.",
    name: "Torrent", size: "Mida", download: "Descarrega", starting: "Iniciant…", started: "Descàrrega afegida. Pots seguir-la al dashboard i tancar aquesta finestra.",
    dashboard: "Veure descàrregues", refresh: "Actualitza", pause: "Pausa", resume: "Reprèn", cancel: "Cancel·la la descàrrega", retry: "Torna-ho a provar",
    active: "En curs", history: "Historial", list: "Llista de descàrregues i historial", remove: "Treu de l’historial",
    alreadyDownloaded: "Aquesta pel·lícula ja està descarregada", overwrite: "Sobreescriu",
    overwriteCopy: "Vols sobreescriure-la o cancel·lar la descàrrega? La pel·lícula actual es conservarà fins que acabi la nova descàrrega.",
    historyHint: "Les descàrregues finalitzades es conserven aquí. Treure-les de l’historial no esborra les pel·lícules.",
    queued: "En cua / cercant peers", downloading: "Descarregant", paused: "En pausa", importing: "Afegint vídeo",
    metadata: "Preparant recursos de TMDB", complete: "A punt a la biblioteca", failed: "Error", cancelled: "Cancel·lada",
    demo: "Les descàrregues estan disponibles en connectar amb la Raspberry.", pending: "Esperant dades de la Raspberry…", remaining: "restants",
  },
  en: {
    title: "Torrent downloads", searchTitle: "Torrents on The Pirate Bay", search: "Search torrents", searching: "Searching torrents…",
    hint: "Sorted by seeds. The main video downloads first, then it is added to the library and TMDB resources are prepared.",
    empty: "No movies found. Try another title or remove the year.", noJobs: "No torrent downloads.",
    name: "Torrent", size: "Size", download: "Download", starting: "Starting…", started: "Download added. Follow it on the dashboard; you can close this window.",
    dashboard: "View downloads", refresh: "Refresh", pause: "Pause", resume: "Resume", cancel: "Cancel download", retry: "Retry",
    active: "In progress", history: "History", list: "Downloads and history list", remove: "Remove from history",
    alreadyDownloaded: "This movie is already downloaded", overwrite: "Overwrite",
    overwriteCopy: "Overwrite it or cancel the download? The current movie will be kept until the new download finishes.",
    historyHint: "Finished downloads stay here. Removing them from history does not delete the movies.",
    queued: "Queued / finding peers", downloading: "Downloading", paused: "Paused", importing: "Adding video",
    metadata: "Preparing TMDB resources", complete: "Ready in the library", failed: "Error", cancelled: "Cancelled",
    demo: "Connect to the Raspberry to download torrents.", pending: "Waiting for the Raspberry…", remaining: "remaining",
  },
};

export function torrentStrings(language) {
  return strings[String(language).slice(0, 2)] || strings.en;
}
