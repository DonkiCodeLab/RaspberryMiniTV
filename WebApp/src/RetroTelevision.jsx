import React from "react";

// Separate image documents isolate the CorelDRAW class names in the supplied SVGs.
export default function RetroTelevision({ television }) {
  return <img className={`retro-television${television.monochrome ? " retro-television--monochrome" : ""}`}
    src={`/game-televisions/${television.id}.svg`} alt="" draggable="false" />;
}
