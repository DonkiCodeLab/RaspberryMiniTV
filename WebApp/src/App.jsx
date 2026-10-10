import { gameYear, gameRating } from "./gameCardMetadata.js";
import { playbackArtwork, refreshCurrentPlayback } from "./currentPlayback.js";
import { seriesArtwork } from "./seriesArtwork.js";
import LibraryScrollRail from "./LibraryScrollRail.jsx";
import BackToTop from "./BackToTop.jsx";
import MovieLibraryItems from "./MovieLibraryItems.jsx";
import MovieSubtitleDownload from "./MovieSubtitleDownload.jsx";
import MediaCredits from "./MediaCredits.jsx";
import CatalogAI, { CatalogAIButton, CatalogAIResult } from "./CatalogAI.jsx";
import OpenAISettings from "./OpenAISettings.jsx";
import OmdbSettings from "./OmdbSettings.jsx";
import ImdbRating from "./ImdbRating.jsx";
import { catalogAIIds, filterAICollections, matchesCatalogAI } from "./catalogAI.js";
import { recommendationLibraryTarget, recommendationTorrentTarget } from "./recommendations.js";
import BrowserVideo from "./BrowserVideo.jsx";
import SystemUpdate from "./SystemUpdate.jsx";
import OpenSubtitlesSettings from "./OpenSubtitlesSettings.jsx";
import GameProviderSettings from "./GameProviderSettings.jsx";
import ServiceCredentialTest from "./ServiceCredentialTest.jsx";
import { libraryScrollLabel, compareLibraryItems } from "./libraryScroll.js";
import EpubReader from "./EpubReader";
import BookReader from "./BookReader.jsx";
import BookPreviewButton from "./BookPreviewButton.jsx";
import BookHeaderPreview from "./BookHeaderPreview.jsx";
import GameHeaderArtwork from "./GameHeaderArtwork.jsx";
import useUserProfiles from "./useUserProfiles.js";
import { ProfileMenu, UsersPanel, ResumeDialog, userStrings } from "./UserProfiles.jsx";
import BookMetadataModal, { bookSearchQuery } from "./BookMetadataModal";
import BookLibraryControls, { BookTypeField } from "./BookLibraryControls.jsx";
import { bookTypeArtwork } from "./bookTypeArtwork.js";
import { preloadLibraryCovers } from "./preloadLibraryCovers";
import LibraryPoster from "./LibraryPoster";
import OscarLibrary, { OscarIcon } from "./OscarLibrary";
import { awardStrings, movieAwards } from "./awardCatalog.js";
import MovieAwardBadges from "./MovieAwardBadges.jsx";
import AwardSelector from "./AwardSelector.jsx";
import BookAwardLibrary, { BookAwardSelector } from "./BookAwardLibrary.jsx";
import { bookAwardStrings } from "./bookAwardCatalog.js";
import BookTorrentModal from "./BookTorrentModal.jsx";
import { buildBookCollections, matchesBookQuery } from "./bookLibrary.js";
import { bookLanguageName, isGraphicNovel } from "./bookMetadata.js";
import { bookStrings } from "./bookStrings.js";
import TmdbUploadProgress from "./TmdbUploadProgress";
import TmdbCachePanel from "./TmdbCachePanel";
import TmdbCreditsCompletion from "./TmdbCreditsCompletion.jsx";
import TorrentDownloads, { MediaTorrentSearch, useTorrentDownloads } from "./TorrentDownloads.jsx";
import { localTmdbImageUrl } from "./api/raspberryApi";
import { prepareTmdbTitle, clearLocalMetadataCache } from "./api/raspberryApi";
import GameConsoleCarousel from "./GameConsoleCarousel";
import GameMetadataPicker from "./GameMetadataPicker.jsx";
import GameDetails from "./GameDetails.jsx";
import GameLibraryCard from "./GameLibraryCard.jsx";
import GameImagePreview from "./GameImagePreview.jsx";
import { gameMetadataImageUrl } from "./api/raspberryApi";
import { GAME_SYSTEMS, GAME_EXTENSIONS, compatibleSystems, systemForGame } from "./gameSystems";
import { mediaMarkKey, seasonMarkKey, episodeWatched, markEpisode, markSeason } from "./mediaMarks.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import cartellMask from "./assets/cartell_base_black_mask.png";
import cartellLogo from "./assets/cartell_logo.png";
import cloudsBackground from "./assets/cloud.gif";
import deleteIcon from "./assets/delete.png";
import downloadIcon from "./assets/download.png";
import downloadHoverIcon from "./assets/download2.png";
import emptyStateIcon from "./assets/empty.png";
import gameboyAdvanceIcon from "./assets/gameboy_advance.png";
import gameboyColorIcon from "./assets/gameboy_color.png";
import gameboyNormalIcon from "./assets/gameboy_normal.png";
import controlsIconBlack from "./assets/icon_conrtols_black.png";
import controlsIconYellow from "./assets/icon_conrtols_yelllow.png";
import alarmIcon from "./assets/icon_alarm.png";
import dashboardIconBlack from "./assets/icon_dashboard_black.png";
import dashboardIconYellow from "./assets/icon_dashboard_yellow.png";
import gameIconBlack from "./assets/icon_game_black.png";
import gameIconWhite from "./assets/icon_game_white.png";
import gameIconYellow from "./assets/icon_game_yellow.png";
import bookIconBlack from "./assets/icon_book_black.svg";
import bookIconWhite from "./assets/icon_book_white.svg";
import bookIconYellow from "./assets/icon_book_yellow.svg";
import languagesIcon from "./assets/icon_languages.png";
import languageCatNormal from "./assets/language_cat_normal.png";
import languageCatSelected from "./assets/language_cat_selected.png";
import languageEnNormal from "./assets/language_en_normal.png";
import languageEnSelected from "./assets/language_en_selected.png";
import languageEsNormal from "./assets/language_es_normal.png";
import languageEsSelected from "./assets/language_es_selected.png";
import movieIconBlack from "./assets/icon_movie_black.png";
import movieIconWhite from "./assets/icon_movie_white.png";
import movieIconYellow from "./assets/icon_movie_yellow.png";
import picturesIcon from "./assets/icon_pictures.svg";
import picturesIconBlack from "./assets/icon_pictures_black.png";
import picturesIconYellow from "./assets/icon_pictures_yellow.png";
import refreshWhiteIcon from "./assets/refresh_white.png";
import refreshYellowIcon from "./assets/refresh_yellow.png";
import screenOffIcon from "./assets/screen_off.png";
import uploadsIconBlack from "./assets/icon_uploads_black.png";
import uploadsIconYellow from "./assets/icon_uploads_yellow.png";
import saveIcon from "./assets/save.png";
import settingsIcon from "./assets/settings_icon.png";
import tvshowIconBlack from "./assets/icon_tvshow_black.png";
import tvshowIconWhite from "./assets/icon_tvshow_white.png";
import tvshowIconYellow from "./assets/icon_tvshow_yellow.png";
import tvGreen from "./assets/tele_green_2_fixed.png";
import uploadDropzoneWhite from "./assets/upload_drag&drop_zone_white.png";
import uploadDropzoneYellow from "./assets/upload_drag&drop_zone_yellow.png";
import raspberryIntroVideo from "../../DeviceApp/menu/video_intro.mp4";
import donkicodeLogo from "../../DeviceApp/menu/miniLogo_donkicodeLab.png";

const WEB_EMULATOR_SYSTEMS = new Set([
  "gb", "gbc", "gba", "nes", "snes", "mastersystem", "megadrive", "gamegear",
  "segacd", "pcengine", "pcenginecd", "neogeo", "ngp", "ngpc", "wonderswan",
  "wonderswancolor", "atari2600", "atari7800", "atarilynx", "psx", "arcade", "n64",
]);
import {
  addSeries,
  authWebPin,
  captureCameraImage,
  getAlarmSoundUrl,
  getHealth,
  getBrowserGameUrl,
  getGameDownloadUrl,
  getMediaStreamUrl,
  getBookContent,
  getBookContentUrl,
  getBookDisplayCoverUrl,
  openBookOnRaspberry,
  getRaspberryAlarms,
  getRaspberryBirthdays,
  getRaspberryLanguage,
  getRaspberryTmdbSettings,
  getRaspberryWeatherSettings,
  getStoredWebPin,
  powerOffRaspberry,
  getVideos,
  isMockMode,
  playEpisode,
  playGameFile,
  removeGameFile,
  removeBookFile,
  removeBookCollection,
  removeMovieFile,
  removeSeries,
  removeSeriesEpisode,
  removeSeriesSeason,
  searchGameMetadata,
  saveBookMetadata,
  saveBookCollectionMetadata,
  saveMediaProfile,
  setStoredWebPin,
  stopPlayback,
  updateRaspberryAlarms,
  updateRaspberryBirthdays,
  updateRaspberryLanguage,
  updateRaspberryTmdbSettings,
  updateRaspberryWeatherLocation,
  updateGameFileMetadata,
  uploadGameFile,
  uploadBookFiles,
  uploadMovieFile,
  uploadMovieSubtitles,
  checkUploadConflicts,
  uploadPictureFiles,
  getPictureContentUrl,
  uploadSeriesFiles,
  controlPlaybackSubtitles,
  volumeDown,
  volumeUp,
} from "./api/raspberryApi";
import { getRaspberryMovieLibraryItems, getMovieTmdbId } from "./movieCatalog";
import {
  loadMediaLibrary,
  removeMediaLibraryItem,
  upsertMediaLibraryItem,
} from "./mediaLibrary";
import {
  loadSeriesProfiles,
  removeSeriesProfile,
  saveSeriesProfiles,
  updateSeriesProfile,
} from "./seriesProfiles";
import {
  getMovieById,
  getTvSeasonEpisodes,
  getTvEpisodeDetails,
  getTvSeriesById,
  getLibrarySummaries,
  resolveSeriesFromNames,
  initializeTmdbCredentials,
  searchMovies,
  searchTvSeries,
  setTmdbCredentials,
} from "./tmdbApi";

const HERO_SLIDER_MAX = 0.96;
const MAX_MOVIE_IMAGES = 7;
const RASPBERRY_ALARM_STORAGE_KEY = "minitv-raspberry-alarm-v1";
const RASPBERRY_LANGUAGE_STORAGE_KEY = "minitv-raspberry-language-v1";
const RASPBERRY_CURRENT_PLAYBACK_STORAGE_KEY = "minitv-raspberry-current-playback-v1";
const MEDIA_TYPES = [
  {
    id: "series",
    labelKey: "media_series",
    activeIcon: tvshowIconBlack,
    inactiveIcon: tvshowIconYellow,
    headerIcon: { viewBox: "46 1 219 253", width: 310, height: 254 },
  },
  {
    id: "movies",
    labelKey: "media_movies",
    activeIcon: movieIconBlack,
    inactiveIcon: movieIconYellow,
    headerIcon: { viewBox: "0 0 310 254", width: 310, height: 254 },
  },
  {
    id: "games",
    labelKey: "media_games",
    activeIcon: gameIconBlack,
    inactiveIcon: gameIconYellow,
    headerIcon: { viewBox: "0 0 310 254", width: 310, height: 254 },
  },
  {
    id: "books",
    labelKey: "media_books",
    activeIcon: bookIconBlack,
    inactiveIcon: bookIconYellow,
    headerIcon: { viewBox: "9 10 46 45", width: 64, height: 64 },
  },
  {
    id: "pictures",
    labelKey: "media_pictures",
    activeIcon: picturesIconBlack,
    inactiveIcon: picturesIconYellow,
    headerIcon: { viewBox: "0 0 411 323", width: 411, height: 323 },
  },
];

const formatMovieRuntime = (runtime, t) => {
  const minutes = Number(runtime);

  if (!Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }

  const minutesLabel = t("loading_movie_runtime", { minutes });

  if (minutes <= 60) {
    return minutesLabel;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${minutesLabel} (${hours}h ${remainingMinutes}min)`;
};
const formatSeriesRuntime = (runtime) => {
  const minutes = Number(runtime);

  if (!Number.isFinite(minutes) || minutes < 0) {
    return "0h 0min";
  }

  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
};
const RASPBERRY_TABS = [
  {
    id: "dashboard",
    labelKey: "raspberry_dashboard",
    activeIcon: dashboardIconBlack,
    inactiveIcon: dashboardIconYellow,
  },
  {
    id: "controls",
    labelKey: "raspberry_controls",
    activeIcon: controlsIconBlack,
    inactiveIcon: controlsIconYellow,
  },
  {
    id: "uploads",
    labelKey: "raspberry_uploads",
    activeIcon: uploadsIconBlack,
    inactiveIcon: uploadsIconYellow,
  },
  { id: "users", labelKey: "users_title", activeIcon: "/avatars/users.svg", inactiveIcon: "/avatars/users.svg" },
];
const UPLOAD_MEDIA_OPTIONS = [
  { key: "series", value: "series", labelKey: "upload_series" },
  { key: "movies", value: "movies", labelKey: "upload_movie" },
  { key: "games", value: "games", labelKey: "upload_game" },
  { key: "books", value: "books", labelKey: "upload_books" },
  { key: "pictures", value: "pictures", labelKey: "upload_pictures" },
];
const GAME_ROM_EXTENSIONS = new Set(GAME_EXTENSIONS);
const GAME_PLATFORM_LABELS = {
  gb: "Game Boy",
  gbc: "Game Boy Color",
  gba: "Game Boy Advance",
  chd: "Neo Geo CD",
};
const GAME_PLATFORM_ICONS = {
  gb: gameboyNormalIcon,
  gbc: gameboyColorIcon,
  gba: gameboyAdvanceIcon,
};
const GAME_METADATA_PLATFORM_OPTIONS = GAME_SYSTEMS.map(s => ({key: s.id, value: s.id, label: s.name}));
const RASPBERRY_LANGUAGE_OPTIONS = [
  {
    id: "es",
    label: "Castellano",
    normalIcon: languageEsNormal,
    selectedIcon: languageEsSelected,
  },
  {
    id: "ca",
    label: "Català",
    normalIcon: languageCatNormal,
    selectedIcon: languageCatSelected,
  },
  {
    id: "en",
    label: "English",
    normalIcon: languageEnNormal,
    selectedIcon: languageEnSelected,
  },
];
const DEFAULT_HERO_CROP = {
  focusX: 0.5,
  focusY: 0.5,
  zoom: 1,
};
const TMDB_LANGUAGE_BY_APP_LANGUAGE = {
  es: "es-ES",
  ca: "ca-ES",
  en: "en-US",
};
const UI_STRINGS = {
  es: {
    media_series: "Series",
    media_movies: "Películas",
    media_games: "Juegos",
    media_books: "Libros",
    book_library: "Biblioteca",
    book_enter: "Entrar",
    book_collection_count: "Colección · {count} libro(s)",
    book_library_items: "libros y colecciones",
    media_pictures: "Fotos",
    media_series_singular: "serie",
    media_movies_singular: "película",
    media_games_singular: "juego",
    media_books_singular: "libro",
    book_open_title: "¿Dónde quieres abrirlo?",
    book_open_copy: "Elige dónde leer «{name}».",
    book_open_browser: "Abrir en el navegador",
    book_open_raspberry: "Abrir en Raspberry",
    book_open_raspberry_busy: "Abriendo en Raspberry…",
    book_open_raspberry_failed: "No se pudo abrir el libro en la Raspberry.",
    raspberry_dashboard: "Dashboard",
    users_title: "Users",
    raspberry_controls: "Controls",
    raspberry_uploads: "Uploads",
    upload_series: "Serie",
    upload_movie: "Película",
    upload_movie_title_field: "Título de la película",
    movie_subtitles: "Subtítulos externos (.srt, opcional)",
    movie_subtitles_hint: "Se guardará junto al vídeo, con el mismo nombre y extensión .srt. Sustituye el SRT existente.",
    movie_subtitles_failed: "El vídeo se ha guardado, pero los subtítulos no. Puedes volver a subirlos desde la edición de la ficha.",
    upload_game: "Juego",
    upload_books: "Libros",
    upload_pictures: "Fotos",
    upload_pictures_dropzone_copy: "Sube una foto o una carpeta completa. Se admiten JPEG, PNG, WebP, GIF, BMP, AVIF y HEIC.",
    language_spanish: "Castellano",
    language_catalan: "Català",
    language_english: "English",
    back: "Volver",
    episode_label: "Capítulo",
    mark_watched: "Visto",
    mark_unwatched: "No visto",
    mark_favorite: "Favorito",
    mark_not_favorite: "No favorito",
    movie_favorite_add: "Añadir a favoritos",
    movie_favorite_remove: "Quitar de favoritos",
    movie_favorite_add_confirm: "¿Seguro que quieres añadir «{name}» a favoritos?",
    movie_favorite_remove_confirm: "¿Seguro que quieres quitar «{name}» de favoritos?",
    mark_all_watched: "Marcar todos como vistos",
    mark_all_unwatched: "Marcar todos como no vistos",
    mark_season_confirm: "¿Marcar todos los capítulos de «{season}» como {state}?",
    mark_save_error: "No se han podido guardar las marcas en este navegador.",
    episodes: "capítulos",
    prev_image: "Imagen anterior",
    next_image: "Imagen siguiente",
    image_gallery: "Galería de imágenes",
    go_to_image: "Ir a la imagen {index}",
    no_images_available: "Sin imágenes disponibles",
    close: "Cerrar",
    not_available: "No disponible",
    play_on_tv: "Reproducir en miniTV",
    play_in_browser: "Reproducir en navegador",
    play_on_external_monitor: "Reproducir en Monitor Externo",
    browser_player: "Reproductor web",
    playing_now: "Reproduciendo...",
    synopsis_unavailable: "Sinopsis no disponible.",
    games_reserved: "Esta sección de customización todavía no tiene acciones disponibles.",
    mini_tv_title: "Mini-tele",
    mini_tv_config: "Configuración",
    mini_tv_copy: "Este diálogo queda preparado para configurar la mini-tele de la cabecera. En la siguiente iteración conectamos las opciones reales.",
    done_close: "Cerrar",
    settings_of: "Ajustes de la {media}",
    visible_name: "Nombre visible",
    imdb_url: "URL de IMDb",
    imdb_url_placeholder: "https://www.imdb.com/title/tt.../",
    imdb_link: "Enlace a IMDb",
    tmdb_link: "Enlace a TMDB",
    imdb_no_link: "Sin enlace a URL",
    rotten_tomatoes_url: "URL de Rotten Tomatoes",
    rotten_tomatoes_url_placeholder: "https://www.rottentomatoes.com/m/...",
    rotten_tomatoes_link: "Enlace a Rotten Tomatoes",
    rotten_tomatoes_no_link: "Sin enlace a URL",
    image_header: "Imagen de cabecera",
    poster_preview: "Vista previa del cartel",
    vertical_position: "Posición vertical del cartel",
    confirm_delete: "¿Seguro que quieres eliminar la {media} \"{name}\"?",
    confirm_delete_title: "Eliminar {media}",
    delete_media: "Eliminar {media}",
    delete_season: "Eliminar temporada",
    delete_episode: "Eliminar capítulo",
    save: "Guardar",
    cancel: "Cancelar",
    name_of_media: "Nombre de la {media}",
    search_write_media: "Escribe una {media} para buscar.",
    no_movie_results: "No se han encontrado películas para esa búsqueda.",
    no_series_results: "No se han encontrado series para esa búsqueda.",
    tmdb_search_failed: "No se pudo buscar en TMDB.",
    add_media_failed: "No se pudo añadir la {media}.",
    games_section_reserved: "Este diálogo queda reservado para futuras acciones de juegos.",
    add_media: "Añadir {media}",
    search_tmdb: "Buscar en TMDB",
    search: "Búsqueda",
    search_placeholder_movie: "Ejemplo: Toy Story",
    search_placeholder_series: "Ejemplo: Futurama",
    clear_search: "Borrar búsqueda",
    search_button: "Buscar",
    searching_button: "Buscando...",
    search_results_for: "Resultados de {media}",
    no_tmdb_description: "Sin descripción disponible en TMDB.",
    search_to_see_results: "Busca una {media} para ver los resultados aquí.",
    adding_button: "Añadiendo...",
    add_button: "Añadir",
    raspberry_tv_alt: "MiniTV",
    raspberry_sections: "Secciones de Raspberry",
    dashboard_general_title: "Información general",
    dashboard_clock_title: "Configuración del reloj",
    dashboard_auxiliary_title: "Servicios auxiliares",
    logout_title: "Cerrar sesión",
    logout_copy: "Al cerrar la sesión, tendrás que introducir el PIN para volver a acceder.",
    stats_series_installed: "Series instaladas",
    stats_movies_installed: "Películas instaladas",
    stats_games_installed: "Juegos instalados",
    stats_books_installed: "Libros instalados",
    stats_pictures_installed: "Fotos instaladas",
    section_storage_used: "{gb} GB · {percent} utilizado de multimedia",
    used_percent: "{percent} utilizado",
    language_title: "Idioma",
    language_microtv: "Selecciona el idioma de la mini tele.",
    language_cover_notice: "Al cambiar el idioma, también cambiarán las portadas de todas las películas y series guardadas, ya que están localizadas según el idioma seleccionado.",
    language_updating: "Actualizando idioma...",
    language_update_failed: "No se pudo actualizar el idioma de la Raspberry.",
    microsd_capacity: "Capacidad de la SSD",
    multimedia_occupied: "Ocupado por MultimediaContent",
    occupied: "ocupado",
    alarms_title: "Alarmas de la televisión",
    alarms_copy: "Programa la hora a la que debe sonar la alarma de la mini tele.",
    alarm_item: "Alarma {index}",
    alarm_sound_select: "Sonido de la alarma {index}",
    alarm_preview_select: "Sonido para probar",
    no_alarm_sounds: "No hay sonidos disponibles",
    birthdays_title: "Cumpleaños y santos",
    birthdays_copy: "Gestiona las fechas que se mostrarán en el apartado de la hora.",
    birthday: "Cumpleaños",
    saint: "Santo",
    person_name: "Nombre de la persona",
    event_day: "Día",
    event_month: "Mes",
    birth_year_optional: "Año de nacimiento (opcional)",
    add_event: "Añadir fecha",
    save_changes: "Guardar cambios",
    edit: "Modificar",
    delete: "Borrar",
    no_birthdays: "Todavía no hay cumpleaños ni santos guardados.",
    birthday_saved: "Fecha guardada",
    birthday_error: "No se pudo guardar la lista.",
    birthday_invalid: "Introduce un nombre y una fecha válida.",
    delete_event_title: "¿Borrar esta fecha?",
    delete_event_copy: "Se eliminará {name} del listado de cumpleaños y santos.",
    weather_location_title: "Ubicación del tiempo",
    weather_location_copy: "Ciudad o código postal que se mostrará en el reloj de la mini tele.",
    weather_location_placeholder: "Ej. Madrid, España",
    weather_location_save: "Guardar ubicación",
    weather_location_saved: "Ubicación guardada",
    weather_location_error: "No se pudo guardar la ubicación.",
    weather_location_not_found: "Ubicación guardada, pero no se pudo encontrar información para ese código postal.",
    tmdb_settings_title: "Configuración de la API de TMDB",
    tmdb_settings_copy: "Introduce una API key o un token de acceso. Si hay ambos, se utilizará el token.",
    tmdb_api_key: "API key",
    tmdb_bearer_token: "Token de acceso",
    tmdb_settings_save: "Guardar configuración",
    tmdb_settings_saved: "Configuración de TMDB guardada",
    tmdb_settings_error: "No se pudo guardar la configuración de TMDB.",
    weather_resolved_title: "Información de la ubicación",
    weather_city: "Ciudad",
    weather_region: "Provincia / región",
    weather_country: "País",
    weather_postal_code: "Código postal",
    weather_coordinates: "Coordenadas",
    weather_timezone: "Zona horaria",
    weather_temperature: "Temperatura",
    weather_feels_like: "Sensación térmica",
    weather_wind: "Viento",
    on: "On",
    off: "Off",
    playback_current: "Reproducción actual",
    camera_title: "Cámara",
    camera_capture: "Ver cámara",
    camera_capturing: "Capturando...",
    camera_preview_hint: "Pulsa el botón para ver lo que captura la cámara.",
    camera_preview_alt: "Captura actual de la cámara",
    camera_capture_error: "No se pudo obtener la imagen de la cámara.",
    content_in_progress: "Contenido en curso",
    nothing_playing: "Nada reproduciéndose",
    season_label: "Temporada",
    now_playing_episode_label: "Episodio",
    playback_detected: "Reproducción detectada en la Raspberry.",
    playback_controls_hint: "Cuando la tele esté reproduciendo algo, aparecerán aquí los controles activos.",
    dev_playback_preview: "Vista previa dev",
    dev_playback_toggle: "Simular reproducción",
    play: "Play",
    refresh: "Actualizar",
    pause: "Pausar",
    stop: "Parar",
    next_episode: "Siguiente capítulo",
    volume_down: "Volumen -",
    volume_up: "Volumen +",
    subtitle_loading: "Cargando subtítulos…",
    subtitle_load_failed: "No se pudieron cargar los subtítulos. Cierra el reproductor y vuelve a intentarlo.",
    subtitle_toggle: "Activar/desactivar subtítulos",
    subtitle_next: "Siguiente pista de subtítulos",
    subtitle_on: "Subtítulos activados",
    subtitle_off: "Subtítulos desactivados",
    subtitle_external: "Pista externa",
    subtitle_embedded: "Pista integrada",
    subtitle_queued: "Orden enviada. Comprueba los subtítulos en la pantalla de reproducción.",
    subtitle_none: "Este vídeo no tiene subtítulos seleccionables.",
    subtitle_not_playing: "Inicia un vídeo en la MiniTV o monitor externo y vuelve a intentarlo.",
    subtitle_control_failed: "No se pudieron cambiar los subtítulos.",
    power_off: "Apagar mini tele",
    power_off_confirm_title: "Apagar mini tele",
    power_off_confirm_copy: "¿Seguro que quieres apagar la mini televisión?",
    power_off_confirm_action: "Apagar",
    add_content: "Añadir contenido",
    select_type: "Selecciona un tipo",
    drag_here_click: "Arrastra aquí tu contenido o clica para abrir diálogo",
    upload_series_dropzone_copy:
      "Se abrirá un diálogo de coincidencia TMDB usando el nombre del directorio seleccionado o arrastrado a esta zona. Antes de confirmar podrás editar la búsqueda.",
    upload_movie_dropzone_copy:
      "Se abrirá un diálogo de coincidencia TMDB usando el nombre del fichero seleccionado o arrastrado a esta zona. Antes de confirmar podrás editar la búsqueda.",
    upload_game_dropzone_copy: "Sube una ROM y elige su consola. Puedes añadir carátula, imágenes y descripción. Para juegos de disco usa un archivo autocontenido CHD, ISO, CSO o PBP compatible.",
    upload_books_dropzone_copy: "Adjunta uno o varios PDF, EPUB, CBZ o CBR, o arrastra una carpeta completa para crear una colección.",
    latest_detection: "Última detección",
    games: "Juegos",
    upload_games_pending: "La subida guiada para juegos queda preparada visualmente y la conectamos en la siguiente iteración.",
    games_empty_title: "Sin juegos instalados",
    games_empty_copy: "Sube una ROM de Game Boy, Game Boy Color o Game Boy Advance para crear tu biblioteca.",
    game_file_label: "Ficha del juego",
    game_platform_label: "Tipo de juego",
    file_label: "Archivo",
    play_game_on_raspberry: "Jugar en la Raspberry",
    play_game_in_browser: "Jugar desde el navegador",
    browser_game_player: "Juego en el navegador",
    browser_game_unsupported: "Esta consola todavía no es compatible con el navegador",
    playing_game: "Abriendo juego...",
    games_upload_title: "Datos del juego",
    games_edit_title: "Editar juego",
    games_search_placeholder: "Ejemplo: Tetris DX",
    games_default_cover: "Default",
    games_manual_profile: "Ficha manual con carátula por defecto",
    games_cover_picker: "Carátula",
    games_current_images: "Imágenes actuales",
    games_name_field: "Nombre",
    games_description_field: "Descripción",
    games_description_placeholder: "Una descripción corta para reconocer el juego en la biblioteca.",
    games_cover_file_field: "Imagen de carátula",
    games_new_cover_field: "Nueva carátula",
    games_extra_images_field: "Imágenes adicionales",
    games_new_images_field: "Añadir imágenes al carrusel",
    games_set_cover: "Usar como carátula",
    games_remove_image: "Quitar imagen",
    games_cover_selected: "Carátula seleccionada",
    games_no_results: "No se ha encontrado ningún juego con ese nombre para la consola seleccionada. Prueba con otro nombre o revisa la consola.",
    games_search_choose_platform: "Selecciona una consola para buscar la ficha del juego.",
    games_search_enter_name: "Escribe el nombre del juego para buscar su ficha.",
    games_info_title: "Información del juego",
    games_storyline: "Argumento",
    games_media_title: "Multimedia",
    games_gallery_title: "Imágenes",
    games_image_number: "Imagen {number}",
    games_enlarge_image: "Ampliar imagen",
    games_file_details: "Archivo y fuente de la ficha",
    games_videos_label: "Vídeos",
    games_video_title: "Vídeos del juego",
    games_video_choose: "Elegir vídeo",
    games_video_open: "Ver en YouTube",
    games_video_online: "Requiere conexión a Internet. Si el vídeo no se puede reproducir aquí, ábrelo en YouTube.",
    games_video_missing: "Esta ficha no tiene vídeos de YouTube asociados. Puedes buscar un gameplay por nombre y consola.",
    games_video_search: "Buscar gameplay en YouTube",
    youtube_title: "Más gameplays en YouTube",
    youtube_query: "Buscar vídeos por nombre y consola",
    youtube_setup: "Configura YouTube Data API v3 en Dashboard → Servicios auxiliares → YouTube Data API v3 para buscar vídeos aquí. La clave de IGDB no sirve para YouTube.",
    youtube_empty: "No se han encontrado vídeos. Prueba otro nombre o consola.",
    youtube_quota: "Se ha agotado la cuota de búsqueda de YouTube. Inténtalo más tarde.",
    youtube_config_error: "Revisa la clave de YouTube y que YouTube Data API v3 esté habilitada en tu proyecto de Google Cloud.",
    youtube_error: "No se pudo buscar en YouTube. Puedes reintentar la búsqueda.",
    youtube_results: "Resultados de YouTube. Comprueba que el vídeo corresponde a tu juego y consola.",
    games_search_empty: "Escribe un juego para buscar.",
    games_search_failed: "No se pudo buscar la ficha del juego.",
    games_api_not_configured: "Configura ScreenScraper o IGDB en la Raspberry para descargar la ficha, carátulas y capturas.",
    games_metadata_intro: "Buscamos el juego para guardar su ficha, carátulas y capturas en el dispositivo. Elige la coincidencia correcta.",
    games_metadata_selected: "Ficha seleccionada. Se guardarán todos los datos e imágenes disponibles.",
    games_metadata_saving: "Guardando ficha e imágenes…",
    games_metadata_retry: "Completar ficha e imágenes",
    games_metadata_partial: "La ficha está guardada, pero algunas imágenes no se han descargado. Puedes reintentarlo.",
    games_metadata_ambiguous: "Hay varias coincidencias. Selecciona la ficha del juego para completarla.",
    games_metadata_pending: "El juego está guardado. Falta completar su ficha e imágenes.",
    games_release_date: "Lanzamiento",
    games_developers: "Desarrollador",
    games_publishers: "Distribuidor",
    games_genres: "Géneros",
    games_players: "Jugadores",
    games_modes: "Modos de juego",
    games_rating: "Puntuación",
    upload_game_invalid_title: "Archivo de juego no compatible",
    upload_game_invalid_copy: "Selecciona un único archivo de juego compatible.",
    upload_game_detected: "{name} detectado como {platform}. Añade la carátula y descripción antes de subir.",
    upload_game_done_summary: "{name} añadido a Games: {path}",
    upload_game_failed: "No se pudo subir el juego.",
    access_protected: "Acceso protegido",
    app_title: "Gestor de MiniTV Raspberry",
    protected_access: "Acceso protegido",
    manager_title: "Gestor de MiniTV Raspberry Pi",
    unlock_copy: "Introduce el PIN numérico de 4 dígitos configurado en la Raspberry.",
    validating: "Validando...",
    show_password: "Mostrar PIN",
    hide_password: "Ocultar PIN",
    enter: "Entrar",
    loading_movies: "Cargando películas...",
    loading_seasons: "Cargando temporadas...",
    seasons_load_error: "No se pudieron cargar las temporadas",
    retry_load: "Reintentar",
    loading_library: "Cargando biblioteca",
    loading_details: "Cargando contenido",
    loading_movie_copy: "Estoy preparando la portada y los datos TMDB de la película seleccionada.",
    loading_series_copy: "Estoy preparando la portada y la cartelera TMDB de la serie seleccionada.",
    connection_error: "Error de conexión",
    loading_episodes: "Cargando capítulos...",
    reading_season: "Estoy leyendo la temporada seleccionada desde TMDB.",
    add_movie_prompt: "Añade una película desde TMDB con el botón + para empezar esta lista.",
    no_season_info: "No hay información de temporadas disponible para la serie seleccionada.",
    pin_digits: "Introduce un PIN numérico de 4 dígitos.",
    pin_validate_failed: "No se pudo validar el PIN.",
    save_changes_failed: "No se pudieron guardar los cambios.",
    delete_media_failed: "No se pudo eliminar la {media}.",
    invalid_episode_id: "No se pudo convertir el episodio al formato SxxExx.",
    play_episode_failed: "No se pudo reproducir el episodio.",
    raspberry_status_failed: "No se pudo leer el estado de la Raspberry.",
    movie_match_not_found: "No he encontrado un archivo de vídeo en la Raspberry que coincida con esta película.",
    play_movie_failed: "No se pudo reproducir la película.",
    power_off_failed: "No se pudo apagar la mini televisión.",
    pause_not_available: "La API actual de la Raspberry todavía no expone una acción de pausa diferenciada.",
    next_episode_not_found: "No he encontrado un capítulo siguiente para la reproducción actual.",
    upload_games_detected: "Se han detectado {count} archivo(s). La subida guiada de juegos llegará después.",
    upload_name_not_detected: "No he podido detectar un nombre útil para buscar en TMDB.",
    upload_detected_summary: "{count} archivo(s) detectados. Búsqueda preparada para {media}: \"{name}\".",
    upload_series_requires_directory: "Selecciona o arrastra un único directorio de serie.",
    upload_series_subdirectories_error: "Todo el contenido de la serie debe estar dentro del directorio, sin subdirectorios.",
    upload_series_format_error: "Todos los ficheros deben contener el formato SxxExx.",
    upload_duplicates_title: "La serie ya contiene capítulos",
    upload_existing_title: "El contenido ya existe",
    upload_existing_copy: "{existing} archivo(s) ya existen. ¿Quieres sobrescribirlos? Si cancelas, se conservará el contenido actual.",
    upload_replace: "Sí, sobrescribir",
    upload_duplicates_copy: "{existing} de {total} vídeos ya están cargados en la Raspberry. ¿Qué quieres hacer?",
    upload_overwrite_existing: "Sobrescribir los existentes",
    upload_only_new: "Subir solo los nuevos",
    upload_button: "Upload",
    tmdb_browser_title: "Descargar torrent",
    select_game: "Selecciona un juego",
    games_filter: "Filtrar",
    games_show_options: "Mostrar opciones de juegos",
    games_hide_options: "Ocultar opciones de juegos",
    tmdb_browser_search_label: "Búsqueda (utilizando la base de datos de TMDB)",
    tmdb_browser_trailer: "Tráiler",
    tmdb_browser_no_trailer: "No hay un tráiler de YouTube disponible.",
    tmdb_browser_copy:
      "Consulta las fichas de series y películas en TMDB, elige un torrent y sigue su descarga desde el dashboard. En series puedes buscar por temporada y capítulo.",
    tmdb_browser_open: "Buscar torrent",
    game_browser_title: "Buscar ficha de juego",
    game_browser_copy:
      "Busca una ROM por nombre para revisar carátula, plataforma y descripción dentro de la web antes de subirla.",
    game_browser_open: "Buscar ficha",
    game_browser_results: "Resultados de juegos",
    game_browser_select_prompt: "Marca un resultado para revisar su ficha y sus carátulas.",
    game_browser_search_intro: "Busca un juego para ver los resultados aquí.",
    game_browser_loading: "Cargando ficha del juego...",
    game_browser_platform: "Plataforma",
    game_browser_source: "Fuente",
    tmdb_browser_preview: "Visualizar",
    tmdb_browser_results: "Resultados TMDB",
    tmdb_browser_select_prompt: "Visualiza un resultado para revisar temporadas, capítulos o datos de la película.",
    tmdb_browser_loading: "Cargando ficha TMDB...",
    tmdb_browser_load_failed: "No se pudo cargar la ficha TMDB.",
    tmdb_browser_search_intro: "Busca una serie o película para ver su ficha aquí.",
    tmdb_browser_season_prompt: "Selecciona una temporada para ver sus capítulos.",
    upload_copying: "Copiando contenido a la Raspberry...",
    upload_chapter_copying: "Cargando {current} de {total} capítulos",
    upload_saving: "Guardando en la Raspberry...",
    upload_all_done: "Todo subido correctamente.",
    book_upload_loading: "Cargando libros…",
    book_upload_complete: "Carga completada",
    book_upload_error: "Error al cargar",
    book_upload_failed: "No se pudieron cargar los libros.",
    upload_cancel_confirm: "Eips, se está subiendo contenido a la Raspberry. ¿Seguro que quieres cancelar la subida?",
    upload_close_confirm: "Eips, se está subiendo contenido a la Raspberry. Si cierras esta ventana se cancelará la subida. ¿Seguro?",
    upload_canceled: "Subida cancelada.",
    upload_done_summary: "{name} añadida a Movies: {path}",
    upload_series_done_summary: "{name} añadida a TVShows: {path}",
    unavailable_season: "Temporada sin capítulos cargados",
    unavailable_episode: "Capítulo no cargado",
    games_in_construction: "Juegos en construcción",
    select_movie: "Seleccionar película",
    movie_library: "Todas las películas",
    movie_details: "Ver detalles",
    movie_download: "Descargar",
    episode_download: "Descargar capítulo",
    movie_view_grid: "Vista mosaico",
    movie_view_list: "Vista listado",
    movie_sort_name: "Nombre",
    movie_sort_year: "Año",
    movie_sort_rating: "Puntuación",
    movie_sort_label: "Ordenar por",
    series_library: "Todas las series",
    select_series: "Seleccionar serie",
    no_movies_available: "Sin películas disponibles",
    no_seasons_available: "Sin temporadas disponibles",
    seasons_label: "TEMPORADAS",
    chapters_summary: "Capítulos",
    series_stats_seasons: "Temp.",
    series_stats_hours: "Horas",
    series_runtime_estimated: "Duración total aproximada",
    loading_movie_runtime: "{minutes} minutos",
    tmdb_rating_missing: "Valoración TMDB no disponible",
    movie_file_label: "FICHA DE LA PELÍCULA",
    release: "Estreno",
    duration: "Duración",
    rating: "Valoración (TMDB)",
    genres: "Categorías",
    movie_filter: "Filtrar por nombre",
    movie_filter_title: "Buscar y filtrar",
    movie_filter_search: "Buscar por nombre",
    movie_filter_search_placeholder: "Escribe un nombre",
    movie_filter_categories: "Categorías",
    movie_filter_awards: "Películas premiadas",
    movie_filter_awards_hint: "Muestra las ganadoras de cualquiera de los premios seleccionados.",
    movie_filter_award_oscars: "Óscar a mejor película",
    movie_filter_award_palme: "Palma de Oro",
    movie_filter_award_goya: "Goya a mejor película",
    movie_filter_clear: "Limpiar filtros",
    media_filter_favorites: "Mostrar solo favoritos",
    movie_filter_genres_hint: "Muestra películas de cualquiera de las categorías seleccionadas.",
    movie_filter_genres_empty: "No hay categorías disponibles.",
    movie_filter_no_results: "No hay elementos que coincidan con los filtros.",
    movie_filter_count: "Mostrando {shown} de {total}",
    synopsis: "Sinopsis",
    release_unknown: "Fecha de estreno no disponible",
    duration_unknown: "Duración no disponible",
    empty_library_series_copy:
      "Si quieres añadir contenido de series, puedes hacerlo desde la sección Uploads.",
    empty_library_movies_copy:
      "Si quieres añadir contenido de película, puedes hacerlo desde la sección Uploads.",
    go_to_uploads: "Uploads",
  },
  ca: {
    media_series: "Sèries",
    media_movies: "Pel·lícules",
    media_games: "Jocs",
    media_books: "Llibres",
    book_library: "Biblioteca",
    book_enter: "Entrar",
    book_collection_count: "Col·lecció · {count} llibre(s)",
    book_library_items: "llibres i col·leccions",
    media_pictures: "Fotos",
    media_series_singular: "sèrie",
    media_movies_singular: "pel·lícula",
    media_games_singular: "joc",
    media_books_singular: "llibre",
    book_open_title: "On el vols obrir?",
    book_open_copy: "Tria on llegir «{name}».",
    book_open_browser: "Obrir al navegador",
    book_open_raspberry: "Obrir a la Raspberry",
    book_open_raspberry_busy: "Obrint a la Raspberry…",
    book_open_raspberry_failed: "No s'ha pogut obrir el llibre a la Raspberry.",
    raspberry_dashboard: "Dashboard",
    users_title: "Users",
    raspberry_controls: "Controls",
    raspberry_uploads: "Uploads",
    upload_series: "Sèrie",
    upload_movie: "Pel·lícula",
    upload_movie_title_field: "Títol de la pel·lícula",
    movie_subtitles: "Subtítols externs (.srt, opcional)",
    movie_subtitles_hint: "Es desarà al costat del vídeo, amb el mateix nom i extensió .srt. Substitueix el SRT existent.",
    movie_subtitles_failed: "El vídeo s’ha desat, però els subtítols no. Pots tornar a pujar-los des de l’edició de la fitxa.",
    upload_game: "Joc",
    upload_books: "Llibres",
    upload_pictures: "Fotos",
    upload_pictures_dropzone_copy: "Puja una foto o una carpeta completa. S'admeten JPEG, PNG, WebP, GIF, BMP, AVIF i HEIC.",
    language_spanish: "Castellà",
    language_catalan: "Català",
    language_english: "English",
    back: "Tornar",
    episode_label: "Capítol",
    mark_watched: "Vist",
    mark_unwatched: "No vist",
    mark_favorite: "Favorit",
    mark_not_favorite: "No favorit",
    movie_favorite_add: "Afegir a favorits",
    movie_favorite_remove: "Treure de favorits",
    movie_favorite_add_confirm: "Segur que vols afegir «{name}» a favorits?",
    movie_favorite_remove_confirm: "Segur que vols treure «{name}» de favorits?",
    mark_all_watched: "Marcar tots com a vistos",
    mark_all_unwatched: "Marcar tots com a no vistos",
    mark_season_confirm: "Vols marcar tots els capítols de «{season}» com a {state}?",
    mark_save_error: "No s’han pogut desar les marques en aquest navegador.",
    episodes: "capítols",
    prev_image: "Imatge anterior",
    next_image: "Imatge següent",
    image_gallery: "Galeria d'imatges",
    go_to_image: "Anar a la imatge {index}",
    no_images_available: "No hi ha imatges disponibles",
    close: "Tancar",
    not_available: "No disponible",
    play_on_tv: "Reproduir a miniTV",
    play_in_browser: "Reproduir al navegador",
    play_on_external_monitor: "Reproduir en Monitor Extern",
    browser_player: "Reproductor web",
    playing_now: "Reproduint...",
    synopsis_unavailable: "Sinopsi no disponible.",
    games_reserved: "Aquesta secció de personalització encara no té accions disponibles.",
    mini_tv_title: "Mini-tele",
    mini_tv_config: "Configuració",
    mini_tv_copy: "Aquest diàleg queda preparat per configurar la mini-tele de la capçalera. A la següent iteració hi connectem les opcions reals.",
    done_close: "Tancar",
    settings_of: "Ajustos de la {media}",
    visible_name: "Nom visible",
    imdb_url: "URL d'IMDb",
    imdb_url_placeholder: "https://www.imdb.com/title/tt.../",
    imdb_link: "Enllaç a la fitxa d'IMDb",
    tmdb_link: "Enllaç a la fitxa de TMDB",
    imdb_no_link: "Sense enllaç a URL",
    rotten_tomatoes_url: "URL de Rotten Tomatoes",
    rotten_tomatoes_url_placeholder: "https://www.rottentomatoes.com/m/...",
    rotten_tomatoes_link: "Enllaç a la fitxa de Rotten Tomatoes",
    rotten_tomatoes_no_link: "Sense enllaç a URL",
    image_header: "Imatge de capçalera",
    poster_preview: "Vista prèvia del cartell",
    vertical_position: "Posició vertical del cartell",
    confirm_delete: "Segur que vols eliminar la {media} \"{name}\"?",
    confirm_delete_title: "Eliminar {media}",
    delete_media: "Eliminar {media}",
    delete_season: "Eliminar temporada",
    delete_episode: "Eliminar capítol",
    save: "Desar",
    cancel: "Cancel·lar",
    name_of_media: "Nom de la {media}",
    search_write_media: "Escriu una {media} per cercar.",
    no_movie_results: "No s'han trobat pel·lícules per a aquesta cerca.",
    no_series_results: "No s'han trobat sèries per a aquesta cerca.",
    tmdb_search_failed: "No s'ha pogut cercar a TMDB.",
    add_media_failed: "No s'ha pogut afegir la {media}.",
    games_section_reserved: "Aquest diàleg queda reservat per a futures accions de jocs.",
    add_media: "Afegir {media}",
    search_tmdb: "Cercar a TMDB",
    search: "Cerca",
    search_placeholder_movie: "Exemple: Toy Story",
    search_placeholder_series: "Exemple: Futurama",
    clear_search: "Esborrar cerca",
    search_button: "Cercar",
    searching_button: "Cercant...",
    search_results_for: "Resultats de {media}",
    no_tmdb_description: "Sense descripció disponible a TMDB.",
    search_to_see_results: "Cerca una {media} per veure aquí els resultats.",
    adding_button: "Afegint...",
    add_button: "Afegir",
    raspberry_tv_alt: "MiniTV",
    raspberry_sections: "Seccions de Raspberry",
    dashboard_general_title: "Informació general",
    dashboard_clock_title: "Configuració del rellotge",
    dashboard_auxiliary_title: "Serveis auxiliars",
    logout_title: "Tancar la sessió",
    logout_copy: "En tancar la sessió, hauràs d’introduir el PIN per tornar a accedir.",
    stats_series_installed: "Sèries instal·lades",
    stats_movies_installed: "Pel·lícules instal·lades",
    stats_games_installed: "Jocs instal·lats",
    stats_books_installed: "Llibres instal·lats",
    stats_pictures_installed: "Fotos instal·lades",
    section_storage_used: "{gb} GB · {percent} utilitzat de multimedia",
    used_percent: "{percent} utilitzat",
    language_title: "Idioma",
    language_microtv: "Selecciona l'idioma de la mini tele.",
    language_cover_notice: "En canviar l’idioma, també canviaran les portades de totes les pel·lícules i sèries desades, ja que estan localitzades segons l’idioma seleccionat.",
    language_updating: "S'està actualitzant l'idioma...",
    language_update_failed: "No s'ha pogut actualitzar l'idioma de la Raspberry.",
    microsd_capacity: "Capacitat de l'SSD",
    multimedia_occupied: "Ocupat per MultimediaContent",
    occupied: "ocupat",
    alarms_title: "Alarmes de la televisió",
    alarms_copy: "Programa l'hora a la qual ha de sonar l'alarma de la mini tele.",
    alarm_item: "Alarma {index}",
    alarm_sound_select: "So de l'alarma {index}",
    alarm_preview_select: "So per provar",
    no_alarm_sounds: "No hi ha sons disponibles",
    birthdays_title: "Aniversaris i sants",
    birthdays_copy: "Gestiona les dates que es mostraran a l'apartat de l'hora.",
    birthday: "Aniversari",
    saint: "Sant",
    person_name: "Nom de la persona",
    event_day: "Dia",
    event_month: "Mes",
    birth_year_optional: "Any de naixement (opcional)",
    add_event: "Afegeix data",
    save_changes: "Desa els canvis",
    edit: "Modifica",
    delete: "Esborra",
    no_birthdays: "Encara no hi ha aniversaris ni sants desats.",
    birthday_saved: "Data desada",
    birthday_error: "No s'ha pogut desar la llista.",
    birthday_invalid: "Introdueix un nom i una data vàlida.",
    delete_event_title: "Vols esborrar aquesta data?",
    delete_event_copy: "S'eliminarà {name} de la llista d'aniversaris i sants.",
    weather_location_title: "Ubicació del temps",
    weather_location_copy: "Ciutat o codi postal que es mostrarà al rellotge de la mini tele.",
    weather_location_placeholder: "Ex. Barcelona, Espanya",
    weather_location_save: "Desa la ubicació",
    weather_location_saved: "Ubicació desada",
    weather_location_error: "No s'ha pogut desar la ubicació.",
    weather_location_not_found: "Ubicació desada, però no s'ha pogut trobar informació per a aquest codi postal.",
    tmdb_settings_title: "Configuració de l'API de TMDB",
    tmdb_settings_copy: "Introdueix una API key o un token d'accés. Si n'hi ha tots dos, s'utilitzarà el token.",
    tmdb_api_key: "API key",
    tmdb_bearer_token: "Token d'accés",
    tmdb_settings_save: "Desa la configuració",
    tmdb_settings_saved: "Configuració de TMDB desada",
    tmdb_settings_error: "No s'ha pogut desar la configuració de TMDB.",
    weather_resolved_title: "Informació de la ubicació",
    weather_city: "Ciutat",
    weather_region: "Província / regió",
    weather_country: "País",
    weather_postal_code: "Codi postal",
    weather_coordinates: "Coordenades",
    weather_timezone: "Zona horària",
    weather_temperature: "Temperatura",
    weather_feels_like: "Sensació tèrmica",
    weather_wind: "Vent",
    on: "On",
    off: "Off",
    playback_current: "Reproducció actual",
    camera_title: "Càmera",
    camera_capture: "Veure càmera",
    camera_capturing: "Capturant...",
    camera_preview_hint: "Prem el botó per veure què captura la càmera.",
    camera_preview_alt: "Captura actual de la càmera",
    camera_capture_error: "No s'ha pogut obtenir la imatge de la càmera.",
    content_in_progress: "Contingut en curs",
    nothing_playing: "No s'està reproduint res",
    season_label: "Temporada",
    now_playing_episode_label: "Episodi",
    playback_detected: "Reproducció detectada a la Raspberry.",
    playback_controls_hint: "Quan la tele estigui reproduint alguna cosa, aquí apareixeran els controls actius.",
    dev_playback_preview: "Vista prèvia dev",
    dev_playback_toggle: "Simular reproducció",
    play: "Play",
    refresh: "Actualitzar",
    pause: "Pausar",
    stop: "Aturar",
    next_episode: "Capítol següent",
    volume_down: "Volum -",
    volume_up: "Volum +",
    subtitle_loading: "Carregant subtítols…",
    subtitle_load_failed: "No s’han pogut carregar els subtítols. Tanca el reproductor i torna-ho a provar.",
    subtitle_toggle: "Activar/desactivar subtítols",
    subtitle_next: "Pista de subtítols següent",
    subtitle_on: "Subtítols activats",
    subtitle_off: "Subtítols desactivats",
    subtitle_external: "Pista externa",
    subtitle_embedded: "Pista integrada",
    subtitle_queued: "Ordre enviada. Comprova els subtítols a la pantalla de reproducció.",
    subtitle_none: "Aquest vídeo no té subtítols seleccionables.",
    subtitle_not_playing: "Inicia un vídeo a la MiniTV o monitor extern i torna-ho a provar.",
    subtitle_control_failed: "No s’han pogut canviar els subtítols.",
    power_off: "Apagar mini tele",
    power_off_confirm_title: "Apagar mini tele",
    power_off_confirm_copy: "Segur que vols apagar la mini televisió?",
    power_off_confirm_action: "Apagar",
    add_content: "Afegir contingut",
    select_type: "Selecciona un tipus",
    drag_here_click: "Arrossega aquí el teu contingut o fes clic per obrir el diàleg",
    upload_series_dropzone_copy:
      "S'obrirà un diàleg de coincidència TMDB fent servir el nom del directori seleccionat o arrossegat a aquesta zona. Abans de confirmar podràs editar la cerca.",
    upload_movie_dropzone_copy:
      "S'obrirà un diàleg de coincidència TMDB fent servir el nom del fitxer seleccionat o arrossegat a aquesta zona. Abans de confirmar podràs editar la cerca.",
    upload_game_dropzone_copy: "Puja una ROM i tria la consola. Pots afegir caràtula, imatges i descripció.",
    upload_books_dropzone_copy: "Adjunta PDF, EPUB, CBZ o CBR, o arrossega una carpeta completa per crear una col·lecció.",
    latest_detection: "Última detecció",
    games: "Jocs",
    upload_games_pending: "La pujada guiada per a jocs queda preparada visualment i la connectem a la següent iteració.",
    games_empty_title: "Sense jocs instal·lats",
    games_empty_copy: "Puja una ROM de Game Boy, Game Boy Color o Game Boy Advance per crear la biblioteca.",
    game_file_label: "Fitxa del joc",
    game_platform_label: "Tipus de joc",
    file_label: "Fitxer",
    play_game_on_raspberry: "Jugar a la Raspberry",
    play_game_in_browser: "Jugar des del navegador",
    browser_game_player: "Joc al navegador",
    browser_game_unsupported: "Aquesta consola encara no és compatible amb el navegador",
    playing_game: "Obrint joc...",
    games_upload_title: "Dades del joc",
    games_edit_title: "Editar joc",
    games_search_placeholder: "Exemple: Tetris DX",
    games_default_cover: "Default",
    games_manual_profile: "Fitxa manual amb caràtula per defecte",
    games_cover_picker: "Caràtula",
    games_current_images: "Imatges actuals",
    games_name_field: "Nom",
    games_description_field: "Descripció",
    games_description_placeholder: "Una descripció curta per reconèixer el joc a la biblioteca.",
    games_cover_file_field: "Imatge de caràtula",
    games_new_cover_field: "Nova caràtula",
    games_extra_images_field: "Imatges addicionals",
    games_new_images_field: "Afegir imatges al carrusel",
    games_set_cover: "Fer servir com a caràtula",
    games_remove_image: "Treure imatge",
    games_cover_selected: "Caràtula seleccionada",
    games_no_results: "No s'ha trobat cap joc amb aquest nom per a la consola seleccionada. Prova un altre nom o revisa la consola.",
    games_search_choose_platform: "Selecciona una consola per cercar la fitxa del joc.",
    games_search_enter_name: "Escriu el nom del joc per cercar-ne la fitxa.",
    games_info_title: "Informació del joc",
    games_storyline: "Argument",
    games_media_title: "Multimèdia",
    games_gallery_title: "Imatges",
    games_image_number: "Imatge {number}",
    games_enlarge_image: "Ampliar imatge",
    games_file_details: "Arxiu i font de la fitxa",
    games_videos_label: "Vídeos",
    games_video_title: "Vídeos del joc",
    games_video_choose: "Tria un vídeo",
    games_video_open: "Veure a YouTube",
    games_video_online: "Cal connexió a Internet. Si el vídeo no es pot reproduir aquí, obre'l a YouTube.",
    games_video_missing: "Aquesta fitxa no té vídeos de YouTube associats. Pots cercar un gameplay per nom i consola.",
    games_video_search: "Cercar gameplay a YouTube",
    youtube_title: "Més gameplays a YouTube",
    youtube_query: "Cerca vídeos per nom i consola",
    youtube_setup: "Configura YouTube Data API v3 a Dashboard → Serveis auxiliars → YouTube Data API v3 per cercar vídeos aquí. La clau d’IGDB no serveix per a YouTube.",
    youtube_empty: "No s’han trobat vídeos. Prova un altre nom o consola.",
    youtube_quota: "S’ha esgotat la quota de cerca de YouTube. Torna-ho a provar més tard.",
    youtube_config_error: "Revisa la clau de YouTube i que YouTube Data API v3 estigui habilitada al projecte de Google Cloud.",
    youtube_error: "No s’ha pogut cercar a YouTube. Pots tornar-ho a provar.",
    youtube_results: "Resultats de YouTube. Comprova que el vídeo correspon al joc i la consola.",
    games_search_empty: "Escriu un joc per cercar.",
    games_search_failed: "No s'ha pogut buscar la fitxa del joc.",
    games_api_not_configured: "Configura ScreenScraper o IGDB a la Raspberry per descarregar la fitxa, caràtules i captures.",
    games_metadata_intro: "Cerquem el joc per desar-ne la fitxa, caràtules i captures al dispositiu. Tria la coincidència correcta.",
    games_metadata_selected: "Fitxa seleccionada. Es desaran totes les dades i imatges disponibles.",
    games_metadata_saving: "Desant fitxa i imatges…",
    games_metadata_retry: "Completar fitxa i imatges",
    games_metadata_partial: "La fitxa està desada, però algunes imatges no s’han descarregat. Pots reintentar-ho.",
    games_metadata_ambiguous: "Hi ha diverses coincidències. Selecciona la fitxa del joc per completar-la.",
    games_metadata_pending: "El joc està desat. Falta completar-ne la fitxa i les imatges.",
    games_release_date: "Llançament",
    games_developers: "Desenvolupador",
    games_publishers: "Distribuïdor",
    games_genres: "Gèneres",
    games_players: "Jugadors",
    games_modes: "Modes de joc",
    games_rating: "Puntuació",
    upload_game_invalid_title: "Fitxer de joc no compatible",
    upload_game_invalid_copy: "Selecciona un únic fitxer de joc compatible.",
    upload_game_detected: "{name} detectat com {platform}. Afegeix la caràtula i descripció abans de pujar.",
    upload_game_done_summary: "{name} afegit a Games: {path}",
    upload_game_failed: "No s'ha pogut pujar el joc.",
    access_protected: "Accés protegit",
    app_title: "Gestor de MiniTV Raspberry",
    protected_access: "Accés protegit",
    manager_title: "Gestor de MiniTV Raspberry Pi",
    unlock_copy: "Introdueix el PIN numèric de 4 dígits configurat a la Raspberry.",
    validating: "Validant...",
    show_password: "Mostra el PIN",
    hide_password: "Amaga el PIN",
    enter: "Entrar",
    loading_movies: "Carregant pel·lícules...",
    loading_seasons: "Carregant temporades...",
    seasons_load_error: "No s’han pogut carregar les temporades",
    retry_load: "Torna-ho a provar",
    loading_library: "Carregant biblioteca",
    loading_details: "Carregant contingut",
    loading_movie_copy: "Estic preparant la portada i les dades TMDB de la pel·lícula seleccionada.",
    loading_series_copy: "Estic preparant la portada i la cartellera TMDB de la sèrie seleccionada.",
    connection_error: "Error de connexió",
    loading_episodes: "Carregant capítols...",
    reading_season: "Estic llegint la temporada seleccionada des de TMDB.",
    add_movie_prompt: "Afegeix una pel·lícula des de TMDB amb el botó + per començar aquesta llista.",
    no_season_info: "No hi ha informació de temporades disponible per a la sèrie seleccionada.",
    pin_digits: "Introdueix un PIN numèric de 4 dígits.",
    pin_validate_failed: "No s'ha pogut validar el PIN.",
    save_changes_failed: "No s'han pogut desar els canvis.",
    delete_media_failed: "No s'ha pogut eliminar la {media}.",
    invalid_episode_id: "No s'ha pogut convertir l'episodi al format SxxExx.",
    play_episode_failed: "No s'ha pogut reproduir l'episodi.",
    raspberry_status_failed: "No s'ha pogut llegir l'estat de la Raspberry.",
    movie_match_not_found: "No he trobat un fitxer de vídeo a la Raspberry que coincideixi amb aquesta pel·lícula.",
    play_movie_failed: "No s'ha pogut reproduir la pel·lícula.",
    power_off_failed: "No s'ha pogut apagar la mini televisió.",
    pause_not_available: "L'API actual de la Raspberry encara no exposa una acció de pausa diferenciada.",
    next_episode_not_found: "No he trobat un capítol següent per a la reproducció actual.",
    upload_games_detected: "S'han detectat {count} arxiu(s). La pujada guiada de jocs arribarà després.",
    upload_name_not_detected: "No he pogut detectar un nom útil per cercar a TMDB.",
    upload_detected_summary: "{count} arxiu(s) detectats. Cerca preparada per a {media}: \"{name}\".",
    upload_series_requires_directory: "Selecciona o arrossega un únic directori de sèrie.",
    upload_series_subdirectories_error: "Tot el contingut de la sèrie ha d'estar dins del directori, sense subdirectoris.",
    upload_series_format_error: "Tots els fitxers han de contenir el format SxxExx.",
    upload_duplicates_title: "La sèrie ja conté capítols",
    upload_existing_title: "El contingut ja existeix",
    upload_existing_copy: "{existing} fitxer(s) ja existeixen. Vols sobreescriure’ls? Si cancel·les, es conservarà el contingut actual.",
    upload_replace: "Sí, sobreescriure",
    upload_duplicates_copy: "{existing} de {total} vídeos ja estan carregats a la Raspberry. Què vols fer?",
    upload_overwrite_existing: "Sobreescriure els existents",
    upload_only_new: "Pujar només els nous",
    upload_button: "Upload",
    tmdb_browser_title: "Descarregar torrent",
    select_game: "Selecciona un joc",
    games_filter: "Filtrar",
    games_show_options: "Mostrar opcions de jocs",
    games_hide_options: "Amagar opcions de jocs",
    tmdb_browser_search_label: "Cerca (utilitzant la base de dades de TMDB)",
    tmdb_browser_trailer: "Tràiler",
    tmdb_browser_no_trailer: "No hi ha cap tràiler de YouTube disponible.",
    tmdb_browser_copy:
      "Consulta les fitxes de sèries i pel·lícules a TMDB, tria un torrent i segueix-ne la descàrrega al dashboard. A les sèries pots cercar per temporada i capítol.",
    tmdb_browser_open: "Cercar torrent",
    game_browser_title: "Cercar fitxa de joc",
    game_browser_copy:
      "Cerca una ROM pel nom per revisar caràtula, plataforma i descripció dins de la web abans de pujar-la.",
    game_browser_open: "Cercar fitxa",
    game_browser_results: "Resultats de jocs",
    game_browser_select_prompt: "Marca un resultat per revisar-ne la fitxa i les caràtules.",
    game_browser_search_intro: "Cerca un joc per veure els resultats aquí.",
    game_browser_loading: "Carregant fitxa del joc...",
    game_browser_platform: "Plataforma",
    game_browser_source: "Font",
    tmdb_browser_preview: "Visualitzar",
    tmdb_browser_results: "Resultats TMDB",
    tmdb_browser_select_prompt: "Visualitza un resultat per revisar temporades, capítols o dades de la pel·lícula.",
    tmdb_browser_loading: "Carregant fitxa TMDB...",
    tmdb_browser_load_failed: "No s'ha pogut carregar la fitxa TMDB.",
    tmdb_browser_search_intro: "Cerca una sèrie o pel·lícula per veure'n la fitxa aquí.",
    tmdb_browser_season_prompt: "Selecciona una temporada per veure'n els capítols.",
    upload_copying: "Copiant el contingut a la Raspberry...",
    upload_chapter_copying: "Carregant {current} de {total} capítols",
    upload_saving: "Desant a la Raspberry...",
    upload_all_done: "Tot s'ha pujat correctament.",
    book_upload_loading: "Carregant llibres…",
    book_upload_complete: "Càrrega completada",
    book_upload_error: "Error en carregar",
    book_upload_failed: "No s'han pogut carregar els llibres.",
    upload_cancel_confirm: "Eips, s'està pujant contingut a la Raspberry. Segur que vols cancel·lar la pujada?",
    upload_close_confirm: "Eips, s'està pujant contingut a la Raspberry. Si tanques aquesta finestra es cancel·larà la pujada. Segur?",
    upload_canceled: "Pujada cancel·lada.",
    upload_done_summary: "{name} afegida a Movies: {path}",
    upload_series_done_summary: "{name} afegida a TVShows: {path}",
    unavailable_season: "Temporada sense capítols carregats",
    unavailable_episode: "Capítol no carregat",
    games_in_construction: "Jocs en construcció",
    select_movie: "Seleccionar pel·lícula",
    movie_library: "Totes les pel·lícules",
    movie_details: "Veure detalls",
    movie_download: "Descarregar",
    episode_download: "Descarregar capítol",
    movie_view_grid: "Vista mosaic",
    movie_view_list: "Vista llista",
    movie_sort_name: "Nom",
    movie_sort_year: "Any",
    movie_sort_rating: "Puntuació",
    movie_sort_label: "Ordenar per",
    series_library: "Totes les sèries",
    select_series: "Seleccionar sèrie",
    no_movies_available: "No hi ha pel·lícules disponibles",
    no_seasons_available: "No hi ha temporades disponibles",
    seasons_label: "TEMPORADES",
    chapters_summary: "Capítols",
    series_stats_seasons: "Temp.",
    series_stats_hours: "Hores",
    series_runtime_estimated: "Durada total aproximada",
    loading_movie_runtime: "{minutes} minuts",
    tmdb_rating_missing: "Valoració TMDB no disponible",
    movie_file_label: "FITXA DE LA PEL·LÍCULA",
    release: "Estrena",
    duration: "Durada",
    rating: "Valoració (TMDB)",
    genres: "Categories",
    movie_filter: "Filtrar per nom",
    movie_filter_title: "Cercar i filtrar",
    movie_filter_search: "Cercar per nom",
    movie_filter_search_placeholder: "Escriu un nom",
    movie_filter_categories: "Categories",
    movie_filter_awards: "Pel·lícules premiades",
    movie_filter_awards_hint: "Mostra les guanyadores de qualsevol dels premis seleccionats.",
    movie_filter_award_oscars: "Òscar a millor pel·lícula",
    movie_filter_award_palme: "Palma d’Or",
    movie_filter_award_goya: "Goya a millor pel·lícula",
    movie_filter_clear: "Netejar filtres",
    media_filter_favorites: "Mostrar només favorits",
    movie_filter_genres_hint: "Mostra pel·lícules de qualsevol de les categories seleccionades.",
    movie_filter_genres_empty: "No hi ha categories disponibles.",
    movie_filter_no_results: "No hi ha elements que coincideixin amb els filtres.",
    movie_filter_count: "Mostrant {shown} de {total}.",
    synopsis: "Sinopsi",
    release_unknown: "Data d'estrena no disponible",
    duration_unknown: "Durada no disponible",
    empty_library_series_copy:
      "Si vols afegir contingut de sèrie, ho pots fer des de la secció Uploads.",
    empty_library_movies_copy:
      "Si vols afegir contingut de pel·lícula, ho pots fer des de la secció Uploads.",
    go_to_uploads: "Uploads",
  },
  en: {
    media_series: "Series",
    media_movies: "Movies",
    media_games: "Games",
    media_books: "Books",
    book_library: "Library",
    book_enter: "Enter",
    book_collection_count: "Collection · {count} book(s)",
    book_library_items: "books and collections",
    media_pictures: "Pictures",
    media_series_singular: "series",
    media_movies_singular: "movie",
    media_games_singular: "game",
    media_books_singular: "book",
    book_open_title: "Where do you want to open it?",
    book_open_copy: "Choose where to read “{name}”.",
    book_open_browser: "Open in browser",
    book_open_raspberry: "Open on Raspberry",
    book_open_raspberry_busy: "Opening on Raspberry…",
    book_open_raspberry_failed: "The book could not be opened on the Raspberry.",
    raspberry_dashboard: "Dashboard",
    users_title: "Users",
    raspberry_controls: "Controls",
    raspberry_uploads: "Uploads",
    upload_series: "Series",
    upload_movie: "Movie",
    upload_movie_title_field: "Movie title",
    movie_subtitles: "External subtitles (.srt, optional)",
    movie_subtitles_hint: "Saved beside the video with the same name and .srt extension. Replaces the existing SRT.",
    movie_subtitles_failed: "The video was saved, but the subtitles were not. Retry from the movie details editor.",
    upload_game: "Game",
    upload_books: "Books",
    upload_pictures: "Pictures",
    upload_pictures_dropzone_copy: "Upload one picture or a complete folder. JPEG, PNG, WebP, GIF, BMP, AVIF and HEIC are supported.",
    language_spanish: "Spanish",
    language_catalan: "Catalan",
    language_english: "English",
    back: "Back",
    episode_label: "Episode",
    mark_watched: "Watched",
    mark_unwatched: "Unwatched",
    mark_favorite: "Favorite",
    mark_not_favorite: "Not favorite",
    movie_favorite_add: "Add to favorites",
    movie_favorite_remove: "Remove from favorites",
    movie_favorite_add_confirm: "Are you sure you want to add “{name}” to favorites?",
    movie_favorite_remove_confirm: "Are you sure you want to remove “{name}” from favorites?",
    mark_all_watched: "Mark all as watched",
    mark_all_unwatched: "Mark all as unwatched",
    mark_season_confirm: "Mark all episodes of “{season}” as {state}?",
    mark_save_error: "Could not save your marks in this browser.",
    episodes: "episodes",
    prev_image: "Previous image",
    next_image: "Next image",
    image_gallery: "Image gallery",
    go_to_image: "Go to image {index}",
    no_images_available: "No images available",
    close: "Close",
    not_available: "Not available",
    play_on_tv: "Play on miniTV",
    play_in_browser: "Play in browser",
    play_on_external_monitor: "Play on External Monitor",
    browser_player: "Web player",
    playing_now: "Playing...",
    synopsis_unavailable: "Synopsis unavailable.",
    games_reserved: "This customization section has no actions available yet.",
    mini_tv_title: "Mini TV",
    mini_tv_config: "Settings",
    mini_tv_copy: "This dialog is ready to configure the header mini TV. In the next iteration we will connect the real options.",
    done_close: "Close",
    settings_of: "{media} settings",
    visible_name: "Visible name",
    imdb_url: "IMDb URL",
    imdb_url_placeholder: "https://www.imdb.com/title/tt.../",
    imdb_link: "Link to the IMDb page",
    tmdb_link: "Link to the TMDB page",
    imdb_no_link: "No URL link",
    rotten_tomatoes_url: "Rotten Tomatoes URL",
    rotten_tomatoes_url_placeholder: "https://www.rottentomatoes.com/m/...",
    rotten_tomatoes_link: "Link to the Rotten Tomatoes page",
    rotten_tomatoes_no_link: "No URL link",
    image_header: "Header image",
    poster_preview: "Poster preview",
    vertical_position: "Poster vertical position",
    confirm_delete: "Are you sure you want to delete the {media} \"{name}\"?",
    confirm_delete_title: "Delete {media}",
    delete_media: "Delete {media}",
    delete_season: "Delete season",
    delete_episode: "Delete episode",
    save: "Save",
    cancel: "Cancel",
    name_of_media: "{media} name",
    search_write_media: "Type a {media} to search.",
    no_movie_results: "No movies were found for that search.",
    no_series_results: "No series were found for that search.",
    tmdb_search_failed: "TMDB search failed.",
    add_media_failed: "Could not add the {media}.",
    games_section_reserved: "This dialog is reserved for future game actions.",
    add_media: "Add {media}",
    search_tmdb: "Search on TMDB",
    search: "Search",
    search_placeholder_movie: "Example: Toy Story",
    search_placeholder_series: "Example: Futurama",
    clear_search: "Clear search",
    search_button: "Search",
    searching_button: "Searching...",
    search_results_for: "{media} results",
    no_tmdb_description: "No description available on TMDB.",
    search_to_see_results: "Search for a {media} to see results here.",
    adding_button: "Adding...",
    add_button: "Add",
    raspberry_tv_alt: "MiniTV",
    raspberry_sections: "Raspberry sections",
    dashboard_general_title: "General information",
    dashboard_clock_title: "Clock settings",
    dashboard_auxiliary_title: "Auxiliary services",
    logout_title: "Log out",
    logout_copy: "You will need to enter the PIN to access the app again.",
    stats_series_installed: "Installed series",
    stats_movies_installed: "Installed movies",
    stats_games_installed: "Installed games",
    stats_books_installed: "Installed books",
    stats_pictures_installed: "Installed photos",
    section_storage_used: "{gb} GB · {percent} used of multimedia",
    used_percent: "{percent} used",
    language_title: "Language",
    language_microtv: "Choose the mini TV language.",
    language_cover_notice: "Changing the language also changes the posters of all saved movies and TV series, as posters are localized for the selected language.",
    language_updating: "Updating language...",
    language_update_failed: "Could not update the Raspberry language.",
    microsd_capacity: "SSD capacity",
    multimedia_occupied: "Used by MultimediaContent",
    occupied: "used",
    alarms_title: "TV alarms",
    alarms_copy: "Set the time when the mini TV alarm should ring.",
    alarm_item: "Alarm {index}",
    alarm_sound_select: "Alarm {index} sound",
    alarm_preview_select: "Sound to preview",
    no_alarm_sounds: "No sounds available",
    birthdays_title: "Birthdays and name days",
    birthdays_copy: "Manage the dates shown on the clock screen.",
    birthday: "Birthday",
    saint: "Name day",
    person_name: "Person's name",
    event_day: "Day",
    event_month: "Month",
    birth_year_optional: "Birth year (optional)",
    add_event: "Add date",
    save_changes: "Save changes",
    edit: "Edit",
    delete: "Delete",
    no_birthdays: "No birthdays or name days have been saved yet.",
    birthday_saved: "Date saved",
    birthday_error: "Could not save the list.",
    birthday_invalid: "Enter a name and a valid date.",
    delete_event_title: "Delete this date?",
    delete_event_copy: "{name} will be removed from the birthday and name-day list.",
    weather_location_title: "Weather location",
    weather_location_copy: "City or postal code shown on the mini TV clock.",
    weather_location_placeholder: "E.g. London, United Kingdom",
    weather_location_save: "Save location",
    weather_location_saved: "Location saved",
    weather_location_error: "Could not save the location.",
    weather_location_not_found: "Location saved, but no information was found for that postal code.",
    tmdb_settings_title: "TMDB API settings",
    tmdb_settings_copy: "Enter an API key or access token. When both are present, the token is used.",
    tmdb_api_key: "API key",
    tmdb_bearer_token: "Access token",
    tmdb_settings_save: "Save settings",
    tmdb_settings_saved: "TMDB settings saved",
    tmdb_settings_error: "Could not save the TMDB settings.",
    weather_resolved_title: "Location information",
    weather_city: "City",
    weather_region: "Province / region",
    weather_country: "Country",
    weather_postal_code: "Postal code",
    weather_coordinates: "Coordinates",
    weather_timezone: "Time zone",
    weather_temperature: "Temperature",
    weather_feels_like: "Feels like",
    weather_wind: "Wind",
    on: "On",
    off: "Off",
    playback_current: "Current playback",
    camera_title: "Camera",
    camera_capture: "View camera",
    camera_capturing: "Capturing...",
    camera_preview_hint: "Press the button to see what the camera captures.",
    camera_preview_alt: "Current camera capture",
    camera_capture_error: "Could not get an image from the camera.",
    content_in_progress: "Content in progress",
    nothing_playing: "Nothing is playing",
    season_label: "Season",
    now_playing_episode_label: "Episode",
    playback_detected: "Playback detected on the Raspberry.",
    playback_controls_hint: "When something is playing on the TV, the active controls will appear here.",
    dev_playback_preview: "Dev preview",
    dev_playback_toggle: "Simulate playback",
    play: "Play",
    refresh: "Refresh",
    pause: "Pause",
    stop: "Stop",
    next_episode: "Next episode",
    volume_down: "Volume -",
    volume_up: "Volume +",
    subtitle_loading: "Loading subtitles…",
    subtitle_load_failed: "Could not load subtitles. Close the player and try again.",
    subtitle_toggle: "Toggle subtitles",
    subtitle_next: "Next subtitle track",
    subtitle_on: "Subtitles on",
    subtitle_off: "Subtitles off",
    subtitle_external: "External track",
    subtitle_embedded: "Embedded track",
    subtitle_queued: "Command sent. Check subtitles on the playback screen.",
    subtitle_none: "This video has no selectable subtitles.",
    subtitle_not_playing: "Start a video on the MiniTV or external monitor and try again.",
    subtitle_control_failed: "Could not change subtitles.",
    power_off: "Power off mini TV",
    power_off_confirm_title: "Power off mini TV",
    power_off_confirm_copy: "Are you sure you want to turn off the mini TV?",
    power_off_confirm_action: "Power off",
    add_content: "Add content",
    select_type: "Select a type",
    drag_here_click: "Drag your content here or click to open a dialog",
    upload_series_dropzone_copy:
      "A TMDB match dialog will open using the selected or dropped folder name. Before confirming, you will be able to edit the search.",
    upload_movie_dropzone_copy:
      "A TMDB match dialog will open using the selected or dropped file name. Before confirming, you will be able to edit the search.",
    upload_game_dropzone_copy: "Upload a ROM and choose its console. Add cover art, images and a description. Disc games need a compatible self-contained CHD, ISO, CSO or PBP file.",
    upload_books_dropzone_copy: "Attach PDF, EPUB, CBZ, or CBR files, or drag a whole folder to create a collection.",
    latest_detection: "Latest detection",
    games: "Games",
    upload_games_pending: "Guided uploads for games are visually prepared and will be connected in the next iteration.",
    games_empty_title: "No games installed",
    games_empty_copy: "Upload a Game Boy, Game Boy Color, or Game Boy Advance ROM to build your library.",
    game_file_label: "Game details",
    game_platform_label: "Game type",
    file_label: "File",
    play_game_on_raspberry: "Play on Raspberry",
    play_game_in_browser: "Play in browser",
    browser_game_player: "Browser game",
    browser_game_unsupported: "This console is not supported in the browser yet",
    playing_game: "Opening game...",
    games_upload_title: "Game details",
    games_edit_title: "Edit game",
    games_search_placeholder: "Example: Tetris DX",
    games_default_cover: "Default",
    games_manual_profile: "Manual profile with the default cover",
    games_cover_picker: "Cover art",
    games_current_images: "Current images",
    games_name_field: "Name",
    games_description_field: "Description",
    games_description_placeholder: "A short description to recognize the game in your library.",
    games_cover_file_field: "Cover image",
    games_new_cover_field: "New cover",
    games_extra_images_field: "Additional images",
    games_new_images_field: "Add carousel images",
    games_set_cover: "Use as cover",
    games_remove_image: "Remove image",
    games_cover_selected: "Selected cover",
    games_no_results: "No games were found with that name for the selected console. Try another name or check the console.",
    games_search_choose_platform: "Select a console to search for game details.",
    games_search_enter_name: "Enter the game's name to search for its details.",
    games_info_title: "Game information",
    games_storyline: "Storyline",
    games_media_title: "Media",
    games_gallery_title: "Images",
    games_image_number: "Image {number}",
    games_enlarge_image: "Enlarge image",
    games_file_details: "File and metadata source",
    games_videos_label: "Videos",
    games_video_title: "Game videos",
    games_video_choose: "Choose video",
    games_video_open: "Watch on YouTube",
    games_video_online: "Internet connection required. If the video cannot play here, open it on YouTube.",
    games_video_missing: "This profile has no linked YouTube videos. You can search for gameplay by game name and console.",
    games_video_search: "Search gameplay on YouTube",
    youtube_title: "More gameplay on YouTube",
    youtube_query: "Search videos by game name and console",
    youtube_setup: "Configure YouTube Data API v3 in Dashboard → Auxiliary services → YouTube Data API v3 to search here. Your IGDB credentials do not work for YouTube.",
    youtube_empty: "No videos found. Try another game name or console.",
    youtube_quota: "YouTube search quota exceeded. Try again later.",
    youtube_config_error: "Check your YouTube key and enable YouTube Data API v3 in your Google Cloud project.",
    youtube_error: "Could not search YouTube. You can retry the search.",
    youtube_results: "YouTube results. Check that the video matches your game and console.",
    games_search_empty: "Type a game to search.",
    games_search_failed: "Could not search the game profile.",
    games_api_not_configured: "Configure ScreenScraper or IGDB on the Raspberry to download game details, covers and screenshots.",
    games_metadata_intro: "Find your game to save its details, covers and screenshots on the device. Choose the correct match.",
    games_metadata_selected: "Game selected. All available details and images will be saved.",
    games_metadata_saving: "Saving details and images…",
    games_metadata_retry: "Complete details and images",
    games_metadata_partial: "Game details are saved, but some images could not be downloaded. You can retry.",
    games_metadata_ambiguous: "Several games match. Select the correct game to complete its details.",
    games_metadata_pending: "The game is saved. Its details and images still need to be completed.",
    games_release_date: "Release date",
    games_developers: "Developer",
    games_publishers: "Publisher",
    games_genres: "Genres",
    games_players: "Players",
    games_modes: "Game modes",
    games_rating: "Rating",
    upload_game_invalid_title: "Unsupported game file",
    upload_game_invalid_copy: "Select a single supported game file.",
    upload_game_detected: "{name} detected as {platform}. Add the cover and description before uploading.",
    upload_game_done_summary: "{name} added to Games: {path}",
    upload_game_failed: "Could not upload the game.",
    access_protected: "Protected access",
    app_title: "Raspberry MiniTV Manager",
    protected_access: "Protected access",
    manager_title: "MiniTV Raspberry Pi Manager",
    unlock_copy: "Enter the 4-digit numeric PIN configured on the Raspberry.",
    validating: "Validating...",
    show_password: "Show PIN",
    hide_password: "Hide PIN",
    enter: "Enter",
    loading_movies: "Loading movies...",
    loading_seasons: "Loading seasons...",
    seasons_load_error: "Could not load seasons",
    retry_load: "Retry",
    loading_library: "Loading library",
    loading_details: "Loading content",
    loading_movie_copy: "Preparing the cover and TMDB data for the selected movie.",
    loading_series_copy: "Preparing the cover and TMDB lineup for the selected series.",
    connection_error: "Connection error",
    loading_episodes: "Loading episodes...",
    reading_season: "Reading the selected season from TMDB.",
    add_movie_prompt: "Add a movie from TMDB with the + button to start this list.",
    no_season_info: "No season information is available for the selected series.",
    pin_digits: "Enter a 4-digit numeric PIN.",
    pin_validate_failed: "PIN validation failed.",
    save_changes_failed: "Changes could not be saved.",
    delete_media_failed: "Could not delete the {media}.",
    invalid_episode_id: "Could not convert the episode to SxxExx format.",
    play_episode_failed: "Could not play the episode.",
    raspberry_status_failed: "Could not read Raspberry status.",
    movie_match_not_found: "I couldn't find a video file on the Raspberry matching this movie.",
    play_movie_failed: "Could not play the movie.",
    power_off_failed: "Could not power off the mini TV.",
    pause_not_available: "The current Raspberry API does not expose a dedicated pause action yet.",
    next_episode_not_found: "I couldn't find a next episode for the current playback.",
    upload_games_detected: "{count} file(s) detected. Guided game uploads will arrive later.",
    upload_name_not_detected: "I couldn't detect a useful name to search on TMDB.",
    upload_detected_summary: "{count} file(s) detected. Search prepared for {media}: \"{name}\".",
    upload_series_requires_directory: "Select or drop a single series directory.",
    upload_series_subdirectories_error: "All series content must be inside the directory, without subdirectories.",
    upload_series_format_error: "Every file must contain the SxxExx format.",
    upload_duplicates_title: "The series already contains episodes",
    upload_existing_title: "Content already exists",
    upload_existing_copy: "{existing} file(s) already exist. Do you want to overwrite them? Cancel to keep the current content.",
    upload_replace: "Yes, overwrite",
    upload_duplicates_copy: "{existing} of {total} videos are already on the Raspberry. What would you like to do?",
    upload_overwrite_existing: "Overwrite existing videos",
    upload_only_new: "Upload only new videos",
    upload_button: "Upload",
    tmdb_browser_title: "Download torrent",
    select_game: "Select a game",
    games_filter: "Filter",
    games_show_options: "Show game options",
    games_hide_options: "Hide game options",
    tmdb_browser_search_label: "Search (using the TMDB database)",
    tmdb_browser_trailer: "Trailer",
    tmdb_browser_no_trailer: "No YouTube trailer is available.",
    tmdb_browser_copy:
      "Browse series and movie details on TMDB, choose a torrent and follow its download on the dashboard. For series, you can search by season and episode.",
    tmdb_browser_open: "Search torrents",
    game_browser_title: "Search game details",
    game_browser_copy:
      "Search a ROM by name to review cover art, platform, and description inside the web app before uploading it.",
    game_browser_open: "Search details",
    game_browser_results: "Game results",
    game_browser_select_prompt: "Select a result to review its profile and cover art.",
    game_browser_search_intro: "Search a game to see results here.",
    game_browser_loading: "Loading game details...",
    game_browser_platform: "Platform",
    game_browser_source: "Source",
    tmdb_browser_preview: "View",
    tmdb_browser_results: "TMDB results",
    tmdb_browser_select_prompt: "View a result to review seasons, episodes, or movie details.",
    tmdb_browser_loading: "Loading TMDB details...",
    tmdb_browser_load_failed: "Could not load TMDB details.",
    tmdb_browser_search_intro: "Search for a series or movie to view its details here.",
    tmdb_browser_season_prompt: "Select a season to view its episodes.",
    upload_copying: "Copying content to the Raspberry...",
    upload_chapter_copying: "Loading {current} of {total} episodes",
    upload_saving: "Saving on the Raspberry...",
    upload_all_done: "Everything uploaded successfully.",
    book_upload_loading: "Uploading books…",
    book_upload_complete: "Upload complete",
    book_upload_error: "Upload error",
    book_upload_failed: "The books could not be uploaded.",
    upload_cancel_confirm: "Heads up, content is uploading to the Raspberry. Are you sure you want to cancel the upload?",
    upload_close_confirm: "Heads up, content is uploading to the Raspberry. Closing this window will cancel the upload. Are you sure?",
    upload_canceled: "Upload canceled.",
    upload_done_summary: "{name} added to Movies: {path}",
    upload_series_done_summary: "{name} added to TVShows: {path}",
    unavailable_season: "Season without uploaded episodes",
    unavailable_episode: "Episode not uploaded",
    games_in_construction: "Games under construction",
    select_movie: "Select movie",
    movie_library: "All movies",
    movie_details: "View details",
    movie_download: "Download",
    episode_download: "Download episode",
    movie_view_grid: "Grid view",
    movie_view_list: "List view",
    movie_sort_name: "Name",
    movie_sort_year: "Year",
    movie_sort_rating: "Rating",
    movie_sort_label: "Sort by",
    series_library: "All series",
    select_series: "Select series",
    no_movies_available: "No movies available",
    no_seasons_available: "No seasons available",
    seasons_label: "SEASONS",
    chapters_summary: "Episodes",
    series_stats_seasons: "Seasons",
    series_stats_hours: "Hours",
    series_runtime_estimated: "Estimated total runtime",
    loading_movie_runtime: "{minutes} minutes",
    tmdb_rating_missing: "TMDB rating unavailable",
    movie_file_label: "MOVIE DETAILS",
    release: "Release",
    duration: "Duration",
    rating: "Rating (TMDB)",
    genres: "Categories",
    movie_filter: "Filter by name",
    movie_filter_title: "Search and filter",
    movie_filter_search: "Search by name",
    movie_filter_search_placeholder: "Type a name",
    movie_filter_categories: "Categories",
    movie_filter_awards: "Award-winning films",
    movie_filter_awards_hint: "Shows winners of any of the selected awards.",
    movie_filter_award_oscars: "Oscar for Best Picture",
    movie_filter_award_palme: "Palme d’Or",
    movie_filter_award_goya: "Goya for Best Film",
    movie_filter_clear: "Clear filters",
    media_filter_favorites: "Show favorites only",
    movie_filter_genres_hint: "Shows movies in any of the selected categories.",
    movie_filter_genres_empty: "No categories available.",
    movie_filter_no_results: "No items match the selected filters.",
    movie_filter_count: "Showing {shown} out of {total}.",
    synopsis: "Synopsis",
    release_unknown: "Release date unavailable",
    duration_unknown: "Duration unavailable",
    empty_library_series_copy:
      "If you want to add series content, you can do it from the Uploads section.",
    empty_library_movies_copy:
      "If you want to add movie content, you can do it from the Uploads section.",
    go_to_uploads: "Uploads",
  },
};

function normalizeRaspberryLanguage(language) {
  const safeLanguage = String(language || "").trim().toLowerCase();
  if (safeLanguage === "cat") return "ca";
  return RASPBERRY_LANGUAGE_OPTIONS.some((option) => option.id === safeLanguage) ? safeLanguage : "es";
}

function getTmdbLanguage(language) {
  return TMDB_LANGUAGE_BY_APP_LANGUAGE[normalizeRaspberryLanguage(language)] || TMDB_LANGUAGE_BY_APP_LANGUAGE.es;
}

function translate(language, key, variables = {}) {
  const strings = UI_STRINGS[normalizeRaspberryLanguage(language)] || UI_STRINGS.es;
  const fallback = UI_STRINGS.es[key] || key;
  const template = strings[key] || fallback;

  return Object.entries(variables).reduce(
    (result, [nextKey, nextValue]) => result.replaceAll(`{${nextKey}}`, String(nextValue)),
    template
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeMediaLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeImdbUrl(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";

  try {
    const candidate = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;
    const parsedUrl = new URL(candidate);
    const hostname = parsedUrl.hostname.toLowerCase();
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") return "";
    if (hostname !== "imdb.com" && !hostname.endsWith(".imdb.com")) return "";
    return parsedUrl.toString();
  } catch (_error) {
    return "";
  }
}

function normalizeRottenTomatoesUrl(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";

  try {
    const candidate = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;
    const parsedUrl = new URL(candidate);
    const hostname = parsedUrl.hostname.toLowerCase();
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") return "";
    if (hostname !== "rottentomatoes.com" && !hostname.endsWith(".rottentomatoes.com")) return "";
    return parsedUrl.toString();
  } catch (_error) {
    return "";
  }
}

function stripFileExtension(value) {
  return String(value || "").replace(/\.[^.]+$/, "");
}

function getFileExtension(fileName) {
  return String(fileName || "").split(".").pop()?.toLowerCase() || "";
}

function isIgnoredUploadFile(file) {
  const relativePath = String(file?.webkitRelativePath || file?.name || "").replace(/\\/g, "/");
  const parts = relativePath.split("/").filter(Boolean);
  const filename = String(file?.name || parts.at(-1) || "").trim();
  const ignoredNames = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

  return (
    ignoredNames.has(filename) ||
    parts.some((part) => part === "__MACOSX" || part.startsWith("._"))
  );
}

function isSupportedGameRom(file) {
  return GAME_ROM_EXTENSIONS.has(getFileExtension(file?.name));
}

function deriveUploadSearchLabel(file, mediaType) {
  const rawRelativePath = String(file?.webkitRelativePath || "").trim();
  const rawName = String(file?.name || "").trim();

  if (mediaType === "series") {
    const relativeParts = rawRelativePath.split("/").filter(Boolean);
    if (relativeParts.length > 1) {
      return relativeParts[0];
    }

    return stripFileExtension(rawName)
      .replace(/\bS\d{1,2}E\d{1,}\b/gi, "")
      .replace(/\b\d{3,4}p\b/gi, "")
      .replace(/[._-]+/g, " ")
      .trim();
  }

  const label = stripFileExtension(rawName)
    .replace(/\b(19|20)\d{2}\b/g, "")
    .replace(/\b(World|USA|Europe|Japan)\b/gi, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[._-]+/g, " ")
    .trim();
  return label || stripFileExtension(rawName);
}

function getSeriesUploadValidation(files) {
  const safeFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  const roots = new Set();
  const nestedFiles = [];
  const invalidFiles = [];
  const episodePattern = /S\d{2}E\d{2,}/i;

  safeFiles.forEach((file) => {
    const relativePath = String(file?.webkitRelativePath || "").replace(/\\/g, "/").trim();
    const parts = relativePath.split("/").filter(Boolean);
    const filename = String(file?.name || parts.at(-1) || "").trim();

    if (!relativePath || parts.length < 2) {
      invalidFiles.push(filename || relativePath);
      return;
    }

    roots.add(parts[0]);
    if (parts.length > 2) {
      nestedFiles.push(relativePath);
    }
    if (!episodePattern.test(filename)) {
      invalidFiles.push(filename);
    }
  });

  const directoryName = Array.from(roots)[0] || "";

  return {
    ok: safeFiles.length > 0 && roots.size === 1 && nestedFiles.length === 0 && invalidFiles.length === 0,
    directoryName,
    multipleDirectories: roots.size > 1,
    nestedFiles,
    invalidFiles,
  };
}

function getUploadEpisodeId(file) {
  return String(file?.name || "").match(/S\d{2}E\d{2}/i)?.[0]?.toUpperCase() || "";
}

function readEntryFiles(entry) {
  if (!entry) return Promise.resolve([]);
  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file(
        (file) => {
          const relativePath = String(entry.fullPath || file.name || "").replace(/^\/+/, "");
          if (relativePath && !file.webkitRelativePath) {
            try {
              Object.defineProperty(file, "webkitRelativePath", {
                value: relativePath,
              });
            } catch (_error) {
              // Some browsers expose webkitRelativePath as read-only; validation will handle it.
            }
          }
          resolve([file]);
        },
        () => resolve([])
      );
    });
  }
  if (!entry.isDirectory) return Promise.resolve([]);

  const reader = entry.createReader();
  const readBatch = () =>
    new Promise((resolve) => {
      reader.readEntries(resolve, () => resolve([]));
    });

  return new Promise((resolve) => {
    const entries = [];
    async function drain() {
      const batch = await readBatch();
      if (!batch.length) {
        const files = await Promise.all(entries.map(readEntryFiles));
        resolve(files.flat());
        return;
      }
      entries.push(...batch);
      drain();
    }
    drain();
  });
}

async function readFilesFromDataTransfer(dataTransfer) {
  const items = Array.from(dataTransfer?.items || []);
  const entries = items
    .map((item) => (typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null))
    .filter(Boolean);

  if (entries.length) {
    const files = await Promise.all(entries.map(readEntryFiles));
    return files.flat();
  }

  return Array.from(dataTransfer?.files || []);
}

function getRaspberryProfiles(videos, collectionType) {
  const libraryItems = videos?.mediaLibrary?.[collectionType];
  if (!libraryItems || typeof libraryItems !== "object") return {};

  return Object.values(libraryItems).reduce((profiles, item) => {
    if (!item || typeof item !== "object") return profiles;
    const profileKey =
      collectionType === "movies"
        ? String(item.relativePath || Number(item.tmdbId) || "").trim()
        : String(item.relativePath || "").trim();
    if (!profileKey) return profiles;

    const profile = {};
    if (item.name) {
      profile.name = String(item.name);
    }
    if (item.heroImage) {
      profile.heroImage = String(item.heroImage);
    }
    if (item.heroImageCrop && typeof item.heroImageCrop === "object") {
      profile.heroImageCrop = normalizeHeroCrop(item.heroImageCrop);
    }
    if (item.imdbUrl !== undefined) {
      profile.imdbUrl = String(item.imdbUrl || "").trim();
    }
    if (item.rottenTomatoesUrl !== undefined) {
      profile.rottenTomatoesUrl = String(item.rottenTomatoesUrl || "").trim();
    }
    if (Object.keys(profile).length) {
      profiles[profileKey] = profile;
    }
    return profiles;
  }, {});
}

function mergeProfileMaps(currentProfiles, incomingProfiles) {
  const nextProfiles = { ...(currentProfiles || {}) };
  let changed = false;

  Object.entries(incomingProfiles || {}).forEach(([key, incomingProfile]) => {
    const currentProfile = nextProfiles[key] && typeof nextProfiles[key] === "object" ? nextProfiles[key] : {};
    const mergedProfile = {
      ...currentProfile,
      ...incomingProfile,
    };
    if (JSON.stringify(currentProfile) !== JSON.stringify(mergedProfile)) {
      nextProfiles[key] = mergedProfile;
      changed = true;
    }
  });

  return changed ? nextProfiles : currentProfiles;
}

function loadStoredRaspberryAlarm() {
  const fallbackAlarms = [
    { id: 1, enabled: false, time: "07:30", sound: "" },
    { id: 2, enabled: false, time: "08:00", sound: "" },
    { id: 3, enabled: false, time: "08:30", sound: "" },
  ];
  if (typeof window === "undefined") {
    return fallbackAlarms;
  }

  try {
    const raw = window.localStorage.getItem(RASPBERRY_ALARM_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      return fallbackAlarms.map((fallback, index) => {
        const entry = parsed[index] || {};
        return {
          ...fallback,
          id: index + 1,
          enabled: Boolean(entry?.enabled),
          time: /^\d{2}:\d{2}$/.test(entry?.time || "") ? entry.time : fallback.time,
          sound: String(entry?.sound || entry?.soundFile || ""),
        };
      });
    }

    return [
      {
        id: 1,
        enabled: Boolean(parsed?.enabled),
        time: /^\d{2}:\d{2}$/.test(parsed?.time || "") ? parsed.time : "07:30",
        sound: String(parsed?.sound || parsed?.soundFile || ""),
      },
      fallbackAlarms[1],
      fallbackAlarms[2],
    ];
  } catch (_error) {
    return fallbackAlarms;
  }
}

function saveStoredRaspberryAlarm(alarm) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RASPBERRY_ALARM_STORAGE_KEY, JSON.stringify(alarm));
}

function loadStoredRaspberryLanguage() {
  if (typeof window === "undefined") return "es";

  try {
    const raw = window.localStorage.getItem(RASPBERRY_LANGUAGE_STORAGE_KEY);
    return normalizeRaspberryLanguage(raw);
  } catch (_error) {
    return "es";
  }
}

function saveStoredRaspberryLanguage(language) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RASPBERRY_LANGUAGE_STORAGE_KEY, normalizeRaspberryLanguage(language));
}

function loadStoredRaspberryCurrentPlayback() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(RASPBERRY_CURRENT_PLAYBACK_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    if (!parsed || (parsed.kind !== "movie" && parsed.kind !== "episode")) {
      return null;
    }

    return {
      ...parsed,
      paused: Boolean(parsed.paused),
    };
  } catch (_error) {
    return null;
  }
}

function saveStoredRaspberryCurrentPlayback(playback) {
  if (typeof window === "undefined") return;

  if (!playback) {
    window.localStorage.removeItem(RASPBERRY_CURRENT_PLAYBACK_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    RASPBERRY_CURRENT_PLAYBACK_STORAGE_KEY,
    JSON.stringify(playback)
  );
}

function formatPercent(value) {
  return `${Math.round(clamp(Number(value) || 0, 0, 100))}%`;
}

function formatStorageGb(value) {
  return Number(Number(value) || 0).toFixed(1);
}

function normalizeLibraryUsageItem(item) {
  if (typeof item === "number") {
    return {
      count: Number(item) || 0,
      usedGb: 0,
      percentUsed: 0,
    };
  }

  return {
    count: Number(item?.count) || 0,
    usedGb: Number(item?.usedGb) || 0,
    percentUsed: Number(item?.percentUsed) || 0,
  };
}

function normalizeLibraryCounts(counts) {
  return {
    calculating: counts?.calculating ?? !counts,
    series: normalizeLibraryUsageItem(counts?.series),
    movies: normalizeLibraryUsageItem(counts?.movies),
    games: normalizeLibraryUsageItem(counts?.games),
    books: normalizeLibraryUsageItem(counts?.books),
    pictures: normalizeLibraryUsageItem(counts?.pictures),
  };
}

function normalizeHeroCrop(crop) {
  return {
    focusX: clamp(Number(crop?.focusX) || 0.5, 0, 1),
    focusY: clamp(Number(crop?.focusY) || 0.5, 0, 1),
    zoom: 1,
  };
}

function clampHeroCrop(crop) {
  return normalizeHeroCrop(crop);
}

function getHeroVerticalPosition(crop) {
  return normalizeHeroCrop(crop).focusY;
}

function getHeroSliderValue(crop) {
  return clamp(1 - getHeroVerticalPosition(crop), 0, HERO_SLIDER_MAX);
}

function setHeroVerticalPosition(position, crop) {
  const normalized = normalizeHeroCrop(crop);
  const nextPosition = clamp(Number(position) || 0, 0, 1);

  return clampHeroCrop({
    ...normalized,
    focusY: nextPosition,
  });
}

function setHeroVerticalFromSlider(value, crop) {
  return setHeroVerticalPosition(
    1 - clamp(Number(value) || 0, 0, HERO_SLIDER_MAX),
    crop
  );
}

function getHeaderImageStyle(crop) {
  const normalized = normalizeHeroCrop(crop);

  return {
    objectPosition: `${normalized.focusX * 100}% ${normalized.focusY * 100}%`,
    transform: `scale(${normalized.zoom})`,
    transformOrigin: "center center",
  };
}

function MovieDownload({ url, name, label }) {
  const graphics = <>
    <img className="movie-download__default" src={downloadIcon} alt="" aria-hidden="true" />
    <img className="movie-download__hover" src={downloadHoverIcon} alt="" aria-hidden="true" />
  </>;
  return url ? (
    <a className="movie-download" href={url} download={name} aria-label={label} title={label}>{graphics}</a>
  ) : (
    <button className="movie-download" type="button" disabled aria-label={label} title={label}>{graphics}</button>
  );
}

function HeaderArt({ image, crop, alt, bookCover = false, bookType = null, gameSystem = null, game = null }) {
  const usesFullMaskArtwork = image === cartellLogo;
  const bookArtwork = usesFullMaskArtwork ? bookTypeArtwork[bookType] : null;

  return (
    <div
      className={`series-hero__art${gameSystem ? " series-hero__art--games" : ""}${bookArtwork ? " series-hero__art--books" : ""}`}
      style={{
        WebkitMaskImage: `url(${cartellMask})`,
        maskImage: `url(${cartellMask})`,
      }}
      role="img"
      aria-label={gameSystem ? `DonkiCode LAB · ${gameSystem.name}` : alt}
    >
      {game ? <GameHeaderArtwork key={game.relativePath} game={game} /> : usesFullMaskArtwork ? (
        <>
          <img
            className="series-hero__full-mask-image"
            src={image}
            alt=""
            aria-hidden="true"
            draggable="false"
            onDragStart={(event) => event.preventDefault()}
          />
          {bookArtwork ? <img className="series-hero__book-type" src={bookArtwork} alt="" aria-hidden="true" draggable="false" /> : gameSystem ? <img className="series-hero__console" src={gameSystem.assets.console} alt="" /> : <div className="series-hero__flask-bubbles" aria-hidden="true">
            {Array.from({ length: 7 }, (_, index) => (
              <span key={`flask-bubble-${index}`} />
            ))}
          </div>}
        </>
      ) : (
        <div className={`series-hero__visible-window${bookCover ? " series-hero__visible-window--book" : ""}`}>
          <LibraryPoster src={image} name={alt} alt="" style={{ ...getHeaderImageStyle(crop), ...(bookCover ? { objectFit: "contain" } : {}) }} />
        </div>
      )}

    </div>
  );
}

function HeroSelector({ options, value, placeholder, disabled, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);
  const selectedOption = options.find((option) => String(option.value) === String(value)) || null;

  useEffect(() => {
    if (!open) return undefined;

    function updateMenuPosition() {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;

      const viewportPadding = 12;
      const estimatedOptionHeight = 58;
      const desiredHeight = Math.min(options.length * estimatedOptionHeight + 12, 320);
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const shouldOpenAbove = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
      const maxHeight = Math.max(
        Math.min(shouldOpenAbove ? spaceAbove : spaceBelow, desiredHeight),
        Math.min(desiredHeight, 180)
      );

      setMenuStyle({
        position: "fixed",
        left: rect.left,
        top: shouldOpenAbove ? Math.max(viewportPadding, rect.top - maxHeight - 6) : rect.bottom + 6,
        width: rect.width,
        maxHeight,
      });
    }

    function handlePointerDown(event) {
      if (
        !rootRef.current?.contains(event.target) &&
        !menuRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    updateMenuPosition();
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, options.length]);

  return (
    <div
      ref={rootRef}
      className={`series-select series-select--hero${open ? " open" : ""}${disabled ? " is-disabled" : ""}`}
    >
      <button
        className="series-select__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setOpen((current) => !current);
          }
        }}
      >
        <span>{selectedOption?.label || placeholder}</span>
      </button>

      {open && options.length && menuStyle
        ? createPortal(
            <div
              ref={menuRef}
              className="series-select__menu"
              style={menuStyle}
              role="listbox"
              aria-label={placeholder}
            >
              {options.map((option) => {
                const isSelected = String(option.value) === String(value);

                return (
                  <button
                    key={option.key}
                    className={`series-select__option${isSelected ? " active" : ""}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function SeasonCard({ season, isActive, disabled, onSelect, onDelete = () => {}, showDelete = false, t }) {
  return (
    <article className={`season-card${isActive ? " active" : ""}${disabled ? " is-disabled" : ""}`}>
      <button
        className="season-card__main"
        onClick={() => onSelect(season.id)}
        title={season.title}
        type="button"
      >
      <div className="season-card__image-wrap">
        {season.image ? (
          <LibraryPoster src={season.image} name={season.title} alt={season.title} className="season-card__image" />
        ) : (
          <div className="season-card__fallback">{season.title}</div>
        )}
      </div>
      <div className="season-card__body">
        <h3>{season.title}</h3>
        <p>{`${season.episodeCount} ${t("episodes")}`}</p>
      </div>
      </button>
      {showDelete ? (
        <button
          className="media-delete-button media-delete-button--season"
          onClick={() => onDelete(season)}
          type="button"
          aria-label={t("delete_season")}
          title={t("delete_season")}
        >
          <img src={deleteIcon} alt="" aria-hidden="true" />
        </button>
      ) : null}
    </article>
  );
}

function toRaspberryEpisodeId(seasonNumber, episodeNumber) {
  const safeSeason = Number(seasonNumber);
  const safeEpisode = Number(episodeNumber);

  if (!safeSeason || !safeEpisode) return "";

  return `S${String(safeSeason).padStart(2, "0")}E${String(safeEpisode).padStart(2, "0")}`;
}

function parseRaspberryEpisodeId(value) {
  const match = String(value || "")
    .trim()
    .toUpperCase()
    .match(/^S(\d{2})E(\d{2,})$/);

  if (!match) return null;

  return {
    seasonNumber: Number(match[1]),
    episodeNumber: Number(match[2]),
  };
}

function getUploadedEpisodeIds(directory) {
  return new Set(
    (Array.isArray(directory?.episodeIds) ? directory.episodeIds : [])
      .map((episodeId) => String(episodeId || "").trim().toUpperCase())
      .filter(Boolean)
  );
}

function isSeasonUploaded(season, uploadedEpisodeIds) {
  const seasonNumber = Number(season?.seasonNumber || season?.id) || 0;
  if (!seasonNumber || !uploadedEpisodeIds?.size) return false;
  const prefix = `S${String(seasonNumber).padStart(2, "0")}E`;
  return Array.from(uploadedEpisodeIds).some((episodeId) => episodeId.startsWith(prefix));
}

function isEpisodeUploaded(season, episode, uploadedEpisodeIds) {
  const episodeId = toRaspberryEpisodeId(
    season?.seasonNumber || season?.id,
    episode?.episodeNumber
  );
  return Boolean(episodeId && uploadedEpisodeIds?.has(episodeId));
}

function isGenericEpisodeDisplayTitle(title, episodeNumber) {
  const normalizedTitle = String(title || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const normalizedEpisode = String(Number(episodeNumber) || "").trim();

  return (
    !normalizedTitle ||
    new Set([
      `episodio ${normalizedEpisode}`,
      `episodi ${normalizedEpisode}`,
      `episode ${normalizedEpisode}`,
      `capitulo ${normalizedEpisode}`,
      `capitol ${normalizedEpisode}`,
    ]).has(normalizedTitle)
  );
}

function createEpisodePlaybackInfo({ series, season, episode, playbackId }) {
  if (!series || !episode || !playbackId) return null;

  return {
    kind: "episode",
    playbackId,
    directory: series.directoryPath || "",
    filePath: `${series.directoryPath || ""}/${playbackId}.mp4`,
    seriesId: series.id || null,
    seriesName: series.name || "",
    seasonNumber: season?.seasonNumber || season?.id || 0,
    seasonTitle: season?.title || "",
    episodeNumber: episode.episodeNumber || 0,
    episodeTitle: episode.title || "",
    title: series.name || "",
    image: playbackArtwork(series, season?.image || episode.image || cartellLogo),
    paused: false,
  };
}

function createMoviePlaybackInfo({ movie, movieEntry }) {
  if (!movie || !movieEntry?.id) return null;

  return {
    kind: "movie",
    playbackId: movieEntry.id,
    directory: movieEntry.directory || "",
    filePath: movieEntry.relativePath || "",
    movieId: movie.id || null,
    title: movie.name || "",
    originalTitle: movie.originalName || "",
    image: playbackArtwork(movie, cartellLogo),
    paused: false,
  };
}

function createPlaybackInfoFromHealth({ health, seriesOptions, movieOptions }) {
  const playbackId = String(health?.playing || stripFileExtension(String(health?.file || "").split("/").pop()) || "").trim().toUpperCase();
  const directory = String(health?.directory || "").trim();
  const filePath = String(health?.file || "").trim();
  if (!playbackId) return null;

  const parsedEpisode = parseRaspberryEpisodeId(playbackId);
  if (parsedEpisode) {
    const activeSeries =
      seriesOptions.find((series) => series.directoryPath === directory) ||
      seriesOptions.find((series) => filePath.startsWith(`${series.directoryPath}/`)) ||
      null;
    const season =
      activeSeries?.seasons?.find(
        (entry) => Number(entry.seasonNumber || entry.id) === parsedEpisode.seasonNumber
      ) || null;

    return createEpisodePlaybackInfo({
      series: activeSeries || {
        id: null,
        directoryPath: directory,
        name: stripFileExtension(filePath.split("/").slice(-2, -1)[0] || directory || playbackId),
        heroImage: cartellLogo,
      },
      season: {
        seasonNumber: parsedEpisode.seasonNumber,
        title: season?.title || "",
        image: season?.image || activeSeries?.heroImage || cartellLogo,
      },
      episode: {
        episodeNumber: parsedEpisode.episodeNumber,
        title: playbackId,
        image: season?.image || activeSeries?.heroImage || cartellLogo,
      },
      playbackId,
    });
  }

  const fileName = filePath.split("/").pop() || playbackId;
  const activeMovie =
    movieOptions.find((movie) => movie.fileRelativePath === filePath) ||
    movieOptions.find((movie) => normalizeMediaLabel(movie.fileName) === normalizeMediaLabel(fileName)) ||
    movieOptions.find((movie) => normalizeMediaLabel(movie.name) === normalizeMediaLabel(playbackId)) ||
    null;

  return createMoviePlaybackInfo({
    movie: activeMovie || {
      id: null,
      name: stripFileExtension(fileName || playbackId),
      originalName: "",
      heroImage: cartellLogo,
    },
    movieEntry: {
      id: playbackId,
      directory,
      relativePath: filePath,
    },
  });
}

function resolveNextEpisodeTarget({ currentPlayback, raspberryHealth, seriesOptions, directories }) {
  const playbackId = String(currentPlayback?.playbackId || raspberryHealth?.playing || "")
    .trim()
    .toUpperCase();
  const playbackDirectory = String(currentPlayback?.directory || raspberryHealth?.directory || "").trim();
  const parsedPlayback = parseRaspberryEpisodeId(playbackId);

  if (!playbackId || !parsedPlayback || !playbackDirectory) return null;

  const activeSeries =
    seriesOptions.find((entry) => entry.directoryPath === playbackDirectory) ||
    seriesOptions.find((entry) => Number(entry.id) === Number(currentPlayback?.seriesId)) ||
    null;
  const seasons = (activeSeries?.seasons || [])
    .map((season) => ({
      ...season,
      seasonNumber: Number(season.seasonNumber || season.id) || 0,
      episodeCount: Number(season.episodeCount) || 0,
    }))
    .filter((season) => season.seasonNumber > 0 && season.episodeCount > 0)
    .sort((a, b) => a.seasonNumber - b.seasonNumber);
  const currentSeasonNumber = Number(currentPlayback?.seasonNumber) || parsedPlayback.seasonNumber;
  const currentEpisodeNumber = Number(currentPlayback?.episodeNumber) || parsedPlayback.episodeNumber;
  const currentSeason = seasons.find((season) => season.seasonNumber === currentSeasonNumber);

  if (currentSeason) {
    if (currentEpisodeNumber < currentSeason.episodeCount) {
      const nextEpisodeNumber = currentEpisodeNumber + 1;
      return {
        series: activeSeries,
        seasonNumber: currentSeasonNumber,
        episodeNumber: nextEpisodeNumber,
        playbackId: toRaspberryEpisodeId(currentSeasonNumber, nextEpisodeNumber),
        directory: playbackDirectory,
      };
    }

    const nextSeason = seasons.find((season) => season.seasonNumber > currentSeasonNumber);
    if (nextSeason) {
      return {
        series: activeSeries,
        seasonNumber: nextSeason.seasonNumber,
        episodeNumber: 1,
        playbackId: toRaspberryEpisodeId(nextSeason.seasonNumber, 1),
        directory: playbackDirectory,
      };
    }

    return null;
  }

  const activeDirectory = directories.find((entry) => entry.relativePath === playbackDirectory);
  const episodeList = Array.isArray(activeDirectory?.episodeIds) ? activeDirectory.episodeIds : [];
  const currentIndex = episodeList.findIndex((entry) => String(entry).toUpperCase() === playbackId);
  const nextEpisodeId = currentIndex >= 0 ? episodeList[currentIndex + 1] : "";
  const parsedNextEpisode = parseRaspberryEpisodeId(nextEpisodeId);

  return parsedNextEpisode
    ? {
        series: activeSeries,
        seasonNumber: parsedNextEpisode.seasonNumber,
        episodeNumber: parsedNextEpisode.episodeNumber,
        playbackId: nextEpisodeId,
        directory: playbackDirectory,
      }
    : null;
}

function MediaMarkIcon({ favorite = false, active = false }) {
  return <svg viewBox="0 0 24 24" fill={favorite && active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {favorite ? <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /> : <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{!active && <path d="m3 3 18 18" />}</>}
  </svg>;
}

function MediaMarkButtons({ watched, favorite, onWatched, onFavorite, t }) {
  return <div className="media-marks">
    {onWatched && <button type="button" className={`media-mark${watched ? " is-watched" : ""}`} aria-pressed={Boolean(watched)} onClick={() => onWatched(!watched)}><MediaMarkIcon active={watched} /><span>{t(watched ? "mark_watched" : "mark_unwatched")}</span></button>}
    {onFavorite && <button type="button" className={`media-mark${favorite ? " is-favorite" : ""}`} aria-pressed={Boolean(favorite)} onClick={() => onFavorite(!favorite)}><MediaMarkIcon favorite active={favorite} /><span>{t(favorite ? "mark_favorite" : "mark_not_favorite")}</span></button>}
  </div>;
}

function EpisodeRow({ episode, available, onSelect, t }) {
  return (
    <article className={`episode-card${available ? "" : " is-disabled"}`}>
      <button
        className="episode-card__main"
        onClick={() => onSelect(episode)}
        title={episode.title}
        type="button"
      >
      <div className="episode-card__thumb">
        {episode.image ? <LibraryPoster src={episode.image} name={episode.title} alt={episode.title} /> : null}
      </div>

      <div className="episode-card__body">
        <h3>
          {episode.episodeNumber}. {episode.title}
        </h3>
        <p>{episode.airDate || t("not_available")}</p>
      </div>

      <div className="episode-card__arrow">›</div>
      </button>
    </article>
  );
}

const RATING_STAR_PATH = "M12 2.4l2.88 5.84 6.45.94-4.67 4.55 1.1 6.43L12 17.13l-5.76 3.03 1.1-6.43-4.67-4.55 6.45-.94L12 2.4z";

function RatingStar({ fillPercent }) {
  return (
    <span className="movie-panel__star" aria-hidden="true">
      <svg className="movie-panel__star-empty" viewBox="0 0 24 24">
        <path d={RATING_STAR_PATH} />
      </svg>
      <span className="movie-panel__star-fill" style={{ width: `${fillPercent}%` }}>
        <svg className="movie-panel__star-filled" viewBox="0 0 24 24">
          <path d={RATING_STAR_PATH} />
        </svg>
      </span>
    </span>
  );
}

function RatingStars({ rating }) {
  const safeRating = Math.min(5, Math.max(0, (Number(rating) || 0) / 2));

  return (
    <span
      className="movie-panel__stars"
      role="img"
      aria-label={`${safeRating.toFixed(1)} / 5`}
    >
      {Array.from({ length: 5 }, (_, index) => {
        const fillPercent = Math.min(100, Math.max(0, (safeRating - index) * 100));

        return <RatingStar fillPercent={fillPercent} key={index} />;
      })}
    </span>
  );
}

function MovieImageCarousel({
  title,
  images,
  activeIndex,
  onSelect,
  onPrevious,
  onNext,
  t,
}) {
  const safeImages = Array.isArray(images)
    ? images.filter(Boolean).slice(0, MAX_MOVIE_IMAGES)
    : [];

  if (!safeImages.length) {
    return (
      <div className="movie-panel__gallery-empty">
        <span>{t("no_images_available")}</span>
      </div>
    );
  }

  const currentImage = safeImages[activeIndex] || safeImages[0];
  const maxVisibleDots = 7;
  const visibleDotCount = Math.min(maxVisibleDots, safeImages.length);
  const startIndex = Math.max(
    0,
    Math.min(
      activeIndex - Math.floor(visibleDotCount / 2),
      safeImages.length - visibleDotCount
    )
  );
  const visibleDots = safeImages
    .slice(startIndex, startIndex + visibleDotCount)
    .map((imageUrl, offset) => ({
      imageUrl,
      index: startIndex + offset,
    }));

  return (
    <div className="movie-panel__gallery">
      <div className="movie-panel__hero-media">
        <LibraryPoster key={currentImage} src={currentImage} name={title} alt={title} />
      </div>

      {safeImages.length > 1 ? (
        <div className="movie-panel__gallery-controls">
          <button
            className="movie-panel__gallery-button"
            onClick={onPrevious}
            type="button"
            aria-label={t("prev_image")}
          >
            ‹
          </button>

          <div className="movie-panel__gallery-status">
            <div className="movie-panel__dots" role="tablist" aria-label={t("image_gallery")}>
              {startIndex > 0 ? <span className="movie-panel__dots-more" aria-hidden="true">…</span> : null}
              {visibleDots.map(({ imageUrl, index }) => (
                <button
                  key={`${imageUrl}-${index}`}
                  className={`movie-panel__dot${index === activeIndex ? " active" : ""}`}
                  onClick={() => onSelect(index)}
                  type="button"
                  role="tab"
                  aria-selected={index === activeIndex}
                  aria-label={t("go_to_image", { index: index + 1 })}
                />
              ))}
              {startIndex + visibleDotCount < safeImages.length ? (
                <span className="movie-panel__dots-more" aria-hidden="true">…</span>
              ) : null}
            </div>
            <span className="movie-panel__gallery-count">
              {activeIndex + 1} / {safeImages.length}
            </span>
          </div>

          <button
            className="movie-panel__gallery-button"
            onClick={onNext}
            type="button"
            aria-label={t("next_image")}
          >
            ›
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EpisodeDetailsModal({
  visible,
  episode,
  season,
  seriesName,
  playing,
  loading = false,
  error = "",
  onRetry,
  available,
  showPlayButton = true,
  watched,
  onWatched,
  favorite,
  onFavorite,
  onClose,
  onPlay,
  onPlayBrowser,
  onPlayExternal,
  downloadUrl,
  downloadName,
  onDelete,
  t,
}) {
  useEffect(() => {
    if (!visible) return () => {};

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible, onClose]);

  if (!visible || !episode || !season) return null;

  return (
    <div
      className="modal-backdrop modal-backdrop--episode"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        className="episode-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="episode-dialog-title"
      >
        <header className="episode-dialog__header">
          <div className="episode-dialog__header-copy">
            {seriesName ? <p>{seriesName}</p> : null}
            <h2>{season.title}</h2>
            <h3 id="episode-dialog-title">
              {`${t("episode_label")} ${episode.episodeNumber}: `}<span>{episode.title}</span>
            </h3>
          </div>

          <button
            className="episode-dialog__close"
            onClick={onClose}
            type="button"
            aria-label={t("close")}
          >
            ×
          </button>
        </header>

        <div className="episode-dialog__body">
          {loading && <p role="status"><span className="tmdb-cache-spinner" /> Cargando información del episodio…</p>}
          {error && <p role="alert">{error} <button type="button" onClick={onRetry}>Reintentar</button></p>}
          <MediaMarkButtons watched={watched} onWatched={onWatched} favorite={favorite} onFavorite={onFavorite} t={t} />
          <div className="episode-dialog__overview">
            {episode.image ? (
              <div className="episode-dialog__media">
                <LibraryPoster src={episode.image} name={episode.title} alt={episode.title} />
              </div>
            ) : (
              <div className="episode-dialog__media episode-dialog__media--empty">
                <span>{episode.title}</span>
              </div>
            )}

            <div className="episode-dialog__facts">
              <div className="episode-dialog__fact">
                <strong>{`${t("duration")}:`}</strong>
                <span>{episode.runtime ? t("loading_movie_runtime", { minutes: episode.runtime }) : t("not_available")}</span>
              </div>
              <div className="episode-dialog__fact">
                <strong>{`${t("release")}:`}</strong>
                <span>{episode.airDate || t("not_available")}</span>
              </div>
              <div className="episode-dialog__fact">
                <strong>{`${t("rating")}:`}</strong>
                <span>
                  {typeof episode.voteAverage === "number" && episode.voteAverage > 0
                    ? episode.voteAverage.toFixed(1)
                    : t("not_available")}
                </span>
              </div>
            </div>
          </div>

          {showPlayButton ? (
            <div className="episode-dialog__actions">
              <button
                className="episode-dialog__play"
                onClick={onPlay}
                type="button"
                disabled={playing || !available}
              >
                <span className="playback-action__play-icon playback-action__play-icon--light" aria-hidden="true">▶</span>
                <span>{available ? (playing ? t("playing_now") : t("play_on_tv")) : t("unavailable_episode")}</span>
              </button>
              <button
                className="episode-dialog__play episode-dialog__play--browser"
                onClick={onPlayBrowser}
                type="button"
                disabled={!available}
              >
                <span className="playback-action__play-icon" aria-hidden="true">▶</span>
                <span>{available ? t("play_in_browser") : t("unavailable_episode")}</span>
              </button>
              <button
                className="episode-dialog__play episode-dialog__play--external"
                onClick={onPlayExternal}
                type="button"
                disabled={playing || !available}
              >
                <span className="playback-action__play-icon" aria-hidden="true">▶</span>
                <span>{available ? t("play_on_external_monitor") : t("unavailable_episode")}</span>
              </button>
              {available && downloadUrl ? (
                <a
                  className="episode-dialog__play episode-dialog__play--download"
                  href={downloadUrl}
                  download={downloadName}
                >
                  <span className="playback-action__download-icon" aria-hidden="true">↓</span>
                  <span>{t("episode_download")}</span>
                </a>
              ) : null}
            </div>
          ) : null}

          <div className="episode-dialog__synopsis">
            <strong>{`${t("synopsis")}:`}</strong>
            <p>{episode.synopsis || t("synopsis_unavailable")}</p>
          </div>

          {available && onDelete ? (
            <button
              className="episode-dialog__delete episode-dialog__delete--below"
              onClick={() => onDelete(episode)}
              type="button"
            >
              <img src={deleteIcon} alt="" aria-hidden="true" />
              <span>{t("delete_episode")}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PlaybackSubtitleControls({ disabled = false, playbackKey = "", t }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  useEffect(() => setFeedback(null), [playbackKey, disabled]);
  async function change(action) {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await controlPlaybackSubtitles(action);
      setFeedback(result);
    } catch (error) {
      setFeedback({ error: error.code || "subtitle_control_failed" });
    } finally {
      setBusy(false);
    }
  }
  return <div className="playback-subtitles">
    <div className="playback-subtitles__buttons">
      <button className="dialog-button dialog-button--ghost" type="button" disabled={disabled || busy} onClick={() => change("toggle")}>{t("subtitle_toggle")}</button>
      <button className="dialog-button dialog-button--ghost" type="button" disabled={disabled || busy} onClick={() => change("next")}>{t("subtitle_next")}</button>
    </div>
    {feedback ? <p role={feedback.error ? "alert" : "status"}>
      {feedback.error ? t(feedback.error) : feedback.queued ? t("subtitle_queued") : <>
        {t(feedback.enabled ? "subtitle_on" : "subtitle_off")}
        {feedback.enabled && feedback.track ? ` · ${t(feedback.track.external ? "subtitle_external" : "subtitle_embedded")} ${feedback.track.label || feedback.track.id}` : ""}
      </>}
    </p> : null}
  </div>;
}

function BrowserPlayerModal({ playback, onClose, t }) {
  useEffect(() => {
    if (!playback) return () => {};
    const handleKeyDown = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playback, onClose]);

  if (!playback) return null;
  return createPortal(
    <div className="browser-player" role="dialog" aria-modal="true" aria-label={t("browser_player")}>
      <div className="browser-player__panel">
        <header>
          <div>
            <span>{t("browser_player")}</span>
            <h2>{playback.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t("close")}>×</button>
        </header>
        <BrowserVideo key={`${playback.context?.userId}:${playback.url}`} url={playback.url} t={t} initialProgress={playback.context?.initialProgress} onProgress={playback.context?.onProgress} />
      </div>
    </div>,
    document.body
  );
}

function BrowserGameModal({ game, onClose, t }) {
  useEffect(() => {
    if (!game) return () => {};
    const handleKeyDown = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [game, onClose]);

  if (!game) return null;
  return createPortal(
    <div className="browser-player browser-game" role="dialog" aria-modal="true" aria-label={t("browser_game_player")}>
      <div className="browser-player__panel browser-game__panel">
        <header>
          <div>
            <span>{t("browser_game_player")}</span>
            <h2>{game.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t("close")}>×</button>
        </header>
        <iframe
          src={game.url}
          title={`${t("browser_game_player")}: ${game.title}`}
          allow="autoplay; fullscreen; gamepad"
          allowFullScreen
        />
      </div>
    </div>,
    document.body
  );
}

function MovieFavoriteConfirmModal({ confirmation, onClose, onConfirm, t }) {
  const dialogRef = useRef(null);
  const actionKey = confirmation.favorite ? "movie_favorite_add" : "movie_favorite_remove";

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="dialog-card dialog-card--compact movie-favorite-confirm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="movie-favorite-title"
      aria-describedby="movie-favorite-copy"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <div className="dialog-card__header">
        <h2 id="movie-favorite-title">{t(actionKey)}</h2>
        <span className="movie-favorite-confirm__icon"><MediaMarkIcon favorite active={confirmation.favorite} /></span>
      </div>
      <p className="dialog-copy" id="movie-favorite-copy">{t(`${actionKey}_confirm`, { name: confirmation.name })}</p>
      <div className="dialog-card__actions">
        <button className="dialog-button dialog-button--ghost" type="button" onClick={onClose}>{t("cancel")}</button>
        <button className="dialog-button dialog-button--accent" type="button" onClick={onConfirm}>{t(actionKey)}</button>
      </div>
    </dialog>,
    document.body
  );
}

function DeleteConfirmModal({ confirmation, onClose, t }) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!confirmation) return () => {};
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmation, busy, onClose]);

  if (!confirmation) return null;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await confirmation.onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="delete-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-title">
      <div className="settings-delete-confirm__card">
        <div className="settings-delete-confirm__icon">
          <img className="dialog-card__icon-image" src={deleteIcon} alt="" aria-hidden="true" />
        </div>
        <div className="settings-delete-confirm__copy">
          <p id="delete-confirm-title">{t("confirm_delete_title", { media: confirmation.media })}</p>
          <h3>{confirmation.name}</h3>
          <span>{t("confirm_delete", { media: confirmation.media.toLowerCase(), name: confirmation.name })}</span>
        </div>
        <div className="settings-delete-confirm__actions">
          <button className="dialog-button dialog-button--ghost" onClick={onClose} type="button" disabled={busy} autoFocus>
            {t("cancel")}
          </button>
          <button className="dialog-button dialog-button--danger" onClick={handleConfirm} type="button" disabled={busy}>
            {t("delete_media", { media: confirmation.media })}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function MovieSubtitleField({ file, onChange, disabled = false, t }) {
  return <label className="dialog-field">
    <span>{t("movie_subtitles")}</span>
    <input type="file" accept=".srt" disabled={disabled} onChange={event => {
      const selected = event.target.files?.[0] || null;
      if (selected && (!/\.srt$/i.test(selected.name) || !selected.size || selected.size > 5 * 1024 * 1024)) {
        event.target.value = "";
        onChange(null);
        window.alert("Selecciona un archivo .srt con contenido de hasta 5 MB.");
        return;
      }
      onChange(selected);
    }} />
    <small>{t("movie_subtitles_hint")}</small>
    {file ? <span>{file.name}</span> : null}
  </label>;
}

function SettingsModal({ visible, mediaType, item, imageOptions, onClose, onSave, onDelete, t, language, movieRelativePath, onConfigureSubtitles }) {
  const [name, setName] = useState(item?.name || "");
  const [imdbUrl, setImdbUrl] = useState(item?.imdbUrl || "");
  const [rottenTomatoesUrl, setRottenTomatoesUrl] = useState(item?.rottenTomatoesUrl || "");
  const [heroImage, setHeroImage] = useState(item?.heroImage || "");
  const [heroImageCrop, setHeroImageCrop] = useState(item?.heroImageCrop || DEFAULT_HERO_CROP);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [subtitleFile, setSubtitleFile] = useState(null);
  const [subtitleBusy, setSubtitleBusy] = useState(false);

  useEffect(() => {
    setName(item?.name || "");
    setImdbUrl(item?.imdbUrl || "");
    setRottenTomatoesUrl(item?.rottenTomatoesUrl || "");
    setHeroImage(item?.heroImage || imageOptions?.[0] || "");
    setHeroImageCrop(normalizeHeroCrop(item?.heroImageCrop || DEFAULT_HERO_CROP));
    setDeleteConfirmOpen(false);
    setSubtitleFile(null);
  }, [item, imageOptions, visible]);

  useEffect(() => { setSubtitleBusy(false); }, [movieRelativePath, visible]);

  if (!visible) return null;

  if (mediaType === "games") {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="dialog-card dialog-card--compact" onClick={(event) => event.stopPropagation()}>
          <div className="dialog-card__header">
            <div>
              <p>{t("media_games")}</p>
              <h2>{t("games_in_construction")}</h2>
            </div>
            <button className="dialog-card__close" onClick={onClose} type="button">
              ×
            </button>
          </div>
          <p className="dialog-copy">
            {t("games_reserved")}
          </p>
        </div>
      </div>
    );
  }

  if (!item) return null;

  const normalizedImageOptions = Array.from(
    new Set((Array.isArray(imageOptions) ? imageOptions : []).filter(Boolean))
  );
  const mediaLabel = mediaType === "movies" ? t("media_movies_singular") : t("media_series_singular");

  return (
    <div
      className="modal-backdrop"
      onClick={mediaType === "movies" ? undefined : onClose}
    >
        <div className="dialog-card dialog-card--settings" onClick={(event) => event.stopPropagation()}>
          <div className="dialog-card__header">
            <div>
              <p>{t("settings_of", { media: mediaLabel })}</p>
              <h2>{item.name}</h2>
            </div>
            <div className="dialog-card__header-actions">
              <button
                className="dialog-card__icon-button dialog-card__icon-button--danger"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={subtitleBusy}
                type="button"
                aria-label={t("delete_media", { media: mediaLabel })}
                title={t("delete_media", { media: mediaLabel })}
              >
                <img className="dialog-card__icon-image" src={deleteIcon} alt="" aria-hidden="true" />
              </button>
              <button
                className="dialog-card__icon-button dialog-card__icon-button--accent"
                disabled={subtitleBusy}
                onClick={() =>
                  onSave({
                    subtitleFile,
                    name,
                    heroImage,
                    heroImageCrop: heroImage ? clampHeroCrop(heroImageCrop) : null,
                    imdbUrl: mediaType === "movies" ? normalizeImdbUrl(imdbUrl) : undefined,
                    rottenTomatoesUrl: mediaType === "movies" ? normalizeRottenTomatoesUrl(rottenTomatoesUrl) : undefined,
                  })
                }
                type="button"
                aria-label={t("save")}
                title={t("save")}
              >
                <img className="dialog-card__icon-image" src={saveIcon} alt="" aria-hidden="true" />
              </button>
              <button
                className="dialog-card__icon-button dialog-card__close"
                onClick={onClose}
                disabled={subtitleBusy}
                type="button"
                aria-label={t("cancel")}
                title={t("cancel")}
              >
                ×
              </button>
            </div>
          </div>

          {deleteConfirmOpen ? (
            <div className="settings-delete-confirm" role="alertdialog" aria-modal="true">
              <div className="settings-delete-confirm__card">
                <div className="settings-delete-confirm__icon">
                  <img className="dialog-card__icon-image" src={deleteIcon} alt="" aria-hidden="true" />
                </div>
                <div className="settings-delete-confirm__copy">
                  <p>{t("confirm_delete_title", { media: mediaLabel })}</p>
                  <h3>{item.name}</h3>
                  <span>{t("confirm_delete", { media: mediaLabel, name: item.name })}</span>
                </div>
                <div className="settings-delete-confirm__actions">
                  <button
                    className="dialog-button dialog-button--ghost"
                    onClick={() => setDeleteConfirmOpen(false)}
                    type="button"
                  >
                    {t("cancel")}
                  </button>
                  <button
                    className="dialog-button dialog-button--danger"
                    onClick={() => {
                      setDeleteConfirmOpen(false);
                      onDelete();
                    }}
                    type="button"
                  >
                    {t("delete_media", { media: mediaLabel })}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

        <div className="dialog-card__body">
          {mediaType === "movies" ? <>
            <MovieSubtitleField key={`${item.id}-${visible}`} file={subtitleFile} onChange={setSubtitleFile} disabled={subtitleBusy} t={t} />
            <MovieSubtitleDownload key={`subtitles-${movieRelativePath}`} relativePath={movieRelativePath} language={language} disabled={Boolean(subtitleFile)} onBusyChange={setSubtitleBusy} onConfigure={onConfigureSubtitles} />
          </> : null}
          <label className="dialog-field">
            <span>{t("visible_name")}</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("name_of_media", { media: mediaLabel })}
            />
          </label>

          {mediaType === "movies" ? (
            <>
              <label className="dialog-field">
                <span>{t("imdb_url")}</span>
                <input
                  type="url"
                  value={imdbUrl}
                  onChange={(event) => setImdbUrl(event.target.value)}
                  placeholder={t("imdb_url_placeholder")}
                  inputMode="url"
                />
              </label>
              <label className="dialog-field">
                <span>{t("rotten_tomatoes_url")}</span>
                <input
                  type="url"
                  value={rottenTomatoesUrl}
                  onChange={(event) => setRottenTomatoesUrl(event.target.value)}
                  placeholder={t("rotten_tomatoes_url_placeholder")}
                  inputMode="url"
                />
              </label>
            </>
          ) : null}

          <div className="dialog-field">
            <span>{t("image_header")}</span>
            <div className="dialog-image-grid-shell">
              <div className="dialog-image-grid">
                {normalizedImageOptions.map((imageUrl) => (
                  <button
                    key={imageUrl}
                    className={`dialog-image-option${heroImage === imageUrl ? " active" : ""}`}
                    onClick={() => {
                      setHeroImage(imageUrl);
                      setHeroImageCrop(
                        clampHeroCrop(imageUrl === heroImage ? heroImageCrop : DEFAULT_HERO_CROP)
                      );
                    }}
                    type="button"
                  >
                    <img src={imageUrl} alt="" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="dialog-field">
            <span>{t("poster_preview")}</span>
            <div className="dialog-preview-editor">
              <div className="dialog-poster-preview-shell">
                <div className="dialog-vertical-control" aria-label={t("vertical_position")}>
                  <input
                    type="range"
                    min="0"
                    max={HERO_SLIDER_MAX}
                    step="0.01"
                    value={getHeroSliderValue(heroImageCrop)}
                    onChange={(event) =>
              setHeroImageCrop((currentCrop) => setHeroVerticalFromSlider(event.target.value, currentCrop))
                    }
                    disabled={!heroImage}
                  />
                </div>

                <div className="dialog-poster-preview">
                  <HeaderArt image={heroImage || cartellLogo} crop={heroImageCrop} alt="" />
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function GameSettingsModal({ visible, game, onClose, onSave, t }) {
  const [name, setName] = useState(game?.name || "");
  const [description, setDescription] = useState(game?.description || "");
  const [coverImage, setCoverImage] = useState(game?.coverImage || "");
  const [keptImages, setKeptImages] = useState([]);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState("");
  const [imageFiles, setImageFiles] = useState([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const nextImages = Array.from(
      new Set([game?.coverImage, ...(Array.isArray(game?.imageOptions) ? game.imageOptions : [])].filter(Boolean))
    );
    setName(game?.name || "");
    setDescription(game?.description || "");
    setCoverImage(game?.coverImage || nextImages[0] || "");
    setKeptImages(nextImages);
    setCoverFile(null);
    setImageFiles([]);
    setError("");
  }, [game, visible]);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreviewUrl("");
      return () => {};
    }

    const nextPreviewUrl = URL.createObjectURL(coverFile);
    setCoverPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [coverFile]);

  useEffect(() => {
    if (!imageFiles.length) {
      setImagePreviewUrls([]);
      return () => {};
    }

    const nextPreviewUrls = imageFiles.map((imageFile) => URL.createObjectURL(imageFile));
    setImagePreviewUrls(nextPreviewUrls);
    return () => nextPreviewUrls.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
  }, [imageFiles]);

  if (!visible || !game) return null;

  const displayCover = coverPreviewUrl || coverImage || keptImages[0] || "";
  const mediaLabel = t("media_games_singular");

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        coverFile,
        coverImage,
        imageFiles,
        imageOptions: keptImages,
      });
      setSubmitting(false);
      onClose();
    } catch (nextError) {
      setError(nextError.message || t("save_changes_failed"));
      setSubmitting(false);
    }
  }

  function handleRemoveImage(imageUrl) {
    const nextImages = keptImages.filter((entry) => entry !== imageUrl);
    setKeptImages(nextImages);
    if (coverImage === imageUrl) {
      setCoverImage(nextImages[0] || "");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="dialog-card dialog-card--add-series game-upload-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-card__header">
          <div>
            <p>{game.platformName || mediaLabel}</p>
            <h2>{t("games_edit_title")}</h2>
          </div>
          <div className="dialog-card__header-actions">
            <button
              className="dialog-card__icon-button dialog-card__icon-button--accent"
              onClick={handleSubmit}
              type="button"
              aria-label={t("save")}
              title={t("save")}
              disabled={submitting}
            >
              <img className="dialog-card__icon-image" src={saveIcon} alt="" aria-hidden="true" />
            </button>
            <button
              className="dialog-card__icon-button dialog-card__close"
              onClick={onClose}
              type="button"
              aria-label={t("cancel")}
              title={t("cancel")}
            >
              ×
            </button>
          </div>
        </div>

        <form className="game-upload-form" onSubmit={handleSubmit}>
          <div className="game-upload-layout">
            <div className="game-upload-fields">
              <label className="dialog-field">
                <span>{t("games_name_field")}</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={game.file || game.relativePath}
                />
              </label>

              <label className="dialog-field">
                <span>{t("games_description_field")}</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t("games_description_placeholder")}
                  rows={5}
                />
              </label>

              <label className="dialog-field">
                <span>{t("games_new_cover_field")}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => setCoverFile(event.target.files?.[0] || null)}
                />
              </label>

              <label className="dialog-field">
                <span>{t("games_new_images_field")}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  onChange={(event) => setImageFiles(Array.from(event.target.files || []))}
                />
              </label>

              {keptImages.length ? (
                <div className="dialog-field">
                  <span>{t("games_current_images")}</span>
                  <div className="game-settings-image-grid">
                    {keptImages.map((imageUrl) => (
                      <div
                        key={imageUrl}
                        className={`game-settings-image${coverImage === imageUrl ? " active" : ""}`}
                      >
                        <button
                          className="game-settings-image__preview"
                          onClick={() => {
                            setCoverFile(null);
                            setCoverImage(imageUrl);
                          }}
                          type="button"
                          aria-label={t("games_set_cover")}
                          title={t("games_set_cover")}
                        >
                          <img src={imageUrl} alt="" />
                          {coverImage === imageUrl && !coverFile ? (
                            <span>{t("games_cover_selected")}</span>
                          ) : null}
                        </button>
                        <button
                          className="game-settings-image__remove"
                          onClick={() => handleRemoveImage(imageUrl)}
                          type="button"
                          aria-label={t("games_remove_image")}
                          title={t("games_remove_image")}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="game-cover-picker game-cover-picker--manual">
              <strong>{t("games_cover_picker")}</strong>
              <div className="game-cover-preview">
                {displayCover ? (
                  <img src={displayCover} alt={name || game.file} />
                ) : (
                  <span>{t("games_default_cover")}</span>
                )}
              </div>
              {imagePreviewUrls.length ? (
                <div className="game-extra-preview-grid" aria-label={t("games_new_images_field")}>
                  {imagePreviewUrls.map((previewUrl, index) => (
                    <img key={previewUrl} src={previewUrl} alt={`${name || game.file} ${index + 1}`} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {error ? <p className="dialog-error">{error}</p> : null}

          <div className="dialog-card__actions">
            <button className="dialog-button dialog-button--ghost" onClick={onClose} type="button">
              {t("cancel")}
            </button>
            <button className="dialog-button dialog-button--primary" disabled={submitting} type="submit">
              {submitting ? t("upload_saving") : t("save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SeriesDuplicateModal({ duplicateCount, totalCount, mediaType = "series", onChoose, t }) {
  if (!duplicateCount) return null;

  return (
    <div className="modal-backdrop">
      <div role="alertdialog" aria-modal="true" aria-labelledby="upload-conflict-title" className="dialog-card dialog-card--compact" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-card__header">
          <div>
            <p>{t(mediaType === "series" ? "upload_series" : mediaType === "books" ? "upload_books" : "upload_movie")}</p>
            <h2 id="upload-conflict-title">{t("upload_existing_title")}</h2>
          </div>
        </div>
        <p className="dialog-copy">
          {t(mediaType === "series" ? "upload_duplicates_copy" : "upload_existing_copy", { existing: duplicateCount, total: totalCount })}
        </p>
        <div className="dialog-card__actions">
          <button autoFocus className="dialog-button dialog-button--ghost" onClick={() => onChoose("cancel")} type="button">
            {t("cancel")}
          </button>
          {mediaType === "series" && <button className="dialog-button dialog-button--ghost" onClick={() => onChoose("new")} type="button">
            {t("upload_only_new")}
          </button>}
          <button className="dialog-button dialog-button--accent" onClick={() => onChoose("overwrite")} type="button">
            {t("upload_replace")}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddMediaModal({
  visible,
  mediaType,
  initialQuery = "",
  autoSearch = false,
  uploadFileName = "",
  uploadProgress = null,
  onClose,
  onCancelUpload,
  onAdd,
  t,
  tmdbLanguage,
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [subtitleFile, setSubtitleFile] = useState(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults([]);
      setSelectedId(null);
      setUploadTitle("");
      setSubtitleFile(null);
      setSearching(false);
      setSubmitting(false);
      setError("");
      return;
    }
    setQuery(initialQuery);
  }, [initialQuery, visible]);

  async function runSearch(searchTerm) {
    const trimmedQuery = String(searchTerm || "").trim();
    if (!trimmedQuery) {
      setResults([]);
      setSelectedId(null);
      setError(t("search_write_media", { media: mediaType === "movies" ? t("media_movies_singular") : t("media_series_singular") }));
      return;
    }

    setSearching(true);
    setError("");
    setSelectedId(null);
    setUploadTitle("");

    try {
      const nextResults =
        mediaType === "movies"
          ? await searchMovies(trimmedQuery, tmdbLanguage)
          : await searchTvSeries(trimmedQuery, tmdbLanguage);
      setResults(nextResults);
      if (!nextResults.length) {
        setError(
          mediaType === "movies"
            ? t("no_movie_results")
            : t("no_series_results")
        );
      }
    } catch (nextError) {
      setError(nextError.message || t("tmdb_search_failed"));
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    if (!visible || !autoSearch || !initialQuery.trim()) return;
    runSearch(initialQuery);
  }, [autoSearch, initialQuery, mediaType, visible]);

  async function handleSearch(event) {
    event.preventDefault();
    runSearch(query);
  }

  async function handleAdd() {
    const selectedItem = results.find((entry) => entry.id === selectedId);
    if (!selectedItem) return;

    const itemToAdd =
      mediaType === "movies" && uploadFileName
        ? { ...selectedItem, name: uploadTitle.trim() || selectedItem.name, subtitleFile }
        : selectedItem;

    setSubmitting(true);
    setError("");

    try {
      await onAdd(itemToAdd);
    } catch (nextError) {
      setError(
        nextError.name === "AbortError"
          ? t("upload_canceled")
          : nextError.message ||
          t("add_media_failed", { media: mediaType === "movies" ? t("media_movies_singular") : t("media_series_singular") })
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleClearSearch() {
    setQuery("");
    setResults([]);
    setSelectedId(null);
    setUploadTitle("");
    setError("");
  }

  if (!visible) return null;

  if (mediaType === "games") {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="dialog-card dialog-card--compact" onClick={(event) => event.stopPropagation()}>
          <div className="dialog-card__header">
            <div>
              <p>{t("media_games")}</p>
              <h2>{t("games_in_construction")}</h2>
            </div>
            <button className="dialog-card__close" onClick={onClose} type="button">
              ×
            </button>
          </div>
          <p className="dialog-copy">
            {t("games_section_reserved")}
          </p>
        </div>
      </div>
    );
  }

  const mediaLabel = mediaType === "movies" ? t("media_movies_singular") : t("media_series_singular");
  const searchPlaceholder = mediaType === "movies" ? t("search_placeholder_movie") : t("search_placeholder_series");
  const progressValue =
    uploadProgress && typeof uploadProgress === "object"
      ? clamp(Number(uploadProgress.percent) || 0, 0, 100)
      : clamp(Number(uploadProgress) || 0, 0, 100);
  const progressFileName =
    uploadProgress && typeof uploadProgress === "object"
      ? uploadProgress.fileName || uploadFileName
      : uploadFileName;
  const progressCopy =
    uploadProgress && typeof uploadProgress === "object"
      ? uploadProgress.status === "done"
        ? t("upload_all_done")
        : uploadProgress.status === "saving"
          ? t("upload_saving")
          : uploadProgress.total
            ? t("upload_chapter_copying", {
                current: uploadProgress.current || 1,
                total: uploadProgress.total,
              })
            : t("upload_copying")
      : t("upload_copying");
  const uploadActive = uploadProgress !== null;

  return (
    <div className="modal-backdrop">
      <div className="dialog-card dialog-card--add-series" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-card__header">
          <div>
            <p>{t("add_media", { media: mediaLabel })}</p>
            <h2>{t("search_tmdb")}</h2>
          </div>
          <button className="dialog-card__close" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <form className="add-series-search" onSubmit={handleSearch}>
          <label className="dialog-field">
            <span>{t("search")}</span>
            <div className="search-input-shell">
              <span className="search-input-shell__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="presentation">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="M16 16L21 21" />
                </svg>
              </span>
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
              />
              {query ? (
                <button
                  className="search-input-shell__clear"
                  onClick={handleClearSearch}
                  type="button"
                  aria-label={t("clear_search")}
                  title={t("clear_search")}
                >
                  ×
                </button>
              ) : null}
            </div>
          </label>

          <button className="dialog-button add-series-search__button" disabled={searching} type="submit">
            {searching ? t("searching_button") : t("search_button")}
          </button>
        </form>

        <div className="add-series-results">
          {results.length ? (
            <div
              className="add-series-results__list"
              role="listbox"
              aria-label={t("search_results_for", { media: mediaType === "movies" ? t("media_movies") : t("media_series") })}
            >
              {results.map((result) => {
                const isSelected = result.id === selectedId;
                const meta = [
                  mediaType === "movies"
                    ? result.releaseDate
                      ? result.releaseDate.slice(0, 4)
                      : ""
                    : result.firstAirDate
                      ? result.firstAirDate.slice(0, 4)
                      : "",
                  result.originalName,
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <button
                    key={result.id}
                    className={`add-series-result${isSelected ? " active" : ""}`}
                    onClick={() => {
                      setSelectedId(result.id);
                      if (mediaType === "movies" && uploadFileName) {
                        setUploadTitle(result.name || "");
                      }
                    }}
                    type="button"
                  >
                    <div className="add-series-result__poster">
                      {result.posterImage ? <img src={result.posterImage} alt={result.name} /> : <span>{t("no_images_available")}</span>}
                    </div>

                    <div className="add-series-result__body">
                      <h3>{result.name}</h3>
                      {meta ? <p className="add-series-result__meta">{meta}</p> : null}
                      <p className="add-series-result__overview">
                        {result.overview || t("no_tmdb_description")}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="add-series-results__empty">
              <p>{t("search_to_see_results", { media: mediaLabel })}</p>
            </div>
          )}
        </div>

        {mediaType === "movies" && uploadFileName ? <MovieSubtitleField file={subtitleFile} onChange={setSubtitleFile} disabled={submitting} t={t} /> : null}
        {mediaType === "movies" && uploadFileName && selectedId ? (
          <label className="dialog-field add-series-upload-title">
            <span>{t("upload_movie_title_field")}</span>
            <input
              type="text"
              value={uploadTitle}
              onChange={(event) => setUploadTitle(event.target.value)}
              placeholder={results.find((entry) => entry.id === selectedId)?.name || ""}
              disabled={submitting}
            />
          </label>
        ) : null}

        {error ? <p className="dialog-error">{error}</p> : null}

        <div className="dialog-card__actions">
          <button
            className="dialog-button dialog-button--ghost"
            onClick={uploadActive ? onCancelUpload : onClose}
            type="button"
          >
            {t("cancel")}
          </button>
          {uploadProgress !== null ? (
            <div className="upload-progress" role="status" aria-live="polite">
              <div className="upload-progress__copy">
                <strong>{progressCopy}</strong>
                <span title={progressFileName}>{progressFileName}</span>
              </div>
              <div className="upload-progress__bar" aria-hidden="true">
                <span style={{ width: `${progressValue}%` }} />
              </div>
              <p>{`${progressValue}%`}</p>
            </div>
          ) : null}

          <button
            className={`dialog-button${selectedId && !submitting ? " dialog-button--accent" : ""}`}
            disabled={!selectedId || submitting}
            onClick={handleAdd}
            type="button"
          >
            {submitting ? t("adding_button") : uploadFileName ? t("upload_button") : t("add_button")}
          </button>
        </div>
      </div>
    </div>
  );
}

function GameUploadModal({
  initialSystemId,
  visible,
  file,
  initialQuery,
  uploadProgress = null,
  onClose,
  onCancelUpload,
  onUpload,
  t,
}) {
  const [metadataSelection, setMetadataSelection] = useState(null);
  const [metadataBusy, setMetadataBusy] = useState(false);
  const [gameName, setGameName] = useState("");
  const [description, setDescription] = useState("");
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState("");
  const [imageFiles, setImageFiles] = useState([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const extension = getFileExtension(file?.name);
  const [platform, setPlatform] = useState("");
  const allowedSystems = compatibleSystems(file?.name);
  useEffect(() => {
    const matches = compatibleSystems(file?.name);
    setPlatform(matches.some(s => s.id === initialSystemId) ? initialSystemId : matches.length === 1 ? matches[0].id : "");
  }, [file, initialSystemId]);
  const platformLabel = GAME_SYSTEMS.find(s => s.id === platform)?.name || t("game_platform_label");

  useEffect(() => {
    if (!visible) {
      setGameName("");
      setDescription("");
      setCoverFile(null);
      setCoverPreviewUrl("");
      setImageFiles([]);
      setImagePreviewUrls([]);
      setSubmitting(false);
      setError("");
      return;
    }
    setMetadataSelection(null);
    setGameName(initialQuery || stripFileExtension(file?.name || ""));
    setDescription("");
    setCoverFile(null);
    setCoverPreviewUrl("");
    setImageFiles([]);
    setImagePreviewUrls([]);
  }, [file, initialQuery, visible]);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreviewUrl("");
      return () => {};
    }

    const nextPreviewUrl = URL.createObjectURL(coverFile);
    setCoverPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [coverFile]);

  useEffect(() => {
    if (!imageFiles.length) {
      setImagePreviewUrls([]);
      return () => {};
    }

    const nextPreviewUrls = imageFiles.map((imageFile) => URL.createObjectURL(imageFile));
    setImagePreviewUrls(nextPreviewUrls);
    return () => nextPreviewUrls.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
  }, [imageFiles]);

  if (!visible || !file) return null;

  async function handleSubmit() {
    if (!platform) { setError(t("game_platform_label")); return; }
    const safeGameName = gameName.trim() || stripFileExtension(file.name);
    setSubmitting(true);
    setError("");
    try {
      await onUpload({
        game: {
          ...metadataSelection,
          id: metadataSelection?.id || "manual",
          platform,
          name: safeGameName,
          description: description.trim(),
          source: metadataSelection?.source || (coverFile || imageFiles.length ? "local" : "manual"),
        },
        cover: coverFile
          ? {
              id: "local",
              file: coverFile,
              previewUrl: coverPreviewUrl,
              imageFiles,
              imagePreviewUrls,
              label: coverFile.name,
            }
          : imageFiles.length
            ? {
                id: "local-images",
                imageFiles,
                imagePreviewUrls,
              }
            : null,
      });
    } catch (nextError) {
      setError(nextError.name === "AbortError" ? t("upload_canceled") : nextError.message || t("upload_game_failed"));
    } finally {
      setSubmitting(false);
    }
  }

  const progressValue =
    uploadProgress && typeof uploadProgress === "object"
      ? clamp(Number(uploadProgress.percent) || 0, 0, 100)
      : clamp(Number(uploadProgress) || 0, 0, 100);
  const uploadActive = uploadProgress !== null;

  return (
    <div className="modal-backdrop">
      <div className="dialog-card dialog-card--add-series game-upload-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-card__header">
          <div>
            <p>{platformLabel}</p>
            <h2>{t("games_upload_title")}</h2>
          </div>
          <button className="dialog-card__close" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <form
          className="game-upload-form"
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <GameMetadataPicker key={`${file.name}:${platform}`} initialQuery={initialQuery || stripFileExtension(file.name)}
            platform={platform} extension={extension} disabled={submitting} t={t} onBusy={setMetadataBusy}
            onSelect={item => {
              setMetadataSelection(item);
              if (item) { setGameName(item.name); setDescription(item.description || ""); }
            }} />
          <div className="game-upload-layout">
            <div className="game-upload-fields">
              <label className="dialog-field"><span>{t("game_platform_label")}</span>
                <select value={platform} required disabled={submitting} onChange={event => { setPlatform(event.target.value); setMetadataSelection(null); }}>
                  <option value="" disabled>— {t("game_platform_label")} —</option>
                  {allowedSystems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="dialog-field">
                <span>{t("games_name_field")}</span>
                <input
                  type="text"
                  value={gameName}
                  onChange={(event) => setGameName(event.target.value)}
                  placeholder={stripFileExtension(file.name)}
                />
              </label>

              <label className="dialog-field">
                <span>{t("games_description_field")}</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t("games_description_placeholder")}
                  rows={5}
                />
              </label>

              <label className="dialog-field">
                <span>{t("games_cover_file_field")}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] || null;
                    setCoverFile(nextFile);
                  }}
                />
              </label>

              <label className="dialog-field">
                <span>{t("games_extra_images_field")}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  onChange={(event) => {
                    setImageFiles(Array.from(event.target.files || []));
                  }}
                />
              </label>
            </div>

            <div className="game-cover-picker game-cover-picker--manual">
              <strong>{t("games_cover_picker")}</strong>
              <div className="game-cover-preview">
                {(coverPreviewUrl || metadataSelection?.covers?.[0]?.url) ? (
                  <GameImagePreview src={coverPreviewUrl || gameMetadataImageUrl(metadataSelection?.covers?.[0]?.url)} alt={`${gameName || file.name} — ${t("games_cover_picker")}`} t={t} />
                ) : (
                  <span>{t("games_default_cover")}</span>
                )}
              </div>
              {metadataSelection?.screenshots?.length > 0 && <div className="game-extra-preview-grid">
                {metadataSelection.screenshots.map((entry, index) => <GameImagePreview key={entry.url} src={gameMetadataImageUrl(entry.url)} loading="lazy" alt={`${gameName || file.name} — ${t("games_image_number", { number: index + 1 })}`} t={t} />)}
              </div>}
              {imagePreviewUrls.length ? (
                <div className="game-extra-preview-grid" aria-label={t("games_extra_images_field")}>
                  {imagePreviewUrls.map((previewUrl, index) => (
                    <GameImagePreview key={previewUrl} src={previewUrl} alt={`${gameName || file.name} — ${t("games_image_number", { number: index + 1 })}`} t={t} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {error ? <p className="dialog-error">{error}</p> : null}

          <div className="dialog-card__actions">
            <button
              className="dialog-button dialog-button--ghost"
              onClick={uploadActive ? onCancelUpload : onClose}
              type="button"
            >
              {t("cancel")}
            </button>
            {uploadProgress !== null ? (
              <div className="upload-progress" role="status" aria-live="polite">
                <div className="upload-progress__copy">
                  <strong>{progressValue >= 100 ? t("games_metadata_saving") : t("upload_copying")}</strong>
                  <span title={file.name}>{file.name}</span>
                </div>
                <div className="upload-progress__bar" aria-hidden="true">
                  <span style={{ width: `${progressValue}%` }} />
                </div>
                <p>{`${progressValue}%`}</p>
              </div>
            ) : null}
            <button className="dialog-button dialog-button--accent" disabled={submitting || metadataBusy} type="submit">
              {submitting ? t("adding_button") : t("upload_button")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const BOOK_UPLOAD_REPORT_KEY = "minitv-book-upload-report-v1";
function BookUploadProgressModal({ upload, onCancel, onClose, t }) {
  if (!upload) return null;
  const progressValue = clamp(Number(upload.progress?.percent) || 0, 0, 100);
  const isUploading = upload.phase === "uploading";
  const isDone = upload.phase === "done";
  const progressTitle = upload.progress?.status === "saving"
    ? t("upload_saving")
    : isDone
      ? t("upload_all_done")
      : t("upload_copying");

  return createPortal(
    <div className="modal-backdrop">
      <div className="dialog-card book-upload-progress-dialog" role="dialog" aria-modal="true" aria-labelledby="book-upload-progress-title">
        <div className="dialog-card__header">
          <div>
            <p>{t("media_books")}</p>
            <h2 id="book-upload-progress-title">{isDone ? t("book_upload_complete") : upload.phase === "error" ? t("book_upload_error") : t("book_upload_loading")}</h2>
          </div>
          {!isUploading ? <button className="dialog-card__close" onClick={onClose} type="button">×</button> : null}
        </div>
        {upload.phase === "error" ? (
          <p className="dialog-error">{upload.error || t("book_upload_failed")}</p>
        ) : (
          <div className="upload-progress book-upload-progress" role="status" aria-live="polite">
            <div className="upload-progress__copy">
              <strong>{progressTitle}</strong>
              <span>{upload.label}</span>
            </div>
            <div className="upload-progress__bar" aria-hidden="true">
              <span style={{ width: `${isDone ? 100 : progressValue}%` }} />
            </div>
            <p>{isDone ? upload.summary : `${progressValue}% · ${upload.progress?.current || 0}/${upload.progress?.total || 0} · ${upload.progress?.fileName || upload.label}`}</p>
          </div>
        )}
        {upload.report ? <div className="book-upload-report">
          <p>{new Date(upload.report.startedAt).toLocaleString()} · {upload.report.files.filter((file) => file.status === "saved").length}/{upload.report.files.length} archivos guardados</p>
          {upload.report.note ? <p>{upload.report.note}</p> : null}
          {upload.report.storageError ? <p role="alert">{upload.report.storageError}</p> : null}
          <details open={upload.phase === "error"}>
            <summary>Detalles de la subida</summary>
            <ul>{upload.report.files.map((file, index) => <li key={index}><strong>{({ saved: "Guardado", pending: "Pendiente", uploading: "Sin confirmación", error: "Error", canceled: "Cancelado", rejected: "Formato no compatible" })[file.status] || file.status}</strong> · {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB{file.error ? ` — ${file.error}` : ""}{file.httpStatus ? ` (HTTP ${file.httpStatus})` : ""}</li>)}</ul>
          </details>
          <button className="dialog-button dialog-button--ghost" type="button" onClick={() => {
            const url = URL.createObjectURL(new Blob([JSON.stringify(upload.report, null, 2)], { type: "application/json" }));
            const link = document.createElement("a"); link.href = url; link.download = "informe-subida-comics.json"; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}>Descargar informe</button>
        </div> : null}
        <div className="dialog-card__actions">
          <button className={`dialog-button ${isDone ? "dialog-button--accent" : "dialog-button--ghost"}`} onClick={isUploading ? onCancel : onClose} type="button">
            {isUploading ? t("cancel") : t("close")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function GameMetadataBrowserModal({ visible, initialQuery = "", onClose, t }) {
  const [query, setQuery] = useState("");
  const [platformExtension, setPlatformExtension] = useState("gba");
  const [results, setResults] = useState([]);
  const [selectedGameId, setSelectedGameId] = useState("");
  const [selectedCoverKey, setSelectedCoverKey] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setPlatformExtension("gba");
      setResults([]);
      setSelectedGameId("");
      setSelectedCoverKey("");
      setSearching(false);
      setError("");
      return;
    }

    setQuery(initialQuery || "");
  }, [visible]);

  useEffect(() => {
    if (!visible) return () => {};

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible]);

  async function runSearch(event) {
    event?.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setResults([]);
      setSelectedGameId("");
      setSelectedCoverKey("");
      setError(t("games_search_empty"));
      return;
    }

    setSearching(true);
    setError("");
    setSelectedGameId("");
    setSelectedCoverKey("");

    try {
      const payload = await searchGameMetadata({ query: trimmedQuery, extension: GAME_SYSTEMS.find(s => s.id === platformExtension)?.extensions[0], platform: platformExtension });
      const nextResults = Array.isArray(payload?.results) ? payload.results : [];
      setResults(nextResults);
      if (nextResults.length) {
        const firstResult = nextResults[0];
        setSelectedGameId(`${firstResult.source}:${firstResult.id || firstResult.name}`);
        setSelectedCoverKey(firstResult.covers?.[0]?.url || "");
      } else {
        setError(payload?.configured === false ? t("games_api_not_configured") : t("games_no_results"));
      }
    } catch (nextError) {
      setResults([]);
      setError(nextError.message || t("games_search_failed"));
    } finally {
      setSearching(false);
    }
  }

  if (!visible) return null;

  const selectedGame =
    results.find((entry) => `${entry.source}:${entry.id || entry.name}` === selectedGameId) || null;
  const selectedCover =
    (selectedGame?.covers || []).find((cover) => cover.url && cover.url === selectedCoverKey) ||
    selectedGame?.covers?.[0] ||
    null;
  const platformLabel =
    GAME_METADATA_PLATFORM_OPTIONS.find((option) => option.value === platformExtension)?.label ||
    GAME_PLATFORM_LABELS[platformExtension] ||
    t("media_games_singular");

  return (
    <div className="modal-backdrop modal-backdrop--tmdb-browser" onClick={onClose}>
      <div
        className="dialog-card dialog-card--tmdb-browser"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="dialog-card__header">
          <div>
            <p>ScreenScraper · IGDB</p>
            <h2>{t("game_browser_title")}</h2>
          </div>
          <button className="dialog-card__close" onClick={onClose} type="button" aria-label={t("close")}>
            ×
          </button>
        </div>

        <form className="tmdb-browser__search game-browser__search" onSubmit={runSearch}>
          <label className="dialog-field game-browser__platform">
            <span>{t("game_browser_platform")}</span>
            <select
              value={platformExtension}
              onChange={(event) => {
                setPlatformExtension(event.target.value);
                setResults([]);
                setSelectedGameId("");
                setSelectedCoverKey("");
                setError("");
              }}
            >
              {GAME_METADATA_PLATFORM_OPTIONS.map((option) => (
                <option key={option.key} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="dialog-field tmdb-browser__query">
            <span>{t("search")}</span>
            <div className="search-input-shell">
              <span className="search-input-shell__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="presentation">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="M16 16L21 21" />
                </svg>
              </span>
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("games_search_placeholder")}
              />
            </div>
          </label>

          <button className="dialog-button tmdb-browser__search-button" disabled={searching} type="submit">
            {searching ? t("searching_button") : t("search_button")}
          </button>
        </form>

        {error ? <p className="dialog-error">{error}</p> : null}

        <div className="tmdb-browser__layout">
          <section className="tmdb-browser__results" aria-label={t("game_browser_results")}>
            {results.length ? (
              <div className="add-series-results__list">
                {results.map((result) => {
                  const resultId = `${result.source}:${result.id || result.name}`;
                  const isSelected = resultId === selectedGameId;
                  return (
                    <button
                      key={resultId}
                      className={`add-series-result tmdb-browser-result${isSelected ? " active" : ""}`}
                      onClick={() => {
                        setSelectedGameId(resultId);
                        setSelectedCoverKey(result.covers?.[0]?.url || "");
                      }}
                      type="button"
                    >
                      <div className="add-series-result__poster">
                        {result.covers?.[0]?.url ? (
                          <img src={gameMetadataImageUrl(result.covers[0].url)} alt={result.name} />
                        ) : (
                          <span>{t("games_default_cover")}</span>
                        )}
                      </div>
                      <div className="add-series-result__body">
                        <h3>{result.name}</h3>
                        <p className="add-series-result__meta">{platformLabel}</p>
                        <p className="add-series-result__overview">
                          {result.description || t("synopsis_unavailable")}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="add-series-results__empty">
                <p>{searching ? t("game_browser_loading") : t("game_browser_search_intro")}</p>
              </div>
            )}
          </section>

          <section className="tmdb-browser__preview">
            {!selectedGame ? (
              <div className="add-series-results__empty">
                <p>{t("game_browser_select_prompt")}</p>
              </div>
            ) : (
              <div className="game-browser-profile">
                <div className="game-browser-profile__cover">
                  {selectedCover?.url ? (
                    <img src={gameMetadataImageUrl(selectedCover.url)} alt={selectedGame.name} />
                  ) : (
                    <span>{t("games_default_cover")}</span>
                  )}
                </div>

                <div className="game-browser-profile__body">
                  <h3>{selectedGame.name}</h3>
                  <dl className="game-browser-profile__facts">
                    <div>
                      <dt>{t("game_browser_platform")}</dt>
                      <dd>{platformLabel}</dd>
                    </div>
                    <div>
                      <dt>{t("game_browser_source")}</dt>
                      <dd>{selectedGame.source || "ScreenScraper"}</dd>
                    </div>
                  </dl>
                  <div className="episode-dialog__synopsis game-browser-profile__synopsis">
                    <strong>{`${t("synopsis")}:`}</strong>
                    <p>{selectedGame.description || t("synopsis_unavailable")}</p>
                  </div>
                </div>

                {selectedGame.covers?.length ? (
                  <div className="game-cover-picker game-browser-profile__covers">
                    <strong>{t("games_cover_picker")}</strong>
                    <div className="game-cover-picker__grid">
                      {selectedGame.covers.map((cover) => {
                        const isSelected = cover.url === selectedCover?.url;
                        return (
                          <button
                            key={cover.id || cover.url}
                            className={`game-cover-option${isSelected ? " active" : ""}`}
                            onClick={() => setSelectedCoverKey(cover.url || "")}
                            type="button"
                          >
                            {cover.url ? <img src={gameMetadataImageUrl(cover.url)} alt={cover.label || selectedGame.name} /> : <span>{cover.label || t("games_default_cover")}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function TmdbBrowserModal({ visible, onClose, t, tmdbLanguage, initialMediaType = "series", initialMovie = null, onTorrentStarted, onTorrentDashboard }) {
  const [mediaType, setMediaType] = useState(initialMediaType);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  const [seasonEpisodes, setSeasonEpisodes] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [browserView, setBrowserView] = useState("results");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) {
      setMediaType(initialMediaType);
      setQuery("");
      setResults([]);
      setSelectedItem(null);
      setSelectedSeasonId(null);
      setSeasonEpisodes(null);
      setSelectedEpisode(null);
      setBrowserView("results");
      setError("");
    }
  }, [visible, initialMediaType]);

  useEffect(() => {
    if (!visible || !initialMovie) return;
    let cancelled = false;
    const isSeries = initialMovie.mediaType === "tv";
    setMediaType(isSeries ? "series" : "movies");
    setBrowserView(isSeries ? "seasons" : "movie");
    setSelectedItem(null);
    setSelectedSeasonId(null);
    setSeasonEpisodes(null);
    setSelectedEpisode(null);
    setLoadingDetails(true);
    setError("");
    const getDetails = isSeries ? getTvSeriesById : getMovieById;
    const localized = getDetails(initialMovie.tmdbId, tmdbLanguage, true);
    const english = isSeries || tmdbLanguage === "en-US" ? localized : getDetails(initialMovie.tmdbId, "en-US", true);
    Promise.all([localized, english]).then(([details, englishDetails]) => {
      if (!cancelled) setSelectedItem({ ...details, englishName: englishDetails.name });
    }).catch(nextError => {
      if (!cancelled) setError(nextError.message || t("tmdb_browser_load_failed"));
    }).finally(() => {
      if (!cancelled) setLoadingDetails(false);
    });
    return () => { cancelled = true; };
  }, [visible, initialMovie, tmdbLanguage]);

  useEffect(() => {
    if (!visible) return () => {};

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [visible]);

  async function runSearch(event) {
    event?.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setResults([]);
      setError(t("search_write_media", { media: mediaType === "movies" ? t("media_movies_singular") : t("media_series_singular") }));
      return;
    }

    setSearching(true);
    setError("");
    setSelectedItem(null);
    setSelectedSeasonId(null);
    setSeasonEpisodes(null);
    setSelectedEpisode(null);
    setBrowserView("results");

    try {
      const nextResults =
        mediaType === "movies"
          ? await searchMovies(trimmedQuery, tmdbLanguage)
          : await searchTvSeries(trimmedQuery, tmdbLanguage);
      setResults(nextResults);
      if (!nextResults.length) {
        setError(mediaType === "movies" ? t("no_movie_results") : t("no_series_results"));
      }
    } catch (nextError) {
      setResults([]);
      setError(nextError.message || t("tmdb_search_failed"));
    } finally {
      setSearching(false);
    }
  }

  async function handlePreview(result) {
    setLoadingDetails(true);
    setError("");
    setSelectedItem(null);
    setSelectedSeasonId(null);
    setSeasonEpisodes(null);
    setSelectedEpisode(null);
    setBrowserView(mediaType === "movies" ? "movie" : "seasons");

    try {
      const details =
        mediaType === "movies"
          ? await getMovieById(result.id, tmdbLanguage, true)
          : await getTvSeriesById(result.id, tmdbLanguage, true);
      setSelectedItem(details);
      if (mediaType === "series") {
        setSelectedSeasonId(null);
      }
    } catch (nextError) {
      setError(nextError.message || t("tmdb_browser_load_failed"));
    } finally {
      setLoadingDetails(false);
    }
  }

  const selectedSeason =
    mediaType === "series"
      ? (selectedItem?.seasons || []).find((season) => season.id === selectedSeasonId) || null
      : null;

  useEffect(() => {
    if (!visible || mediaType !== "series" || browserView !== "episodes" || !selectedItem?.id || !selectedSeason) {
      setSeasonEpisodes(null);
      return;
    }

    let cancelled = false;
    async function loadEpisodes() {
      setLoadingEpisodes(true);
      try {
        const nextSeason = await getTvSeasonEpisodes({
          seriesId: selectedItem.id,
          importPreview: true,
          seasonNumber: selectedSeason.seasonNumber || selectedSeason.id,
          language: tmdbLanguage,
        });
        if (!cancelled) {
          setSeasonEpisodes(nextSeason);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError.message || t("tmdb_browser_load_failed"));
          setSeasonEpisodes(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingEpisodes(false);
        }
      }
    }

    loadEpisodes();
    return () => {
      cancelled = true;
    };
  }, [visible, mediaType, browserView, selectedItem?.id, selectedSeason?.id, tmdbLanguage]);

  if (!visible) return null;

  const mediaLabel = mediaType === "movies" ? t("media_movies_singular") : t("media_series_singular");
  const canShowSearch = browserView === "results";
  const releaseDate = selectedItem?.releaseDate;
  const releaseTimestamp = releaseDate ? Date.parse(`${releaseDate}T00:00:00Z`) : NaN;
  const formattedReleaseDate = Number.isFinite(releaseTimestamp)
    ? new Intl.DateTimeFormat(tmdbLanguage, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(releaseTimestamp)
    : releaseDate || t("release_unknown");

  function resetBrowserForMedia(nextType) {
    setMediaType(nextType);
    setResults([]);
    setSelectedItem(null);
    setSelectedSeasonId(null);
    setSeasonEpisodes(null);
    setSelectedEpisode(null);
    setBrowserView("results");
    setError("");
  }

  function handleBack() {
    setError("");
    if (browserView === "episode") {
      setSelectedEpisode(null);
      setBrowserView("episodes");
      return;
    }
    if (browserView === "episodes") {
      setSelectedSeasonId(null);
      setSeasonEpisodes(null);
      setBrowserView("seasons");
      return;
    }
    setSelectedItem(null);
    setSelectedSeasonId(null);
    setSeasonEpisodes(null);
    setSelectedEpisode(null);
    setBrowserView("results");
  }

  function handleOpenSeason(seasonId) {
    setSelectedSeasonId(seasonId);
    setSeasonEpisodes(null);
    setSelectedEpisode(null);
    setBrowserView("episodes");
  }

  return (
    <div className="modal-backdrop modal-backdrop--tmdb-browser">
      <div
        className="dialog-card dialog-card--tmdb-browser"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {!canShowSearch && (
          <div className="tmdb-browser__toolbar">
            <button className="back-button season-page__back tmdb-browser__back" onClick={handleBack} type="button">
              <span className="season-page__back-arrow" aria-hidden="true">←</span>
              <span className="season-page__back-label">{t("back")}</span>
            </button>
          </div>
        )}
        <div className="dialog-card__header">
          <div>
            <h2>{t("tmdb_browser_title")}{mediaType === "movies" && selectedItem ? `: ${selectedItem.name}` : ""}</h2>
          </div>
          <button className="dialog-card__close" onClick={onClose} type="button" aria-label={t("close")}>
            ×
          </button>
        </div>

        {canShowSearch ? (
        <form className="tmdb-browser__search" onSubmit={runSearch}>
          <div className="media-switch tmdb-browser__switch" role="tablist" aria-label={t("raspberry_sections")}>
            {["series", "movies"].map((nextType) => {
              const isActive = nextType === mediaType;
              return (
                <button
                  key={nextType}
                  className={`media-switch__option${isActive ? " active" : ""}`}
                  onClick={() => resetBrowserForMedia(nextType)}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                >
                  <img
                    className="media-switch__icon"
                    src={isActive ? (nextType === "movies" ? movieIconBlack : tvshowIconBlack) : (nextType === "movies" ? movieIconYellow : tvshowIconYellow)}
                    alt=""
                    aria-hidden="true"
                  />
                  <span>{nextType === "movies" ? t("media_movies") : t("media_series")}</span>
                </button>
              );
            })}
          </div>

          <label className="dialog-field tmdb-browser__query">
            <span>{t("tmdb_browser_search_label")}</span>
            <div className="search-input-shell">
              <span className="search-input-shell__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="presentation">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="M16 16L21 21" />
                </svg>
              </span>
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={mediaType === "movies" ? t("search_placeholder_movie") : t("search_placeholder_series")}
              />
            </div>
          </label>

          <button className="dialog-button tmdb-browser__search-button" disabled={searching} type="submit">
            {searching ? t("searching_button") : t("search_button")}
          </button>
        </form>
        ) : null}

        {error ? <p className="dialog-error">{error}</p> : null}

        <div className={`tmdb-browser__layout tmdb-browser__layout--${browserView}`}>
          {browserView === "results" ? (
          <section className="tmdb-browser__results" aria-label={t("tmdb_browser_results")}>
            {results.length ? (
              <div className="add-series-results__list">
                {results.map((result) => {
                  const isSelected = Number(result.id) === Number(selectedItem?.id);
                  const meta = [
                    mediaType === "movies" ? result.releaseDate?.slice(0, 4) : result.firstAirDate?.slice(0, 4),
                    result.originalName,
                  ]
                    .filter(Boolean)
                    .join(" · ");

                  return (
                    <article
                      key={result.id}
                      className={`add-series-result tmdb-browser-result${isSelected ? " active" : ""}`}
                    >
                      <div className="add-series-result__poster">
                        {result.posterImage ? <img src={result.posterImage} alt={result.name} /> : <span>{t("no_images_available")}</span>}
                      </div>
                      <div className="add-series-result__body">
                        <h3>{result.name}</h3>
                        {meta ? <p className="add-series-result__meta">{meta}</p> : null}
                        <p className="add-series-result__overview">{result.overview || t("no_tmdb_description")}</p>
                        <button
                          className="dialog-button dialog-button--accent tmdb-browser-result__button"
                          onClick={() => handlePreview(result)}
                          type="button"
                        >
                          {t("tmdb_browser_preview")}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="add-series-results__empty">
                <p>{t("tmdb_browser_search_intro", { media: mediaLabel })}</p>
              </div>
            )}
          </section>
          ) : null}

          {browserView !== "results" ? (
          <section className="tmdb-browser__preview">
            {loadingDetails ? (
              <div className="add-series-results__empty">
                <p>{t("tmdb_browser_loading")}</p>
              </div>
            ) : !selectedItem ? (
              <div className="add-series-results__empty">
                <p>{t("tmdb_browser_select_prompt")}</p>
              </div>
            ) : mediaType === "series" && browserView === "seasons" ? (
              <div className="tmdb-browser-series">
                <header
                  className="tmdb-browser-series__hero"
                  style={{
                    backgroundImage: `linear-gradient(rgba(7, 12, 18, 0.18), rgba(7, 12, 18, 0.5)), url(${selectedItem.heroImage || cartellLogo})`,
                  }}
                >
                  <h3>{selectedItem.name}</h3>
                  <p>{`${selectedItem.seasonCount || selectedItem.seasons?.length || 0} ${t("seasons_label")} · ${selectedItem.totalEpisodeCount || 0} ${t("episodes")}`}</p>
                </header>

                <ImdbRating kind="tv" tmdbId={selectedItem.id} imdbId={selectedItem.imdbId} language={tmdbLanguage} />
                <div className="tmdb-browser-series__seasons">
                  {(selectedItem.seasons || []).map((season) => (
                    <SeasonCard
                      key={season.id}
                      season={season}
                      isActive={false}
                      disabled={false}
                      onSelect={handleOpenSeason}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            ) : mediaType === "series" && browserView === "episodes" ? (
              <div className="tmdb-browser-series">
                {selectedSeason ? (
                  <div className="tmdb-browser-series__episodes">
                    {loadingEpisodes ? (
                      <div className="add-series-results__empty">
                        <p>{t("loading_episodes")}</p>
                      </div>
                    ) : (
                      (seasonEpisodes?.episodes || []).map((episode) => (
                        <EpisodeRow
                          key={episode.id}
                          episode={episode}
                          available
                          onSelect={(nextEpisode) => {
                            setSelectedEpisode(nextEpisode);
                            setBrowserView("episode");
                          }}
                          t={t}
                        />
                      ))
                    )}
                  </div>
                ) : (
                  <div className="add-series-results__empty">
                    <p>{t("tmdb_browser_season_prompt")}</p>
                  </div>
                )}
              </div>
            ) : mediaType === "series" && browserView === "episode" && selectedEpisode ? (
              <div className="tmdb-browser-episode">
                <div className="episode-dialog__media">
                  {selectedEpisode.image ? <img src={selectedEpisode.image} alt={selectedEpisode.title} /> : null}
                </div>
                <div className="episode-dialog__content">
                  <p className="episode-dialog__eyebrow">
                    {selectedSeason?.title || seasonEpisodes?.title || t("season_label")}
                  </p>
                  <h2>
                    {selectedEpisode.episodeNumber}. {selectedEpisode.title}
                  </h2>
                  <dl className="episode-dialog__facts">
                    <div>
                      <strong>{`${t("release")}:`}</strong>
                      <span>{selectedEpisode.airDate || t("not_available")}</span>
                    </div>
                  </dl>
                  <div className="episode-dialog__synopsis">
                    <strong>{`${t("synopsis")}:`}</strong>
                    <p>{selectedEpisode.synopsis || t("synopsis_unavailable")}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="movie-panel tmdb-browser-movie">
                <div className="movie-panel__card">
                  <div className="tmdb-browser-movie__trailer">
                    {selectedItem.trailer ? (
                      <iframe
                        key={selectedItem.trailer.key}
                        src={`https://www.youtube-nocookie.com/embed/${selectedItem.trailer.key}`}
                        title={`${t("tmdb_browser_trailer")}: ${selectedItem.name}`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                      />
                    ) : <p>{t("tmdb_browser_no_trailer")}</p>}
                  </div>

                  <div className="movie-panel__content">
                    <div className="movie-panel__overview">
                      <strong>{t("synopsis")}</strong>
                      <p>{selectedItem.overview || t("synopsis_unavailable")}</p>
                    </div>

                    <div className="tmdb-browser-movie__links">
                      {selectedItem.imdbUrl ? (
                        <a className="tmdb-browser-movie__link tmdb-browser-movie__link--imdb" href={selectedItem.imdbUrl} target="_blank" rel="noopener noreferrer" aria-label={t("imdb_link")}>
                          <span>IMDb</span><span aria-hidden="true">↗</span>
                        </a>
                      ) : null}
                      <a className="tmdb-browser-movie__link tmdb-browser-movie__link--tmdb" href={`https://www.themoviedb.org/movie/${selectedItem.id}`} target="_blank" rel="noopener noreferrer" aria-label={t("tmdb_link")}>
                        <span>TMDB</span><span aria-hidden="true">↗</span>
                      </a>
                    </div>

                    <dl className="tmdb-browser-movie__facts">
                      <div>
                        <dt>{t("release")}</dt>
                        <dd>{formattedReleaseDate}</dd>
                      </div>
                      <div>
                        <dt>{t("duration")}</dt>
                        <dd>{selectedItem.runtime ? `${selectedItem.runtime} min` : t("duration_unknown")}</dd>
                      </div>
                      <div className="tmdb-browser-movie__score">
                        <dt>{t("rating")}</dt>
                        <dd className="tmdb-browser-movie__rating">
                          {typeof selectedItem.voteAverage === "number" && selectedItem.voteAverage > 0 ? (
                            <><span aria-hidden="true">★</span> {selectedItem.voteAverage.toFixed(1)} <small>/ 10</small></>
                          ) : t("tmdb_rating_missing")}
                        </dd>
                      </div>
                    </dl>

                    <ImdbRating kind="movie" tmdbId={selectedItem.id} imdbId={selectedItem.imdbId} language={tmdbLanguage} />
                    <ul className="tmdb-browser-movie__genres" aria-label={t("genres")}>
                      {(selectedItem.genres?.length ? selectedItem.genres : [t("not_available")]).map((genre) => (
                        <li key={genre}>{genre}</li>
                      ))}
                    </ul>
                  </div>

                </div>
              </div>
            )}
            {!loadingDetails && selectedItem && <MediaTorrentSearch
              key={`${mediaType}-${selectedItem.id}-${browserView}-${selectedSeasonId || "all"}-${selectedEpisode?.episodeNumber || "all"}`}
              media={selectedItem} mediaType={mediaType}
              seasonNumber={mediaType === "series" && browserView !== "seasons" ? selectedSeason?.seasonNumber ?? null : null}
              episodeNumber={mediaType === "series" && browserView === "episode" ? selectedEpisode?.episodeNumber ?? null : null}
              language={tmdbLanguage} onStarted={onTorrentStarted} onDashboard={onTorrentDashboard}
            />}
          </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MiniTvModal({ visible, onClose, t }) {
  if (!visible) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="dialog-card dialog-card--compact" onClick={(event) => event.stopPropagation()}>
          <div className="dialog-card__header">
            <div>
              <p>{t("mini_tv_title")}</p>
              <h2>{t("mini_tv_config")}</h2>
            </div>
          <button className="dialog-card__close" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <p className="dialog-copy">
          {t("mini_tv_copy")}
        </p>
        <div className="dialog-card__actions">
          <button className="dialog-button" onClick={onClose} type="button">
            {t("done_close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadValidationModal({ visible, title, message, onClose, t }) {
  if (!visible) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="dialog-card dialog-card--compact" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-card__header">
          <div>
            <p>{t("latest_detection")}</p>
            <h2>{title}</h2>
          </div>
          <button className="dialog-card__close" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <p className="dialog-copy">{message}</p>
        <div className="dialog-card__actions">
          <button className="dialog-button" onClick={onClose} type="button">
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function RaspberryStatCard({ label, value, usedGb, percent, icon, t, calculating }) {
  return (
    <article className="raspberry-stat-card">
      <div className="raspberry-stat-card__label">
        <img className="raspberry-stat-card__icon" src={icon} alt="" aria-hidden="true" />
        <p>{label}</p>
      </div>
      <strong>{value}</strong>
      <span>
        {calculating ? "Calculando espacio…" : t("section_storage_used", {
          gb: formatStorageGb(usedGb),
          percent: formatPercent(percent),
        })}
      </span>
    </article>
  );
}

function RaspberryPoweroffModal({ visible, busy, onClose, onConfirm, t }) {
  if (!visible) return null;

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="dialog-card dialog-card--compact" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-card__header">
          <div>
            <p>{t("power_off")}</p>
            <h2>{t("power_off_confirm_title")}</h2>
          </div>
          <button className="dialog-card__close" onClick={onClose} type="button" disabled={busy}>
            ×
          </button>
        </div>
        <p className="dialog-copy">
          {t("power_off_confirm_copy")}
        </p>
        <div className="dialog-card__actions">
          <button className="dialog-button dialog-button--ghost" onClick={onClose} type="button" disabled={busy}>
            {t("cancel")}
          </button>
          <button className="dialog-button dialog-button--danger" onClick={onConfirm} type="button" disabled={busy}>
            {t("power_off_confirm_action")}
          </button>
        </div>
      </div>
    </div>
  );
}

function RaspberryNowPlayingCard({ playback, playbackActive, t }) {
  const isEpisode = playback?.kind === "episode";
  const isMovie = playback?.kind === "movie";
  const image = playbackActive ? playback?.image || cartellLogo : "";
  const isEmpty = !playbackActive;

  return (
    <div className={`raspberry-now-playing-card${isEmpty ? " is-empty" : ""}`}>
      <div className="raspberry-now-playing-card__media">
        {image ? (
          <img src={image} alt={playback?.title || t("nothing_playing")} />
        ) : (
          <img
            className="raspberry-now-playing-card__screen-off"
            src={screenOffIcon}
            alt={t("nothing_playing")}
          />
        )}
      </div>

      <div className="raspberry-now-playing-card__copy">
        <strong>
          {playbackActive && playback
            ? isEpisode
              ? playback.seriesName || playback.title
              : playback.title
            : playbackActive ? t("content_in_progress") : t("nothing_playing")}
        </strong>

        {playbackActive && playback && isEpisode ? (
          <>
            <span>{`${t("season_label")} ${playback.seasonNumber} - ${t("now_playing_episode_label")} ${playback.episodeNumber}`}</span>
            <span>{playback.episodeTitle}</span>
          </>
        ) : null}

        {playbackActive && playback && isMovie ? (
          <span>
            {playback.originalTitle && playback.originalTitle !== playback.title
              ? playback.originalTitle
              : t("content_in_progress")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

const EMPTY_BIRTHDAY_DRAFT = { id: "", type: "birthday", name: "", day: "", month: "", birthYear: "" };

function RaspberryBirthdaysCard({ birthdays, saving, status, onSaveList, t }) {
  const [draft, setDraft] = useState(EMPTY_BIRTHDAY_DRAFT);
  const [validationError, setValidationError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setValidationError("");
  }

  async function submitBirthday(event) {
    event.preventDefault();
    const day = Number(draft.day);
    const month = Number(draft.month);
    const validDate = month >= 1 && month <= 12 && day >= 1 && day <= new Date(2000, month, 0).getDate();
    if (!draft.name.trim() || !validDate) {
      setValidationError(t("birthday_invalid"));
      return;
    }
    const entry = {
      id: draft.id || `event-${Date.now()}`,
      type: draft.type,
      name: draft.name.trim(),
      date: `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      birthYear: draft.type === "birthday" && draft.birthYear ? Number(draft.birthYear) : null,
    };
    const next = draft.id
      ? birthdays.map((item) => (item.id === draft.id ? entry : item))
      : [...birthdays, entry];
    const saved = await onSaveList(next);
    if (saved) setDraft(EMPTY_BIRTHDAY_DRAFT);
  }

  function editBirthday(entry) {
    const [month, day] = String(entry.date || "-").split("-");
    setDraft({
      id: entry.id,
      type: entry.type || "birthday",
      name: entry.name || "",
      day: String(Number(day) || ""),
      month: String(Number(month) || ""),
      birthYear: entry.birthYear ? String(entry.birthYear) : "",
    });
    setValidationError("");
  }

  async function confirmDelete() {
    const saved = await onSaveList(birthdays.filter((entry) => entry.id !== deleteTarget.id));
    if (saved) {
      if (draft.id === deleteTarget.id) setDraft(EMPTY_BIRTHDAY_DRAFT);
      setDeleteTarget(null);
    }
  }

  return (
    <article className="raspberry-birthdays-card">
      <div className="raspberry-alarm-card__header-copy">
        <p>{t("birthdays_title")}</p>
        <span>{t("birthdays_copy")}</span>
      </div>
      <form className="raspberry-birthdays-card__form" onSubmit={submitBirthday}>
        <select value={draft.type} onChange={(event) => updateDraft("type", event.target.value)}>
          <option value="birthday">{t("birthday")}</option>
          <option value="saint">{t("saint")}</option>
        </select>
        <input value={draft.name} maxLength={80} onChange={(event) => updateDraft("name", event.target.value)} placeholder={t("person_name")} />
        <input type="number" min="1" max="31" value={draft.day} onChange={(event) => updateDraft("day", event.target.value)} placeholder={t("event_day")} aria-label={t("event_day")} />
        <input type="number" min="1" max="12" value={draft.month} onChange={(event) => updateDraft("month", event.target.value)} placeholder={t("event_month")} aria-label={t("event_month")} />
        {draft.type === "birthday" ? (
          <input type="number" min="1900" max={new Date().getFullYear()} value={draft.birthYear} onChange={(event) => updateDraft("birthYear", event.target.value)} placeholder={t("birth_year_optional")} />
        ) : <span />}
        <button type="submit" disabled={saving}>{t(draft.id ? "save_changes" : "add_event")}</button>
      </form>
      {validationError ? <span className="raspberry-birthdays-card__error">{validationError}</span> : null}
      {status ? <span className="raspberry-birthdays-card__status">{status}</span> : null}
      <div className="raspberry-birthdays-list">
        {birthdays.length ? [...birthdays].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)).map((entry) => {
          const [month, day] = entry.date.split("-");
          return (
            <div className="raspberry-birthdays-list__item" key={entry.id}>
              <div><strong>{entry.name}</strong><span>{t(entry.type === "saint" ? "saint" : "birthday")} · {day}/{month}{entry.birthYear ? `/${entry.birthYear}` : ""}</span></div>
              <div><button type="button" onClick={() => editBirthday(entry)}>{t("edit")}</button><button className="is-danger" type="button" onClick={() => setDeleteTarget(entry)}>{t("delete")}</button></div>
            </div>
          );
        }) : <p className="raspberry-birthdays-list__empty">{t("no_birthdays")}</p>}
      </div>
      {deleteTarget ? createPortal(
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="dialog-card raspberry-birthday-delete" role="alertdialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>{t("delete_event_title")}</h2>
            <p>{t("delete_event_copy", { name: deleteTarget.name })}</p>
            <div className="dialog-card__actions"><button className="dialog-button dialog-button--ghost" type="button" onClick={() => setDeleteTarget(null)}>{t("cancel")}</button><button className="dialog-button dialog-button--danger" type="button" disabled={saving} onClick={confirmDelete}>{t("delete")}</button></div>
          </div>
        </div>, document.body
      ) : null}
    </article>
  );
}

function RaspberryPage({
  profiles, userEditorId, onUserEditorChange, onManageUsers,
  raspberryTab,
  onChangeTab,
  dashboardSection,
  onDashboardSectionShown,
  onBack,
  onLogout,
  t,
  seriesCount,
  seriesUsedGb,
  seriesPercent,
  movieCount,
  movieUsedGb,
  moviePercent,
  gameCount,
  gameUsedGb,
  gamePercent,
  bookCount,
  bookUsedGb,
  bookPercent,
  pictureCount,
  pictureUsedGb,
  picturePercent,
  usedStorageGb,
  totalStorageGb,
  multimediaUsedGb,
  multimediaPercent,
  statsCalculating,
  alarm,
  alarmSounds,
  alarmPreviewSound,
  alarmPreviewPlaying,
  onAlarmTimeChange,
  onAlarmToggle,
  onAlarmSoundChange,
  onAlarmPreviewSoundChange,
  onAlarmPreviewPlay,
  onAlarmPreviewStop,
  birthdays,
  birthdaysSaving,
  birthdaysStatus,
  onSaveBirthdays,
  weatherLocation,
  weatherLocationStatus,
  weatherLocationDetails,
  onWeatherLocationChange,
  onWeatherLocationSave,
  raspberryHealth,
  currentPlaybackInfo,
  controlsBusy,
  onRefreshStatus,
  onPausePlayback,
  onStopPlayback,
  onNextEpisode,
  onVolumeDown,
  onVolumeUp,
  onPowerOff,
  canPlayNextEpisode,
  raspberryLanguage,
  onSetRaspberryLanguage,
  raspberryLanguageSaving,
  raspberryLanguageError,
  tmdbSettings,
  tmdbSettingsStatus,
  tmdbSettingsSaving,
  onTmdbSettingsChange,
  onTmdbSettingsSave,
  uploadMediaType,
  onUploadMediaTypeChange,
  uploadBookIsGraphicNovel,
  onUploadBookTypeChange,
  onUploadFiles,
  uploadDragActive,
  onUploadDragStateChange,
  uploadSummary,
  onOpenTmdbBrowser,
  torrentDownloads,
}) {
  const [poweroffDialogOpen, setPoweroffDialogOpen] = useState(false);
  const [cameraImageUrl, setCameraImageUrl] = useState("");
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const subtitleSettingsRef = useRef(null);

  useEffect(() => {
    if (raspberryTab !== "dashboard" || dashboardSection !== "subtitles" || !subtitleSettingsRef.current) return;
    subtitleSettingsRef.current.focus({ preventScroll: true });
    subtitleSettingsRef.current.scrollIntoView({ behavior: "instant", block: "center" });
    onDashboardSectionShown("");
  }, [raspberryTab, dashboardSection, onDashboardSectionShown]);

  useEffect(() => () => {
    if (cameraImageUrl) URL.revokeObjectURL(cameraImageUrl);
  }, [cameraImageUrl]);

  async function handleCameraCapture() {
    try {
      setCameraBusy(true);
      setCameraError("");
      const imageBlob = await captureCameraImage();
      setCameraImageUrl(URL.createObjectURL(imageBlob));
    } catch (error) {
      setCameraError(error?.message || t("camera_capture_error"));
    } finally {
      setCameraBusy(false);
    }
  }
  const uploadDropzoneCopyKey =
    uploadMediaType === "series"
      ? "upload_series_dropzone_copy"
      : uploadMediaType === "movies"
        ? "upload_movie_dropzone_copy"
        : uploadMediaType === "books"
          ? "upload_books_dropzone_copy"
          : uploadMediaType === "pictures"
            ? "upload_pictures_dropzone_copy"
          : "upload_game_dropzone_copy";
  const uploadTypeIconNormal =
    uploadMediaType === "series"
      ? tvshowIconWhite
      : uploadMediaType === "movies"
        ? movieIconWhite
        : uploadMediaType === "books" ? bookIconWhite : uploadMediaType === "pictures" ? picturesIcon : gameIconWhite;
  const uploadTypeIconHover =
    uploadMediaType === "series"
      ? tvshowIconYellow
      : uploadMediaType === "movies"
        ? movieIconYellow
        : uploadMediaType === "books" ? bookIconYellow : uploadMediaType === "pictures" ? picturesIcon : gameIconYellow;
  const playbackActive = Boolean(raspberryHealth.running);
  const playbackPaused = Boolean(currentPlaybackInfo?.paused);
  const controlsDisabled = !playbackActive || controlsBusy;
  const poweroffDisabled = controlsBusy || !raspberryHealth.ok;

  return (
    <section className="raspberry-page">
      <button className="back-button season-page__back raspberry-page__back" onClick={onBack} type="button">
        <span className="season-page__back-arrow" aria-hidden="true">←</span>
        <span className="season-page__back-label">{t("back")}</span>
      </button>

      <div className="raspberry-page__tv-shell">
        <div className="raspberry-page__tv-card">
          <img className="raspberry-page__tv-image" src={tvGreen} alt={t("raspberry_tv_alt")} loading="eager" fetchPriority="high" decoding="async" />
        </div>
      </div>

      <div className="raspberry-page__selector">
        <div className="media-switch raspberry-page__switch" role="tablist" aria-label={t("raspberry_sections")}>
          {RASPBERRY_TABS.map((tab) => {
            const isActive = tab.id === raspberryTab;
            return (
              <button
                key={tab.id}
                className={`media-switch__option${isActive ? " active" : ""}`}
                onClick={() => onChangeTab(tab.id)}
                type="button"
                role="tab"
                aria-selected={isActive}
              >
                <img
                  className="media-switch__icon"
                  src={isActive ? tab.activeIcon : tab.inactiveIcon}
                  alt=""
                  aria-hidden="true"
                />
                <span>{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {raspberryTab === "users" ? <div className="raspberry-page__content"><UsersPanel profiles={profiles} editorId={userEditorId} onEditorChange={onUserEditorChange} language={raspberryLanguage} /></div> : null}

      {raspberryTab === "dashboard" ? (
        <div className="raspberry-page__content">
          <section className="raspberry-dashboard-section" aria-labelledby="dashboard-general-title">
            <h2 className="raspberry-dashboard-section__title" id="dashboard-general-title">
              {t("dashboard_general_title")}
            </h2>
            <div className="raspberry-dashboard-grid">
            <article className="raspberry-language-card">
              <div className="raspberry-language-card__header">
                <img className="raspberry-language-card__icon" src={languagesIcon} alt="" aria-hidden="true" />
                <p>{t("language_title")}</p>
              </div>

              <div className="raspberry-language-card__options">
                {RASPBERRY_LANGUAGE_OPTIONS.map((option) => {
                  const isSelected = raspberryLanguage === option.id;

                  return (
                    <button
                      key={option.id}
                      className={`raspberry-language-option${isSelected ? " active" : ""}`}
                      onClick={() => onSetRaspberryLanguage(option.id)}
                      disabled={raspberryLanguageSaving}
                      type="button"
                    >
                      <img
                        className="raspberry-language-option__icon"
                        loading="eager"
                        fetchPriority="high"
                        src={isSelected ? option.selectedIcon : option.normalIcon}
                        alt=""
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
              </div>
              {raspberryLanguageSaving ? (
                <p className="raspberry-language-card__status">{t("language_updating")}</p>
              ) : raspberryLanguageError ? (
                <p className="raspberry-language-card__status raspberry-language-card__status--error">
                  {raspberryLanguageError}
                </p>
              ) : null}
              <p className="raspberry-language-card__notice">{t("language_cover_notice")}</p>
            </article>
            <RaspberryStatCard
              calculating={statsCalculating}
              label={t("stats_series_installed")}
              value={seriesCount}
              usedGb={seriesUsedGb}
              percent={seriesPercent}
              icon={tvshowIconYellow}
              t={t}
            />
            <RaspberryStatCard
              calculating={statsCalculating}
              label={t("stats_movies_installed")}
              value={movieCount}
              usedGb={movieUsedGb}
              percent={moviePercent}
              icon={movieIconYellow}
              t={t}
            />
            <RaspberryStatCard
              calculating={statsCalculating}
              label={t("stats_games_installed")}
              value={gameCount}
              usedGb={gameUsedGb}
              percent={gamePercent}
              icon={gameIconYellow}
              t={t}
            />
            <RaspberryStatCard
              calculating={statsCalculating}
              label={t("stats_books_installed")}
              value={bookCount}
              usedGb={bookUsedGb}
              percent={bookPercent}
              icon={bookIconYellow}
              t={t}
            />
            <RaspberryStatCard
              calculating={statsCalculating}
              label={t("stats_pictures_installed")}
              value={pictureCount}
              usedGb={pictureUsedGb}
              percent={picturePercent}
              icon={picturesIcon}
              t={t}
            />
            <article className="raspberry-storage-card">
              <div className="raspberry-storage-card__copy">
                <p>{t("microsd_capacity")}</p>
                <strong>{formatStorageGb(usedStorageGb)} GB / {formatStorageGb(totalStorageGb)} GB</strong>
              </div>
              <div className="raspberry-storage-card__ring" style={{ "--storage-fill": `${multimediaPercent}%` }}>
                <div className="raspberry-storage-card__ring-inner">
                  <strong>{formatPercent(multimediaPercent)}</strong>
                  <span className="raspberry-storage-card__device" aria-hidden="true">SSD</span>
                  <span>{t("occupied")}</span>
                </div>
              </div>
              <div className="raspberry-storage-card__copy raspberry-storage-card__copy--media">
                <p>{t("multimedia_occupied")}</p>
                <strong>{statsCalculating ? "Calculando…" : `${formatStorageGb(multimediaUsedGb)} GB`}</strong>
              </div>
            </article>
            </div>
          </section>

          <TorrentDownloads downloads={torrentDownloads} language={raspberryLanguage} />
          <section className="raspberry-dashboard-section" aria-labelledby="dashboard-clock-title">
            <h2 className="raspberry-dashboard-section__title" id="dashboard-clock-title">
              {t("dashboard_clock_title")}
            </h2>
            <article className="raspberry-alarm-card">
            <div className="raspberry-alarm-card__header">
              <img className="raspberry-alarm-card__icon" src={alarmIcon} alt="" aria-hidden="true" />
              <div className="raspberry-alarm-card__header-copy">
                <p>{t("alarms_title")}</p>
                <span>{t("alarms_copy")}</span>
              </div>
            </div>

            <div className="raspberry-alarm-list">
              {alarm.map((alarmEntry) => (
                <div
                  key={alarmEntry.id}
                  className={`raspberry-alarm-item${alarmEntry.enabled ? "" : " is-disabled"}`}
                >
                  <div className="raspberry-alarm-item__top">
                    <strong>{t("alarm_item", { index: alarmEntry.id })}</strong>
                    <label className="raspberry-alarm-item__toggle">
                      <input
                        type="checkbox"
                        checked={alarmEntry.enabled}
                        onChange={() => onAlarmToggle(alarmEntry.id)}
                      />
                      <span>{alarmEntry.enabled ? t("on") : t("off")}</span>
                    </label>
                  </div>

                  <div className="raspberry-alarm-card__controls">
                    <input
                      type="time"
                      value={alarmEntry.time}
                      disabled={!alarmEntry.enabled}
                      onChange={(event) => onAlarmTimeChange(alarmEntry.id, event.target.value)}
                    />
                    <select
                      value={alarmEntry.sound || alarmSounds[0] || ""}
                      disabled={!alarmSounds.length}
                      onChange={(event) => onAlarmSoundChange(alarmEntry.id, event.target.value)}
                      aria-label={t("alarm_sound_select", { index: alarmEntry.id })}
                    >
                      {alarmSounds.length ? (
                        alarmSounds.map((sound) => (
                          <option key={sound} value={sound}>
                            {sound}
                          </option>
                        ))
                      ) : (
                        <option value="">{t("no_alarm_sounds")}</option>
                      )}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <div className="raspberry-alarm-preview">
              <select
                value={alarmPreviewSound || alarmSounds[0] || ""}
                disabled={!alarmSounds.length}
                onChange={(event) => onAlarmPreviewSoundChange(event.target.value)}
                aria-label={t("alarm_preview_select")}
              >
                {alarmSounds.length ? (
                  alarmSounds.map((sound) => (
                    <option key={sound} value={sound}>
                      {sound}
                    </option>
                  ))
                ) : (
                  <option value="">{t("no_alarm_sounds")}</option>
                )}
              </select>
              <button type="button" onClick={onAlarmPreviewPlay} disabled={!alarmSounds.length}>
                {t("play")}
              </button>
              <button
                className="raspberry-alarm-preview__stop"
                type="button"
                onClick={onAlarmPreviewStop}
                disabled={!alarmPreviewPlaying}
              >
                {t("stop")}
              </button>
            </div>
          </article>

          <RaspberryBirthdaysCard
            birthdays={birthdays}
            saving={birthdaysSaving}
            status={birthdaysStatus}
            onSaveList={onSaveBirthdays}
            t={t}
          />

          <article className="raspberry-weather-card">
            <div className="raspberry-alarm-card__header-copy">
              <p>{t("weather_location_title")}</p>
              <span>{t("weather_location_copy")}</span>
            </div>
            <form className="raspberry-weather-card__form" onSubmit={onWeatherLocationSave}>
              <input
                type="text"
                value={weatherLocation}
                maxLength={120}
                onChange={(event) => onWeatherLocationChange(event.target.value)}
                placeholder={t("weather_location_placeholder")}
                aria-label={t("weather_location_title")}
              />
              <button type="submit">{t("weather_location_save")}</button>
            </form>
            {weatherLocationStatus ? <span className="raspberry-weather-card__status">{weatherLocationStatus}</span> : null}
            {weatherLocationDetails ? (
              <div className="raspberry-weather-card__details">
                <strong>{t("weather_resolved_title")}</strong>
                <dl>
                  <div><dt>{t("weather_city")}</dt><dd>{weatherLocationDetails.name}</dd></div>
                  {weatherLocationDetails.postalCode ? <div><dt>{t("weather_postal_code")}</dt><dd>{weatherLocationDetails.postalCode}</dd></div> : null}
                  {[weatherLocationDetails.admin2, weatherLocationDetails.admin1].filter(Boolean).length ? <div><dt>{t("weather_region")}</dt><dd>{[weatherLocationDetails.admin2, weatherLocationDetails.admin1].filter(Boolean).join(", ")}</dd></div> : null}
                  {weatherLocationDetails.country ? <div><dt>{t("weather_country")}</dt><dd>{weatherLocationDetails.country}{weatherLocationDetails.countryCode ? ` (${weatherLocationDetails.countryCode})` : ""}</dd></div> : null}
                  {weatherLocationDetails.latitude != null && weatherLocationDetails.longitude != null ? <div><dt>{t("weather_coordinates")}</dt><dd>{Number(weatherLocationDetails.latitude).toFixed(4)}, {Number(weatherLocationDetails.longitude).toFixed(4)}</dd></div> : null}
                  {weatherLocationDetails.timezone ? <div><dt>{t("weather_timezone")}</dt><dd>{weatherLocationDetails.timezone}</dd></div> : null}
                  {weatherLocationDetails.current?.temperature_2m != null ? <div><dt>{t("weather_temperature")}</dt><dd>{weatherLocationDetails.current.temperature_2m} {weatherLocationDetails.currentUnits?.temperature_2m || "°C"}</dd></div> : null}
                  {weatherLocationDetails.current?.apparent_temperature != null ? <div><dt>{t("weather_feels_like")}</dt><dd>{weatherLocationDetails.current.apparent_temperature} {weatherLocationDetails.currentUnits?.apparent_temperature || "°C"}</dd></div> : null}
                  {weatherLocationDetails.current?.wind_speed_10m != null ? <div><dt>{t("weather_wind")}</dt><dd>{weatherLocationDetails.current.wind_speed_10m} {weatherLocationDetails.currentUnits?.wind_speed_10m || "km/h"}</dd></div> : null}
                </dl>
              </div>
            ) : null}
          </article>
          </section>

          <section className="raspberry-dashboard-section" aria-labelledby="dashboard-auxiliary-title">
            <h2 className="raspberry-dashboard-section__title" id="dashboard-auxiliary-title">
              {t("dashboard_auxiliary_title")}
            </h2>
            <article className="raspberry-tmdb-card">
              <div className="raspberry-tmdb-card__header">
                <p>{t("tmdb_settings_title")}</p>
                <span>{t("tmdb_settings_copy")}</span>
              </div>
              <form className="raspberry-tmdb-card__form" onSubmit={onTmdbSettingsSave}>
                <label>
                  <span>{t("tmdb_api_key")}</span>
                  <input
                    type="text"
                    value={tmdbSettings.apiKey}
                    maxLength={256}
                    autoComplete="off"
                    onChange={(event) => onTmdbSettingsChange("apiKey", event.target.value)}
                  />
                </label>
                <label>
                  <span>{t("tmdb_bearer_token")}</span>
                  <input
                    type="text"
                    value={tmdbSettings.bearerToken}
                    maxLength={2048}
                    autoComplete="off"
                    onChange={(event) => onTmdbSettingsChange("bearerToken", event.target.value)}
                  />
                </label>
                <button type="submit" disabled={tmdbSettingsSaving}>
                  {t("tmdb_settings_save")}
                </button>
              </form>
              {tmdbSettingsStatus ? (
                <span className="raspberry-tmdb-card__status">{tmdbSettingsStatus}</span>
              ) : null}
              <ServiceCredentialTest provider="tmdb" language={raspberryLanguage} credentials={tmdbSettings}
                configured={!!(tmdbSettings.apiKey?.trim() || tmdbSettings.bearerToken?.trim())} disabled={tmdbSettingsSaving} />
              <TmdbCachePanel language={raspberryLanguage} />
              <TmdbCreditsCompletion language={raspberryLanguage} />
            </article>
            <OpenAISettings language={raspberryLanguage} />
            <OmdbSettings language={raspberryLanguage} />
            <OpenSubtitlesSettings language={raspberryLanguage} sectionRef={subtitleSettingsRef} />
            <GameProviderSettings language={raspberryLanguage} />
            <GameProviderSettings language={raspberryLanguage} youtube />
          </section>
          <section className="raspberry-dashboard-section"><h2 className="raspberry-dashboard-section__title">Users</h2><button type="button" className="dialog-button dialog-button--accent" onClick={() => onManageUsers(profiles.activeId)}>{userStrings(raspberryLanguage).edit}</button></section>
          <SystemUpdate language={raspberryLanguage} />
          <section className="raspberry-dashboard-section" aria-labelledby="dashboard-logout-title">
            <h2 className="raspberry-dashboard-section__title" id="dashboard-logout-title">{t("logout_title")}</h2>
            <article className="raspberry-tmdb-card">
              <p>{t("logout_copy")}</p>
              <button className="dialog-button" type="button" onClick={onLogout}>{t("logout_title")}</button>
            </article>
          </section>
        </div>
      ) : null}

      {raspberryTab === "controls" ? (
        <div className="raspberry-page__content">
          <article className="raspberry-controls-card">
            <div className="raspberry-controls-card__header">
              <div>
                <p>{t("playback_current")}</p>
              </div>
              <div className="raspberry-controls-card__actions">
                <button
                  className="dialog-button dialog-button--ghost raspberry-refresh-button"
                  onClick={onRefreshStatus}
                  type="button"
                  aria-label={t("refresh")}
                >
                  <span className="raspberry-refresh-button__icon" aria-hidden="true">
                    <img
                      className="raspberry-refresh-button__image is-default"
                      src={refreshWhiteIcon}
                      alt=""
                    />
                    <img
                      className="raspberry-refresh-button__image is-hover"
                      src={refreshYellowIcon}
                      alt=""
                    />
                  </span>
                </button>
              </div>
            </div>

            <RaspberryNowPlayingCard
              playback={currentPlaybackInfo}
              playbackActive={playbackActive}
              t={t}
            />

            <div className="raspberry-controls-remote">
              <PlaybackSubtitleControls disabled={controlsDisabled || currentPlaybackInfo?.kind === "game" || currentPlaybackInfo?.kind === "book"} playbackKey={raspberryHealth.file} t={t} />
              <div className="raspberry-controls-grid">
                <button
                  className={`dialog-button raspberry-control-button raspberry-control-button--primary${playbackActive ? " dialog-button--accent" : ""}`}
                  disabled={controlsDisabled}
                  onClick={onPausePlayback}
                  type="button"
                >
                  <span className={`raspberry-control-button__icon${playbackPaused ? " raspberry-control-button__icon--play" : " raspberry-control-button__icon--pause"}`} aria-hidden="true">
                    {playbackPaused ? null : <span />}
                  </span>
                  <span className="raspberry-control-button__label">{playbackPaused ? t("play") : t("pause")}</span>
                </button>
                <button
                  className="dialog-button raspberry-control-button raspberry-control-button--stop"
                  disabled={controlsDisabled}
                  onClick={onStopPlayback}
                  type="button"
                >
                  <span className="raspberry-control-button__icon raspberry-control-button__icon--stop" aria-hidden="true" />
                  <span className="raspberry-control-button__label">{t("stop")}</span>
                </button>
                {currentPlaybackInfo?.kind === "episode" ? (
                  <button
                    className="dialog-button dialog-button--accent raspberry-control-button raspberry-control-button--wide"
                    disabled={!canPlayNextEpisode || controlsBusy}
                    onClick={onNextEpisode}
                    type="button"
                  >
                    <span className="raspberry-control-button__icon raspberry-control-button__icon--next" aria-hidden="true" />
                    <span className="raspberry-control-button__label">{t("next_episode")}</span>
                  </button>
                ) : null}
                <button
                  className="dialog-button dialog-button--ghost raspberry-control-button"
                  disabled={controlsDisabled}
                  onClick={onVolumeDown}
                  type="button"
                >
                  <span className="raspberry-control-button__icon raspberry-control-button__icon--volume-down" aria-hidden="true">
                    <span className="raspberry-control-button__speaker" />
                    <span className="raspberry-control-button__minus" />
                  </span>
                  <span className="raspberry-control-button__label">{t("volume_down")}</span>
                </button>
                <button
                  className="dialog-button dialog-button--ghost raspberry-control-button"
                  disabled={controlsDisabled}
                  onClick={onVolumeUp}
                  type="button"
                >
                  <span className="raspberry-control-button__icon raspberry-control-button__icon--volume-up" aria-hidden="true">
                    <span className="raspberry-control-button__speaker" />
                    <span className="raspberry-control-button__plus" />
                  </span>
                  <span className="raspberry-control-button__label">{t("volume_up")}</span>
                </button>
                <button
                  className="dialog-button dialog-button--danger raspberry-control-button raspberry-control-button--wide"
                  disabled={poweroffDisabled}
                  onClick={() => setPoweroffDialogOpen(true)}
                  type="button"
                >
                  <span className="raspberry-control-button__icon raspberry-control-button__icon--power" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M12 3.25V11" />
                      <path d="M7.05 5.55a8 8 0 1 0 9.9 0" />
                    </svg>
                  </span>
                  <span className="raspberry-control-button__label">{t("power_off")}</span>
                </button>
              </div>
            </div>
          </article>

          <article className="raspberry-camera-card">
            <div className="raspberry-camera-card__header">
              <p>{t("camera_title")}</p>
              <button
                className="dialog-button dialog-button--accent raspberry-camera-card__button"
                onClick={handleCameraCapture}
                disabled={cameraBusy}
                type="button"
              >
                <span className="raspberry-camera-card__button-icon" aria-hidden="true">●</span>
                <span>{t(cameraBusy ? "camera_capturing" : "camera_capture")}</span>
              </button>
            </div>
            <div className={`raspberry-camera-card__preview${cameraImageUrl ? " has-image" : ""}`}>
              {cameraImageUrl ? (
                <img src={cameraImageUrl} alt={t("camera_preview_alt")} />
              ) : (
                <div className="raspberry-camera-card__placeholder">
                  <span className="raspberry-camera-card__lens" aria-hidden="true" />
                  <span>{t("camera_preview_hint")}</span>
                </div>
              )}
            </div>
            {cameraError ? <p className="raspberry-camera-card__error" role="alert">{cameraError}</p> : null}
          </article>

          <RaspberryPoweroffModal
            visible={poweroffDialogOpen}
            busy={controlsBusy}
            onClose={() => setPoweroffDialogOpen(false)}
            onConfirm={async () => {
              await onPowerOff();
              setPoweroffDialogOpen(false);
            }}
            t={t}
          />

        </div>
      ) : null}

      {raspberryTab === "uploads" ? (
        <div className="raspberry-page__content">
          <article className="raspberry-upload-card">
            <div className="raspberry-upload-card__top">
              <div className="raspberry-upload-card__selector">
                <span>{t("add_content")}</span>
                <HeroSelector
                  options={UPLOAD_MEDIA_OPTIONS.map((option) => ({
                    ...option,
                    label: t(option.labelKey),
                  }))}
                  value={uploadMediaType}
                  placeholder={t("select_type")}
                  disabled={false}
                  onChange={onUploadMediaTypeChange}
                />
              </div>
            </div>

            {uploadMediaType === "books" ? <BookTypeField language={raspberryLanguage} batch checked={uploadBookIsGraphicNovel} onChange={onUploadBookTypeChange} /> : null}

            <label
              className={`raspberry-upload-dropzone${uploadDragActive ? " is-dragging" : ""}`}
              onDragEnter={() => onUploadDragStateChange(true)}
              onDragOver={(event) => {
                event.preventDefault();
                onUploadDragStateChange(true);
              }}
              onDragLeave={() => onUploadDragStateChange(false)}
              onDrop={async (event) => {
                event.preventDefault();
                onUploadDragStateChange(false);
                onUploadFiles(await readFilesFromDataTransfer(event.dataTransfer));
              }}
            >
              <input
                className="raspberry-upload-dropzone__input"
                type="file"
                multiple
                accept={uploadMediaType === "games" ? GAME_EXTENSIONS.map(ext => `.${ext}`).join(",") : uploadMediaType === "books" ? ".pdf,.epub,.cbz,.cbr" : uploadMediaType === "pictures" ? "image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,image/heic,image/heif" : undefined}
                webkitdirectory={uploadMediaType === "series" ? "" : undefined}
                directory={uploadMediaType === "series" ? "" : undefined}
                onChange={(event) => onUploadFiles(Array.from(event.target.files || []))}
              />
              <div className="raspberry-upload-dropzone__title">
                <span className="raspberry-upload-dropzone__type-icon" aria-hidden="true">
                  <img
                    className="raspberry-upload-dropzone__type-icon-image is-default"
                    src={uploadTypeIconNormal}
                    alt=""
                  />
                  <img
                    className="raspberry-upload-dropzone__type-icon-image is-hover"
                    src={uploadTypeIconHover}
                    alt=""
                  />
                </span>
                <strong>{t("drag_here_click")}</strong>
              </div>
              <span className="raspberry-upload-dropzone__icon" aria-hidden="true">
                <img className="raspberry-upload-dropzone__icon-image is-default" src={uploadDropzoneWhite} alt="" />
                <img className="raspberry-upload-dropzone__icon-image is-hover" src={uploadDropzoneYellow} alt="" />
              </span>
              <p>{t(uploadDropzoneCopyKey)}</p>
            </label>

            {uploadMediaType === "books" ? (
              <label className="dialog-button dialog-button--ghost books-directory-picker">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.epub,.cbz,.cbr"
                  webkitdirectory=""
                  directory=""
                  onChange={(event) => onUploadFiles(Array.from(event.target.files || []))}
                />
                Seleccionar una carpeta o colección
              </label>
            ) : null}

            {uploadMediaType === "pictures" ? (
              <label className="dialog-button dialog-button--ghost books-directory-picker">
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,image/heic,image/heif"
                  webkitdirectory=""
                  directory=""
                  onChange={(event) => onUploadFiles(Array.from(event.target.files || []))}
                />
                {t("upload_pictures")} · carpeta
              </label>
            ) : null}

            {uploadSummary ? (
              <div className="raspberry-upload-summary">
                <strong>{t("latest_detection")}</strong>
                <p>{uploadSummary}</p>
              </div>
            ) : null}

            {!['games', 'books', 'pictures'].includes(uploadMediaType) ? (
              <div className="raspberry-upload-summary raspberry-upload-summary--tmdb">
                <strong>{t("tmdb_browser_title")}</strong>
                <div className="raspberry-upload-summary__torrent-body">
                  <svg className="raspberry-upload-summary__pirate" viewBox="0 0 100 100" fill="none" aria-hidden="true" focusable="false">
                    <g stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 69 82 91M18 91 82 69M18 69l-5-7m5 7-8 2m72 20 5 7m-5-7 8-2M18 91l-5 7m5-7-8-2m72-20 5-7m-5 7 8 2" />
                    </g>
                    <path fill="currentColor" d="M50 5C30 5 18 18 18 36c0 13 6 21 17 25v12h30V61c11-4 17-12 17-25C82 18 70 5 50 5Z" />
                    <g fill="#1b2d39">
                      <ellipse cx="36" cy="37" rx="9" ry="10" />
                      <ellipse cx="64" cy="37" rx="9" ry="10" />
                      <path d="m50 47-6 11h12ZM41 63h4v10h-4zm14 0h4v10h-4z" />
                    </g>
                  </svg>
                  <div className="raspberry-upload-summary__torrent-content">
                    <p>{t("tmdb_browser_copy")}</p>
                    <button
                      className="dialog-button dialog-button--accent raspberry-upload-summary__action"
                      onClick={onOpenTmdbBrowser}
                      type="button"
                    >
                      {t("tmdb_browser_open")}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

          </article>
        </div>
      ) : null}
    </section>
  );
}

function BookCover({ book }) {
  const imageUrl = getBookDisplayCoverUrl(book);
  const [imageAvailable, setImageAvailable] = useState(true);

  useEffect(() => setImageAvailable(true), [imageUrl]);

  return (
    <span
      className="books-library__generated-cover"
      aria-label={`Portada de ${book.name}`}
      role="img"
    >
      {imageAvailable && imageUrl ? (
        <img
          className="books-library__cover-image"
          src={imageUrl}
          alt=""
          onError={() => setImageAvailable(false)}
        />
      ) : <img className="books-library__cover-image" src={cartellLogo} alt="" />}
    </span>
  );
}

function BookListMetadata({ book, language }) {
  const t = bookStrings(language);
  const details = [book.publisher, book.language ? bookLanguageName(book.language, language) : "", book.pageCount ? `${t.pageCount}: ${book.pageCount}` : ""].filter(Boolean);
  return details.length ? <small className="books-library__extra-metadata">{details.join(" · ")}</small> : null;
}

function BookCardActions({ books, name, visible, marks, onMark, onDelete, t, language }) {
  const bt = bookStrings(language);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const watched = books.length > 0 && books.every(book => marks[mediaMarkKey("book", book.relativePath)]?.watched);
  const favorite = books.length > 0 && books.every(book => marks[mediaMarkKey("book", book.relativePath)]?.favorite);
  return <div className="movie-library__actions-reveal books-library__actions-reveal" inert={!visible} aria-hidden={!visible}>
    <div className="movie-library__actions-clip">
      <div className="movie-library__actions movie-library__actions--icons">
        <button className={`movie-watched${watched ? " is-watched" : ""}`} type="button" aria-pressed={watched}
          aria-label={`${t(watched ? "mark_watched" : "mark_unwatched")}: ${name}`} title={t(watched ? "mark_watched" : "mark_unwatched")}
          onClick={() => onMark("watched", !watched)}><MediaMarkIcon active={watched} /></button>
        <button className={`movie-favorite${favorite ? " is-favorite" : ""}`} type="button" aria-pressed={favorite}
          aria-label={`${t(favorite ? "mark_favorite" : "mark_not_favorite")}: ${name}`} title={t(favorite ? "mark_favorite" : "mark_not_favorite")}
          onClick={() => onMark("favorite", !favorite)}><MediaMarkIcon favorite active={favorite} /></button>
        {books.length === 1 ? <MovieDownload url={getBookContentUrl(books[0].relativePath)} name={books[0].file || books[0].name} label={bt.download} /> :
          <button className="movie-download" type="button" aria-label={`${bt.download}: ${name}`} title={bt.download} aria-expanded={downloadsOpen}
            onClick={() => setDownloadsOpen(value => !value)}><img src={downloadIcon} alt="" /></button>}
        <button className="media-delete-button movie-library__delete" type="button" onClick={onDelete} aria-label={`${bt.remove}: ${name}`} title={bt.remove}><img src={deleteIcon} alt="" /></button>
      </div>
      {books.length > 1 && downloadsOpen ? <div className="books-library__downloads">{books.map(book => <a key={book.relativePath} href={getBookContentUrl(book.relativePath)} download={book.file || book.name}>{book.name}</a>)}</div> : null}
    </div>
  </div>;
}

function BookCollectionLibrary({ view, collections, countLabel, onSelect, t, language, type, sort, direction, onDirectionChange, actionsVisible, onActionsChange, renderActions }) {
  const bt = bookStrings(language);
  return (
    <section className="books-library seasons-section library-with-scroll-rail">
      <LibraryScrollRail labels={collections.map(item => libraryScrollLabel(item, sort, language))} language={language} sort={sort} direction={direction} onDirectionChange={onDirectionChange} actionsVisible={actionsVisible} onActionsChange={onActionsChange} actionLabels={bt} />
      <div className="seasons-section__label">{countLabel}</div>
      {!collections.length ? (
        <div className="empty-state__card"><h2>{type === "graphic" ? bt.emptyGraphicNovels : bt.emptyNovels}</h2><p>{bt.emptyHint}</p></div>
      ) : (
        <div className={`books-library__grid books-library__grid--${view}${view === "list" ? " movie-library__items--list" : " movie-library__items--reveal-actions"}${actionsVisible ? " is-actions-visible" : ""}`}>
          {collections.map((collection) => (
            <article data-library-index key={collection.key} className="books-library__card">
              <BookPreviewButton book={collection.coverBook} enabled={view === "grid"} className="books-library__cover-button" onClick={() => onSelect(collection.key)} type="button" aria-label={`${t("book_enter")}: ${collection.label}`}>
                <BookCover book={collection.coverBook} />
              </BookPreviewButton>
              <div className="books-library__card-copy books-library__collection-copy">
                <strong title={collection.label}>{collection.label}</strong>
                <small className="books-library__author">{collection.author || bt.unknownAuthor}</small>
                {!collection.isCollection || view === "list" ? <small className="books-library__metadata">{collection.year || "—"} / {[...new Set(collection.books.map(book => book.format.toUpperCase()))].join(", ")}</small> : null}
                {collection.isCollection ? <small>{t("book_collection_count", { count: collection.books.length })}</small> : null}
                {view === "list" && !collection.isCollection ? <BookListMetadata book={collection.coverBook} language={language} /> : null}
              </div>
              {renderActions(collection)}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function BookDetails({ book, language, onRead, onEdit, onDelete, onBack, renderMarks }) {
  const t = bookStrings(language);
  const sourceKey = /^\/(books\/OL\d+M|works\/OL\d+W)$/.test(book.editionKey || book.openLibraryKey || "") ? book.editionKey || book.openLibraryKey : "";
  const details = [[t.year, book.year], [t.publisher, book.publisher], [t.publishDate, book.publishDate], [t.isbn, book.isbn], [t.language, bookLanguageName(book.language, language)], [t.pageCount, book.pageCount], [t.format, book.format.toUpperCase()]];
  return <section className="book-details seasons-section" aria-label={`${t.infoTitle}: ${book.name}`}>
    {onBack ? <button className="back-button" type="button" onClick={onBack}>← {t.collection}</button> : null}
    <div className="book-details__file-actions">
      <MovieDownload url={getBookContentUrl(book.relativePath)} name={book.file || book.name} label={t.download} />
      <button className="media-delete-button" type="button" onClick={() => onDelete(book)} aria-label={`${t.remove}: ${book.name}`} title={t.remove}><img src={deleteIcon} alt="" /></button>
    </div>
    <div className="book-details__layout">
      <div className="book-details__cover"><BookCover book={book} /></div>
      <div className="book-details__copy">
        <p className="book-details__eyebrow">{t.yourLibrary}</p>
        <h1>{book.name}</h1>
        <p className="book-details__author">{book.author || t.unknownAuthor}</p>
        <p className="book-details__metadata">{book.year || "—"} / {book.format.toUpperCase()}</p>
        {book.subtitle ? <p className="book-details__subtitle">{book.subtitle}</p> : null}
        <div className="book-details__actions">
          <button className="dialog-button dialog-button--accent" type="button" onClick={() => onRead(book)}>{t.read}</button>
          <button className="dialog-button dialog-button--ghost" type="button" onClick={() => onEdit(book)}>{book.openLibraryKey ? t.edit : t.lookup}</button>
        </div>
        {renderMarks(book)}
        <dl className="book-details__facts">{details.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        {book.pageCountSource?.startsWith("epub-") ? <p className="book-metadata__hint">{book.pageCountSource === "epub-page-list" ? t.epubPageList : t.epubFixedPages}</p> : null}
        {book.pageCountSource === "openlibrary" ? <p className="book-metadata__hint">{t.catalogPages}</p> : null}
        <h2>{t.description}</h2>
        {book.descriptionFallback ? <p className="book-metadata__hint">{t.fallback}</p> : null}
        <p className="book-details__description">{book.description || t.noDescription}</p>
        {book.subjects ? <><h2>{t.topics}</h2><p>{book.subjects}</p></> : null}
        {sourceKey ? <a className="book-details__source" href={`https://openlibrary.org${sourceKey}`} target="_blank" rel="noreferrer">{t.source}</a> : null}
      </div>
    </div>
  </section>;
}

function BooksLibrary({ detailPath, setDetailPath, view, books, title, author, language, sort, direction, onDirectionChange, countLabel, onOpen, onEdit, onDelete, renderMarks, actionsVisible, onActionsChange, renderActions }) {
  const t = bookStrings(language);
  const detail = books.length === 1 ? books[0] : books.find(book => book.relativePath === detailPath);
  if (detail) return <BookDetails book={detail} language={language} onRead={onOpen} onEdit={onEdit} onDelete={onDelete} renderMarks={renderMarks} onBack={books.length > 1 ? () => setDetailPath("") : null} />;
  return (
    <section className="books-library seasons-section library-with-scroll-rail">
      <LibraryScrollRail labels={books.map(item => libraryScrollLabel(item, sort, language))} language={language} sort={sort} direction={direction} onDirectionChange={onDirectionChange} actionsVisible={actionsVisible} onActionsChange={onActionsChange} actionLabels={t} />
      <h1 className="books-library__title">{title}</h1>
      {author ? <p className="books-library__author">{author}</p> : null}
      <div className="seasons-section__label">{countLabel}</div>
      {!books.length ? (
        <div className="empty-state__card"><h2>{t.empty}</h2><p>{t.emptyHint}</p></div>
      ) : (
        <>
          <div className={`books-library__grid books-library__grid--${view}${view === "list" ? " movie-library__items--list" : " movie-library__items--reveal-actions"}${actionsVisible ? " is-actions-visible" : ""}`}>
            {books.map((book) => (
              <article
                key={book.relativePath}
                data-library-index
                className="books-library__card"
              >
                <BookPreviewButton book={book} enabled={view === "grid"} className="books-library__cover-button" onClick={() => setDetailPath(book.relativePath)} type="button" aria-label={`${t.enter}: ${book.name}`}>
                  <BookCover book={book} />
                </BookPreviewButton>
                <div className="books-library__card-copy">
                  <strong>{book.name}</strong>
                  <small className="books-library__author">{book.author || t.unknownAuthor}</small>
                  <small className="books-library__metadata">{book.year || "—"} / {book.format.toUpperCase()}</small>
                  {view === "list" ? <BookListMetadata book={book} language={language} /> : null}
                </div>
                {renderActions(book)}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function BookCollectionModal({ collection, language, onClose, onSave, onDelete }) {
  const [graphicNovel, setGraphicNovel] = useState(false);
  const [typeChanged, setTypeChanged] = useState(false);
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  const [coverFile, setCoverFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setName(collection?.label || ""); setAuthor(collection?.author || ""); setGraphicNovel(Boolean(collection?.books?.length) && collection.books.every(isGraphicNovel)); setTypeChanged(false); setCoverFile(null); setError(""); }, [collection]);
  useEffect(() => {
    if (!coverFile) { setPreview(""); return undefined; }
    const url = URL.createObjectURL(coverFile); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);
  if (!collection) return null;
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="dialog-card book-collection-modal" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-card__header"><div><p>Biblioteca</p><h2>Customizar colección</h2></div><button className="dialog-card__close" onClick={onClose} type="button">×</button></div>
        <div className="book-collection-modal__body">
          <div className="book-metadata__preview"><BookCover book={{ ...collection.coverBook, coverUrl: preview || collection.coverBook.coverUrl }} /></div>
          <BookTypeField language={language} collection checked={graphicNovel} mixed={!typeChanged && !graphicNovel && collection.books.some(isGraphicNovel)} onChange={value => { setGraphicNovel(value); setTypeChanged(true); }} />
          <label className="dialog-field"><span>Nombre de la colección</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="dialog-field"><span>{bookStrings(language).author}</span><input value={author} maxLength={1000} onChange={event => setAuthor(event.target.value)} /></label>
          <label className="dialog-field book-metadata__file"><span>Portada manual</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setCoverFile(event.target.files?.[0] || null)} /><small>{coverFile?.name || "Esta portada se mostrará en la ficha y en la cartelera de la colección. Por defecto se usa el primer libro."}</small></label>
          {error ? <p className="book-metadata__error">{error}</p> : null}
        </div>
        <div className="book-metadata__footer"><button className="dialog-button dialog-button--danger book-metadata__delete" onClick={() => onDelete(collection)} type="button">Borrar colección completa</button><button className="dialog-button dialog-button--ghost" onClick={onClose} type="button">Cancelar</button><button className="dialog-button dialog-button--accent" disabled={busy || !name.trim()} onClick={async () => { try { setBusy(true); await onSave({ collection: collection.key, name, author, coverFile, coverUrl: collection.coverUrl || "", ...(typeChanged ? { isGraphicNovel: graphicNovel } : {}) }); } catch (nextError) { setError(nextError.message || "No se pudo guardar la colección."); } finally { setBusy(false); } }} type="button">{busy ? "Guardando…" : "Guardar cambios"}</button></div>
      </div>
    </div>, document.body
  );
}

function BookOpenModal({ book, busy, onClose, onOpenBrowser, onOpenRaspberry, t }) {
  if (!book) return null;
  return createPortal(
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="dialog-card book-open-modal" role="dialog" aria-modal="true" aria-labelledby="book-open-title" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-card__header">
          <div><p>{t("media_books")}</p><h2 id="book-open-title">{t("book_open_title")}</h2></div>
          <button className="dialog-card__close" onClick={onClose} disabled={busy} type="button" aria-label={t("close")}>×</button>
        </div>
        <div className="book-open-modal__body">
          <BookCover book={book} />
          <p>{t("book_open_copy", { name: book.name })}</p>
          <div className="book-open-modal__actions">
            <button className="dialog-button dialog-button--ghost" onClick={onOpenBrowser} disabled={busy} type="button">{t("book_open_browser")}</button>
            <button className="dialog-button dialog-button--accent" onClick={onOpenRaspberry} disabled={busy} type="button">{busy ? t("book_open_raspberry_busy") : t("book_open_raspberry")}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}


function PicturesLibrary({ pictures, onUpload, t, countLabel, renderMarks, onViewed }) {
  const [openPicture, setOpenPicture] = useState(null);
  return (
    <section className="pictures-library seasons-section" aria-label={t("media_pictures")}>
      <div className="seasons-section__label">{countLabel}</div>
      <div className="pictures-library__header">
        <button className="dialog-button dialog-button--accent" type="button" onClick={onUpload}>+ {t("upload_pictures")}</button>
      </div>
      {pictures.length ? (
        <div className="pictures-grid">
          {pictures.map((picture) => (
            <div className="picture-profile-tile" key={picture.relativePath}><button className="picture-tile" type="button" onClick={() => setOpenPicture(picture)}>
              <img src={getPictureContentUrl(picture.relativePath)} alt={picture.name} loading="lazy" />
              <span>{picture.name}</span>
            </button>{renderMarks("picture", picture.relativePath)}</div>
          ))}
        </div>
      ) : (
        <div className="pictures-empty">
          <img src={picturesIcon} alt="" aria-hidden="true" />
          <h2>Todavía no hay fotos</h2>
          <p>Sube una imagen o selecciona una carpeta para crear tu mosaico.</p>
          <button className="dialog-button dialog-button--accent" type="button" onClick={onUpload}>+ {t("upload_pictures")}</button>
        </div>
      )}
      {openPicture ? createPortal(
        <div className="modal-backdrop picture-lightbox" onClick={() => setOpenPicture(null)}>
          <button className="dialog-card__close" type="button" onClick={() => setOpenPicture(null)} aria-label={t("close")}>×</button>
          <img src={getPictureContentUrl(openPicture.relativePath)} alt={openPicture.name} onLoad={() => onViewed(openPicture)} onClick={(event) => event.stopPropagation()} />
          <span>{openPicture.name}</span>
        </div>, document.body
      ) : null}
    </section>
  );
}

function LibraryLoading({ label, progress, stage }) {
  const [now, setNow] = useState(Date.now());
  const [started] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <div className="library-loading" role="dialog" aria-modal="true" aria-label={label}>
    <div className="library-loading__card" role="status" aria-live="polite">
      <div className="library-loading__spinner" aria-hidden="true"><span /><span /><span /></div>
      <h2>{label}</h2>
      <p className="library-loading__detail">{stage || label} · {Math.max(0, Math.floor((now - started) / 1000))} s</p>
      {progress?.total > 0 ? <>
        <p className="library-loading__detail">Portadas: {progress.completed}/{progress.total} revisadas · {progress.loaded || 0} cargadas · {progress.failed || 0} errores · {progress.timedOut || 0} tiempos agotados</p>
        <ul className="library-loading__pending">{progress.active?.map(item => <li key={item.name}>Esperando: {item.name} · {Math.max(0, Math.floor((now - item.started) / 1000))} s</li>)}</ul>
      </> : null}
      {progress?.total > 0 ? <progress className="library-loading__progress" value={progress.completed} max={progress.total} aria-label={label} /> : null}
    </div>
  </div>;
}

export default function App() {
  const mockMode = isMockMode();
  const [activeMediaType, setActiveMediaType] = useState("series");
  const [webPinInput, setWebPinInput] = useState("");
  const [webPinVisible, setWebPinVisible] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [introVideoFinished, setIntroVideoFinished] = useState(false);
  const [unlocked, setUnlocked] = useState(mockMode || Boolean(getStoredWebPin()));
  const profiles = useUserProfiles(unlocked);
  const mediaMarks = profiles.state.marks;
  const [userEditorId, setUserEditorId] = useState(null);
  const [resumeRequest, setResumeRequest] = useState(null);
  const resumeResolver = useRef(null);
  const openingContent = useRef(false);
  const [videos, setVideos] = useState(null);
  const [tmdbLoading, setTmdbLoading] = useState(false);
  const [preparedLibrary, setPreparedLibrary] = useState(null);
  const [coverProgress, setCoverProgress] = useState(null);
  const [coverWarning, setCoverWarning] = useState("");
  const [libraryStage, setLibraryStage] = useState("Conectando con la Raspberry");
  const [detailLoadState, setDetailLoadState] = useState({ key: "", loading: false, error: "" });
  const [detailRetry, setDetailRetry] = useState(0);
  const detailCache = useRef(new Map());
  const readySeasons = useRef(new Map());
  const seasonCache = useRef(new Map());
  const episodeCache = useRef(new Map());
  const torrentDownloads = useTorrentDownloads(unlocked, async () => {
    clearLocalMetadataCache();
    detailCache.current.clear();
    readySeasons.current.clear();
    seasonCache.current.clear();
    episodeCache.current.clear();
    setVideos(await getVideos());
    setDetailRetry(value => value + 1);
  });
  const [episodeLoading, setEpisodeLoading] = useState(false);
  const [episodeError, setEpisodeError] = useState("");
  const [episodeRetry, setEpisodeRetry] = useState(0);
  const [tmdbUpload, setTmdbUpload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDirectoryPath, setSelectedDirectoryPath] = useState("");
  const [selectedMovieId, setSelectedMovieId] = useState(null);
  const [selectedGamePath, setSelectedGamePath] = useState("");
  const [selectedSystemId, setSelectedSystemId] = useState("gb");
  const [gameLibrarySort, setGameLibrarySort] = useState("name");
  const [gameSortDirection, setGameSortDirection] = useState("asc");
  const [gameActionsVisible, setGameActionsVisible] = useState(false);
  const [gameLibraryView, setGameLibraryView] = useState("grid");
  const [selectedBookCollection, setSelectedBookCollection] = useState("");
  const [bookDetailPath, setBookDetailPath] = useState("");
  const [bookLibraryType, setBookLibraryType] = useState("novel");
  const [bookLibrarySort, setBookLibrarySort] = useState("name");
  const [bookLibraryView, setBookLibraryView] = useState("grid");
  const [bookAwardType, setBookAwardType] = useState("pulitzer");
  const [bookTorrentTarget, setBookTorrentTarget] = useState(null);
  const [bookAwardEditions, setBookAwardEditions] = useState({});
  const [bookSortDirection, setBookSortDirection] = useState("asc");
  const [openBook, setOpenBook] = useState(null);
  const [bookOpenTarget, setBookOpenTarget] = useState(null);
  const [bookOpenBusy, setBookOpenBusy] = useState(false);
  const [bookMetadataTarget, setBookMetadataTarget] = useState(null);
  const [bookCollectionTarget, setBookCollectionTarget] = useState(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  const [currentView, setCurrentView] = useState("series");
  const [raspberryReturnView, setRaspberryReturnView] = useState("series");
  const [raspberryTab, setRaspberryTab] = useState("dashboard");
  const [dashboardSection, setDashboardSection] = useState("");
  const [seasonEpisodes, setSeasonEpisodes] = useState(null);
  const [seasonEpisodesLoading, setSeasonEpisodesLoading] = useState(false);
  const [seasonHeroImage, setSeasonHeroImage] = useState("");
  const [seriesProfiles, setSeriesProfiles] = useState(() => loadSeriesProfiles("series"));
  const [movieProfiles, setMovieProfiles] = useState(() => loadSeriesProfiles("movies"));
  const [movieLibrary, setMovieLibrary] = useState(() => mockMode ? loadMediaLibrary("movies") : []);
  const [tmdbSeriesMap, setTmdbSeriesMap] = useState({});
  const [tmdbMovieMap, setTmdbMovieMap] = useState({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addSeriesOpen, setAddSeriesOpen] = useState(false);
  const [miniTvOpen, setMiniTvOpen] = useState(false);
  const [browserPlayback, setBrowserPlayback] = useState(null);
  const [browserGame, setBrowserGame] = useState(null);
  const [raspberryHealth, setRaspberryHealth] = useState({
    ok: false,
    running: false,
    playing: null,
    directory: "",
    file: "",
    storage: {
      totalGb: 0,
      usedGb: 0,
      freeGb: 0,
      percentUsed: 0,
      multimediaUsedGb: 0,
      multimediaPercentUsed: 0,
    },
    libraryCounts: normalizeLibraryCounts(null),
  });
  const [raspberryCurrentPlayback, setRaspberryCurrentPlayback] = useState(() =>
    loadStoredRaspberryCurrentPlayback()
  );
  const [raspberryControlsBusy, setRaspberryControlsBusy] = useState(false);
  const [raspberryAlarm, setRaspberryAlarm] = useState(() => loadStoredRaspberryAlarm());
  const [raspberryAlarmSounds, setRaspberryAlarmSounds] = useState([]);
  const [alarmPreviewSound, setAlarmPreviewSound] = useState("");
  const [alarmPreviewPlaying, setAlarmPreviewPlaying] = useState(false);
  const [raspberryAlarmsLoaded, setRaspberryAlarmsLoaded] = useState(false);
  const [birthdays, setBirthdays] = useState([]);
  const [birthdaysSaving, setBirthdaysSaving] = useState(false);
  const [birthdaysStatus, setBirthdaysStatus] = useState("");
  const [weatherLocation, setWeatherLocation] = useState("");
  const [weatherLocationStatus, setWeatherLocationStatus] = useState("");
  const [weatherLocationDetails, setWeatherLocationDetails] = useState(null);
  const [raspberryLanguage, setRaspberryLanguage] = useState(() => loadStoredRaspberryLanguage());
  const [raspberryLanguageSaving, setRaspberryLanguageSaving] = useState(false);
  const [raspberryLanguageError, setRaspberryLanguageError] = useState("");
  const [tmdbSettings, setTmdbSettings] = useState({ apiKey: "", bearerToken: "" });
  const [tmdbSettingsStatus, setTmdbSettingsStatus] = useState("");
  const [tmdbSettingsSaving, setTmdbSettingsSaving] = useState(false);
  const [uploadMediaType, setUploadMediaType] = useState("series");
  const [uploadBookIsGraphicNovel, setUploadBookIsGraphicNovel] = useState(false);
  const [uploadDragActive, setUploadDragActive] = useState(false);
  const [uploadLookupOpen, setUploadLookupOpen] = useState(false);
  const [uploadLookupQuery, setUploadLookupQuery] = useState("");
  const [uploadSelectedFiles, setUploadSelectedFiles] = useState([]);
  const [uploadDirectoryName, setUploadDirectoryName] = useState("");
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadSummary, setUploadSummary] = useState("");
  const [bookUploadDialog, setBookUploadDialog] = useState(null);
  const [uploadValidationError, setUploadValidationError] = useState(null);
  const [seriesDuplicatePrompt, setSeriesDuplicatePrompt] = useState(null);
  const [gameLookupOpen, setGameLookupOpen] = useState(false);
  const [gameUploadFile, setGameUploadFile] = useState(null);
  const [gameUploadQuery, setGameUploadQuery] = useState("");
  const [tmdbBrowserOpen, setTmdbBrowserOpen] = useState(false);
  const [torrentInitialMovie, setTorrentInitialMovie] = useState(null);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [episodeDialogOpen, setEpisodeDialogOpen] = useState(false);
  const [episodePlaying, setEpisodePlaying] = useState(false);
  const [movieFrameIndex, setMovieFrameIndex] = useState(1);
  const [moviePlaying, setMoviePlaying] = useState(false);
  const [movieLibraryView, setMovieLibraryView] = useState("grid");
  const [awardType, setAwardType] = useState("oscars");
  const [awardEditions, setAwardEditions] = useState({});
  const [movieLibrarySort, setMovieLibrarySort] = useState("name");
  const [movieSortDirection, setMovieSortDirection] = useState("asc");
  const [movieActionsVisible, setMovieActionsVisible] = useState(false);
  const [bookActionsVisible, setBookActionsVisible] = useState(false);
  const [seriesLibraryView, setSeriesLibraryView] = useState("grid");
  const [seriesLibrarySort, setSeriesLibrarySort] = useState("name");
  const [mediaFilterOpen, setMediaFilterOpen] = useState(false);
  const [catalogAIOpen, setCatalogAIOpen] = useState(false);
  const [catalogAIResults, setCatalogAIResults] = useState({});
  const [mediaFavoritesOnly, setMediaFavoritesOnly] = useState({});
  const [movieGenreFilters, setMovieGenreFilters] = useState({});
  const [movieAwardFilters, setMovieAwardFilters] = useState([]);
  const [mediaFilterQueries, setMediaFilterQueries] = useState({
    series: "",
    movies: "",
    games: "",
    books: "",
    pictures: "",
  });
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [movieFavoriteConfirmation, setMovieFavoriteConfirmation] = useState(null);
  const seasonHeroShellRef = useRef(null);
  const alarmPreviewAudioRef = useRef(null);
  const uploadAbortControllerRef = useRef(null);
  const seriesDuplicateResolverRef = useRef(null);
  const t = (key, variables) => translate(raspberryLanguage, key, variables);

  function saveMarks(next) { return profiles.saveMarks(next); }

  function handleManageUsers(id) {
    setRaspberryReturnView(currentView === "season" ? "season" : "series");
    setUserEditorId(id); setCurrentView("raspberry"); setRaspberryTab("users");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function chooseResume(choice) {
    setResumeRequest(null);
    resumeResolver.current?.(choice);
    resumeResolver.current = null;
  }

  async function prepareContent(title, descriptor) {
    if (!profiles.ready || openingContent.current) return null;
    openingContent.current = true;
    const user = profiles.activeUser;
    try {
      const state = await profiles.refreshState(user.id);
      const progress = state.progress[descriptor.key];
      const resume = progress?.opened ? await new Promise(resolve => {
        resumeResolver.current = resolve;
        setResumeRequest({ title, progress, user });
      }) : false;
      if (resume === null) return null;
      return { userId: user.id, descriptor, initialProgress: resume ? progress : null, resume,
        onProgress: value => profiles.saveProgress(user.id, descriptor, value) };
    } catch (failure) {
      window.alert(failure.message || "No se pudo recuperar el progreso del usuario.");
      return null;
    } finally { openingContent.current = false; }
  }

  function episodeDescriptor(relativePath) {
    return { key: mediaMarkKey("video", relativePath), markKey: selectedSeasonMarkKey(), episodeNumber: selectedEpisode?.episodeNumber };
  }

  function bookDescriptor(book) {
    return { key: mediaMarkKey("book", book.relativePath), markKey: mediaMarkKey("book", book.relativePath) };
  }

  async function handleOpenBookInBrowser() {
    if (!bookOpenTarget) return;
    const context = await prepareContent(bookOpenTarget.name, bookDescriptor(bookOpenTarget));
    if (!context) return;
    setOpenBook({ ...bookOpenTarget, context }); setBookOpenTarget(null);
  }

  function confirmMovieFavorite() {
    if (!movieFavoriteConfirmation) return;
    const { id, favorite } = movieFavoriteConfirmation;
    const key = mediaMarkKey("movie", id);
    if (saveMarks({ ...mediaMarks, [key]: { ...mediaMarks[key], favorite } })) {
      setMovieFavoriteConfirmation(null);
    }
  }

  function renderMarks(type, id, allowWatched = true, allowFavorite = true) {
    const key = mediaMarkKey(type, id);
    const marks = mediaMarks[key] || {};
    const update = (field, value) => saveMarks({ ...mediaMarks, [key]: { ...marks, [field]: value } });
    return <MediaMarkButtons watched={marks.watched} favorite={marks.favorite} onWatched={allowWatched ? (value) => update("watched", value) : undefined} onFavorite={allowFavorite ? (value) => update("favorite", value) : undefined} t={t} />;
  }

  function renderBookActions(entry) {
    const collection = entry.isCollection ? bookCollections.find(item => item.key === entry.key) || entry : null;
    const books = collection?.books || entry.books || [entry];
    return <BookCardActions books={books} name={entry.label || entry.name} visible={bookLibraryView === "list" || bookActionsVisible} marks={mediaMarks} t={t} language={raspberryLanguage}
      onMark={(field, value) => {
        const next = { ...mediaMarks };
        for (const book of books) {
          const key = mediaMarkKey("book", book.relativePath);
          next[key] = { ...next[key], [field]: value };
        }
        saveMarks(next);
      }}
      onDelete={() => collection ? handleDeleteBookCollection(collection) : handleDeleteBook(books[0])} />;
  }

  function selectedSeasonMarkKey() {
    return seasonMarkKey(selectedSeries?.id || selectedSeries?.directoryPath, selectedSeason?.seasonNumber ?? selectedSeason?.id);
  }

  function handleMarkSeason(watched) {
    if (!selectedSeason) return;
    if (!window.confirm(t("mark_season_confirm", { season: `${selectedSeries.name} · ${selectedSeason.title}`, state: t(watched ? "mark_watched" : "mark_unwatched").toLowerCase() }))) return;
    saveMarks(markSeason(mediaMarks, selectedSeasonMarkKey(), watched));
  }

  const tmdbLanguage = getTmdbLanguage(raspberryLanguage);

  function createUploadSignal() {
    uploadAbortControllerRef.current?.abort();
    uploadAbortControllerRef.current = new AbortController();
    return uploadAbortControllerRef.current.signal;
  }

  function clearUploadAbortController() {
    uploadAbortControllerRef.current = null;
  }

  function chooseSeriesDuplicateAction(action) {
    seriesDuplicateResolverRef.current?.(action);
    seriesDuplicateResolverRef.current = null;
    setSeriesDuplicatePrompt(null);
  }

  function requestSeriesDuplicateAction(duplicateCount, totalCount, mediaType = "series") {
    return new Promise((resolve) => {
      seriesDuplicateResolverRef.current = resolve;
      setSeriesDuplicatePrompt({ duplicateCount, totalCount, mediaType });
    });
  }

  function resetUploadDialogState() {
    setAddSeriesOpen(false);
    setUploadLookupOpen(false);
    setUploadSelectedFiles([]);
    setUploadDirectoryName("");
    setUploadProgress(null);
  }

  function resetGameUploadDialogState() {
    setGameLookupOpen(false);
    setGameUploadFile(null);
    setGameUploadQuery("");
    setUploadSelectedFiles([]);
    setUploadProgress(null);
  }

  function handleCancelActiveUpload() {
    if (!window.confirm(t("upload_cancel_confirm"))) return;
    uploadAbortControllerRef.current?.abort();
    clearUploadAbortController();
    setUploadProgress(null);
    setUploadSummary(t("upload_canceled"));
  }

  function handleCancelBookUpload() {
    if (!window.confirm(t("upload_cancel_confirm"))) return;
    uploadAbortControllerRef.current?.abort();
    clearUploadAbortController();
    setUploadProgress(null);
    setBookUploadDialog(null);
    setUploadSummary(t("upload_canceled"));
  }

  function recordBookUploadReport(report) {
    try { window.localStorage.setItem(BOOK_UPLOAD_REPORT_KEY, JSON.stringify(report)); }
    catch { report = { ...report, storageError: "No se pudo conservar el informe en este navegador. Descárgalo antes de cerrar la página." }; }
    return report;
  }

  function handleCloseBookUpload() {
    const uploadedBook = bookUploadDialog?.phase === "done" ? bookUploadDialog.book : null;
    setBookUploadDialog(null);
    if (uploadedBook) handleOpenBookCollection(`__book__${uploadedBook.relativePath}`);
  }

  function handleCloseUploadDialog() {
    if (uploadProgress !== null) {
      if (!window.confirm(t("upload_close_confirm"))) return;
      uploadAbortControllerRef.current?.abort();
      clearUploadAbortController();
    }
    resetUploadDialogState();
  }

  function handleCloseGameUploadDialog() {
    if (uploadProgress !== null) {
      if (!window.confirm(t("upload_close_confirm"))) return;
      uploadAbortControllerRef.current?.abort();
      clearUploadAbortController();
    }
    resetGameUploadDialogState();
  }

  useEffect(() => {
    if (!unlocked) {
      setLoading(false);
      return () => {};
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setCoverProgress(null);
      setError("");
      setRaspberryLanguageError("");
      setRaspberryAlarmsLoaded(false);

      const pending = new Set();
      const track = async (name, read) => {
        const started = Date.now();
        pending.add(name);
        if (!cancelled) setLibraryStage(`Leyendo: ${[...pending].join(", ")}`);
        console.info(`[Biblioteca] Inicio: ${name}`);
        try {
          const result = await read();
          console.info(`[Biblioteca] Completado: ${name}`, { ms: Date.now() - started });
          return result;
        } catch (error) {
          console.error(`[Biblioteca] Error: ${name}`, { ms: Date.now() - started, status: error?.status });
          throw error;
        } finally {
          pending.delete(name);
          if (!cancelled) setLibraryStage(pending.size ? `Leyendo: ${[...pending].join(", ")}` : "Preparando biblioteca");
        }
      };

      try {
        const [nextVideos, nextLanguage] = await Promise.all([
          track("catálogo local", getVideos),
          track("idioma", getRaspberryLanguage),
        ]);
        if (cancelled) return;
        if (nextLanguage?.language) setRaspberryLanguage(normalizeRaspberryLanguage(nextLanguage.language));
        // Settings have their own background load; they are not library media.
        const settings = Promise.all([
          getRaspberryAlarms(), getRaspberryWeatherSettings(), getRaspberryTmdbSettings(), getRaspberryBirthdays(),
        ]).then(async ([alarms, weather, tmdb, birthdays]) => {
          const loadedTmdbSettings = await initializeTmdbCredentials(tmdb);
          if (cancelled) return;
          setTmdbSettings(loadedTmdbSettings);
          if (Array.isArray(alarms?.alarms)) setRaspberryAlarm(alarms.alarms);
          if (Array.isArray(alarms?.sounds)) {
            setRaspberryAlarmSounds(alarms.sounds);
            setAlarmPreviewSound(current => current || alarms.sounds[0] || "");
          }
          setRaspberryAlarmsLoaded(true);
          setWeatherLocation(String(weather?.location || ""));
          setWeatherLocationDetails(weather?.details || null);
          setBirthdays(Array.isArray(birthdays?.birthdays) ? birthdays.birthdays : []);
        }).catch(error => console.error("[Ajustes] No se pudieron cargar los ajustes", { status: error?.status }));
        if (mockMode) await settings;
        if (!cancelled) setVideos(nextVideos);
      } catch (nextError) {
        if (cancelled) return;
        if (nextError?.status === 401) {
          setStoredWebPin("");
          setUnlocked(false);
          setPinError("PIN incorrecto o sesion caducada.");
          return;
        }
        setError(nextError.message || "No se pudo conectar con la Raspberry.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [unlocked]);

  useEffect(() => {
    saveStoredRaspberryAlarm(raspberryAlarm);
  }, [raspberryAlarm]);

  useEffect(() => {
    if (!unlocked || !raspberryAlarmsLoaded) return () => {};

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await updateRaspberryAlarms(raspberryAlarm);
        if (Array.isArray(response?.alarms)) {
          setRaspberryAlarm((current) =>
            JSON.stringify(current) === JSON.stringify(response.alarms) ? current : response.alarms
          );
        }
        if (Array.isArray(response?.sounds)) {
          setRaspberryAlarmSounds(response.sounds);
          setAlarmPreviewSound((current) => current || response.sounds[0] || "");
        }
      } catch (nextError) {
        if (nextError?.status === 401) {
          setStoredWebPin("");
          setUnlocked(false);
          setPinError("PIN incorrecto o sesion caducada.");
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [raspberryAlarm, raspberryAlarmsLoaded, unlocked]);

  useEffect(() => {
    saveStoredRaspberryLanguage(raspberryLanguage);
  }, [raspberryLanguage]);

  useEffect(() => {
    saveStoredRaspberryCurrentPlayback(raspberryCurrentPlayback);
  }, [raspberryCurrentPlayback]);

  useEffect(() => {
    return () => {
      const audio = alarmPreviewAudioRef.current;
      if (audio) {
        audio.pause();
        audio.onended = null;
        audio.onerror = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!videos || mockMode) return;
    // Replace the snapshot, including an empty library after the last deletion.
    // Keep legacy browser data untouched; it is no longer the live catalog.
    setMovieLibrary(getRaspberryMovieLibraryItems(videos));
  }, [videos, mockMode]);

  useEffect(() => {
    const raspberrySeriesProfiles = getRaspberryProfiles(videos, "series");
    const raspberryMovieProfiles = getRaspberryProfiles(videos, "movies");

    if (Object.keys(raspberrySeriesProfiles).length) {
      setSeriesProfiles((currentProfiles) => {
        const nextProfiles = mergeProfileMaps(currentProfiles, raspberrySeriesProfiles);
        if (nextProfiles !== currentProfiles) {
          saveSeriesProfiles(nextProfiles, "series");
        }
        return nextProfiles;
      });
    }

    if (Object.keys(raspberryMovieProfiles).length) {
      setMovieProfiles((currentProfiles) => {
        const nextProfiles = mergeProfileMaps(currentProfiles, raspberryMovieProfiles);
        if (nextProfiles !== currentProfiles) {
          saveSeriesProfiles(nextProfiles, "movies");
        }
        return nextProfiles;
      });
    }
  }, [videos]);

  useEffect(() => {
    if (!unlocked) {
      return () => {};
    }

    let cancelled = false;

    let refreshing = false;
    async function refreshRaspberryStatus() {
      if (refreshing || cancelled) return;
      refreshing = true;
      try {
        const nextHealth = await getHealth();
        if (!cancelled) {
          if (nextHealth?.language) {
            setRaspberryLanguage(normalizeRaspberryLanguage(nextHealth.language));
          }
          setRaspberryHealth({
            ok: Boolean(nextHealth?.ok),
            running: Boolean(nextHealth?.running),
            playing: nextHealth?.playing || null,
            directory: nextHealth?.directory || "",
            file: nextHealth?.file || "",
            storage: {
              totalGb: Number(nextHealth?.storage?.totalGb) || 0,
              usedGb: Number(nextHealth?.storage?.usedGb) || 0,
              freeGb: Number(nextHealth?.storage?.freeGb) || 0,
              percentUsed: Number(nextHealth?.storage?.percentUsed) || 0,
              multimediaUsedGb: Number(nextHealth?.storage?.multimediaUsedGb) || 0,
              multimediaPercentUsed: Number(nextHealth?.storage?.multimediaPercentUsed) || 0,
            },
            libraryCounts: normalizeLibraryCounts(nextHealth?.libraryCounts),
          });
          if (!nextHealth?.running) {
            setRaspberryCurrentPlayback(null);
          }
        }
      } catch (_error) {
        if (!cancelled) {
          setRaspberryHealth({
            ok: false,
            running: false,
            playing: null,
            directory: "",
            file: "",
            storage: {
              totalGb: 0,
              usedGb: 0,
              freeGb: 0,
              percentUsed: 0,
              multimediaUsedGb: 0,
              multimediaPercentUsed: 0,
            },
            libraryCounts: normalizeLibraryCounts(null),
          });
          setRaspberryCurrentPlayback(null);
        }
      } finally { refreshing = false; }
    }

    refreshRaspberryStatus();
    const intervalId = window.setInterval(refreshRaspberryStatus, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [unlocked]);

  const directories = videos?.directories || [];
  const compareMediaNames = (first, second) =>
      String(first?.name || first?.file || "").localeCompare(
      String(second?.name || second?.file || ""),
      normalizeRaspberryLanguage(raspberryLanguage),
      { sensitivity: "base", numeric: true }
    );
  const gameLibrary = Array.isArray(videos?.games) ? [...videos.games].sort(compareMediaNames) : [];
  const pictureLibrary = Array.isArray(videos?.pictures) ? [...videos.pictures].sort((left, right) => (Number(right.modifiedAt) || 0) - (Number(left.modifiedAt) || 0) || compareMediaNames(left, right)) : [];
  const consoleGames = gameLibrary.filter(game => systemForGame(game)?.id === selectedSystemId);
  const selectedGame =
    consoleGames.find((game) => game.relativePath === selectedGamePath) ||
    null;
  const bookCollections = useMemo(() => buildBookCollections(
    videos?.books || [], videos?.bookCollections || {}, normalizeRaspberryLanguage(raspberryLanguage),
    { type: bookLibraryType, sort: bookLibrarySort, direction: bookSortDirection }
  ), [videos?.books, videos?.bookCollections, raspberryLanguage, bookLibraryType, bookLibrarySort, bookSortDirection]);
  const activeBookCollection = bookCollections.find((collection) => collection.key === selectedBookCollection);
  const selectedBook = activeBookCollection?.books.find(book => book.relativePath === bookDetailPath) || activeBookCollection?.books[0] || null;

  useEffect(() => {
    if (selectedBookCollection && !activeBookCollection) setSelectedBookCollection("");
  }, [activeBookCollection, selectedBookCollection]);

  useEffect(() => {
    if (!gameLibrary.length) {
      setSelectedGamePath("");
      return;
    }
    if (!gameLibrary.some((game) => game.relativePath === selectedGamePath)) {
      setSelectedGamePath("");
    }
  }, [gameLibrary, selectedGamePath]);

  // Readiness belongs to the exact inputs that finished loading. Effects run
  // after rendering, so a loading flag alone briefly exposes the previous page.
  const libraryRequest = useMemo(() => ({ videos, tmdbLanguage, seriesProfiles,
    movies: mockMode ? movieLibrary : null }),
  [videos, tmdbLanguage, seriesProfiles, mockMode ? movieLibrary : null]);
  const libraryPending = !videos || loading || tmdbLoading || preparedLibrary !== libraryRequest;

  useEffect(() => {
    if (!unlocked || loading || !videos) return;
    const libraryMovies = mockMode ? movieLibrary : getRaspberryMovieLibraryItems(videos);
    let cancelled = false;
    const controller = new AbortController();
    setTmdbLoading(true);
    setCoverProgress(null);
    setCoverWarning("");
    setLibraryStage("Leyendo resumen local de series y películas");
    const summaryStarted = Date.now();
    console.info("[Biblioteca] Inicio: resumen local", { language: tmdbLanguage });
    setError("");
    getLibrarySummaries(libraryMovies, directories, tmdbLanguage).then(async summaries => {
      if (cancelled) return;
      console.info("[Biblioteca] Completado: resumen local", { ms: Date.now() - summaryStarted });
      setLibraryStage("Cargando miniaturas locales de series y películas");
      const covers = [
        ...directories.map(directory => {
          const card = summaries.series[String(directory.tmdbId)] || {};
          const profile = seriesProfiles[directory.relativePath] || {};
          return { url: seriesArtwork(profile, card, "", localTmdbImageUrl).posterImage, name: `Serie: ${profile.name || card.name || directory.name}` };
        }),
        ...Object.values(summaries.movies).map(card => ({ url: card.posterImage, name: `Película: ${card.name || card.id}` })),
      ];
      const prepared = await preloadLibraryCovers(covers, { signal: controller.signal, onProgress: progress => { if (!cancelled) setCoverProgress(progress); } });
      if (cancelled) return;
      if (prepared.loaded < prepared.total) setCoverWarning(`${prepared.total - prepared.loaded} portadas no están disponibles. Consulta la preparación local de TMDB en el dashboard.`);
      setTmdbSeriesMap(current => Object.fromEntries(directories.map(directory => {
        const card = summaries.series[String(directory.tmdbId)] || {};
        const detail = current[directory.relativePath];
        return [directory.relativePath, { ...card, ...(detail?._detailsLanguage === tmdbLanguage ? detail : {}) }];
      })));
      setTmdbMovieMap(current => Object.fromEntries(libraryMovies.map(movie => {
        const card = summaries.movies[String(getMovieTmdbId(movie))] || {};
        const detail = current[String(movie.id)];
        return [String(movie.id), { ...card, ...(detail?._detailsLanguage === tmdbLanguage ? detail : {}) }];
      })));
      setPreparedLibrary(libraryRequest);
    }).catch(nextError => {
      console.error("[Biblioteca] Error al preparar biblioteca", { ms: Date.now() - summaryStarted, status: nextError?.status });
      if (!cancelled) setError(nextError.message || "No se pudo cargar la biblioteca.");
    }).finally(() => {
      if (!cancelled) setTmdbLoading(false);
    });
    return () => { cancelled = true; controller.abort(); };
  }, [libraryRequest, unlocked, loading]);

  const detailSelectionKey = JSON.stringify([activeMediaType, selectedMovieId, selectedDirectoryPath, tmdbLanguage, detailRetry]);

  useEffect(() => {
    const isMovie = activeMediaType === "movies";
    const entry = isMovie
      ? movieLibrary.find(movie => String(movie.id) === String(selectedMovieId))
      : activeMediaType === "series" ? directories.find(directory => directory.relativePath === selectedDirectoryPath) : null;
    if (!entry) {
      setDetailLoadState({ key: detailSelectionKey, loading: false, error: "" });
      return;
    }
    let cancelled = false;
    const id = isMovie ? getMovieTmdbId(entry) : Number(entry.tmdbId);
    const key = `${activeMediaType}:${id || entry.relativePath}:${tmdbLanguage}`;
    setDetailLoadState({ key: detailSelectionKey, loading: true, error: "" });
    setError("");
    if (!detailCache.current.has(key)) {
      const request = isMovie ? (id ? getMovieById(id, tmdbLanguage) : Promise.resolve({}))
        : id ? getTvSeriesById(id, tmdbLanguage)
        : Promise.resolve({});
      detailCache.current.set(key, request.then(async detail => {
        await preloadLibraryCovers([detail.heroImage, ...(isMovie ? (detail.imageOptions || []).slice(0, MAX_MOVIE_IMAGES) : (detail.seasons || []).map(season => season.image))].filter(Boolean), { preserve: true, timeoutMs: 4000 });
        return detail;
      }).catch(error => { detailCache.current.delete(key); throw error; }));
    }
    detailCache.current.get(key).then(detail => {
      if (cancelled) return;
      const update = current => ({ ...current, [isMovie ? String(entry.id) : entry.relativePath]: {
        ...current[isMovie ? String(entry.id) : entry.relativePath], ...detail, _detailsLanguage: tmdbLanguage,
      } });
      if (isMovie) setTmdbMovieMap(update); else setTmdbSeriesMap(update);
      setDetailLoadState({ key: detailSelectionKey, loading: false, error: "" });
    }).catch(nextError => {
      if (!cancelled) setDetailLoadState({ key: detailSelectionKey, loading: false, error: nextError.message || "No se pudo cargar la ficha." });
    });
    return () => { cancelled = true; };
  }, [activeMediaType, selectedMovieId, selectedDirectoryPath, movieLibrary, directories, tmdbLanguage, detailSelectionKey]);

  const seriesOptions = useMemo(() => {
    return directories.map((directory) => {
      const profile = seriesProfiles[directory.relativePath] || {};
      const tmdbSeries = tmdbSeriesMap[directory.relativePath] || null;

      return {
        key: directory.relativePath,
        id: tmdbSeries?.id || Number(directory.tmdbId) || null,
        directoryPath: directory.relativePath,
        name: profile.name || tmdbSeries?.name || directory.name,
        ...seriesArtwork(profile, tmdbSeries || {}, cartellLogo, localTmdbImageUrl),
        heroImageCrop: normalizeHeroCrop(profile.heroImageCrop || DEFAULT_HERO_CROP),
        imageOptions: tmdbSeries?.imageOptions || [],
        firstAirDate: tmdbSeries?.firstAirDate || "",
        creators: tmdbSeries?.creators || [],
        voteAverage: tmdbSeries?.voteAverage || 0,
        seasons: tmdbSeries?.seasons || [],
        seasonCount: tmdbSeries?.seasonCount ?? null,
        episodeCount: tmdbSeries?.totalEpisodeCount ?? null,
        totalRuntimeMinutes: tmdbSeries?.totalRuntimeMinutes ?? null,
        runtimeIsEstimated: Boolean(tmdbSeries?.runtimeIsEstimated),
      };
    }).sort(compareMediaNames);
  }, [directories, seriesProfiles, tmdbSeriesMap, raspberryLanguage]);

  const movieOptions = useMemo(() => {
    return movieLibrary.map((movie) => {
      const tmdbMovie = tmdbMovieMap[String(movie.id)] || null;
      const profile = movieProfiles[String(movie.id)] || movieProfiles[String(getMovieTmdbId(movie))] || {};

      return {
        key: String(movie.id),
        id: movie.id,
        tmdbId: getMovieTmdbId(movie),
        name: profile.name || tmdbMovie?.name || movie.name,
        fileRelativePath: movie.fileRelativePath || "",
        fileName: movie.fileName || "",
        originalName: tmdbMovie?.originalName || "",
        heroImage: localTmdbImageUrl(profile.heroImage) || tmdbMovie?.heroImage || cartellLogo,
        heroImageCrop: normalizeHeroCrop(profile.heroImageCrop || DEFAULT_HERO_CROP),
        imdbUrl: normalizeImdbUrl(profile.imdbUrl || tmdbMovie?.imdbUrl),
        rottenTomatoesUrl: normalizeRottenTomatoesUrl(profile.rottenTomatoesUrl || tmdbMovie?.rottenTomatoesUrl),
        imageOptions: tmdbMovie?.imageOptions || [],
        posterImage: tmdbMovie?.posterImage || "",
        overview: tmdbMovie?.overview || "",
        releaseDate: tmdbMovie?.releaseDate || "",
        runtime: tmdbMovie?.runtime || 0,
        voteAverage: tmdbMovie?.voteAverage || 0,
        genres: tmdbMovie?.genres || [],
      };
    }).sort(compareMediaNames);
  }, [movieLibrary, movieProfiles, tmdbMovieMap, raspberryLanguage]);

  const selectedSeries = selectedDirectoryPath
    ? seriesOptions.find((series) => series.directoryPath === selectedDirectoryPath) || null
    : null;
  const selectedDirectory =
    directories.find((directory) => directory.relativePath === selectedSeries?.directoryPath) ||
    null;
  const uploadedEpisodeIds = useMemo(
    () => getUploadedEpisodeIds(selectedDirectory),
    [selectedDirectory]
  );
  const selectedMovie =
    selectedMovieId == null
      ? null
      : movieOptions.find((movie) => String(movie.id) === String(selectedMovieId)) || null;

  useEffect(() => {
    if (!raspberryHealth.running) return;

    setRaspberryCurrentPlayback(current => refreshCurrentPlayback(current, createPlaybackInfoFromHealth({
      health: raspberryHealth, seriesOptions, movieOptions,
    })));
  }, [movieOptions, raspberryHealth, seriesOptions]);

  const selectedItem =
    activeMediaType === "books"
      ? selectedBook
      : activeMediaType === "games"
      ? selectedGame
      : activeMediaType === "movies"
        ? selectedMovie
        : selectedSeries;
  const hasSettingsButton = activeMediaType === "books" ? Boolean(activeBookCollection) : Boolean(selectedItem);
  // A new selection is pending from its first render, before the effect starts.
  const detailLoading = Boolean(selectedItem) && ["series", "movies"].includes(activeMediaType)
    && (detailLoadState.key !== detailSelectionKey || detailLoadState.loading);
  const detailError = detailLoadState.key === detailSelectionKey ? detailLoadState.error : "";

  const seasons = selectedSeries?.seasons || [];
  const headerImage = activeMediaType === "games"
    ? selectedGame?.coverImage || cartellLogo
    : activeMediaType === "books"
      ? getBookDisplayCoverUrl(activeBookCollection?.coverBook) || cartellLogo
      : activeMediaType === "movies" && !selectedMovie
        ? cartellLogo
        : selectedItem?.heroImage || cartellLogo;
  const headerImageCrop =
    ["games", "books"].includes(activeMediaType)
      ? DEFAULT_HERO_CROP
      : selectedItem?.heroImageCrop || DEFAULT_HERO_CROP;
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) || null;

  useEffect(() => {
    if (
      raspberryCurrentPlayback?.kind !== "episode" ||
      !isGenericEpisodeDisplayTitle(
        raspberryCurrentPlayback.episodeTitle,
        raspberryCurrentPlayback.episodeNumber
      )
    ) {
      return () => {};
    }

    const activeSeries =
      seriesOptions.find(
        (series) => series.directoryPath === raspberryCurrentPlayback.directory
      ) ||
      seriesOptions.find(
        (series) => Number(series.id) === Number(raspberryCurrentPlayback.seriesId)
      ) ||
      null;

    if (!activeSeries?.id || !raspberryCurrentPlayback.seasonNumber) {
      return () => {};
    }

    let cancelled = false;

    async function hydratePlaybackEpisodeTitle() {
      try {
        const seasonData = await getTvSeasonEpisodes({
          seriesId: activeSeries.id,
          seasonNumber: raspberryCurrentPlayback.seasonNumber,
          language: tmdbLanguage,
        });
        const episode = (seasonData?.episodes || []).find(
          (entry) => Number(entry.episodeNumber) === Number(raspberryCurrentPlayback.episodeNumber)
        );

        if (
          !cancelled &&
          episode &&
          !isGenericEpisodeDisplayTitle(episode.title, episode.episodeNumber)
        ) {
          setRaspberryCurrentPlayback((current) =>
            current?.kind === "episode" &&
            current.playbackId === raspberryCurrentPlayback.playbackId
              ? {
                  ...current,
                  episodeTitle: episode.title,
                  image: current.image || episode.image,
                }
              : current
          );
        }
      } catch (_error) {
        // Keep the current label if TMDB cannot provide a better translated title.
      }
    }

    hydratePlaybackEpisodeTitle();

    return () => {
      cancelled = true;
    };
  }, [raspberryCurrentPlayback, seriesOptions, tmdbLanguage]);

  useEffect(() => {
    setMovieFrameIndex(1);
  }, [selectedMovie?.id]);

  useEffect(() => {
    if (!seasons.length) {
      setSelectedSeasonId(null);
      return;
    }

    setSelectedSeasonId((current) => {
      if (current && seasons.some((season) => season.id === current)) {
        return current;
      }
      return seasons.find((season) => isSeasonUploaded(season, uploadedEpisodeIds))?.id || seasons[0].id;
    });
  }, [seasons, uploadedEpisodeIds]);

  useEffect(() => {
    if (currentView !== "season" || !selectedSeries?.id || !selectedSeason) {
      return;
    }

    let cancelled = false;

    async function loadSeasonEpisodes() {
      const seasonKey = `${selectedSeries.id}:${selectedSeason.seasonNumber || selectedSeason.id}:${tmdbLanguage}`;
      if (readySeasons.current.has(seasonKey)) {
        setSeasonEpisodes(readySeasons.current.get(seasonKey));
        setSeasonEpisodesLoading(false);
        return;
      }
      setSeasonEpisodes(null);
      setSeasonEpisodesLoading(true);
      setError("");

      try {
        if (!seasonCache.current.has(seasonKey)) {
          seasonCache.current.set(seasonKey, getTvSeasonEpisodes({
            seriesId: selectedSeries.id,
            seasonNumber: selectedSeason.seasonNumber || selectedSeason.id,
            language: tmdbLanguage,
          }).then(async season => {
            await preloadLibraryCovers([season.heroImage, ...season.episodes.map(episode => episode.image)].filter(Boolean), { preserve: true, timeoutMs: 4000 });
            readySeasons.current.set(seasonKey, season);
            return season;
          }).catch(error => { seasonCache.current.delete(seasonKey); throw error; }));
        }
        const nextSeason = await seasonCache.current.get(seasonKey);

        if (!cancelled) {
          setSeasonEpisodes(nextSeason);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError.message || "No se pudo cargar la temporada.");
        }
      } finally {
        if (!cancelled) {
          setSeasonEpisodesLoading(false);
        }
      }
    }

    loadSeasonEpisodes();
    return () => {
      cancelled = true;
    };
  }, [currentView, selectedSeries?.id, selectedSeason?.seasonNumber, selectedSeason?.id, tmdbLanguage]);

  useEffect(() => {
    if (currentView !== "season" || !selectedSeason) {
      setSeasonHeroImage("");
      return;
    }

    const fallbackImage = selectedSeason.image || headerImage || "";
    setSeasonHeroImage(fallbackImage);
  }, [currentView, selectedSeason, headerImage]);

  useEffect(() => {
    const nextHero = seasonEpisodes?.heroImage;
    if (!nextHero) return;

    const preloadImage = new Image();
    preloadImage.onload = () => {
      setSeasonHeroImage(nextHero);
    };
    preloadImage.onerror = () => {
      setSeasonHeroImage((current) => current || nextHero);
    };
    preloadImage.src = nextHero;
  }, [seasonEpisodes]);

  useEffect(() => {
    if (currentView !== "season") {
      return () => {};
    }

    let frameId = 0;

    function syncCollapsedHeader() {
      if (frameId) return;

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;

        const shellElement = seasonHeroShellRef.current;
        if (!shellElement) return;

        const minHeight = window.innerWidth <= 760 ? 168 : 208;
        const maxHeight =
          window.innerWidth <= 760
            ? window.innerHeight * 0.44
            : Math.min(window.innerHeight * 0.58, 560);
        const maxShift = Math.max(maxHeight - minHeight, 0);
        const nextShift = Math.min(window.scrollY, maxShift);
        const nextOffset = 0;

        shellElement.style.setProperty("--season-hero-max-height", `${maxHeight}px`);
        shellElement.style.setProperty("--season-hero-shift", `${nextShift}px`);
        shellElement.style.setProperty("--season-hero-offset", `${nextOffset}px`);
      });
    }

    syncCollapsedHeader();
    window.addEventListener("scroll", syncCollapsedHeader, { passive: true });
    window.addEventListener("resize", syncCollapsedHeader);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("scroll", syncCollapsedHeader);
      window.removeEventListener("resize", syncCollapsedHeader);
    };
  }, [currentView, selectedSeason, seasonEpisodes]);

  async function handleUnlock(event) {
    event.preventDefault();
    if (!/^\d{4}$/.test(webPinInput)) {
      setPinError("Introduce un PIN numerico de 4 digitos.");
      return;
    }

    setPinSubmitting(true);
    setPinError("");
    try {
      await authWebPin(webPinInput);
      setStoredWebPin(webPinInput);
      setLoading(true);
      setPreparedLibrary(null);
      setUnlocked(true);
      setWebPinInput("");
    } catch (nextError) {
      setPinError(nextError.message || "No se pudo validar el PIN.");
    } finally {
      setPinSubmitting(false);
    }
  }

  async function handleRaspberryLanguageChange(nextLanguage) {
    nextLanguage = normalizeRaspberryLanguage(nextLanguage);
    if (nextLanguage === raspberryLanguage || raspberryLanguageSaving) {
      return;
    }

    setRaspberryLanguageSaving(true);
    setRaspberryLanguageError("");
    try {
      const response = await updateRaspberryLanguage(nextLanguage);
      setRaspberryLanguage(normalizeRaspberryLanguage(response?.language || nextLanguage));
    } catch (nextError) {
      if (nextError?.status === 401) {
        setStoredWebPin("");
        setUnlocked(false);
        setPinError("PIN incorrecto o sesion caducada.");
      } else {
        setRaspberryLanguageError(nextError.message || t("language_update_failed"));
      }
    } finally {
      setRaspberryLanguageSaving(false);
    }
  }

  function handleMediaTypeChange(nextType) {
    setActiveMediaType(nextType);
    if (nextType === "movies") setSelectedMovieId(null);
    if (nextType === "series") setSelectedDirectoryPath("");
    if (nextType === "books") setSelectedBookCollection("");
    if (nextType === "games") setSelectedGamePath("");
    setMediaFilterOpen(false);
    setCurrentView("series");
    setSeasonEpisodes(null);
    setSelectedEpisode(null);
    setEpisodeDialogOpen(false);
    setSettingsOpen(false);
    setAddSeriesOpen(false);
  }

  function handleOpenCustomization() {
    if (activeMediaType === "books") {
      if (!activeBookCollection) return;
      if (!activeBookCollection.isCollection) {
        setBookMetadataTarget(activeBookCollection.books[0]);
      } else {
        setBookCollectionTarget({ ...activeBookCollection, books: (videos?.books || []).filter(book => book.relativePath.startsWith(`Books/${activeBookCollection.key}/`)) });
      }
      return;
    }
    if (selectedItem) setSettingsOpen(true);
  }

  function handleOpenRaspberryPage() {
    setRaspberryReturnView(currentView === "season" ? "season" : "series");
    setCurrentView("raspberry");
    setMiniTvOpen(false);
    setSettingsOpen(false);
    setAddSeriesOpen(false);
    setUploadLookupOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function handleBackFromRaspberry() {
    setCurrentView(raspberryReturnView === "season" ? "season" : "series");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function handleOpenSubtitleSettings() {
    setRaspberryTab("dashboard");
    setDashboardSection("subtitles");
    handleOpenRaspberryPage();
  }

  function handleOpenUploadsForMedia(mediaType) {
    const safeMediaType = ["games", "movies", "books", "pictures"].includes(mediaType) ? mediaType : "series";
    setUploadMediaType(safeMediaType);
    if (safeMediaType === "books") setUploadBookIsGraphicNovel(bookLibraryType === "graphic");
    setRaspberryReturnView(currentView === "season" ? "season" : "series");
    setRaspberryTab("uploads");
    setCurrentView("raspberry");
    setMiniTvOpen(false);
    setSettingsOpen(false);
    setAddSeriesOpen(false);
    setUploadLookupOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  async function handleSaveSeriesSettings({ subtitleFile, ...updates }) {
    const activeItem = activeMediaType === "movies" ? selectedMovie : selectedSeries;
    if (!activeItem) return;

    try {
      if (activeMediaType === "movies") {
        const movieEntry = activeItem.fileRelativePath
          ? { relativePath: activeItem.fileRelativePath }
          : resolvePlayableMovieEntry(activeItem);
        if (!movieEntry?.relativePath && !mockMode) {
          throw new Error("No se encontró el archivo para guardar la ficha en la Raspberry.");
        }
        if (movieEntry?.relativePath) {
          if (subtitleFile) await uploadMovieSubtitles({ relativePath: movieEntry.relativePath, file: subtitleFile });
          await saveMediaProfile({
            collection: "movies",
            relativePath: movieEntry.relativePath,
            name: updates.name || activeItem.name,
            tmdbId: getMovieTmdbId(activeItem),
            file: activeItem.fileName || movieEntry.relativePath.split("/").pop() || "",
            heroImage: updates.heroImage,
            heroImageCrop: updates.heroImageCrop,
            imdbUrl: updates.imdbUrl,
            rottenTomatoesUrl: updates.rottenTomatoesUrl,
          });
        }
        // Only report a saved profile after the Raspberry has accepted it.
        setMovieProfiles(updateSeriesProfile(String(activeItem.id), updates, "movies"));
      } else {
        await saveMediaProfile({
          collection: "series",
          relativePath: activeItem.directoryPath,
          name: updates.name || activeItem.name,
          tmdbId: activeItem.id,
          heroImage: updates.heroImage,
          heroImageCrop: updates.heroImageCrop,
        });
        setSeriesProfiles(updateSeriesProfile(activeItem.directoryPath, updates, "series"));
      }
      setSettingsOpen(false);
    } catch (nextError) {
      window.alert(nextError.message || "No se pudieron guardar los cambios.");
    }
  }

  async function handleSaveGameSettings(updates) {
    if (!selectedGame?.relativePath) return;

    const response = await updateGameFileMetadata({
      relativePath: selectedGame.relativePath,
      name: updates.name || selectedGame.name || selectedGame.file,
      description: updates.description,
      coverFile: updates.coverFile,
      coverImage: updates.coverImage,
      imageFiles: updates.imageFiles,
      imageOptions: updates.imageOptions,
    });
    const nextVideos = await getVideos();
    setVideos(nextVideos);
    setSelectedGamePath(response?.item?.relativePath || selectedGame.relativePath);
  }

  async function handleDeleteSeries(
    skipConfirm = false,
    activeItem = activeMediaType === "movies" ? selectedMovie : selectedSeries
  ) {
    if (!activeItem) return;
    const mediaLabel = activeMediaType === "movies" ? t("media_movies_singular") : t("media_series_singular");
    if (!skipConfirm) {
      setDeleteConfirmation({
        media: mediaLabel,
        name: activeItem.name,
        onConfirm: () => handleDeleteSeries(true, activeItem),
      });
      return;
    }

    try {
      if (activeMediaType === "movies") {
        const movieEntry = activeItem.fileRelativePath
          ? { relativePath: activeItem.fileRelativePath }
          : resolvePlayableMovieEntry(activeItem);
        if (movieEntry?.relativePath) {
          await removeMovieFile(movieEntry.relativePath);
        }
        setMovieLibrary((current) => current.filter((movie) => String(movie.id) !== String(activeItem.id)));
        if (mockMode) removeMediaLibraryItem("movies", activeItem.id);
        setMovieProfiles(removeSeriesProfile(String(activeItem.id), "movies"));
        setSelectedMovieId((current) =>
          String(current) === String(activeItem.id) ? null : current
        );
        const nextVideos = await getVideos();
        setVideos(nextVideos);
      } else {
        await removeSeries(activeItem.directoryPath);
        const nextProfiles = removeSeriesProfile(activeItem.directoryPath, "series");
        setSeriesProfiles(nextProfiles);
        const nextVideos = await getVideos();
        setVideos(nextVideos);
        setSelectedDirectoryPath("");
      }
      setSettingsOpen(false);
    } catch (nextError) {
      window.alert(
        nextError.message ||
          `No se pudo eliminar la ${activeMediaType === "movies" ? "pelicula" : "serie"}.`
      );
    }
  }

  function resolveUploadedEpisodePath(season, episode) {
    const episodeId = toRaspberryEpisodeId(
      season?.seasonNumber || season?.id,
      episode?.episodeNumber
    );
    if (!episodeId) return "";

    const match = (selectedDirectory?.videos || []).find(
      (video) => String(video?.id || "").toUpperCase() === episodeId
    );
    return match?.relativePath || "";
  }

  function getEpisodeDownloadUrl(season, episode) {
    const relativePath = resolveUploadedEpisodePath(season, episode);
    if (!relativePath) return "";
    const streamUrl = getMediaStreamUrl(relativePath);
    return `${streamUrl}${streamUrl.includes("?") ? "&" : "?"}download=1`;
  }

  async function handleDeleteSeason(season, confirmed = false) {
    const seasonNumber = Number(season?.seasonNumber || season?.id) || 0;
    if (!selectedSeries?.directoryPath || !seasonNumber) return;
    if (!confirmed) {
      setDeleteConfirmation({
        media: t("season_label"),
        name: season?.title || `${t("season_label")} ${seasonNumber}`,
        onConfirm: () => handleDeleteSeason(season, true),
      });
      return;
    }

    try {
      await removeSeriesSeason(selectedSeries.directoryPath, seasonNumber);
      const nextVideos = await getVideos();
      setVideos(nextVideos);
      setSeasonEpisodes(null);
      if (currentView === "season") {
        setCurrentView("series");
      }
    } catch (nextError) {
      window.alert(nextError.message || t("delete_media_failed", { media: t("season_label").toLowerCase() }));
    }
  }

  async function handleDeleteEpisode(episode, confirmed = false) {
    const relativePath = resolveUploadedEpisodePath(selectedSeason, episode);
    if (!relativePath) return;
    const title = episode?.title || toRaspberryEpisodeId(selectedSeason?.seasonNumber || selectedSeason?.id, episode?.episodeNumber);
    if (!confirmed) {
      setDeleteConfirmation({
        media: t("episode_label"),
        name: title,
        onConfirm: () => handleDeleteEpisode(episode, true),
      });
      return;
    }

    try {
      await removeSeriesEpisode(relativePath);
      const nextVideos = await getVideos();
      setVideos(nextVideos);
      setEpisodeDialogOpen(false);
      setSelectedEpisode(null);
      setSeasonEpisodes((current) =>
        current?.episodes
          ? {
              ...current,
              episodes: current.episodes.filter(
                (entry) => Number(entry.episodeNumber) !== Number(episode?.episodeNumber)
              ),
            }
          : current
      );
    } catch (nextError) {
      window.alert(nextError.message || t("delete_media_failed", { media: t("episode_label").toLowerCase() }));
    }
  }

  async function handleDeleteGame(game, confirmed = false) {
    if (!game?.relativePath) return;
    if (!confirmed) {
      setDeleteConfirmation({
        media: t("media_games_singular"),
        name: game.name || game.file,
        onConfirm: () => handleDeleteGame(game, true),
      });
      return;
    }

    try {
      await removeGameFile(game.relativePath);
      const nextVideos = await getVideos();
      setVideos(nextVideos);
      setSelectedGamePath((current) => {
        if (current !== game.relativePath) return current;
        return "";
      });
    } catch (nextError) {
      window.alert(nextError.message || t("delete_media_failed", { media: t("media_games_singular").toLowerCase() }));
    }
  }

  async function handlePlayGame() {
    if (!selectedGame?.relativePath) return;

    try {
      setRaspberryControlsBusy(true);
      const response = await playGameFile(selectedGame.relativePath);
      setRaspberryCurrentPlayback({
        kind: "game",
        playbackId: response?.playing || selectedGame.file || selectedGame.name,
        directory: "Games",
        filePath: selectedGame.relativePath,
        title: selectedGame.name || selectedGame.file,
        image: selectedGame.coverImage || cartellLogo,
        paused: false,
      });
      setRaspberryHealth((current) => ({
        ...current,
        ok: true,
        running: true,
        playing: response?.playing || selectedGame.file || selectedGame.name,
        directory: "Games",
        file: selectedGame.relativePath,
      }));
    } catch (nextError) {
      window.alert(nextError.message || t("upload_game_failed"));
    } finally {
      setRaspberryControlsBusy(false);
    }
  }

  function handlePlayGameInBrowser() {
    if (!selectedGame?.relativePath) return;
    const systemId = systemForGame(selectedGame)?.id || selectedSystemId;
    setBrowserGame({
      title: selectedGame.name || selectedGame.file,
      url: getBrowserGameUrl(selectedGame.relativePath, systemId),
    });
  }

  function handleOpenSeason(seasonId) {
    setSelectedSeasonId(seasonId);
    setSeasonEpisodes(null);
    setSelectedEpisode(null);
    setEpisodeDialogOpen(false);
    setCurrentView("season");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function handleBackToSeries() {
    setCurrentView("series");
    setSeasonEpisodes(null);
    setSelectedEpisode(null);
    setEpisodeDialogOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  async function handleRefreshRaspberryStatus() {
    try {
      const nextHealth = await getHealth();
      setRaspberryHealth({
        ok: Boolean(nextHealth?.ok),
        running: Boolean(nextHealth?.running),
        playing: nextHealth?.playing || null,
        directory: nextHealth?.directory || "",
        file: nextHealth?.file || "",
        storage: {
          totalGb: Number(nextHealth?.storage?.totalGb) || 0,
          usedGb: Number(nextHealth?.storage?.usedGb) || 0,
          freeGb: Number(nextHealth?.storage?.freeGb) || 0,
          percentUsed: Number(nextHealth?.storage?.percentUsed) || 0,
          multimediaUsedGb: Number(nextHealth?.storage?.multimediaUsedGb) || 0,
          multimediaPercentUsed: Number(nextHealth?.storage?.multimediaPercentUsed) || 0,
        },
        libraryCounts: normalizeLibraryCounts(nextHealth?.libraryCounts),
      });
      if (!nextHealth?.running) {
        setRaspberryCurrentPlayback(null);
      }
    } catch (nextError) {
      window.alert(nextError.message || "No se pudo leer el estado de la Raspberry.");
    }
  }

  function handleOpenEpisodeDetails(episode) {
    setSelectedEpisode(episode);
    setEpisodeDialogOpen(true);
  }

  useEffect(() => {
    if (!episodeDialogOpen || !selectedEpisode || !selectedSeries?.id || !selectedSeason) return;
    let cancelled = false;
    const key = `${selectedSeries.id}:${selectedSeason.id}:${selectedEpisode.episodeNumber}:${tmdbLanguage}`;
    setEpisodeError("");
    if (episodeCache.current.has(key)) {
      setSelectedEpisode(current => ({ ...current, ...episodeCache.current.get(key) }));
      setEpisodeLoading(false);
      return;
    }
    setEpisodeLoading(true);
    getTvEpisodeDetails({ seriesId: selectedSeries.id, seasonNumber: selectedSeason.seasonNumber || selectedSeason.id, episodeNumber: selectedEpisode.episodeNumber, language: tmdbLanguage }).then(detail => {
      episodeCache.current.set(key, detail);
      if (!cancelled) setSelectedEpisode(current => ({ ...current, ...detail }));
    }).catch(error => { if (!cancelled) setEpisodeError(error.message); })
      .finally(() => { if (!cancelled) setEpisodeLoading(false); });
    return () => { cancelled = true; };
  }, [episodeDialogOpen, selectedSeries?.id, selectedSeason?.id, selectedEpisode?.episodeNumber, tmdbLanguage, episodeRetry]);

  function handleCloseEpisodeDetails() {
    setEpisodeDialogOpen(false);
    setSelectedEpisode(null);
    setEpisodePlaying(false);
  }

  async function handlePlayEpisode(output = "minitv") {
    if (!selectedEpisode || !selectedSeason || !selectedSeries?.directoryPath) return;
    if (!isEpisodeUploaded(selectedSeason, selectedEpisode, uploadedEpisodeIds)) return;

    const raspberryEpisodeId = toRaspberryEpisodeId(
      selectedSeason.seasonNumber || selectedSeason.id,
      selectedEpisode.episodeNumber
    );

    if (!raspberryEpisodeId) {
      window.alert("No se pudo convertir el episodio al formato SxxExx.");
      return;
    }

    const context = await prepareContent(`${selectedSeries.name} · ${selectedEpisode.title}`, episodeDescriptor(resolveUploadedEpisodePath(selectedSeason, selectedEpisode)));
    if (!context) return;
    try {
      setEpisodePlaying(true);
      await playEpisode({
        id: raspberryEpisodeId,
        directory: selectedSeries.directoryPath,
        output, userId: context.userId, startSeconds: context.initialProgress?.seconds || 0,
        markKey: context.descriptor.markKey, episodeNumber: context.descriptor.episodeNumber,
      });
      const playbackInfo = createEpisodePlaybackInfo({
        series: selectedSeries,
        season: selectedSeason,
        episode: selectedEpisode,
        playbackId: raspberryEpisodeId,
      });
      setRaspberryCurrentPlayback(playbackInfo);
      setRaspberryHealth((current) => ({
        ...current,
        ok: true,
        running: true,
        playing: raspberryEpisodeId,
        directory: selectedSeries.directoryPath,
        file: playbackInfo?.filePath || `${selectedSeries.directoryPath}/${raspberryEpisodeId}.mp4`,
      }));
      setEpisodeDialogOpen(false);
      setSelectedEpisode(null);
    } catch (nextError) {
      window.alert(nextError.message || "No se pudo reproducir el episodio.");
    } finally {
      setEpisodePlaying(false);
    }
  }

  async function handlePlayEpisodeInBrowser() {
    const relativePath = resolveUploadedEpisodePath(selectedSeason, selectedEpisode);
    if (!relativePath) return;
    const context = await prepareContent(`${selectedSeries?.name} · ${selectedEpisode?.title}`, episodeDescriptor(relativePath));
    if (!context) return;
    setBrowserPlayback({
      context,
      title: `${selectedSeries?.name || ""} · ${selectedEpisode?.title || ""}`,
      url: getMediaStreamUrl(relativePath),
    });
  }

  async function runRaspberryControl(action) {
    try {
      setRaspberryControlsBusy(true);
      await action();
      await handleRefreshRaspberryStatus();
    } catch (nextError) {
      window.alert(nextError.message || "No se pudo enviar la orden a la Raspberry.");
    } finally {
      setRaspberryControlsBusy(false);
    }
  }

  function resolvePlayableMovieEntry(movie) {
    if (!movie || !videos) return null;

    const candidateLabels = [movie.name, movie.originalName]
      .map(normalizeMediaLabel)
      .filter(Boolean);
    if (!candidateLabels.length) return null;

    const rootFiles = Array.isArray(videos?.movieRootFiles) ? videos.movieRootFiles : [];
    const directoryBuckets = Array.isArray(videos?.movieDirectories) ? videos.movieDirectories : [];
    const entries = [
      ...rootFiles.map((entry) => ({
        id: entry.id,
        directory: "",
        relativePath: entry.relativePath || entry.file || "",
        label: `${entry.id || ""} ${entry.file || ""}`,
      })),
      ...directoryBuckets.flatMap((bucket) =>
        (Array.isArray(bucket.videos) ? bucket.videos : []).map((entry) => ({
          id: entry.id,
          directory: bucket.relativePath || "",
          relativePath: entry.relativePath || entry.file || "",
          label: `${bucket.name || ""} ${entry.id || ""} ${entry.file || ""}`,
        }))
      ),
    ];

    const normalizedEntries = entries.map((entry) => ({
      ...entry,
      normalizedLabel: normalizeMediaLabel(entry.label),
      normalizedRelativePath: normalizeMediaLabel(entry.relativePath),
    }));
    const requestedRelativePath = String(movie.fileRelativePath || "").trim();
    if (requestedRelativePath) {
      const fileMatch = normalizedEntries.find(
        (entry) => entry.relativePath === requestedRelativePath
      );
      if (fileMatch) return fileMatch;
    }

    for (const candidate of candidateLabels) {
      const exactMatch = normalizedEntries.find(
        (entry) =>
          entry.normalizedLabel === candidate || entry.normalizedRelativePath === candidate
      );
      if (exactMatch) return exactMatch;
    }

    for (const candidate of candidateLabels) {
      const includesMatch = normalizedEntries.find(
        (entry) =>
          entry.normalizedLabel.includes(candidate) ||
          entry.normalizedRelativePath.includes(candidate) ||
          candidate.includes(entry.normalizedLabel)
      );
      if (includesMatch) return includesMatch;
    }

    return null;
  }

  async function handlePlayMovie(output = "minitv") {
    if (!selectedMovie) return;

    const movieEntry =
      resolvePlayableMovieEntry(selectedMovie) ||
      (mockMode
        ? {
            id: `MOVIE-${selectedMovie.id}`,
            directory: "Movies",
            relativePath: `Movies/${selectedMovie.name || selectedMovie.id}.mp4`,
          }
        : null);
    if (!movieEntry?.id) {
      window.alert(
        "No he encontrado un archivo de vídeo en la Raspberry que coincida con esta película."
      );
      return;
    }

    const context = await prepareContent(selectedMovie.name, { key: mediaMarkKey("video", movieEntry.relativePath), markKey: mediaMarkKey("movie", selectedMovie.id) });
    if (!context) return;
    try {
      setMoviePlaying(true);
      await playEpisode({
        id: movieEntry.id,
        directory: movieEntry.directory || undefined,
        output, userId: context.userId, startSeconds: context.initialProgress?.seconds || 0, markKey: context.descriptor.markKey,
      });
      const playbackInfo = createMoviePlaybackInfo({
        movie: selectedMovie,
        movieEntry,
      });
      setRaspberryCurrentPlayback(playbackInfo);
      setRaspberryHealth((current) => ({
        ...current,
        ok: true,
        running: true,
        playing: movieEntry.id,
        directory: movieEntry.directory || "",
        file: playbackInfo?.filePath || movieEntry.relativePath || "",
      }));
    } catch (nextError) {
      window.alert(nextError.message || "No se pudo reproducir la película.");
    } finally {
      setMoviePlaying(false);
    }
  }

  async function handlePlayMovieInBrowser() {
    const movieEntry = resolvePlayableMovieEntry(selectedMovie);
    if (!movieEntry?.relativePath) {
      window.alert("No he encontrado el archivo de vídeo de esta película.");
      return;
    }
    const context = await prepareContent(selectedMovie.name, { key: mediaMarkKey("video", movieEntry.relativePath), markKey: mediaMarkKey("movie", selectedMovie.id) });
    if (!context) return;
    setBrowserPlayback({
      context,
      title: selectedMovie?.name || movieEntry.id,
      url: getMediaStreamUrl(movieEntry.relativePath),
    });
  }

  function getMovieDownloadUrl(movie) {
    const movieEntry = resolvePlayableMovieEntry(movie);
    const relativePath = movieEntry?.relativePath || movie?.fileRelativePath || "";
    if (!relativePath) return "";
    const streamUrl = getMediaStreamUrl(relativePath);
    return `${streamUrl}${streamUrl.includes("?") ? "&" : "?"}download=1`;
  }

  function handleOpenGameDetails(relativePath) {
    setSelectedGamePath(relativePath);
    setMediaFilterOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBackToGameLibrary() {
    setSelectedGamePath("");
    setSettingsOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleOpenMovieDetails(movieId) {
    setSelectedMovieId(movieId);
    setMediaFilterOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleOpenRecommendedLibrary(item) {
    const target = recommendationLibraryTarget(item, movieOptions, seriesOptions);
    if (!target) return false;
    setActiveMediaType(target.section); setCurrentView("series"); setCatalogAIOpen(false);
    setCatalogAIResults(current => ({ ...current, [target.section]: null }));
    setMediaFilterQueries(current => ({ ...current, [target.section]: "" }));
    setMediaFavoritesOnly(current => ({ ...current, [target.section]: false }));
    if (target.section === "movies") {
      setMovieGenreFilters(current => ({ ...current, [raspberryLanguage]: [] })); setMovieAwardFilters([]);
      if (movieLibraryView === "oscars") setMovieLibraryView("grid");
      handleOpenMovieDetails(target.id);
    } else handleOpenSeriesDetails(target.id);
    return true;
  }

  function handleRecommendedTorrent(item) {
    const target = recommendationTorrentTarget(item);
    if (!target) return;
    setUploadMediaType(target.mediaType === "tv" ? "series" : "movies");
    setTorrentInitialMovie(target);
    // Loading the exact TMDB profile mounts MediaTorrentSearch, which runs its
    // search immediately. Downloads still require choosing a torrent explicitly.
    setTmdbBrowserOpen(true);
  }

  function handleBackToMovieLibrary() {
    setSelectedMovieId(null);
    setSettingsOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleOpenSeriesDetails(directoryPath) {
    setSelectedDirectoryPath(directoryPath);
    setMediaFilterOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBackToSeriesLibrary() {
    setSelectedDirectoryPath("");
    setSettingsOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleOpenBookCollection(collectionKey) {
    setBookDetailPath("");
    setSelectedBookCollection(collectionKey);
    setMediaFilterOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBackToBookLibrary() {
    setSelectedBookCollection("");
    setBookMetadataTarget(null);
    setBookCollectionTarget(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleAddMediaItem(selectedSeriesResult, targetMediaType = activeMediaType) {
    async function prepareUploadArtwork() {
      if (!mockMode && ['movies', 'series'].includes(targetMediaType)) {
        const kind = targetMediaType === 'movies' ? 'movie' : 'tv';
        await prepareTmdbTitle(kind, selectedSeriesResult.id);
        setTmdbUpload({ kind, id: selectedSeriesResult.id, name: selectedSeriesResult.name, videoComplete: false });
      }
    }
    if (targetMediaType === "movies") {
      const movieDetails = selectedSeriesResult;
      const uploadFile = uploadLookupOpen ? uploadSelectedFiles[0] : null;
      const movieTitle = String(selectedSeriesResult.name || movieDetails?.name || "").trim();
      let uploadedMovie = null;

      if (uploadFile) {
        const { conflicts } = await checkUploadConflicts({ mediaType: "movies", files: [uploadFile.name], title: movieTitle, tmdbId: selectedSeriesResult.id });
        if (conflicts.length && await requestSeriesDuplicateAction(conflicts.length, 1, "movies") !== "overwrite") return;
        setUploadProgress(0);
        const signal = createUploadSignal();
        try {
          uploadedMovie = await uploadMovieFile({
            file: uploadFile,
            movie: selectedSeriesResult,
            overwriteExisting: conflicts.length > 0,
            onProgress: setUploadProgress,
            signal,
          });
          // The API queues artwork only after publishing the finished video.
          if (!mockMode) setTmdbUpload({ kind: "movie", id: selectedSeriesResult.id, name: movieTitle, videoComplete: true });
          if (selectedSeriesResult.subtitleFile) {
            try {
              await uploadMovieSubtitles({ relativePath: uploadedMovie.item.relativePath, file: selectedSeriesResult.subtitleFile, signal });
            } catch (subtitleError) {
              window.alert(`${t("movie_subtitles_failed")}\n${subtitleError.message}`);
            }
          }
          setTmdbUpload(current => current ? { ...current, videoComplete: true } : current);
        } finally {
          clearUploadAbortController();
        }
      }

      const nextLibrary = upsertMediaLibraryItem("movies", {
        id: selectedSeriesResult.id,
        name: movieTitle,
        fileRelativePath: uploadedMovie?.item?.relativePath || "",
        fileName: uploadedMovie?.item?.file || uploadFile?.name || "",
      });
      const movieProfile = {
        name: movieTitle,
        heroImage: movieDetails?.heroImage || selectedSeriesResult.heroImage || "",
        heroImageCrop: DEFAULT_HERO_CROP,
        imdbUrl: movieDetails?.imdbUrl || "",
        rottenTomatoesUrl: movieDetails?.rottenTomatoesUrl || "",
      };
      const nextProfiles = updateSeriesProfile(String(selectedSeriesResult.id), movieProfile, "movies");
      setMovieProfiles(nextProfiles);
      if (uploadedMovie?.item?.relativePath) {
        await saveMediaProfile({
          collection: "movies",
          relativePath: uploadedMovie.item.relativePath,
          name: movieProfile.name,
          tmdbId: selectedSeriesResult.id,
          file: uploadedMovie.item.file || uploadFile?.name || "",
          heroImage: movieProfile.heroImage,
          heroImageCrop: movieProfile.heroImageCrop,
          imdbUrl: movieProfile.imdbUrl,
          rottenTomatoesUrl: movieProfile.rottenTomatoesUrl,
        });
      }
      if (uploadFile) {
        const nextVideos = await getVideos();
        setVideos(nextVideos);
        const uploadedPath = uploadedMovie?.item?.relativePath || "";
        const uploadedExists = Boolean(
          uploadedPath &&
            [
              ...(Array.isArray(nextVideos?.movieRootFiles) ? nextVideos.movieRootFiles : []),
              ...(Array.isArray(nextVideos?.movieDirectories)
                ? nextVideos.movieDirectories.flatMap((bucket) => (Array.isArray(bucket?.videos) ? bucket.videos : []))
                : []),
            ].some((entry) => entry?.relativePath === uploadedPath)
        );
        if (!uploadedExists) {
          throw new Error(
            uploadedMovie?.saved?.path
              ? `La API dice que guardó la película en ${uploadedMovie.saved.path}, pero no aparece al refrescar la biblioteca.`
              : "La película no aparece al refrescar la biblioteca de la Raspberry."
          );
        }
        setUploadSummary(
          t("upload_done_summary", {
            name: movieTitle,
            path: uploadedPath || uploadFile.name,
          })
        );
        await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
      if (mockMode) setMovieLibrary(nextLibrary);
      setSelectedMovieId(uploadedMovie?.item?.relativePath || selectedSeriesResult.id);
      setTmdbUpload(current => current ? { ...current, videoComplete: true } : current);
      setAddSeriesOpen(false);
      setUploadLookupOpen(false);
      setUploadSelectedFiles([]);
      setUploadDirectoryName("");
      setUploadProgress(null);
      return;
    }

    let addResponse = null;
    if (uploadLookupOpen && targetMediaType === "series") {
      const seriesDetails = selectedSeriesResult;
      const latestVideos = await getVideos();
      const existingSeries = (latestVideos?.directories || []).find(
        (item) =>
          Number(item?.tmdbId) === Number(selectedSeriesResult.id) ||
          normalizeMediaLabel(item?.name) === normalizeMediaLabel(selectedSeriesResult.name)
      );
      const existingEpisodeIds = new Set(
        (existingSeries?.episodeIds || existingSeries?.videos?.map((video) => video?.id) || [])
          .filter(Boolean)
          .map((episodeId) => String(episodeId).toUpperCase())
      );
      const duplicateFiles = uploadSelectedFiles.filter((file) => existingEpisodeIds.has(getUploadEpisodeId(file)));
      let filesToUpload = uploadSelectedFiles;
      let overwriteExisting = false;

      if (duplicateFiles.length) {
        const duplicateAction = await requestSeriesDuplicateAction(duplicateFiles.length, uploadSelectedFiles.length);
        if (duplicateAction === "cancel") return;
        overwriteExisting = duplicateAction === "overwrite";
        if (!overwriteExisting) {
          filesToUpload = uploadSelectedFiles.filter((file) => !existingEpisodeIds.has(getUploadEpisodeId(file)));
        }
      }

      setUploadProgress(0);
      if (filesToUpload.length) {
        await prepareUploadArtwork();
        const signal = createUploadSignal();
        try {
          addResponse = await uploadSeriesFiles({
            files: filesToUpload,
            series: selectedSeriesResult,
            directoryName: uploadDirectoryName || uploadLookupQuery,
            heroImage: seriesDetails.heroImage,
            heroImageCrop: DEFAULT_HERO_CROP,
            overwriteExisting,
            onProgress: setUploadProgress,
            signal,
          });
          setTmdbUpload(current => current ? { ...current, videoComplete: true } : current);
        } finally {
          clearUploadAbortController();
        }
      } else {
        setUploadProgress(null);
        return;

      }
      const profileKey = addResponse?.item?.relativePath || "";
      if (profileKey) {
        const nextProfiles = updateSeriesProfile(
          profileKey,
          {
            name: selectedSeriesResult.name,
            heroImage: seriesDetails.heroImage,
            heroImageCrop: DEFAULT_HERO_CROP,
          },
          "series"
        );
        setSeriesProfiles(nextProfiles);
      }
    } else {
      addResponse = await addSeries({
        name: selectedSeriesResult.name,
        tmdbId: selectedSeriesResult.id,
      });
    }
    const nextVideos = await getVideos();

    setVideos(nextVideos);
    setSelectedDirectoryPath((current) => {
      const addedPath = addResponse?.item?.relativePath;
      if (addedPath && nextVideos?.directories?.some((item) => item.relativePath === addedPath)) {
        return addedPath;
      }

      const addedByTmdbId = nextVideos?.directories?.find(
        (item) => Number(item.tmdbId) === Number(selectedSeriesResult.id)
      );
      return addedByTmdbId?.relativePath || current;
    });
    if (uploadLookupOpen && targetMediaType === "series") {
      setUploadSummary(
        t("upload_series_done_summary", {
          name: selectedSeriesResult.name,
          path: addResponse?.item?.relativePath || uploadDirectoryName || selectedSeriesResult.name,
        })
      );
      await new Promise((resolve) => window.setTimeout(resolve, 700));
    }
    setTmdbUpload(current => current ? { ...current, videoComplete: true } : current);
    setAddSeriesOpen(false);
    setUploadLookupOpen(false);
    setUploadSelectedFiles([]);
    setUploadDirectoryName("");
    setUploadProgress(null);
  }

  async function handleUploadGameSelection({ game, cover }) {
    if (!gameUploadFile) return;

    setUploadProgress(0);
    const signal = createUploadSignal();
    let response = null;
    try {
      response = await uploadGameFile({
        file: gameUploadFile,
        game,
        cover,
        onProgress: setUploadProgress,
        signal,
      });
    } finally {
      clearUploadAbortController();
    }
    const nextVideos = await getVideos();
    setVideos(nextVideos);
    setUploadSummary(
      t("upload_game_done_summary", {
        name: response?.item?.name || game?.name || gameUploadFile.name,
        path: response?.item?.relativePath || gameUploadFile.name,
      })
    );
    setSelectedSystemId(game.platform);
    setSelectedGamePath(response?.item?.relativePath || "");
    setGameLookupOpen(false);
    setGameUploadFile(null);
    setGameUploadQuery("");
    setUploadSelectedFiles([]);
    setUploadProgress(null);
    setActiveMediaType("games");
  }

  function handleAlarmTimeChange(alarmId, nextTime) {
    setRaspberryAlarm((current) =>
      current.map((alarmEntry) =>
        alarmEntry.id === alarmId
          ? {
              ...alarmEntry,
              time: /^\d{2}:\d{2}$/.test(String(nextTime || "")) ? nextTime : alarmEntry.time,
            }
          : alarmEntry
      )
    );
  }

  async function handleWeatherLocationSave(event) {
    event.preventDefault();
    setWeatherLocationStatus("");
    try {
      const response = await updateRaspberryWeatherLocation(weatherLocation);
      setWeatherLocation(String(response?.location || ""));
      setWeatherLocationDetails(response?.details || null);
      setWeatherLocationStatus(response?.details ? t("weather_location_saved") : t("weather_location_not_found"));
    } catch (nextError) {
      if (nextError?.status === 401) {
        setStoredWebPin("");
        setUnlocked(false);
      } else {
        setWeatherLocationStatus(t("weather_location_error"));
      }
    }
  }

  async function handleTmdbSettingsSave(event) {
    event.preventDefault();
    setTmdbSettingsSaving(true);
    setTmdbSettingsStatus("");
    try {
      const response = await updateRaspberryTmdbSettings(tmdbSettings);
      const savedSettings = {
        apiKey: String(response?.apiKey || ""),
        bearerToken: String(response?.bearerToken || ""),
      };
      setTmdbSettings(savedSettings);
      setTmdbCredentials(savedSettings);
      setTmdbSeriesMap({});
      setTmdbMovieMap({});
      setVideos((current) => (current ? { ...current } : current));
      setMovieLibrary((current) => [...current]);
      setTmdbSettingsStatus(t("tmdb_settings_saved"));
    } catch (nextError) {
      if (nextError?.status === 401) {
        setStoredWebPin("");
        setUnlocked(false);
      } else {
        setTmdbSettingsStatus(t("tmdb_settings_error"));
      }
    } finally {
      setTmdbSettingsSaving(false);
    }
  }

  async function handleSaveBirthdays(nextBirthdays) {
    setBirthdaysSaving(true);
    setBirthdaysStatus("");
    try {
      const response = await updateRaspberryBirthdays(nextBirthdays);
      setBirthdays(Array.isArray(response?.birthdays) ? response.birthdays : []);
      setBirthdaysStatus(t("birthday_saved"));
      return true;
    } catch (nextError) {
      if (nextError?.status === 401) {
        setStoredWebPin("");
        setUnlocked(false);
      } else {
        setBirthdaysStatus(t("birthday_error"));
      }
      return false;
    } finally {
      setBirthdaysSaving(false);
    }
  }

  function handleAlarmToggle(alarmId) {
    setRaspberryAlarm((current) =>
      current.map((alarmEntry) =>
        alarmEntry.id === alarmId
          ? {
              ...alarmEntry,
              enabled: !alarmEntry.enabled,
            }
          : alarmEntry
      )
    );
  }

  function handleAlarmSoundChange(alarmId, nextSound) {
    setRaspberryAlarm((current) =>
      current.map((alarmEntry) =>
        alarmEntry.id === alarmId
          ? {
              ...alarmEntry,
              sound: String(nextSound || ""),
            }
          : alarmEntry
      )
    );
  }

  function handleAlarmPreviewSoundChange(nextSound) {
    handleStopAlarmPreview();
    setAlarmPreviewSound(String(nextSound || ""));
  }

  function handleStopAlarmPreview() {
    const audio = alarmPreviewAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.onended = null;
      audio.onerror = null;
      alarmPreviewAudioRef.current = null;
    }
    setAlarmPreviewPlaying(false);
  }

  function handlePlayAlarmPreview() {
    const soundUrl = getAlarmSoundUrl(alarmPreviewSound);
    if (!soundUrl) return;

    handleStopAlarmPreview();
    const audio = new Audio(soundUrl);
    alarmPreviewAudioRef.current = audio;
    audio.onended = () => {
      if (alarmPreviewAudioRef.current === audio) {
        alarmPreviewAudioRef.current = null;
        setAlarmPreviewPlaying(false);
      }
    };
    audio.onerror = audio.onended;
    audio
      .play()
      .then(() => setAlarmPreviewPlaying(true))
      .catch(() => {
        if (alarmPreviewAudioRef.current === audio) {
          alarmPreviewAudioRef.current = null;
        }
        setAlarmPreviewPlaying(false);
      });
  }

  async function handlePausePlayback() {
    setRaspberryCurrentPlayback((current) => {
      if (!current) return current;

      return {
        ...current,
        paused: !current.paused,
      };
    });
  }

  async function handleToggleMockPlayback(nextEnabled) {
    if (!mockMode) return;

    if (!nextEnabled) {
      await runRaspberryControl(() => stopPlayback());
      setRaspberryCurrentPlayback(null);
      return;
    }

    const preferredDirectory =
      directories.find(
        (entry) =>
          entry.relativePath === selectedDirectoryPath &&
          Array.isArray(entry?.episodeIds) &&
          entry.episodeIds.length
      ) ||
      directories.find((entry) => Array.isArray(entry?.episodeIds) && entry.episodeIds.length) ||
      null;

    const directory = preferredDirectory?.relativePath || "TVShows/demo-series";
    const firstEpisodeId = preferredDirectory?.episodeIds?.[0] || "S01E01";
    const preferredSeries =
      seriesOptions.find((entry) => entry.directoryPath === directory) || selectedSeries || null;
    const parsedEpisode = parseRaspberryEpisodeId(firstEpisodeId);

    await runRaspberryControl(() =>
      playEpisode({
        id: firstEpisodeId,
        directory,
      })
    );

    if (preferredSeries && parsedEpisode) {
      setRaspberryCurrentPlayback(
        createEpisodePlaybackInfo({
          series: preferredSeries,
          season: {
            seasonNumber: parsedEpisode.seasonNumber,
            title: `${t("season_label")} ${parsedEpisode.seasonNumber}`,
            image: preferredSeries.heroImage,
          },
          episode: {
            episodeNumber: parsedEpisode.episodeNumber,
            title: firstEpisodeId,
            image: preferredSeries.heroImage,
          },
          playbackId: firstEpisodeId,
        })
      );
    }
  }

  async function handleStopRaspberryPlayback() {
    await runRaspberryControl(() => stopPlayback());
    setRaspberryCurrentPlayback(null);
  }

  async function handleVolumeDownRaspberry() {
    await runRaspberryControl(() => volumeDown());
  }

  async function handleVolumeUpRaspberry() {
    await runRaspberryControl(() => volumeUp());
  }

  async function handlePowerOffRaspberry() {
    try {
      setRaspberryControlsBusy(true);
      await powerOffRaspberry();
      setRaspberryCurrentPlayback(null);
      setRaspberryHealth((current) => ({
        ...current,
        ok: false,
        running: false,
        playing: null,
        directory: "",
        file: "",
      }));
    } catch (nextError) {
      window.alert(nextError.message || t("power_off_failed"));
    } finally {
      setRaspberryControlsBusy(false);
    }
  }

  async function handlePlayNextEpisode() {
    const nextTarget = resolveNextEpisodeTarget({
      currentPlayback: raspberryCurrentPlayback,
      raspberryHealth,
      seriesOptions,
      directories,
    });
    const nextEpisodeId = nextTarget?.playbackId || "";

    if (!nextEpisodeId) {
      window.alert("No he encontrado un capítulo siguiente para la reproducción actual.");
      return;
    }

    const parsedNextEpisode = parseRaspberryEpisodeId(nextEpisodeId);
    const activeSeries = nextTarget.series;
    const entry = directories.find(item => item.relativePath === nextTarget.directory)?.videos?.find(item => item.id === nextEpisodeId);
    const path = entry?.relativePath || `${nextTarget.directory}/${nextEpisodeId}.mp4`;
    const descriptor = { key: mediaMarkKey("video", path),
      markKey: seasonMarkKey(activeSeries?.id || nextTarget.directory, parsedNextEpisode?.seasonNumber),
      episodeNumber: parsedNextEpisode?.episodeNumber };
    const context = await prepareContent(`${activeSeries?.name || ""} · ${nextEpisodeId}`, descriptor);
    if (!context) return;
    await runRaspberryControl(() =>
      playEpisode({ id: nextEpisodeId, directory: nextTarget.directory, userId: context.userId,
        startSeconds: context.initialProgress?.seconds || 0, markKey: descriptor.markKey, episodeNumber: descriptor.episodeNumber })
    );

    if (!parsedNextEpisode || !activeSeries) {
      return;
    }

    let playbackInfo = null;

    try {
      const nextSeasonData = await getTvSeasonEpisodes({
        seriesId: activeSeries.id,
        seasonNumber: parsedNextEpisode.seasonNumber,
        language: tmdbLanguage,
      });
      const nextEpisode = (nextSeasonData?.episodes || []).find(
        (entry) => Number(entry.episodeNumber) === parsedNextEpisode.episodeNumber
      );

      if (nextEpisode) {
        playbackInfo = createEpisodePlaybackInfo({
          series: activeSeries,
          season: {
            seasonNumber: parsedNextEpisode.seasonNumber,
            title: nextSeasonData?.title || `${t("season_label")} ${parsedNextEpisode.seasonNumber}`,
            image: nextSeasonData?.heroImage || activeSeries.heroImage,
          },
          episode: nextEpisode,
          playbackId: nextEpisodeId,
        });
      }
    } catch (_error) {
      playbackInfo = null;
    }

    if (!playbackInfo) {
      playbackInfo = createEpisodePlaybackInfo({
        series: activeSeries,
        season: {
          seasonNumber: parsedNextEpisode.seasonNumber,
          title: `${t("season_label")} ${parsedNextEpisode.seasonNumber}`,
          image: activeSeries.heroImage,
        },
        episode: {
          episodeNumber: parsedNextEpisode.episodeNumber,
          title: nextEpisodeId,
          image: activeSeries.heroImage,
        },
        playbackId: nextEpisodeId,
      });
    }

    setRaspberryCurrentPlayback(playbackInfo);
  }

  function handleUploadDragStateChange(nextValue) {
    setUploadDragActive(Boolean(nextValue));
  }

  async function handleDeleteBook(book, confirmed = false) {
    if (!book) return;
    if (!confirmed) {
      setDeleteConfirmation({
        media: t("media_books_singular"),
        name: book.name,
        onConfirm: () => handleDeleteBook(book, true),
      });
      return;
    }
    try {
      await removeBookFile(book.relativePath);
      setOpenBook(null);
      setVideos(await getVideos());
    } catch (nextError) {
      window.alert(nextError.message || "No se pudo eliminar el libro.");
    }
  }

  async function handleOpenBookOnRaspberry() {
    if (!bookOpenTarget) return;
    const context = await prepareContent(bookOpenTarget.name, bookDescriptor(bookOpenTarget));
    if (!context) return;
    try {
      setBookOpenBusy(true);
      await openBookOnRaspberry(bookOpenTarget.relativePath, { userId: context.userId, resume: context.resume });
      setBookOpenTarget(null);
    } catch (nextError) {
      window.alert(nextError.message || t("book_open_raspberry_failed"));
    } finally {
      setBookOpenBusy(false);
    }
  }

  async function handleSaveBookMetadata(profile) {
    if (bookMetadataTarget?.uploadFile) {
      const file = bookMetadataTarget.uploadFile;
      setBookMetadataTarget(null);
      await handleUploadFiles([file], profile);
      return;
    }
    await saveBookMetadata(profile);
    setVideos(await getVideos());
    setBookLibraryType(profile.isGraphicNovel ? "graphic" : "novel");
    setBookMetadataTarget(null);
  }

  async function handleSaveBookCollection(profile) {
    await saveBookCollectionMetadata(profile);
    setVideos(await getVideos());
    if (typeof profile.isGraphicNovel === "boolean") setBookLibraryType(profile.isGraphicNovel ? "graphic" : "novel");
    setBookCollectionTarget(null);
  }

  async function handleDeleteBookCollection(collection, confirmed = false) {
    if (!collection) return;
    if (!confirmed) {
      setBookCollectionTarget(null);
      setDeleteConfirmation({
        media: "colección de libros",
        name: collection.label,
        onConfirm: () => handleDeleteBookCollection(collection, true),
      });
      return;
    }
    try {
      await removeBookCollection(collection.key);
      setSelectedBookCollection("");
      setVideos(await getVideos());
    } catch (nextError) {
      window.alert(nextError.message || "No se pudo eliminar la colección.");
    }
  }

  async function handleUploadFiles(files, confirmedBookProfile = null) {
    const safeFiles = Array.isArray(files) ? files.filter((file) => file && !isIgnoredUploadFile(file)) : [];
    if (!safeFiles.length) return;

    if (uploadMediaType === "pictures") {
      const extensions = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "heic", "heif"]);
      const pictureFiles = safeFiles.filter((file) => extensions.has(getFileExtension(file.name)));
      if (!pictureFiles.length || pictureFiles.length !== safeFiles.length) {
        setUploadValidationError({ title: "Archivos incompatibles", message: "Selecciona solamente imágenes JPEG, PNG, WebP, GIF, BMP, AVIF o HEIC." });
        return;
      }
      try {
        setUploadSummary(`Subiendo ${pictureFiles.length} foto(s)…`);
        const signal = createUploadSignal();
        const response = await uploadPictureFiles({ files: pictureFiles, signal, onProgress: setUploadProgress });
        clearUploadAbortController();
        setUploadProgress(null);
        setUploadSummary(`${response.saved?.length || pictureFiles.length} foto(s) añadidas al mosaico.`);
        setVideos(await getVideos());
        setActiveMediaType("pictures");
        setCurrentView("series");
      } catch (nextError) {
        clearUploadAbortController();
        setUploadProgress(null);
        setUploadSummary(nextError?.name === "AbortError" ? t("upload_canceled") : nextError.message || "No se pudieron subir las fotos.");
      }
      return;
    }

    if (uploadMediaType === "books") {
      const supported = new Set(["pdf", "epub", "cbz", "cbr"]);
      const bookFiles = safeFiles.filter((file) => supported.has(getFileExtension(file.name)));
      if (!bookFiles.length || bookFiles.length !== safeFiles.length) {
        const report = recordBookUploadReport({ startedAt: new Date().toISOString(), status: "error", error: "La carpeta contiene archivos incompatibles. Usa PDF, EPUB, CBZ o CBR.", files: safeFiles.map((file) => ({ name: file.webkitRelativePath || file.name, size: file.size, status: supported.has(getFileExtension(file.name)) ? "pending" : "rejected" })) });
        setBookUploadDialog({ phase: "error", error: report.error, report });
        setUploadSummary(report.error);
        return;
      }
      const firstPath = String(bookFiles[0].webkitRelativePath || "").replace(/\\/g, "/");
      const detectedCollection = firstPath.includes("/") ? firstPath.split("/")[0] : "";
      const isCollectionUpload = Boolean(detectedCollection) || bookFiles.length > 1;
      if (!isCollectionUpload && !confirmedBookProfile) {
        setBookMetadataTarget({ name: bookSearchQuery(bookFiles[0].name), format: getFileExtension(bookFiles[0].name), uploadFile: bookFiles[0], isGraphicNovel: uploadBookIsGraphicNovel });
        return;
      }
      const suggestedTitle = isCollectionUpload
        ? detectedCollection || "Nueva colección"
        : stripFileExtension(bookFiles[0].name);
      const requestedTitle = isCollectionUpload
        ? window.prompt("Nombre de la colección", suggestedTitle)
        : confirmedBookProfile.title;
      if (requestedTitle === null) return;
      const safeTitle = requestedTitle.trim() || suggestedTitle;
      const collection = isCollectionUpload ? safeTitle : "";
      const uploadLabel = isCollectionUpload
        ? `${safeTitle} · ${bookFiles.length} libro(s)`
        : bookFiles[0].name;
      try {
        const { conflicts } = await checkUploadConflicts({ mediaType: "books", files: bookFiles.map(file => file.webkitRelativePath || file.name), collection, title: isCollectionUpload ? "" : safeTitle });
        if (conflicts.length && await requestSeriesDuplicateAction(conflicts.length, bookFiles.length, "books") !== "overwrite") return;
        setUploadSummary(`Subiendo ${bookFiles.length} libro(s)…`);
        setUploadProgress({ percent: 0, fileName: uploadLabel, status: "uploading" });
        setBookUploadDialog({
          phase: "uploading",
          label: uploadLabel,
          progress: { percent: 0, fileName: uploadLabel, status: "uploading" },
        });
        const signal = createUploadSignal();
        const uploadResponse = await uploadBookFiles({
          files: bookFiles,
          overwriteExisting: conflicts.length > 0,
          onReport: (report) => {
            const savedReport = recordBookUploadReport(report);
            setBookUploadDialog((current) => current ? { ...current, report: savedReport } : current);
          },
          collection,
          title: isCollectionUpload ? "" : safeTitle,
          metadata: confirmedBookProfile || { isGraphicNovel: uploadBookIsGraphicNovel },
          signal,
          onProgress: (progress) => {
            setUploadProgress(progress);
            setBookUploadDialog((current) => current ? { ...current, progress } : current);
          },
        });
        clearUploadAbortController();
        let nextVideos = null;
        let refreshWarning = "";
        try {
          nextVideos = await getVideos();
          setVideos(nextVideos);
        } catch (refreshError) {
          refreshWarning = ` Los archivos se han guardado, pero no se pudo actualizar la biblioteca: ${refreshError.message}.`;
          uploadResponse.report.note = refreshWarning;
          recordBookUploadReport(uploadResponse.report);
        }
        let uploadedBook = null;
        if (!isCollectionUpload) {
          const uploadedPath = uploadResponse?.items?.[0]?.relativePath;
          uploadedBook = (nextVideos?.books || []).find((book) => book.relativePath === uploadedPath) || null;
        }
        const completedSummary = `${uploadResponse.items.length} libro(s) añadidos${collection ? ` a ${collection}` : ""}.${refreshWarning}`;
        setUploadSummary(completedSummary);
        setUploadProgress(null);
        setBookUploadDialog({
          phase: "done",
          label: uploadLabel,
          summary: completedSummary,
          report: uploadResponse.report,
          book: uploadedBook,
          progress: { percent: 100, fileName: uploadLabel, status: "done" },
        });
        setCurrentView("series");
        setActiveMediaType("books");
        setBookLibraryType((confirmedBookProfile?.isGraphicNovel ?? uploadBookIsGraphicNovel) ? "graphic" : "novel");
        setSelectedBookCollection("");
      } catch (nextError) {
        clearUploadAbortController();
        setUploadProgress(null);
        const message = nextError?.name === "AbortError" ? t("upload_canceled") : nextError.report?.error || nextError.message || t("book_upload_failed");
        setUploadSummary(message);
        setBookUploadDialog({ phase: "error", label: uploadLabel, error: message, report: nextError.report });
        // A failed batch can still contain confirmed files. Refresh without hiding the original error.
        try { setVideos(await getVideos()); } catch { /* The report remains available. */ }

      }
      return;
    }

    if (uploadMediaType === "games") {
      const gameFiles = safeFiles.filter(isSupportedGameRom);
      if (gameFiles.length !== 1 || gameFiles.length !== safeFiles.length) {
        setUploadValidationError({
          title: t("upload_game_invalid_title"),
          message: t("upload_game_invalid_copy"),
        });
        return;
      }
      const gameFile = gameFiles[0];
      const nextLabel = deriveUploadSearchLabel(gameFile, "games");
      setGameUploadFile(gameFile);
      setGameUploadQuery(nextLabel);
      setUploadSelectedFiles([gameFile]);
      setUploadProgress(null);
      setUploadSummary(
        t("upload_game_detected", {
          name: nextLabel,
          platform: GAME_PLATFORM_LABELS[getFileExtension(gameFile.name)] || t("media_games_singular"),
        })
      );
      setGameLookupOpen(true);
      return;
    }

    let nextLabel = "";
    let nextDirectoryName = "";
    if (uploadMediaType === "series") {
      const validation = getSeriesUploadValidation(safeFiles);
      if (validation.multipleDirectories) {
        setUploadValidationError({
          title: t("upload_series_requires_directory"),
          message: t("upload_series_requires_directory"),
        });
        return;
      }
      if (validation.nestedFiles.length) {
        setUploadValidationError({
          title: t("upload_series_subdirectories_error"),
          message: validation.nestedFiles.slice(0, 4).join("\n") || t("upload_series_subdirectories_error"),
        });
        return;
      }
      if (validation.invalidFiles.length || !validation.directoryName) {
        const errorKey = validation.directoryName ? "upload_series_format_error" : "upload_series_requires_directory";
        setUploadValidationError({
          title: t(errorKey),
          message: validation.invalidFiles.slice(0, 6).join("\n") || t(errorKey),
        });
        return;
      }
      nextLabel = validation.directoryName;
      nextDirectoryName = validation.directoryName;
    } else {
      nextLabel = deriveUploadSearchLabel(safeFiles[0], uploadMediaType);
    }

    setUploadSelectedFiles(uploadMediaType === "movies" ? [safeFiles[0]] : safeFiles);
    setUploadDirectoryName(nextDirectoryName);
    setUploadProgress(null);
    if (!nextLabel) {
      setUploadValidationError({
        title: t("upload_name_not_detected"),
        message: t("upload_name_not_detected"),
      });
      return;
    }

    setUploadSummary(
      t("upload_detected_summary", {
        count: safeFiles.length,
        media: uploadMediaType === "movies" ? t("media_movies_singular") : t("media_series_singular"),
        name: nextLabel,
      })
    );
    setUploadLookupQuery(nextLabel);
    setUploadLookupOpen(true);
  }

  const isSeriesMode = activeMediaType === "series";
  const isMoviesMode = activeMediaType === "movies";
  const isOscarView = isMoviesMode && movieLibraryView === "oscars" && !selectedMovie;
  const isGamesMode = activeMediaType === "games";
  const isBooksMode = activeMediaType === "books";
  const isBookAwardView = isBooksMode && bookLibraryView === "awards" && !activeBookCollection;
  const isPicturesMode = activeMediaType === "pictures";
  const activeMediaSection = MEDIA_TYPES.find((mediaType) => mediaType.id === activeMediaType);
  const activeAIResult = catalogAIResults[activeMediaType] || null;
  const activeAIIds = catalogAIIds(activeAIResult);
  const matchesAI = item => matchesCatalogAI(activeMediaType, item, activeAIIds);
  const applyCatalogAI = result => {
    setCatalogAIResults(current => ({ ...current, [result.section]: result }));
    if (result.section === "movies") { setSelectedMovieId(null); if (movieLibraryView === "oscars") setMovieLibraryView("grid"); }
    if (result.section === "series") setSelectedDirectoryPath("");
    if (result.section === "games") {
      setSelectedGamePath("");
      const ids = catalogAIIds(result);
      const systems = new Set(gameLibrary.filter(game => matchesCatalogAI("games", game, ids)).map(game => systemForGame(game)?.id).filter(Boolean));
      if (systems.size === 1) setSelectedSystemId([...systems][0]);
    }
    if (result.section === "books") {
      setBookDetailPath(""); setSelectedBookCollection("");
      if (bookLibraryView === "awards") setBookLibraryView("grid");
      const ids = catalogAIIds(result);
      const types = new Set((videos?.books || []).filter(book => matchesCatalogAI("books", book, ids)).map(book => isGraphicNovel(book) ? "graphic" : "novel"));
      if (types.size === 1) setBookLibraryType([...types][0]);
    }
  };
  const activeFilterQuery = mediaFilterQueries[activeMediaType] || "";
  const normalizedFilterQuery = normalizeMediaLabel(activeFilterQuery);
  const favoritesOnly = Boolean(mediaFavoritesOnly[activeMediaType]);
  const matchesName = (name) => !normalizedFilterQuery || normalizeMediaLabel(name).includes(normalizedFilterQuery);
  const matchesFavorite = (type, id) => !favoritesOnly || Boolean(mediaMarks[mediaMarkKey(type, id)]?.favorite);
  const selectedMovieGenres = movieGenreFilters[raspberryLanguage] || [];
  const movieGenreOptions = [...new Set(movieOptions.flatMap((movie) => movie.genres || []))]
    .sort((a, b) => a.localeCompare(b, normalizeRaspberryLanguage(raspberryLanguage)));
  const filteredMovieOptions = movieOptions.filter((movie) =>
    matchesAI(movie) && matchesName(movie.name) && matchesFavorite("movie", movie.id) &&
    (!selectedMovieGenres.length || (movie.genres || []).some((genre) => selectedMovieGenres.includes(genre))) &&
    (!movieAwardFilters.length || movieAwards(getMovieTmdbId(movie)).some(({ award }) => movieAwardFilters.includes(award)))
  ).sort((left, right) => compareLibraryItems(left, right, movieLibrarySort, movieSortDirection, normalizeRaspberryLanguage(raspberryLanguage)));
  const filteredSeriesOptions = seriesOptions
    .filter((series) => matchesAI(series) && matchesName(series.name) && matchesFavorite("series", series.id || series.directoryPath))
    .sort((left, right) => seriesLibrarySort === "rating"
      ? (Number(right.voteAverage) || 0) - (Number(left.voteAverage) || 0) || compareMediaNames(left, right)
      : compareMediaNames(left, right));
  const filteredGameOptions = consoleGames
    .filter(game => matchesAI(game) && matchesName(game.name || game.file) && matchesFavorite("game", game.relativePath))
    .map(game => ({ ...game, year: gameYear(game) }))
    .sort((left, right) => compareLibraryItems(left, right, gameLibrarySort, gameSortDirection, normalizeRaspberryLanguage(raspberryLanguage)));
  const filteredBookCollections = filterAICollections(bookCollections, isBooksMode ? activeAIIds : null).filter((collection) =>
    collection.books.some((book) =>
      matchesBookQuery(book, activeFilterQuery, `${collection.label} ${collection.author || ""}`) && matchesFavorite("book", book.relativePath)
    )
  );
  const filteredActiveBooks = activeBookCollection?.books.filter(book =>
    matchesAI(book) && matchesBookQuery(book, activeFilterQuery, `${activeBookCollection.label} ${activeBookCollection.author || ""}`) && matchesFavorite("book", book.relativePath)
  );
  const filteredPictures = pictureLibrary.filter(picture => matchesAI(picture) && matchesName(picture.name || picture.file) && matchesFavorite("picture", picture.relativePath));
  const selectorOptions = isGamesMode ? filteredGameOptions : isMoviesMode ? filteredMovieOptions : filteredSeriesOptions;
  const activeFilterCount = Number(Boolean(activeFilterQuery.trim())) + Number(favoritesOnly) + (isMoviesMode ? selectedMovieGenres.length + movieAwardFilters.length : 0);
  const mediaFiltersActive = activeFilterCount > 0 && !(isMoviesMode && movieLibraryView === "oscars");
  const libraryFiltersActive = mediaFiltersActive || activeAIIds !== null;

  useEffect(() => {
    if (!mediaFiltersActive || isBooksMode) return;
    if (isGamesMode) {
      if (selectedGamePath && !filteredGameOptions.some((game) => game.relativePath === selectedGame?.relativePath)) {
        setSelectedGamePath("");
      }
    } else if (isMoviesMode && selectedMovieId != null) {
      if (filteredMovieOptions.length && !filteredMovieOptions.some((movie) => movie.id === selectedMovie?.id)) {
        setSelectedMovieId(filteredMovieOptions[0].id);
      }
    } else if (selectedDirectoryPath && filteredSeriesOptions.length && !filteredSeriesOptions.some((series) => series.directoryPath === selectedSeries?.directoryPath)) {
      setSelectedDirectoryPath(filteredSeriesOptions[0].directoryPath);
    }
  }, [mediaFiltersActive, isBooksMode, isGamesMode, isMoviesMode, filteredGameOptions, filteredMovieOptions, filteredSeriesOptions, selectedGame?.relativePath, selectedMovie?.id, selectedMovieId, selectedSeries?.directoryPath]);
  const formatBookCollectionLabel = (collection) => {
    if (!collection) return bookLibraryType === "graphic" ? bookStrings(raspberryLanguage).graphicNovel : t("media_books");
    return collection.label;
  };
  const selectorValue = isBooksMode
    ? selectedBookCollection
    : isGamesMode
    ? selectedGame?.relativePath || ""
    : isMoviesMode
    ? String(selectedMovie?.id || "")
    : selectedSeries?.directoryPath || "";
  const selectorLabel = isBooksMode
    ? formatBookCollectionLabel(activeBookCollection)
    : isGamesMode
    ? t("select_game")
    : isMoviesMode
      ? t("select_movie")
      : t("select_series");
  const isLibraryEmpty = isMoviesMode
    ? movieOptions.length === 0
    : isSeriesMode
      ? seriesOptions.length === 0
      : !selectedItem && !isGamesMode && !isBooksMode;
  const heroSelectorOptions = isBooksMode
    ? filteredBookCollections.map((collection) => ({
        key: collection.key,
        value: collection.key,
        label: formatBookCollectionLabel(collection),
      }))
    : isGamesMode
    ? filteredGameOptions.map((game) => ({
        key: game.relativePath || game.file,
        value: game.relativePath || "",
        label: game.name || game.file,
      }))
    : selectorOptions.map((item) => ({
        key: isMoviesMode ? String(item.id) : item.directoryPath,
        value: isMoviesMode ? String(item.id) : item.directoryPath,
        label: item.name,
      }));
  const bookHeaderBook = filteredActiveBooks?.length === 1 ? filteredActiveBooks[0] : activeBookCollection?.books.find(book => book.relativePath === bookDetailPath);
  const isMediaDetail = (isGamesMode && Boolean(selectedGame)) || (isSeriesMode && Boolean(selectedSeries)) || (isMoviesMode && Boolean(selectedMovie)) || (isBooksMode && Boolean(activeBookCollection));
  const filterTotal = isPicturesMode ? pictureLibrary.length : isBooksMode
    ? activeBookCollection?.books.length ?? bookCollections.length
    : isGamesMode
      ? consoleGames.length
      : isMoviesMode
        ? movieOptions.length
        : seriesOptions.length;
  const filterVisible = isPicturesMode ? filteredPictures.length : isBooksMode
    ? filteredActiveBooks?.length ?? filteredBookCollections.length
    : selectorOptions.length;
  const libraryCountLabel = `${t("movie_filter_count", { shown: filterVisible, total: filterTotal })} ${t(isBooksMode && !activeBookCollection ? "book_library_items" : `media_${activeMediaType}`).toLocaleLowerCase(normalizeRaspberryLanguage(raspberryLanguage))}`;
  const emptyTitle = isMoviesMode ? t("no_movies_available") : t("no_seasons_available");
  const emptyDescription = isMoviesMode
    ? t("add_movie_prompt")
    : t("no_season_info");
  const movieImages = selectedMovie?.imageOptions?.length
    ? selectedMovie.imageOptions.slice(0, MAX_MOVIE_IMAGES)
    : [selectedMovie?.heroImage].filter(Boolean);
  const safeMovieFrameIndex = movieImages.length
    ? Math.min(movieFrameIndex, movieImages.length - 1)
    : 0;
  const raspberryLibraryCounts = normalizeLibraryCounts(raspberryHealth?.ok ? raspberryHealth.libraryCounts : videos?.libraryCounts);
  const installedSeriesCount = raspberryLibraryCounts.series.count;
  const installedMovieCount = raspberryLibraryCounts.movies.count;
  const installedGameCount = raspberryLibraryCounts.games.count;
  const installedBookCount = raspberryLibraryCounts.books.count;
  const installedPictureCount = raspberryLibraryCounts.pictures.count;
  const usedStorageGb = Number(raspberryHealth?.storage?.usedGb) || 0;
  const totalStorageGb = Number(raspberryHealth?.storage?.totalGb) || 0;
  const multimediaUsedGb = Number(raspberryHealth?.storage?.multimediaUsedGb) || 0;
  const multimediaPercent = Number(raspberryHealth?.storage?.multimediaPercentUsed) || 0;
  const canPlayNextEpisode = useMemo(() => {
    if (!raspberryHealth.running || raspberryCurrentPlayback?.kind !== "episode") return false;

    return Boolean(
      resolveNextEpisodeTarget({
        currentPlayback: raspberryCurrentPlayback,
        raspberryHealth,
        seriesOptions,
        directories,
      })
    );
  }, [directories, raspberryCurrentPlayback, raspberryHealth, seriesOptions]);

  return (
    <main
      className="app-shell"
      style={{
        "--clouds-background": `url(${cloudsBackground})`,
      }}
    >
      <div className={`page-overlay${currentView === "season" ? " page-overlay--season" : ""}`}>
        {!unlocked ? (
          <div className="unlock-page">
            <header className="series-hero unlock-hero">
              <div className="series-hero__banner">
                <HeaderArt image={cartellLogo} alt="DonkiCodeLab" />

                <div className="series-hero__controls-layer">
                  <div
                    className="series-hero__controls-backdrop"
                    aria-hidden="true"
                    style={{
                      WebkitMaskImage: `url(${cartellMask})`,
                      maskImage: `url(${cartellMask})`,
                    }}
                  />
                  <div className="series-hero__controls-row series-hero__controls-row--selector-only">
                    <div className="unlock-hero__title">{t("manager_title")}</div>
                  </div>
                </div>

                <div
                  className={`unlock-hero__video-shell${introVideoFinished ? " unlock-hero__video-shell--finished" : ""}`}
                >
                  {introVideoFinished ? (
                    <img
                      className="unlock-hero__finished-tv"
                      src={tvGreen}
                      alt={t("mini_tv_title")}
                    />
                  ) : (
                    <video
                      className="unlock-hero__video"
                      src={raspberryIntroVideo}
                      autoPlay
                      muted
                      playsInline
                      onEnded={() => setIntroVideoFinished(true)}
                      aria-label={t("manager_title")}
                    />
                  )}
                </div>
              </div>
            </header>

            <section className="empty-state unlock-page__access">
              <div className="empty-state__card unlock-card">
                <header className="unlock-card__header">
                  <p className="unlock-card__eyebrow">{t("protected_access")}</p>
                </header>
                <p>{t("unlock_copy")}</p>
                <form className="unlock-form" onSubmit={handleUnlock}>
                  <div className="unlock-form__input-wrap">
                    <input
                      className="unlock-form__input"
                      inputMode="numeric"
                      maxLength={4}
                      pattern="[0-9]*"
                      type={webPinVisible ? "text" : "password"}
                      value={webPinInput}
                      onChange={(event) =>
                        setWebPinInput(event.target.value.replace(/\D/g, "").slice(0, 4))
                      }
                    />
                    <button
                      className="unlock-form__toggle"
                      type="button"
                      onClick={() => setWebPinVisible((current) => !current)}
                      aria-label={webPinVisible ? t("hide_password") : t("show_password")}
                      aria-pressed={webPinVisible}
                      title={webPinVisible ? t("hide_password") : t("show_password")}
                    >
                      {webPinVisible ? (
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M3 3l18 18" />
                          <path d="M10.58 10.58a2 2 0 0 0 2.84 2.84" />
                          <path d="M9.88 5.09A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8-0.51 1.45-1.32 2.79-2.36 3.91" />
                          <path d="M6.61 6.61C4.62 8 3.15 9.88 2 12c1.73 4.89 6 8 10 8 1.73 0 3.38-0.37 4.88-1.03" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M2 12s3.64-7 10-7 10 7 10 7-3.64 7-10 7-10-7-10-7Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <button disabled={pinSubmitting} type="submit">
                    {pinSubmitting ? t("validating") : t("enter")}
                  </button>
                </form>
                {pinError ? <p className="unlock-form__error">{pinError}</p> : null}
              </div>
            </section>
          </div>
        ) : (
          <>
            {profiles.error ? createPortal(<div className="profile-status" role="alert">{profiles.error}<button type="button" onClick={profiles.reload}>{userStrings(raspberryLanguage).retry}</button></div>, document.body) : !profiles.ready ? <div className="profile-status" role="status">Users…</div> : null}
            {!libraryPending && !detailLoading && !detailError && coverWarning && currentView !== "raspberry" ? <div className="detail-load-status" role="status">{coverWarning}</div> : null}
            {(detailLoading || detailError) && !(isSeriesMode && currentView !== "season") && !libraryPending && currentView !== "raspberry" ? <div className="detail-load-status" role={detailError ? "alert" : "status"}>
              {detailLoading ? <><span className="tmdb-cache-spinner" aria-hidden="true" /> Cargando ficha de {selectedMovie?.name || selectedSeries?.name || "este título"}…</> : <>{detailError} <button className="dialog-button" onClick={() => setDetailRetry(value => value + 1)} type="button">Reintentar</button></>}
            </div> : null}
            {!error && libraryPending ? (
              <LibraryLoading label={t("loading_library")} stage={libraryStage} progress={tmdbLoading ? coverProgress : null} />
            ) : error ? (
              <section className="empty-state">
                <div className="empty-state__card">
                  <h2>{t("connection_error")}</h2>
                  <p>{error}</p>
                </div>
              </section>
            ) : currentView === "raspberry" ? (
              <RaspberryPage
                profiles={profiles} userEditorId={userEditorId} onUserEditorChange={setUserEditorId} onManageUsers={handleManageUsers}
                raspberryTab={raspberryTab}
                onChangeTab={setRaspberryTab}
                dashboardSection={dashboardSection}
                onDashboardSectionShown={setDashboardSection}
                onBack={handleBackFromRaspberry}
                onLogout={() => {
                  setStoredWebPin("");
                  setWebPinInput("");
                  setUnlocked(false);
                  window.location.reload();
                }}
                t={t}
                seriesCount={installedSeriesCount}
                seriesUsedGb={raspberryLibraryCounts.series.usedGb}
                seriesPercent={raspberryLibraryCounts.series.percentUsed}
                movieCount={installedMovieCount}
                movieUsedGb={raspberryLibraryCounts.movies.usedGb}
                moviePercent={raspberryLibraryCounts.movies.percentUsed}
                gameCount={installedGameCount}
                gameUsedGb={raspberryLibraryCounts.games.usedGb}
                gamePercent={raspberryLibraryCounts.games.percentUsed}
                bookCount={installedBookCount}
                bookUsedGb={raspberryLibraryCounts.books.usedGb}
                bookPercent={raspberryLibraryCounts.books.percentUsed}
                pictureCount={installedPictureCount}
                pictureUsedGb={raspberryLibraryCounts.pictures.usedGb}
                picturePercent={raspberryLibraryCounts.pictures.percentUsed}
                usedStorageGb={usedStorageGb}
                totalStorageGb={totalStorageGb}
                multimediaUsedGb={multimediaUsedGb}
                multimediaPercent={multimediaPercent}
                statsCalculating={raspberryLibraryCounts.calculating}
                alarm={raspberryAlarm}
                alarmSounds={raspberryAlarmSounds}
                alarmPreviewSound={alarmPreviewSound}
                alarmPreviewPlaying={alarmPreviewPlaying}
                onAlarmTimeChange={handleAlarmTimeChange}
                onAlarmToggle={handleAlarmToggle}
                onAlarmSoundChange={handleAlarmSoundChange}
                onAlarmPreviewSoundChange={handleAlarmPreviewSoundChange}
                onAlarmPreviewPlay={handlePlayAlarmPreview}
                onAlarmPreviewStop={handleStopAlarmPreview}
                birthdays={birthdays}
                birthdaysSaving={birthdaysSaving}
                birthdaysStatus={birthdaysStatus}
                onSaveBirthdays={handleSaveBirthdays}
                weatherLocation={weatherLocation}
                weatherLocationStatus={weatherLocationStatus}
                weatherLocationDetails={weatherLocationDetails}
                onWeatherLocationChange={(value) => {
                  setWeatherLocation(value);
                  setWeatherLocationStatus("");
                  setWeatherLocationDetails(null);
                }}
                onWeatherLocationSave={handleWeatherLocationSave}
                raspberryHealth={raspberryHealth}
                currentPlaybackInfo={raspberryCurrentPlayback}
                controlsBusy={raspberryControlsBusy}
                onRefreshStatus={handleRefreshRaspberryStatus}
                onPausePlayback={handlePausePlayback}
                onStopPlayback={handleStopRaspberryPlayback}
                onNextEpisode={handlePlayNextEpisode}
                onVolumeDown={handleVolumeDownRaspberry}
                onVolumeUp={handleVolumeUpRaspberry}
                onPowerOff={handlePowerOffRaspberry}
                canPlayNextEpisode={canPlayNextEpisode}
                raspberryLanguage={raspberryLanguage}
                onSetRaspberryLanguage={handleRaspberryLanguageChange}
                raspberryLanguageSaving={raspberryLanguageSaving}
                raspberryLanguageError={raspberryLanguageError}
                tmdbSettings={tmdbSettings}
                tmdbSettingsStatus={tmdbSettingsStatus}
                tmdbSettingsSaving={tmdbSettingsSaving}
                onTmdbSettingsChange={(field, value) => {
                  setTmdbSettings((current) => ({ ...current, [field]: value }));
                  setTmdbSettingsStatus("");
                }}
                onTmdbSettingsSave={handleTmdbSettingsSave}
                uploadMediaType={uploadMediaType}
                onUploadMediaTypeChange={setUploadMediaType}
                uploadBookIsGraphicNovel={uploadBookIsGraphicNovel}
                onUploadBookTypeChange={setUploadBookIsGraphicNovel}
                onUploadFiles={handleUploadFiles}
                uploadDragActive={uploadDragActive}
                onUploadDragStateChange={handleUploadDragStateChange}
                uploadSummary={uploadSummary}
                torrentDownloads={torrentDownloads}
                onOpenTmdbBrowser={() => { setTorrentInitialMovie(null); setTmdbBrowserOpen(true); }}
              />
            ) : isSeriesMode && currentView === "season" && selectedSeason ? (
              <section className="season-page">
                <button
                  className="back-button season-page__back season-page__back--fixed"
                  onClick={handleBackToSeries}
                  type="button"
                >
                  <span className="season-page__back-arrow" aria-hidden="true">←</span>
                  <span className="season-page__back-label">{t("back")}</span>
                </button>

                <button
                  className="season-page__delete"
                  onClick={() => handleDeleteSeason(selectedSeason)}
                  type="button"
                  aria-label={t("delete_season")}
                  title={t("delete_season")}
                >
                  <img src={deleteIcon} alt="" aria-hidden="true" />
                </button>

                <button
                  className="series-hero__tv-button series-hero__tv-button--season-fixed"
                  onClick={handleOpenRaspberryPage}
                  type="button"
                >
                  <img className="series-hero__tv" src={tvGreen} alt={t("mini_tv_title")} />
                </button>

                <div ref={seasonHeroShellRef} className="season-page__hero-shell">
                  <header
                    className="season-page__hero"
                    style={{
                      backgroundImage: `linear-gradient(rgba(7, 12, 18, 0.12), rgba(7, 12, 18, 0.12)), url(${seasonHeroImage || selectedSeason.image || headerImage})`,
                    }}
                  >
                    <div className="season-page__hero-overlay">
                      <h1>{selectedSeries.name}</h1>
                      <p>{selectedSeason.title}</p>
                      <span>
                        {`${selectedSeason.episodeCount} ${t("chapters_summary")}${seasonEpisodes?.episodes?.length ? ` / ${formatSeriesRuntime(seasonEpisodes.episodes.reduce((total, episode) => total + episode.runtime, 0))}` : ""}`}
                      </span>
                    </div>
                  </header>
                </div>

                <div className="media-marks media-marks--season">
                  <button type="button" className="media-mark" onClick={() => handleMarkSeason(true)}><MediaMarkIcon active /><span>{t("mark_all_watched")}</span></button>
                  <button type="button" className="media-mark" onClick={() => handleMarkSeason(false)}><MediaMarkIcon /><span>{t("mark_all_unwatched")}</span></button>
                </div>

                {seasonEpisodesLoading ? (
                  <p role="status"><span className="tmdb-cache-spinner" /> Cargando miniaturas de {selectedSeason.title}…</p>
                ) : (
                  <section className="season-page__episodes">
                    {(seasonEpisodes?.episodes || []).map((episode) => (
                        <EpisodeRow
                          key={episode.id}
                          episode={episode}
                          available={isEpisodeUploaded(selectedSeason, episode, uploadedEpisodeIds)}
                          onSelect={handleOpenEpisodeDetails}
                          t={t}
                        />
                    ))}
                  </section>
                )}
              </section>
            ) : (
              <>
                <section
                  className={`series-selector${hasSettingsButton ? "" : " series-selector--without-settings"}`}
                >
                  <div className="series-selector__header">
                    <div className="media-switch" role="tablist" aria-label={t("raspberry_sections")}>
                      {MEDIA_TYPES.map((mediaType) => {
                        const isActive = mediaType.id === activeMediaType;
                        return (
                          <button
                            key={mediaType.id}
                            className={`media-switch__option${isActive ? " active" : ""}`}
                            onClick={() => handleMediaTypeChange(mediaType.id)}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                          >
                            <img
                              className="media-switch__icon"
                              src={isActive ? mediaType.activeIcon : mediaType.inactiveIcon}
                              alt=""
                              aria-hidden="true"
                            />
                            <span>{t(mediaType.labelKey)}</span>
                          </button>
                        );
                      })}
                    </div>
                    <ProfileMenu profiles={profiles} onManage={handleManageUsers} language={raspberryLanguage} />
                  </div>
                </section>

                <header className="series-hero">
                  <div className="series-hero__banner">
                    {isBooksMode && bookHeaderBook ? <BookHeaderPreview key={bookHeaderBook.relativePath} book={bookHeaderBook} cover={getBookDisplayCoverUrl(bookHeaderBook) || headerImage} language={raspberryLanguage} /> : <HeaderArt
                      image={isPicturesMode ? cartellLogo : headerImage}
                      gameSystem={isGamesMode && !selectedGame ? GAME_SYSTEMS.find(system => system.id === selectedSystemId) : null}
                      game={isGamesMode ? selectedGame : null}
                      crop={headerImageCrop}
                      bookCover={(isBooksMode && Boolean(activeBookCollection)) || (isGamesMode && Boolean(selectedGame?.coverImage))}
                      bookType={isBooksMode ? bookLibraryType : null}
                      alt={(isBooksMode ? activeBookCollection?.label || (bookLibraryType === "graphic" ? bookStrings(raspberryLanguage).graphicNovels : bookStrings(raspberryLanguage).novels) : selectedItem?.name) || "Cartell principal"}
                    />}

                    {!isMediaDetail ? (
                      <h1 className={`series-hero__section-title${isBooksMode ? " series-hero__section-title--books" : ""}`} key={activeMediaType}>
                        <svg className="series-hero__section-icon" viewBox={activeMediaSection.headerIcon.viewBox} aria-hidden="true" focusable="false">
                          <image href={activeMediaSection.inactiveIcon} width={activeMediaSection.headerIcon.width} height={activeMediaSection.headerIcon.height} />
                        </svg>
                        <span>{isBookAwardView ? bookAwardStrings(raspberryLanguage).view : isBooksMode ? (bookLibraryType === "graphic" ? bookStrings(raspberryLanguage).graphicNovels : bookStrings(raspberryLanguage).novels) : t(activeMediaSection.labelKey)}</span>
                      </h1>
                    ) : null}

                    {isMediaDetail ? (
                      <div className="movie-library__hero-tools">
                        <button type="button" className="back-button" onClick={isGamesMode ? handleBackToGameLibrary : isBooksMode ? handleBackToBookLibrary : isMoviesMode ? handleBackToMovieLibrary : handleBackToSeriesLibrary}>
                          <span aria-hidden="true">←</span> {t(isGamesMode ? "media_games" : isBooksMode ? "book_library" : isMoviesMode ? "movie_library" : "series_library")}
                        </button>
                      </div>
                    ) : null}

                    {!isMediaDetail && !isPicturesMode ? <div className="series-hero__controls-layer">
                      <div
                        className="series-hero__controls-backdrop"
                        aria-hidden="true"
                        style={{
                          WebkitMaskImage: `url(${cartellMask})`,
                          maskImage: `url(${cartellMask})`,
                        }}
                      />
                      {isBooksMode ? <BookLibraryControls language={raspberryLanguage} view={bookLibraryView} onViewChange={setBookLibraryView} viewLabels={{ grid: t("movie_view_grid"), list: t("movie_view_list") }} sort={bookLibrarySort} onSortChange={setBookLibrarySort}
                        type={bookLibraryType} onTypeChange={setBookLibraryType} /> : isSeriesMode || isMoviesMode || isGamesMode ? (
                        <div className="movie-library__browse-tools">
                            <div className="movie-library__view-switch" role="group" aria-label={t(isGamesMode ? "media_games" : isMoviesMode ? "movie_library" : "series_library")}>
                              <button type="button" className={(isGamesMode ? gameLibraryView : isMoviesMode ? movieLibraryView : seriesLibraryView) === "grid" ? "active" : ""} onClick={() => isGamesMode ? setGameLibraryView("grid") : isMoviesMode ? setMovieLibraryView("grid") : setSeriesLibraryView("grid")} aria-pressed={(isGamesMode ? gameLibraryView : isMoviesMode ? movieLibraryView : seriesLibraryView) === "grid"} aria-label={t("movie_view_grid")} title={t("movie_view_grid")}>▦</button>
                              <button type="button" className={(isGamesMode ? gameLibraryView : isMoviesMode ? movieLibraryView : seriesLibraryView) === "list" ? "active" : ""} onClick={() => isGamesMode ? setGameLibraryView("list") : isMoviesMode ? setMovieLibraryView("list") : setSeriesLibraryView("list")} aria-pressed={(isGamesMode ? gameLibraryView : isMoviesMode ? movieLibraryView : seriesLibraryView) === "list"} aria-label={t("movie_view_list")} title={t("movie_view_list")}>☰</button>
                              {isMoviesMode && <button type="button" className={`oscar-view-button${isOscarView ? " active" : ""}`} onClick={() => setMovieLibraryView("oscars")} aria-pressed={isOscarView} aria-label={awardStrings(raspberryLanguage).view} title={awardStrings(raspberryLanguage).view}><OscarIcon /></button>}
                            </div>
                            {!isOscarView && <label className="movie-library__sort">
                              <span>{t("movie_sort_label")}</span>
                              <select
                                value={isGamesMode ? gameLibrarySort : isMoviesMode ? movieLibrarySort : seriesLibrarySort}
                                onChange={(event) => isGamesMode ? setGameLibrarySort(event.target.value) : isMoviesMode ? setMovieLibrarySort(event.target.value) : setSeriesLibrarySort(event.target.value)}
                              >
                                <option value="name">{t("movie_sort_name")}</option>
                                {isMoviesMode || isGamesMode ? <option value="year">{t("movie_sort_year")}</option> : null}
                                {!isGamesMode && <option value="rating">{t("movie_sort_rating")}</option>}
                              </select>
                            </label>}
                        </div>
                      ) : null}
                      {isOscarView && <AwardSelector value={awardType} onChange={setAwardType} language={raspberryLanguage} />}
                      {isBookAwardView && <BookAwardSelector value={bookAwardType} onChange={setBookAwardType} language={raspberryLanguage} />}
                      {isGamesMode ? <div className="series-hero__controls-row series-hero__controls-row--selector-only"><GameConsoleCarousel systemId={selectedSystemId} onSystemChange={(id) => { setSelectedSystemId(id); setSelectedGamePath(""); }} language={raspberryLanguage} /></div> : !isOscarView && !isBookAwardView && <div
                        className={`series-hero__controls-row series-hero__controls-row--ai${filterTotal || isGamesMode ? "" : " series-hero__controls-row--selector-only"}`}
                      >
                        {filterTotal ? (
                          <button
                            className={`movie-filter__toggle${mediaFilterOpen ? " is-open" : ""}${mediaFiltersActive ? " has-filters" : ""}`}
                            type="button"
                            onClick={() => setMediaFilterOpen((current) => !current)}
                            aria-label={isBooksMode ? bookStrings(raspberryLanguage).searchLibrary : t("movie_filter")}
                            aria-expanded={mediaFilterOpen}
                            title={isBooksMode ? bookStrings(raspberryLanguage).searchLibrary : t("movie_filter")}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d={mediaFilterOpen ? "M5 15l7-7 7 7" : "M4 6h16M7 12h10M10 18h4"} />
                            </svg>
                            {mediaFiltersActive ? <span>{activeFilterCount}</span> : null}
                          </button>
                        ) : isGamesMode ? (
                          <button
                            className="series-icon-button series-icon-button--controls-plus"
                            onClick={() => handleOpenUploadsForMedia("games")}
                            type="button"
                            aria-label={t("add_media", { media: t("media_games_singular") })}
                            title={t("add_media", { media: t("media_games_singular") })}
                          >
                            <svg
                              className="series-icon-button__icon series-icon-button__icon--plus"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <line x1="12" y1="5" x2="12" y2="19" />
                              <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                          </button>
                        ) : null}

                        <CatalogAIButton compact language={raspberryLanguage} open={catalogAIOpen} active={Boolean(activeAIResult)} onClick={() => setCatalogAIOpen(value => !value)} />
                        <HeroSelector
                          options={heroSelectorOptions}
                          value={selectorValue}
                          placeholder={
                            isBooksMode || heroSelectorOptions.length
                              ? selectorLabel
                              : isGamesMode
                                ? t("games_empty_title")
                                : "Sin elementos"
                          }
                          disabled={!heroSelectorOptions.length}
                          onChange={(nextValue) =>
                            isBooksMode
                              ? handleOpenBookCollection(nextValue)
                              : isGamesMode
                              ? handleOpenGameDetails(nextValue)
                              : isMoviesMode
                              ? handleOpenMovieDetails(nextValue)
                              : handleOpenSeriesDetails(nextValue)
                          }
                        />
                      </div>}
                    </div> : null}

                    <div
                      className={isMediaDetail ? "series-hero__detail-controls" : "series-hero__settings-slot"}
                      style={isMediaDetail ? {
                        WebkitMaskImage: `url(${cartellMask})`,
                        maskImage: `url(${cartellMask})`,
                      } : undefined}
                    >
                    <div className={isMediaDetail ? "series-hero__detail-actions" : "series-hero__settings-slot"}>
                    {hasSettingsButton ? (
                      <button
                        className={`series-icon-button series-icon-button--hero series-icon-button--hero-settings${isMediaDetail ? " series-icon-button--detail-settings" : ""}`}
                        onClick={handleOpenCustomization}
                        type="button"
                        aria-label={`Personalizar ${isMoviesMode ? "película" : isSeriesMode ? "serie" : isGamesMode ? "juego" : activeBookCollection?.isCollection ? "colección" : "libro"}`}
                        title={`Personalizar ${isMoviesMode ? "película" : isSeriesMode ? "serie" : isGamesMode ? "juego" : activeBookCollection?.isCollection ? "colección" : "libro"}`}
                      >
                        <img
                          className="series-icon-button__image series-icon-button__image--settings"
                          src={settingsIcon}
                          alt=""
                          aria-hidden="true"
                          draggable="false"
                        />
                      </button>
                    ) : null}

                    {isMediaDetail && !isBooksMode ? (
                      isGamesMode ? renderMarks("game", selectedGame.relativePath) : isMoviesMode
                        ? renderMarks("movie", selectedMovie.id)
                        : renderMarks("series", selectedSeries.id || selectedSeries.directoryPath, false)
                    ) : null}
                    </div>
                    </div>

                    <button
                      className="series-hero__tv-button"
                      onClick={() => {
                        if (isPicturesMode) setRaspberryTab("dashboard");
                        handleOpenRaspberryPage();
                      }}
                      type="button"
                      aria-label={t("raspberry_dashboard")}
                    >
                      <img className="series-hero__tv" src={tvGreen} alt={t("mini_tv_title")} />
                    </button>
                  </div>
                </header>

                {isGamesMode && !isMediaDetail && <div className="games-library__controls">
                  <button className={`dialog-button games-library__filter${mediaFilterOpen ? " is-open" : ""}`} type="button"
                    onClick={() => setMediaFilterOpen(current => !current)} aria-expanded={mediaFilterOpen}
                    aria-controls="library-filter-panel">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d={mediaFilterOpen ? "M5 15l7-7 7 7" : "M4 6h16M7 12h10M10 18h4"} /></svg>
                    {t("games_filter")}{mediaFiltersActive ? ` (${activeFilterCount})` : ""}
                  </button>
                  <CatalogAIButton language={raspberryLanguage} open={catalogAIOpen} active={Boolean(activeAIResult)} onClick={() => setCatalogAIOpen(value => !value)} />
                  <HeroSelector options={heroSelectorOptions} value={selectorValue}
                    placeholder={heroSelectorOptions.length ? selectorLabel : t("games_empty_title")}
                    disabled={!heroSelectorOptions.length} onChange={handleOpenGameDetails} />
                </div>}

                {(isPicturesMode || isMediaDetail || isOscarView || isBookAwardView) && <div className="catalog-ai-extra-tools">
                  {isPicturesMode && <button className="dialog-button" type="button" onClick={() => setMediaFilterOpen(value => !value)} aria-expanded={mediaFilterOpen} aria-controls="library-filter-panel">{t("movie_filter")}</button>}
                  <CatalogAIButton language={raspberryLanguage} open={catalogAIOpen} active={Boolean(activeAIResult)} onClick={() => setCatalogAIOpen(value => !value)} />
                </div>}
                {catalogAIOpen && <CatalogAI key={`${profiles.activeId}:${activeMediaType}:${raspberryLanguage}`} section={activeMediaType} language={raspberryLanguage}
                  user={profiles.ready ? profiles.activeUser : null} onOpenLibrary={handleOpenRecommendedLibrary} onSearchTorrent={handleRecommendedTorrent}
                  initialPrompt={activeAIResult?.prompt || ""} onResult={applyCatalogAI} onClose={() => setCatalogAIOpen(false)} />}
                {!isOscarView && !isBookAwardView && <CatalogAIResult result={activeAIResult} visible={filterVisible} language={raspberryLanguage}
                  onClear={() => setCatalogAIResults(current => ({ ...current, [activeMediaType]: null }))} />}

                {!isOscarView && !isBookAwardView && !isMediaDetail && (isGamesMode || filterTotal > 0) && mediaFilterOpen ? (
                  <section id="library-filter-panel" className="movie-filter__panel" aria-label={t("movie_filter_title")}>
                    <div className="movie-filter__heading">
                      <strong>{t("movie_filter_title")}</strong>
                      {mediaFiltersActive ? <button type="button" onClick={() => { setMediaFilterQueries((current) => ({ ...current, [activeMediaType]: "" })); setMediaFavoritesOnly((current) => ({ ...current, [activeMediaType]: false })); if (isMoviesMode) { setMovieGenreFilters((current) => ({ ...current, [raspberryLanguage]: [] })); setMovieAwardFilters([]); } }}>{t("movie_filter_clear")}</button> : null}
                    </div>
                    <label className="movie-filter__search">
                      <span>{isBooksMode ? bookStrings(raspberryLanguage).searchLibrary : t("movie_filter_search")}</span>
                      <input type="search" value={activeFilterQuery} onChange={(event) => setMediaFilterQueries((current) => ({ ...current, [activeMediaType]: event.target.value }))} placeholder={isBooksMode ? bookStrings(raspberryLanguage).searchLibraryPlaceholder : t("movie_filter_search_placeholder")} autoFocus />
                    </label>
                    <label className="movie-filter__favorites">
                      <input type="checkbox" checked={favoritesOnly} onChange={(event) => setMediaFavoritesOnly((current) => ({ ...current, [activeMediaType]: event.target.checked }))} />
                      <MediaMarkIcon favorite active={favoritesOnly} />
                      <span>{t("media_filter_favorites")}</span>
                    </label>
                    {isMoviesMode ? (
                      <fieldset className="movie-filter__genres">
                        <legend>{t("movie_filter_awards")}</legend>
                        <p>{t("movie_filter_awards_hint")}</p>
                        <div className="movie-filter__genre-options">
                          {["oscars", "palme", "goya"].map((award) => (
                            <label key={award} className={`movie-filter__genre${movieAwardFilters.includes(award) ? " is-selected" : ""}`}>
                              <input type="checkbox" checked={movieAwardFilters.includes(award)} onChange={(event) => {
                                const checked = event.target.checked;
                                setMovieAwardFilters((current) => checked ? [...current, award] : current.filter((value) => value !== award));
                              }} />
                              <span>{t(`movie_filter_award_${award}`)}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ) : null}
                    {isMoviesMode ? (
                      <fieldset className="movie-filter__genres">
                        <legend>{t("genres")}</legend>
                        <p>{t("movie_filter_genres_hint")}</p>
                        <div className="movie-filter__genre-options">
                          {movieGenreOptions.map((genre) => (
                            <label key={genre} className={`movie-filter__genre${selectedMovieGenres.includes(genre) ? " is-selected" : ""}`}>
                              <input type="checkbox" checked={selectedMovieGenres.includes(genre)} onChange={(event) => {
                                const checked = event.target.checked;
                                setMovieGenreFilters((current) => {
                                  const selected = current[raspberryLanguage] || [];
                                  return { ...current, [raspberryLanguage]: checked ? [...selected, genre] : selected.filter((value) => value !== genre) };
                                });
                              }} />
                              <span>{genre}</span>
                            </label>
                          ))}
                        </div>
                        {!movieGenreOptions.length ? <p>{t("movie_filter_genres_empty")}</p> : null}
                      </fieldset>
                    ) : null}
                    {!filterVisible ? <p className="movie-filter__empty">{t("movie_filter_no_results")}</p> : null}
                  </section>
                ) : null}

                {isBookAwardView ? (
                  <BookAwardLibrary key={bookAwardType} award={bookAwardType} books={videos?.books || []} language={raspberryLanguage}
                    edition={bookAwardEditions[bookAwardType]} onEditionChange={edition => setBookAwardEditions(current => ({ ...current, [bookAwardType]: edition }))}
                    onRead={setBookOpenTarget} onSearchTorrent={setBookTorrentTarget} onUpload={() => { setBookLibraryType("novel"); handleOpenUploadsForMedia("books"); setUploadBookIsGraphicNovel(false); }} />
                ) : isOscarView ? (
                  <OscarLibrary key={awardType} award={awardType} movies={movieOptions} language={tmdbLanguage} edition={awardEditions[awardType]} onEditionChange={edition => setAwardEditions(current => ({ ...current, [awardType]: edition }))} onOpenMovie={handleOpenMovieDetails}
                    onUploadMovie={() => handleOpenUploadsForMedia("movies")}
                    onSearchTorrent={movie => {
                      handleOpenUploadsForMedia("movies");
                      setTorrentInitialMovie(movie);
                      setTmdbBrowserOpen(true);
                    }} />
                ) : isPicturesMode && !(libraryFiltersActive && !filterVisible) ? (
                  <PicturesLibrary key={profiles.activeId} renderMarks={renderMarks} onViewed={picture => { const key = mediaMarkKey("picture", picture.relativePath); if (!mediaMarks[key]?.watched) saveMarks({ ...mediaMarks, [key]: { ...mediaMarks[key], watched: true } }); }} countLabel={libraryCountLabel} pictures={filteredPictures} onUpload={() => handleOpenUploadsForMedia("pictures")} t={t} />
                ) : !isGamesMode && libraryFiltersActive && !filterVisible ? (
                  <section className="empty-state seasons-section">
                    {!isMediaDetail && !isGamesMode ? <div className="seasons-section__label">{libraryCountLabel}</div> : null}
                    <div className="empty-state__card"><p>{t("movie_filter_no_results")}</p></div>
                  </section>
                ) : isBooksMode ? (
                  activeBookCollection ? (
                  <BooksLibrary
                    detailPath={bookDetailPath} setDetailPath={setBookDetailPath}
                    view={bookLibraryView}
                    actionsVisible={bookActionsVisible} onActionsChange={setBookActionsVisible} renderActions={renderBookActions}
                    direction={bookSortDirection}
                    onDirectionChange={setBookSortDirection}
                    sort={bookLibrarySort}
                    key={activeBookCollection.key}
                    language={raspberryLanguage}
                    renderMarks={(book) => renderMarks("book", book.relativePath)}
                    books={filteredActiveBooks || activeBookCollection.books}
                    title={activeBookCollection.label}
                    author={activeBookCollection.author}
                    countLabel={libraryCountLabel}
                    onOpen={setBookOpenTarget}
                    onEdit={setBookMetadataTarget}
                    onDelete={handleDeleteBook}
                  />
                  ) : (
                    <BookCollectionLibrary
                      view={bookLibraryView}
                      actionsVisible={bookActionsVisible} onActionsChange={setBookActionsVisible} renderActions={renderBookActions}
                      direction={bookSortDirection}
                      onDirectionChange={setBookSortDirection}
                      sort={bookLibrarySort}
                      language={raspberryLanguage}
                      type={bookLibraryType}
                      collections={filteredBookCollections}
                      countLabel={libraryCountLabel}
                      onSelect={handleOpenBookCollection}
                      t={t}
                    />
                  )
                ) : isGamesMode ? (
                  <>
                    {!selectedGame && <section className="movie-library seasons-section games-library library-with-scroll-rail">
                      <LibraryScrollRail labels={filteredGameOptions.map(game => libraryScrollLabel(game, gameLibrarySort, normalizeRaspberryLanguage(raspberryLanguage)))} language={raspberryLanguage} sort={gameLibrarySort} direction={gameSortDirection} onDirectionChange={setGameSortDirection} actionsVisible={gameActionsVisible} onActionsChange={gameLibraryView === "list" ? undefined : setGameActionsVisible} actionLabels={{ showActions: t("games_show_options"), hideActions: t("games_hide_options") }} />
                      <div className="seasons-section__label">{libraryCountLabel}</div>
                      <MovieLibraryItems view={gameLibraryView} actionsVisible={gameActionsVisible}>
                        {filteredGameOptions.map(game => {
                          const markKey = mediaMarkKey("game", game.relativePath);
                          const gameMarks = mediaMarks[markKey] || {};
                          const isWatched = Boolean(gameMarks.watched);
                          const isFavorite = Boolean(gameMarks.favorite);
                          return <GameLibraryCard key={game.relativePath} game={game}
                            onOpen={() => handleOpenGameDetails(game.relativePath)}
                            label={`${t("movie_details")}: ${game.name || game.file}`}>
                          <div className="movie-library__info">
                            <h2><button className="games-library__title" type="button" onClick={() => handleOpenGameDetails(game.relativePath)}>{game.name || game.file}</button></h2>
                            <div className="movie-library__meta"><span>{gameYear(game) || "—"}</span><span>{gameRating(game) ? `★ ${gameRating(game)}` : "—"}</span></div>
                              <div className="movie-library__actions-reveal" inert={gameLibraryView !== "list" && !gameActionsVisible} aria-hidden={gameLibraryView !== "list" && !gameActionsVisible}>
                                <div className="movie-library__actions-clip">
                                  <div className="movie-library__actions movie-library__actions--icons">
                                    <button
                                      className={`movie-watched${isWatched ? " is-watched" : ""}`}
                                      type="button"
                                      onClick={() => saveMarks({ ...mediaMarks, [markKey]: { ...gameMarks, watched: !isWatched } })}
                                      aria-pressed={isWatched}
                                      aria-label={`${t(isWatched ? "mark_watched" : "mark_unwatched")}: ${game.name || game.file}`}
                                      title={t(isWatched ? "mark_watched" : "mark_unwatched")}
                                    >
                                      <MediaMarkIcon active={isWatched} />
                                    </button>
                                    <button
                                      className={`movie-favorite${isFavorite ? " is-favorite" : ""}`}
                                      type="button"
                                      onClick={() => saveMarks({ ...mediaMarks, [markKey]: { ...gameMarks, favorite: !isFavorite } })}
                                      aria-pressed={isFavorite}
                                      aria-label={`${t(isFavorite ? "mark_favorite" : "mark_not_favorite")}: ${game.name || game.file}`}
                                      title={t(isFavorite ? "movie_favorite_remove" : "movie_favorite_add")}
                                    >
                                      <MediaMarkIcon favorite active={isFavorite} />
                                    </button>
                                    <MovieDownload url={getGameDownloadUrl(game.relativePath)} name={game.file || game.name} label={t("movie_download")} />
                                    <button
                                      className="media-delete-button movie-library__delete"
                                      type="button"
                                      onClick={() => handleDeleteGame(game)}
                                      aria-label={`${t("delete_media", { media: t("media_games_singular") })}: ${game.name || game.file}`}
                                      title={t("delete_media", { media: t("media_games_singular") })}
                                    >
                                      <img src={deleteIcon} alt="" aria-hidden="true" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                          </div>
                        </GameLibraryCard>;
                        })}
                      </MovieLibraryItems>
                      {!filteredGameOptions.length && <p className="games-library__empty">{t("games_empty_title")}</p>}
                    </section>}
                  {selectedGame && filteredGameOptions.some(game => game.relativePath === selectedGame.relativePath) ? (
                    <GameDetails key={selectedGame.relativePath} game={selectedGame} t={t} language={raspberryLanguage}
                      headerControls
                      onBack={handleBackToGameLibrary} onEdit={handleOpenCustomization}
                      onDelete={() => handleDeleteGame(selectedGame)}
                      onPlay={handlePlayGame} onPlayInBrowser={handlePlayGameInBrowser}
                      playing={raspberryControlsBusy}
                      browserSupported={WEB_EMULATOR_SYSTEMS.has(systemForGame(selectedGame)?.id || selectedSystemId)}
                      onRefresh={async () => setVideos(await getVideos())} />
                  ) : null}
                    <a className="console-credits" href="https://github.com/Siddy212/iconic-es-de#acknowledgments" target="_blank" rel="noreferrer">Iconic · Siddy212 &amp; artists · CC BY-NC-SA · Credits</a>
                  </>
                ) : isLibraryEmpty ? (
                  <section className="empty-state seasons-section">
                    {!isMediaDetail ? <div className="seasons-section__label">{libraryCountLabel}</div> : null}
                    <div className="empty-state__card empty-state__card--library">
                      <h2>{emptyTitle}</h2>
                      <img
                        className="empty-state__image"
                        src={emptyStateIcon}
                        alt=""
                        aria-hidden="true"
                      />
                      <p>
                        {isMoviesMode
                          ? t("empty_library_movies_copy")
                          : t("empty_library_series_copy")}
                      </p>
                      <button
                        className="empty-state__action empty-state__action--uploads"
                        onClick={() => handleOpenUploadsForMedia(activeMediaType)}
                        type="button"
                      >
                        <img
                          className="empty-state__action-icon"
                          src={uploadsIconBlack}
                          alt=""
                          aria-hidden="true"
                        />
                        {t("go_to_uploads")}
                      </button>
                    </div>
                  </section>
                ) : isSeriesMode && !selectedSeries ? (
                  <section className="movie-library seasons-section">
                    <div className="seasons-section__label">{libraryCountLabel}</div>
                    <div className={`movie-library__items movie-library__items--${seriesLibraryView}`}>
                      {filteredSeriesOptions.map((series) => {
                        const poster = series.posterImage;
                        const year = series.firstAirDate?.slice(0, 4) || t("not_available");
                        const rating = Number(series.voteAverage) > 0 ? `${(series.voteAverage / 2).toFixed(1)} / 5` : t("not_available");
                        return (
                          <article className="movie-library__card" key={series.directoryPath}>
                            <button className="movie-library__poster" type="button" onClick={() => handleOpenSeriesDetails(series.directoryPath)} aria-label={`${t("movie_details")}: ${series.name}`}>
                              <LibraryPoster src={poster} name={series.name} />
                            </button>
                            <div className="movie-library__info">
                              <h2>{series.name}</h2>
                              <div className="movie-library__meta"><span>{year}</span><span>★ {rating}</span></div>
                              <dl className="series-library__stats">
                                <div title={t("seasons_label")}>
                                  <dt>{t("series_stats_seasons")}</dt>
                                  <dd>{series.seasonCount ?? "—"}</dd>
                                </div>
                                <div>
                                  <dt>{t("chapters_summary")}</dt>
                                  <dd>{series.episodeCount ?? "—"}</dd>
                                </div>
                                <div title={t(series.totalRuntimeMinutes == null ? "not_available" : series.runtimeIsEstimated ? "series_runtime_estimated" : "duration")}>
                                  <dt>{t("series_stats_hours")}</dt>
                                  <dd>{series.totalRuntimeMinutes == null ? "—" : `${series.runtimeIsEstimated ? "≈ " : ""}${new Intl.NumberFormat(normalizeRaspberryLanguage(raspberryLanguage), { maximumFractionDigits: 1 }).format(series.totalRuntimeMinutes / 60)}`}</dd>
                                </div>
                              </dl>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ) : isSeriesMode && detailLoading ? (
                  <section className="empty-state" aria-busy="true" role="status" aria-live="polite">
                    <div className="empty-state__card empty-state__card--library">
                      <div className="library-loading__spinner" aria-hidden="true"><span /><span /><span /></div>
                      <h2>{t("loading_seasons")}</h2>
                    </div>
                  </section>
                ) : isSeriesMode && detailError ? (
                  <section className="empty-state" role="alert">
                    <div className="empty-state__card empty-state__card--library">
                      <h2>{t("seasons_load_error")}</h2>
                      <p>{detailError}</p>
                      <button type="button" onClick={() => setDetailRetry(value => value + 1)}>{t("retry_load")}</button>
                    </div>
                  </section>
                ) : isSeriesMode && !seasons.length ? (
                  <section className="empty-state">
                    <ImdbRating kind="tv" tmdbId={selectedSeries.id} language={raspberryLanguage} />
                    <div className="empty-state__card">
                      <h2>{emptyTitle}</h2>
                      <p>{emptyDescription}</p>
                    </div>
                    <MediaCredits mediaType="tv" tmdbId={selectedSeries.id} language={raspberryLanguage} creators={selectedSeries.creators} />
                  </section>
                ) : isSeriesMode ? (
                  <section className="seasons-section">
                    <ImdbRating kind="tv" tmdbId={selectedSeries.id} language={raspberryLanguage} />
                    <div className="seasons-section__label">
                      {`${seasons.length} ${t("seasons_label")} (${selectedSeries?.episodeCount || 0} ${t("chapters_summary")})`}
                    </div>
                    <div className={`season-grid${seasons.length === 1 ? " season-grid--single" : ""}`}>
                      {seasons.map((season) => (
                        <SeasonCard
                          key={season.id}
                          season={season}
                          isActive={season.id === selectedSeasonId}
                          disabled={!isSeasonUploaded(season, uploadedEpisodeIds)}
                          onSelect={handleOpenSeason}
                          onDelete={handleDeleteSeason}
                          showDelete
                          t={t}
                        />
                      ))}
                    </div>
                    <MediaCredits mediaType="tv" tmdbId={selectedSeries.id} language={raspberryLanguage} creators={selectedSeries.creators} />
                  </section>
                ) : isMoviesMode && !selectedMovie ? (
                  <section className="movie-library seasons-section library-with-scroll-rail">
                    <LibraryScrollRail labels={filteredMovieOptions.map(item => libraryScrollLabel(item, movieLibrarySort, normalizeRaspberryLanguage(raspberryLanguage)))} language={raspberryLanguage} sort={movieLibrarySort} direction={movieSortDirection} onDirectionChange={setMovieSortDirection} actionsVisible={movieActionsVisible} onActionsChange={movieLibraryView === "list" ? undefined : setMovieActionsVisible} />
                    <div className="seasons-section__label">{libraryCountLabel}</div>
                    <MovieLibraryItems view={movieLibraryView} actionsVisible={movieActionsVisible}>
                      {filteredMovieOptions.map((movie) => {
                        const downloadUrl = getMovieDownloadUrl(movie);
                        const awards = movieLibraryView === "grid" ? movieAwards(getMovieTmdbId(movie), raspberryLanguage) : [];
                        const markKey = mediaMarkKey("movie", movie.id);
                        const movieMarks = mediaMarks[markKey] || {};
                        const isFavorite = Boolean(movieMarks.favorite);
                        const isWatched = Boolean(movieMarks.watched);
                        const poster = movie.posterImage || movie.imageOptions?.[1] || movie.heroImage || cartellLogo;
                        const year = movie.releaseDate?.slice(0, 4) || t("not_available");
                        const rating = Number(movie.voteAverage) > 0 ? `${(movie.voteAverage / 2).toFixed(1)} / 5` : t("not_available");
                        return (
                          <article data-library-index className="movie-library__card" key={movie.id}>
                            <button className="movie-library__poster" type="button" onClick={() => handleOpenMovieDetails(movie.id)} aria-label={[`${t("movie_details")}: ${movie.name}`, ...awards.map(award => award.label)].join(" · ")}>
                              <LibraryPoster src={poster} name={movie.name} />
                              <MovieAwardBadges awards={awards} />
                            </button>
                            <div className="movie-library__info">
                              <h2>{movie.name}</h2>
                              <div className="movie-library__meta"><span>{year}</span><span>★ {rating}</span></div>
                              <div className="movie-library__actions-reveal" inert={movieLibraryView !== "list" && !movieActionsVisible} aria-hidden={movieLibraryView !== "list" && !movieActionsVisible}>
                                <div className="movie-library__actions-clip">
                                  <div className="movie-library__actions movie-library__actions--icons">
                                    <button
                                      className={`movie-watched${isWatched ? " is-watched" : ""}`}
                                      type="button"
                                      onClick={() => saveMarks({ ...mediaMarks, [markKey]: { ...movieMarks, watched: !isWatched } })}
                                      aria-pressed={isWatched}
                                      aria-label={`${t(isWatched ? "mark_watched" : "mark_unwatched")}: ${movie.name}`}
                                      title={t(isWatched ? "mark_watched" : "mark_unwatched")}
                                    >
                                      <MediaMarkIcon active={isWatched} />
                                    </button>
                                    <button
                                      className={`movie-favorite${isFavorite ? " is-favorite" : ""}`}
                                      type="button"
                                      onClick={() => setMovieFavoriteConfirmation({ id: movie.id, name: movie.name, favorite: !isFavorite })}
                                      aria-pressed={isFavorite}
                                      aria-label={`${t(isFavorite ? "mark_favorite" : "mark_not_favorite")}: ${movie.name}`}
                                      title={t(isFavorite ? "movie_favorite_remove" : "movie_favorite_add")}
                                    >
                                      <MediaMarkIcon favorite active={isFavorite} />
                                    </button>
                                    <MovieDownload url={downloadUrl} name={movie.fileName || movie.name} label={t("movie_download")} />
                                    <button
                                      className="media-delete-button movie-library__delete"
                                      type="button"
                                      onClick={() => handleDeleteSeries(false, movie)}
                                      aria-label={`${t("delete_media", { media: t("media_movies_singular") })}: ${movie.name}`}
                                      title={t("delete_media", { media: t("media_movies_singular") })}
                                    >
                                      <img src={deleteIcon} alt="" aria-hidden="true" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </MovieLibraryItems>
                  </section>
                ) : (
                  <section className="movie-panel seasons-section">
                    <div className="seasons-section__label">{t("movie_file_label")}</div>
                    <div className="movie-panel__card">
                      <div className="movie-panel__file-actions">
                      {getMovieDownloadUrl(selectedMovie) ? (
                        <MovieDownload url={getMovieDownloadUrl(selectedMovie)} name={selectedMovie.fileName || selectedMovie.name} label={t("movie_download")} />
                      ) : null}
                      <button
                        className="media-delete-button media-delete-button--movie"
                        onClick={() => handleDeleteSeries()}
                        type="button"
                        aria-label={t("delete_media", { media: t("media_movies_singular") })}
                        title={t("delete_media", { media: t("media_movies_singular") })}
                      >
                        <img src={deleteIcon} alt="" aria-hidden="true" />
                      </button>
                      </div>
                      <button
                        className="movie-panel__play"
                        onClick={() => handlePlayMovie("minitv")}
                        type="button"
                        disabled={moviePlaying}
                      >
                        <span className="playback-action__play-icon playback-action__play-icon--light" aria-hidden="true">▶</span>
                        <span>{moviePlaying ? t("playing_now") : t("play_on_tv")}</span>
                      </button>
                      <button
                        className="movie-panel__play movie-panel__play--browser"
                        onClick={handlePlayMovieInBrowser}
                        type="button"
                      >
                        <span className="playback-action__play-icon" aria-hidden="true">▶</span>
                        <span>{t("play_in_browser")}</span>
                      </button>
                      <button
                        className="movie-panel__play movie-panel__play--external"
                        onClick={() => handlePlayMovie("external")}
                        type="button"
                        disabled={moviePlaying}
                      >
                        <span className="playback-action__play-icon" aria-hidden="true">▶</span>
                        <span>{t("play_on_external_monitor")}</span>
                      </button>

                      <MovieSubtitleDownload key={`subtitles-${selectedMovie.fileRelativePath || selectedMovie.id}`}
                        relativePath={selectedMovie.fileRelativePath || resolvePlayableMovieEntry(selectedMovie)?.relativePath}
                        language={raspberryLanguage} onConfigure={handleOpenSubtitleSettings} />

                      {raspberryHealth.running && raspberryHealth.file === (resolvePlayableMovieEntry(selectedMovie)?.relativePath || selectedMovie.fileRelativePath) ? (
                        <PlaybackSubtitleControls playbackKey={raspberryHealth.file} t={t} />
                      ) : null}

                      <MovieImageCarousel
                        title={selectedMovie.name}
                        images={movieImages}
                        activeIndex={safeMovieFrameIndex}
                        onSelect={setMovieFrameIndex}
                        onPrevious={() =>
                          setMovieFrameIndex((current) =>
                            movieImages.length
                              ? (current - 1 + movieImages.length) % movieImages.length
                              : 0
                          )
                        }
                        onNext={() =>
                          setMovieFrameIndex((current) =>
                            movieImages.length ? (current + 1) % movieImages.length : 0
                          )
                        }
                        t={t}
                      />

                      <div className="movie-panel__content">
                        <div className="movie-panel__header">
                          <h2>{selectedMovie.name}</h2>
                          {selectedMovie.originalName &&
                          selectedMovie.originalName !== selectedMovie.name ? (
                            <p>{selectedMovie.originalName}</p>
                          ) : null}
                        </div>

                        <div className="movie-panel__facts">
                          <div className="movie-panel__fact">
                            <strong>{t("release")}</strong>
                            <span>
                              {selectedMovie.releaseDate || t("release_unknown")}
                            </span>
                          </div>
                          <div className="movie-panel__fact">
                            <strong>{t("duration")}</strong>
                            <span>
                              {selectedMovie.runtime
                                ? formatMovieRuntime(selectedMovie.runtime, t)
                                : t("duration_unknown")}
                            </span>
                          </div>
                          <div className="movie-panel__fact">
                            <strong>{t("rating")}</strong>
                            {typeof selectedMovie.voteAverage === "number" &&
                            selectedMovie.voteAverage > 0 ? (
                              <div className="movie-panel__rating">
                                <span>{(selectedMovie.voteAverage / 2).toFixed(1)} / 5</span>
                                <RatingStars rating={selectedMovie.voteAverage} />
                              </div>
                            ) : (
                              <span>{t("tmdb_rating_missing")}</span>
                            )}
                          </div>
                          <div className="movie-panel__fact">
                            <strong>{t("genres")}</strong>
                            <span>
                              {selectedMovie.genres?.length
                                ? selectedMovie.genres.join(" · ")
                                : t("not_available")}
                            </span>
                          </div>
                          <div className="movie-panel__fact movie-panel__fact--imdb">
                            <strong>IMDb</strong>
                            {selectedMovie.imdbUrl ? (
                              <a href={selectedMovie.imdbUrl} target="_blank" rel="noreferrer">
                                <span className="imdb-icon" aria-hidden="true">IMDb</span>
                                <span>{t("imdb_link")}</span>
                              </a>
                            ) : (
                              <span>{t("imdb_no_link")}</span>
                            )}
                          </div>
                          <div className="movie-panel__fact movie-panel__fact--external">
                            <strong>Rotten Tomatoes</strong>
                            {selectedMovie.rottenTomatoesUrl ? (
                              <a href={selectedMovie.rottenTomatoesUrl} target="_blank" rel="noreferrer">
                                <span className="rotten-tomatoes-icon" aria-hidden="true">RT</span>
                                <span>{t("rotten_tomatoes_link")}</span>
                              </a>
                            ) : (
                              <span>{t("rotten_tomatoes_no_link")}</span>
                            )}
                          </div>
                        </div>

                        <ImdbRating kind="movie" tmdbId={selectedMovie.tmdbId} imdbUrl={selectedMovie.imdbUrl} language={raspberryLanguage} />
                        <div className="movie-panel__overview">
                          <strong>{t("synopsis")}</strong>
                          <p>{selectedMovie.overview || t("synopsis_unavailable")}</p>
                        </div>
                        <MediaCredits mediaType="movie" tmdbId={selectedMovie.tmdbId} language={raspberryLanguage} />
                      </div>
                    </div>
                  </section>
                )}
              </>
            )}

            {activeMediaType === "books" ? null : activeMediaType === "games" ? (
              <GameSettingsModal
                visible={settingsOpen}
                game={selectedGame}
                onClose={() => setSettingsOpen(false)}
                onSave={handleSaveGameSettings}
                t={t}
              />
            ) : (
              <SettingsModal
                visible={settingsOpen}
                mediaType={activeMediaType}
                language={raspberryLanguage}
                movieRelativePath={activeMediaType === "movies" && selectedMovie ? selectedMovie.fileRelativePath || resolvePlayableMovieEntry(selectedMovie)?.relativePath : ""}
                onConfigureSubtitles={handleOpenSubtitleSettings}
                item={selectedItem}
                imageOptions={selectedItem?.imageOptions || []}
                onClose={() => setSettingsOpen(false)}
                onSave={handleSaveSeriesSettings}
                onDelete={() => handleDeleteSeries(true)}
                t={t}
              />
            )}

            <AddMediaModal
              visible={addSeriesOpen || uploadLookupOpen}
              mediaType={uploadLookupOpen ? uploadMediaType : activeMediaType}
              initialQuery={uploadLookupOpen ? uploadLookupQuery : ""}
              autoSearch={uploadLookupOpen}
              uploadFileName={
                uploadLookupOpen
                  ? uploadMediaType === "movies"
                    ? uploadSelectedFiles[0]?.name || ""
                    : `${uploadDirectoryName || uploadLookupQuery} · ${uploadSelectedFiles.length} ${t("episodes")}`
                  : ""
              }
              uploadProgress={uploadProgress}
              onClose={handleCloseUploadDialog}
              onCancelUpload={handleCancelActiveUpload}
              onAdd={(item) =>
                handleAddMediaItem(item, uploadLookupOpen ? uploadMediaType : activeMediaType)
              }
              t={t}
              tmdbLanguage={tmdbLanguage}
            />
            <SeriesDuplicateModal
              mediaType={seriesDuplicatePrompt?.mediaType}
              duplicateCount={seriesDuplicatePrompt?.duplicateCount || 0}
              totalCount={seriesDuplicatePrompt?.totalCount || 0}
              onChoose={chooseSeriesDuplicateAction}
              t={t}
            />
            <GameUploadModal
              initialSystemId={selectedSystemId}
              visible={gameLookupOpen}
              file={gameUploadFile}
              initialQuery={gameUploadQuery}
              uploadProgress={uploadProgress}
              onClose={handleCloseGameUploadDialog}
              onCancelUpload={handleCancelActiveUpload}
              onUpload={handleUploadGameSelection}
              t={t}
            />
            <BookUploadProgressModal
              upload={bookUploadDialog}
              onCancel={handleCancelBookUpload}
              onClose={handleCloseBookUpload}
              t={t}
            />
            <TmdbUploadProgress upload={tmdbUpload} onClose={() => setTmdbUpload(null)} onReady={() => {
              clearLocalMetadataCache();
              detailCache.current.clear();
              seasonCache.current.clear(); readySeasons.current.clear(); episodeCache.current.clear();
              setVideos(current => current ? { ...current } : current);
              setDetailRetry(value => value + 1);
            }} />
            <UploadValidationModal
              visible={Boolean(uploadValidationError)}
              title={uploadValidationError?.title || ""}
              message={uploadValidationError?.message || ""}
              onClose={() => setUploadValidationError(null)}
              t={t}
            />
            {openBook ? (openBook.format === "epub" ? <EpubReader key={`${openBook.context.userId}:${openBook.relativePath}`} book={openBook} initialProgress={openBook.context.initialProgress} onProgress={openBook.context.onProgress} onClose={() => setOpenBook(null)} /> : <BookReader key={`${openBook.context.userId}:${openBook.relativePath}`} book={openBook} initialProgress={openBook.context.initialProgress} onProgress={openBook.context.onProgress} onClose={() => setOpenBook(null)} />) : null}
            <ResumeDialog request={resumeRequest} onChoose={chooseResume} language={raspberryLanguage} />
            <BookOpenModal
              book={bookOpenTarget}
              busy={bookOpenBusy}
              onClose={() => setBookOpenTarget(null)}
              onOpenBrowser={handleOpenBookInBrowser}
              onOpenRaspberry={handleOpenBookOnRaspberry}
              t={t}
            />
            <BookMetadataModal
              BookCover={BookCover}
              book={bookMetadataTarget}
              language={normalizeRaspberryLanguage(raspberryLanguage)}
              onClose={() => setBookMetadataTarget(null)}
              onSave={handleSaveBookMetadata}
              onDelete={(book) => { setBookMetadataTarget(null); handleDeleteBook(book); }}
            />
            <BookCollectionModal
              collection={bookCollectionTarget}
              language={raspberryLanguage}
              onClose={() => setBookCollectionTarget(null)}
              onSave={handleSaveBookCollection}
              onDelete={handleDeleteBookCollection}
            />
            <DeleteConfirmModal
              confirmation={deleteConfirmation}
              onClose={() => setDeleteConfirmation(null)}
              t={t}
            />
            {movieFavoriteConfirmation ? (
              <MovieFavoriteConfirmModal
                confirmation={movieFavoriteConfirmation}
                onClose={() => setMovieFavoriteConfirmation(null)}
                onConfirm={confirmMovieFavorite}
                t={t}
              />
            ) : null}
            <TmdbBrowserModal
              visible={tmdbBrowserOpen}
              onClose={() => setTmdbBrowserOpen(false)}
              t={t}
              tmdbLanguage={tmdbLanguage}
              initialMediaType={uploadMediaType === "movies" ? "movies" : "series"}
              initialMovie={torrentInitialMovie}
              onTorrentStarted={torrentDownloads.refresh}
              onTorrentDashboard={() => { setTmdbBrowserOpen(false); setCurrentView("raspberry"); setRaspberryTab("dashboard"); }}
            />
            <EpisodeDetailsModal
              loading={episodeLoading}
              error={episodeError}
              onRetry={() => setEpisodeRetry(value => value + 1)}
              favorite={mediaMarks[mediaMarkKey("video", resolveUploadedEpisodePath(selectedSeason, selectedEpisode))]?.favorite}
              onFavorite={value => { const key = mediaMarkKey("video", resolveUploadedEpisodePath(selectedSeason, selectedEpisode)); saveMarks({ ...mediaMarks, [key]: { ...mediaMarks[key], favorite: value } }); }}
              watched={episodeWatched(mediaMarks, selectedSeasonMarkKey(), selectedEpisode?.episodeNumber)}
              onWatched={(value) => saveMarks(markEpisode(mediaMarks, selectedSeasonMarkKey(), selectedEpisode.episodeNumber, value))}
              visible={episodeDialogOpen}
              episode={selectedEpisode}
              season={selectedSeason}
              seriesName={selectedSeries?.name || ""}
              playing={episodePlaying}
              available={isEpisodeUploaded(selectedSeason, selectedEpisode, uploadedEpisodeIds)}
              onClose={handleCloseEpisodeDetails}
              onPlay={() => handlePlayEpisode("minitv")}
              onPlayBrowser={handlePlayEpisodeInBrowser}
              onPlayExternal={() => handlePlayEpisode("external")}
              downloadUrl={getEpisodeDownloadUrl(selectedSeason, selectedEpisode)}
              downloadName={resolveUploadedEpisodePath(selectedSeason, selectedEpisode).split("/").pop() || undefined}
              onDelete={handleDeleteEpisode}
              t={t}
            />
            <BrowserPlayerModal
              playback={browserPlayback}
              onClose={() => setBrowserPlayback(null)}
              t={t}
            />
            <BrowserGameModal
              game={browserGame}
              onClose={() => setBrowserGame(null)}
              t={t}
            />
          </>
        )}
      </div>
      {bookTorrentTarget && <BookTorrentModal key={bookTorrentTarget.key} winner={bookTorrentTarget} language={raspberryLanguage} onClose={() => setBookTorrentTarget(null)}
        onStarted={torrentDownloads.refresh} onDashboard={() => { setBookTorrentTarget(null); setCurrentView("raspberry"); setRaspberryTab("dashboard"); }} />}
      {unlocked && currentView !== "raspberry" && !isOscarView && !isBookAwardView && !loading && !tmdbLoading ? <BackToTop language={raspberryLanguage} /> : null}
    </main>
  );
}
