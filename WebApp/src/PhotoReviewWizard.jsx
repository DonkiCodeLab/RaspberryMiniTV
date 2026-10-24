import React, { useEffect, useRef, useState } from 'react';
import { getPictureContentUrl, photoRequest } from './api/raspberryApi.js';
import { photoAssignmentOptions, UNKNOWN_PERSON_ID } from './photoLibrary.js';
import { validNewPersonName } from './photoPeopleBatch.js';
import { afterReviewStage, attachReviewSwipe, faceReviewQueue, nextReviewCard, noFacesReviewQueue, reviewChanges, reviewIsCurrent } from './photoReviewWizard.js';
import { PeopleAnalysis } from './PhotoPeople.jsx';
import PhotoViewerImage, { FaceRectangles } from './PhotoViewerImage.jsx';
import { FaceNameEditor } from './PhotoFaceViewer.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';
import './PhotoReviewWizard.css';

export function ReviewSteps({ step, s }) {
  return <ol className="photo-review-steps" aria-label={s.reviewWizard}>
    {[s.reviewStepScan, s.reviewStepValidate, s.reviewStepNoFaces].map((label, index) => <li key={label} aria-current={step === index + 1 ? 'step' : undefined}
      className={step > index + 1 ? 'is-complete' : ''}><span>{step > index + 1 ? '✓' : index + 1}</span>{label}</li>)}
  </ol>;
}

export function ReviewCard({ review, photo, people, position, total, s, onRefresh, onAdvance, onDirty, onBusy, onExpanded }) {
  const withoutFaces = !review.faceId;
  const [details, setDetails] = useState(null), [loadAttempt, setLoadAttempt] = useState(0);
  const [assignments, setAssignments] = useState({}), [additions, setAdditions] = useState([]);
  const [expanded, setExpanded] = useState(false), [selectedId, setSelectedId] = useState(null);
  const [adding, setAdding] = useState(false), [box, setBox] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [committed, setCommitted] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false), lastSave = useRef(null);
  const [deleting, setDeleting] = useState(null), [offset, setOffset] = useState(0), [leaving, setLeaving] = useState(false);
  const [imageReady, setImageReady] = useState(false), [imageError, setImageError] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0), [ratio, setRatio] = useState(photo.width / photo.height || 1.5);
  const surface = useRef(null), working = useRef(false), alive = useRef(true), timer = useRef(null), heading = useRef(null);
  const choices = photoAssignmentOptions(people, s);
  const original = details?.faces.find(face => face.id === review.faceId);
  const changed = Object.keys(assignments).length > 0 || additions.length > 0;
  const invalid = Object.values(assignments).some(value => 'name' in value && !validNewPersonName(value.name));
  const blocked = busy || committed || needsRefresh || (withoutFaces ? !details : !original) || !!deleting;
  const displayFace = face => {
    const assignment = assignments[face.id];
    return assignment ? { ...face, personId: assignment.personId, name: assignment.name ?? choices.find(person => person.id === assignment.personId)?.name } : face;
  };
  const faces = [...(details?.faces || []).map(displayFace), ...additions.map(face => ({ ...face, ...face.assignment,
    name: face.assignment.name ?? choices.find(person => person.id === face.assignment.personId)?.name }))];
  const primary = faces.find(face => face.id === review.faceId);
  const selected = faces.find(face => face.id === selectedId);
  const primaryDraft = assignments[review.faceId];
  const target = primaryDraft && 'name' in primaryDraft ? 'new' : primary?.personId || '';
  useEffect(() => { alive.current = true; heading.current?.focus({ preventScroll: true }); return () => { alive.current = false; clearTimeout(timer.current); }; }, []);
  useEffect(() => { onDirty(changed || adding || !!selectedId); }, [changed, adding, selectedId, onDirty]);
  useEffect(() => {
    if (!changed && !adding && !selectedId) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [changed, adding, selectedId]);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    photoRequest(`photos/${photo.id}/faces`, undefined, controller.signal).then(result => {
      if (!controller.signal.aborted) {
        setDetails(result);
        if (!reviewIsCurrent(review, result)) setError(withoutFaces ? s.reviewPhotoChanged : s.batchPersonChanged);
      }
    }).catch(error => { if (!controller.signal.aborted) { setError(error.message); setNeedsRefresh([404, 409].includes(error.status)); } });
    return () => controller.abort();
  }, [photo.id, review.id, review.faceId, loadAttempt, s]);
  const stale = details && !reviewIsCurrent(review, details);
  const canDecide = !blocked && !stale && !changed && imageReady;
  useEffect(() => {
    if (!withoutFaces && !expanded && canDecide && surface.current) return attachReviewSwipe(surface.current, setOffset, decide);
  }, [expanded, canDecide, withoutFaces]);
  function enlarge(value) { setExpanded(value); onExpanded(value); }
  function stage(faceId, assignment) {
    lastSave.current = null; setError('');
    setAssignments(previous => {
      const next = { ...previous }, base = details.faces.find(face => face.id === faceId);
      if (assignment.personId === base?.personId) delete next[faceId]; else next[faceId] = assignment;
      return next;
    });
  }
  function closeEditor() { setAdding(false); setBox(null); setSelectedId(null); }
  function stageEditor(assignment) {
    lastSave.current = null;
    if ('name' in assignment && !validNewPersonName(assignment.name)) { setError(s.batchInvalidName); return; }
    if (adding) setAdditions(previous => [...previous, { id: `draft-${crypto.randomUUID()}`, box, assignment }]);
    else if (selectedId.startsWith('draft-')) setAdditions(previous => previous.map(face => face.id === selectedId ? { ...face, assignment } : face));
    else stage(selectedId, assignment);
    closeEditor(); setError('');
  }
  async function run(path, payload) {
    if (working.current) return;
    working.current = true; setBusy(true); onBusy(true); setError('');
    if (path) lastSave.current = { path, payload };
    try {
      if (path) { await photoRequest(path, payload); if (alive.current) setCommitted(true); }
      const fresh = await onRefresh();
      if (!fresh) throw new Error(s.reviewLoadingError);
      if (!alive.current) return;
      setLeaving(true);
      const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240;
      timer.current = setTimeout(() => { onDirty(false); onBusy(false); onExpanded(false); onAdvance(fresh); }, duration);
    } catch (error) {
      if (alive.current) { setError(error.message); setNeedsRefresh([404, 409].includes(error.status)); setBusy(false); onBusy(false); }
      working.current = false;
    }
  }
  function decide(action) {
    if (!canDecide || working.current) return;
    const changes = action === 'unknown' ? [{ action: 'assign', faceId: review.faceId, personId: UNKNOWN_PERSON_ID }] : [];
    void run('reviews/resolve', { reviewId: review.id, changes });
  }
  const startAdding = () => { if (!blocked) { setAdding(true); setBox(null); setSelectedId(null); } };
  const editor = (adding && box || selected) ? <FaceNameEditor key={selected?.id || 'new'} face={selected || {}} people={people}
    initialName={selected?.assignment?.name || assignments[selectedId]?.name || ''}
    s={{ ...s, save: s.reviewStageEdit, confirmFace: s.reviewStageFace }} busy={blocked} creating={adding} hasBox={!!box}
    onSave={stageEditor} onClose={closeEditor} /> : null;
  return <div className={`photo-review-card${withoutFaces ? ' photo-review-card--without-faces' : ''}${leaving ? ' is-leaving' : ''}`} aria-busy={busy}>
    <div className="photo-review-card__progress"><strong ref={heading} tabIndex={-1} role="status">{(withoutFaces ? s.reviewNoFacesPosition : s.reviewPosition).replace('{current}', position).replace('{total}', total)}</strong>
      <progress max={total} value={position - 1} aria-label={withoutFaces ? s.reviewStepNoFaces : s.reviewStepValidate} /></div>
    {expanded ? <div className="photo-review-expanded">
      <div className="photo-review-expanded__toolbar"><button type="button" className="dialog-button" disabled={busy} onClick={() => enlarge(false)}>← {s.reviewBackToCard}</button>
        <button type="button" className="dialog-button dialog-button--accent" disabled={blocked} aria-pressed={adding} onClick={adding ? closeEditor : startAdding}>{adding ? s.cancel : `＋ ${s.addFace}`}</button></div>
      <PhotoViewerImage photo={photo} faces={faces} s={s} selectedFaceId={selectedId || review.faceId} busy={blocked}
        onSelectFace={adding ? undefined : setSelectedId} addingFace={adding} onAddFace={startAdding} onFaceBoxChange={setBox}
        editor={editor} editorBox={box || selected?.box} />
      <div className="photo-review-face-tabs" role="group" aria-label={s.facesInPhoto}>{faces.map(face => <button type="button" key={face.id}
        className="dialog-button" aria-pressed={selectedId === face.id} disabled={blocked || adding} onClick={() => setSelectedId(face.id)}>{face.name || s.unnamedFace}</button>)}</div>
      <p>{withoutFaces ? s.reviewNoFacesEditHint : s.reviewEditHint}</p>
    </div> : <div className="photo-review-deck">
      <button ref={surface} type="button" className={`photo-review-photo${offset ? ' is-dragging' : ''}`} disabled={busy || committed || !!deleting}
        aria-label={`${s.enlargePhoto}: ${photo.name}`} onClick={() => enlarge(true)}
        style={{ transform: `translateX(${offset}px) rotate(${offset / 30}deg)` }}>
        <span className="photo-review-photo__image" style={{ aspectRatio: ratio, '--review-ratio': ratio }}>
          <img key={imageAttempt} src={getPictureContentUrl(photo.relativePath, 'preview') || undefined} alt={photo.name} draggable={false}
            onLoad={event => { setImageReady(true); setImageError(false); setRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight); }} onError={() => { setImageError(true); setImageReady(false); }} />
          {imageReady && (primary || withoutFaces) && <FaceRectangles faces={withoutFaces ? faces : [primary]} selectedFaceId={primary?.id} s={s} readOnly />}
        </span>
        <span className="photo-review-photo__caption">{photo.title || photo.name}<span>⤢ {s.enlargePhoto}</span></span>
        {Math.abs(offset) > 25 && <span className={`photo-review-stamp ${offset > 0 ? 'is-approved' : ''}`} aria-hidden="true">{offset > 0 ? s.reviewApprove : s.unknownPerson}</span>}
      </button>
      {imageError && <p role="alert">{s.failedImage} <button type="button" className="dialog-button" onClick={() => { setImageError(false); setImageAttempt(value => value + 1); }}>{s.retry}</button></p>}
      <p className="photo-review-swipe-hint">{withoutFaces ? changed ? s.reviewNoFacesEditHint : s.reviewNoFacesHint : changed ? s.reviewEditHint : s.reviewSwipeHint}</p>
    </div>}
    {!details && !error && <p role="status"><LoadingSpinner inline /> {s.loading}</p>}
    {primary && <div className="photo-review-identity"><label>{s.reviewSuggested}<select aria-label={s.reviewSuggested} value={target} disabled={blocked || stale || adding || !!selected}
      onChange={event => stage(review.faceId, event.target.value === 'new' ? { name: '' } : { personId: event.target.value })}>
      {!choices.some(person => person.id === original?.personId) && <option value={original?.personId}>{original?.name || s.unnamedFace}</option>}
      {choices.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}<option value="new">{s.newPerson}</option>
    </select></label>
      {target === 'new' && <label>{s.newPersonName}<input maxLength={100} value={primaryDraft?.name || ''} disabled={blocked || adding || !!selected}
        placeholder={s.faceNamePlaceholder} onChange={event => stage(review.faceId, { name: event.target.value })} /></label>}
    </div>}
    {changed && <p className="photo-review-draft" role="status">● {s.reviewStaged} <button type="button" disabled={blocked}
      onClick={() => { lastSave.current = null; setError(''); setAssignments({}); setAdditions([]); closeEditor(); }}>{s.discardPeopleChanges}</button></p>}
    {error && <div className="photo-alert" role="alert">{error} <button type="button" className="dialog-button" disabled={busy} onClick={() => {
      if (committed || stale || needsRefresh) void run(null);
      else if (lastSave.current) void run(lastSave.current.path, lastSave.current.payload);
      else { setError(''); setLoadAttempt(value => value + 1); }
    }}>{committed || stale || needsRefresh ? s.reviewRefresh : s.retry}</button></div>}
    {busy && <p role="status"><LoadingSpinner inline /> {s.reviewSaving}</p>}
    <div className="photo-review-decisions">
      {withoutFaces ? <button type="button" className="dialog-button dialog-button--accent" disabled={blocked || stale || invalid || adding || !!selected || !imageReady}
        onClick={() => run('reviews/resolve', { reviewId: review.id, changes: reviewChanges(assignments, additions) })}>✓ {changed ? s.reviewSaveReviewed : s.markReviewed} →</button> : changed ? <button type="button" className="dialog-button dialog-button--accent" disabled={blocked || stale || invalid || adding || !!selected}
        onClick={() => run('reviews/resolve', { reviewId: review.id, changes: reviewChanges(assignments, additions) })}>✓ {s.reviewSave}</button> : <>
        <button type="button" className="dialog-button photo-review-unknown" disabled={!canDecide || adding || !!selected} onClick={() => decide('unknown')}>← {s.unknownPerson}</button>
        <button type="button" className="dialog-button dialog-button--accent" disabled={!canDecide || adding || !!selected} onClick={() => decide('approve')}>{s.reviewApprove} →</button>
      </>}
    </div>
    {!deleting ? <div className="photo-review-removal">
      <button type="button" disabled={blocked || stale || changed || adding || !!selected} onClick={() => setDeleting('reference')}>{withoutFaces ? s.reviewRemoveNewReference : s.reviewRemoveReference}</button>
      <button type="button" disabled={blocked || changed || adding || !!selected} onClick={() => setDeleting('gallery')}>{s.deleteGallery}</button>
    </div> : <div className="photo-review-delete" role="alertdialog" aria-label={s.deletePhoto}>
      <strong>{photo.name}</strong><p>{deleting === 'gallery' ? s.deleteGalleryHint : withoutFaces ? s.reviewRemoveNewHint : s.reviewRemoveHint}</p>
      <div className="photo-dialog__actions"><button type="button" className="dialog-button" autoFocus disabled={busy} onClick={() => setDeleting(null)}>{s.cancel}</button>
        <button type="button" className="dialog-button dialog-button--danger" disabled={busy || committed} onClick={() => deleting === 'gallery' ?
          run('photos/delete', { ids: [photo.id], scope: 'gallery' }) : run('reviews/resolve', { reviewId: review.id, changes: withoutFaces ? [] : [{ action: 'remove', faceId: review.faceId }] })}>
          {deleting === 'gallery' ? s.reviewDeleteConfirm : withoutFaces ? s.reviewRemoveNewReference : s.reviewRemoveReference}</button></div>
    </div>}
  </div>;
}

export default function PhotoReviewWizard({ Modal, library, mode = 'scan', s, onRefresh, onClose }) {
  const [step, setStep] = useState(mode === 'scan' ? 'scan' : mode === 'noFaces' ? 'no-faces-intro' : 'intro');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [started, setStarted] = useState(mode !== 'scan');
  const [queue, setQueue] = useState([]), [cursor, setCursor] = useState(0), [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState(false), [closeQuestion, setCloseQuestion] = useState(false);
  const [cardVersion, setCardVersion] = useState(0);
  const launched = useRef(false), scanning = useRef(false), mounted = useRef(true);
  const [batchOnly, setBatchOnly] = useState(mode === 'scan');
  const scope = batchOnly ? library.faces.batchId ?? null : undefined;
  const pending = faceReviewQueue(library.reviews, library.photos, scope);
  const pendingNoFaces = noFacesReviewQueue(library.reviews, library.photos, scope);
  const withoutFaces = ['no-faces-intro', 'no-faces-review', 'done'].includes(step);
  const faces = library.faces;
  const active = faces.running || faces.singleRunning;
  const complete = started && !busy && !active && faces.state === 'complete';
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function scanAction(path, payload = {}) {
    if (scanning.current) return;
    scanning.current = true; setBusy(true); setError('');
    try {
      await photoRequest(path, payload);
      const fresh = await onRefresh();
      if (!fresh) throw new Error(s.reviewLoadingError);
      if (mounted.current) setStarted(true);
    } catch (error) { if (mounted.current) setError(error.message); }
    finally { scanning.current = false; if (mounted.current) setBusy(false); }
  }
  useEffect(() => {
    if (mode === 'scan' && !launched.current) {
      launched.current = true;
      if (active) setStarted(true); else void scanAction('people/scan');
    }
  }, []);
  function begin(noFaces = false) {
    const items = noFaces ? pendingNoFaces : pending;
    setQueue(items); setCursor(0);
    setStep(items.length ? noFaces ? 'no-faces-review' : 'review' : afterReviewStage(noFaces));
  }
  function advance(fresh) {
    const next = nextReviewCard(queue, cursor, fresh, withoutFaces);
    setCursor(next); setCardVersion(value => value + 1); setDirty(false); setExpanded(false);
    if (next >= queue.length) setStep(afterReviewStage(withoutFaces));
  }
  const current = queue[cursor], photo = library.photos.find(photo => photo.id === current?.photoId);
  // Keep the active card mounted while its save refreshes the library (including deletion).
  const photoCache = useRef(new Map());
  for (const item of library.photos) photoCache.current.set(item.id, item);
  const cardPhoto = photo || photoCache.current.get(current?.photoId);
  const close = () => { if (!busy) { if (dirty) setCloseQuestion(true); else onClose(); } };
  return <Modal title={s.reviewWizard} s={s} busy={busy} onClose={close} wide={expanded}
    className={`photo-dialog--review-wizard${expanded ? ' is-expanded' : ''}`}>
    <ReviewSteps step={step === 'scan' ? 1 : withoutFaces ? 3 : 2} s={s} />
    {closeQuestion && <div className="photo-review-close" role="alertdialog" aria-label={s.reviewUnsaved}><strong>{s.reviewUnsaved}</strong>
      <div className="photo-dialog__actions"><button type="button" className="dialog-button" onClick={() => setCloseQuestion(false)}>{s.reviewKeepEditing}</button>
        <button type="button" className="dialog-button" onClick={onClose}>{s.reviewDiscard}</button></div></div>}
    <div inert={closeQuestion ? true : undefined}>
      {step === 'scan' && <div className="photo-review-scan">
        <PeopleAnalysis faces={faces} peopleCount={library.people.filter(person => person.id !== UNKNOWN_PERSON_ID).length} s={s} busy={busy} onAction={scanAction} />
        {complete && <p className="photo-review-ready" role="status">✓ {s.reviewScanReady} · {faces.done} / {faces.total} {s.photos}</p>}
        {error && <p className="photo-alert" role="alert">{error}</p>}
        <div className="photo-dialog__actions"><button type="button" className="dialog-button" disabled={busy} onClick={close}>{s.reviewLater}</button>
          <button type="button" className="dialog-button dialog-button--accent" disabled={!complete} onClick={() => setStep('intro')}>{s.reviewNextStep} →</button></div>
      </div>}
      {step === 'intro' && <div className="photo-review-intro">
        <span className="photo-review-intro__symbol" aria-hidden="true">✓</span><h3>{s.pendingValidation}</h3>
        <strong>{s.reviewIntro.replace('{faces}', pending.length).replace('{people}', new Set(pending.map(review => review.personId)).size).replace('{photos}', new Set(pending.map(review => review.photoId)).size)}</strong>
        <p>{batchOnly ? s.reviewBatchScope : s.reviewAllScope}</p><p>{s.reviewSwipeHint}</p>
        {!pending.length && <p>{s.reviewEmptyHint}</p>}
        <button type="button" className="dialog-button dialog-button--accent" onClick={() => begin()}>{pending.length ? s.reviewBegin : s.reviewNextNoFaces} →</button>
      </div>}
      {step === 'no-faces-intro' && <div className="photo-review-intro">
        <span className="photo-review-intro__symbol" aria-hidden="true">▧</span><h3>{s.reviewNewWithoutPeople}</h3>
        <strong>{s.reviewNoFacesIntro.replace('{count}', pendingNoFaces.length)}</strong>
        <p>{batchOnly ? s.reviewNoFacesBatchScope : s.reviewNoFacesAllScope}</p>
        <p>{pendingNoFaces.length ? s.reviewNoFacesHint : s.reviewNoFacesEmpty}</p>
        <button type="button" className="dialog-button dialog-button--accent" onClick={() => begin(true)}>{pendingNoFaces.length ? s.reviewBeginPhotos : s.done} →</button>
      </div>}
      {['review', 'no-faces-review'].includes(step) && current && cardPhoto && <ReviewCard key={`${current.id}:${cardVersion}`} review={current} photo={cardPhoto} people={library.knownPeople || library.people}
        position={cursor + 1} total={queue.length} s={s} onRefresh={onRefresh} onAdvance={advance} onDirty={setDirty} onBusy={setBusy} onExpanded={setExpanded} />}
      {step === 'done' && <div className="photo-review-intro" role="status"><span className="photo-review-intro__symbol" aria-hidden="true">✓</span>
        <h3>{s.reviewFinished}</h3><p>{s.reviewFinishedHint}</p><div className="photo-dialog__actions">
          <button type="button" className="dialog-button" onClick={onClose}>{s.done}</button>
          {faces.available && faces.pending > 0 && <button type="button" className="dialog-button dialog-button--accent" onClick={() => {
            setBatchOnly(true); setStep('scan'); setStarted(false); void scanAction('people/scan');
          }}>{s.scanNextBatch} →</button>}
        </div></div>}
    </div>
  </Modal>;
}
