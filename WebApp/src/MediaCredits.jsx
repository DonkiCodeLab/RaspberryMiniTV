import React, { useEffect, useId, useState } from "react";
import { buildTmdbImageUrl, getMediaCredits } from "./tmdbApi.js";
import { mediaCreditsFailure, normalizeCreators } from "./mediaCredits.js";
import "./MediaCredits.css";

const labels = {
  es: {
    title: "Reparto y equipo", cast: "Reparto", directors: "Dirección", writers: "Guion y obra original", creators: "Creación",
    loading: "Cargando reparto y equipo…", pending: "Reparto y equipo pendientes de completar. Puedes prepararlos desde TMDB en el dashboard.",
    error: "No se pudo cargar el reparto y el equipo.", empty: "TMDB no incluye reparto ni equipo para esta ficha.",
    retry: "Reintentar", more: count => `Ver ${count} más`, episodes: count => `${count} ${count === 1 ? "episodio" : "episodios"}`,
  },
  ca: {
    title: "Repartiment i equip", cast: "Repartiment", directors: "Direcció", writers: "Guió i obra original", creators: "Creació",
    loading: "Carregant repartiment i equip…", pending: "Repartiment i equip pendents de completar. Els pots preparar des de TMDB al dashboard.",
    error: "No s’ha pogut carregar el repartiment i l’equip.", empty: "TMDB no inclou repartiment ni equip per a aquesta fitxa.",
    retry: "Reintentar", more: count => `Veure’n ${count} més`, episodes: count => `${count} ${count === 1 ? "episodi" : "episodis"}`,
  },
  en: {
    title: "Cast and crew", cast: "Cast", directors: "Directing", writers: "Writing and source material", creators: "Created by",
    loading: "Loading cast and crew…", pending: "Cast and crew are awaiting preparation. You can prepare them from TMDB in the dashboard.",
    error: "Cast and crew could not be loaded.", empty: "TMDB does not include cast or crew for this title.",
    retry: "Retry", more: count => `Show ${count} more`, episodes: count => `${count} ${count === 1 ? "episode" : "episodes"}`,
  },
};

function PersonAvatar({ person, importPreview }) {
  const src = buildTmdbImageUrl(person.profilePath, "w185", importPreview);
  const [failedSrc, setFailedSrc] = useState(null);
  const words = person.name.trim().split(/\s+/);
  const initials = [words[0], ...(words.length > 1 ? [words.at(-1)] : [])]
    .map(word => Array.from(word)[0]).join("").toLocaleUpperCase();
  return <span className="media-credits__avatar" aria-hidden="true">
    {src && failedSrc !== src
      ? <img src={src} alt="" width="64" height="64" loading="lazy" decoding="async" onError={() => setFailedSrc(src)} />
      : <span>{initials}</span>}
  </span>;
}

function People({ people, title, cast = false, t, importPreview }) {
  if (!people.length) return null;
  const limit = cast ? 12 : 6;
  const renderList = entries => <ul className={`media-credits__people${cast ? " media-credits__people--cast" : ""}`}>
    {entries.map(person => <li key={person.key}>
      <PersonAvatar person={person} importPreview={importPreview} />
      <div className="media-credits__identity">
        <span className="media-credits__name">{person.name}</span>
        {cast && person.characters.length > 0 && <span className="media-credits__role">{person.characters.join(" · ")}</span>}
        {cast && person.episodeCount > 0 && <small>{t.episodes(person.episodeCount)}</small>}
      </div>
    </li>)}
  </ul>;
  return <div className="media-credits__group">
    <h4>{title}</h4>
    {renderList(people.slice(0, limit))}
    {people.length > limit && <details className="media-credits__more">
      <summary>{t.more(people.length - limit)}</summary>
      {renderList(people.slice(limit))}
    </details>}
  </div>;
}

export function MediaCreditsContent({ credits, creators, language = "es", status = "ready", onRetry, importPreview = false }) {
  const languageKey = String(language).toLowerCase().split(/[-_]/)[0];
  const t = labels[languageKey === "cat" ? "ca" : languageKey] || labels.es;
  const headingId = useId();
  const createdBy = normalizeCreators(creators);
  const hasCredits = Boolean(credits && (credits.cast.length || credits.directors.length || credits.writers.length));
  return <details className="media-credits" aria-labelledby={headingId} aria-busy={status === "loading"}>
    <summary className="media-credits__summary"><h3 id={headingId}>{t.title}</h3><span className="media-credits__chevron" aria-hidden="true">⌄</span></summary>
    <div className="media-credits__body">
    <div className="media-credits__crew">
      <People people={createdBy} title={t.creators} t={t} importPreview={importPreview} />
      <People people={credits?.directors || []} title={t.directors} t={t} importPreview={importPreview} />
      <People people={credits?.writers || []} title={t.writers} t={t} importPreview={importPreview} />
    </div>
    <People people={credits?.cast || []} title={t.cast} cast t={t} importPreview={importPreview} />
    {status !== "ready" ? <p className="media-credits__status" role="status">
      {t[status]}
      {status !== "loading" && onRetry && <button type="button" onClick={onRetry}>{t.retry}</button>}
    </p> : !hasCredits && !createdBy.length && <p className="media-credits__status">{t.empty}</p>}
    </div>
  </details>;
}

export default function MediaCredits({ mediaType, tmdbId, language, creators, importPreview = false }) {
  const id = Number(tmdbId);
  const valid = Number.isSafeInteger(id) && id > 0;
  const [retry, setRetry] = useState(0);
  const key = `${mediaType}:${id}:${importPreview}:${retry}`;
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    getMediaCredits(mediaType, id, importPreview).then(credits => {
      if (!cancelled) setLoaded({ key, credits, status: "ready" });
    }).catch(error => {
      if (!cancelled) setLoaded({ key, status: mediaCreditsFailure(error) });
    });
    return () => { cancelled = true; };
  }, [key, mediaType, id, importPreview, valid]);
  if (!valid) return null;
  const current = loaded?.key === key ? loaded : { status: "loading" };
  return <MediaCreditsContent key={`${mediaType}:${id}:${importPreview}`} {...current} creators={creators} language={language} importPreview={importPreview}
    onRetry={() => setRetry(value => value + 1)} />;
}
