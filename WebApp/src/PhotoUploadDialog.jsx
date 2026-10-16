import React, { useEffect, useRef, useState } from 'react';
import { uploadPictureFiles } from './api/raspberryApi.js';
import { IMPORT_ACCEPT, createImportId, importBatches, importSummary, preparePhotoImport } from './photoImport.js';
import { photoImportStrings } from './photoImportStrings.js';
import './PhotoUploadDialog.css';

const command = '/bin/zsh "$HOME/Downloads/Importar-Fotos-MiniTV.command"';
const empty = { entries: [], warnings: [] };
const size = bytes => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

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

async function droppedFiles(transfer) {
  const roots = [...transfer.items].filter(i => i.kind === 'file').map(i => i.webkitGetAsEntry?.());
  if (!roots.some(Boolean)) return [...transfer.files];
  const result = [];
  async function walk(entry, prefix = '') {
    if (!entry || entry.name.startsWith('.')) return;
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      Object.defineProperty(file, 'importPath', { value: prefix + file.name }); result.push(file);
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
  const [progress, setProgress] = useState({ done: 0, percent: 0, saving: false }), [result, setResult] = useState(null);
  const session = useRef(null), cursor = useRef(0), accumulated = useRef({ imported: 0, duplicates: 0 });
  if (!session.current) session.current = createImportId();
  const working = useRef(false), pause = useRef(false), mounted = useRef(true), generation = useRef(0);
  const stats = importSummary(selection.entries), locked = reading || busy || started;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; pause.current = true; generation.current++; }; }, []);
  useEffect(() => { if (initialFiles.length) pick(initialFiles); }, []);
  useEffect(() => {
    if (!busy) return;
    const guard = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [busy]);
  async function pick(files) {
    if (working.current || started) return;
    const id = ++generation.current; setReading(true); setError(''); setSelection(empty);
    try {
      const next = await preparePhotoImport(files);
      if (!mounted.current || id !== generation.current) return;
      setSelection(next);
      const first = next.entries[0]?.file;
      if (!name) setName((first?.importPath || first?.webkitRelativePath || '').split('/').slice(0, -1)[0] || (mode === 'mac' ? 'Apple Fotos' : ''));
      if (!next.entries.length) setError(t.empty);
    } catch (err) {
      if (!mounted.current || id !== generation.current) return;
      const [key, ...detail] = err.message.split(':'); setError((t[key] || err.message) + (detail.length ? `: ${detail.join(':')}` : ''));
    } finally { if (mounted.current && id === generation.current) setReading(false); }
  }
  async function submit(event) {
    event.preventDefault(); if (working.current || !stats.count) return;
    working.current = true; pause.current = false; setBusy(true); setStarted(true); setPaused(false); setError('');
    const batches = importBatches(selection.entries);
    try {
      for (; cursor.current < batches.length; cursor.current++) {
        const batch = batches[cursor.current], before = batches.slice(0, cursor.current).reduce((n, b) => n + b.length, 0);
        const response = await uploadPictureFiles({ files: batch.map(e => e.file), albumName: name, folderId, parent,
          importData: { session: session.current, batch: String(cursor.current), preserveAlbums,
            records: batch.map(({ metadata, raw }) => ({ metadata, raw })) },
          onProgress: value => { if (mounted.current) setProgress({ done: before, percent: Math.min(99, Math.round((before + batch.length * value.percent / 100) / stats.count * 100)), saving: value.status === 'saving' }); } });
        accumulated.current = { folderId: response.folderId, imported: accumulated.current.imported + (response.imported ?? batch.length),
          duplicates: accumulated.current.duplicates + (response.duplicates || 0) };
        if (mounted.current) setProgress({ done: before + batch.length, percent: Math.round((before + batch.length) / stats.count * 100), saving: false });
        if (pause.current && cursor.current < batches.length - 1) { cursor.current++; if (mounted.current) setPaused(true); return; }
      }
      if (mounted.current) setResult({ ...accumulated.current });
    } catch (err) {
      if (mounted.current) {
        setError(err.message);
        if (cursor.current === 0 && [400, 409, 413, 422].includes(err.status)) setStarted(false);
      }
    }
    finally { working.current = false; if (mounted.current) setBusy(false); }
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
      <ol className="photo-import-steps">{[t.prepare, t.review, t.import].map((label, index) => <li key={label} aria-current={(result || started ? 2 : stats.count ? 1 : 0) === index ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
      {result ? <div className="photo-import-success" role="status"><span aria-hidden="true">✓</span><h3>{t.success}</h3>
        <p><strong>{result.imported}</strong> {t.saved}</p><p>{result.duplicates} {t.duplicates}</p>
        <button className="dialog-button dialog-button--accent" onClick={() => onComplete(result)}>{t.view} →</button></div> : <form onSubmit={submit}>
        {!started && <div className="photo-segments"><button type="button" disabled={reading} aria-pressed={mode === 'mac'} onClick={() => setMode('mac')}>⌘ {t.mac}</button><button type="button" disabled={reading} aria-pressed={mode === 'files'} onClick={() => setMode('files')}>▧ {t.files}</button></div>}
        {mode === 'mac' && !started && <details className="photo-import-guide" open={guide} onToggle={event => setGuide(event.currentTarget.open)}>
          <summary>{t.guide} <span>↗</span></summary><p>{t.guideIntro}</p><ol><li>{t.step1}</li><li>{t.step2}</li><li>{t.step3}</li></ol>
          <a className="dialog-button" href={`${import.meta.env.BASE_URL}Importar-Fotos-MiniTV.command`} download>{t.download} ↓</a>
          <div className="photo-import-command"><code>{command}</code><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(command); setCopied(true); } catch { setCopied(false); } }}>{copied ? t.copied : t.copy}</button></div>
          <small>{t.installHint}</small><p>{t.scope}</p>
        </details>}
        {!stats.count && <div className={`photo-import-drop${drag ? ' is-dragging' : ''}`} onDragOver={event => { event.preventDefault(); if (!locked) setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={async event => { event.preventDefault(); setDrag(false); if (locked) return; try { await pick(await droppedFiles(event.dataTransfer)); } catch (err) { setError(err.message); } }}>
          <div className="photo-import-stack" aria-hidden="true"><span>⌖</span><span>♡</span><span>▧</span></div>
          <h3>{reading ? t.analyzing : mode === 'mac' ? t.dropMac : t.drop}</h3><p>{mode === 'mac' ? t.dropHint : t.normalHint}</p>
          <div className="photo-file-choices">{picker(true)}{picker(false)}</div><small>HEIC · JPG · PNG · WebP · AVIF · GIF · BMP · 50 MB / {s.photos}</small>
        </div>}
        {stats.count > 0 && <>
          <div className="photo-import-stats"><div><strong>{stats.count.toLocaleString()}</strong><span>{s.photos} · {size(stats.bytes)}</span></div>
            <div><strong>{stats.locations}</strong><span>{t.locations}</span></div><div><strong>{stats.people}</strong><span>{t.people}</span></div><div><strong>{stats.albums}</strong><span>{t.albums}</span></div></div>
          <p className="photo-import-data-note">{stats.enriched ? `✓ ${stats.enriched} / ${stats.count} ${t.enriched}` : t.plainStats}</p>
          {mode === 'mac' && stats.enriched < stats.count && <p className="photo-import-warning">{stats.enriched ? t.partialSidecars : t.noSidecars}</p>}
          <div className="photo-import-previews">{selection.entries.slice(0, 12).map((entry, index) => <Preview key={`${session.current}-${entry.file.importPath || entry.file.webkitRelativePath || entry.file.name}-${index}`} entry={entry} t={t}
            remove={!locked ? () => setSelection(value => ({ ...value, entries: value.entries.filter(e => e !== entry) })) : null} />)}</div>
          {stats.count > 12 && <small>+ {stats.count - 12} {t.more}</small>}
          {!folderId && <label>{s.name}<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} disabled={started || busy} /></label>}
          {stats.albums > 0 && <label className="photo-import-toggle"><input type="checkbox" checked={preserveAlbums} onChange={event => setPreserveAlbums(event.target.checked)} disabled={started || busy} /><span>{t.preserve}<small>{t.preserveHint}</small></span></label>}
          {!started && <button type="button" className="photo-import-reset" onClick={() => { setSelection(empty); setError(''); }}>{t.restart}</button>}
        </>}
        {selection.warnings.map(w => <p key={w.type} className="photo-import-warning">{w.count} {t[w.type]}{w.names ? `: ${w.names.join(', ')}` : ''}.</p>)}
        {started && <div className="photo-import-progress" role="status" aria-live="polite"><div><strong>{busy ? progress.saving ? t.saving : t.uploading : paused ? t.paused : s.retry}</strong><span>{progress.percent}%</span></div>
          <progress value={progress.percent} max={100} aria-label={t.import} /><small>{progress.done} / {stats.count} {s.photos} · {t.keepOpen}</small></div>}
        {error && <p className="dialog-error" role="alert">{error}</p>}
        <footer><button type="button" className="dialog-button dialog-button--secondary" onClick={onClose} disabled={busy || reading}>{s.close}</button>
          {busy ? <button type="button" className="dialog-button" disabled={paused} onClick={() => { pause.current = true; setPaused(true); }}>{paused ? t.pausing : t.pause}</button> :
            <button className="dialog-button dialog-button--accent" disabled={reading || !stats.count || (!folderId && !name.trim())}>{started ? t.resume : `${t.import} ${stats.count || ''} ${s.photos}`} →</button>}</footer>
      </form>}
    </div>
  </Modal>;
}
