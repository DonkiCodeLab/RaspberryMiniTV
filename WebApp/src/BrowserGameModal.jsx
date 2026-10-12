import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./BrowserGameModal.css";

// Coordinates on the original 1080 × 957 header photograph, cropped at x=250.
const buttons = [
  { name: "up", input: 4, x: 357, y: 576, w: 53, h: 49 },
  { name: "down", input: 5, x: 357, y: 665, w: 53, h: 51 },
  { name: "left", input: 6, x: 310, y: 621, w: 50, h: 51 },
  { name: "right", input: 7, x: 405, y: 621, w: 50, h: 51 },
  { name: "A", input: 8, x: 721, y: 582, w: 72, h: 72 },
  { name: "B", input: 0, x: 628, y: 624, w: 72, h: 72 },
  { name: "Select", input: 2, x: 435, y: 766, w: 77, h: 34 },
  { name: "Start", input: 3, x: 532, y: 766, w: 77, h: 34 },
];
const keys = { ArrowUp: 4, ArrowDown: 5, ArrowLeft: 6, ArrowRight: 7, KeyZ: 8, KeyX: 0, KeyV: 2, Enter: 3 };

function GameSession({ game, onClose, t }) {
  const dialog = useRef(null);
  const frame = useRef(null);
  const clickTimers = useRef(new Map());
  const [expanded, setExpanded] = useState(false);
  const [ready, setReady] = useState(false);
  const isGameBoy = game.systemId === "gb";
  const framed = isGameBoy && !expanded;
  const origin = new URL(game.url, window.location.href).origin;
  const send = useCallback((message) => {
    if (origin !== "null") frame.current?.contentWindow?.postMessage({ channel: "minitv-gameboy", ...message }, origin);
  }, [origin]);

  useEffect(() => {
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current.showModal();
    return () => {
      clickTimers.current.forEach(clearTimeout);
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);

  useEffect(() => {
    if (!isGameBoy) return;
    const onMessage = (event) => {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow || event.data?.channel !== "minitv-gameboy") return;
      if (event.data.type === "ready") setReady(true);
      if (event.data.type === "close") onClose();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [isGameBoy, origin, onClose]);

  useEffect(() => {
    if (isGameBoy) send({ type: "presentation", framed });
  }, [isGameBoy, framed, ready, send]);

  useEffect(() => {
    if (!framed) return;
    const key = (event) => {
      const input = keys[event.code];
      if (input === undefined || event.altKey || event.metaKey || event.ctrlKey) return;
      // Enter/Space still activate focused interface buttons normally.
      if (event.target instanceof HTMLElement && (event.target.closest("input, select, textarea") ||
        (event.code === "Enter" && event.target.closest("button")))) return;
      event.preventDefault();
      if (event.repeat) return;
      send({ type: "input", input, pressed: event.type === "keydown" });
    };
    const release = () => send({ type: "release" });
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    window.addEventListener("blur", release);
    return () => {
      release();
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      window.removeEventListener("blur", release);
    };
  }, [framed, send]);

  const input = (button, pressed) => send({ type: "input", input: button.input, pressed });
  return createPortal(
    <dialog ref={dialog} className={`browser-player browser-game${isGameBoy ? " browser-game--gameboy" : ""}${expanded ? " browser-game--expanded" : ""}`}
      aria-label={t("browser_game_player")} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="browser-player__panel browser-game__panel">
        <header>
          <div className="browser-game__heading">
            <span>{isGameBoy ? "Nintendo Game Boy" : t("browser_game_player")}</span>
            <h2>{game.title}</h2>
          </div>
          <div className="browser-game__actions">
            {isGameBoy && <button type="button" className="browser-game__expand" aria-pressed={expanded}
              onClick={() => { send({ type: "release" }); setExpanded(value => !value); }}>
              {t(expanded ? "gameboy_show_console" : "gameboy_expand_screen")}
            </button>}
            <button type="button" onClick={onClose} aria-label={t("close")}>×</button>
          </div>
        </header>
        <div className="browser-game__stage">
          <div className={isGameBoy ? "gameboy-device" : "browser-game__display"}>
            {isGameBoy && <img className="gameboy-device__photo" src="/game-systems/iconic/gb/console.webp" alt="" draggable="false" />}
            <div className={isGameBoy ? "gameboy-device__screen" : "browser-game__screen"}>
              <iframe ref={frame} src={game.url} title={`${t("browser_game_player")}: ${game.title}`}
                allow="autoplay; fullscreen; gamepad; screen-wake-lock" allowFullScreen referrerPolicy="origin"
                onLoad={() => { if (isGameBoy) send({ type: "presentation", framed }); }} />
            </div>
            {isGameBoy && <>
              <span className={`gameboy-device__power${ready ? " is-on" : ""}`} aria-hidden="true" />
              <div className="gameboy-device__controls" role="group" aria-label={t("gameboy_controls")}>
                {buttons.map(button => <button key={button.name} type="button" disabled={!ready}
                  className={`gameboy-device__button gameboy-device__button--${button.name.toLowerCase()}`}
                  aria-label={t(`gameboy_button_${button.name.toLowerCase()}`)}
                  style={{ left: `${(button.x - 250) / 6}%`, top: `${button.y / 9.57}%`, width: `${button.w / 6}%`, height: `${button.h / 9.57}%` }}
                  onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); input(button, true); }}
                  onPointerUp={() => input(button, false)} onPointerCancel={() => input(button, false)}
                  onLostPointerCapture={() => input(button, false)} onBlur={() => input(button, false)}
                  onClick={(event) => {
                    // Assistive technology can activate a button without pointer/key events.
                    if (event.detail !== 0) return;
                    clearTimeout(clickTimers.current.get(button.input));
                    input(button, true);
                    clickTimers.current.set(button.input, setTimeout(() => input(button, false), 100));
                  }}
                  onKeyDown={(event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); if (!event.repeat) input(button, true); } }}
                  onKeyUp={(event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); input(button, false); } }}
                />)}
              </div>
            </>}
          </div>
        </div>
        {framed && <p className="gameboy-player__hint">{t("gameboy_keyboard_hint")}</p>}
      </div>
    </dialog>, document.body
  );
}

export default function BrowserGameModal(props) {
  return props.game ? <GameSession key={props.game.url} {...props} /> : null;
}
