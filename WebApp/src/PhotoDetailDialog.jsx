import React, { useLayoutEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { lockBodyScroll } from './bodyScrollLock.js';
import useBrowserBack from './useBrowserBack.js';
import './PhotoLocation.css';

export default function PhotoDetailDialog({ title, subtitle, s, busy = false, onClose, children, className = '' }) {
  const dialog = useRef(null), titleId = useId();
  const close = () => { if (!busy) onClose(); };
  useBrowserBack(close, 50);
  useLayoutEffect(() => {
    const element = dialog.current, previous = document.activeElement;
    element.showModal();
    const release = lockBodyScroll();
    return () => { element.close(); release(); if (previous?.isConnected) previous.focus?.({ preventScroll: true }); };
  }, []);
  return createPortal(<dialog ref={dialog} className={`photo-location-dialog ${className}`} aria-labelledby={titleId} aria-busy={busy}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); close(); }}
    onKeyDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) close(); }}>
    <header><div><span>{subtitle}</span><h2 id={titleId}>{title}</h2></div>
      <button type="button" className="photo-location-close" disabled={busy} aria-label={s.close} onClick={close}>×</button></header>
    {children}
  </dialog>, document.body);
}
