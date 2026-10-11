import React, { useEffect, useState } from "react";

export default function MoviePosterPreview({ movie, enabled, onClick, label, children }) {
  const [hovered, setHovered] = useState(false);
  const [playing, setPlaying] = useState(false);
  const videoId = [movie.preferredVideo?.id, movie.trailer?.key]
    .find(id => typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id));

  useEffect(() => {
    setPlaying(false);
    if (!enabled || !hovered || !videoId) return;
    const timer = window.setTimeout(() => setPlaying(true), 450);
    const stop = () => { setHovered(false); setPlaying(false); };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop);
    };
  }, [enabled, hovered, videoId]);

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
    {enabled && hovered && playing && videoId && <iframe
      key={videoId}
      className="movie-poster-preview__video"
      src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&playsinline=1&disablekb=1&fs=0&rel=0&loop=1&playlist=${videoId}`}
      title={`${movie.name} — ${movie.preferredVideo?.name || movie.trailer?.name || "Tráiler"}`}
      tabIndex={-1} aria-hidden="true"
      referrerPolicy="strict-origin-when-cross-origin"
      allow="autoplay; encrypted-media"
    />}
  </div>;
}
