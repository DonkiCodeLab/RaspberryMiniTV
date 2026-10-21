import { withLanguages } from "./i18n/index.js";
const strings = withLanguages({
  es: {
    play: "Reproducir",
    playback: "Reproducción de vídeo", playbackFailed: "Se ha interrumpido la reproducción",
    checking: "Comprobando el audio", queued: "En espera", converting: "Preparando audio compatible", finalizing: "Terminando la preparación",
    hint: "El vídeo conserva su calidad. La copia compatible se guardará para la próxima vez.",
    background: "Puedes cerrar esta ventana. La preparación continuará en la MiniTV.",
    elapsed: "Tiempo transcurrido", remaining: "Tiempo restante estimado", position: "Posición en la cola", retry: "Reintentar", failed: "No se ha podido preparar el vídeo",
    errors: { TOOLS_MISSING: "Falta FFmpeg en la MiniTV. Actualiza o vuelve a ejecutar el instalador de servicios.", PROBE_FAILED: "No se han podido leer las pistas del archivo.", NO_VIDEO: "Este archivo no contiene una pista de vídeo.", VIDEO_UNSUPPORTED: "Este formato de vídeo necesita otra conversión. Puedes reproducir el original en la MiniTV.", AAC_UNSUPPORTED: "Este navegador no admite el audio AAC necesario. Prueba con otro navegador.", QUEUE_FULL: "Hay demasiadas preparaciones pendientes. Reintenta cuando termine alguna.", CACHE_FULL: "La caché de reproducción está llena de copias recientes. Libera espacio en MultimediaContent/BrowserPlayback o inténtalo más tarde.", NO_SPACE: "No hay suficiente espacio para preparar una copia compatible.", SOURCE_CHANGED: "El archivo original ha cambiado. Pulsa Reintentar para preparar la nueva versión.", SOURCE_NOT_FOUND: "No se encuentra el vídeo original.", BACKEND_MISSING: "Actualiza también la API de la MiniTV para preparar el audio.", UNAUTHORIZED: "La sesión ha caducado. Vuelve a entrar con el PIN de la MiniTV.", CONVERSION_FAILED: "La conversión no se ha completado. El original sigue intacto.", NETWORK: "Se ha perdido la conexión. Pulsa Reintentar para recuperar el progreso." },
  },
  ca: {
    play: "Reprodueix",
    playback: "Reproducció de vídeo", playbackFailed: "S’ha interromput la reproducció",
    checking: "Comprovant l’àudio", queued: "En espera", converting: "Preparant àudio compatible", finalizing: "Acabant la preparació",
    hint: "El vídeo conserva la qualitat. La còpia compatible es desarà per a la pròxima vegada.",
    background: "Pots tancar aquesta finestra. La preparació continuarà a la MiniTV.",
    elapsed: "Temps transcorregut", remaining: "Temps restant estimat", position: "Posició a la cua", retry: "Torna-ho a provar", failed: "No s’ha pogut preparar el vídeo",
    errors: { TOOLS_MISSING: "Falta FFmpeg a la MiniTV. Actualitza o torna a executar l’instal·lador de serveis.", PROBE_FAILED: "No s’han pogut llegir les pistes del fitxer.", NO_VIDEO: "Aquest fitxer no conté cap pista de vídeo.", VIDEO_UNSUPPORTED: "Aquest format de vídeo necessita una altra conversió. Pots reproduir l’original a la MiniTV.", AAC_UNSUPPORTED: "Aquest navegador no admet l’àudio AAC necessari. Prova un altre navegador.", QUEUE_FULL: "Hi ha massa preparacions pendents. Torna-ho a provar quan n’acabi alguna.", CACHE_FULL: "La memòria cau és plena de còpies recents. Allibera espai a MultimediaContent/BrowserPlayback o torna-ho a provar més tard.", NO_SPACE: "No hi ha prou espai per preparar una còpia compatible.", SOURCE_CHANGED: "El fitxer original ha canviat. Torna-ho a provar per preparar la nova versió.", SOURCE_NOT_FOUND: "No es troba el vídeo original.", BACKEND_MISSING: "Actualitza també l’API de la MiniTV per preparar l’àudio.", UNAUTHORIZED: "La sessió ha caducat. Torna a entrar amb el PIN de la MiniTV.", CONVERSION_FAILED: "La conversió no s’ha completat. L’original continua intacte.", NETWORK: "S’ha perdut la connexió. Torna-ho a provar per recuperar el progrés." },
  },
  en: {
    play: "Play",
    playback: "Video playback", playbackFailed: "Playback was interrupted",
    checking: "Checking audio", queued: "Waiting", converting: "Preparing compatible audio", finalizing: "Finishing preparation",
    hint: "Video quality is preserved. The compatible copy will be saved for next time.",
    background: "You can close this window. Preparation will continue on the MiniTV.",
    elapsed: "Elapsed time", remaining: "Estimated time remaining", position: "Queue position", retry: "Retry", failed: "Could not prepare this video",
    errors: { TOOLS_MISSING: "FFmpeg is missing on the MiniTV. Update or run the service installer again.", PROBE_FAILED: "Could not read the file’s tracks.", NO_VIDEO: "This file has no video track.", VIDEO_UNSUPPORTED: "This video format needs a different conversion. You can play the original on the MiniTV.", AAC_UNSUPPORTED: "This browser does not support the required AAC audio. Try another browser.", QUEUE_FULL: "Too many preparations are pending. Retry after one finishes.", CACHE_FULL: "The playback cache is full of recent copies. Free space in MultimediaContent/BrowserPlayback or try again later.", NO_SPACE: "There is not enough space to prepare a compatible copy.", SOURCE_CHANGED: "The original file has changed. Retry to prepare the new version.", SOURCE_NOT_FOUND: "The original video could not be found.", BACKEND_MISSING: "Update the MiniTV API as well to enable audio preparation.", UNAUTHORIZED: "Your session has expired. Sign in again with the MiniTV PIN.", CONVERSION_FAILED: "Conversion did not finish. The original is unchanged.", NETWORK: "Connection lost. Retry to recover preparation progress." },
  },
});
export const browserPlaybackStrings = language => strings[language] || strings.es;

Object.assign(strings.es.errors, {
  PLAYBACK_ABORTED: "Se ha cancelado la carga del vídeo. Pulsa Reintentar para continuar desde el punto guardado.",
  PLAYBACK_NETWORK: "Se ha interrumpido la descarga del vídeo. Comprueba la conexión con la MiniTV y pulsa Reintentar para continuar desde el punto guardado.",
  PLAYBACK_DECODE: "El navegador no ha podido decodificar una parte del vídeo o del audio. Pulsa Reintentar para continuar desde el punto guardado. Si vuelve a fallar en el mismo punto, prueba otro navegador o reproduce el original en la MiniTV.",
  PLAYBACK_UNSUPPORTED: "El navegador no puede reproducir el archivo recibido. Pulsa Reintentar para comprobar el acceso al vídeo, o prueba otro navegador.",
  PLAYBACK_FAILED: "Se ha producido un error al reproducir el vídeo. Pulsa Reintentar para continuar desde el punto guardado, o reproduce el original en la MiniTV.",
});
Object.assign(strings.ca.errors, {
  PLAYBACK_ABORTED: "S’ha cancel·lat la càrrega del vídeo. Torna-ho a provar per continuar des del punt desat.",
  PLAYBACK_NETWORK: "S’ha interromput la descàrrega del vídeo. Comprova la connexió amb la MiniTV i torna-ho a provar per continuar des del punt desat.",
  PLAYBACK_DECODE: "El navegador no ha pogut descodificar una part del vídeo o de l’àudio. Torna-ho a provar per continuar des del punt desat. Si torna a fallar al mateix punt, prova un altre navegador o reprodueix l’original a la MiniTV.",
  PLAYBACK_UNSUPPORTED: "El navegador no pot reproduir el fitxer rebut. Torna-ho a provar per comprovar l’accés al vídeo, o prova un altre navegador.",
  PLAYBACK_FAILED: "S’ha produït un error en reproduir el vídeo. Torna-ho a provar per continuar des del punt desat, o reprodueix l’original a la MiniTV.",
});
Object.assign(strings.en.errors, {
  PLAYBACK_ABORTED: "Video loading was cancelled. Retry to continue from the saved position.",
  PLAYBACK_NETWORK: "The video download was interrupted. Check the connection to the MiniTV and retry to continue from the saved position.",
  PLAYBACK_DECODE: "The browser could not decode part of the video or audio. Retry to continue from the saved position. If it fails again at the same point, try another browser or play the original on the MiniTV.",
  PLAYBACK_UNSUPPORTED: "The browser cannot play the received file. Retry to check access to the video, or try another browser.",
  PLAYBACK_FAILED: "An error occurred while playing the video. Retry to continue from the saved position, or play the original on the MiniTV.",
});
