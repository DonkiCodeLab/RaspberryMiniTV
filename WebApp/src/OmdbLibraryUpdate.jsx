import React, { useCallback, useEffect, useRef, useState } from "react";
import { getOmdbLibrary, updateOmdbLibrary, isMockMode } from "./api/raspberryApi";
import { omdbLibraryStrings } from "./omdbLibrary.js";
import { omdbError } from "./omdbRatings.js";
import "./OmdbRatings.css";

export function OmdbLibraryUpdateContent({ snapshot, language = "es", busy = "", error, disabled = false, onAction, onRefresh }) {
  const s = omdbLibraryStrings(language);
  const job = snapshot?.job;
  const active = job?.state === "running" || job?.state === "pausing";
  const paused = job?.state === "paused";
  const done = job?.state === "completed";
  const current = Boolean(snapshot?.total && snapshot.ready === snapshot.total);
  const canStart = snapshot?.configured && (paused || (snapshot.total > 0 && !current));
  const errorText = !error ? "" : error.code === "OMDB_LIBRARY_UNAVAILABLE" ? s.oldServer
    : error.code === "OMDB_TIMEOUT" || (error.code === "OMDB_CONNECTION_ERROR" && !error.status) ? s.offline
    : !error.code || error.code === "OMDB_INVALID_RESPONSE" ? s.error : omdbError(error, language);
  return <section className="omdb-library" aria-label={s.title} aria-busy={Boolean(busy)}>
    <h4>{s.title}</h4>
    <p>{s.hint}</p>
    {!snapshot && !error && <p role="status">{s.loading}</p>}
    {snapshot && <>
      <p className="omdb-library__inventory">{snapshot.total ? s.inventory(snapshot.ready, snapshot.total) : snapshot.missingIds.length ? s.unidentified : s.empty}</p>
      {!snapshot.configured && <p>{s.configuredMissing}</p>}
      {job.state !== "idle" && <div className="omdb-library__progress">
        <p role="status"><strong>{s.states[job.state]}</strong> · {s.progress(job.processed, job.total)}</p>
        {job.total > 0 && <progress value={job.processed} max={job.total} aria-label={s.progress(job.processed, job.total)} />}
        {job.currentTitle && <p>{s.current(job.currentTitle)}</p>}
        {done && <p>{s.completed(job)}</p>}
        {job.unavailable > 0 && <p>{s.unavailable(job.unavailable)}</p>}
        {job.failed > 0 && <p>{s.failed(job.failed)}</p>}
        {paused && job.code && <p className="omdb-library__notice" role="status">{omdbError({ code: job.code }, language)}</p>}
      </div>}
      {snapshot.missingIds.length > 0 && <details className="omdb-library__missing">
        <summary>{s.missingIds(snapshot.missingIds.length)}</summary>
        <ul>{snapshot.missingIds.map((item, index) => <li key={`${item.kind}:${item.path}:${index}`}>{item.title || item.path}</li>)}</ul>
      </details>}
    </>}
    {error && <p className="dialog-error" role="alert">{errorText}</p>}
    <div className="omdb-library__actions">
      {active ? <button className="dialog-button" type="button" disabled={Boolean(busy) || job.state === "pausing"} onClick={() => onAction?.("pause")}>{s.pause}</button>
        : <button className="dialog-button" type="button" disabled={Boolean(busy) || disabled || !canStart} onClick={() => onAction?.("start")}>{paused ? s.resume : done && job.failed ? s.retry : s.start}</button>}
      <button className="dialog-button" type="button" disabled={Boolean(busy)} onClick={onRefresh}>{s.refresh}</button>
    </div>
    {active && <p className="omdb-library__notice">{s.continues}</p>}
  </section>;
}

export default function OmdbLibraryUpdate({ language, disabled = false }) {
  const [snapshot, setSnapshot] = useState(null);
  const [busy, setBusy] = useState("load");
  const [error, setError] = useState(null);
  const request = useRef({ mounted: false, pending: false, generation: 0, controller: null, timer: null });
  const demo = isMockMode();
  const refresh = useCallback(async (action = "") => {
    const state = request.current;
    if (!state.mounted || state.pending || demo) return;
    clearTimeout(state.timer);
    const controller = new AbortController();
    const generation = ++state.generation;
    state.controller = controller; state.pending = true;
    setBusy(action || "refresh");
    let nextDelay = 15000;
    try {
      const result = action ? await updateOmdbLibrary(action, controller.signal) : await getOmdbLibrary(controller.signal);
      if (!state.mounted || generation !== state.generation || controller.signal.aborted) return;
      setSnapshot(result); setError(null);
      nextDelay = ["running", "pausing"].includes(result.job.state) ? 2500 : 15000;
    } catch (nextError) {
      if (state.mounted && generation === state.generation && !controller.signal.aborted) setError(nextError);
    } finally {
      if (generation === state.generation) {
        state.pending = false;
        if (state.mounted) {
          setBusy("");
          state.timer = setTimeout(() => refresh(), nextDelay);
        }
      }
    }
  }, [demo]);

  useEffect(() => {
    const state = request.current;
    state.mounted = true;
    refresh();
    return () => {
      state.mounted = false; state.generation += 1; state.pending = false;
      clearTimeout(state.timer); state.controller?.abort();
    };
  }, [refresh]);
  if (demo) return null;
  return <OmdbLibraryUpdateContent snapshot={snapshot} busy={busy} error={error} language={language} disabled={disabled}
    onAction={refresh} onRefresh={() => refresh()} />;
}
