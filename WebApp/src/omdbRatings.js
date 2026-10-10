const locales = { es: "es-ES", ca: "ca-ES", en: "en-GB" };
const languageKey = language => {
  const code = String(language || "").trim().toLowerCase().split(/[-_]/)[0];
  return code === "cat" ? "ca" : code;
};
const locale = language => locales[languageKey(language)] || locales.es;

const strings = {
  es: {
    settingsTitle: "Puntuaciones · OMDb", settingsHint: "Añade tu clave de OMDb para mostrar IMDb, Rotten Tomatoes y Metacritic en las fichas de películas y series cuando estén disponibles. Las puntuaciones se guardan en la Raspberry para reducir las consultas.",
    key: "Clave de API de OMDb", keySaved: "Clave guardada", keyEmpty: "Sin configurar", keyLink: "Obtener una clave de OMDb",
    save: "Guardar", saving: "Guardando…", test: "Probar conexión", testing: "Comprobando…", remove: "Eliminar clave", removed: "Clave eliminada.", saved: "Configuración guardada.", connected: "Conexión con OMDb comprobada.",
    saveBeforeTest: "Guarda la clave antes de probar la conexión.", demo: "Conecta con la Raspberry para configurar OMDb y consultar las puntuaciones.",
    loading: "Cargando puntuaciones…", retry: "Reintentar", ratingLabel: "Puntuaciones · OMDb", ratingMissing: "No hay puntuaciones disponibles para este título.", unavailable: "No disponible",
    notConfigured: "Configura OMDb en Dashboard → Servicios auxiliares para ver las puntuaciones.",
    votes: count => `${formatOmdbVotes(count, "es")} votos`, updated: "Actualizado", stale: "Puntuaciones guardadas; no se han podido actualizar.",
    errors: {
      auth: "La clave de OMDb no es válida o todavía no está activada.", limit: "Se ha alcanzado el límite de consultas de OMDb. Prueba más tarde.",
      connection: "No se ha podido conectar con OMDb. Prueba de nuevo.", invalid: "OMDb ha devuelto una respuesta no válida. Prueba de nuevo.",
      missing: "Este título todavía no tiene un identificador de IMDb disponible.", timeout: "La consulta a OMDb ha tardado demasiado. Prueba de nuevo.",
      generic: "No se ha podido cargar la información de OMDb. Prueba de nuevo.",
      settings: "La configuración de OMDb no es válida.", tmdb: "No se ha podido obtener el identificador de IMDb desde TMDB.",
      tmdbNotConfigured: "Configura TMDB para obtener el identificador de IMDb de este título.", storage: "No se ha podido guardar la información de OMDb en la Raspberry.",
    },
  },
  ca: {
    settingsTitle: "Puntuacions · OMDb", settingsHint: "Afegeix la teva clau d’OMDb per mostrar IMDb, Rotten Tomatoes i Metacritic a les fitxes de pel·lícules i sèries quan estiguin disponibles. Les puntuacions es desen a la Raspberry per reduir les consultes.",
    key: "Clau d’API d’OMDb", keySaved: "Clau desada", keyEmpty: "Sense configurar", keyLink: "Obtenir una clau d’OMDb",
    save: "Desar", saving: "Desant…", test: "Provar la connexió", testing: "Comprovant…", remove: "Eliminar la clau", removed: "Clau eliminada.", saved: "Configuració desada.", connected: "Connexió amb OMDb comprovada.",
    saveBeforeTest: "Desa la clau abans de provar la connexió.", demo: "Connecta amb la Raspberry per configurar OMDb i consultar les puntuacions.",
    loading: "Carregant puntuacions…", retry: "Tornar-ho a provar", ratingLabel: "Puntuacions · OMDb", ratingMissing: "No hi ha puntuacions disponibles per a aquest títol.", unavailable: "No disponible",
    notConfigured: "Configura OMDb a Dashboard → Serveis auxiliars per veure les puntuacions.",
    votes: count => `${formatOmdbVotes(count, "ca")} vots`, updated: "Actualitzat", stale: "Puntuacions desades; no s’han pogut actualitzar.",
    errors: {
      auth: "La clau d’OMDb no és vàlida o encara no està activada.", limit: "S’ha assolit el límit de consultes d’OMDb. Torna-ho a provar més tard.",
      connection: "No s’ha pogut connectar amb OMDb. Torna-ho a provar.", invalid: "OMDb ha retornat una resposta no vàlida. Torna-ho a provar.",
      missing: "Aquest títol encara no té cap identificador d’IMDb disponible.", timeout: "La consulta a OMDb ha trigat massa. Torna-ho a provar.",
      generic: "No s’ha pogut carregar la informació d’OMDb. Torna-ho a provar.",
      settings: "La configuració d’OMDb no és vàlida.", tmdb: "No s’ha pogut obtenir l’identificador d’IMDb des de TMDB.",
      tmdbNotConfigured: "Configura TMDB per obtenir l’identificador d’IMDb d’aquest títol.", storage: "No s’ha pogut desar la informació d’OMDb a la Raspberry.",
    },
  },
  en: {
    settingsTitle: "Ratings · OMDb", settingsHint: "Add your OMDb API key to display IMDb, Rotten Tomatoes and Metacritic on movie and series details when available. Ratings are cached on the Raspberry to reduce requests.",
    key: "OMDb API key", keySaved: "Key saved", keyEmpty: "Not configured", keyLink: "Get an OMDb key",
    save: "Save", saving: "Saving…", test: "Test connection", testing: "Checking…", remove: "Remove key", removed: "Key removed.", saved: "Settings saved.", connected: "OMDb connection verified.",
    saveBeforeTest: "Save the key before testing the connection.", demo: "Connect to the Raspberry to configure OMDb and look up ratings.",
    loading: "Loading ratings…", retry: "Retry", ratingLabel: "Ratings · OMDb", ratingMissing: "No ratings are available for this title.", unavailable: "Not available",
    notConfigured: "Configure OMDb in Dashboard → Auxiliary services to see the ratings.",
    votes: count => `${formatOmdbVotes(count, "en")} votes`, updated: "Updated", stale: "Saved ratings; they could not be refreshed.",
    errors: {
      auth: "The OMDb key is invalid or has not been activated yet.", limit: "The OMDb request limit has been reached. Try again later.",
      connection: "Could not connect to OMDb. Try again.", invalid: "OMDb returned an invalid response. Try again.",
      missing: "This title does not have an IMDb identifier available yet.", timeout: "The OMDb request took too long. Try again.",
      generic: "Could not load OMDb information. Try again.",
      settings: "The OMDb settings are invalid.", tmdb: "Could not get the IMDb identifier from TMDB.",
      tmdbNotConfigured: "Configure TMDB to get this title’s IMDb identifier.", storage: "Could not save OMDb information on the Raspberry.",
    },
  },
};

export function omdbStrings(language) { return strings[languageKey(language)] || strings.es; }

export function omdbError(error, language) {
  const t = omdbStrings(language);
  const messages = {
    OMDB_DEMO: t.demo, OMDB_NOT_CONFIGURED: t.notConfigured, OMDB_AUTH_ERROR: t.errors.auth,
    OMDB_LIMIT: t.errors.limit, OMDB_CONNECTION_ERROR: t.errors.connection,
    OMDB_INVALID_RESPONSE: t.errors.invalid, OMDB_ID_MISSING: t.errors.missing,
    OMDB_NOT_FOUND: t.ratingMissing, OMDB_TIMEOUT: t.errors.timeout, OMDB_INVALID_ID: t.errors.missing,
    OMDB_INVALID_SETTINGS: t.errors.settings, OMDB_TMDB_NOT_CONFIGURED: t.errors.tmdbNotConfigured,
    OMDB_TMDB_ERROR: t.errors.tmdb, OMDB_STORAGE_ERROR: t.errors.storage,
  };
  return messages[error?.code] || t.errors.generic;
}

export function omdbSettingsPayload(apiKey = "", clearApiKey = false) {
  if (clearApiKey) return { clearApiKey: true };
  const key = String(apiKey || "").trim();
  return key ? { apiKey: key } : {};
}

export function isImdbId(value) { return typeof value === "string" && /^tt\d{7,12}$/.test(value); }

export function normalizeOmdbRating(payload) {
  const nullableNumber = (value, check) => value === null || (typeof value === "number" && Number.isFinite(value) && check(value));
  if (payload?.ok !== true || !isImdbId(payload.imdbId) ||
      !nullableNumber(payload.rating, value => value >= 1 && value <= 10) ||
      !nullableNumber(payload.votes, value => Number.isSafeInteger(value) && value >= 0) ||
      !nullableNumber(payload.updatedAt, value => value > 0 && value <= 8640000000000) ||
      typeof payload.stale !== "boolean") {
    throw Object.assign(new Error("Invalid OMDb rating response"), { code: "OMDB_INVALID_RESPONSE" });
  }
  return { ok: true, imdbId: payload.imdbId, rating: payload.rating, votes: payload.votes,
    rottenTomatoes: isOmdbCriticScore(payload.rottenTomatoes) ? payload.rottenTomatoes : null,
    metacritic: isOmdbCriticScore(payload.metacritic) ? payload.metacritic : null,
    ...Object.fromEntries(["rottenTomatoesVotes", "metacriticVotes"]
      .filter(key => Number.isSafeInteger(payload[key]) && payload[key] >= 0).map(key => [key, payload[key]])),
    updatedAt: payload.updatedAt, stale: payload.stale, ...(payload.code ? { code: payload.code } : {}) };
}

// Optional critic scores may be absent on older servers or individual titles.
// Invalid values must never replace a valid IMDb score or turn N/A into zero.
export function isOmdbCriticScore(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
}

export function formatOmdbCriticScore(value, language) {
  return isOmdbCriticScore(value) ? new Intl.NumberFormat(locale(language)).format(value) : "—";
}

export function formatOmdbRating(value, language) {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 10
    ? new Intl.NumberFormat(locale(language), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value) : "—";
}

export function formatTmdbRating(value, language) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 10
    ? new Intl.NumberFormat(locale(language), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value / 2) : "—";
}

export function formatOmdbVotes(value, language) {
  return Number.isSafeInteger(value) && value >= 0 ? new Intl.NumberFormat(locale(language)).format(value) : "—";
}

export function formatOmdbUpdatedAt(value, language) {
  const date = typeof value === "number" && value > 0 ? new Date(value * 1000) : null;
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat(locale(language), { dateStyle: "medium" }).format(date) : "";
}

// A separate controller cancels requests on both navigation and a bounded wait,
// including a stalled response body or a fetch that does not honor abort.
export async function omdbRequestWithTimeout(read, signal, timeoutMs = 20000) {
  const controller = new AbortController();
  let timer, cancel;
  const aborted = new Promise((_, reject) => {
    cancel = () => { controller.abort(); reject(new DOMException("Aborted", "AbortError")); };
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
  });
  try {
    if (signal?.aborted) return await aborted;
    return await Promise.race([read(controller.signal), aborted, new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(Object.assign(new Error("OMDb request timed out"), { code: "OMDB_TIMEOUT" }));
        controller.abort();
      }, timeoutMs);
    })]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
