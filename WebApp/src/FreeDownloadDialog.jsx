import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { lockBodyScroll } from "./bodyScrollLock.js";
import { controlMovieTorrent, getFreeDownloadContents, changeFreeDownloadContents } from "./api/raspberryApi";
import { torrentSize } from "./torrentUtils.js";
import { freeDownloadStrings } from "./freeDownloadStrings.js";
import { saveFreeDownloadNames } from "./freeDownloadNames.js";
import LoadingSpinner from "./LoadingSpinner.jsx";
import "./FreeDownloadDialog.css";

export default function FreeDownloadDialog({ jobs = [], initialJob, language, onClose, onSelect, onChanged }) {
  const s = freeDownloadStrings(language);
  const dialog = useRef(null);
  const renamePending = useRef(false);
  const renameInput = useRef(null);
  const renameButton = useRef(null);
  const restoreRenameFocus = useRef(false);
  const titleId = useId();
  const renameHintId = useId();
  const renameFormId = useId();
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
  const isEditing = editing !== null;
  const entries = editing || data?.entries || [];
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
    if (busy || loading) return;
    if (isEditing) renameInput.current?.focus();
    else if (restoreRenameFocus.current) {
      renameButton.current?.focus();
      restoreRenameFocus.current = false;
    }
  }, [isEditing, busy, loading]);
  function navigate(nextJob, nextPath = "") {
    restoreRenameFocus.current = false;
    setJob(nextJob); setPath(nextPath); setData(null); setError(""); setConfirmDelete(false);
    setEditing(null); setRenameNotice("");
  }
  function startRename() {
    setEditing(data.entries.map(entry => ({ ...entry, originalName: entry.name, error: "" })));
    setError(""); setRenameNotice("");
  }
  function cancelRename() {
    if (renamePending.current) return;
    restoreRenameFocus.current = true;
    setEditing(null); setError("");
    setRevision(value => value + 1);
  }
  async function rename(event) {
    event.preventDefault();
    if (!editing || renamePending.current) return;
    if (editing.every(entry => entry.name === entry.originalName)) { cancelRename(); return; }
    if (editing.some(entry => !entry.name.trim())) {
      setEditing(current => current.map(entry => ({ ...entry, error: entry.name.trim() ? entry.error : s.nameRequired })));
      return;
    }
    renamePending.current = true;
    setBusy(true); setError("");
    try {
      const result = await saveFreeDownloadNames(job.id, editing, changeFreeDownloadContents);
      if (result.job) setJob(result.job);
      // Keep the listing aligned with successful renames so cancelling or
      // retrying only affects the drafts that are still pending.
      setData(current => ({ ...current, job: result.job || current.job,
        entries: result.entries.map(({ originalName, error: _error, ...entry }) => ({ ...entry, name: originalName })),
      }));
      setRenameNotice(result.saved ? (result.saved === 1 ? s.nameSaved : s.namesSaved.replace("{count}", result.saved)) : "");
      if (result.failed) {
        setEditing(result.entries);
        setError(result.failed === 1 ? s.nameFailed : s.namesFailed.replace("{count}", result.failed));
      } else {
        restoreRenameFocus.current = true;
        setEditing(null);
        setRevision(value => value + 1);
      }
      if (result.saved) onChanged?.();
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
        <strong>{item.name}</strong><span>{torrentSize(item.sizeBytes, language)} →</span>
      </button>)}
    </div> : <>
      <nav className="free-download-dialog__navigation" aria-label={s.open}>
        <button className="dialog-button dialog-button--ghost" type="button" disabled={busy || isEditing} onClick={() => navigate(null)}>{s.root}</button>
        <button className="dialog-button dialog-button--ghost" type="button" disabled={busy || isEditing} onClick={() => path ? navigate(job, pathParts.slice(0, -1).join("/")) : navigate(null)}>↑ {s.up}</button>
        <div className="free-download-dialog__tools" role="group" aria-label={s.renameAll}>
          <button ref={renameButton} type="button" className="free-download-dialog__icon-button" aria-label={s.renameAll} title={s.renameAll}
            aria-pressed={isEditing} disabled={busy || extracting || loading || !data?.entries?.length || isEditing || confirmDelete} onClick={startRename}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5L8 21H3v-5ZM13 6l5 5" /></svg>
          </button>
          {isEditing && <>
            <button type="submit" form={renameFormId} className="free-download-dialog__icon-button" disabled={busy} aria-label={s.saveNames} title={s.saveNames}>
              {busy ? <LoadingSpinner inline /> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>}
            </button>
            <button type="button" className="free-download-dialog__icon-button" disabled={busy} onClick={cancelRename} aria-label={s.cancelNames} title={s.cancelNames}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </>}
          <button className="free-download-dialog__icon-button" type="button" aria-label={s.refresh} title={s.refresh} disabled={busy || loading || isEditing} onClick={() => setRevision(value => value + 1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9" /></svg>
          </button>
        </div>
      </nav>
      <nav className="free-download-dialog__breadcrumbs" aria-label={s.location}>
        <ol>{breadcrumbs.map((crumb, index) => <li key={crumb.path}>
          {index > 0 && <span aria-hidden="true">/</span>}
          <button type="button" disabled={busy || isEditing} aria-current={index === breadcrumbs.length - 1 ? "page" : undefined} onClick={() => navigate(job, crumb.path)}>{crumb.name}</button>
        </li>)}</ol>
      </nav>
      <p className="free-download-dialog__path"><span>{s.fullPath}</span> {data?.fullPath || [job.name, ...pathParts].join("/")}</p>
      {isEditing && <p className="free-download-dialog__rename-hint" id={renameHintId}>{s.renameAllHint}</p>}
      {extracting && <p role="status"><LoadingSpinner inline /> {s.extracting}</p>}
      {contentsJob?.extraction?.state === "failed" && <p role="alert" className="dialog-error">{contentsJob.extraction.error}</p>}
      {contentsJob?.extraction?.state === "complete" && <p role="status">{s.extracted}: {contentsJob.extraction.path}</p>}
      {loading && !data ? <p role="status"><LoadingSpinner inline /> {s.loading}</p> : <form id={renameFormId} onSubmit={rename} className="free-download-dialog__entries" aria-busy={loading || busy}
        onKeyDown={event => { if (event.key === "Escape" && isEditing) { event.preventDefault(); event.stopPropagation(); cancelRename(); } }}>
        {data && !data.entries?.length && <p>{s.folderEmpty}</p>}
        {entries.map((entry, index) => <div className="free-download-entry" key={entry.path}>
          <div className="free-download-entry__label">
            {isEditing ? <div className="free-download-entry__rename">
              <input ref={index === 0 ? renameInput : undefined} required aria-label={`${s.newName}: ${entry.originalName}`}
                aria-describedby={entry.error ? `${renameHintId} ${renameFormId}-${index}-error` : renameHintId}
                aria-invalid={Boolean(entry.error)} value={entry.name} disabled={busy}
                onFocus={event => { const input = event.target; input.setSelectionRange(0, !entry.directory && input.value.lastIndexOf(".") > 0 ? input.value.lastIndexOf(".") : input.value.length); }}
                onChange={event => setEditing(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value, error: "" } : item))} />
            </div> : <>
              {entry.directory ? <button type="button" className="free-download-entry__folder" disabled={busy} onClick={() => navigate(job, entry.path)}>{entry.name} →</button> : <span className="free-download-entry__name">{entry.name}</span>}
            </>}
          </div>
          <span className="free-download-entry__size">{entry.directory ? s.folder : torrentSize(entry.sizeBytes, language)}</span>
          {entry.error && <p className="free-download-entry__error" id={`${renameFormId}-${index}-error`} role="alert">{entry.error}</p>}
          <div className="free-download-entry__actions">
            {entry.archive && <button type="button" className="dialog-button" disabled={busy || extracting || loading || Boolean(editing)} onClick={() => extract(entry)}>{s.extract}</button>}
            {onSelect && !entry.archive && <button type="button" className="dialog-button" disabled={busy || extracting || loading || isEditing} onClick={() => select(entry.path, entry.name)}>{s.select}</button>}
          </div>
        </div>)}
      </form>}
      {confirmDelete ? <section className="free-download-dialog__confirm" role="alertdialog" aria-label={s.delete}>
        <p>{s.deleteConfirm}</p>
        <div className="dialog-card__actions">
          <button type="button" autoFocus className="dialog-button dialog-button--ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>{s.cancel}</button>
          <button type="button" className="dialog-button dialog-button--danger" disabled={busy} onClick={remove}>{s.confirmDelete}</button>
        </div>
      </section> : <div className="dialog-card__actions">
        <button type="button" className="dialog-button dialog-button--danger" disabled={busy || extracting || isEditing} onClick={() => setConfirmDelete(true)}>{s.delete}</button>
        {onSelect && <button type="button" className="dialog-button dialog-button--accent" disabled={busy || extracting || loading || isEditing || !data?.entries?.length} onClick={() => select(path, path.split("/").pop() || job.name)}>{s.selectFolder}</button>}
      </div>}
    </>}
  </dialog>, document.body);
}
