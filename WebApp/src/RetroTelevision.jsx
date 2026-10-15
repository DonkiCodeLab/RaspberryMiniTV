import React from "react";

export default function RetroTelevision({ television }) {
  if (!television.image) return null;
  return <img className="retro-television"
    src={`/game-televisions/${television.image}`} alt="" draggable="false" />;
}
