import { NativeModules, Platform } from "react-native";

const STRINGS = {
  es: {
    episodes: "capítulos",
    series: "serie",
    selectSeries: "Seleccionar serie",
    seasonFallback: "Temporada",
    noImage: "No img",
    viewDetails: "Ver detalles de",
    duration: "Duración",
    airDate: "Emisión",
    noSynopsis: "Sinopsis no disponible.",
    playOnRaspberry: "▶ Reproducir en Raspberry",
    notFoundSeason: "No se encontró la temporada.",
    couldNotPlay: "No se pudo reproducir",
    invalidId: "ID inválido",
    unknown: "desconocido",
    rpiConnected: "Conectado",
    rpiDegraded: "Respuesta inválida",
    rpiDisconnected: "Sin conexión",
    rpiOkLabel: "ok",
    rpiRunningLabel: "ejecutando",
    rpiPlayingLabel: "reproduciendo",
    rpiRefresh: "Actualizar",
    rpiStop: "Detener",
    rpiStopping: "Deteniendo...",
    rpiStopErrorTitle: "No se pudo detener",
    rpiBaseUrlLabel: "IP/URL",
    rpiScanQr: "Escanear QR",
    rpiQrHint: "Escanea un QR con la URL de la Raspberry, por ejemplo: http://10.1.35.27:5050",
    rpiQrSavedTitle: "Raspberry actualizada",
    rpiQrInvalidTitle: "QR no válido",
    rpiQrInvalidMessage: "El QR debe contener una URL válida como http://10.1.35.27:5050",
    rpiQrPermissionTitle: "Permiso de cámara",
    rpiQrPermissionMessage: "Necesito acceso a la cámara para escanear el QR.",
    rpiUnknown: "unknown",
    rpiNotConfigured: "No configurada",
    rpiNeedQrFirst: "Primero escanea el QR de la Raspberry desde el badge RPi.",
    rpiPlayingTitle: "Reproduciendo",
    rpiVolumeErrorTitle: "No se pudo cambiar el volumen",
    volumeDown: "Vol -",
    volumeUp: "Vol +",
    episodePrefix: "Capítulo",
    minutes: "minutos",
    synopsisLabel: "Sinopsis",
    playSimpsonsTv: "Reproducir en Simpsons TV",
    rating: "Valoración",
    loadingSeasons: "Cargando temporadas...",
    loadingEpisodes: "Cargando episodios...",
    retry: "Reintentar",
    tmdbErrorTitle: "Error cargando TMDB",
    addSeriesTitle: "Añadir serie",
    addSelectedSeries: "Añadir",
    seriesSearchPlaceholder: "Escribe el nombre de una serie",
    searchingSeries: "Buscando series...",
    noSeriesResults: "No se han encontrado resultados.",
    seriesSearchHint: "Busca una serie para añadirla.",
    seriesAlreadyAdded: "Ya está añadida",
    search: "Buscar",
    cancel: "Cancelar",
    save: "Guardar",
    delete: "Eliminar",
    seriesOptionsTitle: "Opciones de la serie",
    seriesNameLabel: "Nombre",
    seriesNamePlaceholder: "Nombre de la serie",
    deleteSeriesTitle: "Eliminar serie",
    deleteSeriesMessage: "¿Seguro que quieres eliminar esta serie?",
    noContentLoadedTitle: "Sin contenido cargado",
    noContentLoadedIntro: "Para empezar tienes 2 maneras de agregar contenido:",
    addSeriesManualTitle: "Añadir manualmente",
    addSeriesManualDescription: "Pulsa el botón redondo + y busca una serie nueva.",
    addSeriesSyncTitle: "Sincronizar Raspberry",
    addSeriesSyncDescription:
      "Usa el badge de la Raspberry para conectar con la mini TV y detectar automáticamente lo que haya en la tarjeta SD.",
    rpiSyncTitle: "Sincronizar con la Raspberry",
    rpiSyncSubtitle:
      "La app lee las carpetas de la Raspberry, propone la serie de TMDB que mejor encaja y te deja ajustar cada caso antes de guardar.",
    rpiSyncLoading: "Leyendo contenido de la Raspberry...",
    rpiSyncError: "No se pudo sincronizar.",
    rpiSyncEmpty: "No se han encontrado carpetas de series en la Raspberry.",
    rpiSyncNoMatch: "No se ha encontrado ninguna serie que encaje.",
    rpiSyncShowAlternatives: "Ver otras opciones",
    rpiSyncHideAlternatives: "Ocultar alternativas",
    rpiSyncExistingSeries:
      "Ya existe en la biblioteca; se añadirá el vínculo con la Raspberry.",
    rpiSyncAlreadyLinked:
      "Ya estaba vinculada; se actualizará la sincronización.",
  },
  en: {
    episodes: "episodes",
    series: "series",
    selectSeries: "Select series",
    seasonFallback: "Season",
    noImage: "No img",
    viewDetails: "View details for",
    duration: "Duration",
    airDate: "Aired",
    noSynopsis: "Synopsis not available.",
    playOnRaspberry: "▶ Play on Raspberry",
    notFoundSeason: "Season not found.",
    couldNotPlay: "Could not play episode",
    invalidId: "Invalid ID",
    unknown: "unknown",
    rpiConnected: "Connected",
    rpiDegraded: "Invalid response",
    rpiDisconnected: "Disconnected",
    rpiOkLabel: "ok",
    rpiRunningLabel: "running",
    rpiPlayingLabel: "playing",
    rpiRefresh: "Refresh",
    rpiStop: "Stop",
    rpiStopping: "Stopping...",
    rpiStopErrorTitle: "Could not stop playback",
    rpiBaseUrlLabel: "IP/URL",
    rpiScanQr: "Scan QR",
    rpiQrHint: "Scan a QR with the Raspberry URL, e.g. http://10.1.35.27:5050",
    rpiQrSavedTitle: "Raspberry updated",
    rpiQrInvalidTitle: "Invalid QR",
    rpiQrInvalidMessage: "The QR must contain a valid URL like http://10.1.35.27:5050",
    rpiQrPermissionTitle: "Camera permission",
    rpiQrPermissionMessage: "Camera access is required to scan the QR code.",
    rpiUnknown: "unknown",
    rpiNotConfigured: "Not configured",
    rpiNeedQrFirst: "Scan the Raspberry QR first from the RPi badge.",
    rpiPlayingTitle: "Playing",
    rpiVolumeErrorTitle: "Could not change volume",
    volumeDown: "Vol -",
    volumeUp: "Vol +",
    episodePrefix: "Episode",
    minutes: "minutes",
    synopsisLabel: "Synopsis",
    playSimpsonsTv: "Play on Simpsons TV",
    rating: "Rating",
    loadingSeasons: "Loading seasons...",
    loadingEpisodes: "Loading episodes...",
    retry: "Retry",
    tmdbErrorTitle: "TMDB loading error",
    addSeriesTitle: "Add series",
    addSelectedSeries: "Add",
    seriesSearchPlaceholder: "Type a TV series name",
    searchingSeries: "Searching series...",
    noSeriesResults: "No results found.",
    seriesSearchHint: "Search for a series to add it.",
    seriesAlreadyAdded: "Already added",
    search: "Search",
    cancel: "Cancel",
    save: "Save",
    delete: "Delete",
    seriesOptionsTitle: "Series options",
    seriesNameLabel: "Name",
    seriesNamePlaceholder: "Series name",
    deleteSeriesTitle: "Delete series",
    deleteSeriesMessage: "Are you sure you want to delete this series?",
    noContentLoadedTitle: "No content loaded",
    noContentLoadedIntro: "You have 2 ways to start:",
    addSeriesManualTitle: "Add manually",
    addSeriesManualDescription: "Tap the + button and search for a new series.",
    addSeriesSyncTitle: "Sync Raspberry",
    addSeriesSyncDescription:
      "Use the Raspberry badge to connect with the mini TV and automatically detect what is stored on the SD card.",
    rpiSyncTitle: "Sync with Raspberry",
    rpiSyncSubtitle:
      "The app reads Raspberry folders, suggests the best TMDB match and lets you adjust each result before saving.",
    rpiSyncLoading: "Reading Raspberry content...",
    rpiSyncError: "Could not synchronize.",
    rpiSyncEmpty: "No series folders were found on the Raspberry.",
    rpiSyncNoMatch: "No matching TV series was found.",
    rpiSyncShowAlternatives: "Show alternatives",
    rpiSyncHideAlternatives: "Hide alternatives",
    rpiSyncExistingSeries:
      "This series is already in the library; the Raspberry link will be added.",
    rpiSyncAlreadyLinked:
      "This series was already linked; the sync metadata will be updated.",
  },
};

function pushIfString(target, value) {
  if (typeof value === "string" && value.trim()) target.push(value.trim());
}

function getNativeLocales() {
  const candidates = [];

  try {
    if (Platform.OS === "ios") {
      const settings = NativeModules?.SettingsManager?.settings || {};
      pushIfString(candidates, settings.AppleLocale);
      pushIfString(candidates, settings.localeIdentifier);
      pushIfString(candidates, settings.locale);
      if (Array.isArray(settings.AppleLanguages)) {
        settings.AppleLanguages.forEach((lang) => pushIfString(candidates, lang));
      }
    }

    if (Platform.OS === "android") {
      pushIfString(candidates, NativeModules?.I18nManager?.localeIdentifier);
      pushIfString(candidates, NativeModules?.I18nManager?.locale);
      pushIfString(candidates, NativeModules?.SettingsManager?.settings?.localeIdentifier);
      pushIfString(candidates, NativeModules?.SettingsManager?.settings?.locale);
      pushIfString(candidates, NativeModules?.SettingsManager?.settings?.AppleLocale);
      const androidAppleLanguages =
        NativeModules?.SettingsManager?.settings?.AppleLanguages;
      if (Array.isArray(androidAppleLanguages)) {
        androidAppleLanguages.forEach((lang) => pushIfString(candidates, lang));
      }
    }
  } catch (_err) {
    // Ignora y usa fallback.
  }

  return candidates;
}

function getExpoLocales() {
  const candidates = [];
  try {
    // Optional dependency. Si no está instalada, seguimos con fallback nativo.
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const localization = require("expo-localization");
    const locales = localization?.getLocales?.() || [];
    locales.forEach((loc) => {
      pushIfString(candidates, loc?.languageTag);
      pushIfString(candidates, loc?.languageCode);
      if (loc?.languageCode && loc?.regionCode) {
        pushIfString(candidates, `${loc.languageCode}-${loc.regionCode}`);
      }
    });
  } catch (_err) {
    // expo-localization no disponible.
  }
  return candidates;
}

function pickAppLanguageFromLocale(localeValue) {
  const normalized = String(localeValue || "")
    .replace("_", "-")
    .toLowerCase();

  if (!normalized) return null;

  // Español o catalán -> usamos ES (solo tenemos ES/EN en la app).
  if (normalized.startsWith("es") || normalized.startsWith("ca")) return "es";

  // Cualquier idioma regional de España salvo inglés -> ES.
  if (normalized.endsWith("-es") && !normalized.startsWith("en")) return "es";

  if (normalized.startsWith("en")) return "en";

  return null;
}

export function getDeviceLanguage() {
  const localeTag = getDeviceLocaleTag();
  const mapped = pickAppLanguageFromLocale(localeTag);
  return mapped || "es";
}

export function getDeviceLocaleTag() {
  const expoLocales = getExpoLocales();
  const nativeLocales = getNativeLocales();
  const intlLocale = Intl?.DateTimeFormat?.().resolvedOptions?.().locale || null;
  const navigatorLocales = Array.isArray(globalThis?.navigator?.languages)
    ? globalThis.navigator.languages
    : [];
  const navigatorLocale = globalThis?.navigator?.language || null;

  const candidates = [
    ...expoLocales,
    ...nativeLocales,
    intlLocale,
    ...navigatorLocales,
    navigatorLocale,
  ].filter(Boolean);

  const seen = new Set();
  for (const locale of candidates) {
    const key = String(locale).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    return key.replace("_", "-");
  }

  return "es-ES";
}

export function getStrings(language) {
  return language === "es" ? STRINGS.es : STRINGS.en;
}

export function formatSeasonTitle(seasonNumber, strings) {
  const num = Number(seasonNumber);
  if (!Number.isFinite(num)) return strings?.seasonFallback || "Season";
  return `${strings?.seasonFallback || "Season"} ${num}`;
}
