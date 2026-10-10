import React, { useEffect, useState } from "react";
import { getOmdbRating, isMockMode } from "./api/raspberryApi";
import { formatOmdbRating, formatOmdbCriticScore, formatOmdbUpdatedAt, isImdbId, isOmdbCriticScore, omdbError, omdbStrings } from "./omdbRatings.js";
import "./OmdbRatings.css";

export function ImdbRatingContent({ data, status = "ready", error, language = "es", onRetry }) {
  const s = omdbStrings(language);
  const hasRating = typeof data?.rating === "number" && Number.isFinite(data.rating) && data.rating >= 1 && data.rating <= 10;
  const hasRottenTomatoes = isOmdbCriticScore(data?.rottenTomatoes);
  const hasMetacritic = isOmdbCriticScore(data?.metacritic);
  const imdbId = isImdbId(data?.imdbId) ? data.imdbId : "";
  const badge = <span className="imdb-rating__badge">IMDb</span>;
  return <div className="imdb-rating" aria-label={s.ratingLabel} aria-busy={status === "loading"}>
    <div className="imdb-rating__providers">
      <div className="imdb-rating__provider" aria-label="IMDb">
        <div className="imdb-rating__heading">
          {imdbId ? <a href={`https://www.imdb.com/title/${imdbId}/`} target="_blank" rel="noopener noreferrer">{badge}</a> : badge}
        </div>
        {hasRating ? <span className="imdb-rating__score"><span aria-hidden="true">★</span> {formatOmdbRating(data.rating, language)}<small> / 10</small></span>
          : status === "ready" && <span className="imdb-rating__unavailable">{s.unavailable}</span>}
        {hasRating && data.votes != null && <span className="imdb-rating__votes">{s.votes(data.votes)}</span>}
      </div>
      <div className="imdb-rating__provider" aria-label="Rotten Tomatoes">
        <span className="imdb-rating__badge imdb-rating__badge--rotten">Rotten Tomatoes</span>
        {hasRottenTomatoes ? <span className="imdb-rating__score">{formatOmdbCriticScore(data.rottenTomatoes, language)}<small> %</small></span>
          : status === "ready" && <span className="imdb-rating__unavailable">{s.unavailable}</span>}
      </div>
      <div className="imdb-rating__provider" aria-label="Metacritic">
        <span className="imdb-rating__badge imdb-rating__badge--metacritic">Metacritic</span>
        {hasMetacritic ? <span className="imdb-rating__score">{formatOmdbCriticScore(data.metacritic, language)}<small> / 100</small></span>
          : status === "ready" && <span className="imdb-rating__unavailable">{s.unavailable}</span>}
      </div>
    </div>
    {status === "loading" ? <p className="imdb-rating__status" role="status">{s.loading}</p>
      : status === "error" ? <p className="imdb-rating__status" role="status">{omdbError(error, language)}
        {onRetry && <button type="button" onClick={onRetry}>{s.retry}</button>}</p>
        : !hasRating && !hasRottenTomatoes && !hasMetacritic && <p className="imdb-rating__status">{s.ratingMissing}</p>}
    {data?.updatedAt && <p className="imdb-rating__updated">{s.updated}: {formatOmdbUpdatedAt(data.updatedAt, language)} · OMDb</p>}
    {data?.stale && <p className="imdb-rating__status" role="status">{s.stale}
      {onRetry && <button type="button" onClick={onRetry}>{s.retry}</button>}</p>}
  </div>;
}

export default function ImdbRating({ kind, tmdbId, imdbId, imdbUrl, language, onLoad }) {
  const candidate = imdbId || String(imdbUrl || "").match(/^https:\/\/(?:www\.)?imdb\.com\/title\/(tt\d{7,12})(?:\/|$)/)?.[1] || "";
  const resolvedId = isImdbId(candidate) ? candidate : "";
  const id = Number(tmdbId);
  const valid = Boolean(resolvedId || ((kind === "movie" || kind === "tv") && Number.isSafeInteger(id) && id > 0));
  const [attempt, setAttempt] = useState(0);
  const key = `${kind}:${id}:${resolvedId}:${attempt}`;
  const [loaded, setLoaded] = useState(null);
  const demo = isMockMode();
  useEffect(() => {
    if (!valid || demo) return;
    const controller = new AbortController();
    getOmdbRating(resolvedId ? { imdbId: resolvedId } : { kind, tmdbId: id }, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) {
          setLoaded({ key, data, status: "ready" });
          onLoad?.(data);
        }
      })
      .catch(error => { if (!controller.signal.aborted) setLoaded({ key, error, status: "error" }); });
    return () => controller.abort();
  }, [key, resolvedId, kind, id, valid, demo, onLoad]);
  const current = demo ? { status: "error", error: { code: "OMDB_DEMO" } }
    : !valid ? { status: "error", error: { code: "OMDB_ID_MISSING" } } : loaded?.key === key ? loaded : { status: "loading" };
  return <ImdbRatingContent {...current} language={language}
    onRetry={valid && !demo ? () => setAttempt(value => value + 1) : undefined} />;
}
