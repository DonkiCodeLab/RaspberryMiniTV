import React, { useEffect, useState } from "react";
import { findMovieTrailer } from "./api/raspberryApi";
import YouTubePreview from "./YouTubePreview.jsx";

export default function MoviePosterPreview({ movie, enabled, onClick, label, children, kind = "movie" }) {
  const [hovered, setHovered] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [resolved, setResolved] = useState(null);
  const mediaKey = `${kind}:${movie.tmdbId ?? movie.id}:${movie.name}`;
  const videoId = [movie.preferredVideo?.id, movie.trailer?.key, resolved?.key === mediaKey ? resolved.video?.id : null]
    .find(id => typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id));

  useEffect(() => {
    setPlaying(false);
    if (!enabled || !hovered) return;
    const timer = window.setTimeout(() => setPlaying(true), 450);
    const stop = () => { setHovered(false); setPlaying(false); };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop);
    };
  }, [enabled, hovered, mediaKey]);

  useEffect(() => {
    if (!enabled || !hovered || !playing || videoId || resolved?.key === mediaKey) return;
    const controller = new AbortController();
    findMovieTrailer(movie, controller.signal, kind).then(result => {
      if (!controller.signal.aborted) setResolved({ key: mediaKey, video: result.video });
    }).catch(() => {});
    return () => controller.abort();
  }, [enabled, hovered, playing, videoId, mediaKey, kind, resolved, movie.id, movie.tmdbId, movie.name]);

  function stop() {
    setHovered(false);
    setPlaying(false);
  }

  return <div className="movie-library__poster movie-poster-preview"
    onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }}
    onPointerLeave={stop} onPointerCancel={stop}>
    <button className="movie-poster-preview__button" type="button" aria-label={label}
      onClick={() => { stop(); onClick(); }}>
      {children}
    </button>
    {enabled && hovered && playing && videoId && <YouTubePreview
      key={videoId}
      videoId={videoId}
      title={`${movie.name} — ${movie.preferredVideo?.name || movie.trailer?.name || "Tráiler"}`}
    />}
  </div>;
}
