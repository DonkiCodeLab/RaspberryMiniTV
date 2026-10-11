import React, { useEffect, useState } from "react";
import GameVideo from "./GameVideo.jsx";
import { findMovieTrailer } from "./api/raspberryApi";

const strings = {
  es: { photos: "Fotos", trailer: "Tráiler", search: "Buscar tráiler en YouTube", missing: "No hay un tráiler asociado. Puedes buscar otra propuesta en YouTube.", results: "Comprueba que el tráiler corresponde a esta película y a su año de estreno.", error: "No se pudo buscar el tráiler. Puedes reintentar la búsqueda en YouTube." },
  ca: { photos: "Fotos", trailer: "Tràiler", search: "Cerca un tràiler a YouTube", missing: "No hi ha cap tràiler associat. Pots cercar una altra proposta a YouTube.", results: "Comprova que el tràiler correspon a aquesta pel·lícula i al seu any d’estrena.", error: "No s’ha pogut cercar el tràiler. Pots tornar a cercar a YouTube." },
  en: { photos: "Photos", trailer: "Trailer", search: "Find a trailer on YouTube", missing: "No trailer is linked. You can search YouTube for another suggestion.", results: "Check that the trailer matches this movie and its release year.", error: "Could not find the trailer. You can retry the search on YouTube." },
};

export default function MovieMedia({ movie, language, t, onSaveVideo, children, kind = "movie" }) {
  const labels = { ...(strings[String(language).slice(0, 2)] || strings.es) };
  if (kind === "tv") labels.results = labels.results.replace("esta película", "esta serie").replace("aquesta pel·lícula", "aquesta sèrie").replace("this movie", "this series");
  const [mode, setMode] = useState(children && !movie.preferredVideo ? "photos" : "trailer");
  const [suggestion, setSuggestion] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const supplied = movie.preferredVideo || (movie.trailer?.key ? { id: movie.trailer.key, name: movie.trailer.name } : null);
  useEffect(() => {
    if (supplied) return;
    const controller = new AbortController();
    setBusy(true);
    findMovieTrailer(movie, controller.signal, kind).then(data => {
      if (!controller.signal.aborted) setSuggestion(data.video);
    }).catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [movie.id, movie.tmdbId, movie.name, supplied?.id, kind]);
  const video = supplied || suggestion;
  const translate = key => ({ games_video_title: labels.trailer, games_video_search: labels.search,
    games_video_missing: labels.missing, youtube_title: labels.search, youtube_query: labels.search, youtube_results: labels.results }[key] || t(key));
  const query = `${movie.name} ${String(movie.releaseDate || movie.firstAirDate || "").slice(0, 4)} ${language?.startsWith("en") ? "official trailer" : "trailer oficial"}`.trim().slice(0, 200);
  return <section className="movie-media" aria-label={labels.trailer}>
    {children && <div className="game-details__media-switch" role="group" aria-label={labels.trailer}>
      <button type="button" aria-pressed={mode === "photos"} onClick={() => setMode("photos")}>{labels.photos}</button>
      <button type="button" aria-pressed={mode === "trailer"} onClick={() => setMode("trailer")}>{labels.trailer}</button>
    </div>}
    {mode === "photos" ? children : <>
      {busy && <p role="status">{t("searching_button")}</p>}
      {error && <p role="status">{labels.error}</p>}
      <GameVideo metadata={{ name: movie.name, videos: video ? [{ video_id: video.id, name: video.name, channel: video.channel }] : [] }}
        t={translate} searchQuery={query} preferredVideo={movie.preferredVideo} onSaveVideo={onSaveVideo} />
    </>}
  </section>;
}
