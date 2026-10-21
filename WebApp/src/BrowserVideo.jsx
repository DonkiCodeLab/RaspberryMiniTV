import React, { useEffect, useRef, useState } from "react";
import RetroTelevision from "./RetroTelevision.jsx";
import { gameTelevision } from "./gameTelevisions.js";
import { frameRectangle } from "./gameConsoleFrames.js";
import { browserPlaybackStrings } from "./browserPlaybackStrings.js";
import { browserVideoError } from "./browserPlayback.js";
import { BrowserSubtitleTrack, SubtitleSelectors, useBrowserSubtitles } from "./BrowserSubtitles.jsx";
import { subtitleStrings } from "./browserSubtitles.js";

export default function BrowserVideo({ url, subtitleSourceUrl = url, t, language, initialProgress, onProgress, onPlaybackError, showShell = true }) {
  const videoRef = useRef(null);
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;
  const subtitles = useBrowserSubtitles(subtitleSourceUrl, language);
  const subtitleText = subtitleStrings[language] || subtitleStrings.es;
  const [trackStatus, setTrackStatus] = useState({});
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const [needsPlay, setNeedsPlay] = useState(false);
  const television = gameTelevision(showShell ? "simpsons" : "none");

  useEffect(() => {
    const video = videoRef.current;
    let alive = true;
    let attempted = false;
    setNeedsPlay(false);
    const playing = () => setNeedsPlay(false);
    const start = () => {
      if (attempted) return;
      attempted = true;
      video.play()?.catch(error => {
        if (alive && error.name === "NotAllowedError") setNeedsPlay(true);
      });
    };
    video.addEventListener("canplay", start);
    video.addEventListener("play", playing);
    if (video.readyState >= 3) start();
    return () => {
      alive = false;
      video.removeEventListener("canplay", start);
      video.removeEventListener("play", playing);
    };
  }, [url]);

  useEffect(() => {
    const video = videoRef.current;
    let initialized = false;
    let lastSave = 0;
    const save = (force = false) => {
      if (!initialized || video.seeking || !Number.isFinite(video.currentTime)) return;
      if (!force && Date.now() - lastSave < 5000) return;
      lastSave = Date.now();
      progressRef.current?.({ kind: "video", seconds: video.currentTime,
        duration: Number.isFinite(video.duration) ? video.duration : 0, completed: video.ended });
    };
    const loaded = () => {
      if (initialized) return;
      if (video.videoWidth && video.videoHeight) setVideoAspect(video.videoWidth / video.videoHeight);
      const seconds = Math.max(0, Number(initialProgress?.seconds) || 0);
      if (seconds) video.currentTime = Math.min(seconds, Number.isFinite(video.duration) ? Math.max(0, video.duration - .1) : seconds);
      initialized = true;
      save(true);
    };
    const tick = () => save();
    const flush = () => save(true);
    video.addEventListener("loadedmetadata", loaded);
    video.addEventListener("timeupdate", tick);
    for (const event of ["pause", "ended", "seeked"]) video.addEventListener(event, flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    if (video.readyState >= 1) loaded();
    return () => {
      flush();
      video.removeEventListener("loadedmetadata", loaded);
      video.removeEventListener("timeupdate", tick);
      for (const event of ["pause", "ended", "seeked"]) video.removeEventListener(event, flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [url]);

  return <>
    <div id="browser-video-stage" className="browser-video__stage"
      style={{ "--tv-ratio": showShell ? television.crop[2] / television.crop[3] : videoAspect }}>
      <RetroTelevision television={television} t={t}>
        <div className="browser-video__screen" style={frameRectangle(television, television.screen)}>
          <video ref={videoRef} src={url} controls autoPlay playsInline onError={event => {
            const error = browserVideoError(event);
            if (error) onPlaybackError?.(error);
          }}>
            {subtitles.primary && <BrowserSubtitleTrack key={`primary-${subtitles.primary}`}
              source={subtitleSourceUrl} id={subtitles.primary} label={subtitleText.primary}
              onStatus={status => setTrackStatus(current => ({ ...current, [subtitles.primary]: status }))} />}
            {subtitles.auxiliary && <BrowserSubtitleTrack key={`auxiliary-${subtitles.auxiliary}`}
              source={subtitleSourceUrl} id={subtitles.auxiliary} label={subtitleText.auxiliary} auxiliary
              onStatus={status => setTrackStatus(current => ({ ...current, [subtitles.auxiliary]: status }))} />}
          </video>
          {needsPlay && <button type="button" className="browser-video__start"
            onClick={() => { videoRef.current.play()?.catch(() => setNeedsPlay(true)); }}>
            <span aria-hidden="true">▶</span> {browserPlaybackStrings(language).play}
          </button>}
        </div>
      </RetroTelevision>
    </div>
    {(subtitles.failed || !subtitles.inventory || subtitles.inventory.tracks.length > 0 || subtitles.inventory.embeddedStatus === "unknown") &&
      <div className="playback-subtitles">
        {subtitles.inventory && <SubtitleSelectors tracks={subtitles.inventory.tracks}
          primary={subtitles.primary} auxiliary={subtitles.auxiliary} language={language}
          onPrimary={subtitles.setPrimary} onAuxiliary={subtitles.setAuxiliary} />}
        {(subtitles.failed || [subtitles.primary, subtitles.auxiliary].some(id => id && trackStatus[id] === "error"))
          ? <p role="status">{subtitleText.failed} <button type="button" className="dialog-button dialog-button--ghost" onClick={subtitles.retry}>{subtitleText.retry}</button></p>
          : (!subtitles.inventory || [subtitles.primary, subtitles.auxiliary].some(id => id && trackStatus[id] === "loading")) && <p role="status">{subtitleText.loading}</p>}
        {subtitles.inventory?.embeddedStatus === "unknown" && <p role="status">{subtitleText.unknown}</p>}
      </div>}
  </>;
}
