const languageKey = language => {
  const key = String(language || "").trim().toLowerCase().split(/[-_]/)[0];
  return key === "cat" ? "ca" : key;
};
const count = (value, language) => new Intl.NumberFormat({ es: "es-ES", ca: "ca-ES", en: "en-GB" }[language] || "es-ES").format(value);

const strings = {
  es: {
    title: "Actualizar fichas existentes",
    hint: "Consulta las puntuaciones de las películas y series que ya tienes. Solo se consultan las que faltan o han caducado; se reutilizan las puntuaciones guardadas que siguen vigentes.",
    start: "Actualizar fichas", resume: "Continuar actualización", pause: "Pausar", loading: "Cargando estado…", retry: "Reintentar",
    refresh: "Actualizar estado", continues: "La actualización sigue en la Raspberry aunque cierres esta página.",
    empty: "Todavía no hay películas ni series para actualizar.", unidentified: "Las fichas existentes necesitan un identificador de TMDB o IMDb para consultar sus puntuaciones.", configuredMissing: "Guarda una clave de OMDb para actualizar las fichas.",
    progress: (processed, total) => `${count(processed, "es")} de ${count(total, "es")} fichas revisadas`,
    inventory: (ready, total) => `${count(ready, "es")} de ${count(total, "es")} fichas al día`,
    states: { idle: "Sin iniciar", running: "Actualizando", pausing: "Pausando…", paused: "En pausa", completed: "Actualización terminada" },
    current: title => `Revisando: ${title}`,
    completed: job => `${count(job.processed, "es")} fichas revisadas; ${count(job.ready, "es")} con puntuaciones disponibles.`,
    missingIds: value => value === 1 ? "1 ficha sin identificador: revisa sus datos para poder actualizarla." : `${count(value, "es")} fichas sin identificador: revisa sus datos para poder actualizarlas.`,
    failed: value => value === 1 ? "1 ficha no se ha podido consultar." : `${count(value, "es")} fichas no se han podido consultar.`,
    unavailable: value => `${count(value, "es")} ${value === 1 ? "ficha" : "fichas"} sin puntuaciones disponibles en OMDb.`,
    offline: "No se ha podido conectar con la Raspberry. La actualización puede seguir en marcha; vuelve a consultar el estado.",
    error: "No se ha podido cargar el estado de la actualización. Prueba de nuevo.",
    oldServer: "Actualiza la aplicación de la Raspberry para actualizar todas las fichas desde aquí.",
  },
  ca: {
    title: "Actualitzar fitxes existents",
    hint: "Consulta les puntuacions de les pel·lícules i sèries que ja tens. Només es consulten les que falten o han caducat; es reutilitzen les puntuacions desades que encara són vigents.",
    start: "Actualitzar fitxes", resume: "Continuar l’actualització", pause: "Pausar", loading: "Carregant l’estat…", retry: "Tornar-ho a provar",
    refresh: "Actualitzar l’estat", continues: "L’actualització continua a la Raspberry encara que tanquis aquesta pàgina.",
    empty: "Encara no hi ha pel·lícules ni sèries per actualitzar.", unidentified: "Les fitxes existents necessiten un identificador de TMDB o IMDb per consultar-ne les puntuacions.", configuredMissing: "Desa una clau d’OMDb per actualitzar les fitxes.",
    progress: (processed, total) => `${count(processed, "ca")} de ${count(total, "ca")} fitxes revisades`,
    inventory: (ready, total) => `${count(ready, "ca")} de ${count(total, "ca")} fitxes al dia`,
    states: { idle: "Sense iniciar", running: "Actualitzant", pausing: "Pausant…", paused: "En pausa", completed: "Actualització acabada" },
    current: title => `Revisant: ${title}`,
    completed: job => `${count(job.processed, "ca")} fitxes revisades; ${count(job.ready, "ca")} amb puntuacions disponibles.`,
    missingIds: value => value === 1 ? "1 fitxa sense identificador: revisa’n les dades per poder-la actualitzar." : `${count(value, "ca")} fitxes sense identificador: revisa’n les dades per poder-les actualitzar.`,
    failed: value => value === 1 ? "No s’ha pogut consultar 1 fitxa." : `No s’han pogut consultar ${count(value, "ca")} fitxes.`,
    unavailable: value => `${count(value, "ca")} ${value === 1 ? "fitxa" : "fitxes"} sense puntuacions disponibles a OMDb.`,
    offline: "No s’ha pogut connectar amb la Raspberry. L’actualització pot continuar en marxa; torna a consultar-ne l’estat.",
    error: "No s’ha pogut carregar l’estat de l’actualització. Torna-ho a provar.",
    oldServer: "Actualitza l’aplicació de la Raspberry per actualitzar totes les fitxes des d’aquí.",
  },
  en: {
    title: "Update existing titles",
    hint: "Look up ratings for the movies and series you already have. Only missing or expired ratings are requested; current saved ratings are reused.",
    start: "Update titles", resume: "Resume update", pause: "Pause", loading: "Loading status…", retry: "Retry",
    refresh: "Refresh status", continues: "The update continues on the Raspberry even if you close this page.",
    empty: "There are no movies or series to update yet.", unidentified: "Existing titles need a TMDB or IMDb identifier before their ratings can be checked.", configuredMissing: "Save an OMDb key to update existing titles.",
    progress: (processed, total) => `${count(processed, "en")} of ${count(total, "en")} titles checked`,
    inventory: (ready, total) => `${count(ready, "en")} of ${count(total, "en")} titles up to date`,
    states: { idle: "Not started", running: "Updating", pausing: "Pausing…", paused: "Paused", completed: "Update complete" },
    current: title => `Checking: ${title}`,
    completed: job => `${count(job.processed, "en")} titles checked; ${count(job.ready, "en")} with ratings available.`,
    missingIds: value => value === 1 ? "1 title has no identifier: review its details to update it." : `${count(value, "en")} titles have no identifier: review their details to update them.`,
    failed: value => `${count(value, "en")} ${value === 1 ? "title" : "titles"} could not be checked.`,
    unavailable: value => `${count(value, "en")} ${value === 1 ? "title has" : "titles have"} no ratings available on OMDb.`,
    offline: "Could not connect to the Raspberry. The update may still be running; check its status again.",
    error: "Could not load the update status. Try again.",
    oldServer: "Update the Raspberry application to update all existing titles from here.",
  },
};

export function omdbLibraryStrings(language) { return strings[languageKey(language)] || strings.es; }

const integer = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => value === null || (typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 8640000000000);
const states = new Set(["idle", "running", "pausing", "paused", "completed"]);

export function normalizeOmdbLibrary(payload) {
  const job = payload?.job;
  if (payload?.ok !== true || typeof payload.configured !== "boolean" || !integer(payload.total) ||
      !integer(payload.ready) || payload.ready > payload.total || !Array.isArray(payload.missingIds) ||
      payload.missingIds.some(item => !item || !["movie", "tv"].includes(item.kind) ||
        typeof item.title !== "string" || typeof item.path !== "string") ||
      !job || !states.has(job.state) || ![job.total, job.processed, job.ready, job.unavailable, job.failed].every(integer) ||
      job.processed > job.total || job.processed !== job.ready + job.unavailable + job.failed ||
      typeof job.currentTitle !== "string" || !(job.code === null || typeof job.code === "string") ||
      !timestamp(job.startedAt) || !timestamp(job.finishedAt)) {
    throw Object.assign(new Error("Invalid OMDb library response"), { code: "OMDB_INVALID_RESPONSE" });
  }
  return {
    ok: true, configured: payload.configured, total: payload.total, ready: payload.ready,
    missingIds: payload.missingIds.map(({ kind, title, path }) => ({ kind, title, path })),
    job: { state: job.state, total: job.total, processed: job.processed, ready: job.ready,
      unavailable: job.unavailable, failed: job.failed, currentTitle: job.currentTitle,
      code: /^OMDB_[A-Z0-9_]+$/.test(job.code || "") ? job.code : null,
      startedAt: job.startedAt, finishedAt: job.finishedAt },
  };
}
