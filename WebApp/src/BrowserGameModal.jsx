import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { gameConsoleFrame, frameRectangle, frameVariables } from "./gameConsoleFrames.js";
import RetroTelevision from "./RetroTelevision.jsx";
import GameBoyVector from "./GameBoyVector.jsx";
import { readGameVolume, saveGameVolume } from "./gameAudio.js";
import "./BrowserGameModal.css";

function GameSession({ game, onClose, t }) {
  const dialog = useRef(null);
  const frame = useRef(null);
  const clickTimers = useRef(new Map());
  const [expanded, setExpanded] = useState(false);
  const [ready, setReady] = useState(false);
  const [pressedInputs, setPressedInputs] = useState(() => new Set());
  const [volume, setVolume] = useState(readGameVolume);
  const lastAudibleVolume = useRef(volume || 50);
  const emulatorVolume = useRef(null);
  const consoleFrame = gameConsoleFrame(game.systemId);
  const hasConsoleFrame = Boolean(consoleFrame);
  const isTelevision = consoleFrame?.layout === "television";
  const isVector = consoleFrame?.artwork === "vector";
  const framed = hasConsoleFrame && !expanded;
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
    const onMessage = (event) => {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow || event.data?.channel !== "minitv-gameboy") return;
      if (event.data.type === "ready") setReady(true);
      if (event.data.type === "close") onClose();
      if (event.data.type === "volume-state" && typeof event.data.volume === "number" &&
        Number.isFinite(event.data.volume) && event.data.volume >= 0 && event.data.volume <= 1) {
        const value = Math.round(event.data.volume * 100);
        emulatorVolume.current = value;
        setVolume(value);
      }
      if (consoleFrame && event.data.type === "input-state" && Array.isArray(event.data.inputs) &&
        event.data.inputs.every(input => consoleFrame.buttons.some(button => button.input === input))) {
        setPressedInputs(new Set(event.data.inputs));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [hasConsoleFrame, consoleFrame, origin, onClose]);

  useEffect(() => {
    if (volume > 0) lastAudibleVolume.current = volume;
    saveGameVolume(volume);
    // Do not echo native mute events: EmulatorJS preserves its previous level.
    if (ready && emulatorVolume.current !== volume) {
      emulatorVolume.current = volume;
      send({ type: "volume", volume: volume / 100 });
    }
  }, [volume, ready, send]);

  useEffect(() => {
    if (hasConsoleFrame) send({ type: "presentation", framed });
  }, [hasConsoleFrame, framed, ready, send]);

  useEffect(() => {
    if (!framed) return;
    const key = (event) => {
      const input = consoleFrame.keys[event.code];
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
  }, [framed, consoleFrame, send]);

  const input = (button, pressed) => send({ type: "input", input: button.input, pressed });
  const photoUrl = `/game-systems/iconic/${game.systemId}/console.webp`;
  const gameScreen = <div className={hasConsoleFrame ? "gameboy-device__screen" : "browser-game__screen"}
    style={framed && !isTelevision ? frameRectangle(consoleFrame, consoleFrame.screen) : undefined}>
    <iframe ref={frame} src={game.url} title={`${t("browser_game_player")}: ${game.title}`}
      allow="autoplay; fullscreen; gamepad; screen-wake-lock" allowFullScreen referrerPolicy="origin"
      onLoad={() => { if (hasConsoleFrame) send({ type: "presentation", framed }); }} />
  </div>;
  const controls = hasConsoleFrame && <div className="gameboy-device__controls" role="group" aria-label={t("gameboy_controls")}>
    {consoleFrame.buttons.map(button => <button key={button.name} type="button" disabled={!ready}
      className={`gameboy-device__button gameboy-device__button--${button.name.toLowerCase()}${pressedInputs.has(button.input) ? " is-pressed" : ""}`}
      data-console-button={button.name.toLowerCase()} data-pressed={pressedInputs.has(button.input)}
      aria-label={t(`${isTelevision && ![3, 4, 5, 6, 7].includes(button.input) ? "megadrive" : "gameboy"}_button_${button.name.toLowerCase()}`)}
      style={{ ...frameRectangle(consoleFrame, [button.x, button.y, button.w, button.h]), transform: `rotate(${button.rotation}deg)` }}
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
    >{isTelevision ? <span className="mega-drive-controller__surface" aria-hidden="true"
      style={{ backgroundImage: `url(${photoUrl})`,
        backgroundSize: `${consoleFrame.image[0] / button.w * 100}% ${consoleFrame.image[1] / button.h * 100}%`,
        backgroundPosition: `${button.x / (consoleFrame.image[0] - button.w) * 100}% ${button.y / (consoleFrame.image[1] - button.h) * 100}%` }}
      >{button.name === "Mode" ? "MODE" : null}</span> : ["L", "R"].includes(button.name) ? button.name : null}</button>)}
  </div>;
  return createPortal(
    <dialog ref={dialog} className={`browser-player browser-game${hasConsoleFrame ? ` browser-game--gameboy browser-game--${game.systemId}` : ""}${isVector ? " browser-game--vector" : ""}${expanded ? " browser-game--expanded" : ""}`}
      style={consoleFrame ? frameVariables(consoleFrame) : undefined}
      aria-label={t("browser_game_player")} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="browser-player__panel browser-game__panel">
        <header>
          <div className="browser-game__heading">
            <span>{consoleFrame?.name || t("browser_game_player")}</span>
            <h2>{game.title}</h2>
          </div>
          <div className="browser-game__actions">
            <div className="browser-game__volume" role="group" aria-label={t("browser_game_volume")}>
              <button type="button" className="browser-game__mute" disabled={!ready}
                onClick={() => setVolume(value => value === 0 ? lastAudibleVolume.current : 0)}
                aria-label={t(volume === 0 ? "browser_game_unmute" : "browser_game_mute")}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4 5 9H2v6h3l6 5Z" />
                  {volume === 0 ? <path d="m16 9 6 6m0-6-6 6" /> : <><path d="M15 8c3 2 3 6 0 8" /><path d="M18 4c6 4 6 12 0 16" /></>}
                </svg>
              </button>
              <input type="range" min="0" max="100" step="1" value={volume} disabled={!ready}
                aria-label={t("browser_game_volume")} aria-valuetext={`${volume}%`}
                onChange={event => setVolume(Number(event.target.value))} />
              <output aria-hidden="true">{volume}%</output>
            </div>
            {hasConsoleFrame && <button type="button" className="browser-game__expand" aria-pressed={expanded}
              onClick={() => { send({ type: "release" }); setExpanded(value => !value); }}>
              {t(expanded ? "gameboy_show_console" : "gameboy_expand_screen")}
            </button>}
            <button type="button" onClick={onClose} aria-label={t("close")}>×</button>
          </div>
        </header>
        <div className="browser-game__stage">
          {isTelevision ? <div className="mega-drive-setup">
            <div className="mega-drive-tv"><RetroTelevision ready={ready} />{gameScreen}</div>
            <div className="mega-drive-controller">
              <img src={photoUrl} alt="" draggable="false" />{controls}
            </div>
          </div> :
          <div className={hasConsoleFrame ? "gameboy-device" : "browser-game__display"}>
            {isVector ? <GameBoyVector pressedInputs={pressedInputs} ready={ready} /> : hasConsoleFrame &&
              <img className="gameboy-device__photo" src={photoUrl}
                style={frameRectangle(consoleFrame, [0, 0, ...consoleFrame.image])} alt="" draggable="false" />}
            {gameScreen}
            {hasConsoleFrame && <>
              {!isVector && <span className={`gameboy-device__power${ready ? " is-on" : ""}`}
                style={frameRectangle(consoleFrame, consoleFrame.power)} aria-hidden="true" />}
              {controls}
            </>}
          </div>}
        </div>
        {framed && <p className="gameboy-player__hint">{t(isTelevision ? "megadrive_keyboard_hint" : "gameboy_keyboard_hint")}{game.systemId === "gba" ? " · Q: L · E: R" : ""}</p>}
      </div>
    </dialog>, document.body
  );
}

export default function BrowserGameModal(props) {
  return props.game ? <GameSession key={props.game.url} {...props} /> : null;
}
