import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./GameImagePreview.css";

function ImageDialog({ src, alt, t, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  return createPortal(<dialog ref={dialog} className="game-image-dialog" aria-label={alt}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="game-image-dialog__content">
      <div className="game-image-dialog__header">
        <span>{alt}</span>
        <button type="button" autoFocus onClick={onClose} aria-label={t("close")}>
          {t("close")} ×
        </button>
      </div>
      <img src={src} alt={alt} />
    </div>
  </dialog>, document.body);
}

export default function GameImagePreview({ src, alt, loading, t }) {
  const [open, setOpen] = useState(false);
  return <>
    <button className="game-image-preview" type="button" aria-label={`${t("games_enlarge_image")}: ${alt}`}
      title={t("games_enlarge_image")} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <img src={src} alt={alt} loading={loading} />
    </button>
    {open && <ImageDialog src={src} alt={alt} t={t} onClose={() => setOpen(false)} />}
  </>;
}
