import { intlLocale } from "./i18n/languages.js";
import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { galleryWindow, miniaturePosition, miniatureScrollLeft, miniatureWindow, MINI_IMAGE_SIZE, MINI_ROWS, MINI_SIZE, photoPeriods } from './photoTimeline.js';

export default function PhotoGallery({ photos, position, onPosition, s, language, renderGrid, renderTiny }) {
  const [draft, setDraft] = useState(position), [seeking, setSeeking] = useState(false);
  const [viewport, setViewport] = useState({ left: 0, width: 700 });
  const rail = useRef(null), timer = useRef(null), programmatic = useRef(null);
  const labels = useId();
  const years = useMemo(() => photoPeriods(photos), [photos]);
  const anchor = Math.max(0, Math.min(photos.length - 1, draft));
  const yearIndex = Math.max(0, years.findIndex(group => anchor >= group.start && anchor < group.start + group.count));
  const year = years[yearIndex];
  const month = year?.months.find(group => anchor >= group.start && anchor < group.start + group.count);
  const monthName = value => value == null ? s.undated : new Intl.DateTimeFormat(intlLocale(language), { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, value, 1)));
  const miniature = miniatureWindow(photos.length, viewport.left, viewport.width);
  const page = galleryWindow(photos, position);
  const preview = galleryWindow(photos, draft);
  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const resize = () => setViewport({ left: element.scrollLeft, width: element.clientWidth });
    resize();
    const observer = new ResizeObserver(resize); observer.observe(element);
    return () => { observer.disconnect(); clearTimeout(timer.current); };
  }, []);
  useEffect(() => {
    clearTimeout(timer.current);
    setDraft(position); setSeeking(false);
  }, [position, photos]);
  useLayoutEffect(() => {
    if (!seeking) alignPosition(draft);
  }, [draft, seeking, viewport.width, photos.length]);
  function alignPosition(value) {
    const element = rail.current;
    if (!element) return;
    const left = miniatureScrollLeft(photos.length, value, element.clientWidth);
    if (Math.abs(element.scrollLeft - left) < 1) return;
    element.scrollLeft = left;
    programmatic.current = element.scrollLeft;
    setViewport({ left: element.scrollLeft, width: element.clientWidth });
  }
  function seek(value, align = true) {
    const next = Math.max(0, Math.min(photos.length - 1, Math.round(value)));
    setDraft(next); setSeeking(true); clearTimeout(timer.current);
    if (align) alignPosition(next);
    timer.current = setTimeout(() => { onPosition(next); setSeeking(false); }, 220);
  }
  if (!year) return null;
  return <div className={`photo-gallery${seeking ? ' is-seeking' : ''}`}>
    <div className="photo-timeline">
      <div className="photo-timeline__heading"><div><span>{s.timeline}</span><strong>{year.year ?? s.undated}{year.year !== null && ` · ${monthName(month?.month)}`}</strong></div>
        <span>{photos.length.toLocaleString(intlLocale(language))} {s.photos}</span></div>
      <p className="photo-timeline__hint">{s.timelineHint}</p>
      <div className="photo-timeline__sliders">
        <label><span>{s.year}<b>{year.year ?? s.undated}</b></span>
          <input type="range" aria-label={s.year} aria-valuetext={String(year.year ?? s.undated)} min="0" max={Math.max(0, years.length - 1)} step="1" value={yearIndex}
            disabled={years.length < 2} onChange={event => seek(years[Number(event.target.value)].start)} />
          <div className="photo-timeline__ticks" aria-hidden="true"><span>{years[0].year ?? s.undated}</span><span>{years.at(-1).year ?? s.undated}</span></div></label>
        <label><span>{s.month}<b>{monthName(month?.month)}</b></span>
          <input type="range" aria-label={s.month} aria-valuetext={`${monthName(month?.month)}, ${anchor - year.start + 1} / ${year.count}`}
            min="0" max={Math.max(0, year.count - 1)} step="1" value={anchor - year.start} list={`${labels}-months`}
            disabled={year.count < 2} onChange={event => seek(year.start + Number(event.target.value))} />
          <datalist id={`${labels}-months`}>{year.months.map(period => <option key={period.start} value={period.start - year.start} label={monthName(period.month)} />)}</datalist>
          <div className="photo-timeline__months">{year.months.map(period => <button key={period.start} type="button" aria-pressed={period === month} onClick={() => seek(period.start)}>{monthName(period.month)}</button>)}</div></label>
      </div>
      <div className="photo-miniatures" ref={rail} tabIndex="0" role="region" aria-label={s.miniatures} style={{ '--photo-miniature-size': `${MINI_IMAGE_SIZE}px` }}
        onKeyDown={event => {
          const step = event.key === 'ArrowRight' ? 100 : event.key === 'ArrowLeft' ? -100 : 0;
          if (step) { event.preventDefault(); seek(anchor + step); }
        }}
        onScroll={event => {
          const element = event.currentTarget;
          setViewport({ left: element.scrollLeft, width: element.clientWidth });
          if (programmatic.current !== null && Math.abs(element.scrollLeft - programmatic.current) < 1) { programmatic.current = null; return; }
          programmatic.current = null;
          seek(miniaturePosition(photos.length, element.scrollLeft, element.clientWidth), false);
        }}>
        <div className="photo-miniatures__track" style={{ width: miniature.width, height: MINI_ROWS * MINI_SIZE }}>
          {photos.slice(miniature.start, miniature.end).map((photo, index) => {
            const absolute = miniature.start + index;
            return <button key={photo.id} type="button" tabIndex={-1} title={photo.title || photo.name} aria-label={`${s.open}: ${photo.name}`}
              className={`photo-miniature${absolute >= preview.offset && absolute < preview.offset + preview.items.length ? ' is-active' : ''}`}
              style={{ left: miniature.padding + Math.floor(absolute / MINI_ROWS) * MINI_SIZE, top: (absolute % MINI_ROWS) * MINI_SIZE }} onClick={() => seek(absolute)}>
              {!seeking && renderTiny(photo)}
            </button>;
          })}
        </div>
      </div>
      <div className="photo-timeline__position"><button className="dialog-button" type="button" disabled={anchor === 0} onClick={() => seek(anchor - 100)}>{s.previous}</button>
        <span role="status">{seeking ? s.timelineSeeking : `${page.offset + 1}–${page.offset + page.items.length} / ${page.total}`}</span>
        <button className="dialog-button" type="button" disabled={page.offset + page.items.length >= photos.length} onClick={() => seek(anchor + 100)}>{s.next}</button></div>
    </div>
    <div className="photo-gallery__focus" aria-busy={seeking} inert={seeking ? true : undefined}>
      <div key={`${page.offset}-${photos[0]?.id}`} className="photo-gallery__reveal">{renderGrid(page)}</div>
    </div>
  </div>;
}
