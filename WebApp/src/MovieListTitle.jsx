import React, { useEffect, useRef, useState } from "react";
import { getMediaFileInfo } from "./api/raspberryApi";
import { movieFileQuality } from "./movieFileQuality.js";
import { createMovieMetadataLoader } from "./movieListMetadata.js";
import "./MovieListTitle.css";
const loadMetadata = createMovieMetadataLoader(getMediaFileInfo);
const strings = {
  es: { levels: ["Calidad sin valorar", "Mala", "Regular", "Buena", "Óptima", "Espectacular"], loading: "Consultando tamaño…", unknownSize: "Tamaño desconocido", estimated: "Calidad orientativa según resolución y fuente" },
  ca: { levels: ["Qualitat sense valorar", "Dolenta", "Regular", "Bona", "Òptima", "Espectacular"], loading: "Consultant la mida…", unknownSize: "Mida desconeguda", estimated: "Qualitat orientativa segons resolució i font" },
  en: { levels: ["Quality unrated", "Poor", "Fair", "Good", "Optimal", "Spectacular"], loading: "Checking size…", unknownSize: "Unknown size", estimated: "Estimated quality based on resolution and source" },
};
export function MovieListTitleContent({ name, fileName, info, loading = false, language = "es", wrapperRef }) {
  const locale = String(language || "es").slice(0, 2);
  const s = strings[locale] || strings.es;
  const filename = info?.originalFileName || info?.fileName || fileName;
  const quality = movieFileQuality(info || {}, filename);
  const size = typeof info?.sizeBytes === "number" && info.sizeBytes >= 0
    ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(info.sizeBytes / 1000000)} MB`
    : loading ? s.loading : s.unknownSize;
  return <div className="movie-library__heading" ref={wrapperRef}>
    <h2>{name}</h2>
    {fileName && <div className="movie-list-file-info">
      <span className="movie-list-file-info__name" title={filename}>{filename}</span>
      <span className="movie-list-file-info__details" title={s.estimated}>
        <span className={`movie-list-file-info__quality movie-list-file-info__quality--${quality.level}`}>{s.levels[quality.level]}</span>
        {quality.resolution && <> · {quality.resolution}</>}{quality.source && <> · {quality.source}</>} · {size}
      </span>
    </div>}
  </div>;
}
export default function MovieListTitle({ movie, language }) {
  const root = useRef(null);
  const path = movie.fileRelativePath;
  const [result, setResult] = useState(null), [loading, setLoading] = useState(Boolean(path));
  useEffect(() => {
    if (!path) { setLoading(false); return; }
    const controller = new AbortController();
    let observer;
    setResult(null); setLoading(true);
    const load = () => {
      observer?.disconnect();
      loadMetadata(path, controller.signal).then(info => {
        if (!controller.signal.aborted) setResult({ path, info });
      }).catch(() => {}).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    };
    if (typeof IntersectionObserver === "undefined") load();
    else {
      observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) load(); }, { rootMargin: "120px" });
      observer.observe(root.current);
    }
    return () => { observer?.disconnect(); controller.abort(); };
  }, [path]);
  return <MovieListTitleContent name={movie.name} fileName={movie.fileName || path?.split("/").pop()}
    info={result?.path === path ? result.info : null} loading={loading} language={language} wrapperRef={root} />;
}
