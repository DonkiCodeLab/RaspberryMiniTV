import React from "react";

const arrows = { ArrowUp: "↑", ArrowLeft: "←", ArrowDown: "↓", ArrowRight: "→" };
export const DIRECTION_KEYS = Object.keys(arrows);

export default function GameKeyboardKeys({ codes, frame, pressedInputs }) {
  return <span className={`game-keycaps${codes.length === 4 ? " game-keycaps--arrows" : ""}`}>
    {codes.map(code => <kbd key={code} className={pressedInputs.has(frame.keys[code]) ? "is-pressed" : undefined}>
      {arrows[code] || code.replace(/^Key/, "")}
    </kbd>)}
  </span>;
}
