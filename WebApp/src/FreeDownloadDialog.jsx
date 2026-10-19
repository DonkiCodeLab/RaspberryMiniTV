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
  const renamePending = useRef(false);
  const renameInput = useRef(null);
  const renamedPath = useRef("");
  const titleId = useId();
  const renameHintId = useId();
  const [job, setJob] = useState(initialJob || null);
  const [path, setPath] = useState("");
  const [data, setData] = useState(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(null);
  const [renameNotice, setRenameNotice] = useState("");
  const contentsJob = data?.job || job;
  const extracting = contentsJob?.extraction?.state === "extracting";
  const completed = jobs.filter(item => item.mediaType === "generic" && item.state === "complete");
  const pathParts = path.split("/").filter(Boolean);
  const breadcrumbs = [{ name: job?.name, path: "" }, ...pathParts.map((name, index) => ({
    name, path: pathParts.slice(0, index + 1).join("/"),
  }))];
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
  useEffect(() => {
    if (editing && !busy) renameInput.current?.focus();
  }, [editing?.path, busy]);
  function navigate(nextJob, nextPath = "") {
    renamedPath.current = "";
    setJob(nextJob); setPath(nextPath); setData(null); setError(""); setConfirmDelete(false);
    setEditing(null); setRenameNotice("");
  }
  function startRename(entry) {
    setEditing({ ...entry, originalName: entry.name });
    setError(""); setRenameNotice("");
  }
  function cancelRename() {
    renamedPath.current = editing?.path || "";
    setEditing(null); setError("");
  }
  async function rename(event) {
    event.preventDefault();
    if (!editing || renamePending.current) return;
    if (editing.name === editing.originalName) { cancelRename(); return; }
    renamePending.current = true;
    setBusy(true); setError("");
    try {
      const result = await changeFreeDownloadContents(job.id, { action: "rename", path: editing.path, name: editing.name });
      renamedPath.current = result.path;
      setJob(result.job);
      setEditing(null);
      setRenameNotice(s.renamed.replace("{name}", result.name));
      setData(null); setLoading(true); setRevision(value => value + 1);
      onChanged?.();
    } catch (e) { setError(e.message); }
    finally { renamePending.current = false; setBusy(false); }
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
    onCancel={event => { event.preventDefault(); if (!busy) { if (editing) cancelRename(); else onClose(); } }}>
    <div className="dialog-card__header">
      <div><h2 id={titleId}>{s.title}</h2>{job && <p className="free-download-dialog__name">{job.name}</p>}</div>
      <button type="button" className="dialog-card__close" aria-label={s.close} disabled={busy} onClick={onClose}>×</button>
    </div>
    {onSelect && <p className="dialog-copy">{s.pickerHint}</p>}
    {error && <p className="dialog-error" role="alert">{error}</p>}
    {renameNotice && <p className="free-download-dialog__notice" role="status">{renameNotice}</p>}
    {!job ? <div className="free-download-dialog__entries">
      {!completed.length && <p>{s.empty}</p>}
      {completed.map(item => <button type="button" className="free-download-entry free-download-entry--download" key={item.id} onClick={() => navigate(item)}>
        <span aria-hidden="true">▣</span><strong>{item.name}</strong><span>{torrentSize(item.sizeBytes, language)} →</span>
      </button>)}
    </div> : <>
      <nav className="free-download-dialog__navigation" aria-label={s.open}>
        <button className="dialog-button dialog-button--ghost" type="button" disabled={busy} onClick={() => navigate(null)}>{s.root}</button>
        <button className="dialog-button dialog-button--ghost" type="button" disabled={busy} onClick={() => path ? navigate(job, pathParts.slice(0, -1).join("/")) : navigate(null)}>↑ {s.up}</button>
        <button className="dialog-button dialog-button--ghost free-download-dialog__refresh" type="button" aria-label={s.refresh} title={s.refresh} disabled={busy || loading} onClick={() => setRevision(value => value + 1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9" /></svg>
        </button>
      </nav>
      <nav className="free-download-dialog__breadcrumbs" aria-label={s.location}>
        <ol>{breadcrumbs.map((crumb, index) => <li key={crumb.path}>
          {index > 0 && <span aria-hidden="true">/</span>}
          <button type="button" disabled={busy} aria-current={index === breadcrumbs.length - 1 ? "page" : undefined} onClick={() => navigate(job, crumb.path)}>{crumb.name}</button>
        </li>)}</ol>
      </nav>
      <p className="free-download-dialog__path"><span>{s.fullPath}</span> {data?.fullPath || [job.name, ...pathParts].join("/")}</p>
      {editing && <p className="free-download-dialog__rename-hint" id={renameHintId}>{s.renameHint}</p>}
      {extracting && <p role="status"><LoadingSpinner inline /> {s.extracting}</p>}
      {contentsJob?.extraction?.state === "failed" && <p role="alert" className="dialog-error">{contentsJob.extraction.error}</p>}
      {contentsJob?.extraction?.state === "complete" && <p role="status">{s.extracted}: {contentsJob.extraction.path}</p>}
      {loading && !data ? <p role="status"><LoadingSpinner inline /> {s.loading}</p> : <div className="free-download-dialog__entries" aria-busy={loading}>
        {data && !data.entries?.length && <p>{s.folderEmpty}</p>}
        {data?.entries?.map(entry => <div className="free-download-entry" key={entry.path}>
          <span aria-hidden="true">{entry.directory ? "▣" : "▤"}</span>
          <div className="free-download-entry__label">
            {editing?.path === entry.path ? <form className="free-download-entry__rename" onSubmit={rename}>
              <input ref={renameInput} autoFocus aria-label={s.newName} aria-describedby={renameHintId} value={editing.name} disabled={busy}
                onFocus={event => { const input = event.target; input.setSelectionRange(0, !entry.directory && input.value.lastIndexOf(".") > 0 ? input.value.lastIndexOf(".") : input.value.length); }}
                onChange={event => setEditing(current => ({ ...current, name: event.target.value }))}
                onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelRename(); } }} />
              <button type="submit" className="free-download-entry__icon-button" disabled={busy || !editing.name.trim()} aria-label={s.saveName} title={s.saveName}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
              </button>
              <button type="button" className="free-download-entry__icon-button" disabled={busy} onClick={cancelRename} aria-label={s.cancel} title={s.cancel}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </form> : <>
              <button type="button" className="free-download-entry__icon-button" disabled={busy || extracting || loading} onClick={() => startRename(entry)} aria-label={`${s.rename}: ${entry.name}`} title={s.rename}
                ref={node => { if (node && !busy && !loading && renamedPath.current === entry.path) { node.focus(); renamedPath.current = ""; } }}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5L8 21H3v-5ZM13 6l5 5" /></svg>
              </button>
              {entry.directory ? <button type="button" className="free-download-entry__folder" disabled={busy} onClick={() => navigate(job, entry.path)}>{entry.name} →</button> : <span className="free-download-entry__name">{entry.name}</span>}
            </>}
          </div>
          <span className="free-download-entry__size">{entry.directory ? s.folder : torrentSize(entry.sizeBytes, language)}</span>
          <div className="free-download-entry__actions">
            {entry.archive && <button type="button" className="dialog-button" disabled={busy || extracting || loading || Boolean(editing)} onClick={() => extract(entry)}>{s.extract}</button>}
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
