import { intlLocale } from "./i18n/languages.js";
import { withLanguages } from "./i18n/index.js";
import React, { useEffect, useState } from "react";
import { getMediaFileInfo } from "./api/raspberryApi";
import { formatFileSize } from "./movieFileQuality.js";
import "./MovieFileInfo.css";

const strings = withLanguages({
  es: { title: "Tu fichero de vídeo", file: "Fichero", original: "Nombre original", size: "Tamaño", resolution: "Resolución real", source: "Fuente · según el nombre", codec: "Códec", bitrate: "Bitrate de vídeo", total: "Bitrate total · vídeo y audio", unknown: "Desconocido", loading: "Consultando los datos guardados…", failed: "No se pudo consultar el fichero.", retry: "Reintentar", pending: "Información pendiente de completar en la biblioteca.", unavailable: "No se pudo analizar el vídeo. El nombre y el tamaño siguen disponibles.", note: "Calidad orientativa según resolución y fuente. No mide nitidez, compresión ni posibles reescalados.", levels: ["Sin valorar", "Mala", "Regular", "Buena", "Óptima", "Espectacular"] },
  ca: { title: "El teu fitxer de vídeo", file: "Fitxer", original: "Nom original", size: "Mida", resolution: "Resolució real", source: "Font · segons el nom", codec: "Còdec", bitrate: "Bitrate de vídeo", total: "Bitrate total · vídeo i àudio", unknown: "Desconegut", loading: "Consultant les dades desades…", failed: "No s’ha pogut consultar el fitxer.", retry: "Torna-ho a provar", pending: "Informació pendent de completar a la biblioteca.", unavailable: "No s’ha pogut analitzar el vídeo. El nom i la mida continuen disponibles.", note: "Qualitat orientativa segons resolució i font. No mesura nitidesa, compressió ni possibles reescalats.", levels: ["Sense valorar", "Dolenta", "Regular", "Bona", "Òptima", "Espectacular"] },
  en: { title: "Your video file", file: "File", original: "Original name", size: "Size", resolution: "Actual resolution", source: "Source · from filename", codec: "Codec", bitrate: "Video bitrate", total: "Total bitrate · video and audio", unknown: "Unknown", loading: "Loading saved file information…", failed: "Could not retrieve file information.", retry: "Retry", pending: "File information is pending in the library.", unavailable: "Could not analyze the video. File name and size are still available.", note: "Estimated quality based on resolution and source. Does not measure sharpness, compression or possible upscaling.", levels: ["Unrated", "Poor", "Fair", "Good", "Optimal", "Spectacular"] },
});

export function MovieQualityBars({ level = 0, compact = false, language = "es" }) {
  const label = (strings[language] || strings.es).levels[level] || strings.es.levels[0];
  return <span className={`movie-file-info__bars movie-file-info__quality--${level}${compact ? " movie-file-info__bars--compact" : ""}`}
    aria-hidden={compact ? undefined : true} role={compact ? "img" : undefined}
    aria-label={compact ? label : undefined} title={compact ? label : undefined}>
    {[1, 2, 3, 4, 5].map(n => <i key={n} className={n <= level ? "is-active" : ""} />)}
  </span>;
}

export default function MovieFileInfo({ relativePath, fileName, fileInfo, language = "es" }) {
  const s = strings[language] || strings.es;
  const [loadedInfo, setInfo] = useState(null), [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  const info = fileInfo || loadedInfo;
  useEffect(() => {
    if (!relativePath || fileInfo) return;
    const controller = new AbortController();
    setInfo(null); setFailed(false);
    getMediaFileInfo(relativePath, controller.signal).then(data => {
      if (!controller.signal.aborted) setInfo(data);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [relativePath, fileInfo, retry]);
  if (!relativePath) return null;
  const name = info?.fileName || fileName || relativePath.split("/").pop();
  const quality = info?.quality || { level: 0, source: null, resolution: null };
  const bitrate = info?.videoBitrate || info?.totalBitrate;
  return <section className="movie-file-info" aria-label={s.title} aria-busy={!info && !failed}>
    <div className="movie-file-info__heading"><strong>{s.title}</strong>
      <span className={`movie-file-info__quality movie-file-info__quality--${quality.level}`}>
        <MovieQualityBars level={quality.level} />
        {s.levels[quality.level]}
      </span>
    </div>
    <dl>
      <div className="movie-file-info__name"><dt>{s.file}</dt><dd>{name}</dd></div>
      {info?.originalFileName && info.originalFileName !== name && <div className="movie-file-info__name"><dt>{s.original}</dt><dd>{info.originalFileName}</dd></div>}
      <div><dt>{s.size}</dt><dd>{formatFileSize(info?.sizeBytes, language) || s.unknown}</dd></div>
      <div><dt>{s.resolution}</dt><dd>{quality.resolution || s.unknown}{info?.width && info?.height ? <small>{info.width} × {info.height} px</small> : null}</dd></div>
      <div><dt>{s.source}</dt><dd>{quality.source || s.unknown}</dd></div>
      <div><dt>{s.codec}</dt><dd>{info?.codec?.toUpperCase() || s.unknown}</dd></div>
      {bitrate ? <div><dt>{info.videoBitrate ? s.bitrate : s.total}</dt><dd>{new Intl.NumberFormat(intlLocale(language), { maximumFractionDigits: 2 }).format(bitrate / 1000000)} Mb/s</dd></div> : null}
    </dl>
    <p className="movie-file-info__note" aria-live="polite">{failed ? s.failed : !info ? s.loading : info.probeStatus === "pending" ? s.pending : info.probeStatus !== "known" ? s.unavailable : s.note}</p>
    {failed && <button type="button" className="dialog-button dialog-button--ghost" onClick={() => setRetry(n => n + 1)}>{s.retry}</button>}
  </section>;
}
