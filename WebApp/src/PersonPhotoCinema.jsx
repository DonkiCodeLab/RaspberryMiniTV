import React, { useId, useMemo, useRef } from 'react';
import { dateLabel, photoDateValue } from './photoMetadata.js';
import { photoAgeLabel, personPhotoScrollLabel, personPhotoYearTicks } from './photoPersonTimeline.js';
import { UNKNOWN_PERSON_ID } from './photoLibrary.js';
import './PersonPhotoCinema.css';

export function PersonPhotoViewControl({ value, onChange, s }) {
  return <div className="person-photo-view" role="group" aria-label={s.personPhotoView}>
    <button type="button" aria-pressed={value === 'mosaic'} onClick={() => onChange('mosaic')}>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 2h6v6H2zm10 0h6v6h-6zM2 12h6v6H2zm10 0h6v6h-6z" /></svg>{s.personPhotoMosaic}
    </button>
    <button type="button" aria-pressed={value === 'cinema'} onClick={() => onChange('cinema')}>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3h10v14H5zM0 6h3v8H0zm17 0h3v8h-3z" /></svg>{s.personPhotoCinema}
    </button>
  </div>;
}

export default function PersonPhotoCinema({ photos, person, index, onIndexChange, onOpen, renderImage, language, s, direction, onDirectionChange }) {
  const rangeId = useId(), headingId = useId(), hintId = useId();
  const range = useRef(null), drag = useRef(null), suppressClick = useRef(false);
  const ticks = useMemo(() => personPhotoYearTicks(photos), [photos]);
  if (!photos.length) return null;
  const selected = photos[index], lastIndex = photos.length - 1;
  const year = personPhotoScrollLabel(selected);
  const age = photoAgeLabel(person.id === UNKNOWN_PERSON_ID ? null : person.birthDate, selected.takenAt, s);
  const date = dateLabel(photoDateValue(selected.takenAt), language, s.undated);
  const choose = next => onIndexChange(Math.max(0, Math.min(lastIndex, next)));
  const focusRange = () => range.current?.focus({ preventScroll: true });
  const first = Math.max(0, index - 4);
  const finishDrag = event => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <section className="person-photo-cinema" aria-labelledby={headingId}>
    <header className="person-photo-cinema__heading">
      <span>{s.personPhotoStory}</span>
      <h2 id={headingId}>{person.name}</h2>
      <p id={hintId}>{s.personPhotoCinemaHint}</p>
    </header>
    <div className="person-photo-cinema__stage" onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      choose(event.key === 'Home' ? 0 : event.key === 'End' ? lastIndex : index + (event.key === 'ArrowRight' ? 1 : -1));
      focusRange();
    }} onPointerDown={event => {
      if (event.button !== 0 || !event.isPrimary) return;
      drag.current = { x: event.clientX, y: event.clientY, index, pointerId: event.pointerId };
      suppressClick.current = false;
    }} onPointerMove={event => {
      const start = drag.current;
      if (!start || start.pointerId !== event.pointerId) return;
      const distance = event.clientX - start.x;
      if (!suppressClick.current && Math.abs(event.clientY - start.y) > Math.max(14, Math.abs(distance))) { drag.current = null; return; }
      if (Math.abs(distance) < 14 && !suppressClick.current) return;
      if (!suppressClick.current) {
        event.currentTarget.setPointerCapture(event.pointerId);
        focusRange();
      }
      suppressClick.current = true;
      choose(start.index - Math.round(distance / 75));
    }} onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={() => { drag.current = null; }}
      onPointerLeave={() => { if (!suppressClick.current) drag.current = null; }}>
      <span className="person-photo-cinema__ghost-year" aria-hidden="true">{year === '—' ? '' : year}</span>
      {photos.slice(first, index + 5).map((photo, localIndex) => {
        const photoIndex = first + localIndex, offset = photoIndex - index, distance = Math.abs(offset), focused = offset === 0;
        return <button type="button" key={photo.id} className={`person-photo-cinema__frame${focused ? ' is-selected' : ''}`}
          style={{ '--offset': offset, '--scale': focused ? 1 : .78 - distance * .08, '--tilt': `${Math.sign(offset) * -18}deg`, zIndex: 5 - distance, opacity: distance > 3 ? 0 : focused ? 1 : .8 - distance * .15, pointerEvents: distance > 3 ? 'none' : undefined }}
          tabIndex={focused ? 0 : -1} aria-hidden={distance > 3} aria-current={focused ? 'true' : undefined}
          aria-label={`${focused ? s.open : s.select}: ${photo.title || photo.name}, ${dateLabel(photoDateValue(photo.takenAt), language, s.undated)}`}
          onClick={event => {
            if (suppressClick.current && event.detail > 0) { suppressClick.current = false; return; }
            suppressClick.current = false;
            if (focused) onOpen(index);
            else { choose(photoIndex); focusRange(); }
          }}>
          {renderImage(photo, focused)}
          <span className="person-photo-cinema__frame-date">{dateLabel(photoDateValue(photo.takenAt), language, s.undated)}</span>
          {focused && <span className="person-photo-cinema__enlarge" aria-hidden="true">↗</span>}
        </button>;
      })}
    </div>
    <div className="person-photo-cinema__selection" aria-live="polite" aria-atomic="true">
      <span>{s.personPhotoAge}</span>
      <h3>{age || s.personPhotoAgeUnknown}</h3>
      <p><time dateTime={photoDateValue(selected.takenAt) || undefined}>{date}</time><span aria-hidden="true"> · </span>{index + 1} / {photos.length}</p>
    </div>
    <div className="person-photo-cinema__navigation">
      <button type="button" disabled={index === 0} aria-label={s.previous} onClick={() => choose(index - 1)}>←</button>
      <div className="person-photo-cinema__timeline">
        <label htmlFor={rangeId}><span>{s.personPhotoBrowseYear}</span><output htmlFor={rangeId}>{year === '—' ? s.undated : year}</output></label>
        <input ref={range} id={rangeId} type="range" min="0" max={Math.max(1, lastIndex)} step="1" value={index} disabled={!lastIndex}
          aria-describedby={hintId} aria-valuetext={`${date}, ${age || s.personPhotoAgeUnknown}, ${index + 1} / ${photos.length}`}
          style={{ '--progress': `${lastIndex ? index / lastIndex * 100 : 0}%` }} onChange={event => choose(Number(event.target.value))} />
        <div className="person-photo-cinema__ticks" aria-hidden="true">{ticks.map(tick => <span key={tick.index} style={{ left: `${tick.position * 100}%` }}>{tick.label}</span>)}</div>
      </div>
      <button type="button" disabled={index === lastIndex} aria-label={s.next} onClick={() => choose(index + 1)}>→</button>
    </div>
    <footer className="person-photo-cinema__footer">
      <button type="button" onClick={() => onOpen(index)}>{s.enlargePhoto} <span aria-hidden="true">↗</span></button>
      <button type="button" onClick={() => onDirectionChange(direction === 'asc' ? 'desc' : 'asc')}
        aria-label={`${s.sortOrder}: ${direction === 'asc' ? s.oldestFirst : s.newestFirst}`}>
        <span aria-hidden="true">{direction === 'asc' ? '↑' : '↓'}</span> {direction === 'asc' ? s.oldestFirst : s.newestFirst}
      </button>
    </footer>
  </section>;
}
