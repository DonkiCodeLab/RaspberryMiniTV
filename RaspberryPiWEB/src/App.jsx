import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import cartellMask from "./assets/cartell_base_black_mask.png";
import cartellLogo from "./assets/cartell_logo.png";
import cloudsBackground from "./assets/cloud.gif";
import deleteIcon from "./assets/delete.png";
import emptyStateIcon from "./assets/empty.png";
import controlsIconBlack from "./assets/icon_conrtols_black.png";
import controlsIconYellow from "./assets/icon_conrtols_yelllow.png";
import alarmIcon from "./assets/icon_alarm.png";
import dashboardIconBlack from "./assets/icon_dashboard_black.png";
import dashboardIconYellow from "./assets/icon_dashboard_yellow.png";
import gameIconBlack from "./assets/icon_game_black.png";
import gameIconWhite from "./assets/icon_game_white.png";
import gameIconYellow from "./assets/icon_game_yellow.png";
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
import refreshWhiteIcon from "./assets/refresh_white.png";
import refreshYellowIcon from "./assets/refresh_yellow.png";
import screenOffIcon from "./assets/screen_off.png";
import uploadsIconBlack from "./assets/icon_uploads_black.png";
import uploadsIconYellow from "./assets/icon_uploads_yellow.png";
import saveIcon from "./assets/save.png";
import sdacrdIcon from "./assets/sdacrd.png";
import settingsIcon from "./assets/settings_icon.png";
import tvshowIconBlack from "./assets/icon_tvshow_black.png";
import tvshowIconWhite from "./assets/icon_tvshow_white.png";
import tvshowIconYellow from "./assets/icon_tvshow_yellow.png";
import tvGreen from "./assets/tele_green_2_fixed.png";
import uploadDropzoneWhite from "./assets/upload_drag&drop_zone_white.png";
import uploadDropzoneYellow from "./assets/upload_drag&drop_zone_yellow.png";
import {
  addSeries,
  authWebPin,
  getAlarmSoundUrl,
  getHealth,
  getRaspberryAlarms,
  getRaspberryLanguage,
  getStoredWebPin,
  powerOffRaspberry,
  getVideos,
  isMockMode,
  playEpisode,
  removeMovieFile,
  removeSeries,
  searchGameMetadata,
  saveMediaProfile,
  setStoredWebPin,
  stopPlayback,
  updateRaspberryAlarms,
  updateRaspberryLanguage,
  uploadGameFile,
  uploadMovieFile,
  uploadSeriesFiles,
  volumeDown,
  volumeUp,
} from "./api/raspberryApi";
import {
  loadMediaLibrary,
  removeMediaLibraryItem,
  saveMediaLibrary,
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
  getTvSeriesById,
  resolveSeriesFromNames,
  searchMovies,
  searchTvSeries,
} from "./tmdbApi";

const HERO_SLIDER_MAX = 0.96;
const MAX_MOVIE_IMAGES = 5;
const RASPBERRY_ALARM_STORAGE_KEY = "simpsonstv-raspberry-alarm-v1";
const RASPBERRY_LANGUAGE_STORAGE_KEY = "simpsonstv-raspberry-language-v1";
const RASPBERRY_CURRENT_PLAYBACK_STORAGE_KEY = "simpsonstv-raspberry-current-playback-v1";
const MEDIA_TYPES = [
  {
    id: "series",
    labelKey: "media_series",
    activeIcon: tvshowIconBlack,
    inactiveIcon: tvshowIconYellow,
  },
  {
    id: "movies",
    labelKey: "media_movies",
    activeIcon: movieIconBlack,
    inactiveIcon: movieIconYellow,
  },
  {
    id: "games",
    labelKey: "media_games",
    activeIcon: gameIconBlack,
    inactiveIcon: gameIconYellow,
  },
];
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
];
const UPLOAD_MEDIA_OPTIONS = [
  { key: "series", value: "series", labelKey: "upload_series" },
  { key: "movies", value: "movies", labelKey: "upload_movie" },
  { key: "games", value: "games", labelKey: "upload_game" },
];
const GAME_ROM_EXTENSIONS = new Set(["gb", "gbc", "gba"]);
const GAME_PLATFORM_LABELS = {
  gb: "Game Boy",
  gbc: "Game Boy Color",
  gba: "Game Boy Advance",
};
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
    media_series_singular: "serie",
    media_movies_singular: "película",
    media_games_singular: "juego",
    raspberry_dashboard: "Dashboard",
    raspberry_controls: "Controls",
    raspberry_uploads: "Uploads",
    upload_series: "Serie",
    upload_movie: "Película",
    upload_game: "Juego",
    language_spanish: "Castellano",
    language_catalan: "Català",
    language_english: "English",
    back: "Volver",
    episode_label: "Capítulo",
    episodes: "capítulos",
    prev_image: "Imagen anterior",
    next_image: "Imagen siguiente",
    image_gallery: "Galería de imágenes",
    go_to_image: "Ir a la imagen {index}",
    no_images_available: "Sin imágenes disponibles",
    close: "Cerrar",
    not_available: "No disponible",
    play_on_tv: "Reproducir en miniTV",
    playing_now: "Reproduciendo...",
    synopsis_unavailable: "Sinopsis no disponible.",
    games_reserved: "Esta sección de customización todavía no tiene acciones disponibles.",
    mini_tv_title: "Mini-tele",
    mini_tv_config: "Configuración",
    mini_tv_copy: "Este diálogo queda preparado para configurar la mini-tele de la cabecera. En la siguiente iteración conectamos las opciones reales.",
    done_close: "Cerrar",
    settings_of: "Ajustes de la {media}",
    visible_name: "Nombre visible",
    image_header: "Imagen de cabecera",
    poster_preview: "Vista previa del cartel",
    vertical_position: "Posición vertical del cartel",
    confirm_delete: "¿Seguro que quieres eliminar la {media} \"{name}\"?",
    confirm_delete_title: "Eliminar {media}",
    delete_media: "Eliminar {media}",
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
    raspberry_tv_alt: "Raspberry Simpsons TV",
    raspberry_sections: "Secciones de Raspberry",
    stats_series_installed: "Series instaladas",
    stats_movies_installed: "Películas instaladas",
    stats_games_installed: "Juegos instalados",
    section_storage_used: "{gb} GB · {percent} utilizado de multimedia",
    used_percent: "{percent} utilizado",
    language_title: "Idioma",
    language_microtv: "Selecciona el idioma de la mini tele.",
    language_updating: "Actualizando idioma...",
    language_update_failed: "No se pudo actualizar el idioma de la Raspberry.",
    microsd_capacity: "Capacidad de la MicroSD",
    multimedia_occupied: "Ocupado por MultimediaContent",
    occupied: "ocupado",
    alarms_title: "Alarmas de la televisión",
    alarms_copy: "Programa la hora a la que debe sonar la alarma de la mini tele.",
    alarm_item: "Alarma {index}",
    alarm_sound_select: "Sonido de la alarma {index}",
    alarm_preview_select: "Sonido para probar",
    no_alarm_sounds: "No hay sonidos disponibles",
    on: "On",
    off: "Off",
    playback_current: "Reproducción actual",
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
    upload_game_dropzone_copy: "Acepta ROMs .gb, .gbc y .gba. Después podrás buscar carátula y ficha antes de subir.",
    latest_detection: "Última detección",
    games: "Juegos",
    upload_games_pending: "La subida guiada para juegos queda preparada visualmente y la conectamos en la siguiente iteración.",
    games_empty_title: "Sin juegos instalados",
    games_empty_copy: "Sube una ROM de Game Boy, Game Boy Color o Game Boy Advance para crear tu biblioteca.",
    games_upload_title: "Ficha del juego",
    games_search_placeholder: "Ejemplo: Tetris DX",
    games_default_cover: "Default",
    games_manual_profile: "Ficha manual con carátula por defecto",
    games_cover_picker: "Carátula",
    games_no_results: "No se han encontrado juegos para esa búsqueda.",
    games_search_failed: "No se pudo buscar la ficha del juego.",
    games_api_not_configured: "ScreenScraper no está configurado en la Raspberry. Puedes subirlo con la carátula default.",
    upload_game_invalid_title: "Archivo de juego no compatible",
    upload_game_invalid_copy: "Selecciona un único fichero .gb, .gbc o .gba.",
    upload_game_detected: "{name} detectado como {platform}. Revisa la ficha antes de subir.",
    upload_game_done_summary: "{name} añadido a Games: {path}",
    upload_game_failed: "No se pudo subir el juego.",
    access_protected: "Acceso protegido",
    unlock_copy: "Introduce el PIN numérico de 4 dígitos configurado en la Raspberry.",
    validating: "Validando...",
    show_password: "Mostrar PIN",
    hide_password: "Ocultar PIN",
    enter: "Entrar",
    loading_movies: "Cargando películas...",
    loading_seasons: "Cargando temporadas...",
    loading_movie_copy: "Estoy preparando la portada y los datos TMDB de la película seleccionada.",
    loading_series_copy: "Estoy preparando la portada y la cartelera TMDB de la serie seleccionada.",
    connection_error: "Error de conexión",
    loading_episodes: "Cargando capítulos...",
    reading_season: "Estoy leyendo la temporada seleccionada desde TMDB.",
    add_movie_prompt: "Añade una película desde TMDB con el botón + para empezar esta lista.",
    no_season_info: "No he podido cargar la información de temporadas desde TMDB para la serie seleccionada.",
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
    upload_button: "Upload",
    tmdb_browser_title: "Visualizar ficha en TMDB",
    tmdb_browser_copy:
      "Consulta el contenido de la serie o película en TMDB antes de preparar tus archivos locales, así la carga queda lo más ordenada posible.",
    tmdb_browser_open: "Visualizar TMDB",
    tmdb_browser_preview: "Visualizar",
    tmdb_browser_results: "Resultados TMDB",
    tmdb_browser_select_prompt: "Visualiza un resultado para revisar temporadas, capítulos o datos de la película.",
    tmdb_browser_loading: "Cargando ficha TMDB...",
    tmdb_browser_load_failed: "No se pudo cargar la ficha TMDB.",
    tmdb_browser_search_intro: "Busca una serie o película para ver su ficha aquí.",
    tmdb_browser_season_prompt: "Selecciona una temporada para ver sus capítulos.",
    upload_copying: "Copiando contenido a la Raspberry...",
    upload_done_summary: "{name} añadida a Movies: {path}",
    upload_series_done_summary: "{name} añadida a TVShows: {path}",
    unavailable_season: "Temporada sin capítulos cargados",
    unavailable_episode: "Capítulo no cargado",
    games_in_construction: "Juegos en construcción",
    select_movie: "Seleccionar película",
    select_series: "Seleccionar serie",
    no_movies_available: "Sin películas disponibles",
    no_seasons_available: "Sin series disponibles",
    seasons_label: "TEMPORADAS",
    loading_movie_runtime: "{minutes} minutos",
    tmdb_rating_missing: "Valoración TMDB no disponible",
    movie_file_label: "FICHA DE LA PELÍCULA",
    release: "Estreno",
    duration: "Duración",
    rating: "Valoración",
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
    media_series_singular: "sèrie",
    media_movies_singular: "pel·lícula",
    media_games_singular: "joc",
    raspberry_dashboard: "Dashboard",
    raspberry_controls: "Controls",
    raspberry_uploads: "Uploads",
    upload_series: "Sèrie",
    upload_movie: "Pel·lícula",
    upload_game: "Joc",
    language_spanish: "Castellà",
    language_catalan: "Català",
    language_english: "English",
    back: "Tornar",
    episode_label: "Capítol",
    episodes: "capítols",
    prev_image: "Imatge anterior",
    next_image: "Imatge següent",
    image_gallery: "Galeria d'imatges",
    go_to_image: "Anar a la imatge {index}",
    no_images_available: "No hi ha imatges disponibles",
    close: "Tancar",
    not_available: "No disponible",
    play_on_tv: "Reproduir a miniTV",
    playing_now: "Reproduint...",
    synopsis_unavailable: "Sinopsi no disponible.",
    games_reserved: "Aquesta secció de personalització encara no té accions disponibles.",
    mini_tv_title: "Mini-tele",
    mini_tv_config: "Configuració",
    mini_tv_copy: "Aquest diàleg queda preparat per configurar la mini-tele de la capçalera. A la següent iteració hi connectem les opcions reals.",
    done_close: "Tancar",
    settings_of: "Ajustos de la {media}",
    visible_name: "Nom visible",
    image_header: "Imatge de capçalera",
    poster_preview: "Vista prèvia del cartell",
    vertical_position: "Posició vertical del cartell",
    confirm_delete: "Segur que vols eliminar la {media} \"{name}\"?",
    confirm_delete_title: "Eliminar {media}",
    delete_media: "Eliminar {media}",
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
    raspberry_tv_alt: "Raspberry Simpsons TV",
    raspberry_sections: "Seccions de Raspberry",
    stats_series_installed: "Sèries instal·lades",
    stats_movies_installed: "Pel·lícules instal·lades",
    stats_games_installed: "Jocs instal·lats",
    section_storage_used: "{gb} GB · {percent} utilitzat de multimedia",
    used_percent: "{percent} utilitzat",
    language_title: "Idioma",
    language_microtv: "Selecciona l'idioma de la mini tele.",
    language_updating: "S'està actualitzant l'idioma...",
    language_update_failed: "No s'ha pogut actualitzar l'idioma de la Raspberry.",
    microsd_capacity: "Capacitat de la MicroSD",
    multimedia_occupied: "Ocupat per MultimediaContent",
    occupied: "ocupat",
    alarms_title: "Alarmes de la televisió",
    alarms_copy: "Programa l'hora a la qual ha de sonar l'alarma de la mini tele.",
    alarm_item: "Alarma {index}",
    alarm_sound_select: "So de l'alarma {index}",
    alarm_preview_select: "So per provar",
    no_alarm_sounds: "No hi ha sons disponibles",
    on: "On",
    off: "Off",
    playback_current: "Reproducció actual",
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
    upload_game_dropzone_copy: "Accepta ROMs .gb, .gbc i .gba. Després podràs buscar caràtula i fitxa abans de pujar.",
    latest_detection: "Última detecció",
    games: "Jocs",
    upload_games_pending: "La pujada guiada per a jocs queda preparada visualment i la connectem a la següent iteració.",
    games_empty_title: "Sense jocs instal·lats",
    games_empty_copy: "Puja una ROM de Game Boy, Game Boy Color o Game Boy Advance per crear la biblioteca.",
    games_upload_title: "Fitxa del joc",
    games_search_placeholder: "Exemple: Tetris DX",
    games_default_cover: "Default",
    games_manual_profile: "Fitxa manual amb caràtula per defecte",
    games_cover_picker: "Caràtula",
    games_no_results: "No s'han trobat jocs per a aquesta cerca.",
    games_search_failed: "No s'ha pogut buscar la fitxa del joc.",
    games_api_not_configured: "ScreenScraper no està configurat a la Raspberry. Pots pujar-lo amb la caràtula default.",
    upload_game_invalid_title: "Fitxer de joc no compatible",
    upload_game_invalid_copy: "Selecciona un únic fitxer .gb, .gbc o .gba.",
    upload_game_detected: "{name} detectat com {platform}. Revisa la fitxa abans de pujar.",
    upload_game_done_summary: "{name} afegit a Games: {path}",
    upload_game_failed: "No s'ha pogut pujar el joc.",
    access_protected: "Accés protegit",
    unlock_copy: "Introdueix el PIN numèric de 4 dígits configurat a la Raspberry.",
    validating: "Validant...",
    show_password: "Mostra el PIN",
    hide_password: "Amaga el PIN",
    enter: "Entrar",
    loading_movies: "Carregant pel·lícules...",
    loading_seasons: "Carregant temporades...",
    loading_movie_copy: "Estic preparant la portada i les dades TMDB de la pel·lícula seleccionada.",
    loading_series_copy: "Estic preparant la portada i la cartellera TMDB de la sèrie seleccionada.",
    connection_error: "Error de connexió",
    loading_episodes: "Carregant capítols...",
    reading_season: "Estic llegint la temporada seleccionada des de TMDB.",
    add_movie_prompt: "Afegeix una pel·lícula des de TMDB amb el botó + per començar aquesta llista.",
    no_season_info: "No he pogut carregar la informació de temporades des de TMDB per a la sèrie seleccionada.",
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
    upload_button: "Upload",
    tmdb_browser_title: "Visualitzar fitxa a TMDB",
    tmdb_browser_copy:
      "Consulta el contingut de la sèrie o pel·lícula a TMDB abans de preparar els fitxers locals, així la càrrega queda tan ordenada com sigui possible.",
    tmdb_browser_open: "Visualitzar TMDB",
    tmdb_browser_preview: "Visualitzar",
    tmdb_browser_results: "Resultats TMDB",
    tmdb_browser_select_prompt: "Visualitza un resultat per revisar temporades, capítols o dades de la pel·lícula.",
    tmdb_browser_loading: "Carregant fitxa TMDB...",
    tmdb_browser_load_failed: "No s'ha pogut carregar la fitxa TMDB.",
    tmdb_browser_search_intro: "Cerca una sèrie o pel·lícula per veure'n la fitxa aquí.",
    tmdb_browser_season_prompt: "Selecciona una temporada per veure'n els capítols.",
    upload_copying: "Copiant el contingut a la Raspberry...",
    upload_done_summary: "{name} afegida a Movies: {path}",
    upload_series_done_summary: "{name} afegida a TVShows: {path}",
    unavailable_season: "Temporada sense capítols carregats",
    unavailable_episode: "Capítol no carregat",
    games_in_construction: "Jocs en construcció",
    select_movie: "Seleccionar pel·lícula",
    select_series: "Seleccionar sèrie",
    no_movies_available: "No hi ha pel·lícules disponibles",
    no_seasons_available: "No hi ha temporades disponibles",
    seasons_label: "TEMPORADES",
    loading_movie_runtime: "{minutes} minuts",
    tmdb_rating_missing: "Valoració TMDB no disponible",
    movie_file_label: "FITXA DE LA PEL·LÍCULA",
    release: "Estrena",
    duration: "Durada",
    rating: "Valoració",
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
    media_series_singular: "series",
    media_movies_singular: "movie",
    media_games_singular: "game",
    raspberry_dashboard: "Dashboard",
    raspberry_controls: "Controls",
    raspberry_uploads: "Uploads",
    upload_series: "Series",
    upload_movie: "Movie",
    upload_game: "Game",
    language_spanish: "Spanish",
    language_catalan: "Catalan",
    language_english: "English",
    back: "Back",
    episode_label: "Episode",
    episodes: "episodes",
    prev_image: "Previous image",
    next_image: "Next image",
    image_gallery: "Image gallery",
    go_to_image: "Go to image {index}",
    no_images_available: "No images available",
    close: "Close",
    not_available: "Not available",
    play_on_tv: "Play on miniTV",
    playing_now: "Playing...",
    synopsis_unavailable: "Synopsis unavailable.",
    games_reserved: "This customization section has no actions available yet.",
    mini_tv_title: "Mini TV",
    mini_tv_config: "Settings",
    mini_tv_copy: "This dialog is ready to configure the header mini TV. In the next iteration we will connect the real options.",
    done_close: "Close",
    settings_of: "{media} settings",
    visible_name: "Visible name",
    image_header: "Header image",
    poster_preview: "Poster preview",
    vertical_position: "Poster vertical position",
    confirm_delete: "Are you sure you want to delete the {media} \"{name}\"?",
    confirm_delete_title: "Delete {media}",
    delete_media: "Delete {media}",
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
    raspberry_tv_alt: "Raspberry Simpsons TV",
    raspberry_sections: "Raspberry sections",
    stats_series_installed: "Installed series",
    stats_movies_installed: "Installed movies",
    stats_games_installed: "Installed games",
    section_storage_used: "{gb} GB · {percent} used of multimedia",
    used_percent: "{percent} used",
    language_title: "Language",
    language_microtv: "Choose the mini TV language.",
    language_updating: "Updating language...",
    language_update_failed: "Could not update the Raspberry language.",
    microsd_capacity: "MicroSD capacity",
    multimedia_occupied: "Used by MultimediaContent",
    occupied: "used",
    alarms_title: "TV alarms",
    alarms_copy: "Set the time when the mini TV alarm should ring.",
    alarm_item: "Alarm {index}",
    alarm_sound_select: "Alarm {index} sound",
    alarm_preview_select: "Sound to preview",
    no_alarm_sounds: "No sounds available",
    on: "On",
    off: "Off",
    playback_current: "Current playback",
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
    upload_game_dropzone_copy: "Accepts .gb, .gbc, and .gba ROMs. You can search cover art and metadata before uploading.",
    latest_detection: "Latest detection",
    games: "Games",
    upload_games_pending: "Guided uploads for games are visually prepared and will be connected in the next iteration.",
    games_empty_title: "No games installed",
    games_empty_copy: "Upload a Game Boy, Game Boy Color, or Game Boy Advance ROM to build your library.",
    games_upload_title: "Game profile",
    games_search_placeholder: "Example: Tetris DX",
    games_default_cover: "Default",
    games_manual_profile: "Manual profile with the default cover",
    games_cover_picker: "Cover art",
    games_no_results: "No games were found for that search.",
    games_search_failed: "Could not search the game profile.",
    games_api_not_configured: "ScreenScraper is not configured on the Raspberry. You can upload it with the default cover.",
    upload_game_invalid_title: "Unsupported game file",
    upload_game_invalid_copy: "Select a single .gb, .gbc, or .gba file.",
    upload_game_detected: "{name} detected as {platform}. Review the profile before uploading.",
    upload_game_done_summary: "{name} added to Games: {path}",
    upload_game_failed: "Could not upload the game.",
    access_protected: "Protected access",
    unlock_copy: "Enter the 4-digit numeric PIN configured on the Raspberry.",
    validating: "Validating...",
    show_password: "Show PIN",
    hide_password: "Hide PIN",
    enter: "Enter",
    loading_movies: "Loading movies...",
    loading_seasons: "Loading seasons...",
    loading_movie_copy: "Preparing the cover and TMDB data for the selected movie.",
    loading_series_copy: "Preparing the cover and TMDB lineup for the selected series.",
    connection_error: "Connection error",
    loading_episodes: "Loading episodes...",
    reading_season: "Reading the selected season from TMDB.",
    add_movie_prompt: "Add a movie from TMDB with the + button to start this list.",
    no_season_info: "Could not load TMDB season information for the selected series.",
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
    upload_button: "Upload",
    tmdb_browser_title: "View TMDB details",
    tmdb_browser_copy:
      "Check the series or movie content on TMDB before preparing your local files, so the upload stays as tidy as possible.",
    tmdb_browser_open: "View TMDB",
    tmdb_browser_preview: "View",
    tmdb_browser_results: "TMDB results",
    tmdb_browser_select_prompt: "View a result to review seasons, episodes, or movie details.",
    tmdb_browser_loading: "Loading TMDB details...",
    tmdb_browser_load_failed: "Could not load TMDB details.",
    tmdb_browser_search_intro: "Search for a series or movie to view its details here.",
    tmdb_browser_season_prompt: "Select a season to view its episodes.",
    upload_copying: "Copying content to the Raspberry...",
    upload_done_summary: "{name} added to Movies: {path}",
    upload_series_done_summary: "{name} added to TVShows: {path}",
    unavailable_season: "Season without uploaded episodes",
    unavailable_episode: "Episode not uploaded",
    games_in_construction: "Games under construction",
    select_movie: "Select movie",
    select_series: "Select series",
    no_movies_available: "No movies available",
    no_seasons_available: "No seasons available",
    seasons_label: "SEASONS",
    loading_movie_runtime: "{minutes} minutes",
    tmdb_rating_missing: "TMDB rating unavailable",
    movie_file_label: "MOVIE DETAILS",
    release: "Release",
    duration: "Duration",
    rating: "Rating",
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

function stripFileExtension(value) {
  return String(value || "").replace(/\.[^.]+$/, "");
}

function getFileExtension(fileName) {
  return String(fileName || "").split(".").pop()?.toLowerCase() || "";
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
      .replace(/\bS\d{1,2}E\d{1,2}\b/gi, "")
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
  const episodePattern = /S\d{2}E\d{2}/i;

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

function getRaspberryMovieLibraryItems(videos) {
  const rootFiles = Array.isArray(videos?.movieRootFiles) ? videos.movieRootFiles : [];
  const directoryBuckets = Array.isArray(videos?.movieDirectories) ? videos.movieDirectories : [];
  const entries = [
    ...rootFiles,
    ...directoryBuckets.flatMap((bucket) => (Array.isArray(bucket?.videos) ? bucket.videos : [])),
  ];

  return entries
    .map((entry) => {
      const id = Number(entry?.tmdbId) || 0;
      const fileRelativePath = String(entry?.relativePath || "").trim();
      const fileName = String(entry?.file || "").trim();
      const name = String(entry?.name || stripFileExtension(fileName)).trim();

      return id && name && fileRelativePath
        ? {
            id,
            name,
            fileRelativePath,
            fileName,
          }
        : null;
    })
    .filter(Boolean);
}

function mergeMediaLibraryItems(currentItems, incomingItems) {
  const nextItems = Array.isArray(currentItems) ? [...currentItems] : [];
  let changed = false;

  incomingItems.forEach((incomingItem) => {
    const existingIndex = nextItems.findIndex((item) => Number(item.id) === Number(incomingItem.id));
    if (existingIndex < 0) {
      nextItems.push(incomingItem);
      changed = true;
      return;
    }

    const existingItem = nextItems[existingIndex];
    const mergedItem = {
      ...existingItem,
      ...incomingItem,
      name: existingItem.name || incomingItem.name,
    };
    if (JSON.stringify(existingItem) !== JSON.stringify(mergedItem)) {
      nextItems[existingIndex] = mergedItem;
      changed = true;
    }
  });

  return changed ? nextItems : currentItems;
}

function getRaspberryProfiles(videos, collectionType) {
  const libraryItems = videos?.mediaLibrary?.[collectionType];
  if (!libraryItems || typeof libraryItems !== "object") return {};

  return Object.values(libraryItems).reduce((profiles, item) => {
    if (!item || typeof item !== "object") return profiles;
    const profileKey =
      collectionType === "movies"
        ? String(Number(item.tmdbId) || "").trim()
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
    series: normalizeLibraryUsageItem(counts?.series),
    movies: normalizeLibraryUsageItem(counts?.movies),
    games: normalizeLibraryUsageItem(counts?.games),
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

function HeaderArt({ image, crop, alt }) {
  const usesFullMaskArtwork = image === cartellLogo;

  return (
    <div
      className="series-hero__art"
      style={{
        WebkitMaskImage: `url(${cartellMask})`,
        maskImage: `url(${cartellMask})`,
      }}
      role="img"
      aria-label={alt}
    >
      {usesFullMaskArtwork ? (
        <img
          className="series-hero__full-mask-image"
          src={image}
          alt=""
          aria-hidden="true"
          draggable="false"
          onDragStart={(event) => event.preventDefault()}
        />
      ) : (
        <div className="series-hero__visible-window">
          <img
            src={image}
            alt=""
            aria-hidden="true"
            draggable="false"
            onDragStart={(event) => event.preventDefault()}
            style={getHeaderImageStyle(crop)}
          />
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

function SeasonCard({ season, isActive, disabled, onSelect, t }) {
  return (
    <button
      className={`season-card${isActive ? " active" : ""}${disabled ? " is-disabled" : ""}`}
      onClick={() => {
        if (!disabled) {
          onSelect(season.id);
        }
      }}
      aria-disabled={disabled}
      title={disabled ? t("unavailable_season") : season.title}
      type="button"
    >
      <div className="season-card__image-wrap">
        {season.image ? (
          <img src={season.image} alt={season.title} className="season-card__image" />
        ) : (
          <div className="season-card__fallback">{season.title}</div>
        )}
      </div>
      <div className="season-card__body">
        <h3>{season.title}</h3>
        <p>{`${season.episodeCount} ${t("episodes")}`}</p>
      </div>
    </button>
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
    .match(/^S(\d{2})E(\d{2})$/);

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
    image: episode.image || season?.image || series.heroImage || cartellLogo,
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
    image: movie.heroImage || movie.imageOptions?.[0] || cartellLogo,
    paused: false,
  };
}

function createPlaybackInfoFromHealth({ health, seriesOptions, movieOptions }) {
  const playbackId = String(health?.playing || "").trim().toUpperCase();
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

function EpisodeRow({ episode, available, onSelect, t }) {
  return (
    <button
      className={`episode-card${available ? "" : " is-disabled"}`}
      onClick={() => {
        if (available) {
          onSelect(episode);
        }
      }}
      aria-disabled={!available}
      title={available ? episode.title : t("unavailable_episode")}
      type="button"
    >
      <div className="episode-card__thumb">
        {episode.image ? <img src={episode.image} alt={episode.title} /> : null}
      </div>

      <div className="episode-card__body">
        <h3>
          {episode.episodeNumber}. {episode.title}
        </h3>
        <p>{available ? episode.airDate : t("unavailable_episode")}</p>
      </div>

      <div className="episode-card__arrow">›</div>
    </button>
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
        <img src={currentImage} alt={title} />
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
  available,
  showPlayButton = true,
  onClose,
  onPlay,
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
          <div className="episode-dialog__overview">
            {episode.image ? (
              <div className="episode-dialog__media">
                <img src={episode.image} alt={episode.title} />
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
            <button
              className="episode-dialog__play"
              onClick={onPlay}
              type="button"
              disabled={playing || !available}
            >
              <img src={tvGreen} alt="" aria-hidden="true" />
              <span>{available ? (playing ? t("playing_now") : t("play_on_tv")) : t("unavailable_episode")}</span>
            </button>
          ) : null}

          <div className="episode-dialog__synopsis">
            <strong>{`${t("synopsis")}:`}</strong>
            <p>{episode.synopsis || t("synopsis_unavailable")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ visible, mediaType, item, imageOptions, onClose, onSave, onDelete, t }) {
  const [name, setName] = useState(item?.name || "");
  const [heroImage, setHeroImage] = useState(item?.heroImage || "");
  const [heroImageCrop, setHeroImageCrop] = useState(item?.heroImageCrop || DEFAULT_HERO_CROP);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    setName(item?.name || "");
    setHeroImage(item?.heroImage || imageOptions?.[0] || "");
    setHeroImageCrop(normalizeHeroCrop(item?.heroImageCrop || DEFAULT_HERO_CROP));
    setDeleteConfirmOpen(false);
  }, [item, imageOptions, visible]);

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
    <div className="modal-backdrop" onClick={onClose}>
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
                type="button"
                aria-label={t("delete_media", { media: mediaLabel })}
                title={t("delete_media", { media: mediaLabel })}
              >
                <img className="dialog-card__icon-image" src={deleteIcon} alt="" aria-hidden="true" />
              </button>
              <button
                className="dialog-card__icon-button dialog-card__icon-button--accent"
                onClick={() =>
                  onSave({
                    name,
                    heroImage,
                    heroImageCrop: heroImage ? clampHeroCrop(heroImageCrop) : null,
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
          <label className="dialog-field">
            <span>{t("visible_name")}</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("name_of_media", { media: mediaLabel })}
            />
          </label>

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

function AddMediaModal({
  visible,
  mediaType,
  initialQuery = "",
  autoSearch = false,
  uploadFileName = "",
  uploadProgress = null,
  onClose,
  onAdd,
  t,
  tmdbLanguage,
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults([]);
      setSelectedId(null);
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

    setSubmitting(true);
    setError("");

    try {
      await onAdd(selectedItem);
    } catch (nextError) {
      setError(
        nextError.message ||
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
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
                    onClick={() => setSelectedId(result.id)}
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

        {error ? <p className="dialog-error">{error}</p> : null}

        <div className="dialog-card__actions">
          <button className="dialog-button dialog-button--ghost" onClick={onClose} type="button">
            {t("cancel")}
          </button>
          {uploadProgress !== null ? (
            <div className="upload-progress" role="status" aria-live="polite">
              <div className="upload-progress__copy">
                <strong>{t("upload_copying")}</strong>
                <span>{uploadFileName}</span>
              </div>
              <div className="upload-progress__bar" aria-hidden="true">
                <span style={{ width: `${clamp(Number(uploadProgress) || 0, 0, 100)}%` }} />
              </div>
              <p>{`${clamp(Number(uploadProgress) || 0, 0, 100)}%`}</p>
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
  visible,
  file,
  initialQuery,
  uploadProgress = null,
  onClose,
  onUpload,
  t,
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selectedGameId, setSelectedGameId] = useState("default");
  const [selectedCoverKey, setSelectedCoverKey] = useState("default");
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const extension = getFileExtension(file?.name);
  const platformLabel = GAME_PLATFORM_LABELS[extension] || t("media_games_singular");

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults([]);
      setSelectedGameId("default");
      setSelectedCoverKey("default");
      setSearching(false);
      setSubmitting(false);
      setError("");
      return;
    }
    setQuery(initialQuery || "");
  }, [initialQuery, visible]);

  async function runSearch(searchTerm) {
    const trimmedQuery = String(searchTerm || "").trim();
    if (!trimmedQuery || !file) return;

    setSearching(true);
    setError("");
    try {
      const payload = await searchGameMetadata({ query: trimmedQuery, extension });
      const nextResults = Array.isArray(payload?.results) ? payload.results : [];
      setResults(nextResults);
      if (nextResults.length) {
        setSelectedGameId(String(nextResults[0].id || nextResults[0].name));
        setSelectedCoverKey(nextResults[0].covers?.[0]?.url || "default");
      } else {
        setSelectedGameId("default");
        setSelectedCoverKey("default");
        setError(payload?.configured === false ? t("games_api_not_configured") : t("games_no_results"));
      }
    } catch (nextError) {
      setResults([]);
      setSelectedGameId("default");
      setSelectedCoverKey("default");
      setError(nextError.message || t("games_search_failed"));
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    if (!visible || !initialQuery || !file) return;
    runSearch(initialQuery);
  }, [file, initialQuery, visible]);

  if (!visible || !file) return null;

  const defaultGame = {
    id: "default",
    name: query || stripFileExtension(file.name),
    description: "",
    covers: [],
    source: "default",
  };
  const selectedGame =
    selectedGameId === "default"
      ? defaultGame
      : results.find((entry) => String(entry.id || entry.name) === selectedGameId) || defaultGame;
  const coverOptions = [
    { id: "default", url: "", label: t("games_default_cover") },
    ...results.flatMap((result) =>
      (Array.isArray(result.covers) ? result.covers : []).map((cover) => ({
        ...cover,
        id: `${result.id || result.name}-${cover.url}`,
        gameId: String(result.id || result.name),
      }))
    ),
  ];
  const selectedCover =
    coverOptions.find((cover) => cover.url && cover.url === selectedCoverKey) ||
    coverOptions.find((cover) => cover.id === selectedCoverKey) ||
    coverOptions[0];

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    try {
      await onUpload({
        game: selectedGame,
        cover: selectedCover?.url ? selectedCover : null,
      });
    } catch (nextError) {
      setError(nextError.message || t("upload_game_failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
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
          className="add-series-search"
          onSubmit={(event) => {
            event.preventDefault();
            runSearch(query);
          }}
        >
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
                placeholder={t("games_search_placeholder")}
              />
            </div>
          </label>
          <button className="dialog-button add-series-search__button" disabled={searching} type="submit">
            {searching ? t("searching_button") : t("search_button")}
          </button>
        </form>

        <div className="game-upload-layout">
          <div className="add-series-results game-upload-results">
            <button
              className={`add-series-result${selectedGameId === "default" ? " active" : ""}`}
              onClick={() => {
                setSelectedGameId("default");
                setSelectedCoverKey("default");
              }}
              type="button"
            >
              <div className="add-series-result__poster add-series-result__poster--default">
                <span>{t("games_default_cover")}</span>
              </div>
              <div className="add-series-result__body">
                <h3>{defaultGame.name}</h3>
                <p className="add-series-result__meta">{t("games_manual_profile")}</p>
              </div>
            </button>

            {results.map((result) => {
              const resultId = String(result.id || result.name);
              const isSelected = resultId === selectedGameId;
              return (
                <button
                  key={resultId}
                  className={`add-series-result${isSelected ? " active" : ""}`}
                  onClick={() => {
                    setSelectedGameId(resultId);
                    setSelectedCoverKey(result.covers?.[0]?.url || "default");
                  }}
                  type="button"
                >
                  <div className="add-series-result__poster">
                    {result.covers?.[0]?.url ? (
                      <img src={result.covers[0].url} alt={result.name} />
                    ) : (
                      <span>{t("games_default_cover")}</span>
                    )}
                  </div>
                  <div className="add-series-result__body">
                    <h3>{result.name}</h3>
                    <p className="add-series-result__meta">ScreenScraper</p>
                    <p className="add-series-result__overview">
                      {result.description || t("synopsis_unavailable")}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="game-cover-picker">
            <strong>{t("games_cover_picker")}</strong>
            <div className="game-cover-picker__grid">
              {coverOptions.map((cover) => {
                const isSelected = selectedCover === cover;
                return (
                  <button
                    key={cover.id || cover.url || "default"}
                    className={`game-cover-option${isSelected ? " active" : ""}`}
                    onClick={() => setSelectedCoverKey(cover.url || cover.id)}
                    type="button"
                  >
                    {cover.url ? <img src={cover.url} alt="" /> : <span>{t("games_default_cover")}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {error ? <p className="dialog-error">{error}</p> : null}

        <div className="dialog-card__actions">
          <button className="dialog-button dialog-button--ghost" onClick={onClose} type="button">
            {t("cancel")}
          </button>
          {uploadProgress !== null ? (
            <div className="upload-progress" role="status" aria-live="polite">
              <div className="upload-progress__copy">
                <strong>{t("upload_copying")}</strong>
                <span>{file.name}</span>
              </div>
              <div className="upload-progress__bar" aria-hidden="true">
                <span style={{ width: `${clamp(Number(uploadProgress) || 0, 0, 100)}%` }} />
              </div>
              <p>{`${clamp(Number(uploadProgress) || 0, 0, 100)}%`}</p>
            </div>
          ) : null}
          <button className="dialog-button dialog-button--accent" onClick={handleSubmit} disabled={submitting} type="button">
            {submitting ? t("adding_button") : t("upload_button")}
          </button>
        </div>
      </div>
    </div>
  );
}

function TmdbBrowserModal({ visible, onClose, t, tmdbLanguage }) {
  const [mediaType, setMediaType] = useState("series");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  const [seasonEpisodes, setSeasonEpisodes] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [episodeDialogOpen, setEpisodeDialogOpen] = useState(false);
  const [movieFrameIndex, setMovieFrameIndex] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) {
      setMediaType("series");
      setQuery("");
      setResults([]);
      setSelectedItem(null);
      setSelectedSeasonId(null);
      setSeasonEpisodes(null);
      setSelectedEpisode(null);
      setEpisodeDialogOpen(false);
      setMovieFrameIndex(0);
      setError("");
      return;
    }

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
    setMovieFrameIndex(0);

    try {
      const details =
        mediaType === "movies"
          ? await getMovieById(result.id, tmdbLanguage)
          : await getTvSeriesById(result.id, tmdbLanguage);
      setSelectedItem(details);
      if (mediaType === "series") {
        setSelectedSeasonId(details.seasons?.[0]?.id || null);
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
    if (!visible || mediaType !== "series" || !selectedItem?.id || !selectedSeason) {
      setSeasonEpisodes(null);
      return;
    }

    let cancelled = false;
    async function loadEpisodes() {
      setLoadingEpisodes(true);
      try {
        const nextSeason = await getTvSeasonEpisodes({
          seriesId: selectedItem.id,
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
  }, [visible, mediaType, selectedItem?.id, selectedSeason?.id, tmdbLanguage]);

  if (!visible) return null;

  const mediaLabel = mediaType === "movies" ? t("media_movies_singular") : t("media_series_singular");
  const previewImages = selectedItem?.imageOptions?.length
    ? selectedItem.imageOptions.slice(0, MAX_MOVIE_IMAGES)
    : [selectedItem?.heroImage].filter(Boolean);
  const safeMovieFrameIndex = previewImages.length
    ? Math.min(movieFrameIndex, previewImages.length - 1)
    : 0;

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
            <p>TMDB</p>
            <h2>{t("tmdb_browser_title")}</h2>
          </div>
          <button className="dialog-card__close" onClick={onClose} type="button" aria-label={t("close")}>
            ×
          </button>
        </div>

        <form className="tmdb-browser__search" onSubmit={runSearch}>
          <div className="media-switch tmdb-browser__switch" role="tablist" aria-label={t("raspberry_sections")}>
            {["series", "movies"].map((nextType) => {
              const isActive = nextType === mediaType;
              return (
                <button
                  key={nextType}
                  className={`media-switch__option${isActive ? " active" : ""}`}
                  onClick={() => {
                    setMediaType(nextType);
                    setResults([]);
                    setSelectedItem(null);
                    setSelectedSeasonId(null);
                    setSeasonEpisodes(null);
                    setError("");
                  }}
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
                placeholder={mediaType === "movies" ? t("search_placeholder_movie") : t("search_placeholder_series")}
              />
            </div>
          </label>

          <button className="dialog-button tmdb-browser__search-button" disabled={searching} type="submit">
            {searching ? t("searching_button") : t("search_button")}
          </button>
        </form>

        {error ? <p className="dialog-error">{error}</p> : null}

        <div className="tmdb-browser__layout">
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

          <section className="tmdb-browser__preview">
            {loadingDetails ? (
              <div className="add-series-results__empty">
                <p>{t("tmdb_browser_loading")}</p>
              </div>
            ) : !selectedItem ? (
              <div className="add-series-results__empty">
                <p>{t("tmdb_browser_select_prompt")}</p>
              </div>
            ) : mediaType === "series" ? (
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

                <div className="tmdb-browser-series__seasons">
                  {(selectedItem.seasons || []).map((season) => (
                    <SeasonCard
                      key={season.id}
                      season={season}
                      isActive={season.id === selectedSeasonId}
                      disabled={false}
                      onSelect={setSelectedSeasonId}
                      t={t}
                    />
                  ))}
                </div>

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
                            setEpisodeDialogOpen(true);
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
            ) : (
              <div className="movie-panel tmdb-browser-movie">
                <div className="movie-panel__card">
                  <MovieImageCarousel
                    title={selectedItem.name}
                    images={previewImages}
                    activeIndex={safeMovieFrameIndex}
                    onSelect={setMovieFrameIndex}
                    onPrevious={() =>
                      setMovieFrameIndex((current) =>
                        previewImages.length
                          ? (current - 1 + previewImages.length) % previewImages.length
                          : 0
                      )
                    }
                    onNext={() =>
                      setMovieFrameIndex((current) =>
                        previewImages.length ? (current + 1) % previewImages.length : 0
                      )
                    }
                    t={t}
                  />

                  <div className="movie-panel__content">
                    <div className="movie-panel__header">
                      <h2>{selectedItem.name}</h2>
                      {selectedItem.originalName && selectedItem.originalName !== selectedItem.name ? (
                        <p>{selectedItem.originalName}</p>
                      ) : null}
                    </div>

                    <div className="movie-panel__facts">
                      <div className="movie-panel__fact">
                        <strong>{t("release")}</strong>
                        <span>{selectedItem.releaseDate || t("release_unknown")}</span>
                      </div>
                      <div className="movie-panel__fact">
                        <strong>{t("duration")}</strong>
                        <span>
                          {selectedItem.runtime
                            ? t("loading_movie_runtime", { minutes: selectedItem.runtime })
                            : t("duration_unknown")}
                        </span>
                      </div>
                      <div className="movie-panel__fact">
                        <strong>{t("rating")}</strong>
                        <span>
                          {typeof selectedItem.voteAverage === "number" && selectedItem.voteAverage > 0
                            ? `${selectedItem.voteAverage.toFixed(1)} / 10`
                            : t("tmdb_rating_missing")}
                        </span>
                      </div>
                    </div>

                    <div className="movie-panel__overview">
                      <strong>{t("synopsis")}</strong>
                      <p>{selectedItem.overview || t("synopsis_unavailable")}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <EpisodeDetailsModal
        visible={episodeDialogOpen}
        episode={selectedEpisode}
        season={selectedSeason || seasonEpisodes}
        seriesName={selectedItem?.name || ""}
        playing={false}
        available
        showPlayButton={false}
        onClose={() => {
          setEpisodeDialogOpen(false);
          setSelectedEpisode(null);
        }}
        onPlay={() => {}}
        t={t}
      />
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

function RaspberryStatCard({ label, value, usedGb, percent, icon, t }) {
  return (
    <article className="raspberry-stat-card">
      <div className="raspberry-stat-card__label">
        <img className="raspberry-stat-card__icon" src={icon} alt="" aria-hidden="true" />
        <p>{label}</p>
      </div>
      <strong>{value}</strong>
      <span>
        {t("section_storage_used", {
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
  const image = playbackActive ? playback?.image : "";
  const isEmpty = !playbackActive || !playback;

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
            : t("nothing_playing")}
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

function RaspberryPage({
  raspberryTab,
  onChangeTab,
  onBack,
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
  usedStorageGb,
  totalStorageGb,
  multimediaUsedGb,
  multimediaPercent,
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
  uploadMediaType,
  onUploadMediaTypeChange,
  onUploadFiles,
  uploadDragActive,
  onUploadDragStateChange,
  uploadSummary,
  onOpenTmdbBrowser,
}) {
  const [poweroffDialogOpen, setPoweroffDialogOpen] = useState(false);
  const uploadDropzoneCopyKey =
    uploadMediaType === "series"
      ? "upload_series_dropzone_copy"
      : uploadMediaType === "movies"
        ? "upload_movie_dropzone_copy"
        : "upload_game_dropzone_copy";
  const uploadTypeIconNormal =
    uploadMediaType === "series"
      ? tvshowIconWhite
      : uploadMediaType === "movies"
        ? movieIconWhite
        : gameIconWhite;
  const uploadTypeIconHover =
    uploadMediaType === "series"
      ? tvshowIconYellow
      : uploadMediaType === "movies"
        ? movieIconYellow
        : gameIconYellow;
  const playbackActive = Boolean(raspberryHealth.running);
  const playbackPaused = Boolean(currentPlaybackInfo?.paused);
  const controlsDisabled = !playbackActive || controlsBusy;
  const poweroffDisabled = controlsBusy || !raspberryHealth.ok;

  return (
    <section className="raspberry-page">
      <button className="season-page__back raspberry-page__back" onClick={onBack} type="button">
        <span className="season-page__back-arrow" aria-hidden="true">←</span>
        <span className="season-page__back-label">{t("back")}</span>
      </button>

      <div className="raspberry-page__tv-shell">
        <div className="raspberry-page__tv-card">
          <img className="raspberry-page__tv-image" src={tvGreen} alt={t("raspberry_tv_alt")} />
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

      {raspberryTab === "dashboard" ? (
        <div className="raspberry-page__content">
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
            </article>
            <RaspberryStatCard
              label={t("stats_series_installed")}
              value={seriesCount}
              usedGb={seriesUsedGb}
              percent={seriesPercent}
              icon={tvshowIconYellow}
              t={t}
            />
            <RaspberryStatCard
              label={t("stats_movies_installed")}
              value={movieCount}
              usedGb={movieUsedGb}
              percent={moviePercent}
              icon={movieIconYellow}
              t={t}
            />
            <RaspberryStatCard
              label={t("stats_games_installed")}
              value={gameCount}
              usedGb={gameUsedGb}
              percent={gamePercent}
              icon={gameIconYellow}
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
                  <img className="raspberry-storage-card__sdcard" src={sdacrdIcon} alt="" aria-hidden="true" />
                  <span>{t("occupied")}</span>
                </div>
              </div>
              <div className="raspberry-storage-card__copy raspberry-storage-card__copy--media">
                <p>{t("multimedia_occupied")}</p>
                <strong>{formatStorageGb(multimediaUsedGb)} GB</strong>
              </div>
            </article>
          </div>

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
                accept={uploadMediaType === "games" ? ".gb,.gbc,.gba" : undefined}
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

            {uploadSummary ? (
              <div className="raspberry-upload-summary">
                <strong>{t("latest_detection")}</strong>
                <p>{uploadSummary}</p>
              </div>
            ) : null}

            <div className="raspberry-upload-summary raspberry-upload-summary--tmdb">
              <div>
                <strong>{t("tmdb_browser_title")}</strong>
                <p>{t("tmdb_browser_copy")}</p>
              </div>
              <button
                className="dialog-button dialog-button--accent raspberry-upload-summary__action"
                onClick={onOpenTmdbBrowser}
                type="button"
              >
                {t("tmdb_browser_open")}
              </button>
            </div>

          </article>
        </div>
      ) : null}
    </section>
  );
}

export default function App() {
  const mockMode = isMockMode();
  const [activeMediaType, setActiveMediaType] = useState("series");
  const [webPinInput, setWebPinInput] = useState("");
  const [webPinVisible, setWebPinVisible] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [unlocked, setUnlocked] = useState(mockMode || Boolean(getStoredWebPin()));
  const [videos, setVideos] = useState(null);
  const [tmdbLoading, setTmdbLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDirectoryPath, setSelectedDirectoryPath] = useState("");
  const [selectedMovieId, setSelectedMovieId] = useState(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  const [currentView, setCurrentView] = useState("series");
  const [raspberryReturnView, setRaspberryReturnView] = useState("series");
  const [raspberryTab, setRaspberryTab] = useState("dashboard");
  const [seasonEpisodes, setSeasonEpisodes] = useState(null);
  const [seasonEpisodesLoading, setSeasonEpisodesLoading] = useState(false);
  const [seasonHeroImage, setSeasonHeroImage] = useState("");
  const [seriesProfiles, setSeriesProfiles] = useState(() => loadSeriesProfiles("series"));
  const [movieProfiles, setMovieProfiles] = useState(() => loadSeriesProfiles("movies"));
  const [movieLibrary, setMovieLibrary] = useState(() => loadMediaLibrary("movies"));
  const [tmdbSeriesMap, setTmdbSeriesMap] = useState({});
  const [tmdbMovieMap, setTmdbMovieMap] = useState({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addSeriesOpen, setAddSeriesOpen] = useState(false);
  const [miniTvOpen, setMiniTvOpen] = useState(false);
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
  const [raspberryLanguage, setRaspberryLanguage] = useState(() => loadStoredRaspberryLanguage());
  const [raspberryLanguageSaving, setRaspberryLanguageSaving] = useState(false);
  const [raspberryLanguageError, setRaspberryLanguageError] = useState("");
  const [uploadMediaType, setUploadMediaType] = useState("series");
  const [uploadDragActive, setUploadDragActive] = useState(false);
  const [uploadLookupOpen, setUploadLookupOpen] = useState(false);
  const [uploadLookupQuery, setUploadLookupQuery] = useState("");
  const [uploadSelectedFiles, setUploadSelectedFiles] = useState([]);
  const [uploadDirectoryName, setUploadDirectoryName] = useState("");
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadSummary, setUploadSummary] = useState("");
  const [uploadValidationError, setUploadValidationError] = useState(null);
  const [gameLookupOpen, setGameLookupOpen] = useState(false);
  const [gameUploadFile, setGameUploadFile] = useState(null);
  const [gameUploadQuery, setGameUploadQuery] = useState("");
  const [tmdbBrowserOpen, setTmdbBrowserOpen] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [episodeDialogOpen, setEpisodeDialogOpen] = useState(false);
  const [episodePlaying, setEpisodePlaying] = useState(false);
  const [movieFrameIndex, setMovieFrameIndex] = useState(0);
  const [moviePlaying, setMoviePlaying] = useState(false);
  const seasonHeroShellRef = useRef(null);
  const alarmPreviewAudioRef = useRef(null);
  const t = (key, variables) => translate(raspberryLanguage, key, variables);
  const tmdbLanguage = getTmdbLanguage(raspberryLanguage);

  useEffect(() => {
    if (!unlocked) {
      setLoading(false);
      return () => {};
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      setRaspberryLanguageError("");
      setRaspberryAlarmsLoaded(false);

      try {
        const [nextVideos, nextLanguage, nextAlarmSettings] = await Promise.all([
          getVideos(),
          getRaspberryLanguage(),
          getRaspberryAlarms(),
        ]);
        if (cancelled) return;

        setVideos(nextVideos);
        if (nextLanguage?.language) {
          setRaspberryLanguage(normalizeRaspberryLanguage(nextLanguage.language));
        }
        if (Array.isArray(nextAlarmSettings?.alarms)) {
          setRaspberryAlarm(nextAlarmSettings.alarms);
        }
        if (Array.isArray(nextAlarmSettings?.sounds)) {
          setRaspberryAlarmSounds(nextAlarmSettings.sounds);
          setAlarmPreviewSound((current) => current || nextAlarmSettings.sounds[0] || "");
        }
        setRaspberryAlarmsLoaded(true);

        const firstDirectory = nextVideos?.directories?.[0]?.relativePath || "";
        setSelectedDirectoryPath((current) => current || firstDirectory);
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
    const raspberryMovies = getRaspberryMovieLibraryItems(videos);
    if (!raspberryMovies.length) return;

    setMovieLibrary((currentLibrary) => {
      const nextLibrary = mergeMediaLibraryItems(currentLibrary, raspberryMovies);
      if (nextLibrary !== currentLibrary) {
        saveMediaLibrary("movies", nextLibrary);
      }
      return nextLibrary;
    });
  }, [videos]);

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

    async function refreshRaspberryStatus() {
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
      }
    }

    refreshRaspberryStatus();
    const intervalId = window.setInterval(refreshRaspberryStatus, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [unlocked]);

  const directories = videos?.directories || [];
  const gameLibrary = Array.isArray(videos?.games) ? videos.games : [];

  useEffect(() => {
    if (!directories.length) {
      setTmdbSeriesMap({});
      return;
    }

    let cancelled = false;

    async function loadTmdbSeries() {
      setTmdbLoading(true);
      setError("");

      try {
        const entries = await Promise.all(
          directories.map(async (directory) => {
            const profile = seriesProfiles[directory.relativePath] || {};
            const tmdbSeries = directory.tmdbId
              ? await getTvSeriesById(directory.tmdbId, tmdbLanguage)
              : await resolveSeriesFromNames({
                  directoryName: directory.name,
                  displayName: profile.name || directory.name,
                  language: tmdbLanguage,
                });

            return [
              directory.relativePath,
              {
                ...tmdbSeries,
                directoryPath: directory.relativePath,
              },
            ];
          })
        );

        if (!cancelled) {
          setTmdbSeriesMap(Object.fromEntries(entries));
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError.message || "No se pudo cargar TMDB.");
        }
      } finally {
        if (!cancelled) {
          setTmdbLoading(false);
        }
      }
    }

    loadTmdbSeries();
    return () => {
      cancelled = true;
    };
  }, [directories, seriesProfiles]);

  useEffect(() => {
    if (!movieLibrary.length) {
      setTmdbMovieMap({});
      return;
    }

    let cancelled = false;

    async function loadTmdbMovies() {
      setTmdbLoading(true);
      setError("");

      try {
        const entries = await Promise.all(
          movieLibrary.map(async (movie) => {
            const profile = movieProfiles[String(movie.id)] || {};
            const tmdbMovie = await getMovieById(movie.id, tmdbLanguage);

            return [
              String(movie.id),
              {
                ...tmdbMovie,
                key: String(movie.id),
                name: profile.name || tmdbMovie?.name || movie.name,
                heroImage: profile.heroImage || tmdbMovie?.heroImage || cartellLogo,
                heroImageCrop: normalizeHeroCrop(profile.heroImageCrop || DEFAULT_HERO_CROP),
              },
            ];
          })
        );

        if (!cancelled) {
          setTmdbMovieMap(Object.fromEntries(entries));
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError.message || "No se pudo cargar TMDB.");
        }
      } finally {
        if (!cancelled) {
          setTmdbLoading(false);
        }
      }
    }

    loadTmdbMovies();
    return () => {
      cancelled = true;
    };
  }, [movieLibrary, movieProfiles]);

  const seriesOptions = useMemo(() => {
    return directories.map((directory) => {
      const profile = seriesProfiles[directory.relativePath] || {};
      const tmdbSeries = tmdbSeriesMap[directory.relativePath] || null;

      return {
        key: directory.relativePath,
        id: tmdbSeries?.id || null,
        directoryPath: directory.relativePath,
        name: profile.name || tmdbSeries?.name || directory.name,
        heroImage: profile.heroImage || tmdbSeries?.heroImage || cartellLogo,
        heroImageCrop: normalizeHeroCrop(profile.heroImageCrop || DEFAULT_HERO_CROP),
        imageOptions: tmdbSeries?.imageOptions || [],
        seasons: tmdbSeries?.seasons || [],
        seasonCount: tmdbSeries?.seasonCount || 0,
        episodeCount: tmdbSeries?.totalEpisodeCount || 0,
      };
    });
  }, [directories, seriesProfiles, tmdbSeriesMap]);

  const movieOptions = useMemo(() => {
    return movieLibrary.map((movie) => {
      const tmdbMovie = tmdbMovieMap[String(movie.id)] || null;
      const profile = movieProfiles[String(movie.id)] || {};

      return {
        key: String(movie.id),
        id: Number(movie.id),
        name: profile.name || tmdbMovie?.name || movie.name,
        fileRelativePath: movie.fileRelativePath || "",
        fileName: movie.fileName || "",
        originalName: tmdbMovie?.originalName || "",
        heroImage: profile.heroImage || tmdbMovie?.heroImage || cartellLogo,
        heroImageCrop: normalizeHeroCrop(profile.heroImageCrop || DEFAULT_HERO_CROP),
        imageOptions: tmdbMovie?.imageOptions || [],
        overview: tmdbMovie?.overview || "",
        releaseDate: tmdbMovie?.releaseDate || "",
        runtime: tmdbMovie?.runtime || 0,
        voteAverage: tmdbMovie?.voteAverage || 0,
      };
    });
  }, [movieLibrary, movieProfiles, tmdbMovieMap]);

  const selectedSeries =
    seriesOptions.find((series) => series.directoryPath === selectedDirectoryPath) ||
    seriesOptions[0] ||
    null;
  const selectedDirectory =
    directories.find((directory) => directory.relativePath === selectedSeries?.directoryPath) ||
    null;
  const uploadedEpisodeIds = useMemo(
    () => getUploadedEpisodeIds(selectedDirectory),
    [selectedDirectory]
  );
  const selectedMovie =
    movieOptions.find((movie) => Number(movie.id) === Number(selectedMovieId)) ||
    movieOptions[0] ||
    null;

  useEffect(() => {
    if (!raspberryHealth.running) return;

    const playbackId = String(raspberryHealth.playing || "").trim().toUpperCase();
    const directory = String(raspberryHealth.directory || "").trim();
    if (!playbackId) return;

    setRaspberryCurrentPlayback((current) => {
      if (
        current &&
        String(current.playbackId || "").trim().toUpperCase() === playbackId &&
        String(current.directory || "").trim() === directory
      ) {
        return current;
      }

      return createPlaybackInfoFromHealth({
        health: raspberryHealth,
        seriesOptions,
        movieOptions,
      });
    });
  }, [movieOptions, raspberryHealth, seriesOptions]);

  const selectedItem =
    activeMediaType === "games"
      ? null
      : activeMediaType === "movies"
        ? selectedMovie
        : selectedSeries;
  const hasSettingsButton = activeMediaType !== "games" && Boolean(selectedItem);

  const seasons = selectedSeries?.seasons || [];
  const headerImage =
    activeMediaType === "games" ? cartellLogo : selectedItem?.heroImage || cartellLogo;
  const headerImageCrop =
    activeMediaType === "games"
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
                  image: episode.image || current.image,
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
    if (!selectedSeries && seriesOptions[0]) {
      setSelectedDirectoryPath(seriesOptions[0].directoryPath);
    }
  }, [selectedSeries, seriesOptions]);

  useEffect(() => {
    if (!selectedMovie && movieOptions[0]) {
      setSelectedMovieId(movieOptions[0].id);
    }
  }, [selectedMovie, movieOptions]);

  useEffect(() => {
    setMovieFrameIndex(0);
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
      setSeasonEpisodesLoading(true);
      setError("");

      try {
        const nextSeason = await getTvSeasonEpisodes({
          seriesId: selectedSeries.id,
          seasonNumber: selectedSeason.seasonNumber || selectedSeason.id,
          language: tmdbLanguage,
        });

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
  }, [currentView, selectedSeries, selectedSeason]);

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
    setCurrentView("series");
    setSeasonEpisodes(null);
    setSelectedEpisode(null);
    setEpisodeDialogOpen(false);
    setSettingsOpen(false);
    setAddSeriesOpen(false);
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

  function handleOpenUploadsForMedia(mediaType) {
    const safeMediaType = mediaType === "movies" ? "movies" : "series";
    setUploadMediaType(safeMediaType);
    setRaspberryReturnView(currentView === "season" ? "season" : "series");
    setRaspberryTab("uploads");
    setCurrentView("raspberry");
    setMiniTvOpen(false);
    setSettingsOpen(false);
    setAddSeriesOpen(false);
    setUploadLookupOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  async function handleSaveSeriesSettings(updates) {
    const activeItem = activeMediaType === "movies" ? selectedMovie : selectedSeries;
    if (!activeItem) return;

    try {
      if (activeMediaType === "movies") {
        const nextProfiles = updateSeriesProfile(String(activeItem.id), updates, "movies");
        setMovieProfiles(nextProfiles);
        const movieEntry = activeItem.fileRelativePath
          ? { relativePath: activeItem.fileRelativePath }
          : resolvePlayableMovieEntry(activeItem);
        if (movieEntry?.relativePath) {
          await saveMediaProfile({
            collection: "movies",
            relativePath: movieEntry.relativePath,
            name: updates.name || activeItem.name,
            tmdbId: activeItem.id,
            file: activeItem.fileName || movieEntry.relativePath.split("/").pop() || "",
            heroImage: updates.heroImage,
            heroImageCrop: updates.heroImageCrop,
          });
        }
      } else {
        const nextProfiles = updateSeriesProfile(activeItem.directoryPath, updates, "series");
        setSeriesProfiles(nextProfiles);
        await saveMediaProfile({
          collection: "series",
          relativePath: activeItem.directoryPath,
          name: updates.name || activeItem.name,
          tmdbId: activeItem.id,
          heroImage: updates.heroImage,
          heroImageCrop: updates.heroImageCrop,
        });
      }
      setSettingsOpen(false);
    } catch (nextError) {
      window.alert(nextError.message || "No se pudieron guardar los cambios.");
    }
  }

  async function handleDeleteSeries() {
    const activeItem = activeMediaType === "movies" ? selectedMovie : selectedSeries;
    if (!activeItem) return;

    try {
      if (activeMediaType === "movies") {
        const movieEntry = activeItem.fileRelativePath
          ? { relativePath: activeItem.fileRelativePath }
          : resolvePlayableMovieEntry(activeItem);
        if (movieEntry?.relativePath) {
          await removeMovieFile(movieEntry.relativePath);
        }
        setMovieLibrary(removeMediaLibraryItem("movies", activeItem.id));
        setMovieProfiles(removeSeriesProfile(String(activeItem.id), "movies"));
        setSelectedMovieId((current) =>
          Number(current) === Number(activeItem.id) ? null : current
        );
        const nextVideos = await getVideos();
        setVideos(nextVideos);
      } else {
        await removeSeries(activeItem.directoryPath);
        const nextProfiles = removeSeriesProfile(activeItem.directoryPath, "series");
        setSeriesProfiles(nextProfiles);
        const nextVideos = await getVideos();
        setVideos(nextVideos);
        setSelectedDirectoryPath(nextVideos?.directories?.[0]?.relativePath || "");
      }
      setSettingsOpen(false);
    } catch (nextError) {
      window.alert(
        nextError.message ||
          `No se pudo eliminar la ${activeMediaType === "movies" ? "pelicula" : "serie"}.`
      );
    }
  }

  function handleOpenSeason(seasonId) {
    const season = seasons.find((entry) => entry.id === seasonId);
    if (!isSeasonUploaded(season, uploadedEpisodeIds)) return;

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
    if (!isEpisodeUploaded(selectedSeason, episode, uploadedEpisodeIds)) return;

    setSelectedEpisode(episode);
    setEpisodeDialogOpen(true);
  }

  function handleCloseEpisodeDetails() {
    setEpisodeDialogOpen(false);
    setSelectedEpisode(null);
    setEpisodePlaying(false);
  }

  async function handlePlayEpisode() {
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

    try {
      setEpisodePlaying(true);
      await playEpisode({
        id: raspberryEpisodeId,
        directory: selectedSeries.directoryPath,
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

  async function handlePlayMovie() {
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

    try {
      setMoviePlaying(true);
      await playEpisode({
        id: movieEntry.id,
        directory: movieEntry.directory || undefined,
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

  async function handleAddMediaItem(selectedSeriesResult, targetMediaType = activeMediaType) {
    if (targetMediaType === "movies") {
      const uploadFile = uploadLookupOpen ? uploadSelectedFiles[0] : null;
      let uploadedMovie = null;

      if (uploadFile) {
        setUploadProgress(0);
        uploadedMovie = await uploadMovieFile({
          file: uploadFile,
          movie: selectedSeriesResult,
          onProgress: setUploadProgress,
        });
      }

      const nextLibrary = upsertMediaLibraryItem("movies", {
        id: selectedSeriesResult.id,
        name: selectedSeriesResult.name,
        fileRelativePath: uploadedMovie?.item?.relativePath || "",
        fileName: uploadedMovie?.item?.file || uploadFile?.name || "",
      });
      if (uploadFile) {
        const nextVideos = await getVideos();
        setVideos(nextVideos);
        setUploadSummary(
          t("upload_done_summary", {
            name: selectedSeriesResult.name,
            path: uploadedMovie?.item?.relativePath || uploadFile.name,
          })
        );
      }
      setMovieLibrary(nextLibrary);
      setSelectedMovieId(selectedSeriesResult.id);
      setAddSeriesOpen(false);
      setUploadLookupOpen(false);
      setUploadSelectedFiles([]);
      setUploadDirectoryName("");
      setUploadProgress(null);
      return;
    }

    let addResponse = null;
    if (uploadLookupOpen && targetMediaType === "series") {
      const seriesDetails = await getTvSeriesById(selectedSeriesResult.id, tmdbLanguage);
      setUploadProgress(0);
      addResponse = await uploadSeriesFiles({
        files: uploadSelectedFiles,
        series: selectedSeriesResult,
        directoryName: uploadDirectoryName || uploadLookupQuery,
        heroImage: seriesDetails.heroImage,
        heroImageCrop: DEFAULT_HERO_CROP,
        onProgress: setUploadProgress,
      });
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
    }
    setAddSeriesOpen(false);
    setUploadLookupOpen(false);
    setUploadSelectedFiles([]);
    setUploadDirectoryName("");
    setUploadProgress(null);
  }

  async function handleUploadGameSelection({ game, cover }) {
    if (!gameUploadFile) return;

    setUploadProgress(0);
    const response = await uploadGameFile({
      file: gameUploadFile,
      game,
      cover,
      onProgress: setUploadProgress,
    });
    const nextVideos = await getVideos();
    setVideos(nextVideos);
    setUploadSummary(
      t("upload_game_done_summary", {
        name: response?.item?.name || game?.name || gameUploadFile.name,
        path: response?.item?.relativePath || gameUploadFile.name,
      })
    );
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

    const directory = preferredDirectory?.relativePath || "TVShows/the-simpsons";
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

    await runRaspberryControl(() =>
      playEpisode({
        id: nextEpisodeId,
        directory: nextTarget.directory,
      })
    );

    const parsedNextEpisode = parseRaspberryEpisodeId(nextEpisodeId);
    const activeSeries = nextTarget.series;

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

  function handleUploadFiles(files) {
    const safeFiles = Array.isArray(files) ? files.filter(Boolean) : [];
    if (!safeFiles.length) return;

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
  const isGamesMode = activeMediaType === "games";
  const selectorOptions = isGamesMode ? [] : isMoviesMode ? movieOptions : seriesOptions;
  const selectorValue = isGamesMode
    ? ""
    : isMoviesMode
    ? String(selectedMovie?.id || "")
    : selectedSeries?.directoryPath || "";
  const selectorLabel = isGamesMode
    ? t("games_in_construction")
    : isMoviesMode
      ? t("select_movie")
      : t("select_series");
  const isLibraryEmpty = !selectedItem && !isGamesMode;
  const heroSelectorOptions = isGamesMode
    ? []
    : selectorOptions.map((item) => ({
        key: isMoviesMode ? String(item.id) : item.directoryPath,
        value: isMoviesMode ? String(item.id) : item.directoryPath,
        label: item.name,
      }));
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
  const raspberryLibraryCounts = normalizeLibraryCounts(videos?.libraryCounts || raspberryHealth?.libraryCounts);
  const installedSeriesCount = raspberryLibraryCounts.series.count;
  const installedMovieCount = raspberryLibraryCounts.movies.count;
  const installedGameCount = raspberryLibraryCounts.games.count;
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
        backgroundImage: `url(${cloudsBackground})`,
      }}
    >
      <div className={`page-overlay${currentView === "season" ? " page-overlay--season" : ""}`}>
        {!unlocked ? (
          <section className="empty-state">
            <div className="empty-state__card unlock-card">
              <h2>Acceso protegido</h2>
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
        ) : (
          <>
            {loading || tmdbLoading ? (
              <section className="empty-state">
                <div className="empty-state__card">
                  <h2>{isMoviesMode ? t("loading_movies") : t("loading_seasons")}</h2>
                  <p>
                    {isMoviesMode
                      ? t("loading_movie_copy")
                      : t("loading_series_copy")}
                  </p>
                </div>
              </section>
            ) : error ? (
              <section className="empty-state">
                <div className="empty-state__card">
                  <h2>{t("connection_error")}</h2>
                  <p>{error}</p>
                </div>
              </section>
            ) : currentView === "raspberry" ? (
              <RaspberryPage
                raspberryTab={raspberryTab}
                onChangeTab={setRaspberryTab}
                onBack={handleBackFromRaspberry}
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
                usedStorageGb={usedStorageGb}
                totalStorageGb={totalStorageGb}
                multimediaUsedGb={multimediaUsedGb}
                multimediaPercent={multimediaPercent}
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
                uploadMediaType={uploadMediaType}
                onUploadMediaTypeChange={setUploadMediaType}
                onUploadFiles={handleUploadFiles}
                uploadDragActive={uploadDragActive}
                onUploadDragStateChange={handleUploadDragStateChange}
                uploadSummary={uploadSummary}
                onOpenTmdbBrowser={() => setTmdbBrowserOpen(true)}
              />
            ) : isSeriesMode && currentView === "season" && selectedSeason ? (
              <section className="season-page">
                <button
                  className="season-page__back season-page__back--fixed"
                  onClick={handleBackToSeries}
                  type="button"
                >
                  <span className="season-page__back-arrow" aria-hidden="true">←</span>
                  <span className="season-page__back-label">{t("back")}</span>
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
                      <span>{`${selectedSeason.episodeCount} ${t("episodes")}`}</span>
                    </div>
                  </header>
                </div>

                {seasonEpisodesLoading ? (
                  <section className="empty-state">
                    <div className="empty-state__card">
                      <h2>{t("loading_episodes")}</h2>
                      <p>{t("reading_season")}</p>
                    </div>
                  </section>
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
                  </div>
                </section>

                <header className="series-hero">
                  <div className="series-hero__banner">
                    <HeaderArt
                      image={headerImage}
                      crop={headerImageCrop}
                      alt={selectedItem?.name || "Cartell principal"}
                    />

                    <div className="series-hero__controls-layer">
                      <div
                        className="series-hero__controls-backdrop"
                        aria-hidden="true"
                        style={{
                          WebkitMaskImage: `url(${cartellMask})`,
                          maskImage: `url(${cartellMask})`,
                        }}
                      />
                      <div
                        className={`series-hero__controls-row${isGamesMode ? "" : " series-hero__controls-row--selector-only"}`}
                      >
                        {isGamesMode ? (
                          <button
                            className="series-icon-button series-icon-button--controls-plus"
                            onClick={() => handleOpenUploadsForMedia("games")}
                            type="button"
                            aria-label="Añadir juego"
                            title="Añadir juego"
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

                        <HeroSelector
                          options={heroSelectorOptions}
                          value={selectorValue}
                          placeholder={
                            heroSelectorOptions.length
                              ? selectorLabel
                              : isGamesMode
                                ? "Proximamente"
                                : "Sin elementos"
                          }
                          disabled={isGamesMode || !heroSelectorOptions.length}
                          onChange={(nextValue) =>
                            isMoviesMode
                              ? setSelectedMovieId(Number(nextValue) || null)
                              : setSelectedDirectoryPath(nextValue)
                          }
                        />
                      </div>
                    </div>

                    {hasSettingsButton ? (
                      <button
                        className="series-icon-button series-icon-button--hero series-icon-button--hero-settings"
                        onClick={() => setSettingsOpen(true)}
                        type="button"
                        aria-label={`Personalizar ${isMoviesMode ? "pelicula" : "serie"}`}
                        title={`Personalizar ${isMoviesMode ? "pelicula" : "serie"}`}
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

                    <button
                      className="series-hero__tv-button"
                      onClick={handleOpenRaspberryPage}
                      type="button"
                    >
                      <img className="series-hero__tv" src={tvGreen} alt={t("mini_tv_title")} />
                    </button>
                  </div>
                </header>

                {isGamesMode ? (
                  gameLibrary.length ? (
                    <section className="games-library seasons-section">
                      <div className="seasons-section__label">{`${gameLibrary.length} ${t("media_games")}`}</div>
                      <div className="games-grid">
                        {gameLibrary.map((game) => (
                          <article className="game-card" key={game.relativePath || game.file}>
                            <div className="game-card__cover">
                              {game.coverImage ? (
                                <img src={game.coverImage} alt={game.name} />
                              ) : (
                                <img src={emptyStateIcon} alt="" aria-hidden="true" />
                              )}
                            </div>
                            <div className="game-card__body">
                              <h2>{game.name || game.file}</h2>
                              <p>{game.platformName || t("media_games_singular")}</p>
                              {game.description ? <span>{game.description}</span> : null}
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : (
                    <section className="empty-state">
                      <div className="empty-state__card empty-state__card--library">
                        <h2>{t("games_empty_title")}</h2>
                        <img
                          className="empty-state__image"
                          src={emptyStateIcon}
                          alt=""
                          aria-hidden="true"
                        />
                        <p>{t("games_empty_copy")}</p>
                        <button
                          className="empty-state__action empty-state__action--uploads"
                          onClick={() => handleOpenUploadsForMedia("games")}
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
                  )
                ) : isLibraryEmpty ? (
                  <section className="empty-state">
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
                ) : isSeriesMode && !seasons.length ? (
                  <section className="empty-state">
                    <div className="empty-state__card">
                      <h2>{emptyTitle}</h2>
                      <p>{emptyDescription}</p>
                    </div>
                  </section>
                ) : isSeriesMode ? (
                  <section className="seasons-section">
                    <div className="seasons-section__label">{`${seasons.length} ${t("seasons_label")}`}</div>
                    <div className={`season-grid${seasons.length === 1 ? " season-grid--single" : ""}`}>
                      {seasons.map((season) => (
                        <SeasonCard
                          key={season.id}
                          season={season}
                          isActive={season.id === selectedSeasonId}
                          disabled={!isSeasonUploaded(season, uploadedEpisodeIds)}
                          onSelect={handleOpenSeason}
                          t={t}
                        />
                      ))}
                    </div>
                  </section>
                ) : (
                  <section className="movie-panel seasons-section">
                    <div className="seasons-section__label">{t("movie_file_label")}</div>
                    <div className="movie-panel__card">
                      <button
                        className="movie-panel__play"
                        onClick={handlePlayMovie}
                        type="button"
                        disabled={moviePlaying}
                      >
                        <img src={tvGreen} alt="" aria-hidden="true" />
                        <span>{moviePlaying ? t("playing_now") : t("play_on_tv")}</span>
                      </button>

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
                                ? t("loading_movie_runtime", { minutes: selectedMovie.runtime })
                                : t("duration_unknown")}
                            </span>
                          </div>
                          <div className="movie-panel__fact">
                            <strong>{t("rating")}</strong>
                            <span>
                              {typeof selectedMovie.voteAverage === "number" &&
                              selectedMovie.voteAverage > 0
                                ? `${selectedMovie.voteAverage.toFixed(1)} / 10`
                                : t("tmdb_rating_missing")}
                            </span>
                          </div>
                        </div>

                        <div className="movie-panel__overview">
                          <strong>{t("synopsis")}</strong>
                          <p>{selectedMovie.overview || t("synopsis_unavailable")}</p>
                        </div>
                      </div>
                    </div>
                  </section>
                )}
              </>
            )}

            <SettingsModal
              visible={settingsOpen}
              mediaType={activeMediaType}
              item={selectedItem}
              imageOptions={selectedItem?.imageOptions || []}
              onClose={() => setSettingsOpen(false)}
              onSave={handleSaveSeriesSettings}
              onDelete={handleDeleteSeries}
              t={t}
            />

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
              onClose={() => {
                setAddSeriesOpen(false);
                setUploadLookupOpen(false);
                setUploadSelectedFiles([]);
                setUploadDirectoryName("");
                setUploadProgress(null);
              }}
              onAdd={(item) =>
                handleAddMediaItem(item, uploadLookupOpen ? uploadMediaType : activeMediaType)
              }
              t={t}
              tmdbLanguage={tmdbLanguage}
            />
            <GameUploadModal
              visible={gameLookupOpen}
              file={gameUploadFile}
              initialQuery={gameUploadQuery}
              uploadProgress={uploadProgress}
              onClose={() => {
                setGameLookupOpen(false);
                setGameUploadFile(null);
                setGameUploadQuery("");
                setUploadSelectedFiles([]);
                setUploadProgress(null);
              }}
              onUpload={handleUploadGameSelection}
              t={t}
            />
            <UploadValidationModal
              visible={Boolean(uploadValidationError)}
              title={uploadValidationError?.title || ""}
              message={uploadValidationError?.message || ""}
              onClose={() => setUploadValidationError(null)}
              t={t}
            />
            <TmdbBrowserModal
              visible={tmdbBrowserOpen}
              onClose={() => setTmdbBrowserOpen(false)}
              t={t}
              tmdbLanguage={tmdbLanguage}
            />
            <EpisodeDetailsModal
              visible={episodeDialogOpen}
              episode={selectedEpisode}
              season={selectedSeason}
              seriesName={selectedSeries?.name || ""}
              playing={episodePlaying}
              available={isEpisodeUploaded(selectedSeason, selectedEpisode, uploadedEpisodeIds)}
              onClose={handleCloseEpisodeDetails}
              onPlay={handlePlayEpisode}
              t={t}
            />
          </>
        )}
      </div>
    </main>
  );
}
