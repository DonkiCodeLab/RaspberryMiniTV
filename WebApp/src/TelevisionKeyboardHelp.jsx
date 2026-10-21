import React from "react";
import { frameRectangle } from "./gameConsoleFrames.js";
import GameKeyboardKeys, { DIRECTION_KEYS } from "./GameKeyboardKeys.jsx";
import { DIRECTION_INPUTS } from "./gameInputMapping.js";

export default function TelevisionKeyboardHelp({ frame, pressedInputs, bindings, annotations = false, compact = false, t }) {
  const keys = input => Object.keys(frame.keys).filter(code => frame.keys[code] === input);
  const dpad = <div className="television-help__dpad">
    <h3>{t("gameboy_dpad")}</h3>
    <GameKeyboardKeys codes={DIRECTION_KEYS} inputs={DIRECTION_INPUTS} bindings={bindings} t={t} frame={frame} pressedInputs={pressedInputs} />
  </div>;

  if (annotations) {
    const left = frame.buttons.find(button => button.name === "left");
    const [x, y, width, height] = frame.crop;
    return <div className="television-help television-help--annotations" aria-hidden="true">
      {dpad}
      <svg className="television-help__line" viewBox={`0 0 ${width} ${height}`}>
        <path d={`M ${left.x - x} ${left.y + left.h / 2 - y} H ${-.14 * width}`} />
      </svg>
      {frame.buttons.filter(button => ["A", "B", "C", "Start"].includes(button.name)).map(button =>
        <span key={button.name} className={`television-help__on-button television-help__on-button--${button.name.toLowerCase()}`}
          style={frameRectangle(frame, [button.x + button.w / 2,
            button.y + (button.name === "Start" ? -button.h * .35 : button.h * 1.05), 0, 0])}>
          <GameKeyboardKeys codes={keys(button.input)} inputs={[button.input]} bindings={bindings} t={t} frame={frame} pressedInputs={pressedInputs} />
        </span>)}
    </div>;
  }

  const groups = [
    { title: "browser_game_buttons", controls: frame.buttons.filter(button => ["A", "B", "C", "Start"].includes(button.name)) },
    { title: "browser_game_six_buttons", controls: [{ name: "X", input: 10 }, { name: "Y", input: 9 }, { name: "Z", input: 11 }, { name: "Mode", input: 2 }] },
  ];
  return <aside className={`television-help television-help--legend${compact ? " television-help--compact" : ""}`}
    aria-label={t("gameboy_quick_guide")}>
    {compact && dpad}
    {groups.map(group => <section key={group.title}>
      <h3>{t(group.title)}</h3>
      <ul>{group.controls.map(button => <li key={button.name}>
        <GameKeyboardKeys codes={keys(button.input)} inputs={[button.input]} bindings={bindings} t={t} frame={frame} pressedInputs={pressedInputs} />
        <span className="television-help__arrow" aria-hidden="true">→</span>
        <span className={`television-help__button${button.name.length === 1 ? " television-help__button--round" : ""}`}>{button.name}</span>
      </li>)}</ul>
    </section>)}
  </aside>;
}
