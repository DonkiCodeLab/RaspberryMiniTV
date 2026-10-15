import React from "react";
import GameKeyboardKeys, { DIRECTION_KEYS } from "./GameKeyboardKeys.jsx";

export default function HandheldKeyboardHelp({ frame, systemId, annotated, pressedInputs, t }) {
  const [left, top, width, height] = frame.crop;
  const dpad = frame.buttons.find(button => button.name === "left");
  const controls = [
    { name: "dpad", label: t("gameboy_dpad"), codes: DIRECTION_KEYS, side: "left",
      x: dpad.x, y: dpad.y + dpad.h / 2 },
    ...["A", "B", "Start", "Select", "L", "R"].flatMap(name => {
      const button = frame.buttons.find(button => button.name === name);
      if (!button) return [];
      return [{ name, label: name, codes: Object.keys(frame.keys).filter(code => frame.keys[code] === button.input),
        side: name === "Select" || name === "L" || (systemId === "gba" && name === "Start") ? "left" : "right",
        x: button.x + button.w / 2, y: button.y + button.h / 2 }];
    }),
  ].map(control => {
    const x = (control.x - left) / width * 100;
    const y = (control.y - top) / height * 100;
    const advanceY = { dpad: 42, A: 37, B: 61, Start: 76, Select: 95, L: 4, R: 4 };
    const labelY = systemId === "gba" ? advanceY[control.name]
      : y - ({ A: 8, Start: 5 }[control.name] || 0);
    return { ...control, x, y, labelY };
  });

  return <aside className={`handheld-help handheld-help--${annotated ? "annotated" : "compact"}`}
    aria-label={t("gameboy_controls")}>
    {!annotated && <h3>{t("gameboy_quick_guide")}</h3>}
    {annotated && <svg className="handheld-help__lines" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {controls.map(control => {
        const x = control.x / 100 * width, y = control.y / 100 * height;
        const labelY = control.labelY / 100 * height;
        const end = (control.side === "left" ? -.08 : 1.08) * width;
        return <g key={control.name}>
          <path d={`M ${x} ${y} V ${labelY} H ${end}`} />
          <circle cx={x} cy={y} r="4" />
        </g>;
      })}
    </svg>}
    <ul>
      {controls.map(control => <li key={control.name}
        className={`handheld-help__mapping handheld-help__mapping--${control.name.toLowerCase()} handheld-help__mapping--${control.side}`}
        style={annotated ? { top: `${control.labelY}%` } : undefined}>
        {control.name === "dpad" && annotated && <span className="handheld-help__dpad-title">{control.label}</span>}
        <GameKeyboardKeys codes={control.codes} frame={frame} pressedInputs={pressedInputs} />
        {(control.name !== "dpad" || !annotated) && <>
          <span className="handheld-help__arrow" aria-hidden="true">→</span>
          <span className={`handheld-help__button${["A", "B"].includes(control.name) ? " handheld-help__button--round" : ""}`}>{control.label}</span>
        </>}
      </li>)}
    </ul>
  </aside>;
}
