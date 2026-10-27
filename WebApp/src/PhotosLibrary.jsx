import { currentAge } from './personBirthday.js';
import { intlLocale } from "./i18n/languages.js";
import { lockBodyScroll } from "./bodyScrollLock.js";
import React, { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import useBrowserBack from './useBrowserBack.js';
import usePhotoDragSelection from './usePhotoDragSelection.js';
import { createPortal } from 'react-dom';
import { getPictureContentUrl, photoRequest } from './api/raspberryApi.js';
import { descendantIds, folderTrail, hasLocation, indexPhotos, isNewPhotoPerson, photoPage, photoDeleteRequest, pendingVariants, photosWithoutPeople, photoPeopleOptions, sortPhotos, SPECIAL_FOLDERS, STYLES, UNKNOWN_PERSON_ID } from './photoLibrary.js';
import { PHOTO_PLACEHOLDER, requestThumbnail } from './photoThumbnails.js';
import { facePortraitLayout, personCoverPhotoId } from './photoFacePortrait.js';
import PhotoFaceViewer, { PersonFaceControls } from './PhotoFaceViewer.jsx';
import PhotoReviewWizard, { readPhotoReviewDraft } from './PhotoReviewWizard.jsx';
import PhotoDownloads, { PhotoDownloadDialog } from './PhotoDownloads.jsx';
import PhotoMeta from './PhotoMeta.jsx';
import { dateLabel } from './photoMetadata.js';
import PhotoGallery from './PhotoGallery.jsx';
import { PeopleAnalysis, PersonEditor } from './PhotoPeople.jsx';
import { PeopleActionDialog, PeopleToolbar, PersonCardActions } from './PhotoPeopleActions.jsx';
import { NewPersonCardActions, NewPeopleToolbar, PeopleBatchDialog } from './PhotoPeopleBatch.jsx';
import { peopleBatchEntries, updatePersonDraft } from './photoPeopleBatch.js';
import { handlePeopleReviewKey } from './photoPeopleKeyboard.js';
import { createImportId } from './photoImport.js';
import PersonPhotoDialog from './PersonPhotoDialog.jsx';
import PersonPhotoPopover from './PersonPhotoPopover.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';
import { galleryWindow } from './photoTimeline.js';
import { photoStrings } from './photoStrings.js';
import { photoImportStrings } from './photoImportStrings.js';
import PhotoUploadDialog from './PhotoUploadDialog.jsx';
import PhotoSectionCarousel from './PhotoSectionCarousel.jsx';
import Icon from './PhotoIcon.jsx';
import { watchPhotoLibrary } from './photoLibraryRefresh.js';
import { indexPhotoReviews, reviewsForPhotos, pendingFacePreview } from './photoReviews.js';
import { NoFacesReviewFilter, PhotoReviewAction } from './PhotoReviews.jsx';
import './PhotosLibrary.css';
const PhotoMap = lazy(() => import('./PhotoMap.jsx'));
const blank = { folders: [], photos: [], people: [], jobs: [], faces: {} };

function PhotoLibraryLoading({ s }) {
  return <div className="photo-library-loading" role="status"><LoadingSpinner inline /><span>{s.loading}</span></div>;
}

function PhotoImage({ photo, tiny = false, preview = false, alt = photo.name, ...props }) {
  const [error, setError] = useState(false), [ready, setReady] = useState(''), [visible, setVisible] = useState(false);
  const element = useRef(null), url = getPictureContentUrl(photo.relativePath, tiny ? 'tiny' : preview ? 'preview' : 'thumb');
  useEffect(() => {
    if (!element.current) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '120px' });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [url]);
  useEffect(() => {
    if (!visible || ready === url || !url) return;
    const controller = new AbortController(); setError(false);
    requestThumbnail(url, controller.signal, tiny ? 1 : 0).then(value => { if (!controller.signal.aborted) setReady(value); })
      .catch(error => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [url, visible, ready, tiny]);
  return error ? <span className="photo-image-error" role="img" aria-label={alt}>▧ {alt}</span> :
    <img {...props} ref={element} src={ready && ready === url ? url : PHOTO_PLACEHOLDER} alt={alt} onError={() => setError(true)} />;
}

export function PersonPortrait({ person, photo, s }) {
  const [size, setSize] = useState(null);
  const box = person.coverFace?.box;
  const usable = photo?.id === person.coverFace?.photoId && facePortraitLayout(box, 1, 1);
  const layout = usable && size?.photoId === photo.id ? facePortraitLayout(box, size.width, size.height) : null;
  if (photo && photo.id === person.coverPhotoId && !usable) return <span className="photo-person-portrait" title={person.name}>
    <PhotoImage key={photo.id} photo={photo} preview alt={person.name} className="photo-person-portrait__full" loading="lazy" decoding="async" />
  </span>;
  return <span className="photo-person-portrait" title={!usable ? s.faceCoverMissing : person.name}>
    {!layout && <span className="photo-person-portrait__placeholder" role="img" aria-label={usable ? person.name : `${person.name}. ${s.faceCoverMissing}`}><Icon type="people" /></span>}
    {usable && <span className="photo-person-portrait__crop" style={{ ...layout?.frame, visibility: layout ? 'visible' : 'hidden' }}>
      <PhotoImage key={photo.id} photo={photo} preview alt={person.name} style={layout?.image} loading="lazy" decoding="async"
        onLoad={event => {
          const image = event.currentTarget;
          if (image.naturalWidth > 1 && image.naturalHeight > 1) setSize({ photoId: photo.id, width: image.naturalWidth, height: image.naturalHeight });
        }} />
    </span>}
  </span>;
}

export function PhotoPagination({ page, onChange, s, label = s.photos }) {
  if (!page.total) return null;
  return <nav className="photo-pagination" aria-label={`${s.pages}: ${label}`}>
    <button type="button" className="dialog-button" disabled={page.page <= 1} onClick={() => onChange(page.page - 1)}>{s.previous}</button>
    <span role="status">{page.offset + 1}–{page.offset + page.items.length} / {page.total} {label} · {s.page} {page.page} / {page.pages}</span>
    <button type="button" className="dialog-button" disabled={page.page >= page.pages} onClick={() => onChange(page.page + 1)}>{s.next}</button>
  </nav>;
}

export function PersonPhotoPreview({ photo, person }) {
  const [ratio, setRatio] = useState(photo.width && photo.height ? photo.width / photo.height : null);
  const faces = person.faceBoxes?.[photo.id] || [];
  return <span className="photo-person-match" style={ratio ? {
    width: `${100 * Math.min(1, ratio / 1.12)}%`, height: `${100 * Math.min(1, 1.12 / ratio)}%`,
  } : { width: '100%', height: '100%' }}>
    <PhotoImage photo={photo} loading="lazy" decoding="async" onLoad={event => {
      const image = event.currentTarget;
      if (image.naturalWidth > 1 && image.naturalHeight > 1) setRatio(image.naturalWidth / image.naturalHeight);
    }} />
    {ratio && faces.map(face => facePortraitLayout(face.box, 1, 1) && <span key={face.id}
      className="photo-person-match__box" role="img" aria-label={face.name || person.name}
      style={{ left: `${face.box.x * 100}%`, top: `${face.box.y * 100}%`, width: `${face.box.width * 100}%`, height: `${face.box.height * 100}%` }} />)}
  </span>;
}

export function PhotoGrid({ page, actionMode, selected, toggle, onOpen, s, language, renderMarks, person, onDelete, onChanged, coverMode = false, coverPhotoId, onCover, coverBusy = false, reviewItems, reviewPeople = [], onReview, reviewBusy = false, reviewingMatches = false }) {
  const dragSelection = reviewingMatches && actionMode && !reviewBusy && !coverMode;
  return <div className={`photo-mosaic${dragSelection ? ' photo-mosaic--drag-select' : ''}`}>{page.items.map((photo, index) => <article key={photo.id} data-photo-select-id={dragSelection ? photo.id : undefined} className={`photo-tile${selected.has(photo.id) ? ' is-selected' : ''}`}>
    <button type="button" className="photo-tile__image" data-photo-select-start={dragSelection ? '' : undefined} aria-label={`${coverMode ? s.useCover : actionMode ? s.select : s.open}: ${photo.name}`} aria-pressed={coverMode ? coverPhotoId === photo.id : actionMode ? selected.has(photo.id) : undefined}
      disabled={coverMode && coverBusy || reviewingMatches && actionMode && reviewBusy} onClick={() => coverMode ? onCover(photo.id) : actionMode ? toggle(photo.id) : onOpen(page.offset + index)}>
      {person || reviewingMatches ? <PersonPhotoPreview key={photo.id} photo={photo} person={person || pendingFacePreview(photo.id, reviewItems?.get(photo.id) || [], reviewPeople)} /> : <PhotoImage photo={photo} loading="lazy" decoding="async" />}{actionMode && !reviewingMatches && <span className="photo-check" aria-hidden="true">{selected.has(photo.id) ? '✓' : ''}</span>}
      {photo.sourceId && <span className="photo-style">{STYLES[photo.style] || s.generated}</span>}
      {coverPhotoId === photo.id && <span className="photo-cover-label">{s.cover}</span>}
    </button><div className="photo-tile__info"><strong title={photo.name}>{photo.title || photo.name}</strong><PhotoMeta photo={photo} s={s} language={language} onChanged={person ? onChanged : undefined} disabled={coverBusy || reviewBusy} /></div>
    {reviewingMatches && <label className="photo-review-check" data-photo-select-start={dragSelection ? '' : undefined}>
      <input type="checkbox" data-photo-select-start={dragSelection ? '' : undefined} checked={selected.has(photo.id)} disabled={reviewBusy} aria-label={`${s.select}: ${photo.title || photo.name}`} onChange={() => toggle(photo.id)} />
    </label>}
    {reviewingMatches && <p className="photo-review-names">{pendingFacePreview(photo.id, reviewItems?.get(photo.id) || [], reviewPeople).name}</p>}
    {reviewItems && <PhotoReviewAction reviews={(reviewItems.get(photo.id) || []).filter(review => !person || review.personId === person.id)} s={s} busy={reviewBusy} onConfirm={onReview} />}
    {person ? <div className="photo-card-actions">
      {renderMarks?.('picture', photo.relativePath, false, true, true)}
      <a className="media-mark" href={getPictureContentUrl(photo.relativePath, undefined, { download: true })}
        download={photo.name} title={s.downloadOriginal} aria-label={s.downloadOriginal}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></svg>
      </a>
      <button className="media-mark photo-card-actions__delete" type="button" title={s.deletePhotos} aria-label={s.deletePhotos} onClick={() => onDelete(photo)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg>
      </button>
    </div> : renderMarks?.('picture', photo.relativePath, false)}
  </article>)}</div>;
}

function Modal({ title, titleActions, s, onClose, children, wide = false, busy = false, onKeyDown, className = '' }) {
  const ref = useRef(null), titleId = useId();
  useBrowserBack(() => { if (!busy) onClose(); }, 40);
  useEffect(() => {
    const dialog = ref.current, previous = document.activeElement;
    dialog.showModal();
    const releaseScroll = lockBodyScroll();
    return () => { dialog.close(); releaseScroll(); previous?.focus?.(); };
  }, []);
  return createPortal(<dialog ref={ref} className={`photo-dialog${wide ? ' photo-dialog--wide' : ''} ${className}`} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onKeyDown={onKeyDown}
    onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="photo-dialog__body"><header><h2 id={titleId} title={title}>{title}</h2>{titleActions}<button type="button" className="photo-close" onClick={onClose} disabled={busy} aria-label={s.close}>×</button></header>{children}</div>
  </dialog>, document.body);
}

export function AlbumCard({ folder, photos, s, language, onOpen, onPreview, previewOnly = false, previewOpen = false, special, portraitPhoto, personActions, selected = false }) {
  const [active, setActive] = useState(false), [step, setStep] = useState(0);
  const isPerson = folder.id.startsWith('person:');
  const fixedIcon = folder.id === `person:${UNKNOWN_PERSON_ID}` ? 'unknownPerson' : folder.id === 'withoutPeople' ? 'withoutFaces' : folder.id === 'pendingValidation' ? 'pendingValidation' : null;
  const age = isPerson ? currentAge(folder.birthDate) : null;
  const birthday = age === null ? null : new Intl.DateTimeFormat(intlLocale(language), { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${folder.birthDate}T12:00:00Z`));
  const chosenCover = photos.find(photo => photo.id === folder.coverPhotoId);
  const covers = isPerson || fixedIcon ? [] : chosenCover ? [chosenCover] : photos.slice(0, 8);
  useEffect(() => {
    setStep(0);
    if (!active || covers.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setStep(value => value + 1), 2500);
    return () => clearInterval(timer);
  }, [active, covers.length]);
  const cover = covers.length ? covers[step % covers.length] : null;
  const latest = photos.reduce((value, photo) => Math.max(value, photo.uploadedAt || 0), 0);
  return <article className={`movie-library__card photo-album photo-album--${isPerson ? 'person' : folder.id === 'withoutPeople' ? 'without-people' : special || 'folder'}${selected ? ' is-selected' : ''}`}
    data-person-review-card={previewOnly ? folder.id : undefined}
    onPointerEnter={event => { if (event.pointerType === 'mouse') setActive(true); }} onPointerLeave={() => setActive(false)}
    onFocusCapture={() => setActive(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setActive(false); }}>
    <button className={`movie-library__poster photo-album__cover${onPreview ? ' photo-album__cover--preview' : ''}`} type="button"
      aria-label={`${onPreview ? s.personPhotoPreview : s.open}: ${folder.name}`} aria-haspopup={onPreview && !previewOnly ? 'dialog' : undefined}
      aria-expanded={onPreview && previewOnly ? previewOpen : undefined} onClick={onPreview || onOpen}>
      {fixedIcon ? <span className="photo-album__art"><Icon type={fixedIcon} /><span>{folder.name}</span></span> : isPerson ? <PersonPortrait person={folder} photo={portraitPhoto || photos.find(photo => photo.id === personCoverPhotoId(folder))} s={s} /> :
        cover && (!special || active) ? <PhotoImage key={cover.id} photo={cover} loading="lazy" /> : <span className="photo-album__art"><Icon type={special || 'folder'} /><span>{folder.name}</span></span>}
      <span className="photo-album__badge"><Icon type={fixedIcon || (isPerson ? 'people' : special || 'folder')} /></span>
      {previewOnly && onPreview && <span className="photo-album__preview-hint" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6M10 7v6m-3-3h6" /></svg>
        <span>{s.enlargePhoto}</span>{photos.length > 1 && <span className="photo-album__preview-count">{photos.length} {s.photos}</span>}
      </span>}
    </button>
    <div className="movie-library__info"><h2>{folder.name}</h2>{age !== null && <div className="photo-person-card-birthday"><span>{s.personAge.replace('{age}', age)}</span><span><span aria-hidden="true">🎂</span> {birthday}</span></div>}<div className="movie-library__meta"><span>{photos.length} {s.photos}</span></div>
      {folder.reviewCount > 0 && <span className="photo-review-badge">{(folder.id === 'withoutPeople' ? (folder.reviewCount === 1 ? s.newPhotoCount : s.newPhotosCount) : (folder.reviewCount === 1 ? s.pendingPhotoCount : s.pendingPhotosCount)).replace('{count}', folder.reviewCount)}</span>}
      <small className="photo-album__date">{s.uploaded} · {dateLabel(latest || folder.created, language, '—')}</small>
      {!previewOnly && <div className="movie-library__actions movie-library__actions--single"><button type="button" onClick={onOpen}>{s.open} <span aria-hidden="true">↗</span></button></div>}
      {personActions}
    </div>
  </article>;
}

function FolderDialog({ mode, folders, current, selected, person, photo, s, onClose, onComplete }) {
  const parents = folders.filter(folder => ['albums', 'ai'].includes(folderTrail(folders, folder.id)[0]?.id));
  const options = parents.filter(folder => !['albums', 'ai'].includes(folder.id));
  const memberships = new Set(photo ? [photo.folderId, ...(photo.folderIds || [])] : []);
  const [name, setName] = useState(person?.name || ''), [target, setTarget] = useState(''), [parent, setParent] = useState(parents.some(folder => folder.id === current) ? current : 'albums');
  const [isNew, setIsNew] = useState(mode === 'create' || mode === 'move' && !options.length), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const working = useRef(false);
  const title = mode === 'rename' ? s.rename : mode === 'move' ? s.moveTitle : s.create;
  const valid = mode === 'rename' || isNew ? !!name.trim() : options.some(folder => folder.id === target && !memberships.has(target));
  const path = id => folderTrail(folders, id).map(folder => (folder.id === 'albums' ? s.personalAlbums : s[folder.id]) || folder.name).join(' / ');
  async function submit(event) {
    event.preventDefault(); if (working.current || !valid) return;
    working.current = true; setBusy(true); setError('');
    try {
      const result = mode === 'rename' ? await photoRequest(`people/${person.id}`, { name }) : mode === 'create' ?
        await photoRequest('folders', { name, parent }) : await photoRequest('albums/add', { ids: [...selected], ...(isNew ? { name, parent } : { folderId: target }) });
      await onComplete(result);
    } catch (error) { setError(error.message); }
    finally { working.current = false; setBusy(false); }
  }
  return <Modal title={title} s={s} onClose={onClose} busy={busy}><form onSubmit={submit}>
    {mode === 'move' && <><p>{photo ? photo.title || photo.name : `${selected.size} ${s.photos}`} · {s.referenceHint}</p><div className="photo-segments"><button type="button" disabled={busy} aria-pressed={!isNew} onClick={() => setIsNew(false)}>{s.existingAlbum}</button><button type="button" disabled={busy} aria-pressed={isNew} onClick={() => setIsNew(true)}>{s.createAlbum}</button></div></>}
    {mode === 'rename' || isNew ? <label>{mode === 'rename' ? s.personName : mode === 'move' ? s.albumName : s.name}<input autoFocus required maxLength={100} value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label> :
      <label>{s.destination}<select autoFocus value={target} required disabled={busy} onChange={event => setTarget(event.target.value)}><option value="">—</option>{options.map(folder => <option key={folder.id} value={folder.id} disabled={memberships.has(folder.id)}>{path(folder.id)}{memberships.has(folder.id) ? ` · ${s.photoAlreadyInAlbum}` : ''}</option>)}</select></label>}
    {mode === 'move' && !isNew && !options.length && <p>{s.noAlbumsYet}</p>}
    {isNew && <label>{s.parent}<select value={parent} disabled={busy} onChange={event => setParent(event.target.value)}>{parents.map(folder => <option key={folder.id} value={folder.id}>{path(folder.id)}</option>)}</select></label>}
    {error && <p className="dialog-error" role="alert">{error}</p>}
    <footer><button type="button" className="dialog-button dialog-button--secondary" onClick={onClose} disabled={busy}>{s.cancel}</button><button className="dialog-button dialog-button--accent" disabled={busy || !valid}>{mode === 'move' ? isNew ? s.createAlbumAndAdd : s.move : s.save}</button></footer>
  </form></Modal>;
}

export function DeletePhotoChoices({ album, person, s, busy, onDelete }) {
  return <div className="photo-delete-choices">
    {(album || person) && <button type="button" className="photo-delete-choice" disabled={busy} onClick={() => onDelete(person ? 'person' : 'album')}><strong>{person ? s.removeMatches : s.removeReference}</strong><span>{person ? s.removePersonReferenceHint : s.removeReferenceHint}</span></button>}
    <button type="button" className="photo-delete-choice photo-delete-choice--permanent" disabled={busy} onClick={() => onDelete('gallery')}><strong>{s.deleteGallery}</strong><span>{s.deleteGalleryHint}</span></button>
  </div>;
}

function DeleteDialog({ selected, photo, album, person, current, s, onClose, onComplete }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const working = useRef(false);
  async function remove(scope) {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try {
      const { path, payload } = photoDeleteRequest([...selected], scope, current, person?.id);
      const result = await photoRequest(path, payload);
      await onComplete({ ...result, personReference: scope === 'person' });
    }
    catch (error) { setError(error.message); working.current = false; setBusy(false); }
  }
  return <Modal title={photo ? s.deletePhoto : s.deletePhotos} s={s} onClose={onClose} busy={busy}>
    <p className="photo-delete-summary">{photo ? <strong>{photo.name}</strong> : <>{selected.size} {s.photos}</>} · {album || person ? s.deleteQuestion : s.deleteGalleryHint}</p>
    <DeletePhotoChoices album={album} person={person} s={s} busy={busy} onDelete={remove} />
    {error && <p role="alert" className="dialog-error">{error}</p>}
    <footer><button type="button" className="dialog-button" disabled={busy} onClick={onClose}>{s.cancel}</button></footer>
  </Modal>;
}

export function Viewer({ photos, initial, onClose, onDelete, s, language, people = [], knownPeople = people, folders = [], livePhotos, faces, revision, onChanged, highlightPersonId }) {
  const [index, setIndex] = useState(initial);
  const [quality, setQuality] = useState('preview');
  const [albumPhoto, setAlbumPhoto] = useState(null), [albumNotice, setAlbumNotice] = useState(null);
  const [showOtherFaces, setShowOtherFaces] = useState(!highlightPersonId), [editingFaces, setEditingFaces] = useState(!highlightPersonId);
  const [faceInteraction, setFaceInteraction] = useState({ busy: false, editing: false });
  const closeFaceLayer = useRef(null), faceLocked = faceInteraction.busy || faceInteraction.editing;
  const t = photoImportStrings(language);
  const photo = livePhotos?.get(photos[index].id) || photos[index];
  const change = direction => { if (!albumPhoto && !faceLocked) { setIndex(value => (value + direction + photos.length) % photos.length); setAlbumNotice(null); } };
  return <><Modal title={photo?.name || s.root} titleActions={<select className="photo-viewer__quality" aria-label={s.photoQuality}
    value={quality} onChange={event => setQuality(event.target.value)}>
    <option value="preview">JPG</option><option value="original">{s.original}</option>
  </select>} s={s} busy={faceInteraction.busy} onClose={() => { if (!closeFaceLayer.current?.()) onClose(); }} wide className="photo-dialog--viewer" onKeyDown={event => {
    if (albumPhoto || event.defaultPrevented || event.target.closest?.('input, select, textarea, [contenteditable="true"]')) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); change(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); change(-1); }
  }}>
    {highlightPersonId && <PersonFaceControls showOtherFaces={showOtherFaces} onShowOtherFaces={setShowOtherFaces} editing={editingFaces} disabled={faceLocked} s={s}
      onEditing={value => { setEditingFaces(value); if (value) setShowOtherFaces(true); }} />}
    <div className="photo-viewer"><button type="button" aria-label={s.previous} onClick={() => change(-1)} disabled={photos.length < 2 || faceLocked}>‹</button>
      <PhotoFaceViewer key={photo.id} photo={photo} quality={quality} s={s} people={knownPeople} globalFaces={faces} revision={revision}
        onChanged={onChanged} highlightPersonId={highlightPersonId} showOtherFaces={showOtherFaces} editing={editingFaces} onInteractionChange={setFaceInteraction} closeLayer={closeFaceLayer} />
      <button type="button" aria-label={s.next} onClick={() => change(1)} disabled={photos.length < 2 || faceLocked}>›</button></div>
    <div className="photo-viewer__meta"><PhotoMeta key={`meta:${photo.id}`} photo={photo} s={s} language={language} onChanged={onChanged} disabled={faceLocked} /><span>{index + 1} / {photos.length}</span>
      <button type="button" className="dialog-button photo-viewer__album" disabled={faceLocked} aria-haspopup="dialog" onClick={() => { setAlbumPhoto(photo); setAlbumNotice(null); }}>＋ {s.move}</button>
      <button type="button" className="dialog-button photo-viewer__delete photo-delete-button" disabled={faceLocked} aria-haspopup="dialog" onClick={() => onDelete(photo)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg>{s.deletePhoto}
      </button>
      <PhotoDownloads key={photo.id} photo={photo} s={s} /></div>
    {albumNotice === photo.id && <p className="photo-viewer__album-notice" role="status">✓ {s.photoAddedToAlbum}</p>}
    {(photo.title || photo.appleFavorite || photo.description || photo.albums?.length > 0 || photo.keywords?.length > 0) && <div className="photo-import-details">
      {photo.title && <strong>{photo.title}</strong>}
      {photo.appleFavorite && <small>♥ {t.favorite}</small>}
      {photo.description && <p>{photo.description}</p>}
      {photo.albums?.length > 0 && <p>{t.albums}: {photo.albums.join(' · ')}</p>}
      {photo.keywords?.length > 0 && <p>{t.keywords}: {photo.keywords.join(' · ')}</p>}
    </div>}
  </Modal>
    {albumPhoto && <FolderDialog mode="move" folders={folders} current="albums" photo={livePhotos?.get(albumPhoto.id) || albumPhoto}
      selected={new Set([albumPhoto.id])} s={s} onClose={() => setAlbumPhoto(null)}
      onComplete={async () => { setAlbumNotice(albumPhoto.id); setAlbumPhoto(null); await onChanged?.(); }} />}
  </>;
}

export default function PhotosLibrary({ language = 'es', renderMarks, initialFiles, onImportDone, matchesPicture, onRootChange, headerTarget }) {
  const s = photoStrings(language);
  const [library, setData] = useState(blank), [current, setCurrent] = useState('gallery'), [search, setSearch] = useState('');
  const data = useMemo(() => ({ ...library, people: photoPeopleOptions(library.people, s) }), [library, s]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [actionMode, setActionMode] = useState(false), [selected, setSelected] = useState(new Set());
  const [peopleEditing, setPeopleEditing] = useState(false), [selectedPeople, setSelectedPeople] = useState(new Set());
  const [newPeopleOnly, setNewPeopleOnly] = useState(false), [previewPersonId, setPreviewPersonId] = useState(null);
  const [previewEditorPhoto, setPreviewEditorPhoto] = useState(null);
  const previewPersonSnapshot = useRef(null);
  const previewAnchor = useRef(null);
  const closePersonPreview = useCallback(() => setPreviewPersonId(null), []);
  const [peopleDrafts, setPeopleDrafts] = useState({});
  const batchRequest = useRef(null);
  const [choosingCover, setChoosingCover] = useState(false);
  const [noFacesView, setNoFacesView] = useState('new');
  const [faceBusy, setFaceBusy] = useState(false);
  const faceActionPending = useRef(false);
  const actionPending = useRef(false);
  const [dialog, setDialog] = useState(null), [viewer, setViewer] = useState(null), [zone, setZone] = useState(null), [busy, setBusy] = useState(false);
  const [reviewDraft, setReviewDraft] = useState(readPhotoReviewDraft);
  const requestRef = useRef(0), refreshing = useRef(false), mounted = useRef(true), importing = useRef(false);
  const catalogue = useRef(blank), watcher = useRef(null);
  importing.current = dialog?.mode === 'upload';
  const [attempt, setAttempt] = useState(0);
  const [photoNumber, setPhotoNumber] = useState(1), [folderNumber, setFolderNumber] = useState(1);
  const [galleryPosition, setGalleryPosition] = useState(0);
  const [order, setOrder] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem('minitv-photo-order')); if (['takenAt', 'uploadedAt'].includes(saved?.field) && ['asc', 'desc'].includes(saved?.direction)) return saved; } catch {}
    return { field: 'takenAt', direction: 'desc' };
  });
  useEffect(() => { try { localStorage.setItem('minitv-photo-order', JSON.stringify(order)); } catch {} }, [order]);
  useEffect(() => { setPhotoNumber(1); setGalleryPosition(0); setSelected(new Set()); }, [order]);
  const grid = useRef(null);
  const index = useMemo(() => indexPhotos(data.photos, data.people), [data.photos, data.people]);
  const reviewIndex = useMemo(() => indexPhotoReviews(data.reviews), [data.reviews]);
  const newPeople = useMemo(() => data.people.filter(isNewPhotoPerson), [data.people]);
  const recognizedPeople = useMemo(() => data.people.filter(person => !isNewPhotoPerson(person)), [data.people]);
  const recognizedPeopleCount = recognizedPeople.filter(person => person.id !== UNKNOWN_PERSON_ID).length;
  const listedPeople = newPeopleOnly ? newPeople : recognizedPeople;
  const batchEntries = useMemo(() => peopleBatchEntries(peopleDrafts, data.people, data.knownPeople || data.people, s), [peopleDrafts, data.people, data.knownPeople, s]);
  const batchEntriesById = useMemo(() => new Map(batchEntries.map(entry => [entry.person.id, entry])), [batchEntries]);
  useEffect(() => {
    if (!batchEntries.length) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [batchEntries.length]);
  const selectedPersonList = listedPeople.filter(person => selectedPeople.has(person.id));
  const previewPerson = data.people.find(person => person.id === previewPersonId) ||
    ((!newPeopleOnly || previewEditorPhoto) && previewPersonSnapshot.current?.id === previewPersonId ? previewPersonSnapshot.current : null);
  useEffect(() => {
    setSelectedPeople(previous => {
      const valid = new Set(listedPeople.filter(person => previous.has(person.id)).map(person => person.id));
      return valid.size === previous.size ? previous : valid;
    });
  }, [listedPeople]);
  useEffect(() => { if (previewPersonId && !previewPerson) setPreviewPersonId(null); }, [previewPersonId, previewPerson]);
  useEffect(() => { setPhotoNumber(1); setFolderNumber(1); setGalleryPosition(0); }, [current, search, zone, noFacesView, newPeopleOnly]);
  useEffect(() => {
    onRootChange?.(SPECIAL_FOLDERS.includes(current) && !zone);
    return () => onRootChange?.(true);
  }, [current, zone, onRootChange]);
  async function refresh(signal) {
    const generation = ++requestRef.current;
    refreshing.current = true; setLoading(true);
    try {
      const result = await photoRequest('library', undefined, signal);
      if (!mounted.current || signal?.aborted || generation !== requestRef.current) return;
      catalogue.current = result;
      setData(result); setError('');
      return result;
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
  useEffect(() => { if (initialFiles?.length) setDialog({ mode: 'upload', files: initialFiles, folderId: 'gallery', parent: 'gallery' }); }, [initialFiles]);
  const person = current.startsWith('person:') ? data.people.find(p => p.id === current.slice(7)) : null;
  useEffect(() => {
    // A face correction can move the last photo out of the open person.
    if (!loading && !busy && current.startsWith('person:') && !person) {
      setCurrent('people'); setSearch(''); setSelected(new Set()); setActionMode(false); setChoosingCover(false);
    }
  }, [current, person, loading, busy]);
  const noPeople = useMemo(() => photosWithoutPeople(data.photos), [data.photos]);
  const pendingPhotos = useMemo(() => data.photos.filter(photo => reviewIndex.matchPhotoIds.has(photo.id)), [data.photos, reviewIndex]);
  const noPeopleNew = useMemo(() => noPeople.filter(photo => reviewIndex.noFacePhotoIds.has(photo.id)), [noPeople, reviewIndex]);
  const noPeopleRest = useMemo(() => noPeople.filter(photo => !reviewIndex.noFacePhotoIds.has(photo.id)), [noPeople, reviewIndex]);
  const reviewingMatches = current === 'pendingValidation';
  const reviewFolder = reviewingMatches || current === 'withoutPeople';
  const trail = person || reviewFolder ? [{ id: 'people', name: s.people }, { id: current, name: person?.name || s[current] }] : ['map', 'people'].includes(current) ? [{ id: current, name: s[current] }] : folderTrail(data.folders, current);
  const section = SPECIAL_FOLDERS.includes(current) ? current : trail[0]?.id || 'gallery';
  const canGoBack = Boolean(zone || !SPECIAL_FOLDERS.includes(current));
  const parentId = current.startsWith('person:') || reviewFolder ? 'people' : trail.at(-2)?.id || 'gallery';
  const backLabel = zone ? s.map : (parentId === 'albums' ? s.personalAlbums : s[parentId]) || data.folders.find(folder => folder.id === parentId)?.name || s.root;
  const title = person?.name || (current === 'albums' ? s.personalAlbums : s[current]) || data.folders.find(f => f.id === current)?.name || s.root;
  const query = search.trim().toLocaleLowerCase();
  const visible = useCallback(photo => (!query || [photo.name, photo.title, photo.description, ...(photo.albums || []), ...(photo.keywords || []), ...(index.namesByPhoto.get(photo.id) || [])].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)) && (!matchesPicture || matchesPicture(photo)), [query, index, matchesPicture]);
  const inFolder = id => [...new Set([...descendantIds(data.folders, id)].flatMap(folder => index.byFolder.get(folder) || []))];
  const mapPhotos = useMemo(() => data.photos.filter(visible), [data.photos, visible]);
  const currentPhotos = useMemo(() => sortPhotos((current === 'gallery' ? data.photos : current === 'pendingValidation' ? pendingPhotos : current === 'withoutPeople' ? (noFacesView === 'new' ? noPeopleNew : noPeopleRest) : person ? index.byPerson.get(person.id) || [] : current === 'map' ? (zone ? zone.map(id => index.byId.get(id)).filter(Boolean) : []) : index.byFolder.get(current) || []).filter(visible), current === 'gallery' ? 'takenAt' : order.field, order.direction), [data.photos, pendingPhotos, noFacesView, noPeopleNew, noPeopleRest, person, index, current, zone, visible, order]);
  const folders = current === 'gallery' ? [] : current === 'people' ? [...(newPeopleOnly ? [] : [{ id: 'pendingValidation', name: s.pendingValidation }, { id: 'withoutPeople', name: s.withoutPeople, reviewCount: noPeopleNew.length }]), ...listedPeople.map(p => ({ ...p, id: `person:${p.id}`, reviewCount: reviewIndex.byPerson.get(p.id)?.size || 0 }))] : data.folders.filter(f => f.parent === current);
  const displayedFolders = folders.filter(f => !query || ((f.id === 'albums' ? s.personalAlbums : s[f.id]) || f.name).toLocaleLowerCase().includes(query) || inFolder(f.id).some(visible));
  const page = current === 'gallery' ? galleryWindow(currentPhotos, galleryPosition) : photoPage(currentPhotos, photoNumber);
  usePhotoDragSelection(grid, { enabled: reviewingMatches && actionMode && !busy && !dialog && !viewer,
    selected, setSelected, pageKey: page.items.map(photo => photo.id).join('\0') });
  const folderPage = photoPage(displayedFolders, folderNumber);
  const changePage = number => { setPhotoNumber(number); if (!reviewingMatches) setSelected(new Set()); grid.current?.scrollIntoView({ block: 'start' }); };
  const isAi = current !== 'ai' && trail.some(f => f.id === 'ai');
  const isAlbum = current && !SPECIAL_FOLDERS.includes(current) && !reviewFolder && !person;
  const albumPhotos = index.byFolder.get(current) || [];
  const originalIds = new Set(albumPhotos.map(p => p.id));
  const pending = isAi ? pendingVariants(data.photos.filter(p => originalIds.has(p.id) || originalIds.has(p.sourceId))) : 0;
  const job = data.jobs.find(j => j.folder === current);
  const navigate = id => { setCurrent(id); setSearch(''); setSelected(new Set()); setActionMode(false); setPeopleEditing(false); setSelectedPeople(new Set()); setChoosingCover(false); setZone(null); setNotice(''); setNoFacesView('new'); setPreviewPersonId(null); };
  const goBack = () => {
    if (zone) { setZone(null); setSelected(new Set()); setActionMode(false); }
    else navigate(parentId);
  };
  useBrowserBack(canGoBack ? goBack : null, 5);
  const closeDialog = () => { setDialog(null); onImportDone?.(); return refresh(); };
  async function complete(result) {
    const mode = dialog?.mode; await closeDialog();
    setSelected(new Set());
    if (mode === 'delete') { setViewer(null); setNotice(result.cleanupPending ? s.cleanupPending : result.personReference ? s.removedMatches : result.removed ? s.referencesRemoved : s.photosDeleted); return; }
    if (result.folderId || (mode === 'create' && result.id)) navigate(result.folderId || result.id);
    setNotice(mode === 'upload' ? s.imported : mode === 'move' ? s.moved : mode === 'create' ? s.albumCreated : s.saved);
  }
  async function act(action, payload) {
    if (actionPending.current) return;
    actionPending.current = true; setBusy(true); setError('');
    try { await photoRequest(action, payload); await refresh(); return true; }
    catch (error) { setError(error.message); return false; }
    finally { actionPending.current = false; setBusy(false); }
  }
  async function faceAction(action, payload) {
    if (faceActionPending.current) return;
    faceActionPending.current = true; setFaceBusy(true); setError('');
    try { await photoRequest(action, payload); await refresh(); }
    catch (error) { setError(error.message); }
    finally { faceActionPending.current = false; setFaceBusy(false); }
  }
  async function chooseCover(photoId) {
    if (await act(`people/${person.id}/cover`, { photoId })) { setChoosingCover(false); setNotice(s.coverSaved); }
  }
  async function confirmReviews(ids) {
    if (await act('reviews/confirm', { ids })) { setSelected(new Set()); setNotice(s.reviewSaved); }
  }
  const selectedReviews = reviewFolder || person ? reviewsForPhotos(data.reviews, currentPhotos.filter(photo => selected.has(photo.id)), person?.id) : [];
  const selectedPhotoCount = reviewingMatches ? new Set(selectedReviews.map(review => review.photoId)).size : selected.size;
  function toggle(id) { setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function togglePerson(id) { setSelectedPeople(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function peopleAction(action, people, target) {
    if (!people.length) return;
    setDialog({ mode: 'people-action', action, people, target });
  }
  async function completePeopleAction(action) {
    setDialog(null); setSelectedPeople(new Set());
    setNotice(action === 'delete' ? s.peopleDeleted : action === 'download' ? s.peopleDownloadStarted : s.peopleMerged);
    if (action !== 'download') await refresh();
  }
  function clearPersonDraft(id) {
    setPeopleDrafts(previous => { const next = { ...previous }; delete next[id]; return next; });
  }
  function reviewPeopleChanges() {
    if (!batchEntries.length || batchEntries.some(entry => entry.error)) return;
    const key = JSON.stringify(batchEntries.map(entry => entry.payload));
    if (batchRequest.current?.key !== key) batchRequest.current = { key, id: createImportId() };
    setDialog({ mode: 'people-review', entries: batchEntries, requestId: batchRequest.current.id });
  }
  async function completePeopleBatch(result) {
    setPeopleDrafts(previous => {
      const next = { ...previous };
      for (const entry of dialog.entries) delete next[entry.person.id];
      return next;
    });
    batchRequest.current = null; setDialog(null);
    setNotice(result.cleanupPending ? s.cleanupPending : s.batchApplied.replace('{count}', result.applied));
    await refresh();
  }
  function album(folder, special) {
    const photos = special === 'gallery' ? data.photos : special === 'map' ? mapPhotos.filter(hasLocation) : special === 'people' ? data.photos.filter(p => index.namesByPhoto.has(p.id)) :
      folder.id === 'pendingValidation' ? pendingPhotos : folder.id === 'withoutPeople' ? noPeople : folder.id.startsWith('person:') ? index.byPerson.get(folder.id.slice(7)) || [] : inFolder(folder.id);
    const cardPerson = folder.id.startsWith('person:') ? { ...folder, id: folder.id.slice(7) } : null;
    return <AlbumCard key={folder.id} folder={{ ...folder, name: (folder.id === 'albums' ? s.personalAlbums : s[folder.id]) || folder.name }} photos={photos.filter(visible)} special={special}
      portraitPhoto={index.byId.get(personCoverPhotoId(folder))}
      selected={!!cardPerson && (newPeopleOnly ? !!peopleDrafts[cardPerson.id] : selectedPeople.has(cardPerson.id))}
      onPreview={cardPerson && photos.length ? event => {
        previewAnchor.current = event.currentTarget;
        previewPersonSnapshot.current = cardPerson; setPreviewEditorPhoto(null);
        setPreviewPersonId(previous => previous === cardPerson.id ? null : cardPerson.id);
      } : undefined}
      previewOnly={newPeopleOnly && !!cardPerson}
      previewOpen={previewPersonId === cardPerson?.id}
      personActions={cardPerson && (newPeopleOnly ? <NewPersonCardActions person={cardPerson} people={data.knownPeople || data.people}
        draft={peopleDrafts[cardPerson.id]} entry={batchEntriesById.get(cardPerson.id)} s={s} busy={busy}
        onChange={change => setPeopleDrafts(previous => updatePersonDraft(previous, cardPerson, change))} /> :
        <PersonCardActions person={cardPerson} people={data.knownPeople || data.people} editing={peopleEditing}
          selected={selectedPeople.has(cardPerson.id)} s={s} busy={busy} onSelect={() => togglePerson(cardPerson.id)} onAction={peopleAction} />)}
      s={s} language={language} onOpen={() => navigate(folder.id)} />;
  }
  return <section className="pictures-library seasons-section photo-library" aria-label={s.root}>
    {headerTarget && createPortal(<PhotoSectionCarousel section={section} onChange={navigate} s={s} />, headerTarget)}
    <div className="seasons-section__label">{data.photos.length} {s.photos}</div>
    {canGoBack && <div className="photo-navigation">
      <button type="button" className="dialog-button photo-back" onClick={goBack} aria-label={`${s.back}: ${backLabel}`} title={`${s.back}: ${backLabel}`}><span aria-hidden="true">←</span> {s.back}</button>
      <nav className="photo-breadcrumbs" aria-label={s.folders}>{trail.map((folder, index) => <React.Fragment key={folder.id}>{index > 0 && <span>/</span>}<button type="button" aria-current={folder.id === current ? 'page' : undefined} onClick={() => navigate(folder.id)}>{(folder.id === 'albums' ? s.personalAlbums : s[folder.id]) || folder.name}</button></React.Fragment>)}</nav>
    </div>}
    <header className="photo-library__header"><div><h1>{title}</h1><p>{current === 'gallery' ? `${currentPhotos.length} ${s.photos} · ${s.galleryHint}` : current ? `${currentPhotos.length} ${s.photos} · ${folders.length} ${s.albums}` : s.intro}</p></div>
      <div className="photo-toolbar">
        {(currentPhotos.length > 0 || actionMode) && <button className="dialog-button" type="button" aria-pressed={actionMode} disabled={busy} onClick={() => { setActionMode(!actionMode); setChoosingCover(false); setSelected(new Set()); }}>{actionMode ? s.done : s.actions}</button>}
        <button className="photo-refresh" type="button" title={s.refresh} aria-label={s.refresh} onClick={() => { setAttempt(n => n + 1); }}>↻</button>
      </div></header>
    {data.demo && <p className="photo-note">{s.demo}</p>}
    {data.scanning && <p role="status">{s.indexing}</p>}{data.scanError && <p role="status">{data.scanError}</p>}
    {error && <div className="photo-alert" role="alert">{error} <button type="button" onClick={() => setAttempt(n => n + 1)}>{s.retry}</button></div>}
    {notice && <p role="status">{notice}</p>}
    {reviewDraft.step && dialog?.mode !== 'review-wizard' && <div className="photo-people-toolbar">
      <button type="button" className="dialog-button dialog-button--accent" disabled={busy} onClick={() => setDialog({ mode: 'review-wizard', start: 'review' })}>{s.reviewResume} →</button>
      <p>{s.reviewResumeHint}</p>
    </div>}
    {(current === 'albums' || isAlbum && !isAi) && <p className="photo-note">{s.referenceHint}</p>}
    {(current === 'people' || current === 'withoutPeople' || person) && <PeopleAnalysis faces={data.faces} peopleCount={data.people.filter(p => p.id !== UNKNOWN_PERSON_ID).length} s={s} busy={faceBusy} onAction={(path, payload) => path === 'people/scan' ? setDialog({ mode: 'review-wizard', start: 'scan', scanPayload: payload }) : faceAction(path, payload)}
      onReview={() => setDialog({ mode: 'review-wizard', start: data.faces.running ? 'scan' : data.reviews?.length ? 'review' : 'newPeople' })} reviewCount={(data.reviews?.length || 0) + newPeople.length} />}
    {current === 'withoutPeople' && <p className="photo-note">{s.withoutPeopleHint}</p>}
    {current === 'pendingValidation' && <p className="photo-note">{s.pendingValidationHint}</p>}
    {current === 'withoutPeople' && <><p className="photo-note">{s.newWithoutPeopleHint}</p><NoFacesReviewFilter value={noFacesView} newCount={noPeopleNew.length} restCount={noPeopleRest.length} s={s}
      onChange={value => { setNoFacesView(value); setSelected(new Set()); }} />
      {noFacesView === 'new' && noPeopleNew.length > 0 && <div className="photo-people-toolbar"><button type="button" className="dialog-button dialog-button--accent" disabled={busy}
        onClick={() => setDialog({ mode: 'review-wizard', start: 'noFaces' })}>{s.reviewBeginPhotos} · {noPeopleNew.length} →</button></div>}</>}
    {person && <PersonEditor key={person.id} person={person} people={data.knownPeople || data.people} cover={index.byId.get(personCoverPhotoId(person) || person.photoIds[0])} s={s} busy={busy}
      choosingCover={choosingCover} onChooseCover={() => { setChoosingCover(value => !value); setActionMode(false); setSelected(new Set()); }}
      onSave={async name => { if (await act(`people/${person.id}`, { name })) setNotice(s.saved); }}
      onSaveBirthday={async birthDate => { if (await act(`people/${person.id}/birthday`, { birthDate })) setNotice(s.saved); }}
      onMerge={async personId => { if (await act(`people/${person.id}/merge`, { personId })) { navigate(`person:${personId}`); setNotice(s.peopleMerged); } }}
      renderImage={photo => <PersonPortrait person={person} photo={photo} s={s} />} />}
    {(current === 'ai' || isAi) && <div className="photo-ai-banner"><Icon type="ai" /><div><p>{s.aiHint}</p>
      {isAi && <><small>{albumPhotos.filter(p => !p.sourceId).length} {s.originals} · {pending} {s.pending}</small><p>{s.aiSend}</p>
        {!data.aiReady && <p>{s.aiSetup}</p>}
        <button className="dialog-button dialog-button--accent" type="button" disabled={busy || !data.aiReady || !pending || data.jobs.some(j => j.state === 'running')}
          onClick={() => act('generate', { folderId: current })}>{job?.state === 'running' ? s.generating : job ? s.retryGeneration : s.generate}</button>
        {job && <div className="photo-job" role="status"><progress max={job.total} value={job.done} /><span>{job.done} / {job.total} · {job.state === 'complete' ? s.complete : job.state === 'running' ? s.running : job.error}</span></div>}
      </>}
    </div></div>}
    <div className="photo-browse-tools"><input type="search" aria-label={s.search} placeholder={s.search} value={search} onChange={event => { setSearch(event.target.value); setSelected(new Set()); setSelectedPeople(new Set()); }} />
      {currentPhotos.length > 0 && <div className="photo-sort">{current !== 'gallery' && <label>{s.sortBy}<select value={order.field} onChange={event => setOrder(value => ({ ...value, field: event.target.value }))}>
        <option value="takenAt">{s.photoDate}</option><option value="uploadedAt">{s.uploadDate}</option></select></label>}
        <label>{s.sortOrder}<select value={order.direction} onChange={event => setOrder(value => ({ ...value, direction: event.target.value }))}>
          <option value="desc">{s.newestFirst}</option><option value="asc">{s.oldestFirst}</option></select></label></div>}</div>
    {current === 'people' && <>
      <div className="photo-people-switch" role="group" aria-label={s.people}>
        {[true, false].map(onlyNew => <button key={String(onlyNew)} type="button" aria-pressed={newPeopleOnly === onlyNew} disabled={busy}
          onClick={() => { setNewPeopleOnly(onlyNew); setSelectedPeople(new Set()); setPeopleEditing(false); setPreviewPersonId(null); }}>
          {onlyNew ? `${s.newPeople} (${newPeople.length})` : `${s.recognizedPeople} (${recognizedPeopleCount})`}
        </button>)}
      </div>
      {newPeopleOnly && <><p className="photo-note">{s.newPeopleHint}</p><p className="photo-people-keyboard-hint">{s.peopleKeyboardHint}</p></>}
      {newPeopleOnly ? <NewPeopleToolbar entries={batchEntries} s={s} busy={busy} onApply={reviewPeopleChanges}
        onClear={() => setPeopleDrafts({})} onRemove={clearPersonDraft} /> :
      <PeopleToolbar editing={peopleEditing} onToggle={() => { setPeopleEditing(value => !value); setSelectedPeople(new Set()); }}
      selected={selectedPersonList} people={data.knownPeople || data.people} s={s} busy={busy}
      onSelectPage={() => setSelectedPeople(previous => new Set([...previous, ...folderPage.items.filter(folder => folder.id.startsWith('person:') && folder.id !== `person:${UNKNOWN_PERSON_ID}`).map(folder => folder.id.slice(7))]))}
      onClear={() => setSelectedPeople(new Set())} onAction={peopleAction} />}</>}
    {loading && <PhotoLibraryLoading s={s} />}
    {folderPage.total > 0 && <><div className={`movie-library__items--grid photo-folder-grid movie-library__items--reveal-actions${peopleEditing ? ' is-actions-visible' : ''}`}
      data-person-review-grid={current === 'people' && newPeopleOnly ? '' : undefined}
      onKeyDown={current === 'people' && newPeopleOnly ? handlePeopleReviewKey : undefined}>{folderPage.items.map(folder => album(folder))}</div>
      <PhotoPagination page={folderPage} onChange={setFolderNumber} s={s} label={s.folders} /></>}
    {current === 'map' && !zone && <Suspense fallback={loading ? null : <PhotoLibraryLoading s={s} />}><PhotoMap photos={mapPhotos} s={s} onCluster={photos => { setZone(photos.map(p => p.id)); setSelected(new Set()); setActionMode(false); }} /></Suspense>}
    {zone && <div className="photo-zone"><h2>{s.zone} · {currentPhotos.length}</h2><button type="button" className="dialog-button" onClick={goBack}>{s.allPlaces}</button></div>}
    {(actionMode || reviewingMatches && currentPhotos.length > 0) && <div className="photo-selection"><strong role="status">{selectedPhotoCount} {s.selected}</strong>
      <button type="button" disabled={busy} onClick={() => setSelected(previous => new Set([...(reviewingMatches ? previous : []), ...page.items.map(p => p.id)]))}>{s.selectPage}</button><button type="button" disabled={busy || !selectedPhotoCount} onClick={() => setSelected(new Set())}>{s.clear}</button>
      {actionMode && <>
        <button type="button" className="dialog-button dialog-button--accent" disabled={!selected.size || busy} onClick={() => setDialog({ mode: 'move' })}>{s.move} →</button>
        <button type="button" className="dialog-button photo-delete-button" disabled={!selected.size || busy} onClick={() => setDialog({ mode: 'delete' })}>{s.deletePhotos}</button>
        <button type="button" className="dialog-button" disabled={!selected.size || busy} onClick={() => setDialog({ mode: 'download' })}>{s.downloadPeople}</button>
      </>}
      {(reviewFolder || person) && <button type="button" className="dialog-button dialog-button--accent" disabled={!selectedReviews.length || busy} onClick={() => confirmReviews(selectedReviews.map(review => review.id))}>{reviewingMatches ? s.verifySelection : current === 'withoutPeople' ? s.markReviewedPhotos : s.confirmMatches}</button>}
      {person && <button type="button" disabled={!selected.size || busy} onClick={async () => { if (await act(`people/${person.id}/remove`, { ids: [...selected] })) { setSelected(new Set()); setNotice(s.removedMatches); } }}>{s.removeMatches}</button>}
    </div>}
    {reviewingMatches && currentPhotos.length > 0 && <div className="photo-people-toolbar"><button type="button" className="dialog-button dialog-button--accent" disabled={busy} onClick={() => setDialog({ mode: 'review-wizard', start: 'review' })}>{s.reviewStart} →</button></div>}
    {reviewingMatches && actionMode && currentPhotos.length > 0 && <p className="photo-drag-select-hint">{s.dragSelectPhotosHint}</p>}
    {currentPhotos.length > 0 && <div ref={grid} className="photo-page">
      {current === 'gallery' ? <PhotoGallery key={`${search}-${order.direction}`} photos={currentPhotos} position={galleryPosition} onPosition={position => { setGalleryPosition(position); setSelected(new Set()); }} s={s} language={language}
        renderTiny={photo => <PhotoImage photo={photo} tiny loading="lazy" decoding="async" />}
        renderGrid={page => <PhotoGrid page={page} actionMode={actionMode} selected={selected} toggle={toggle} onOpen={initial => setViewer({ photos: currentPhotos, initial, highlightPersonId: person?.id })} s={s} language={language} renderMarks={renderMarks} />} /> : <>
      <PhotoPagination page={page} onChange={changePage} s={s} />
      <PhotoGrid page={page} actionMode={actionMode} selected={selected} toggle={toggle} onOpen={initial => setViewer({ photos: currentPhotos, initial, highlightPersonId: person?.id })} s={s} language={language} renderMarks={renderMarks}
        person={person} onDelete={photo => setDialog({ mode: 'delete', ids: [photo.id] })} coverMode={choosingCover && !!person} coverPhotoId={person?.coverPhotoId} onCover={chooseCover} coverBusy={busy}
        reviewItems={reviewFolder || person ? reviewIndex.byPhoto : undefined} reviewPeople={data.people} reviewingMatches={current === 'pendingValidation'} onReview={confirmReviews} reviewBusy={busy} onChanged={refresh} />
      <PhotoPagination page={page} onChange={changePage} s={s} /></>}
    </div>}
    {!loading && current !== 'map' && !displayedFolders.length && !currentPhotos.length && <div className="photo-empty"><Icon type={current === 'people' ? 'people' : 'folder'} /><h2>{query ? s.matches : current === 'pendingValidation' ? s.noPendingValidation : current === 'withoutPeople' && noFacesView === 'new' ? s.noNewWithoutPeople : current === 'people' ? newPeopleOnly ? s.noNewPeople : s.peopleEmpty : s.empty}</h2><p>{current === 'people' && newPeopleOnly ? s.newPeopleEmptyHint : reviewFolder ? s.reviewEmptyHint : s.mobileSyncHint}</p></div>}
    {previewPerson && (newPeopleOnly && !previewEditorPhoto ? <PersonPhotoPopover key={previewPerson.id} person={previewPerson} photosById={index.byId}
      anchor={previewAnchor.current} s={s} language={language} onClose={closePersonPreview}
      onEdit={photoId => setPreviewEditorPhoto({ photoId, editing: true })} onDetails={(photoId, detail) => setPreviewEditorPhoto({ photoId, detail })} /> :
      <PersonPhotoDialog key={previewPerson.id} Modal={Modal} person={previewPerson} photosById={index.byId} people={data.knownPeople || data.people}
        globalFaces={data.faces} revision={data.revision} onChanged={refresh} initialPhotoId={previewEditorPhoto?.photoId} initialEditing={!!previewEditorPhoto?.editing}
        initialDetail={previewEditorPhoto?.detail} s={s} language={language} onClose={closePersonPreview} />)}
    {dialog?.mode === 'review-wizard' && <PhotoReviewWizard Modal={Modal} library={data} mode={dialog.start} scanPayload={dialog.scanPayload} s={s} language={language} onRefresh={refresh} onClose={() => { setReviewDraft(readPhotoReviewDraft()); setDialog(null); }} />}
    {dialog?.mode === 'upload' && <PhotoUploadDialog Modal={Modal} language={language} initialMode={dialog.files?.length ? 'files' : 'mac'} key="upload" initialFiles={dialog.files} folderId={dialog.folderId} parent={dialog.parent} s={s} onClose={closeDialog} onComplete={complete} />}
    {dialog?.mode === 'delete' && <DeleteDialog selected={dialog.ids ? new Set(dialog.ids) : selected} photo={dialog.photo}
      {...(dialog.origin || { album: isAlbum, person, current })} s={s} onClose={closeDialog} onComplete={complete} />}
    {dialog?.mode === 'people-action' && <PeopleActionDialog Modal={Modal} {...dialog} s={s} onClose={closeDialog} onComplete={completePeopleAction} />}
    {dialog?.mode === 'people-review' && <PeopleBatchDialog Modal={Modal} {...dialog} photosById={index.byId} s={s} onClose={() => setDialog(null)} onComplete={completePeopleBatch} />}
    {dialog?.mode === 'download' && <PhotoDownloadDialog Modal={Modal} selected={selected} s={s} onClose={() => setDialog(null)} onComplete={() => { setDialog(null); setNotice(s.peopleDownloadStarted); }} />}
    {dialog && !['upload', 'delete', 'people-action', 'people-review', 'download', 'review-wizard'].includes(dialog.mode) && <FolderDialog mode={dialog.mode} folders={data.folders} current={current} selected={selected} person={person} s={s} onClose={closeDialog} onComplete={complete} />}
    {viewer && <Viewer {...viewer} people={data.people} knownPeople={data.knownPeople || data.people} folders={data.folders} livePhotos={index.byId}
      faces={data.faces} revision={data.revision} onChanged={() => refresh()}
      onDelete={photo => setDialog({ mode: 'delete', ids: [photo.id], photo, origin: { album: isAlbum, person, current } })}
      s={s} language={language} onClose={() => setViewer(null)} />}
  </section>;
}
