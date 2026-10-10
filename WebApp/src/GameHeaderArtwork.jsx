import React, { useState } from "react";
import { gameScreenshots } from "./gameScreenshots.js";
import emptyStateIcon from "./assets/empty.png";
import "./GameHeaderArtwork.css";

export default function GameHeaderArtwork({ game }) {
  const [failedImages, setFailedImages] = useState([]);
  const images = gameScreenshots(game).filter(image => !failedImages.includes(image)).slice(0, 2);
  const cover = game.coverImage && !failedImages.includes(game.coverImage) ? game.coverImage : emptyStateIcon;
  const markFailed = (src) => setFailedImages(previous => previous.includes(src) ? previous : [...previous, src]);

  return <div className={`game-header-artwork${images.length ? " game-header-artwork--with-screenshots" : ""}`}>
    <img className="game-header-artwork__cover" src={cover} alt="" draggable="false"
      onError={cover !== emptyStateIcon ? () => markFailed(cover) : undefined} />
    {images.length > 0 && <div className="game-header-artwork__screenshots">
      {images.map(src => <img key={src} src={src} alt="" draggable="false" onError={() => markFailed(src)} />)}
    </div>}
  </div>;
}
