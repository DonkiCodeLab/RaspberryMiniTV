import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { lockBodyScroll } from "./bodyScrollLock.js";
import { controlMovieTorrent, getFreeDownloadContents, changeFreeDownloadContents } from "./api/raspberryApi";
import { torrentSize } from "./torrentUtils.js";
import { freeDownloadStrings } from "./freeDownloadStrings.js";
import LoadingSpinner from "./LoadingSpinner.jsx";
import "./FreeDownloadDialog.css";

export default function FreeDownloadDialog({ jobs = [], initialJob, language, onClose, onSelect, onChanged }) {
  const s = freeDownloadStrings(language);
  const dialog = useRef(null);
  const titleId = useId();
  const [job, setJob] = useState(initialJob || null);
  const [path, setPath] = useState("");
  const [data, setData] = useState(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const contentsJob = data?.job || job;
  const extracting = contentsJob?.extraction?.state === "extracting";
  const completed = jobs.filter(item => item.mediaType === "generic" && item.state === "complete");
  useEffect(() => {
    const node = dialog.current;
    const trigger = document.activeElement;
    node.showModal();
    const release = lockBodyScroll();
    return () => { node.close(); release(); if (trigger?.isConnected) trigger.focus(); };
  }, []);
  useEffect(() => {
    if (!job) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    getFreeDownloadContents(job.id, path, controller.signal).then(next => {
      if (!controller.signal.aborted) setData(next);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [job?.id, path, revision]);
  useEffect(() => {
    if (!extracting) return;
    const timer = setInterval(() => setRevision(value => value + 1), 2000);
    return () => clearInterval(timer);
  }, [extracting]);
  function navigate(nextJob, nextPath = "") {
    setJob(nextJob); setPath(nextPath); setData(null); setError(""); setConfirmDelete(false);
  }
  async function extract(entry) {
    setBusy(true); setError("");
    try {
      const result = await changeFreeDownloadContents(job.id, { action: "extract", path: entry.path });
      setData(current => ({ ...current, job: result.job }));
      onChanged?.();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError("");
    try { await controlMovieTorrent(job.id, "delete"); onChanged?.(); onClose(); }
    catch (e) { setError(e.message); setConfirmDelete(false); }
    finally { setBusy(false); }
  }
  function select(relative, name) {
    onSelect({ jobId: job.id, path: relative, name });
  }
  return createPortal(<dialog ref={dialog} className="dialog-card free-download-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="dialog-card__header">
      <div><h2 id={titleId}>{s.title}</h2>{job && <p className="free-download-dialog__name">{job.name}</p>}</div>
      <button type="button" className="dialog-card__close" aria-label={s.close} disabled={busy} onClick={onClose}>×</button>
    </div>
    {onSelect && <p className="dialog-copy">{s.pickerHint}</p>}
    {error && <p className="dialog-error" role="alert">{error}</p>}
    {!job ? <div className="free-download-dialog__entries">
      {!completed.length && <p>{s.empty}</p>}
      {completed.map(item => <button type="button" className="free-download-entry free-download-entry--download" key={item.id} onClick={() => navigate(item)}>
        <span aria-hidden="true">▣</span><strong>{item.name}</strong><span>{torrentSize(item.sizeBytes, language)} →</span>
      </button>)}
    </div> : <>
      <nav className="free-download-dialog__navigation" aria-label={s.open}>
        <button className="dialog-button dialog-button--ghost" type="button" disabled={busy} onClick={() => navigate(null)}>{s.root}</button>
        {path && <button className="dialog-button dialog-button--ghost" type="button" disabled={busy} onClick={() => navigate(job, path.split("/").slice(0, -1).join("/"))}>↑ {s.up}</button>}
        <button className="dialog-button dialog-button--ghost" type="button" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}>{s.refresh}</button>
      </nav>
      <p className="free-download-dialog__path">/{path}</p>
      {extracting && <p role="status"><LoadingSpinner inline /> {s.extracting}</p>}
      {contentsJob?.extraction?.state === "failed" && <p role="alert" className="dialog-error">{contentsJob.extraction.error}</p>}
      {contentsJob?.extraction?.state === "complete" && <p role="status">{s.extracted}: {contentsJob.extraction.path}</p>}
      {loading && !data ? <p role="status"><LoadingSpinner inline /> {s.loading}</p> : <div className="free-download-dialog__entries" aria-busy={loading}>
        {data && !data.entries?.length && <p>{s.folderEmpty}</p>}
        {data?.entries?.map(entry => <div className="free-download-entry" key={entry.path}>
          <span aria-hidden="true">{entry.directory ? "▣" : "▤"}</span>
          {entry.directory ? <button type="button" className="free-download-entry__folder" disabled={busy} onClick={() => navigate(job, entry.path)}>{entry.name} →</button> : <span className="free-download-entry__name">{entry.name}</span>}
          <span className="free-download-entry__size">{entry.directory ? s.folder : torrentSize(entry.sizeBytes, language)}</span>
          <div className="free-download-entry__actions">
            {entry.archive && <button type="button" className="dialog-button" disabled={busy || extracting} onClick={() => extract(entry)}>{s.extract}</button>}
            {onSelect && !entry.archive && <button type="button" className="dialog-button" disabled={busy || extracting || loading} onClick={() => select(entry.path, entry.name)}>{s.select}</button>}
          </div>
        </div>)}
      </div>}
      {confirmDelete ? <section className="free-download-dialog__confirm" role="alertdialog" aria-label={s.delete}>
        <p>{s.deleteConfirm}</p>
        <div className="dialog-card__actions">
          <button type="button" autoFocus className="dialog-button dialog-button--ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>{s.cancel}</button>
          <button type="button" className="dialog-button dialog-button--danger" disabled={busy} onClick={remove}>{s.confirmDelete}</button>
        </div>
      </section> : <div className="dialog-card__actions">
        <button type="button" className="dialog-button dialog-button--danger" disabled={busy || extracting} onClick={() => setConfirmDelete(true)}>{s.delete}</button>
        {onSelect && <button type="button" className="dialog-button dialog-button--accent" disabled={busy || extracting || loading || !data?.entries?.length} onClick={() => select(path, path.split("/").pop() || job.name)}>{s.selectFolder}</button>}
      </div>}
    </>}
  </dialog>, document.body);
}
