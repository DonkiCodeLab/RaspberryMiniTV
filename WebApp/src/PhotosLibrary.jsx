import { lockBodyScroll } from "./bodyScrollLock.js";
import React, { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getPictureContentUrl, photoRequest } from './api/raspberryApi.js';
import { descendantIds, folderTrail, hasLocation, indexPhotos, photoPage, pendingVariants, SPECIAL_FOLDERS, STYLES } from './photoLibrary.js';
import { photoStrings } from './photoStrings.js';
import PhotoUploadDialog from './PhotoUploadDialog.jsx';
import { photoImportStrings } from './photoImportStrings.js';
import { watchPhotoLibrary } from './photoLibraryRefresh.js';
import './PhotosLibrary.css';
const PhotoMap = lazy(() => import('./PhotoMap.jsx'));
const blank = { folders: [], photos: [], people: [], jobs: [], faces: {} };

function Icon({ type }) {
  const shapes = {
    uploads: <><path d="M12 30V14h14l5 5h21v27H12z" /><path d="M32 39V25m-6 6 6-6 6 6" /></>,
    map: <><circle cx="32" cy="32" r="22" /><ellipse cx="32" cy="32" rx="10" ry="22" /><path d="M10 32h44M14 20h36M14 44h36" /></>,
    ai: <><path d="m29 10 6 16 16 6-16 6-6 16-6-16-16-6 16-6zM49 7v12M43 13h12" /></>,
    people: <><circle cx="25" cy="23" r="9" /><path d="M8 51v-6c0-14 34-14 34 0v6M43 15a9 9 0 0 1 0 18m4 5c7 1 9 5 9 13" /></>,
    folder: <><path d="M9 22V14h17l7 8h22v29H9z" /><path d="M9 26h46" /></>,
  };
  return <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[type] || shapes.folder}</svg>;
}

function dateLabel(value, language, fallback) {
  if (!value) return fallback;
  const date = new Date(typeof value === 'number' ? value * 1000 : /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) + 'T12:00:00' : value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString(language === 'ca' ? 'ca-ES' : language === 'en' ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}
function PhotoMeta({ photo, s, language }) {
  return <div className="photo-meta"><span title={s.taken}>◷ {dateLabel(photo.takenAt, language, s.noDate)}</span>
    <span>⌖ {hasLocation(photo) ? `${photo.latitude.toFixed(4)}°, ${photo.longitude.toFixed(4)}°` : s.noGps}</span></div>;
}
function PhotoImage({ photo, render = 'thumb', ...props }) {
  const [error, setError] = useState(false);
  return error ? <span className="photo-image-error" role="img" aria-label={photo.name}>▧ {photo.name}</span> :
    <img {...props} src={getPictureContentUrl(photo.relativePath, render) || undefined} alt={photo.name} onError={() => setError(true)} />;
}

export function PhotoPagination({ page, onChange, s, label = s.photos }) {
  if (!page.total) return null;
  return <nav className="photo-pagination" aria-label={`${s.pages}: ${label}`}>
    <button type="button" className="dialog-button" disabled={page.page <= 1} onClick={() => onChange(page.page - 1)}>{s.previous}</button>
    <span role="status">{page.offset + 1}–{page.offset + page.items.length} / {page.total} {label} · {s.page} {page.page} / {page.pages}</span>
    <button type="button" className="dialog-button" disabled={page.page >= page.pages} onClick={() => onChange(page.page + 1)}>{s.next}</button>
  </nav>;
}

export function PhotoGrid({ page, actionMode, selected, toggle, onOpen, s, language, renderMarks }) {
  return <div className="photo-mosaic">{page.items.map((photo, index) => <article key={photo.id} className={`photo-tile${selected.has(photo.id) ? ' is-selected' : ''}`}>
    <button type="button" className="photo-tile__image" aria-label={`${actionMode ? s.select : s.open}: ${photo.name}`} aria-pressed={actionMode ? selected.has(photo.id) : undefined}
      onClick={() => actionMode ? toggle(photo.id) : onOpen(page.offset + index)}>
      <PhotoImage photo={photo} loading="lazy" decoding="async" />{actionMode && <span className="photo-check" aria-hidden="true">{selected.has(photo.id) ? '✓' : ''}</span>}
      {photo.sourceId && <span className="photo-style">{STYLES[photo.style] || s.generated}</span>}
    </button><div className="photo-tile__info"><strong title={photo.name}>{photo.title || photo.name}</strong><PhotoMeta photo={photo} s={s} language={language} /></div>
    {renderMarks?.('picture', photo.relativePath)}
  </article>)}</div>;
}

function Modal({ title, s, onClose, children, wide = false, busy = false, onKeyDown, className = '' }) {
  const ref = useRef(null), titleId = useId();
  useEffect(() => {
    const dialog = ref.current, previous = document.activeElement;
    dialog.showModal();
    const releaseScroll = lockBodyScroll();
    return () => { dialog.close(); releaseScroll(); previous?.focus?.(); };
  }, []);
  return createPortal(<dialog ref={ref} className={`photo-dialog${wide ? ' photo-dialog--wide' : ''} ${className}`} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onKeyDown={onKeyDown}
    onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="photo-dialog__body"><header><h2 id={titleId}>{title}</h2><button type="button" className="photo-close" onClick={onClose} disabled={busy} aria-label={s.close}>×</button></header>{children}</div>
  </dialog>, document.body);
}

function AlbumCard({ folder, photos, s, language, onOpen, special }) {
  const [active, setActive] = useState(false), [step, setStep] = useState(0);
  const covers = photos.slice(0, 8);
  useEffect(() => {
    setStep(0);
    if (!active || covers.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setStep(value => value + 1), 2500);
    return () => clearInterval(timer);
  }, [active, covers.length]);
  const cover = covers.length ? covers[step % covers.length] : null;
  const latest = photos.reduce((value, photo) => Math.max(value, photo.uploadedAt || 0), 0);
  return <article className={`movie-library__card photo-album photo-album--${special || 'folder'}`}
    onPointerEnter={event => { if (event.pointerType === 'mouse') setActive(true); }} onPointerLeave={() => setActive(false)}
    onFocusCapture={() => setActive(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setActive(false); }}>
    <button className="movie-library__poster photo-album__cover" type="button" aria-label={`${s.open}: ${folder.name}`} onClick={onOpen}>
      {cover && (!special || active) ? <PhotoImage key={cover.id} photo={cover} loading="lazy" /> : <span className="photo-album__art"><Icon type={special || 'folder'} /><span>{folder.name}</span></span>}
      <span className="photo-album__badge"><Icon type={special || 'folder'} /></span>
    </button>
    <div className="movie-library__info"><h2>{folder.name}</h2><div className="movie-library__meta"><span>{photos.length} {s.photos}</span></div>
      <small className="photo-album__date">{s.uploaded} · {dateLabel(latest || folder.created, language, '—')}</small>
      <div className="movie-library__actions movie-library__actions--single"><button type="button" onClick={onOpen}>{s.open} <span aria-hidden="true">↗</span></button></div>
    </div>
  </article>;
}

function FolderDialog({ mode, folders, current, selected, person, s, onClose, onComplete }) {
  const [name, setName] = useState(person?.name || ''), [target, setTarget] = useState(''), [parent, setParent] = useState(current || '');
  const [isNew, setIsNew] = useState(mode === 'create'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const working = useRef(false);
  const title = mode === 'rename' ? s.rename : mode === 'move' ? s.moveTitle : s.create;
  const options = folders.filter(folder => !['uploads', 'ai'].includes(folder.id));
  const path = id => folderTrail(folders, id).map(folder => s[folder.id] || folder.name).join(' / ');
  async function submit(event) {
    event.preventDefault(); if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try {
      const result = mode === 'rename' ? await photoRequest(`people/${person.id}`, { name }) : mode === 'create' ?
        await photoRequest('folders', { name, parent }) : await photoRequest('move', { ids: [...selected], ...(isNew ? { name, parent } : { folderId: target }) });
      onComplete(result);
    } catch (error) { setError(error.message); }
    finally { working.current = false; setBusy(false); }
  }
  return <Modal title={title} s={s} onClose={onClose} busy={busy}><form onSubmit={submit}>
    {mode === 'move' && <><p>{selected.size} {s.photos}</p><div className="photo-segments"><button type="button" aria-pressed={!isNew} onClick={() => setIsNew(false)}>{s.existing}</button><button type="button" aria-pressed={isNew} onClick={() => setIsNew(true)}>{s.newFolder}</button></div></>}
    {mode === 'rename' || isNew ? <label>{mode === 'rename' ? s.personName : s.name}<input autoFocus required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label> :
      <label>{s.destination}<select value={target} required onChange={event => setTarget(event.target.value)}><option value="">—</option>{options.map(folder => <option key={folder.id} value={folder.id}>{path(folder.id)}</option>)}</select></label>}
    {isNew && <label>{s.parent}<select value={parent} onChange={event => setParent(event.target.value)}><option value="">{s.root} /</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{path(folder.id)}</option>)}</select></label>}
    {error && <p className="dialog-error" role="alert">{error}</p>}
    <footer><button type="button" className="dialog-button dialog-button--secondary" onClick={onClose} disabled={busy}>{s.cancel}</button><button className="dialog-button dialog-button--accent" disabled={busy}>{mode === 'move' ? s.move : s.save}</button></footer>
  </form></Modal>;
}

function Viewer({ photos, initial, onClose, onViewed, s, language, people = [] }) {
  const [index, setIndex] = useState(initial);
  const [metadataError, setMetadataError] = useState('');
  const t = photoImportStrings(language);
  const photo = photos[index];
  const names = people.filter(person => person.photoIds.includes(photo.id)).map(person => person.name);
  async function downloadMetadata() {
    setMetadataError('');
    try {
      const data = await photoRequest(`metadata/${photo.id}`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `${photo.name}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setMetadataError(error.message); }
  }
  const change = direction => setIndex(value => (value + direction + photos.length) % photos.length);
  return <Modal title={photo?.name || s.root} s={s} onClose={onClose} wide onKeyDown={event => {
    if (event.key === 'ArrowRight') { event.preventDefault(); change(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); change(-1); }
  }}>
    <div className="photo-viewer"><button type="button" aria-label={s.previous} onClick={() => change(-1)} disabled={photos.length < 2}>‹</button>
      <PhotoImage key={photo.id} photo={photo} render="preview" onLoad={() => onViewed?.(photo)} /><button type="button" aria-label={s.next} onClick={() => change(1)} disabled={photos.length < 2}>›</button></div>
    <div className="photo-viewer__meta"><PhotoMeta photo={photo} s={s} language={language} /><span>{index + 1} / {photos.length}</span></div>
    {(photo.metadataSource || names.length > 0) && <div className="photo-import-details">
      {photo.title && <strong>{photo.title}</strong>}
      {photo.appleFavorite && <small>♥ {t.favorite}</small>}
      {photo.description && <p>{photo.description}</p>}
      {names.length > 0 && <div className="photo-import-tags" aria-label={s.people}>{names.map((name, index) => <span key={`${name}-${index}`}>{name}</span>)}</div>}
      {photo.albums?.length > 0 && <p>{t.albums}: {photo.albums.join(' · ')}</p>}
      {photo.keywords?.length > 0 && <p>{t.keywords}: {photo.keywords.join(' · ')}</p>}
      {photo.metadataSource && <button type="button" className="dialog-button" onClick={downloadMetadata}>{t.metadata} ↓</button>}
      {metadataError && <p role="alert">{metadataError}</p>}
    </div>}
  </Modal>;
}

export default function PhotosLibrary({ language = 'es', renderMarks, onViewed, initialFiles, onImportDone, matchesPicture, onRootChange }) {
  const s = photoStrings(language), t = photoImportStrings(language);
  const [data, setData] = useState(blank), [current, setCurrent] = useState(''), [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [actionMode, setActionMode] = useState(false), [selected, setSelected] = useState(new Set());
  const [dialog, setDialog] = useState(null), [viewer, setViewer] = useState(null), [zone, setZone] = useState(null), [busy, setBusy] = useState(false);
  const requestRef = useRef(0), refreshing = useRef(false), mounted = useRef(true), importing = useRef(false);
  const catalogue = useRef(blank), watcher = useRef(null);
  importing.current = dialog?.mode === 'upload';
  const [attempt, setAttempt] = useState(0);
  const [photoNumber, setPhotoNumber] = useState(1), [folderNumber, setFolderNumber] = useState(1);
  const grid = useRef(null);
  const index = useMemo(() => indexPhotos(data.photos, data.people), [data.photos, data.people]);
  useEffect(() => { setPhotoNumber(1); setFolderNumber(1); }, [current, search, zone]);
  useEffect(() => {
    onRootChange?.(!current);
    return () => onRootChange?.(true);
  }, [current, onRootChange]);
  async function refresh(signal) {
    const generation = ++requestRef.current;
    refreshing.current = true;
    try {
      const result = await photoRequest('library', undefined, signal);
      if (!mounted.current || signal?.aborted || generation !== requestRef.current) return;
      catalogue.current = result;
      setData(result); setError('');
    } catch (error) { if (mounted.current && !signal?.aborted && generation === requestRef.current) setError(error.message); }
    finally { if (generation === requestRef.current) { refreshing.current = false; if (mounted.current && !signal?.aborted) { setLoading(false); watcher.current?.sync(); } } }
  }
  useEffect(() => {
    mounted.current = true; const controller = new AbortController();
    const updates = watchPhotoLibrary({
      current: () => catalogue.current,
      readStatus: () => photoRequest('status', undefined, controller.signal),
      refresh: () => refresh(controller.signal),
      canCheck: () => !document.hidden && !refreshing.current && !importing.current,
      onError: error => { if (!controller.signal.aborted) setError(error.message); },
    });
    watcher.current = updates;
    refresh(controller.signal);
    const check = () => { void updates.check(); };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      mounted.current = false; updates.stop(); controller.abort();
      window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check);
    };
  }, [attempt]);
  useEffect(() => { watcher.current?.sync(); }, [dialog?.mode]);
  useEffect(() => { if (initialFiles?.length) setDialog({ mode: 'upload', files: initialFiles, parent: 'uploads' }); }, [initialFiles]);
  const person = current.startsWith('person:') ? data.people.find(p => p.id === current.slice(7)) : null;
  const trail = person ? [{ id: 'people', name: s.people }, { id: current, name: person.name }] : ['map', 'people'].includes(current) ? [{ id: current, name: s[current] }] : folderTrail(data.folders, current);
  const title = person?.name || s[current] || data.folders.find(f => f.id === current)?.name || s.root;
  const query = search.trim().toLocaleLowerCase();
  const visible = useCallback(photo => (!query || [photo.name, photo.title, photo.description, ...(photo.albums || []), ...(photo.keywords || []), ...(index.namesByPhoto.get(photo.id) || [])].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)) && (!matchesPicture || matchesPicture(photo)), [query, index, matchesPicture]);
  const inFolder = id => [...new Set([...descendantIds(data.folders, id)].flatMap(folder => index.byFolder.get(folder) || []))];
  const mapPhotos = useMemo(() => data.photos.filter(p => !p.sourceId && visible(p)), [data.photos, visible]);
  const currentPhotos = useMemo(() => (person ? index.byPerson.get(person.id) || [] : current === 'map' ? (zone ? zone.map(id => index.byId.get(id)).filter(Boolean) : []) : index.byFolder.get(current) || []).filter(visible), [person, index, current, zone, visible]);
  const folders = current === 'people' ? data.people.map(p => ({ ...p, id: `person:${p.id}` })) : data.folders.filter(f => f.parent === current);
  const displayedFolders = folders.filter(f => !query || (s[f.id] || f.name).toLocaleLowerCase().includes(query) || inFolder(f.id).some(visible));
  const page = photoPage(currentPhotos, photoNumber);
  const folderPage = photoPage(displayedFolders.filter(folder => current || !SPECIAL_FOLDERS.includes(folder.id)), folderNumber);
  const changePage = number => { setPhotoNumber(number); setSelected(new Set()); grid.current?.scrollIntoView({ block: 'start' }); };
  const isAi = current !== 'ai' && trail.some(f => f.id === 'ai');
  const canWrite = !person && !['map', 'people'].includes(current);
  const albumPhotos = index.byFolder.get(current) || [];
  const originalIds = new Set(albumPhotos.map(p => p.id));
  const pending = isAi ? pendingVariants(data.photos.filter(p => originalIds.has(p.id) || originalIds.has(p.sourceId))) : 0;
  const job = data.jobs.find(j => j.folder === current);
  const navigate = id => { setCurrent(id); setSearch(''); setSelected(new Set()); setActionMode(false); setZone(null); setNotice(''); };
  const closeDialog = () => { setDialog(null); onImportDone?.(); return refresh(); };
  async function complete(result) {
    const mode = dialog?.mode; await closeDialog();
    setSelected(new Set());
    if (result.folderId || (mode === 'create' && result.id)) navigate(result.folderId || result.id);
    setNotice(mode === 'upload' ? s.imported : mode === 'move' ? s.moved : mode === 'create' ? s.albumCreated : s.saved);
  }
  async function act(action, payload) {
    if (busy) return;
    setBusy(true); setError('');
    try { await photoRequest(action, payload); await refresh(); return true; }
    catch (error) { setError(error.message); return false; }
    finally { setBusy(false); }
  }
  function toggle(id) { setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function album(folder, special) {
    const photos = special === 'map' ? mapPhotos.filter(hasLocation) : special === 'people' ? data.photos.filter(p => index.namesByPhoto.has(p.id)) :
      folder.id.startsWith('person:') ? index.byPerson.get(folder.id.slice(7)) || [] : inFolder(folder.id);
    return <AlbumCard key={folder.id} folder={{ ...folder, name: s[folder.id] || folder.name }} photos={photos.filter(visible)} special={special}
      s={s} language={language} onOpen={() => navigate(folder.id)} />;
  }
  return <section className="pictures-library seasons-section photo-library" aria-label={s.root}>
    <div className="seasons-section__label">{data.photos.length} {s.photos}</div>
    <nav className="photo-breadcrumbs" aria-label={s.folders}><button type="button" onClick={() => navigate('')}>{s.root}</button>{trail.map(folder => <React.Fragment key={folder.id}><span>/</span><button type="button" aria-current={folder.id === current ? 'page' : undefined} onClick={() => navigate(folder.id)}>{s[folder.id] || folder.name}</button></React.Fragment>)}</nav>
    <header className="photo-library__header"><div><h1>{title}</h1><p>{current ? `${currentPhotos.length} ${s.photos} · ${folders.length} ${s.albums}` : s.intro}</p></div>
      <div className="photo-toolbar">{canWrite && <><button className="dialog-button" type="button" onClick={() => setDialog({ mode: 'create' })}>＋ {s.newFolder}</button>
        <button className="dialog-button dialog-button--accent" type="button" onClick={() => setDialog({ mode: 'upload', folderId: current && !SPECIAL_FOLDERS.includes(current) ? current : '', parent: current === 'ai' ? 'ai' : 'uploads' })}>↑ {s.upload}</button></>}
        {person && <button className="dialog-button" type="button" onClick={() => setDialog({ mode: 'rename' })}>{s.rename}</button>}
        <button className="photo-refresh" type="button" title={s.refresh} aria-label={s.refresh} onClick={() => { setAttempt(n => n + 1); }}>↻</button>
      </div></header>
    {data.demo && <p className="photo-note">{s.demo}</p>}
    {data.scanning && <p role="status">{s.indexing}</p>}{data.scanError && <p role="status">{data.scanError}</p>}
    {error && <div className="photo-alert" role="alert">{error} <button type="button" onClick={() => setAttempt(n => n + 1)}>{s.retry}</button></div>}
    {notice && <p role="status">{notice}</p>}
    {current === 'people' && <div className="photo-note"><p>{s.peopleHint}</p><p>{s.peopleLocal}</p>
      {!data.faces.available ? <p>{s.peopleSetup}</p> : <><button className="dialog-button" type="button" disabled={busy || data.faces.running} onClick={() => act('people/scan', {})}>{data.faces.running ? s.scanningFaces : s.scan}</button> <small>{data.faces.pending || 0} {s.photos}</small></>}
      {data.faces.error && <p role="status">{data.faces.error}</p>}
    </div>}
    {(current === 'ai' || isAi) && <div className="photo-ai-banner"><Icon type="ai" /><div><p>{s.aiHint}</p>
      {isAi && <><small>{albumPhotos.filter(p => !p.sourceId).length} {s.originals} · {pending} {s.pending}</small><p>{s.aiSend}</p>
        {!data.aiReady && <p>{s.aiSetup}</p>}
        <button className="dialog-button dialog-button--accent" type="button" disabled={busy || !data.aiReady || !pending || data.jobs.some(j => j.state === 'running')}
          onClick={() => act('generate', { folderId: current })}>{job?.state === 'running' ? s.generating : job ? s.retryGeneration : s.generate}</button>
        {job && <div className="photo-job" role="status"><progress max={job.total} value={job.done} /><span>{job.done} / {job.total} · {job.state === 'complete' ? s.complete : job.state === 'running' ? s.running : job.error}</span></div>}
      </>}
    </div></div>}
    {!current && <button type="button" className="photo-import-banner" onClick={() => setDialog({ mode: 'upload', parent: 'uploads' })}>
      <span className="photo-import-banner__art" aria-hidden="true">✳</span><span><strong>{t.banner}</strong><small>{t.bannerText}</small></span><span aria-hidden="true">↗</span>
    </button>}
    <div className="photo-browse-tools"><input type="search" aria-label={s.search} placeholder={s.search} value={search} onChange={event => { setSearch(event.target.value); setSelected(new Set()); }} />
      {currentPhotos.length > 0 && <button className="dialog-button" type="button" aria-pressed={actionMode} onClick={() => { setActionMode(!actionMode); setSelected(new Set()); }}>{actionMode ? s.done : s.actions}</button>}</div>
    {loading && <p role="status">{s.loading}</p>}
    {!current && <div className="movie-library__items--grid photo-folder-grid">{SPECIAL_FOLDERS.map(id => album({ id, name: s[id], created: null }, id))}</div>}
    {folderPage.total > 0 && <><div className="movie-library__items--grid photo-folder-grid">{folderPage.items.map(folder => album(folder))}</div>
      <PhotoPagination page={folderPage} onChange={setFolderNumber} s={s} label={s.folders} /></>}
    {current === 'map' && !zone && <Suspense fallback={<p>{s.loading}</p>}><PhotoMap photos={mapPhotos} s={s} onCluster={photos => { setZone(photos.map(p => p.id)); setSelected(new Set()); setActionMode(false); }} /></Suspense>}
    {zone && <div className="photo-zone"><h2>{s.zone} · {currentPhotos.length}</h2><button type="button" className="dialog-button" onClick={() => { setZone(null); setSelected(new Set()); setActionMode(false); }}>{s.allPlaces}</button></div>}
    {actionMode && <div className="photo-selection"><strong>{selected.size} {s.selected}</strong>
      <button type="button" onClick={() => setSelected(new Set(page.items.map(p => p.id)))}>{s.selectPage}</button><button type="button" onClick={() => setSelected(new Set())}>{s.clear}</button>
      <button type="button" className="dialog-button dialog-button--accent" disabled={!selected.size} onClick={() => setDialog({ mode: 'move' })}>{s.move} →</button>
      {person && <button type="button" disabled={!selected.size || busy} onClick={async () => { if (await act(`people/${person.id}/remove`, { ids: [...selected] })) { setSelected(new Set()); setNotice(s.removedMatches); } }}>{s.removeMatches}</button>}
    </div>}
    {currentPhotos.length > 0 && <div ref={grid} className="photo-page">
      <PhotoPagination page={page} onChange={changePage} s={s} />
      <PhotoGrid page={page} actionMode={actionMode} selected={selected} toggle={toggle} onOpen={initial => setViewer({ photos: currentPhotos, initial })} s={s} language={language} renderMarks={renderMarks} />
      <PhotoPagination page={page} onChange={changePage} s={s} />
    </div>}
    {!loading && current && current !== 'map' && !displayedFolders.length && !currentPhotos.length && <div className="photo-empty"><Icon type={current === 'people' ? 'people' : 'folder'} /><h2>{query ? s.matches : current === 'people' ? s.peopleEmpty : s.empty}</h2><p>{s.emptyHint}</p></div>}
    {dialog?.mode === 'upload' && <PhotoUploadDialog Modal={Modal} language={language} initialMode={dialog.files?.length ? 'files' : 'mac'} key="upload" initialFiles={dialog.files} folderId={dialog.folderId} parent={dialog.parent} s={s} onClose={closeDialog} onComplete={complete} />}
    {dialog && dialog.mode !== 'upload' && <FolderDialog mode={dialog.mode} folders={data.folders} current={canWrite ? current : ''} selected={selected} person={person} s={s} onClose={closeDialog} onComplete={complete} />}
    {viewer && <Viewer {...viewer} people={data.people} s={s} language={language} onViewed={onViewed} onClose={() => setViewer(null)} />}
  </section>;
}
