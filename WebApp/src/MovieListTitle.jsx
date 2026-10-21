import { normalizeLanguage } from "./i18n/languages.js";
import { withLanguages } from "./i18n/index.js";
import React from "react";
import { MovieQualityBars } from "./MovieFileInfo.jsx";
import "./MovieListTitle.css";
const strings = withLanguages({
  es: { levels: ["Calidad sin valorar", "Mala", "Regular", "Buena", "Óptima", "Espectacular"], loading: "Consultando tamaño…", unknownSize: "Tamaño desconocido", estimated: "Calidad orientativa según resolución y fuente" },
  ca: { levels: ["Qualitat sense valorar", "Dolenta", "Regular", "Bona", "Òptima", "Espectacular"], loading: "Consultant la mida…", unknownSize: "Mida desconeguda", estimated: "Qualitat orientativa segons resolució i font" },
  en: { levels: ["Quality unrated", "Poor", "Fair", "Good", "Optimal", "Spectacular"], loading: "Checking size…", unknownSize: "Unknown size", estimated: "Estimated quality based on resolution and source" },
});
export function MovieListTitleContent({ name, fileName, info, wrapperRef }) {
  const filename = info?.originalFileName || info?.fileName || fileName;
  return <div className="movie-library__heading" ref={wrapperRef}>
    <h2>{name}</h2>
    {fileName && <div className="movie-list-file-info">
      <span className="movie-list-file-info__name" title={filename}>{filename}</span>
    </div>}
  </div>;
}
export default function MovieListTitle({ movie, language }) {
  return <MovieListTitleContent name={movie.name} fileName={movie.fileName || movie.fileRelativePath?.split("/").pop()}
    info={movie.fileInfo} language={language} />;
}

export function MovieListFileQuality({ movie, language = "es" }) {
  const locale = normalizeLanguage(language);
  const s = strings[locale] || strings.es;
  const info = movie.fileInfo;
  const quality = info?.quality || { level: 0, source: null, resolution: null };
  const size = typeof info?.sizeBytes === "number" && info.sizeBytes >= 0
    ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(info.sizeBytes / 1000000)} MB`
    : s.unknownSize;
  return <div className="movie-list-file-quality">
    <div className="movie-list-file-quality__format">
      <span>{quality.resolution || "—"}</span>
      <small>{[quality.source, size].filter(Boolean).join(" · ")}</small>
    </div>
    <div className={`movie-list-file-info__quality movie-list-file-info__quality--${quality.level}`} title={s.estimated}>
      <MovieQualityBars level={quality.level} />
      <span>{s.levels[quality.level]}</span>
    </div>
  </div>;
}
