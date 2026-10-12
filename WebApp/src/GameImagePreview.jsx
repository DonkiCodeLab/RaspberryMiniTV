import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./GameImagePreview.css";

function ImageDialog({ images, initialIndex, t, onClose }) {
  const dialog = useRef(null);
  const [index, setIndex] = useState(initialIndex);
  const selectedIndex = Math.min(index, images.length - 1);
  const { src, alt } = images[selectedIndex];
  const changeImage = direction => setIndex(current =>
    (Math.min(current, images.length - 1) + direction + images.length) % images.length);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  return createPortal(<dialog ref={dialog} className="game-image-dialog" aria-label={alt}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (event.key === "Escape") event.stopPropagation();
      if (images.length > 1 && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        event.stopPropagation();
        changeImage(event.key === "ArrowLeft" ? -1 : 1);
      }
    }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="game-image-dialog__content">
      <div className="game-image-dialog__header">
        <span>{alt}</span>
        <button type="button" autoFocus onClick={onClose} aria-label={t("close")}>
          {t("close")} ×
        </button>
      </div>
      <img src={src} alt={alt} />
      {images.length > 1 && <div className="game-image-dialog__navigation">
        <button type="button" onClick={() => changeImage(-1)} aria-label={t("prev_image")}>‹</button>
        <span aria-live="polite" aria-atomic="true">{selectedIndex + 1} / {images.length}</span>
        <button type="button" onClick={() => changeImage(1)} aria-label={t("next_image")}>›</button>
      </div>}
    </div>
  </dialog>, document.body);
}

export default function GameImagePreview({ src, alt, loading, t, images }) {
  const [open, setOpen] = useState(false);
  const gallery = images?.length ? images : [{ src, alt }];
  return <>
    <button className="game-image-preview" type="button" aria-label={`${t("games_enlarge_image")}: ${alt}`}
      title={t("games_enlarge_image")} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <img src={src} alt={alt} loading={loading} />
    </button>
    {open && <ImageDialog images={gallery} initialIndex={Math.max(0, gallery.findIndex(image => image.src === src))}
      t={t} onClose={() => setOpen(false)} />}
  </>;
}
