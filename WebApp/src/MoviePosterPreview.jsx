import { useUiText } from "./i18n/react.js";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { moviePosterGeometry } from "./moviePosterGeometry.js";
import "./MoviePosterPreview.css";
import { findMovieTrailer } from "./api/raspberryApi";
import YouTubePreview, { loadYouTubeApi } from "./YouTubePreview.jsx";

export default function MoviePosterPreview({ movie, enabled, onClick, label, children, kind = "movie", view = "grid" }) {
  const ui = useUiText();
  const [hovered, setHovered] = useState(false);
  const [resolved, setResolved] = useState(null);
  const [position, setPosition] = useState(null);
  const [actionsPosition, setActionsPosition] = useState(null);
  const [playPreview, setPlayPreview] = useState(false);
  const anchor = useRef(null);
  const popup = useRef(null);
  const expanded = enabled && hovered && playPreview && view === "list" && position;
  const mediaKey = `${kind}:${movie.tmdbId ?? movie.id}:${movie.name}`;
  const videoId = [movie.preferredVideo?.id, movie.trailer?.key, resolved?.key === mediaKey ? resolved.video?.id : null]
    .find(id => typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id));

  useEffect(() => {
    setPlayPreview(false);
  }, [enabled, view, mediaKey]);

  useEffect(() => {
    if (enabled && hovered) loadYouTubeApi().catch(() => {});
  }, [enabled, hovered]);

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

  const actions = enabled && !playPreview ? <div className="movie-poster-preview__actions">
    <button type="button" className="movie-poster-preview__details" onClick={open}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6" />
        <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
      </svg>
      <span>{ui("View title details")}</span>
    </button>
    <button type="button" className="movie-poster-preview__play" disabled={!videoId}
      onClick={() => { setHovered(true); setPlayPreview(true); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8Z" fill="#ff0000" />
        <path d="m9.5 8.4 6.3 3.6-6.3 3.6Z" fill="#fff" />
      </svg>
      <span>{ui("Watch trailer")}</span>
    </button>
  </div> : null;

  const preview = enabled && hovered && playPreview && videoId ? <YouTubePreview
    key={videoId}
    videoId={videoId}
    title={`${movie.name} — ${movie.preferredVideo?.name || movie.trailer?.name || ui("Trailer")}`}
  /> : null;

  return <div ref={anchor} className={`movie-library__poster movie-poster-preview${preview ? " movie-poster-preview--requested" : ""}`}
    onPointerEnter={event => {
      if (enabled && event.pointerType === "mouse") {
        if (view === "list") {
          const rectangle = anchor.current.getBoundingClientRect();
          const library = anchor.current.closest(".movie-library__items");
          setActionsPosition({ left: Math.max(12, Math.min(rectangle.left, window.innerWidth - 192)),
            top: Math.max(12, Math.min(rectangle.top, window.innerHeight - 112)), width: 180 });
          setPosition(moviePosterGeometry(rectangle, library?.clientWidth || window.innerWidth,
            window.innerWidth, window.innerHeight, parseFloat(getComputedStyle(document.documentElement).fontSize) || 16));
        }
        setHovered(true);
      }
    }}
    onFocus={() => { if (enabled && view !== "list") setHovered(true); }}
    onBlur={stop}
    onPointerLeave={stop} onPointerCancel={() => stop()}>
    <button className="movie-poster-preview__button" type="button" aria-label={label} onClick={open}>
      {children}
    </button>
    {view !== "list" && actions}
    {view !== "list" && preview}
    {enabled && hovered && !playPreview && view === "list" && actionsPosition && createPortal(
      <div ref={popup} className="movie-poster-preview__list-actions" style={actionsPosition}
        onPointerLeave={stop} onPointerCancel={() => stop()} onBlur={stop}>{actions}</div>, document.body)}
    {expanded && createPortal(<div ref={popup} className="movie-poster-preview__expanded" style={position}
      onPointerLeave={stop} onPointerCancel={() => stop()}>
      <button className="movie-poster-preview__button" type="button" aria-label={label} onClick={open}>{children}</button>
      {preview}
    </div>, document.body)}
  </div>;
}
