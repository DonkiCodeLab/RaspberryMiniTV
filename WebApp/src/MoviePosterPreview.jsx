import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { moviePosterGeometry } from "./moviePosterGeometry.js";
import "./MoviePosterPreview.css";
import { findMovieTrailer } from "./api/raspberryApi";
import YouTubePreview, { loadYouTubeApi } from "./YouTubePreview.jsx";

export default function MoviePosterPreview({ movie, enabled, onClick, label, children, kind = "movie", view = "grid" }) {
  const [hovered, setHovered] = useState(false);
  const [resolved, setResolved] = useState(null);
  const [position, setPosition] = useState(null);
  const [playPreview, setPlayPreview] = useState(false);
  const anchor = useRef(null);
  const popup = useRef(null);
  const expanded = enabled && hovered && view === "list" && position;
  const mediaKey = `${kind}:${movie.tmdbId ?? movie.id}:${movie.name}`;
  const videoId = [movie.preferredVideo?.id, movie.trailer?.key, resolved?.key === mediaKey ? resolved.video?.id : null]
    .find(id => typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id));

  useEffect(() => {
    setPlayPreview(false);
    if (!enabled || !hovered) return;
    if (view !== "list") { setPlayPreview(true); return; }
    const timer = window.setTimeout(() => setPlayPreview(true), 2000);
    return () => window.clearTimeout(timer);
  }, [enabled, hovered, view, mediaKey]);

  useEffect(() => {
    if (!enabled || !hovered) return;
    const stop = () => { setHovered(false); setPlayPreview(false); };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);
    window.addEventListener("resize", stop);
    window.addEventListener("scroll", stop, true);
    return () => {
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop);
      window.removeEventListener("resize", stop);
      window.removeEventListener("scroll", stop, true);
    };
  }, [enabled, hovered, mediaKey, view]);

  useEffect(() => {
    if (!enabled || !hovered || videoId || resolved?.key === mediaKey) return;
    const controller = new AbortController();
    findMovieTrailer(movie, controller.signal, kind).then(result => {
      if (!controller.signal.aborted) setResolved({ key: mediaKey, video: result.video });
    }).catch(() => {});
    return () => controller.abort();
  }, [enabled, hovered, videoId, mediaKey, kind, resolved, movie.id, movie.tmdbId, movie.name]);

  function stop(event) {
    const target = event?.relatedTarget;
    if (target?.nodeType && (anchor.current?.contains(target) || popup.current?.contains(target))) return;
    setHovered(false);
    setPlayPreview(false);
  }

  function open() {
    setHovered(false); setPlayPreview(false); onClick();
  }

  const preview = enabled && hovered && playPreview && videoId ? <YouTubePreview
    key={videoId}
    videoId={videoId}
    title={`${movie.name} — ${movie.preferredVideo?.name || movie.trailer?.name || "Tráiler"}`}
  /> : null;

  return <div ref={anchor} className="movie-library__poster movie-poster-preview"
    onPointerEnter={event => {
      if (enabled && event.pointerType === "mouse") {
        if (view === "list") {
          const rectangle = anchor.current.getBoundingClientRect();
          const library = anchor.current.closest(".movie-library__items");
          setPosition(moviePosterGeometry(rectangle, library?.clientWidth || window.innerWidth,
            window.innerWidth, window.innerHeight, parseFloat(getComputedStyle(document.documentElement).fontSize) || 16));
        }
        loadYouTubeApi().catch(() => {});
        setHovered(true);
      }
    }}
    onPointerLeave={stop} onPointerCancel={() => stop()}>
    <button className="movie-poster-preview__button" type="button" aria-label={label} onClick={open}>
      {children}
    </button>
    {view !== "list" && preview}
    {expanded && createPortal(<div ref={popup} className="movie-poster-preview__expanded" style={position}
      onPointerLeave={stop} onPointerCancel={() => stop()}>
      <button className="movie-poster-preview__button" type="button" aria-label={label} onClick={open}>{children}</button>
      {preview}
    </div>, document.body)}
  </div>;
}
