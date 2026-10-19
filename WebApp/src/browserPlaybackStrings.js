const strings = {
  es: {
    play: "Reproducir",
    checking: "Comprobando el audio", queued: "En espera", converting: "Preparando audio compatible", finalizing: "Terminando la preparación",
    hint: "El vídeo conserva su calidad. La copia compatible se guardará para la próxima vez.",
    background: "Puedes cerrar esta ventana. La preparación continuará en la MiniTV.",
    elapsed: "Tiempo transcurrido", remaining: "Tiempo restante estimado", position: "Posición en la cola", retry: "Reintentar", failed: "No se ha podido preparar el vídeo",
    errors: { TOOLS_MISSING: "Falta FFmpeg en la MiniTV. Actualiza o vuelve a ejecutar el instalador de servicios.", PROBE_FAILED: "No se han podido leer las pistas del archivo.", NO_VIDEO: "Este archivo no contiene una pista de vídeo.", VIDEO_UNSUPPORTED: "Este formato de vídeo necesita otra conversión. Puedes reproducir el original en la MiniTV.", AAC_UNSUPPORTED: "Este navegador no admite el audio AAC necesario. Prueba con otro navegador.", QUEUE_FULL: "Hay demasiadas preparaciones pendientes. Reintenta cuando termine alguna.", CACHE_FULL: "La caché de reproducción está llena de copias recientes. Libera espacio en MultimediaContent/BrowserPlayback o inténtalo más tarde.", NO_SPACE: "No hay suficiente espacio para preparar una copia compatible.", SOURCE_CHANGED: "El archivo original ha cambiado. Pulsa Reintentar para preparar la nueva versión.", SOURCE_NOT_FOUND: "No se encuentra el vídeo original.", BACKEND_MISSING: "Actualiza también la API de la MiniTV para preparar el audio.", UNAUTHORIZED: "La sesión ha caducado. Vuelve a entrar con el PIN de la MiniTV.", CONVERSION_FAILED: "La conversión no se ha completado. El original sigue intacto.", NETWORK: "Se ha perdido la conexión. Pulsa Reintentar para recuperar el progreso." },
  },
  ca: {
    play: "Reprodueix",
    checking: "Comprovant l’àudio", queued: "En espera", converting: "Preparant àudio compatible", finalizing: "Acabant la preparació",
    hint: "El vídeo conserva la qualitat. La còpia compatible es desarà per a la pròxima vegada.",
    background: "Pots tancar aquesta finestra. La preparació continuarà a la MiniTV.",
    elapsed: "Temps transcorregut", remaining: "Temps restant estimat", position: "Posició a la cua", retry: "Torna-ho a provar", failed: "No s’ha pogut preparar el vídeo",
    errors: { TOOLS_MISSING: "Falta FFmpeg a la MiniTV. Actualitza o torna a executar l’instal·lador de serveis.", PROBE_FAILED: "No s’han pogut llegir les pistes del fitxer.", NO_VIDEO: "Aquest fitxer no conté cap pista de vídeo.", VIDEO_UNSUPPORTED: "Aquest format de vídeo necessita una altra conversió. Pots reproduir l’original a la MiniTV.", AAC_UNSUPPORTED: "Aquest navegador no admet l’àudio AAC necessari. Prova un altre navegador.", QUEUE_FULL: "Hi ha massa preparacions pendents. Torna-ho a provar quan n’acabi alguna.", CACHE_FULL: "La memòria cau és plena de còpies recents. Allibera espai a MultimediaContent/BrowserPlayback o torna-ho a provar més tard.", NO_SPACE: "No hi ha prou espai per preparar una còpia compatible.", SOURCE_CHANGED: "El fitxer original ha canviat. Torna-ho a provar per preparar la nova versió.", SOURCE_NOT_FOUND: "No es troba el vídeo original.", BACKEND_MISSING: "Actualitza també l’API de la MiniTV per preparar l’àudio.", UNAUTHORIZED: "La sessió ha caducat. Torna a entrar amb el PIN de la MiniTV.", CONVERSION_FAILED: "La conversió no s’ha completat. L’original continua intacte.", NETWORK: "S’ha perdut la connexió. Torna-ho a provar per recuperar el progrés." },
  },
  en: {
    play: "Play",
    checking: "Checking audio", queued: "Waiting", converting: "Preparing compatible audio", finalizing: "Finishing preparation",
    hint: "Video quality is preserved. The compatible copy will be saved for next time.",
    background: "You can close this window. Preparation will continue on the MiniTV.",
    elapsed: "Elapsed time", remaining: "Estimated time remaining", position: "Queue position", retry: "Retry", failed: "Could not prepare this video",
    errors: { TOOLS_MISSING: "FFmpeg is missing on the MiniTV. Update or run the service installer again.", PROBE_FAILED: "Could not read the file’s tracks.", NO_VIDEO: "This file has no video track.", VIDEO_UNSUPPORTED: "This video format needs a different conversion. You can play the original on the MiniTV.", AAC_UNSUPPORTED: "This browser does not support the required AAC audio. Try another browser.", QUEUE_FULL: "Too many preparations are pending. Retry after one finishes.", CACHE_FULL: "The playback cache is full of recent copies. Free space in MultimediaContent/BrowserPlayback or try again later.", NO_SPACE: "There is not enough space to prepare a compatible copy.", SOURCE_CHANGED: "The original file has changed. Retry to prepare the new version.", SOURCE_NOT_FOUND: "The original video could not be found.", BACKEND_MISSING: "Update the MiniTV API as well to enable audio preparation.", UNAUTHORIZED: "Your session has expired. Sign in again with the MiniTV PIN.", CONVERSION_FAILED: "Conversion did not finish. The original is unchanged.", NETWORK: "Connection lost. Retry to recover preparation progress." },
  },
};
export const browserPlaybackStrings = language => strings[language] || strings.es;

strings.es.errors.PLAYBACK_FAILED = "No se ha podido reproducir el vídeo. Reintenta para comprobar la copia y la conexión, o reproduce el original en la MiniTV.";
strings.ca.errors.PLAYBACK_FAILED = "No s’ha pogut reproduir el vídeo. Torna-ho a provar per comprovar la còpia i la connexió, o reprodueix l’original a la MiniTV.";
strings.en.errors.PLAYBACK_FAILED = "The video could not be played. Retry to check the copy and connection, or play the original on the MiniTV.";
