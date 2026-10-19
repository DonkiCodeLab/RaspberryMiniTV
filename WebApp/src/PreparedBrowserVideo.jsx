import React, { useEffect, useState } from "react";
import BrowserVideo from "./BrowserVideo.jsx";
import LoadingSpinner from "./LoadingSpinner.jsx";
import { prepareBrowserPlayback, playbackTime } from "./browserPlayback.js";
import { browserPlaybackStrings } from "./browserPlaybackStrings.js";

export function PlaybackPreparation({ status, error, onRetry, language = "es" }) {
  const s = browserPlaybackStrings(language);
  const percent = Number.isFinite(status.percent) ? Math.min(99, Math.max(0, status.percent)) : null;
  return <div className="browser-preparation">
    <section className="browser-preparation__card" aria-busy={!error} aria-label={s.converting}>
      {!error && <LoadingSpinner />}
      <p className="browser-preparation__eyebrow">MiniTV · {s.converting}</p>
      <h2 role={error ? "alert" : "status"}>{error ? s.failed : s[status.state] || s.checking}</h2>
      {error ? <>
        <p>{s.errors[error] || s.errors.NETWORK}</p>
        <button type="button" className="dialog-button" onClick={onRetry}>{s.retry}</button>
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
    </section>
  </div>;
}

export default function PreparedBrowserVideo({ url, language, ...props }) {
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(null);
  const [status, setStatus] = useState({ state: "checking" });
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setReady(null);
    setError("");
    setStatus({ state: "checking" });
    prepareBrowserPlayback(url, { signal: controller.signal, retry: attempt > 0,
      onStatus: next => { if (!controller.signal.aborted) setStatus(next); } })
      .then(next => { if (!controller.signal.aborted) setReady({ source: url, url: next }); })
      .catch(next => { if (!controller.signal.aborted) setError(next.message); });
    return () => controller.abort();
  }, [url, attempt]);
  return ready?.source === url
    ? <BrowserVideo {...props} url={ready.url} subtitleSourceUrl={url} language={language}
        onPlaybackError={() => { setReady(null); setError("PLAYBACK_FAILED"); }} />
    : <PlaybackPreparation status={status} error={error} language={language} onRetry={() => setAttempt(value => value + 1)} />;
}
