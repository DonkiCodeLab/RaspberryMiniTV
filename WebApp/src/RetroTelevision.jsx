import React, { useLayoutEffect, useRef, useState } from "react";
import LoadingSpinner from "./LoadingSpinner.jsx";
import { observeTelevisionImage } from "./televisionArtwork.js";
import "./RetroTelevision.css";

export default function RetroTelevision({ television, children, t }) {
  const image = useRef(null);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const artworkState = television.image ? status : "ready";

  useLayoutEffect(() => {
    if (!television.image) return;
    // Hide the previous screen before the browser can paint the new geometry.
    setStatus("loading");
    return observeTelevisionImage(image.current, setStatus);
  }, [television.image, attempt]);

  return <div className="mega-drive-tv" data-television={television.id}
    data-artwork-state={artworkState} aria-busy={artworkState === "loading"}>
    {television.image && <img key={`${television.image}:${attempt}`} ref={image} className="retro-television"
      src={`/game-televisions/${television.image}`} alt="" draggable="false" decoding="async" />}
    {children}
    {artworkState !== "ready" && <div className="television-artwork-status" role="status">
      {artworkState === "loading" && <LoadingSpinner />}
      <span>{t(artworkState === "error" ? "browser_game_shell_load_error" : "browser_game_loading_shell")}</span>
      {artworkState === "error" && <button type="button" onClick={() => setAttempt(value => value + 1)}>
        {t("browser_game_retry_shell")}
      </button>}
    </div>}
  </div>;
}
