import React, { useEffect, useState } from "react";
import { findMovieTrailer } from "./api/raspberryApi";
import YouTubePreview, { loadYouTubeApi } from "./YouTubePreview.jsx";

export default function MoviePosterPreview({ movie, enabled, onClick, label, children, kind = "movie" }) {
  const [hovered, setHovered] = useState(false);
  const [resolved, setResolved] = useState(null);
  const mediaKey = `${kind}:${movie.tmdbId ?? movie.id}:${movie.name}`;
  const videoId = [movie.preferredVideo?.id, movie.trailer?.key, resolved?.key === mediaKey ? resolved.video?.id : null]
    .find(id => typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id));

  useEffect(() => {
    if (!enabled || !hovered) return;
    const stop = () => setHovered(false);
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);
    return () => {
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop);
    };
  }, [enabled, hovered, mediaKey]);

  useEffect(() => {
    if (!enabled || !hovered || videoId || resolved?.key === mediaKey) return;
    const controller = new AbortController();
    findMovieTrailer(movie, controller.signal, kind).then(result => {
      if (!controller.signal.aborted) setResolved({ key: mediaKey, video: result.video });
    }).catch(() => {});
    return () => controller.abort();
  }, [enabled, hovered, videoId, mediaKey, kind, resolved, movie.id, movie.tmdbId, movie.name]);

  function stop() {
    setHovered(false);
  }

  return <div className="movie-library__poster movie-poster-preview"
    onPointerEnter={event => {
      if (enabled && event.pointerType === "mouse") {
        loadYouTubeApi().catch(() => {});
        setHovered(true);
      }
    }}
    onPointerLeave={stop} onPointerCancel={stop}>
    <button className="movie-poster-preview__button" type="button" aria-label={label}
      onClick={() => { stop(); onClick(); }}>
      {children}
    </button>
    {enabled && hovered && videoId && <YouTubePreview
      key={videoId}
      videoId={videoId}
      title={`${movie.name} — ${movie.preferredVideo?.name || movie.trailer?.name || "Tráiler"}`}
    />}
  </div>;
}
