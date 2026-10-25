import React, { useEffect, useRef } from 'react';
import { SPECIAL_FOLDERS } from './photoLibrary.js';
import PhotoIcon from './PhotoIcon.jsx';
import './PhotoSectionCarousel.css';

export default function PhotoSectionCarousel({ section, onChange, s }) {
  const rail = useRef(null);
  useEffect(() => {
    const item = rail.current?.querySelector(`[data-photo-section="${section}"]`);
    if (item) rail.current.scrollTo({
      left: item.offsetLeft - rail.current.offsetLeft - (rail.current.clientWidth - item.clientWidth) / 2,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }, [section]);

  function step(delta) {
    const index = SPECIAL_FOLDERS.indexOf(section);
    onChange(SPECIAL_FOLDERS[(index + delta + SPECIAL_FOLDERS.length) % SPECIAL_FOLDERS.length]);
  }

  return <nav className="console-navigation photo-section-navigation" aria-label={s.root}>
    <button type="button" aria-label={s.previousSection} onClick={() => step(-1)}>‹</button>
    <div className="console-rail" ref={rail}>
      {SPECIAL_FOLDERS.map(id => {
        const label = id === 'albums' ? s.personalAlbums : s[id];
        return <button type="button" key={id} data-photo-section={id}
          className={id === section ? 'active' : ''} aria-pressed={id === section}
          onClick={() => onChange(id)} title={label}>
          <PhotoIcon type={id} /><span>{label}</span>
        </button>;
      })}
    </div>
    <button type="button" aria-label={s.nextSection} onClick={() => step(1)}>›</button>
  </nav>;
}
