import { lockBodyScroll } from "./bodyScrollLock.js";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { gameConsoleFrame, frameRectangle, frameVariables } from "./gameConsoleFrames.js";
import RetroTelevision from "./RetroTelevision.jsx";
import MegaDriveController from "./MegaDriveController.jsx";
import { GAME_TELEVISIONS, gameTelevision, readGameTelevision, saveGameTelevision, televisionVariables } from "./gameTelevisions.js";
import GameBoyVector from "./GameBoyVector.jsx";
import HandheldKeyboardHelp from "./HandheldKeyboardHelp.jsx";
import TelevisionKeyboardHelp from "./TelevisionKeyboardHelp.jsx";
import { readGameVolume, saveGameVolume } from "./gameAudio.js";
import "./BrowserGameModal.css";

function GameSession({ game, onClose, t }) {
  const consoleFrame = gameConsoleFrame(game.systemId);
  const hasConsoleFrame = Boolean(consoleFrame);
  const isTelevision = consoleFrame?.layout === "television";
  const helpStorageKey = isTelevision ? "minitv.televisionKeyboardHelp" : "minitv.handheldKeyboardHelp";
  const dialog = useRef(null);
  const frame = useRef(null);
  const clickTimers = useRef(new Map());
  const [expanded, setExpanded] = useState(false);
  const [showController, setShowController] = useState(true);
  const [keyboardHelp, setKeyboardHelp] = useState(() => {
    try { return window.localStorage.getItem(helpStorageKey) !== "false"; } catch { return true; }
  });
  const [ready, setReady] = useState(false);
  const [pressedInputs, setPressedInputs] = useState(() => new Set());
  const [volume, setVolume] = useState(readGameVolume);
  const [televisionId, setTelevisionId] = useState(readGameTelevision);
  const lastAudibleVolume = useRef(volume || 50);
  const emulatorVolume = useRef(null);
  const isHandheld = hasConsoleFrame && !isTelevision;
  const isVector = consoleFrame?.artwork === "vector";
  const television = gameTelevision(televisionId);
  const framed = hasConsoleFrame && !expanded;
  const origin = new URL(game.url, window.location.href).origin;
  const send = useCallback((message) => {
    if (origin !== "null") frame.current?.contentWindow?.postMessage({ channel: "minitv-gameboy", ...message }, origin);
  }, [origin]);

  useEffect(() => {
    const trigger = document.activeElement;
    const releaseScroll = lockBodyScroll();
    dialog.current.showModal();
    return () => {
      clickTimers.current.forEach(clearTimeout);
      releaseScroll();
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
        event.data.inputs.every(input => Object.values(consoleFrame.keys).includes(input))) {
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
    if (!hasConsoleFrame) return;
    try { window.localStorage.setItem(helpStorageKey, String(keyboardHelp)); } catch { /* Storage is optional. */ }
  }, [hasConsoleFrame, helpStorageKey, keyboardHelp]);

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
  const changePresentation = (value, event) => {
    send({ type: "release" });
    setExpanded(value);
    if (event.detail > 0) frame.current?.focus();
  };
  const photoUrl = `/game-systems/iconic/${game.systemId}/console.webp`;
  const gameScreen = <div className={hasConsoleFrame ? "gameboy-device__screen" : "browser-game__screen"}
    style={framed ? frameRectangle(isTelevision ? television : consoleFrame, isTelevision ? television.screen : consoleFrame.screen) : undefined}>
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
    >{!isVector && ["L", "R"].includes(button.name) ? button.name : null}</button>)}
  </div>;
  return createPortal(
    <dialog ref={dialog} className={`browser-player browser-game${hasConsoleFrame ? ` browser-game--console browser-game--gameboy browser-game--${game.systemId}` : ""}${isHandheld ? " browser-game--handheld" : ""}${isTelevision ? ` browser-game--television${showController ? "" : " browser-game--controller-hidden"}` : ""}${isVector ? " browser-game--vector" : ""}${expanded ? " browser-game--expanded" : ""}`}
      data-television={isTelevision ? television.id : undefined}
      style={consoleFrame ? { ...frameVariables(consoleFrame), ...(isTelevision ? televisionVariables(television) : {}) } : undefined}
      aria-label={t("browser_game_player")} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="browser-player__panel browser-game__panel">
        <header>
          {hasConsoleFrame && <div className="browser-game__identity">
            <button type="button" className="browser-game__back" onClick={onClose}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6-6 6 6 6M4 12h16" /></svg>
              {t("game_file_label")}
            </button>
            {game.coverImage && <img className="browser-game__cover" src={game.coverImage} alt="" />}
            <div className="browser-game__heading">
              <span>{consoleFrame.name}{game.year ? ` · ${game.year}` : ""}</span>
              <h2>{game.title}</h2>
            </div>
          </div>}
          {!hasConsoleFrame && <div className="browser-game__heading">
            <span>{consoleFrame?.name || t("browser_game_player")}</span>
            <h2>{game.title}</h2>
          </div>}
          {isHandheld && <div className="browser-game__view-switch" role="group" aria-label={t("gameboy_view")}>
            <button type="button" aria-pressed={!expanded} onClick={event => changePresentation(false, event)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M9 5h6v6H9zM8 16h4m-2-2v4m4-3h1m0 3h1" /></svg>
              {t("gameboy_shell")}
            </button>
            <button type="button" aria-pressed={expanded} onClick={event => changePresentation(true, event)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M7 9h10v6H7z" /></svg>
              {t("gameboy_large_screen")}
            </button>
          </div>}
          {isTelevision && <div className="browser-game__television-picker">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="20" height="15" rx="3" /><path d="m8 2 4 4 4-4M6 10h9v7H6zM18 11v1m0 3v1" /></svg>
            <select aria-label={t("browser_game_television_shell")} value={televisionId} onChange={event => {
              send({ type: "release" });
              setTelevisionId(event.target.value);
              saveGameTelevision(event.target.value);
            }}>
              {GAME_TELEVISIONS.map(tv => <option key={tv.id} value={tv.id}>{t(`browser_game_shell_${tv.id}`)}</option>)}
            </select>
          </div>}
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
            {isTelevision && <button type="button" className="browser-game__help-switch browser-game__controller-toggle" role="switch" aria-checked={showController}
              aria-controls="television-controller-dock" onClick={event => {
                send({ type: "release" });
                setShowController(value => !value);
                if (event.detail > 0) frame.current?.focus();
              }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="6" /><path d="M5 12h6m-3-3v6m7-4h1m2 2h1" /></svg>
              <span>{t("browser_game_show_controller")}</span><span className="browser-game__switch-track" aria-hidden="true" />
            </button>}
            {hasConsoleFrame && (!isTelevision || showController) && <button type="button" className="browser-game__help-switch" role="switch" aria-checked={keyboardHelp}
              aria-label={t(isTelevision ? "browser_game_controller_help" : "gameboy_keyboard_help")} onClick={event => {
                setKeyboardHelp(value => !value);
                if (event.detail > 0) frame.current?.focus();
              }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M6 9h1m4 0h1m4 0h1M6 12h1m4 0h1m4 0h1M7 15h10" /></svg>
              <span>{t("gameboy_help")}</span><span className="browser-game__switch-track" aria-hidden="true" />
            </button>}
            {!hasConsoleFrame && <button type="button" onClick={onClose} aria-label={t("close")}>×</button>}
          </div>
        </header>
        <div className={`browser-game__stage${isTelevision ? " television-stage" : ""}`}>
          {isTelevision ? <div className="television-player">
            <RetroTelevision television={television} t={t}>{gameScreen}</RetroTelevision>
            <TelevisionKeyboardHelp frame={consoleFrame} pressedInputs={pressedInputs} compact t={t} />
          </div> :
          <div className={isHandheld ? "handheld-player" : "browser-game__display"}>
            <div className={hasConsoleFrame ? "gameboy-device" : "browser-game__display"}>
              {isVector ? <GameBoyVector systemId={game.systemId} pressedInputs={pressedInputs} ready={ready} /> : hasConsoleFrame &&
                <img className="gameboy-device__photo" src={photoUrl}
                  style={frameRectangle(consoleFrame, [0, 0, ...consoleFrame.image])} alt="" draggable="false" />}
              {gameScreen}
              {hasConsoleFrame && <>
                {!isVector && <span className={`gameboy-device__power${ready ? " is-on" : ""}`}
                  style={frameRectangle(consoleFrame, consoleFrame.power)} aria-hidden="true" />}
                {controls}
              </>}
            </div>
            {isHandheld && <HandheldKeyboardHelp frame={consoleFrame} systemId={game.systemId}
              annotated={keyboardHelp && framed} pressedInputs={pressedInputs} t={t} />}
          </div>}
        </div>
        {isTelevision && <div id="television-controller-dock" hidden={!showController}
          className={`television-controller-dock${keyboardHelp ? " television-controller-dock--annotated" : ""}`}>
          <div className="mega-drive-controller">
            <MegaDriveController pressedInputs={pressedInputs} />{controls}
            {keyboardHelp && <TelevisionKeyboardHelp frame={consoleFrame} pressedInputs={pressedInputs} annotations t={t} />}
          </div>
        </div>}
      </div>
    </dialog>, document.body
  );
}

export default function BrowserGameModal(props) {
  return props.game ? <GameSession key={props.game.url} {...props} /> : null;
}
