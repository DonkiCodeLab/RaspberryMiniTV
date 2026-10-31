import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { getPictureContentUrl } from './api/raspberryApi.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import { attachPhotoZoom, MAX_PHOTO_ZOOM } from './photoZoom.js';
import { photoFaceLabel } from './photoPersonTimeline.js';
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

function FaceDrawing({ onChange, s, disabled, active }) {
  const overlay = useRef(null), callback = useRef(onChange);
  const [box, setBox] = useState(null);
  callback.current = onChange;
  useEffect(() => {
    if (!disabled && active) return attachFaceDrawing(overlay.current, setBox, value => callback.current(value));
  }, [disabled, active]);
  return <div ref={overlay} className={`photo-face-drawing${disabled || !active ? ' is-inactive' : ''}`} role="group" aria-label={s.drawFaceHint}>
    {box && <span className="photo-face-box photo-face-box--draft" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }} />}
  </div>;
}

export function FaceLabel({ children, box, view }) {
  const label = useRef(null);
  useLayoutEffect(() => {
    const element = label.current, face = element.parentElement, image = face.parentElement;
    const viewport = image.closest('.photo-viewer__image') || image;
    const scale = view?.scale || 1;
    const measure = () => {
      const photo = image.getBoundingClientRect(), canvas = viewport.getBoundingClientRect();
      const bounds = {
        left: Math.max(photo.left, canvas.left) + 4, top: Math.max(photo.top, canvas.top) + 4,
        right: Math.min(photo.right, canvas.right) - 4, bottom: Math.min(photo.bottom, canvas.bottom) - 4,
      };
      const rect = face.getBoundingClientRect();
      if (bounds.right <= bounds.left || bounds.bottom <= bounds.top || rect.right < bounds.left ||
        rect.left > bounds.right || rect.bottom < bounds.top || rect.top > bounds.bottom) {
        element.style.visibility = 'hidden';
        return;
      }
      // Measure the wrapped name at a readable size, independently of photo zoom.
      element.style.maxWidth = `${Math.min(240, bounds.right - bounds.left)}px`;
      element.style.transform = `scale(${1 / scale})`;
      const width = element.offsetWidth, height = element.offsetHeight;
      const above = rect.top - height - 3;
      const top = above >= bounds.top ? above : rect.bottom + 3;
      const left = Math.max(bounds.left, Math.min(rect.left, bounds.right - width));
      const clampedTop = Math.max(bounds.top, Math.min(top, bounds.bottom - height));
      element.style.left = `${(left - rect.left) / scale - face.clientLeft}px`;
      element.style.top = `${(clampedTop - rect.top) / scale - face.clientTop}px`;
      element.style.visibility = 'visible';
    };
    const observer = new ResizeObserver(measure);
    observer.observe(image); observer.observe(viewport); observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [children, box, view]);
  return <span ref={label}>{children}</span>;
}

export function FaceRectangles({ faces = [], photo, people = [], selectedFaceId, highlightPersonId, onSelect, s, disabled = false, readOnly = false, view }) {
  const Tag = readOnly ? 'span' : 'button';
  const byId = new Map(people.map(person => [person.id, person]));
  return faces.map((face, index) => {
    const label = photoFaceLabel(face, photo, byId.get(face.personId), s);
    return face.box ? <Tag key={face.id}
    className={`photo-face-box${face.personId === highlightPersonId ? ' is-highlighted' : ''}${face.id === selectedFaceId ? ' is-selected' : ''}`}
    {...(readOnly ? { role: 'img', 'aria-label': label } : {
      type: 'button', 'aria-label': `${s.editFace}: ${label}`,
      'aria-pressed': face.id === selectedFaceId, disabled,
      onClick: event => { event.stopPropagation(); onSelect?.(face.id); },
    })}
    style={{ left: `${face.box.x * 100}%`, top: `${face.box.y * 100}%`, width: `${face.box.width * 100}%`, height: `${face.box.height * 100}%` }}>
    <FaceLabel box={face.box} view={view}>{`${index + 1} · ${label}`}</FaceLabel>
  </Tag> : null; }).filter(Boolean);
}

export default function PhotoViewerImage({ photo, quality = 'preview', sourceUrl, s, faces = [], people = [], selectedFaceId, highlightPersonId, onSelectFace, readOnlyFaces = false, addingFace = false, onAddFace, onFaceBoxChange, busy = false, editor, editorBox, onReadyChange }) {
  const [ready, setReady] = useState(false), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0, width: 1, height: 1 });
  const [drawing, setDrawing] = useState(true);
  const surface = useRef(null), zoom = useRef(null), natural = useRef(null), hint = useId();
  const image = useRef(null), shortcut = useRef(null);
  useLayoutEffect(() => { setReady(false); setError(false); }, [photo.id, photo.relativePath, quality, sourceUrl]);
  useEffect(() => { setDrawing(true); }, [addingFace, photo.id]);
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
      <div ref={surface} className={`photo-viewer__image${view.scale > 1 ? ' is-zoomed' : ''}${view.dragging ? ' is-dragging' : ''}${addingFace ? ' is-adding-face' : ''}`}
        role="group" aria-label={photo.name} aria-describedby={hint} tabIndex={0} aria-busy={!ready && !error}>
        <div ref={image} className="photo-viewer__transform" style={{ width: view.width, height: view.height,
          transform: `translate(-50%, -50%) translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})` }}>
          {quality !== 'thumb' && !sourceUrl && <img className="photo-viewer__placeholder" src={getPictureContentUrl(photo.relativePath, 'thumb') || undefined}
            onLoad={event => { if (!ready) size(event); }} draggable={false} alt="" aria-hidden="true" />}
          {!error && <img key={`${quality}:${attempt}:${sourceUrl || ''}`} className={`photo-viewer__full${ready ? ' is-ready' : ''}`} src={sourceUrl || getPictureContentUrl(photo.relativePath, quality === 'original' ? undefined : quality === 'thumb' ? 'thumb' : 'preview') || undefined}
            alt={photo.name} draggable={false} decoding="async" fetchPriority="high" onLoad={event => { size(event); setReady(true); }} onError={() => setError(true)} />}
          <FaceRectangles faces={faces} photo={photo} people={people} selectedFaceId={selectedFaceId} highlightPersonId={highlightPersonId} onSelect={onSelectFace} s={s} disabled={busy || addingFace || !ready} readOnly={readOnlyFaces} view={view} />
          {addingFace && ready && <FaceDrawing onChange={box => { onFaceBoxChange?.(box); if (box) setDrawing(false); }} s={s} disabled={busy} active={drawing} />}
        </div>
        {!ready && <div className="photo-viewer__loading" role="status">{error ? <><span>{quality === 'original' ? s.failedOriginal : s.failedImage}</span><button type="button" className="dialog-button" onClick={() => { setError(false); setAttempt(value => value + 1); }}>{s.retry}</button></> : <><LoadingSpinner inline /><span>{quality === 'original' ? s.loadingOriginal : s.loadingPhoto}</span></>}</div>}
      </div>
      {editor && <FacePopover box={editorBox} view={view} surface={surface}>{editor}</FacePopover>}
    </div>
    <div className="photo-viewer__zoom" role="group" aria-label={s.zoom}>
      <button type="button" aria-label={s.zoomOut} title={s.zoomOut} disabled={view.scale <= 1} onClick={() => zoom.current?.zoomBy(1 / 1.5)}>−</button>
      <button type="button" className="photo-viewer__reset" aria-label={s.fitPhoto} title={s.fitPhoto} onClick={() => zoom.current?.reset()}>{Math.round(view.scale * 100)} %</button>
      <button type="button" aria-label={s.zoomIn} title={s.zoomIn} disabled={view.scale >= MAX_PHOTO_ZOOM} onClick={() => zoom.current?.zoomBy(1.5)}>＋</button>
      {addingFace && <button type="button" className="photo-viewer__draw-mode" disabled={busy || !ready} onClick={() => setDrawing(value => !value)}>{drawing ? s.panPhoto : s.drawBox}</button>}
    </div>
    <p id={hint} className="photo-viewer__hint">{addingFace && drawing ? s.drawFaceHint : s.zoomHint}</p>
  </div>;
}
