import React, { useEffect, useMemo, useRef, useState } from 'react';
import LoadingSpinner from './LoadingSpinner.jsx';
import { photoRequest, uploadPictureFiles } from './api/raspberryApi.js';
import { createPhotoHasher, transferPhotoBatch } from './photoImportTransfer.js';
import { IMPORT_ACCEPT, accumulateImportResult, createImportId, importBatches, importSummary, preparePhotoImport } from './photoImport.js';
import { photoImportStrings } from './photoImportStrings.js';
import './PhotoUploadDialog.css';

const command = '/bin/zsh "$HOME/Downloads/Importar-Fotos-MiniTV.command"';
const empty = { entries: [], warnings: [] };
const size = bytes => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
const percentage = (done, total) => total ? Math.floor(done / total * 1000) / 10 : 0;
const duration = ms => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds < 60 ? `${seconds} s` : seconds < 3600 ? `${Math.floor(seconds / 60)} min ${seconds % 60} s` : `${Math.floor(seconds / 3600)} h ${Math.floor(seconds % 3600 / 60)} min`;
};

export function ImportProgress({ title, done, total, countLabel, detail, fileName, active, updatedAt, t, language }) {
  const [startedAt] = useState(Date.now), [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  const knownTotal = total !== null, percent = knownTotal ? percentage(done, total) : null;
  const number = value => value.toLocaleString(language);
  const waiting = active && now - updatedAt >= 30000;
  return <section className="photo-import-progress" aria-label={title}>
    <div className="photo-import-progress__heading">
      {active && <LoadingSpinner inline />}
      <strong role="status">{title}</strong>
      {knownTotal && <b>{percent.toLocaleString(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</b>}
    </div>
    <progress value={percent ?? undefined} max={100} aria-label={title} />
    <div className="photo-import-progress__counts"><strong>{number(done)}{knownTotal ? ` / ${number(total)}` : ''} {countLabel}</strong><small>{t.elapsed}: {duration(now - startedAt)}</small></div>
    {detail && <small className="photo-import-progress__detail">{detail}</small>}
    {fileName && <small className="photo-import-progress__file" title={fileName}>{fileName}</small>}
    {waiting && <p className="photo-import-warning" role="status">{t.waitingForProgress} {duration(now - updatedAt)}.</p>}
  </section>;
}

function Preview({ entry, t, remove }) {
  const [url, setUrl] = useState(''), [failed, setFailed] = useState(false);
  useEffect(() => { const value = URL.createObjectURL(entry.file); setUrl(value); setFailed(false); return () => URL.revokeObjectURL(value); }, [entry.file]);
  return <article className="photo-import-preview">
    <div>{!failed && url ? <img src={url} alt={entry.file.name} onError={() => setFailed(true)} /> : <span className="photo-import-placeholder">▧<small>{entry.file.name.split('.').pop().toUpperCase()}</small></span>}
      {remove && <button type="button" onClick={remove} aria-label={`${t.remove}: ${entry.file.name}`}>×</button>}
      {entry.metadata?.appleFavorite && <span className="photo-import-heart" title={t.favorite}>♥</span>}
    </div>
    <strong title={entry.file.name}>{entry.metadata?.title || entry.file.name}</strong>
    <small>{entry.metadata?.people.length ? entry.metadata.people.map(p => p.name).join(', ') : size(entry.file.size)}</small>
    {entry.metadata?.latitude != null && <span className="photo-import-gps">⌖ {entry.metadata.latitude.toFixed(2)}°, {entry.metadata.longitude.toFixed(2)}°</span>}
  </article>;
}

export function ImportFailures({ failures, t }) {
  if (!failures.length) return null;
  const path = failure => failure.entry.file.importPath || failure.entry.file.webkitRelativePath || failure.entry.file.name;
  function download() {
    const report = failures.map(failure => `${path(failure)}\t${failure.error}`).join('\n');
    const url = URL.createObjectURL(new Blob([report], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'minitv-import-errors.txt'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="photo-import-failures" role="status"><p><strong>{failures.length} {t.notImported}</strong></p>
    <p>{t.failedHint}</p><details><summary>{t.showFailures}</summary>
      <ul>{failures.slice(0, 20).map((failure, index) => <li key={index}><strong>{path(failure)}</strong>: {failure.error}</li>)}</ul>
    </details><button type="button" className="dialog-button" onClick={download}>{t.downloadFailures}</button></div>;
}

async function droppedFiles(transfer, onProgress, signal) {
  const roots = [...transfer.items].filter(i => i.kind === 'file').map(i => i.webkitGetAsEntry?.());
  if (!roots.some(Boolean)) return [...transfer.files];
  const result = [];
  let lastReport = 0;
  async function walk(entry, prefix = '') {
    if (signal.aborted) throw new DOMException('Import cancelled', 'AbortError');
    if (!entry || entry.name.startsWith('.')) return;
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      Object.defineProperty(file, 'importPath', { value: prefix + file.name }); result.push(file);
      if (performance.now() - lastReport >= 100) {
        onProgress({ phase: 'discovering', done: result.length, total: null, fileName: file.name });
        lastReport = performance.now();
      }
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      while (true) {
        const children = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        if (!children.length) break;
        for (const child of children) await walk(child, prefix + entry.name + '/');
      }
    }
  }
  for (const root of roots) await walk(root);
  return result;
}

export default function PhotoUploadDialog({ Modal, initialFiles = [], initialMode = 'mac', folderId, parent, s, language, onClose, onComplete }) {
  const t = photoImportStrings(language);
  const [mode, setMode] = useState(initialMode), [guide, setGuide] = useState(false), [copied, setCopied] = useState(false);
  const [selection, setSelection] = useState(empty), [name, setName] = useState(''), [preserveAlbums, setPreserveAlbums] = useState(true);
  const [reading, setReading] = useState(false), [busy, setBusy] = useState(false), [started, setStarted] = useState(false);
  const [error, setError] = useState(''), [drag, setDrag] = useState(false), [paused, setPaused] = useState(false);
  const [readProgress, setReadProgress] = useState({ phase: 'indexing', done: 0, total: null, fileName: '', updatedAt: 0 });
  const [progress, setProgress] = useState({ done: 0, batchPercent: 0, batchStart: 0, batchEnd: 0, status: 'hashing', fileName: '', updatedAt: 0 }), [result, setResult] = useState(null);
  const session = useRef(null), cursor = useRef(0), accumulated = useRef({ imported: 0, duplicates: 0, rejected: [] }), targetFolder = useRef(folderId);
  if (!session.current) session.current = createImportId();
  const working = useRef(false), pause = useRef(false), mounted = useRef(true), generation = useRef(0), reader = useRef(null);
  const stats = useMemo(() => importSummary(selection.entries), [selection.entries]), locked = reading || busy || started;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; pause.current = true; generation.current++; reader.current?.abort(); }; }, []);
  useEffect(() => { if (initialFiles.length) pick(initialFiles); }, []);
  useEffect(() => {
    if (!busy) return;
    const guard = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [busy]);
  async function pick(source, dropped = false) {
    if (working.current || started) return;
    reader.current?.abort();
    const controller = new AbortController(); reader.current = controller;
    const id = ++generation.current; setReading(true); setError(''); setSelection(empty);
    setReadProgress({ phase: dropped ? 'discovering' : 'indexing', done: 0, total: null, fileName: '', updatedAt: Date.now() });
    const onProgress = value => { if (mounted.current && id === generation.current) setReadProgress({ ...value, updatedAt: Date.now() }); };
    try {
      const files = dropped ? await droppedFiles(source, onProgress, controller.signal) : source;
      const next = await preparePhotoImport(files, { onProgress, signal: controller.signal,
        geolocatedOnly: mode === 'mac' || [...files].some(file => /\.json$/i.test(file.name)) });
      if (!mounted.current || id !== generation.current) return;
      setSelection(next);
      const first = next.entries[0]?.file;
      if (!name) setName((first?.importPath || first?.webkitRelativePath || '').split('/').slice(0, -1)[0] || (mode === 'mac' ? 'Apple Fotos' : ''));
      if (!next.entries.length) setError(next.geolocatedOnly ? t.noGeolocated : t.empty);
    } catch (err) {
      if (!mounted.current || id !== generation.current) return;
      const [key, ...detail] = err.message.split(':'); setError((t[key] || err.message) + (detail.length ? `: ${detail.join(':')}` : ''));
    } finally { if (mounted.current && id === generation.current) setReading(false); }
  }
  async function submit(event, entries = selection.entries) {
    event?.preventDefault(); if (working.current || !entries.length) return;
    working.current = true; pause.current = false; setBusy(true); setStarted(true); setPaused(false); setError('');
    const batches = importBatches(entries);
    const controller = new AbortController(); reader.current = controller;
    const hasher = createPhotoHasher(controller.signal);
    try {
      for (; cursor.current < batches.length; cursor.current++) {
        const batch = batches[cursor.current], before = batches.slice(0, cursor.current).reduce((n, b) => n + b.length, 0);
        if (mounted.current) setProgress({ done: before, batchPercent: 0, batchStart: before + 1, batchEnd: before + batch.length, status: 'hashing', fileName: '', updatedAt: Date.now() });
        const response = await transferPhotoBatch(batch, { albumName: name, folderId: selection.geolocatedOnly ? 'gallery' : targetFolder.current, parent, signal: controller.signal,
          importData: { session: session.current, batch: String(cursor.current), preserveAlbums: !selection.geolocatedOnly && preserveAlbums,
            geolocatedOnly: !!selection.geolocatedOnly, continueOnError: true },
          onProgress: value => { if (mounted.current) setProgress(current => ({ ...current, batchPercent: value.percent, status: value.status, fileName: value.fileName || '', updatedAt: Date.now() })); } },
          { hash: hasher.hash, check: (digests, signal) => photoRequest('import/check', { digests }, signal), upload: uploadPictureFiles });
        accumulated.current = accumulateImportResult(accumulated.current, response, batch);
        targetFolder.current = response.folderId;
        if (mounted.current) setProgress(current => ({ ...current, done: before + batch.length, batchPercent: 100, fileName: '', updatedAt: Date.now() }));
        if (pause.current && cursor.current < batches.length - 1) { cursor.current++; if (mounted.current) setPaused(true); return; }
      }
      if (mounted.current) setResult({ ...accumulated.current, folderId: targetFolder.current || 'gallery' });
    } catch (err) {
      if (mounted.current) {
        setError(err.message);
        if (cursor.current === 0 && [400, 409, 413, 422].includes(err.status)) setStarted(false);
      }
    }
    finally { hasher.close(); working.current = false; if (mounted.current) setBusy(false); }
  }
  function retryRejected() {
    const entries = result.rejected.map(failure => failure.entry);
    session.current = createImportId(); cursor.current = 0;
    accumulated.current = { imported: 0, duplicates: 0, rejected: [] };
    setSelection(value => ({ ...value, entries, warnings: [] })); setResult(null);
    submit(null, entries);
  }
  const picker = folder => <label className={`dialog-button ${folder ? 'dialog-button--accent' : ''}`}>
    {folder ? mode === 'mac' ? t.choose : s.chooseFolder : s.chooseFiles}
    <input type="file" aria-label={folder ? t.choose : s.chooseFiles} multiple accept={folder ? undefined : IMPORT_ACCEPT}
      {...(folder ? { webkitdirectory: '', directory: '' } : {})} disabled={locked}
      onChange={event => { const files = [...event.target.files]; event.target.value = ''; pick(files); }} />
  </label>;
  return <Modal title={t.title} s={s} onClose={onClose} busy={busy || reading} className="photo-dialog--import" wide>
    <div className="photo-import">
      <div className="photo-import-heading"><span className="photo-import-mark" aria-hidden="true">✳</span><p>{t.subtitle}</p></div>
      {(mode === 'mac' || selection.geolocatedOnly) && <p className="photo-note">{t.geoOnly}</p>}
      {selection.withoutLocation > 0 && <p role="status">{selection.withoutLocation.toLocaleString(language)} {t.withoutLocation}</p>}
      <ol className="photo-import-steps">{[t.prepare, t.review, t.import].map((label, index) => <li key={label} aria-current={(result || started ? 2 : stats.count ? 1 : 0) === index ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
      {result ? <div className="photo-import-success" role="status"><span aria-hidden="true">{result.rejected.length ? '!' : '✓'}</span><h3>{result.rejected.length ? t.finishedWithErrors : t.success}</h3>
        <p><strong>{result.imported}</strong> {t.saved}</p><p>{result.duplicates} {t.duplicates}</p>
        <ImportFailures failures={result.rejected} t={t} />
        {result.rejected.length > 0 && <button type="button" className="dialog-button" onClick={retryRejected}>{t.retryFailed}</button>}
        <button className="dialog-button dialog-button--accent" onClick={() => onComplete(result)}>{t.view} →</button></div> : <form onSubmit={submit}>
        {!started && <div className="photo-segments"><button type="button" disabled={reading} aria-pressed={mode === 'mac'} onClick={() => setMode('mac')}>⌘ {t.mac}</button><button type="button" disabled={reading} aria-pressed={mode === 'files'} onClick={() => setMode('files')}>▧ {t.files}</button></div>}
        {mode === 'mac' && !started && <details className="photo-import-guide" open={guide} onToggle={event => setGuide(event.currentTarget.open)}>
          <summary>{t.guide} <span>↗</span></summary><p>{t.guideIntro}</p><ol><li>{t.step1}</li><li>{t.step2}</li><li>{t.step3}</li></ol>
          <a className="dialog-button" href={`${import.meta.env.BASE_URL}Importar-Fotos-MiniTV.command`} download>{t.download} ↓</a>
          <div className="photo-import-command"><code>{command}</code><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(command); setCopied(true); } catch { setCopied(false); } }}>{copied ? t.copied : t.copy}</button></div>
          <small>{t.installHint}</small><p>{t.scope}</p>
        </details>}
        {reading && <ImportProgress title={readProgress.phase === 'discovering' ? t.discovering : readProgress.phase === 'indexing' ? t.indexing : t.analyzing}
          {...readProgress} countLabel={readProgress.total === null ? t.filesFound : t.photosRead} active t={t} language={language} detail={t.readingHint} />}
        {started && <ImportProgress title={busy ? ['hashing', 'checking'].includes(progress.status) ? t.checking : progress.status === 'saving' ? t.saving : t.uploading : paused ? t.paused : t.interrupted}
          {...progress} total={stats.count} countLabel={t.photosAttempted} active={busy} t={t} language={language}
          detail={busy ? `${t.currentBatch}: ${progress.batchStart.toLocaleString(language)}–${progress.batchEnd.toLocaleString(language)} · ${['hashing', 'checking'].includes(progress.status) ? t.checkingHint : progress.status === 'saving' ? t.confirming : `${progress.batchPercent}% ${t.batchSent}`}` : t.keepOpen} />}
        {!stats.count && !reading && <div className={`photo-import-drop${drag ? ' is-dragging' : ''}`} onDragOver={event => { event.preventDefault(); if (!locked) setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={event => { event.preventDefault(); setDrag(false); if (!locked) pick(event.dataTransfer, true); }}>
          <div className="photo-import-stack" aria-hidden="true"><span>⌖</span><span>♡</span><span>▧</span></div>
          <h3>{reading ? t.analyzing : mode === 'mac' ? t.dropMac : t.drop}</h3><p>{mode === 'mac' ? t.dropHint : t.normalHint}</p>
          <div className="photo-file-choices">{picker(true)}{picker(false)}</div><small>HEIC · JPG · PNG · WebP · AVIF · GIF · BMP · 50 MB / {s.photos}</small>
        </div>}
        {stats.count > 0 && <>
          <div className="photo-import-stats"><div><strong>{stats.count.toLocaleString()}</strong><span>{s.photos} · {size(stats.bytes)}</span></div>
            <div><strong>{stats.locations}</strong><span>{t.locations}</span></div><div><strong>{stats.people}</strong><span>{t.people}</span></div><div><strong>{stats.albums}</strong><span>{t.albums}</span></div></div>
          {!started && <>
          <p className="photo-note">{t.checkingHint}</p>
          <p className="photo-import-data-note">{stats.enriched ? `✓ ${stats.enriched} / ${stats.count} ${t.enriched}` : t.plainStats}</p>
          {mode === 'mac' && stats.enriched < stats.count && <p className="photo-import-warning">{stats.enriched ? t.partialSidecars : t.noSidecars}</p>}
          <div className="photo-import-previews">{selection.entries.slice(0, 12).map((entry, index) => <Preview key={`${session.current}-${entry.file.importPath || entry.file.webkitRelativePath || entry.file.name}-${index}`} entry={entry} t={t}
            remove={!locked ? () => setSelection(value => ({ ...value, entries: value.entries.filter(e => e !== entry) })) : null} />)}</div>
          {stats.count > 12 && <small>+ {stats.count - 12} {t.more}</small>}
          {!folderId && !selection.geolocatedOnly && <label>{s.name}<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} disabled={started || busy} /></label>}
          {stats.albums > 0 && !selection.geolocatedOnly && <label className="photo-import-toggle"><input type="checkbox" checked={preserveAlbums} onChange={event => setPreserveAlbums(event.target.checked)} disabled={started || busy} /><span>{t.preserve}<small>{t.preserveHint}</small></span></label>}
          {!started && <button type="button" className="photo-import-reset" onClick={() => { setSelection(empty); setError(''); }}>{t.restart}</button>}
          </>}
        </>}
        {!started && selection.warnings.map(w => <p key={w.type} className="photo-import-warning">{w.count} {t[w.type]}{w.names ? `: ${w.names.join(', ')}` : ''}.</p>)}
        {started && <ImportFailures failures={accumulated.current.rejected} t={t} />}
        {error && <p className="dialog-error" role="alert">{error}</p>}
        <footer><button type="button" className="dialog-button dialog-button--secondary" onClick={onClose} disabled={busy || reading}>{s.close}</button>
          {busy ? <button type="button" className="dialog-button" disabled={paused} onClick={() => { pause.current = true; setPaused(true); }}>{paused ? t.pausing : t.pause}</button> :
            <button className="dialog-button dialog-button--accent" disabled={reading || !stats.count || (!selection.geolocatedOnly && !folderId && !name.trim())}>{started ? t.resume : `${t.import} ${stats.count || ''} ${s.photos}`} →</button>}</footer>
      </form>}
    </div>
  </Modal>;
}
