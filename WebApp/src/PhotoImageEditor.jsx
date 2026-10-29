import React, { useEffect, useRef, useState } from 'react';
import { getPictureContentUrl, photoRequest } from './api/raspberryApi.js';
import { createImportId } from './photoImport.js';
import { editBox, visibleBox, imageEditPreview, photoImageEditBatch } from './photoImageEdits.js';
import { visiblePersonFaces } from './photoPersonPreview.js';
import PhotoDetailDialog from './PhotoDetailDialog.jsx';
import PhotoViewerImage from './PhotoViewerImage.jsx';
import './PhotoImageEditor.css';

export default function PhotoImageEditor({ photo, s, highlightPersonId, showPersonFaces = true, showOtherFaces = true, onSaved, onClose }) {
  const [details, setDetails] = useState(null), [attempt, setAttempt] = useState(0);
  const [edits, setEdits] = useState([]), [scale, setScale] = useState(100);
  const [preview, setPreview] = useState(null), [previewError, setPreviewError] = useState('');
  const [cropping, setCropping] = useState(false), [box, setBox] = useState(null), [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [discarding, setDiscarding] = useState(false), [saved, setSaved] = useState(false);
  const working = useRef(false), submission = useRef(null);
  const previewBusy = edits.length > 0 && preview?.edits !== edits && !previewError;
  const blocked = busy || saved || discarding || !details || previewBusy || !!previewError;
  useEffect(() => {
    const controller = new AbortController();
    photoRequest(`photos/${photo.id}/faces`, undefined, controller.signal).then(result => {
      if (!controller.signal.aborted) { setDetails(result); setError(''); }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [photo.id, attempt]);
  useEffect(() => {
    let active = true;
    setPreviewError('');
    if (!edits.length) { setPreview(null); return; }
    imageEditPreview(getPictureContentUrl(photo.relativePath, 'preview'), edits).then(url => {
      if (active) setPreview({ edits, url });
    }).catch(() => { if (active) setPreviewError(s.reviewImageEditError); });
    return () => { active = false; };
  }, [photo.relativePath, edits, attempt, s.reviewImageEditError]);
  function updateEdits(next) {
    submission.current = null; setError(''); setPreviewError('');
    setEdits(next); setCropping(false); setBox(null);
  }
  function close() {
    if (working.current) return;
    if (discarding) { setDiscarding(false); return; }
    if (cropping) { setCropping(false); setBox(null); return; }
    if (edits.length && !saved) setDiscarding(true);
    else onClose();
  }
  async function save() {
    if (working.current || !saved && (blocked || cropping || !ready || !edits.length)) return;
    working.current = true; setBusy(true); setError('');
    try {
      if (!saved) {
        submission.current ||= photoImageEditBatch(photo, details.version, edits, createImportId());
        await photoRequest('reviews/batch', submission.current);
        setSaved(true);
      }
      await onSaved();
    } catch (error) { setError(error.message); }
    finally { working.current = false; setBusy(false); }
  }
  const allFaces = (details?.faces || []).flatMap(face => {
    const box = visibleBox(editBox(face.box, edits));
    return box ? [{ ...face, box }] : [];
  });
  const faces = !highlightPersonId && !showOtherFaces ? [] : visiblePersonFaces(allFaces, highlightPersonId, showOtherFaces, null, showPersonFaces);
  return <PhotoDetailDialog title={photo.title || photo.name} subtitle={s.editPhotoImage} s={s} busy={busy} onClose={close} className="photo-image-editor">
    <div className="photo-image-editor__tools" role="group" aria-label={s.editPhotoImage}>
      <button type="button" className="dialog-button" disabled={blocked || cropping || !ready || edits.length >= 50} onClick={() => updateEdits([...edits, { rotate: -1 }])}>↶ {s.reviewRotateLeft}</button>
      <button type="button" className="dialog-button" disabled={blocked || cropping || !ready || edits.length >= 50} onClick={() => updateEdits([...edits, { rotate: 1 }])}>↷ {s.reviewRotateRight}</button>
      <button type="button" className="dialog-button" disabled={blocked || !ready || edits.length >= 50} aria-pressed={cropping}
        onClick={() => { setCropping(!cropping); setBox(null); }}>{cropping ? s.cancel : s.reviewCrop}</button>
      <label>{s.reviewResize}<input type="number" min="10" max="200" step="1" value={scale} disabled={blocked || cropping}
        onChange={event => setScale(event.target.value)} />%</label>
      <button type="button" className="dialog-button" disabled={blocked || cropping || !ready || edits.length >= 50 || !Number.isFinite(Number(scale)) || scale < 10 || scale > 200 || Number(scale) === 100}
        onClick={() => { updateEdits([...edits, { scale: Number(scale) / 100 }]); setScale(100); }}>{s.applyPhotoSize}</button>
      <button type="button" className="dialog-button" disabled={busy || saved || discarding || cropping || !edits.length} onClick={() => updateEdits(edits.slice(0, -1))}>{s.reviewUndoEdit}</button>
    </div>
    {cropping && <p>{s.reviewCropHint} <button type="button" className="dialog-button dialog-button--accent" disabled={blocked || !box}
      onClick={() => updateEdits([...edits, { crop: box }])}>{s.reviewApplyCrop}</button></p>}
    <PhotoViewerImage photo={photo} sourceUrl={edits.length ? preview?.url : undefined} faces={faces} readOnlyFaces highlightPersonId={highlightPersonId}
      s={cropping ? { ...s, drawFaceHint: s.reviewCropHint } : s} busy={blocked} addingFace={cropping} onFaceBoxChange={setBox} onReadyChange={setReady} />
    <p className="photo-image-editor__hint">{s.photoImageEditHint}</p>
    {previewBusy && <p role="status">{s.loading}</p>}
    {(error || previewError) && <p role="alert" className="dialog-error">{error || previewError}
      {(!details || previewError) && <button type="button" className="dialog-button" disabled={busy} onClick={() => setAttempt(value => value + 1)}>{s.retry}</button>}</p>}
    {discarding ? <div className="photo-image-editor__discard" role="alertdialog" aria-label={s.discardPhotoEdits}>
      <p>{s.unsavedPhotoEdits}</p><div className="photo-detail-actions">
        <button autoFocus type="button" className="dialog-button" onClick={() => setDiscarding(false)}>{s.reviewKeepEditing}</button>
        <button type="button" className="dialog-button" onClick={onClose}>{s.discardPhotoEdits}</button>
      </div>
    </div> : <footer className="photo-detail-actions">
      <button type="button" className="dialog-button" disabled={busy} onClick={close}>{s.cancel}</button>
      <button type="button" className="dialog-button dialog-button--accent" disabled={busy || !saved && (blocked || cropping || !ready || !edits.length)} onClick={save}>
        {busy ? s.savingPhotoDetails : saved ? s.retry : s.savePhotoImage}</button>
    </footer>}
  </PhotoDetailDialog>;
}
