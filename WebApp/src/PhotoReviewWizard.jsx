import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getPictureContentUrl, photoRequest } from './api/raspberryApi.js';
import { isNewPhotoPerson, photoAssignmentOptions, photoAssignmentLabel, photoAssignmentValue, UNKNOWN_PERSON_ID } from './photoLibrary.js';
import { validNewPersonName } from './photoPeopleBatch.js';
import { createImportId } from './photoImport.js';
import { attachReviewSwipe, faceReviewQueue, noFacesReviewQueue, newPeopleReviewQueue, newPersonReviewHandled, remainingReviewFaceIds, reviewChanges, reviewIsCurrent, reviewHandled, reviewBatchPhotos, reviewPeopleOptions, reviewAlbumOptions, upcomingReviewPhotos } from './photoReviewWizard.js';
import { editBox, visibleBox, imageEditPreview } from './photoImageEdits.js';
import { REVIEW_IMAGE_RENDER, preloadReviewImages } from './photoReviewImages.js';
import { PeopleAnalysis } from './PhotoPeople.jsx';
import PhotoViewerImage, { FaceRectangles } from './PhotoViewerImage.jsx';
import { FaceNameEditor } from './PhotoFaceViewer.jsx';
import PhotoMeta from './PhotoMeta.jsx';
import { photoMetadataPatch } from './photoMetadata.js';
import PhotoReviewAlbums from './PhotoReviewAlbums.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';
import './PhotoReviewWizard.css';

const reviewStorageKey = () => `minitv-review-draft:${getPictureContentUrl('review-session').split('?')[0]}`;
export function readPhotoReviewDraft() {
  try { return JSON.parse(sessionStorage.getItem(reviewStorageKey())) || {}; } catch { return {}; }
}

export function ReviewSteps({ step, s }) {
  return <ol className="photo-review-steps" aria-label={s.reviewWizard}>
    {[s.reviewStepScan, s.reviewStepValidate, s.reviewStepNoFaces, s.reviewStepNewPeople].map((label, index) => <li key={label} aria-current={step === index + 1 ? 'step' : undefined}
      className={step > index + 1 ? 'is-complete' : ''}><span>{step > index + 1 ? '✓' : index + 1}</span>{label}</li>)}
  </ol>;
}

export function ReviewCard({ review, photo, people, albumOptions = [], nextPhotos = [], position, total, s, language = 'es', draft, onDraft, onAdvance, onDirty, onExpanded, onReadyChange, closeLayer, groupPerson, peopleDrafts = [], onUnknownRemainder, hideDecisions = false, showFaceBoxes = true, onShowFaceBoxesChange }) {
  const withoutFaces = !review.faceId && !groupPerson;
  const [details, setDetails] = useState(null), [attempt, setAttempt] = useState(0);
  const [assignments, setAssignments] = useState(() => Object.fromEntries((draft?.changes || []).filter(c => c.action === 'assign').map(({ faceId, action, ...a }) => [faceId, a])));
  const [removals] = useState(() => (draft?.changes || []).filter(c => c.action === 'remove'));
  const [additions, setAdditions] = useState(() => (draft?.changes || []).filter(c => c.action === 'add').map(({ action, box, ...assignment }) => ({ id: `draft-${createImportId()}`, box, assignment })));
  const [edits, setEdits] = useState(draft?.edits || []), [scale, setScale] = useState(100);
  const [expanded, setExpanded] = useState(false), [selectedId, setSelectedId] = useState(null);
  const [identityTarget, setIdentityTarget] = useState(null);
  const [albums, setAlbums] = useState(draft?.albums || []), [albumEditing, setAlbumEditing] = useState(false);
  const [metadata, setMetadata] = useState(draft?.metadata || {});
  const albumLayer = useRef(null);
  const [adding, setAdding] = useState(false), [cropping, setCropping] = useState(false), [box, setBox] = useState(null);
  const [error, setError] = useState(''), [deleting, setDeleting] = useState(null), [offset, setOffset] = useState(0);
  const [sourceUrl, setSourceUrl] = useState(''), [previewBusy, setPreviewBusy] = useState(false), [ready, setReady] = useState(false);
  const [ratio, setRatio] = useState(photo.width / photo.height || 1.5);
  const surface = useRef(null), heading = useRef(null), callbacks = useRef({ onDraft, onDirty });
  callbacks.current = { onDraft, onDirty };
  const choices = photoAssignmentOptions(people, s);
  const original = details?.faces.find(face => face.id === review.faceId);
  const changedFaces = Object.keys(assignments).length > 0 || additions.length > 0 || edits.length > 0 || removals.length > 0;
  const changed = changedFaces || albums.length > 0 || Object.keys(metadata).length > 0;
  const invalid = Object.values(assignments).some(value => 'name' in value && !validNewPersonName(value.name));
  const stale = details && (!groupPerson && !reviewIsCurrent(review, details) || draft?.version && details.version !== draft.version);
  const blocked = !details || previewBusy || stale;
  const faces = [...(details?.faces || []).filter(face => !removals.some(c => c.faceId === face.id)).map(face => ({ ...face, ...(assignments[face.id] || {}),
    name: assignments[face.id] ? assignments[face.id].name ?? choices.find(p => p.id === assignments[face.id].personId)?.name : face.name })),
    ...additions.map(face => ({ ...face, ...face.assignment, name: face.assignment.name ?? choices.find(p => p.id === face.assignment.personId)?.name }))]
    .flatMap(face => {
      const box = visibleBox(editBox(face.box, edits));
      return face.box && !box ? [] : [{ ...face, box }];
    });
  const primary = faces.find(face => face.id === review.faceId), selected = faces.find(face => face.id === selectedId);
  const visibleFaces = groupPerson && !showFaceBoxes ? [] : faces;
  const primaryDraft = assignments[review.faceId];
  const target = identityTarget ?? (primaryDraft && 'name' in primaryDraft ? 'new' : primary?.personId || '');
  const canDecide = !blocked && !invalid && !adding && !cropping && !selectedId && !deleting && !albumEditing && ready;
  const pendingDraft = () => ({ photoId: photo.id, expectedPath: draft?.expectedPath || photo.relativePath, version: draft?.version || details?.version,
    reviewIds: draft?.reviewIds || [], changes: [...removals, ...reviewChanges(assignments, additions)], edits, albums, metadata, delete: false,
    sourceFaces: (details?.faces || []).map(({ id, personId }) => ({ id, personId })),
    croppedFaceIds: (details?.faces || []).filter(face => face.box && !visibleBox(editBox(face.box, edits))).map(face => face.id) });
  const remainingFaceIds = groupPerson ? remainingReviewFaceIds(details?.faces || [], pendingDraft(), peopleDrafts) : [];
  useEffect(() => { if (!groupPerson) heading.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { callbacks.current.onDirty?.(changed || adding || cropping || !!selectedId || albumEditing); }, [changed, adding, cropping, selectedId, albumEditing]);
  useEffect(() => { onReadyChange?.(!!canDecide && !error); }, [canDecide, error, onReadyChange]);
  useEffect(() => {
    if (!closeLayer) return;
    closeLayer.current = () => {
      if (albumLayer.current?.()) return true;
      if (adding || cropping || selectedId) { closeEditor(); return true; }
      if (deleting) { setDeleting(null); return true; }
      if (expanded) { enlarge(false); return true; }
      return false;
    };
    return () => { closeLayer.current = null; };
  }, [closeLayer, adding, cropping, selectedId, deleting, expanded]);
  useEffect(() => {
    if (details && !stale && (changed || draft)) callbacks.current.onDraft?.(pendingDraft());
  }, [details, assignments, additions, edits, albums, metadata]);
  useEffect(() => {
    const controller = new AbortController();
    photoRequest(`photos/${photo.id}/faces`, undefined, controller.signal).then(result => {
      if (!controller.signal.aborted) { setDetails(result); setError(''); }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [photo.id, attempt]);
  useEffect(() => {
    let active = true;
    if (!edits.length) { setSourceUrl(''); setPreviewBusy(false); return; }
    setPreviewBusy(true);
    imageEditPreview(getPictureContentUrl(photo.relativePath, REVIEW_IMAGE_RENDER), edits).then(url => {
      if (active) { setSourceUrl(url); setPreviewBusy(false); }
    }).catch(() => { if (active) { setError(s.reviewImageEditError); setPreviewBusy(false); } });
    return () => { active = false; };
  }, [photo.relativePath, edits, attempt, s.reviewImageEditError]);
  useEffect(() => {
    if (!withoutFaces && !groupPerson && !expanded && canDecide && !changedFaces && surface.current)
      return attachReviewSwipe(surface.current, setOffset, decide);
  }, [expanded, canDecide, changedFaces, albums, metadata, withoutFaces, groupPerson]);
  function enlarge(value) { setExpanded(value); onExpanded?.(value); }
  function closeEditor() { setAdding(false); setCropping(false); setBox(null); setSelectedId(null); }
  function stage(faceId, assignment) { setError(''); setAssignments(previous => ({ ...previous, [faceId]: assignment })); }
  function stageEditor(assignment) {
    if ('name' in assignment && !validNewPersonName(assignment.name)) { setError(s.batchInvalidName); return; }
    if (adding) setAdditions(previous => [...previous, { id: `draft-${createImportId()}`, box: visibleBox(editBox(box, edits, true)), assignment }]);
    else if (selectedId?.startsWith('draft-')) setAdditions(previous => previous.map(face => face.id === selectedId ? { ...face, assignment } : face));
    else if (selectedId) { stage(selectedId, assignment); if (selectedId === review.faceId) setIdentityTarget(null); }
    closeEditor(); setError('');
  }
  function decide(action = 'approve') {
    if (!canDecide) return;
    const next = pendingDraft();
    if (!groupPerson) next.reviewIds = [...new Set([...next.reviewIds, review.id])];
    if (action === 'unknown') next.changes = [...next.changes.filter(c => c.faceId !== review.faceId), { action: 'assign', faceId: review.faceId, personId: UNKNOWN_PERSON_ID }];
    onAdvance?.(next);
  }
  function markRemainderUnknown() {
    if (!canDecide || error || !remainingFaceIds.length) return;
    const next = pendingDraft();
    next.changes = [...next.changes, ...remainingFaceIds.map(faceId => ({ action: 'assign', faceId, personId: UNKNOWN_PERSON_ID }))];
    onUnknownRemainder(next);
  }
  function remove() {
    const next = pendingDraft();
    if (deleting === 'gallery') next.delete = true;
    else {
      next.reviewIds = [...new Set([...next.reviewIds, review.id])];
      if (!withoutFaces) next.changes = [...next.changes.filter(c => c.faceId !== review.faceId), { action: 'remove', faceId: review.faceId }];
    }
    onAdvance?.(next);
  }
  const startAdding = () => { if (!blocked) { closeEditor(); setAdding(true); } };
  const applyEdit = edit => { closeEditor(); setError(''); setEdits(previous => [...previous, edit]); };
  const editor = (adding && (box || withoutFaces) || selected) ? <FaceNameEditor key={selected?.id || 'new'} face={selected || {}} people={people}
    initialName={selected?.assignment?.name || assignments[selectedId]?.name || ''}
    s={{ ...s, ...(withoutFaces ? { drawFaceHint: s.reviewDrawFaceHint } : {}), save: s.reviewStageEdit, confirmFace: s.reviewStageFace }} busy={blocked} creating={adding} hasBox={!!box}
    onSave={stageEditor} onClose={closeEditor} /> : null;
  const preloadPaths = JSON.stringify([...new Set(nextPhotos.filter(next => next.id !== photo.id).map(next => next.relativePath).filter(Boolean))].slice(0, 2));
  useEffect(() => {
    if (ready && !previewBusy) return preloadReviewImages(JSON.parse(preloadPaths).map(path => getPictureContentUrl(path, REVIEW_IMAGE_RENDER)));
  }, [ready, previewBusy, preloadPaths]);
  const currentPhoto = Object.keys(metadata).length ? { ...photo, ...photoMetadataPatch(photo, metadata) } : photo;
  const detailStrings = { ...s, savePhotoDate: s.reviewStageDate, savePhotoLocation: s.reviewStageLocation, editPhotoLocationHint: s.reviewLocationHint };
  const stageMetadata = data => {
    const patch = photoMetadataPatch(currentPhoto, data);
    setMetadata(previous => ({ ...previous, ...data }));
    return { metadata: patch };
  };
  const addFaceButton = <button type="button" className="dialog-button dialog-button--accent" disabled={blocked || cropping || !ready} aria-pressed={adding}
    onClick={adding ? closeEditor : startAdding}>{adding ? s.cancel : `＋ ${s.addFace}`}</button>;
  const faceTabs = <div className="photo-review-face-tabs" role="group" aria-label={s.facesInPhoto}>{faces.map(face => <button type="button" key={face.id}
    className="dialog-button" aria-pressed={selectedId === face.id} disabled={blocked || adding || cropping} onClick={() => setSelectedId(face.id)}>{face.name || s.unnamedFace}</button>)}</div>;
  return <div className={`photo-review-card${withoutFaces ? ' photo-review-card--without-faces' : ''}`}>
    <div className="photo-review-card__progress"><strong ref={heading} tabIndex={-1} role="status">{(groupPerson ? s.reviewPhotoPosition : withoutFaces ? s.reviewNoFacesPosition : s.reviewPosition).replace('{current}', position).replace('{total}', total)}</strong>
      <progress max={total} value={position - 1} aria-label={withoutFaces ? s.reviewStepNoFaces : s.reviewStepValidate} /></div>
    <div className="photo-review-context"><PhotoMeta photo={currentPhoto} s={detailStrings} language={language} compact resolvePlace onSave={stageMetadata}
      disabled={blocked || adding || cropping || !!selectedId || !!deleting} />
    <PhotoReviewAlbums photo={photo} options={albumOptions} albums={albums} onChange={setAlbums} onEditing={setAlbumEditing}
      closeLayer={albumLayer} disabled={blocked || adding || cropping || !!selectedId || !!deleting} s={s} /></div>
    {groupPerson && <button type="button" className="photo-review-face-switch" role="switch" aria-checked={showFaceBoxes}
      onClick={() => onShowFaceBoxesChange?.(!showFaceBoxes)}><span className="photo-review-face-switch__track" aria-hidden="true" />{s.reviewShowFaceBoxes}</button>}
    {expanded || withoutFaces ? <div className={withoutFaces ? 'photo-review-workbench' : 'photo-review-expanded'}>
      {!withoutFaces && <div className="photo-review-expanded__toolbar"><button type="button" className="dialog-button" onClick={() => { closeEditor(); enlarge(false); }}>← {s.reviewBackToCard}</button>{addFaceButton}</div>}
      <div className="photo-review-image-tools">
        {withoutFaces && addFaceButton}
        <button type="button" className="dialog-button" disabled={blocked || adding || !!selected || cropping} onClick={() => applyEdit({ rotate: -1 })}>↶ {s.reviewRotateLeft}</button>
        <button type="button" className="dialog-button" disabled={blocked || adding || !!selected || cropping} onClick={() => applyEdit({ rotate: 1 })}>↷ {s.reviewRotateRight}</button>
        <button type="button" className="dialog-button" disabled={blocked || adding || !!selected} aria-pressed={cropping} onClick={() => { closeEditor(); setCropping(!cropping); }}>{cropping ? s.cancel : s.reviewCrop}</button>
        <label>{s.reviewResize}<input aria-label={s.reviewResize} type="number" min="10" max="200" step="1" value={scale} onChange={event => setScale(event.target.value)} />%</label>
        <button type="button" className="dialog-button" disabled={blocked || adding || cropping || !!selected || !Number.isFinite(Number(scale)) || scale < 10 || scale > 200 || Number(scale) === 100}
          onClick={() => { applyEdit({ scale: Number(scale) / 100 }); setScale(100); }}>{s.reviewStageEdit}</button>
        {!!edits.length && <button type="button" className="dialog-button" disabled={previewBusy || adding || cropping || !!selected} onClick={() => { setError(''); setEdits(previous => previous.slice(0, -1)); }}>{s.reviewUndoEdit}</button>}
      </div>
      {cropping && <p>{s.reviewCropHint} <button type="button" className="dialog-button dialog-button--accent" disabled={!box || blocked} onClick={() => applyEdit({ crop: box })}>{s.reviewApplyCrop}</button></p>}
      <div className={withoutFaces ? 'photo-review-workbench__content' : undefined}>
        <PhotoViewerImage photo={photo} quality={REVIEW_IMAGE_RENDER} sourceUrl={sourceUrl || undefined} faces={visibleFaces} s={cropping || withoutFaces ? { ...s, drawFaceHint: cropping ? s.reviewCropHint : s.reviewDrawFaceHint } : s} selectedFaceId={selectedId || review.faceId} highlightPersonId={groupPerson?.id} busy={blocked}
          onSelectFace={adding || cropping ? undefined : setSelectedId} addingFace={adding || cropping} onAddFace={cropping ? undefined : startAdding} onFaceBoxChange={setBox}
          editor={withoutFaces ? undefined : editor} editorBox={box || selected?.box} onReadyChange={setReady} />
        {withoutFaces && <aside className={`photo-review-workbench__people${editor ? ' is-editing' : ''}`} aria-label={s.facesInPhoto}>
          {editor || <><strong>{s.facesInPhoto} · {faces.length}</strong><p>{s.reviewNoFacesHint}</p>{faceTabs}</>}
        </aside>}
      </div>
      {withoutFaces ? <span className="photo-review-workbench__filename" title={photo.name}>{photo.title || photo.name}</span> : faceTabs}
    </div> : groupPerson ? <div className="photo-review-inspect">
      <PhotoViewerImage photo={photo} quality={REVIEW_IMAGE_RENDER} sourceUrl={sourceUrl || undefined} faces={visibleFaces}
        highlightPersonId={groupPerson.id} readOnlyFaces s={s} onReadyChange={setReady} />
      <div className="photo-review-photo__caption"><span>{photo.title || photo.name}</span>
        <button type="button" className="dialog-button" onClick={() => enlarge(true)}>⤢ {s.enlargePhoto}</button></div>
    </div> : <div className="photo-review-deck">
      <button ref={surface} type="button" className={`photo-review-photo${offset ? ' is-dragging' : ''}`} aria-label={`${s.enlargePhoto}: ${photo.name}`} onClick={() => enlarge(true)}
        style={{ transform: `translateX(${offset}px) rotate(${offset / 30}deg)` }}>
        <span className="photo-review-photo__image" style={{ aspectRatio: ratio, '--review-ratio': ratio }}>
          <img key={`${attempt}:${sourceUrl}`} src={sourceUrl || getPictureContentUrl(photo.relativePath, REVIEW_IMAGE_RENDER) || undefined} alt={photo.name} draggable={false} decoding="async" fetchPriority="high"
            onLoad={event => { setReady(true); setRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight); }} onError={() => { setReady(false); setError(s.failedImage); }} />
          {ready && <FaceRectangles faces={groupPerson ? visibleFaces : primary ? [primary] : faces} selectedFaceId={primary?.id} highlightPersonId={groupPerson?.id} s={s} readOnly />}
        </span>
        <span className="photo-review-photo__caption">{photo.title || photo.name}<span>⤢ {s.enlargePhoto}</span></span>
        {Math.abs(offset) > 25 && <span className={`photo-review-stamp ${offset > 0 ? 'is-approved' : ''}`} aria-hidden="true">{offset > 0 ? s.reviewApprove : s.unknownPerson}</span>}
      </button>
      <p className="photo-review-swipe-hint">{withoutFaces ? s.reviewNoFacesHint : groupPerson ? s.reviewNewPeopleHint : s.reviewSwipeHint}</p>
    </div>}
    {(!details || previewBusy) && <p className="photo-review-loading" role="status"><LoadingSpinner inline /> {s.loading}</p>}
    {primary && !groupPerson && <div className="photo-review-identity"><label>{s.reviewSuggested}<select aria-label={s.reviewSuggested} value={target} disabled={blocked || adding || !!selected}
      onChange={event => { setIdentityTarget(event.target.value); stage(review.faceId, event.target.value === 'new' ? { name: '' } : photoAssignmentValue(choices, event.target.value)); }}>
      {!choices.some(person => person.id === original?.personId) && <option value={original?.personId}>{original?.name || s.unnamedFace}</option>}
      {choices.map(person => <option key={person.id} value={person.id}>{photoAssignmentLabel(person, s)}</option>)}<option value="new">{s.newPerson}</option>
    </select></label>
      {target === 'new' && <label>{s.newPersonName}<input maxLength={100} value={primaryDraft?.name || ''} disabled={blocked || adding || !!selected}
        placeholder={s.faceNamePlaceholder} onChange={event => stage(review.faceId, { name: event.target.value })} /></label>}
    </div>}
    {changed && <p className="photo-review-draft" role="status">● {s.reviewStaged}</p>}
    {(error || stale) && <div className="photo-alert" role="alert">{stale ? s.reviewPhotoChanged : error}
      {!stale && <button type="button" className="dialog-button" onClick={() => { setError(''); setAttempt(value => value + 1); }}>{s.retry}</button>}</div>}
    {groupPerson && onUnknownRemainder && <button type="button" className="dialog-button photo-review-unknown" disabled={!canDecide || !!error || !remainingFaceIds.length}
      title={s.reviewUnknownRemainderHint} onClick={markRemainderUnknown}>{s.reviewUnknownRemainder.replace('{count}', remainingFaceIds.length)} →</button>}
    {!hideDecisions && <div className="photo-review-card__actions"><div className="photo-review-decisions">
      {withoutFaces || changedFaces ? <button type="button" className="dialog-button dialog-button--accent" disabled={!canDecide || !!error} onClick={() => decide()}>✓ {withoutFaces ? changed ? s.reviewSaveReviewed : s.markReviewed : s.reviewSave} →</button> : <>
        <button type="button" className="dialog-button photo-review-unknown" disabled={!canDecide} onClick={() => decide('unknown')}>← {s.unknownPerson}</button>
        <button type="button" className="dialog-button dialog-button--accent" disabled={!canDecide} onClick={() => decide()}>{s.reviewApprove} →</button>
      </>}
    </div>
    {!deleting ? <div className="photo-review-removal">
      <button type="button" disabled={!canDecide} onClick={() => setDeleting('reference')}>{withoutFaces ? s.reviewRemoveNewReference : s.reviewRemoveReference}</button>
      <button type="button" disabled={!canDecide} onClick={() => setDeleting('gallery')}>{s.deleteGallery}</button>
    </div> : <div className="photo-review-delete" role="alertdialog" aria-label={s.deletePhoto}>
      <strong>{photo.name}</strong><p>{deleting === 'gallery' ? s.deleteGalleryHint : withoutFaces ? s.reviewRemoveNewHint : s.reviewRemoveHint}</p>
      <p>{s.reviewDeferredHint}</p><div className="photo-dialog__actions"><button type="button" className="dialog-button" autoFocus onClick={() => setDeleting(null)}>{s.cancel}</button>
        <button type="button" className="dialog-button dialog-button--danger" onClick={remove}>{deleting === 'gallery' ? s.reviewDeleteConfirm : withoutFaces ? s.reviewRemoveNewReference : s.reviewRemoveReference}</button></div>
    </div>}</div>}
  </div>;
}

export function NewPersonReview({ person, library, people = library.knownPeople || library.people, albumOptions = [], nextPhotos = [], drafts, peopleDrafts = [], assignment, onAssignment, onDraft, onAdvance, onExpanded, onDirty, closeLayer, s, language, position, total, showFaceBoxes = true, onShowFaceBoxesChange }) {
  const photos = person.photoIds.map(id => library.photos.find(p => p.id === id)).filter(Boolean);
  const [photoIndex, setPhotoIndex] = useState(() => Math.max(0, photos.findIndex(photo => !newPersonReviewHandled({ ...person, photoIds: [photo.id] }, drafts))));
  const [target, setTarget] = useState(assignment?.personId || 'new'), [name, setName] = useState(assignment?.name || '');
  const [ready, setReady] = useState(false);
  const personSelect = useRef(null);
  const photo = photos[photoIndex], faceId = person.faceBoxes?.[photo?.id]?.[0]?.id;
  useEffect(() => { personSelect.current?.focus({ preventScroll: true }); }, [person.id, photo?.id]);
  const choices = photoAssignmentOptions(people, s);
  const handled = newPersonReviewHandled(person, drafts);
  const validAssignment = target === 'new' ? validNewPersonName(name) : choices.some(p => p.id === target);
  const currentAssignment = () => ({ id: person.id, ...(target === 'new' ? { name: name.trim() } : photoAssignmentValue(choices, target)) });
  function changePhoto(index) { setReady(false); onExpanded(false); setPhotoIndex(index); }
  function markRemainderUnknown(draft) {
    const resolved = newPersonReviewHandled(person, { ...drafts, [draft.photoId]: draft });
    onAdvance(resolved ? null : validAssignment ? currentAssignment() : null, draft, !resolved && !validAssignment);
  }
  return <div className="photo-review-new-person"><h3>{person.name} · {position} / {total}</h3>
    <div className="photo-review-identity"><label>{s.choosePerson}<select ref={personSelect} autoFocus value={target} onChange={event => { setTarget(event.target.value); onAssignment({ id: person.id, ...(event.target.value === 'new' ? { name } : photoAssignmentValue(choices, event.target.value)) }); }}><option value="new">{s.newPerson}</option>
      {choices.map(p => <option key={p.id} value={p.id}>{photoAssignmentLabel(p, s)}</option>)}</select></label>
      {target === 'new' && <label>{s.newPersonName}<input value={name} maxLength={100} onChange={event => { setName(event.target.value); onAssignment({ id: person.id, name: event.target.value }); }} /></label>}</div>
    <button type="button" className="dialog-button dialog-button--accent photo-review-new-person__next" disabled={!ready || !handled && !validAssignment}
      onClick={() => onAdvance(handled ? null : currentAssignment())}>{s.reviewSave} →</button>
    {photo && <ReviewCard key={photo.id} photo={photo} review={{ id: `person-${person.id}`, faceId }} groupPerson={person} hideDecisions people={people} albumOptions={albumOptions}
      peopleDrafts={peopleDrafts} onUnknownRemainder={markRemainderUnknown}
      showFaceBoxes={showFaceBoxes} onShowFaceBoxesChange={onShowFaceBoxesChange}
      nextPhotos={[...photos.slice(photoIndex + 1).filter(item => !drafts[item.id]?.delete), ...nextPhotos]}
      draft={drafts[photo.id]} onDraft={onDraft} position={photoIndex + 1} total={photos.length} s={s} language={language} onExpanded={onExpanded} onDirty={onDirty} onReadyChange={setReady} closeLayer={closeLayer} />}
    <div className="photo-dialog__actions"><button type="button" className="dialog-button" disabled={photoIndex === 0 || !ready} onClick={() => changePhoto(photoIndex - 1)}>← {s.previous}</button>
      <span>{photoIndex + 1} / {photos.length}</span><button type="button" className="dialog-button" disabled={photoIndex + 1 >= photos.length || !ready} onClick={() => changePhoto(photoIndex + 1)}>{s.next} →</button></div>
    {(handled || !validAssignment) && <p role="status">{handled ? s.reviewNewPeopleResolved : s.reviewNewPeopleNeedsIdentity}</p>}
  </div>;
}

export default function PhotoReviewWizard({ Modal, library, mode = 'scan', initialLimit = 100, s, language = 'es', onRefresh, onClose }) {
  const storageKey = reviewStorageKey();
  const [saved] = useState(readPhotoReviewDraft);
  const [step, setStep] = useState(saved.step || (mode === 'scan' ? 'scan' : mode === 'noFaces' ? 'no-faces-intro' : mode === 'newPeople' ? 'new-people-intro' : 'intro'));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [queue, setQueue] = useState(saved.queue || []), [cursor, setCursor] = useState(saved.cursor || 0);
  const [drafts, setDrafts] = useState(saved.drafts || {}), [peopleDrafts, setPeopleDrafts] = useState(saved.peopleDrafts || []);
  const [requestId, setRequestId] = useState(saved.requestId || createImportId), [committed, setCommitted] = useState(!!saved.committed);
  const [submission, setSubmission] = useState(saved.submission || null);
  const [dirty, setDirty] = useState(false), [expanded, setExpanded] = useState(false);
  const [showFaceBoxes, setShowFaceBoxes] = useState(true);
  const [batchOnly, setBatchOnly] = useState(saved.batchOnly ?? mode === 'scan');
  const [batchContext, setBatchContext] = useState(saved.batchContext || null);
  const [history, setHistory] = useState([]);
  const working = useRef(false), wasScanning = useRef(false);
  const closeLayer = useRef(null);
  const faces = library.faces, active = faces.running || faces.singleRunning;
  const scope = batchOnly ? batchContext?.id ?? faces.batchId ?? null : undefined;
  const unnamed = new Set(library.people.filter(isNewPhotoPerson).map(p => p.id));
  const pending = faceReviewQueue(library.reviews, library.photos, scope).filter(r => !unnamed.has(r.personId));
  const noFaces = noFacesReviewQueue(library.reviews, library.photos, scope);
  const newPeople = newPeopleReviewQueue(batchContext ? { ...library, faces: { ...faces, batchPhotoIds: batchContext.photoIds } } : library, batchOnly);
  const assignmentPeople = reviewPeopleOptions(library.knownPeople || library.people, drafts, peopleDrafts);
  const albumOptions = reviewAlbumOptions(library.folders, drafts);
  const stage = step === 'scan' ? 1 : step.startsWith('no-faces') ? 3 : step.startsWith('new-people') || step === 'done' ? 4 : 2;
  const hasDrafts = Object.keys(drafts).length > 0 || peopleDrafts.length > 0;
  const snapshot = { step, queue, cursor, drafts, peopleDrafts, requestId, committed, submission, batchOnly, batchContext };
  useEffect(() => {
    if (step === 'scan' && faces.batchId) setBatchContext({ id: faces.batchId, photoIds: faces.batchPhotoIds || [] });
  }, [step, faces.batchId]);
  useEffect(() => {
    try { if (step === 'done') sessionStorage.removeItem(storageKey); else sessionStorage.setItem(storageKey, JSON.stringify(snapshot)); }
    catch { setError(s.reviewDraftStorageError); }
  }, [step, queue, cursor, drafts, peopleDrafts, requestId, committed, submission, batchOnly, batchContext]);
  useEffect(() => {
    if (!hasDrafts && !dirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [hasDrafts, dirty]);
  const storeDraft = useCallback(draft => setDrafts(previous => ({ ...previous, [draft.photoId]: draft })), []);
  async function scanAction(path, payload = {}) {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try { await photoRequest(path, payload); if (!await onRefresh()) throw new Error(s.reviewLoadingError); }
    catch (e) { setError(e.message); }
    finally { working.current = false; setBusy(false); }
  }
  useEffect(() => {
    if (step !== 'scan') return;
    if (active) wasScanning.current = true;
    else if (wasScanning.current && !busy && faces.state === 'complete') { wasScanning.current = false; setStep('intro'); }
  }, [step, active, busy, faces.state]);
  function begin(kind) {
    const items = kind === 'no-faces' ? noFaces : kind === 'new-people' ? newPeople : pending;
    setQueue(items); setCursor(0); setHistory([]);
    setStep(items.length ? `${kind}-review` : kind === 'faces' ? 'no-faces-intro' : kind === 'no-faces' ? 'new-people-intro' : 'done');
  }
  function advance(draft) {
    setHistory(previous => [...previous, { drafts, peopleDrafts, cursor, step }]);
    const nextDrafts = { ...drafts, [draft.photoId]: draft };
    setDrafts(nextDrafts); setDirty(false); setExpanded(false);
    let next = cursor + 1;
    while (next < queue.length && reviewHandled(queue[next], nextDrafts)) next++;
    setCursor(next);
    if (next >= queue.length) setStep(stage === 3 ? 'no-faces-confirm' : 'faces-confirm');
  }
  function advancePerson(item, photoDraft, stayOnPerson = false) {
    setHistory(previous => [...previous, { drafts, peopleDrafts, cursor, step }]);
    const nextDrafts = photoDraft ? { ...drafts, [photoDraft.photoId]: photoDraft } : drafts;
    setDrafts(nextDrafts); setDirty(false); setExpanded(false);
    if (stayOnPerson) return;
    setPeopleDrafts(previous => [...previous.filter(p => p.id !== queue[cursor].id), ...(item ? [item] : [])]);
    let next = cursor + 1;
    while (next < queue.length && newPersonReviewHandled(queue[next], nextDrafts)) next++;
    setCursor(next); if (next >= queue.length) setStep('new-people-confirm');
  }
  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setDrafts(previous.drafts); setPeopleDrafts(previous.peopleDrafts); setCursor(previous.cursor); setStep(previous.step);
    setHistory(items => items.slice(0, -1)); setError(''); setDirty(false); setExpanded(false);
  }
  async function commit() {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try {
      if (!committed && hasDrafts) {
        const payload = submission || { requestId, photos: reviewBatchPhotos(drafts), people: peopleDrafts.filter(item => {
          const person = library.people.find(p => p.id === item.id);
          return !person || !newPersonReviewHandled(person, drafts);
        }) };
        setSubmission(payload);
        await photoRequest('reviews/batch', payload); setCommitted(true);
      }
      const fresh = await onRefresh();
      if (!fresh) throw new Error(s.reviewLoadingError);
      setDrafts({}); setPeopleDrafts([]); setQueue([]); setCursor(0); setHistory([]); setDirty(false); setCommitted(false); setSubmission(null); setRequestId(createImportId());
      setStep(stage === 2 ? 'no-faces-intro' : stage === 3 ? 'new-people-intro' : 'done');
    } catch (e) { setError(e.message); if ([400, 409].includes(e.status) && !committed) setSubmission(null); }
    finally { working.current = false; setBusy(false); }
  }
  const current = queue[cursor], photo = library.photos.find(photo => photo.id === current?.photoId);
  const nextPhotos = upcomingReviewPhotos(queue, cursor, library.photos, drafts);
  const confirming = step.endsWith('-confirm');
  const inlineEditor = step === 'no-faces-review';
  return <Modal title={s.reviewWizard} s={s} busy={busy} onClose={() => { if (!busy && !closeLayer.current?.()) onClose(); }} wide={expanded}
    className={`photo-dialog--review-wizard${expanded ? ' is-expanded' : ''}${inlineEditor ? ' photo-dialog--inline-review' : ''}`}>
    <ReviewSteps step={step === 'done' ? 5 : stage} s={s} />
    {hasDrafts && <p className="photo-review-draft" role="status">{s.reviewDraftCount.replace('{count}', Object.keys(drafts).length + peopleDrafts.length)}</p>}
    {error && <p className="photo-alert" role="alert">{error}</p>}
    {step === 'scan' && <div className="photo-review-scan">
      <PeopleAnalysis faces={faces} peopleCount={library.people.filter(p => p.id !== UNKNOWN_PERSON_ID).length} s={s} busy={busy} onAction={scanAction} initialLimit={initialLimit} startLabel={s.reviewStartBatch} />
      <div className="photo-dialog__actions"><button type="button" className="dialog-button" disabled={busy} onClick={onClose}>{s.reviewLater}</button>
        <button type="button" className="dialog-button dialog-button--accent" disabled={busy || active || faces.state !== 'complete'} onClick={() => setStep('intro')}>{s.reviewNextStep} →</button></div>
    </div>}
    {step === 'intro' && <div className="photo-review-intro"><h3>{s.reviewStepValidate}</h3>
      <strong>{s.reviewIntro.replace('{faces}', pending.length).replace('{people}', new Set(pending.map(r => r.personId)).size).replace('{photos}', new Set(pending.map(r => r.photoId)).size)}</strong>
      <p>{batchOnly ? s.reviewBatchScope : s.reviewAllScope}</p><p>{s.reviewDeferredHint}</p>
      <button type="button" className="dialog-button dialog-button--accent" onClick={() => begin('faces')}>{pending.length ? s.reviewBegin : s.reviewNextNoFaces} →</button>
    </div>}
    {step === 'no-faces-intro' && <div className="photo-review-intro"><h3>{s.reviewNewWithoutPeople}</h3>
      <strong>{s.reviewNoFacesIntro.replace('{count}', noFaces.length)}</strong><p>{s.reviewDeferredHint}</p>
      <button type="button" className="dialog-button dialog-button--accent" onClick={() => begin('no-faces')}>{noFaces.length ? s.reviewBeginPhotos : s.reviewNextNewPeople} →</button>
    </div>}
    {step === 'new-people-intro' && <div className="photo-review-intro"><h3>{s.reviewStepNewPeople}</h3><strong>{s.reviewNewPeopleCount.replace('{count}', newPeople.length)}</strong>
      <p>{s.reviewNewPeopleHint}</p><button type="button" className="dialog-button dialog-button--accent" onClick={() => begin('new-people')}>{newPeople.length ? s.reviewBegin : s.done} →</button></div>}
    {['faces-review', 'no-faces-review'].includes(step) && (current && photo ? <ReviewCard key={`${current.id}:${history.length}`} review={current} photo={photo} people={assignmentPeople} albumOptions={albumOptions} nextPhotos={nextPhotos}
      draft={drafts[photo.id]} onDraft={storeDraft} position={cursor + 1} total={queue.length} s={s} language={language} onAdvance={advance} onDirty={setDirty} onExpanded={setExpanded} closeLayer={closeLayer} /> :
      <p role="alert">{s.reviewPhotoChanged}</p>)}
    {step === 'new-people-review' && current && <NewPersonReview key={`${current.id}:${history.length}`} person={current} library={library} people={assignmentPeople} albumOptions={albumOptions} nextPhotos={nextPhotos} drafts={drafts} peopleDrafts={peopleDrafts} onDraft={storeDraft}
      showFaceBoxes={showFaceBoxes} onShowFaceBoxesChange={setShowFaceBoxes}
      assignment={peopleDrafts.find(p => p.id === current.id)} onAssignment={item => setPeopleDrafts(previous => [...previous.filter(p => p.id !== item.id), item])}
      onAdvance={advancePerson} onDirty={setDirty} onExpanded={setExpanded} closeLayer={closeLayer} s={s} language={language} position={cursor + 1} total={queue.length} />}
    {confirming && <div className="photo-review-intro"><h3>{s.reviewReadyToCommit}</h3><p>{s.reviewDeferredHint}</p>
      <strong>{s.reviewDraftCount.replace('{count}', Object.keys(drafts).length + peopleDrafts.length)}</strong>
      <button type="button" className="dialog-button dialog-button--accent" disabled={busy} onClick={commit}>{busy ? <><LoadingSpinner inline /> {s.reviewSaving}</> : committed ? s.retry : s.reviewValidateAll} →</button></div>}
    <div className="photo-review-history">{!!history.length && !busy && !committed && !submission && <button type="button" className="dialog-button" onClick={undo}>↶ {s.reviewUndoDecision}</button>}
    {(hasDrafts || queue.length > 0) && !busy && !committed && !submission && <button type="button" className="dialog-button" onClick={() => {
      setDrafts({}); setPeopleDrafts([]); setQueue([]); setHistory([]); setCursor(0); setRequestId(createImportId()); setError(''); setExpanded(false);
      setStep(stage === 3 ? 'no-faces-intro' : stage === 4 ? 'new-people-intro' : 'intro');
      void onRefresh();
    }}>{s.discardPeopleChanges}</button>}</div>
    {step === 'done' && <div className="photo-review-intro" role="status"><h3>{s.reviewFinished}</h3><p>{s.reviewFinishedHint}</p>
      <div className="photo-dialog__actions"><button type="button" className="dialog-button" onClick={onClose}>{s.done}</button>
        {faces.available && faces.pending > 0 && <button type="button" className="dialog-button dialog-button--accent" onClick={() => { setBatchOnly(true); setStep('scan'); }}>{s.scanNextBatch} →</button>}</div></div>}
  </Modal>;
}
