import React, { useEffect, useState } from "react";
import "./PlayerSizeControl.css";

export function usePlayerSize(kind) {
  const key = `minitv.${kind}.screenSize`;
  const [size, setSize] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      const value = stored === null ? 100 : Number(stored);
      return Number.isFinite(value) ? Math.min(100, Math.max(30, value)) : 100;
    } catch { return 100; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(key, String(size)); }
    catch { /* Resizing remains available without storage. */ }
  }, [key, size]);
  return [size, setSize];
}

export default function PlayerSizeControl({ size, onChange, t }) {
  return <label className="player-size-control">
    <span>{t("browser_player_size")}</span>
    <input type="range" min="30" max="100" step="1" value={size}
      aria-label={t("browser_player_size")} aria-valuetext={`${size}%`}
      onChange={event => onChange(Number(event.target.value))} />
    <output aria-hidden="true">{size}%</output>
  </label>;
}
