import React from "react";
import { bindingLabel, directionSymbols } from "./gameInputMapping.js";

const arrows = { ArrowUp: "↑", ArrowLeft: "←", ArrowDown: "↓", ArrowRight: "→" };
export const DIRECTION_KEYS = Object.keys(arrows);

export default function GameKeyboardKeys({ codes = [], frame, pressedInputs, inputs, bindings, t }) {
  if (bindings && inputs) {
    const caps = input => <span className="game-keycaps game-keycaps--mapped">
      {bindings[input]?.length ? bindings[input].map((binding, index) => <kbd key={index} title={bindingLabel(binding, t)}
        aria-label={bindingLabel(binding, t)} className={pressedInputs.has(input) ? "is-pressed" : undefined}>{bindingLabel(binding, t, true)}</kbd>) : <kbd title={t("game_mapping_unassigned")}>—</kbd>}
    </span>;
    return inputs.length === 1 ? caps(inputs[0]) : <span className="game-keycaps--directions">{inputs.map(input =>
      <span className="game-keycaps__direction" key={input}><b aria-hidden="true">{directionSymbols[input]}</b>{caps(input)}</span>)}</span>;
  }
  return <span className={`game-keycaps${codes.length === 4 ? " game-keycaps--arrows" : ""}`}>
    {codes.map(code => <kbd key={code} className={pressedInputs.has(frame.keys[code]) ? "is-pressed" : undefined}>
      {arrows[code] || code.replace(/^Key/, "")}
    </kbd>)}
  </span>;
}
