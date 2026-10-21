import React, { useEffect, useId, useRef, useState } from 'react';
import { getPictureContentUrl } from './api/raspberryApi.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import { attachPhotoZoom, MAX_PHOTO_ZOOM } from './photoZoom.js';

export function FaceRectangles({ faces = [], selectedFaceId, highlightPersonId, onSelect, s }) {
  return faces.map((face, index) => face.box ? <button type="button" key={face.id}
    className={`photo-face-box${face.personId === highlightPersonId ? ' is-highlighted' : ''}${face.id === selectedFaceId ? ' is-selected' : ''}`}
    aria-label={`${s.editFace}: ${face.name || s.unnamedFace}`} aria-pressed={face.id === selectedFaceId}
    style={{ left: `${face.box.x * 100}%`, top: `${face.box.y * 100}%`, width: `${face.box.width * 100}%`, height: `${face.box.height * 100}%` }}
    onClick={event => { event.stopPropagation(); onSelect?.(face.id); }}>
    <span>{index + 1} · {face.name || s.unnamedFace}</span>
  </button> : null).filter(Boolean);
}

export default function PhotoViewerImage({ photo, s, faces = [], selectedFaceId, highlightPersonId, onSelectFace }) {
  const [ready, setReady] = useState(false), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0, width: 1, height: 1 });
  const surface = useRef(null), zoom = useRef(null), natural = useRef(null), hint = useId();
  useEffect(() => {
    const controller = attachPhotoZoom(surface.current, setView); zoom.current = controller;
    if (natural.current) controller.setImageSize(...natural.current);
    return () => { controller.destroy(); zoom.current = null; };
  }, []);
  const size = event => {
    natural.current = [event.currentTarget.naturalWidth, event.currentTarget.naturalHeight];
    zoom.current?.setImageSize(...natural.current);
  };
  return <div className="photo-viewer__stage">
    <div ref={surface} className={`photo-viewer__image${view.scale > 1 ? ' is-zoomed' : ''}${view.dragging ? ' is-dragging' : ''}`}
      role="group" aria-label={photo.name} aria-describedby={hint} tabIndex={0} aria-busy={!ready && !error}>
      <div className="photo-viewer__transform" style={{ width: view.width, height: view.height,
        transform: `translate(-50%, -50%) translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})` }}>
        <img className="photo-viewer__placeholder" src={getPictureContentUrl(photo.relativePath, 'thumb') || undefined}
          onLoad={event => { if (!ready) size(event); }} draggable={false} alt="" aria-hidden="true" />
        {!error && <img key={attempt} className={`photo-viewer__full${ready ? ' is-ready' : ''}`} src={getPictureContentUrl(photo.relativePath, 'preview') || undefined}
          alt={photo.name} draggable={false} decoding="async" fetchPriority="high" onLoad={event => { size(event); setReady(true); }} onError={() => setError(true)} />}
        <FaceRectangles faces={faces} selectedFaceId={selectedFaceId} highlightPersonId={highlightPersonId} onSelect={onSelectFace} s={s} />
      </div>
      {!ready && <div className="photo-viewer__loading" role="status">{error ? <><span>{s.failedImage}</span><button type="button" className="dialog-button" onClick={() => { setError(false); setAttempt(value => value + 1); }}>{s.retry}</button></> : <><LoadingSpinner inline /><span>{s.loadingPhoto}</span></>}</div>}
    </div>
    <div className="photo-viewer__zoom" role="group" aria-label={s.zoom}>
      <button type="button" aria-label={s.zoomOut} title={s.zoomOut} disabled={view.scale <= 1} onClick={() => zoom.current?.zoomBy(1 / 1.5)}>−</button>
      <button type="button" className="photo-viewer__reset" aria-label={s.fitPhoto} title={s.fitPhoto} onClick={() => zoom.current?.reset()}>{Math.round(view.scale * 100)} %</button>
      <button type="button" aria-label={s.zoomIn} title={s.zoomIn} disabled={view.scale >= MAX_PHOTO_ZOOM} onClick={() => zoom.current?.zoomBy(1.5)}>＋</button>
    </div>
    <p id={hint} className="photo-viewer__hint">{s.zoomHint}</p>
  </div>;
}
