import React, { useEffect, useState } from "react";
import { getOmdbRating, isMockMode } from "./api/raspberryApi";
import { formatOmdbRating, formatTmdbRating, formatOmdbCriticScore, formatOmdbUpdatedAt, isImdbId, isOmdbCriticScore, omdbError, omdbStrings } from "./omdbRatings.js";
import "./OmdbRatings.css";

function ProviderScore({ score, scale, votes, language }) {
  return <span className="imdb-rating__score-row">
    <span className="imdb-rating__score"><span aria-hidden="true">★</span> {score}<small>{scale}</small></span>
    {Number.isSafeInteger(votes) && votes >= 0 && <small className="imdb-rating__votes">({omdbStrings(language).votes(votes)})</small>}
  </span>;
}

export function ImdbRatingContent({ data, tmdb, status = "ready", error, language = "es", onRetry }) {
  const s = omdbStrings(language);
  const hasTmdb = typeof tmdb?.rating === "number" && Number.isFinite(tmdb.rating) && tmdb.rating > 0 && tmdb.rating <= 10;
  const hasRating = typeof data?.rating === "number" && Number.isFinite(data.rating) && data.rating >= 1 && data.rating <= 10;
  const hasRottenTomatoes = isOmdbCriticScore(data?.rottenTomatoes);
  const hasMetacritic = isOmdbCriticScore(data?.metacritic);
  const imdbId = isImdbId(data?.imdbId) ? data.imdbId : "";
  const badge = <span className="imdb-rating__badge">IMDb</span>;
  return <div className="imdb-rating" aria-label={tmdb ? `TMDB · ${s.ratingLabel}` : s.ratingLabel} aria-busy={status === "loading"}>
    <div className="imdb-rating__providers">
      {tmdb && <div className="imdb-rating__provider" aria-label="TMDB">
        <span className="imdb-rating__badge imdb-rating__badge--tmdb">TMDB</span>
        {hasTmdb ? <ProviderScore score={formatTmdbRating(tmdb.rating, language)} scale=" / 5" votes={tmdb.votes} language={language} />
          : <span className="imdb-rating__unavailable">{s.unavailable}</span>}
      </div>}
      <div className="imdb-rating__provider" aria-label="IMDb">
        <div className="imdb-rating__heading">
          {imdbId ? <a href={`https://www.imdb.com/title/${imdbId}/`} target="_blank" rel="noopener noreferrer">{badge}</a> : badge}
        </div>
        {hasRating ? <ProviderScore score={formatOmdbRating(data.rating, language)} scale=" / 10" votes={data.votes} language={language} />
          : status === "ready" && <span className="imdb-rating__unavailable">{s.unavailable}</span>}
      </div>
      <div className="imdb-rating__provider" aria-label="Rotten Tomatoes">
        <span className="imdb-rating__badge imdb-rating__badge--rotten">Rotten Tomatoes</span>
        {hasRottenTomatoes ? <ProviderScore score={formatOmdbCriticScore(data.rottenTomatoes, language)} scale=" %" votes={data.rottenTomatoesVotes} language={language} />
          : status === "ready" && <span className="imdb-rating__unavailable">{s.unavailable}</span>}
      </div>
      <div className="imdb-rating__provider" aria-label="Metacritic">
        <span className="imdb-rating__badge imdb-rating__badge--metacritic">Metacritic</span>
        {hasMetacritic ? <ProviderScore score={formatOmdbCriticScore(data.metacritic, language)} scale=" / 100" votes={data.metacriticVotes} language={language} />
          : status === "ready" && <span className="imdb-rating__unavailable">{s.unavailable}</span>}
      </div>
    </div>
    {status === "loading" ? <p className="imdb-rating__status" role="status">{s.loading}</p>
      : status === "error" ? <p className="imdb-rating__status" role="status">{omdbError(error, language)}
        {onRetry && <button type="button" onClick={onRetry}>{s.retry}</button>}</p>
        : !hasTmdb && !hasRating && !hasRottenTomatoes && !hasMetacritic && <p className="imdb-rating__status">{s.ratingMissing}</p>}
    {data?.updatedAt && <p className="imdb-rating__updated">{s.updated}: {formatOmdbUpdatedAt(data.updatedAt, language)} · OMDb</p>}
    {data?.stale && <p className="imdb-rating__status" role="status">{s.stale}
      {onRetry && <button type="button" onClick={onRetry}>{s.retry}</button>}</p>}
  </div>;
}

export default function ImdbRating({ kind, tmdbId, tmdbRating, tmdbVotes, imdbId, imdbUrl, language, onLoad }) {
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
  return <ImdbRatingContent {...current} tmdb={{ rating: tmdbRating, votes: tmdbVotes }} language={language}
    onRetry={valid && !demo ? () => setAttempt(value => value + 1) : undefined} />;
}
