import React, { useEffect, useRef, useState } from "react";
import BrowserVideo from "./BrowserVideo.jsx";
import LoadingSpinner from "./LoadingSpinner.jsx";
import { canRepairBrowserAudio, prepareBrowserPlayback, playbackTime } from "./browserPlayback.js";
import { browserPlaybackStrings } from "./browserPlaybackStrings.js";

export function PlaybackPreparation({ status, error, onRetry, onRepairAudio, onOriginal, language = "es" }) {
  // Preparation is only entered after the user asks to repair audio.
  if (!error && !["checking", "queued", "converting", "finalizing"].includes(status.state)) return null;
  const s = browserPlaybackStrings(language);
  const playbackFailed = error?.startsWith("PLAYBACK_");
  const label = playbackFailed ? s.playback : s.converting;
  const title = error ? (playbackFailed ? s.playbackFailed : s.failed) : s[status.state] || s.checking;
  const percent = Number.isFinite(status.percent) ? Math.min(99, Math.max(0, status.percent)) : null;
  return <div className="browser-preparation">
    <section className="browser-preparation__card" aria-busy={!error} aria-label={label}>
      {!error && <LoadingSpinner />}
      <p className="browser-preparation__eyebrow">MiniTV · {label}</p>
      <h2 role={error ? "alert" : "status"}>{title}</h2>
      {error ? <>
        <p>{s.errors[error] || s.errors.NETWORK}</p>
        <div className="browser-preparation__actions">
          <button type="button" className="dialog-button" onClick={onRetry}>{s.retry}</button>
          {onRepairAudio && <button type="button" className="dialog-button dialog-button--ghost" onClick={onRepairAudio}>{s.repairAudio}</button>}
        </div>
      </> : <>
        <div className="browser-preparation__percent" aria-hidden="true">{percent === null ? "…" : `${Math.floor(percent)} %`}</div>
        <progress max="100" value={percent === null ? undefined : percent} aria-label={s[status.state] || s.checking} />
        <dl>
          <div><dt>{s.elapsed}</dt><dd>{playbackTime(status.elapsedSeconds)}</dd></div>
          {status.remainingSeconds != null && <div><dt>{s.remaining}</dt><dd>≈ {playbackTime(status.remainingSeconds)}</dd></div>}
          {status.state === "queued" && <div><dt>{s.position}</dt><dd>{status.queuePosition || 1}</dd></div>}
        </dl>
        <p>{s.hint}</p>
        <small>{s.background}</small>
      </>}
      {onOriginal && <button type="button" className="dialog-button dialog-button--ghost browser-preparation__original" onClick={onOriginal}>{s.original}</button>}
    </section>
  </div>;
}

function BrowserPlaybackSession({ url, language, initialProgress, onProgress, ...props }) {
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(url);
  const [status, setStatus] = useState({ state: "ready" });
  const [error, setError] = useState("");
  const resume = useRef({ ...initialProgress });
  const s = browserPlaybackStrings(language);
  const canRepair = canRepairBrowserAudio(url);
  const repairAudio = () => {
    setReady(null);
    setError("");
    setStatus({ state: "checking" });
    setAttempt(value => value + 1);
  };
  const playOriginal = () => {
    setAttempt(0);
    setReady(url);
    setError("");
    setStatus({ state: "ready" });
  };
  useEffect(() => {
    if (!attempt) return;
    const controller = new AbortController();
    prepareBrowserPlayback(url, { signal: controller.signal, retry: true, repairAudio: true,
      onStatus: next => { if (!controller.signal.aborted) setStatus(next); } })
      .then(next => { if (!controller.signal.aborted) setReady(next); })
      .catch(next => { if (!controller.signal.aborted) setError(next.message); });
    return () => controller.abort();
  }, [url, attempt]);
  return ready && !error
    ? <><BrowserVideo key={ready} {...props} url={ready} subtitleSourceUrl={url} language={language}
        initialProgress={resume.current}
        onProgress={progress => {
          // Source switches render before the old video flushes its final time.
          // Keep the object shared so the new video's mount sees that final save.
          Object.assign(resume.current, progress);
          onProgress?.(progress);
        }}
        onPlaybackError={failure => {
          if (failure.seconds > 0) {
            Object.assign(resume.current, { kind: "video", seconds: failure.seconds, completed: false });
          }
          setError(failure.code);
        }} />
        {canRepair && <div className="browser-video__audio-actions">
          {ready === url
            ? <button type="button" className="dialog-button dialog-button--ghost" onClick={repairAudio} title={s.repairHint}>{s.repairAudio}</button>
            : <><span>{s.repairedAudio}</span><button type="button" className="dialog-button dialog-button--ghost" onClick={playOriginal}>{s.original}</button></>}
        </div>}
      </>
    : <PlaybackPreparation status={status} error={error} language={language}
        onRetry={ready ? () => setError("") : repairAudio}
        onRepairAudio={ready === url && canRepair ? repairAudio : undefined}
        onOriginal={attempt > 0 ? playOriginal : undefined} />;
}

export default function PreparedBrowserVideo(props) {
  // Each source owns its repair request and resume position, including cleanup.
  return <BrowserPlaybackSession key={props.url} {...props} />;
}
