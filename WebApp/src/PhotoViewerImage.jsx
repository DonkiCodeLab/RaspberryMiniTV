import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { getPictureContentUrl } from './api/raspberryApi.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import { attachPhotoZoom, MAX_PHOTO_ZOOM } from './photoZoom.js';
import { photoPersonName } from './photoLibrary.js';
import { attachFaceDrawing } from './photoFaceDrawing.js';
import { facePopoverPosition } from './photoFacePopover.js';
import { attachPhotoFaceShortcut } from './photoFaceShortcut.js';

function FacePopover({ box, view, surface, children }) {
  const panel = useRef(null);
  const [geometry, setGeometry] = useState(null);
  useLayoutEffect(() => {
    const measure = () => setGeometry({ viewport: { width: surface.current.clientWidth, height: surface.current.clientHeight },
      panel: { width: 296, height: panel.current.offsetHeight } });
    const observer = new ResizeObserver(measure);
    observer.observe(surface.current); observer.observe(panel.current); measure();
    return () => observer.disconnect();
  }, [surface]);
  return <div ref={panel} className="photo-face-popover" style={geometry ? facePopoverPosition(box, view, geometry.viewport, geometry.panel) : { left: 12, top: 12 }}>
    {children}
  </div>;
}

function FaceDrawing({ onChange, s, disabled }) {
  const overlay = useRef(null), callback = useRef(onChange);
  const [box, setBox] = useState(null);
  callback.current = onChange;
  useEffect(() => {
    if (!disabled) return attachFaceDrawing(overlay.current, setBox, value => callback.current(value));
  }, [disabled]);
  return <div ref={overlay} className="photo-face-drawing" role="group" aria-label={s.drawFaceHint}>
    {box && <span className="photo-face-box photo-face-box--draft" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }} />}
  </div>;
}

export function FaceRectangles({ faces = [], selectedFaceId, highlightPersonId, onSelect, s, disabled = false, readOnly = false }) {
  const Tag = readOnly ? 'span' : 'button';
  return faces.map((face, index) => face.box ? <Tag key={face.id}
    className={`photo-face-box${face.personId === highlightPersonId ? ' is-highlighted' : ''}${face.id === selectedFaceId ? ' is-selected' : ''}`}
    {...(readOnly ? { role: 'img', 'aria-label': photoPersonName(face, s) || s.unnamedFace } : {
      type: 'button', 'aria-label': `${s.editFace}: ${photoPersonName(face, s) || s.unnamedFace}`,
      'aria-pressed': face.id === selectedFaceId, disabled,
      onClick: event => { event.stopPropagation(); onSelect?.(face.id); },
    })}
    style={{ left: `${face.box.x * 100}%`, top: `${face.box.y * 100}%`, width: `${face.box.width * 100}%`, height: `${face.box.height * 100}%` }}>
    <span>{index + 1} · {photoPersonName(face, s) || s.unnamedFace}</span>
  </Tag> : null).filter(Boolean);
}

export default function PhotoViewerImage({ photo, quality = 'preview', sourceUrl, s, faces = [], selectedFaceId, highlightPersonId, onSelectFace, readOnlyFaces = false, addingFace = false, onAddFace, onFaceBoxChange, busy = false, editor, editorBox, onReadyChange }) {
  const [ready, setReady] = useState(false), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0, width: 1, height: 1 });
  const surface = useRef(null), zoom = useRef(null), natural = useRef(null), hint = useId();
  const image = useRef(null), shortcut = useRef(null);
  useLayoutEffect(() => { setReady(false); setError(false); }, [photo.id, photo.relativePath, quality, sourceUrl]);
  useEffect(() => { onReadyChange?.(ready && !error); }, [ready, error, onReadyChange]);
  shortcut.current = { onAddFace, enabled: !!onAddFace && ready && !error && !busy && !addingFace && !editor };
  useEffect(() => attachPhotoFaceShortcut(surface.current, image.current,
    () => shortcut.current.onAddFace(), () => shortcut.current.enabled), [photo.id]);
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
    <div className="photo-viewer__canvas">
      <div ref={surface} className={`photo-viewer__image${view.scale > 1 ? ' is-zoomed' : ''}${view.dragging ? ' is-dragging' : ''}`}
        role="group" aria-label={photo.name} aria-describedby={hint} tabIndex={0} aria-busy={!ready && !error}>
        <div ref={image} className="photo-viewer__transform" style={{ width: view.width, height: view.height,
          transform: `translate(-50%, -50%) translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})` }}>
          <img className="photo-viewer__placeholder" src={sourceUrl || getPictureContentUrl(photo.relativePath, 'thumb') || undefined}
            onLoad={event => { if (!ready) size(event); }} draggable={false} alt="" aria-hidden="true" />
          {!error && <img key={`${quality}:${attempt}:${sourceUrl || ''}`} className={`photo-viewer__full${ready ? ' is-ready' : ''}`} src={sourceUrl || getPictureContentUrl(photo.relativePath, quality === 'original' ? undefined : 'preview') || undefined}
            alt={photo.name} draggable={false} decoding="async" fetchPriority="high" onLoad={event => { size(event); setReady(true); }} onError={() => setError(true)} />}
          <FaceRectangles faces={faces} selectedFaceId={selectedFaceId} highlightPersonId={highlightPersonId} onSelect={onSelectFace} s={s} disabled={busy || addingFace || !ready} readOnly={readOnlyFaces} />
          {addingFace && ready && <FaceDrawing onChange={onFaceBoxChange} s={s} disabled={busy} />}
        </div>
        {!ready && <div className="photo-viewer__loading" role="status">{error ? <><span>{quality === 'original' ? s.failedOriginal : s.failedImage}</span><button type="button" className="dialog-button" onClick={() => { setError(false); setAttempt(value => value + 1); }}>{s.retry}</button></> : <><LoadingSpinner inline /><span>{quality === 'original' ? s.loadingOriginal : s.loadingPhoto}</span></>}</div>}
      </div>
      {editor && <FacePopover box={editorBox} view={view} surface={surface}>{editor}</FacePopover>}
    </div>
    <div className="photo-viewer__zoom" role="group" aria-label={s.zoom}>
      <button type="button" aria-label={s.zoomOut} title={s.zoomOut} disabled={view.scale <= 1} onClick={() => zoom.current?.zoomBy(1 / 1.5)}>−</button>
      <button type="button" className="photo-viewer__reset" aria-label={s.fitPhoto} title={s.fitPhoto} onClick={() => zoom.current?.reset()}>{Math.round(view.scale * 100)} %</button>
      <button type="button" aria-label={s.zoomIn} title={s.zoomIn} disabled={view.scale >= MAX_PHOTO_ZOOM} onClick={() => zoom.current?.zoomBy(1.5)}>＋</button>
    </div>
    <p id={hint} className="photo-viewer__hint">{addingFace ? s.drawFaceHint : s.zoomHint}</p>
  </div>;
}
