import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getPictureContentUrl } from './api/raspberryApi.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import useBrowserBack from './useBrowserBack.js';
import { personPreviewFaces, personPreviewGeometry, personPreviewPhotos } from './photoPersonPreview.js';
import { dateLabel } from './photoMetadata.js';
import { photoFaceLabel } from './photoPersonTimeline.js';
import { FaceLabel } from './PhotoViewerImage.jsx';

export default function PersonPhotoPopover({ person, photosById, anchor, s, language, onClose, onEdit, onDetails }) {
  const photos = personPreviewPhotos(person, photosById);
  const [photoId, setPhotoId] = useState(() => photos[0]?.id);
  const [loaded, setLoaded] = useState(null), [failed, setFailed] = useState(null), [attempt, setAttempt] = useState(0);
  const popup = useRef(null);
  const index = Math.max(0, photos.findIndex(photo => photo.id === photoId));
  const photo = photos[index];
  const src = photo && getPictureContentUrl(photo.relativePath, 'preview');
  const ready = loaded?.src === src, error = failed === src;
  const faces = photo ? personPreviewFaces(person, photo.id) : [];
  const position = anchor?.isConnected && photo ? personPreviewGeometry(anchor.getBoundingClientRect(),
    ready ? loaded : photo, { width: window.innerWidth, height: window.innerHeight }) : null;
  const move = direction => { if (photos.length > 1) setPhotoId(photos[(index + direction + photos.length) % photos.length].id); };
  const close = () => { onClose(); if (anchor?.isConnected) anchor.focus({ preventScroll: true }); };
  useBrowserBack(close, 30);

  useLayoutEffect(() => { popup.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const outside = event => {
      if (!popup.current?.contains(event.target) && !anchor?.contains(event.target)) onClose();
    };
    const dismiss = () => onClose();
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [anchor, onClose]);
  useEffect(() => { if (!position) onClose(); }, [!!position, onClose]);

  if (!position) return null;
  return createPortal(<div ref={popup} className="photo-person-preview" style={position} role="group"
    aria-label={`${s.personPhotoPreview}: ${person.name}`} tabIndex={-1}
    onKeyDown={event => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); event.stopPropagation(); move(event.key === 'ArrowRight' ? 1 : -1);
      }
    }}>
    <img key={`${src}:${attempt}`} src={src} alt={photo.title || photo.name} draggable={false}
      style={{ visibility: ready && !error ? 'visible' : 'hidden' }}
      onLoad={event => { setFailed(null); setLoaded({ src, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); }}
      onError={() => setFailed(src)} />
    {ready && !error && faces.map((face, faceIndex) => {
      const label = photoFaceLabel(face, photo, undefined, s);
      return <span key={face.id || faceIndex} className="photo-person-preview__face"
        role="img" aria-label={label} style={{ left: `${face.box.x * 100}%`, top: `${face.box.y * 100}%`,
          width: `${face.box.width * 100}%`, height: `${face.box.height * 100}%` }}>
        <FaceLabel box={face.box}>{label}</FaceLabel>
      </span>;
    })}
    {(!ready || error) && <div className="photo-person-preview__loading" role="status">
      {error ? <><span>{s.failedImage}</span><button type="button" className="dialog-button" onClick={() => { setFailed(null); setAttempt(value => value + 1); }}>{s.retry}</button></> : <><LoadingSpinner inline /><span>{s.loadingPhoto}</span></>}
    </div>}
    <button type="button" className="photo-person-preview__close" onClick={close} aria-label={s.close} title={s.close}>×</button>
    <div className="photo-person-preview__details">
      <span>◷ {dateLabel(photo.takenAt, language, s.noDate)}</span>
      {onDetails && <><button type="button" className="photo-detail-link" onClick={() => onDetails(photo.id, 'date')}>{s.editPhotoDate}</button>
        <button type="button" className="photo-detail-link" onClick={() => onDetails(photo.id, 'location')}>{s.showPhotoMap}</button></>}
      {onEdit && <button type="button" className="photo-detail-link" onClick={() => onEdit(photo.id)}>{s.editFaces}</button>}
    </div>
    {photos.length > 1 && <>
      <button type="button" className="photo-person-preview__previous" onClick={() => move(-1)} aria-label={s.previous} title={s.previous}>‹</button>
      <button type="button" className="photo-person-preview__next" onClick={() => move(1)} aria-label={s.next} title={s.next}>›</button>
      <span className="photo-person-preview__count" role="status" aria-atomic="true">{index + 1} / {photos.length}</span>
    </>}
  </div>, document.body);
}
