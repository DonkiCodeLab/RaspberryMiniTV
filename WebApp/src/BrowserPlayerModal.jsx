import { lockBodyScroll } from "./bodyScrollLock.js";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BrowserVideo from "./BrowserVideo.jsx";
import "./BrowserPlayerModal.css";

import PlayerSizeControl, { usePlayerSize } from "./PlayerSizeControl.jsx";

const SHELL_STORAGE_KEY = "minitv.video.showShell";

function VideoSession({ playback, onClose, t }) {
  const dialog = useRef(null);
  const [screenSize, setScreenSize] = usePlayerSize("video");
  const [showShell, setShowShell] = useState(() => {
    try { return window.localStorage.getItem(SHELL_STORAGE_KEY) !== "false"; }
    catch { return true; }
  });

  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement;
    const releaseScroll = lockBodyScroll();
    element.showModal();
    return () => {
      element.close();
      releaseScroll();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(SHELL_STORAGE_KEY, String(showShell)); }
    catch { /* Playback remains available when storage is blocked. */ }
  }, [showShell]);

  return createPortal(
    <dialog ref={dialog} className={`browser-player browser-video-player${showShell ? " browser-video-player--shell" : ""}`}
      style={{ "--player-screen-scale": screenSize / 100 }}
      aria-label={t("browser_player")} onCancel={event => { event.preventDefault(); onClose(); }}
      onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}>
      <div className="browser-player__panel browser-video-player__panel">
        <header>
          <div className="browser-video-player__heading">
            <span>{t("browser_player")}</span>
            <h2 title={playback.title}>{playback.title}</h2>
          </div>
          <button type="button" className="browser-video-player__shell-switch" role="switch"
            aria-checked={showShell} aria-controls="browser-video-stage"
            onClick={() => setShowShell(value => !value)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="20" height="15" rx="3" /><path d="m8 2 4 4 4-4M6 10h9v7H6zM18 11v1m0 3v1" /></svg>
            <span>{t("browser_player_shell")}</span>
            <span className="browser-video-player__switch-track" aria-hidden="true" />
          </button>
          <button className="browser-video-player__close" type="button" onClick={onClose} aria-label={t("close")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
          </button>
        </header>
        {!showShell && <PlayerSizeControl size={screenSize} onChange={setScreenSize} t={t} />}
        <BrowserVideo url={playback.url} t={t} showShell={showShell}
          initialProgress={playback.context?.initialProgress} onProgress={playback.context?.onProgress} />
      </div>
    </dialog>, document.body
  );
}

export default function BrowserPlayerModal(props) {
  return props.playback ? <VideoSession key={`${props.playback.context?.userId}:${props.playback.url}`} {...props} /> : null;
}
