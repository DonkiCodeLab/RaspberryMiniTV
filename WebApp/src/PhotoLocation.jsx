import React, { Component, lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { hasLocation } from './photoLibrary.js';
import { lockBodyScroll } from './bodyScrollLock.js';
import useBrowserBack from './useBrowserBack.js';
import './PhotoLocation.css';

const PhotoLocationMap = lazy(() => import('./PhotoLocationMap.jsx'));

class MapErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="alert" className="photo-alert">{this.props.s.locationMapError}</p> : this.props.children; }
}

export function PhotoLocationDialog({ photo, s, language, previewUrl, onClose }) {
  const dialog = useRef(null), title = useId();
  useBrowserBack(onClose, 50);
  useEffect(() => {
    const element = dialog.current, previous = document.activeElement;
    element.showModal();
    const release = lockBodyScroll();
    return () => { element.close(); release(); previous?.focus?.({ preventScroll: true }); };
  }, []);
  return createPortal(<dialog ref={dialog} className="photo-location-dialog" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}>
    <header><div><span>{s.photoLocation}</span><h2 id={title}>{photo.title || photo.name}</h2></div>
      <button type="button" className="photo-location-close" aria-label={s.close} onClick={onClose}>×</button></header>
    <MapErrorBoundary s={s}><Suspense fallback={<p className="photo-location-loading" role="status">{s.loadingPhotoMap}</p>}>
      <PhotoLocationMap photo={photo} s={s} language={language} previewUrl={previewUrl} />
    </Suspense></MapErrorBoundary>
    <div className="photo-location-dialog__coordinates">⌖ {photo.latitude.toFixed(4)}°, {photo.longitude.toFixed(4)}°</div>
  </dialog>, document.body);
}

export default function PhotoLocation({ photo, s, language, previewUrl, precision = 4, className = '' }) {
  const [open, setOpen] = useState(false);
  if (!hasLocation(photo)) return <span>{`⌖ ${s.noGps}`}</span>;
  return <span className={`photo-location ${className}`}>
    <span>⌖ {photo.latitude.toFixed(precision)}°, {photo.longitude.toFixed(precision)}°</span>
    <button type="button" className="photo-location-button" aria-label={`${s.showPhotoMap}: ${photo.title || photo.name}`}
      title={s.showPhotoMap} aria-haspopup="dialog" onClick={event => { event.stopPropagation(); setOpen(true); }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15" /></svg>
    </button>
    {open && <PhotoLocationDialog photo={photo} s={s} language={language} previewUrl={previewUrl} onClose={() => setOpen(false)} />}
  </span>;
}
