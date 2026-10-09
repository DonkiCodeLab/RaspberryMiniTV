import React, { useEffect, useState } from "react";
import LibraryPoster from "./LibraryPoster";
import { gameScreenshots } from "./gameScreenshots.js";
import emptyStateIcon from "./assets/empty.png";
import "./GameLibraryCard.css";

function ScreenshotPreview({ sources, cover }) {
  const [images, setImages] = useState([]);
  const [step, setStep] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const pending = sources.map(src => new Image());
    Promise.all(pending.map((image, index) => new Promise(resolve => {
      image.onload = () => resolve(sources[index]);
      image.onerror = () => resolve(null);
      image.src = sources[index];
    }))).then(loaded => {
      if (!cancelled) setImages(loaded.filter(Boolean));
    });
    return () => {
      cancelled = true;
      pending.forEach(image => { image.onload = null; image.onerror = null; });
    };
  }, [sources]);

  useEffect(() => {
    if (images.length < 2) return;
    const timer = setInterval(() => setStep(value => value + 1), 2500);
    return () => clearInterval(timer);
  }, [images]);

  if (!images.length) return null;
  const current = images[step % images.length];
  const previous = step ? images[(step - 1) % images.length] : cover;
  return <span className="game-card-preview" aria-hidden="true" key={step}>
    <span className={`game-card-preview__slide game-card-preview__slide--out${step ? "" : " game-card-preview__slide--cover"}`}>
      <img src={previous} alt="" />
    </span>
    <span className="game-card-preview__slide game-card-preview__slide--in">
      <img src={current} alt="" />
    </span>
  </span>;
}

export default function GameLibraryCard({ game, label, onOpen, children }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const cover = game.coverImage || emptyStateIcon;
  const sourcesKey = JSON.stringify(gameScreenshots(game));
  const sources = React.useMemo(() => JSON.parse(sourcesKey), [sourcesKey]);
  return <article data-library-index className="movie-library__card game-library-card"
    onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }}
    onPointerLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <button className="movie-library__poster" type="button" onClick={onOpen} aria-label={label}>
      <LibraryPoster src={cover} name={game.name || game.file} />
      {(hovered || focused) && sources.length > 0 &&
        <ScreenshotPreview key={`${cover}:${sourcesKey}`} sources={sources} cover={cover} />}
    </button>
    {children}
  </article>;
}
