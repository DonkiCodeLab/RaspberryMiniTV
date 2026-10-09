import React, { useEffect, useMemo, useRef, useState } from 'react';
import { bookAwardCatalogs, bookAwardStrings, bookAwardSelectionIndex, matchAwardBooks, matchesAwardBook } from './bookAwardCatalog.js';
import { getBookDisplayCoverUrl, searchBookMetadata, getBookMetadataDetails, isMockMode } from './api/raspberryApi';
import { localizeBook } from './bookMetadata.js';
import './OscarLibrary.css';
import './AwardSelector.css';
import './BookAwardLibrary.css';

export function BookAwardIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 6c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Zm0 0v15M8 2h8M10 2v2m4-2v2" /></svg>;
}
export function BookAwardSelector({ value, onChange, language }) {
  const t = bookAwardStrings(language);
  return <div className="award-selector book-award-selector" role="group" aria-label={t.selector}>
    {Object.keys(bookAwardCatalogs).map(award => <button key={award} type="button" aria-pressed={value === award} className={value === award ? 'is-active' : ''} onClick={() => onChange(award)}><BookAwardIcon /><span>{t[award]}</span></button>)}
  </div>;
}

// Successful metadata survives switching awards, without persisting failed requests.
const metadataCache = new Map();
export default function BookAwardLibrary({ award = 'pulitzer', books = [], language = 'es', edition, onEditionChange, onRead, onUpload }) {
  const catalog = bookAwardCatalogs[award];
  const t = bookAwardStrings(language);
  const [metadata, setMetadata] = useState(() => Object.fromEntries(metadataCache));
  const [status, setStatus] = useState('');
  const [attempt, setAttempt] = useState(0);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const range = useRef(null);
  const winners = useMemo(() => matchAwardBooks(catalog.winners.map(winner => ({ ...winner, openLibraryKey: metadata[`${winner.key}:${language}`]?.openLibraryKey })), books), [catalog, books, metadata, language]);
  const index = bookAwardSelectionIndex(winners, edition);
  const selected = winners[index];
  const cacheKey = `${selected.key}:${language}`;
  const details = selected.book ? localizeBook(selected.book, language) : metadata[cacheKey];
  const title = details?.name || details?.title || selected.title;
  const choose = next => onEditionChange(winners[Math.max(0, Math.min(winners.length - 1, next))].key);
  const shared = winners.filter(winner => winner.awardYear === selected.awardYear).length > 1;

  useEffect(() => {
    setStatus('');
    if (selected.book || metadataCache.has(cacheKey) || isMockMode()) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus('loading');
      try {
        const response = await searchBookMetadata(`${selected.title} ${selected.author}`, language, { signal: controller.signal });
        const result = (response.items || []).find(item => matchesAwardBook(selected, item));
        if (!result) { if (!controller.signal.aborted) setStatus('missing'); return; }
        const responseDetail = await getBookMetadataDetails(result, { signal: controller.signal, language });
        if (controller.signal.aborted) return;
        const value = localizeBook({ ...result, ...responseDetail.item }, language);
        metadataCache.set(cacheKey, value);
        setMetadata(current => ({ ...current, [cacheKey]: value }));
        setStatus('');
      } catch { if (!controller.signal.aborted) setStatus('missing'); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [cacheKey, selected.book, language, attempt]);

  const ticks = winners.flatMap((winner, i) => i === 0 || i === winners.length - 1 || (winner.awardYear % 10 === 0 && winner.awardYear !== winners[i - 1]?.awardYear) ? [i] : []);
  return <section className="oscar-library book-award-library" aria-label={t[award]}>
    <div className="oscar-library__heading"><span className="oscar-library__eyebrow"><BookAwardIcon />{t[award]}</span><h2>{t.view}</h2><p>{t[`${award}Subtitle`]}</p><span className="oscar-library__count">{winners.filter(winner => winner.book).length} / {winners.length} {t.collection}</span></div>
    <div className="oscar-library__stage" onPointerDown={event => { if (event.button === 0) { drag.current = { x: event.clientX, index }; suppressClick.current = false; } }}
      onPointerMove={event => { if (drag.current && Math.abs(event.clientX - drag.current.x) > 15) { suppressClick.current = true; choose(drag.current.index - Math.round((event.clientX - drag.current.x) / 75)); } }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}>
      <span className="oscar-library__ghost-year" aria-hidden="true">{selected.awardYear}</span>
      {winners.map((winner, i) => {
        const offset = i - index, distance = Math.abs(offset), focused = offset === 0;
        const book = winner.book ? localizeBook(winner.book, language) : metadata[`${winner.key}:${language}`];
        const cover = distance <= 5 ? getBookDisplayCoverUrl(book) : '';
        return <button key={winner.key} type="button" className={`oscar-cover${focused ? ' is-selected' : ''}${winner.book ? ' is-available' : ''}`}
          style={{ '--offset': Math.max(-6, Math.min(6, offset)), '--scale': focused ? 1 : Math.max(.38, .72 - distance * .095), zIndex: 10 - Math.min(6, distance), opacity: distance > 4 ? 0 : focused ? 1 : Math.max(.3, .85 - distance * .12), visibility: distance <= 4 ? 'visible' : 'hidden' }}
          tabIndex={focused ? 0 : -1} aria-hidden={distance > 4} aria-label={`${winner.awardYear}: ${winner.title}, ${winner.author}`}
          onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } if (focused && winner.book) onRead(winner.book); else { choose(i); range.current?.focus({ preventScroll: true }); } }}>
          <span className="oscar-cover__fallback"><BookAwardIcon /><strong>{book?.name || book?.title || winner.title}</strong><span>{winner.author}</span></span>
          {cover && <img key={cover} src={cover} alt="" draggable="false" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} />}
          <span className="oscar-cover__year">{winner.awardYear}</span>{winner.book && <span className="oscar-cover__available" aria-hidden="true">✓</span>}
        </button>;
      })}
    </div>
    <div className="oscar-library__selection" aria-live="polite" aria-atomic="true">
      <span className="oscar-library__award">{t[award]} · {selected.awardYear}{shared ? ` · ${t.shared}` : ''}</span><h3>{title}</h3>
      <div className="oscar-library__facts">{selected.author}</div>
      {title !== selected.title && <p className="book-award-library__original">{t.original}: {selected.title}</p>}
      {details?.description && <p className="book-award-library__description">{details.description}</p>}
      {!selected.book && <p className="book-award-library__original">{t.unavailable}</p>}
      <div className="oscar-library__actions">{selected.book ? <button type="button" className="oscar-library__open" onClick={() => onRead(selected.book)}>{t.open}</button> : <button type="button" className="oscar-library__open" onClick={() => onUpload(selected)}>{t.upload}</button>}</div>
    </div>
    <div className="oscar-library__navigation"><button type="button" disabled={index === 0} onClick={() => choose(index - 1)} aria-label={t.previous}>←</button>
      <div className="oscar-library__timeline"><label htmlFor="book-award-year"><span>{t.year}</span><output>{selected.awardYear}</output></label>
        <input ref={range} id="book-award-year" type="range" min="0" max={winners.length - 1} step="1" value={index} aria-label={t.timeline} aria-valuetext={`${selected.awardYear}: ${title}`} style={{ '--progress': `${index / (winners.length - 1) * 100}%` }} onChange={event => choose(Number(event.target.value))} />
        <div className="oscar-library__ticks" aria-hidden="true">{ticks.map(i => <span key={i} style={{ left: `${i / (winners.length - 1) * 100}%` }}>{winners[i].awardYear}</span>)}</div>
      </div><button type="button" disabled={index === winners.length - 1} onClick={() => choose(index + 1)} aria-label={t.next}>→</button></div>
    {status && <div className="oscar-library__status" role="status">{status === 'loading' ? t.loading : t.missingMetadata}{status === 'missing' && <button type="button" onClick={() => setAttempt(value => value + 1)}>{t.retry}</button>}</div>}
    {catalog.noAwardYears.length > 0 && <p className="award-library__scope">{t.noAward}: {catalog.noAwardYears.join(', ')}.</p>}
    <footer className="oscar-library__footer"><span>{t.coverage}: {catalog.firstYear}–{catalog.lastYear}</span><a href={selected.sourceUrl || catalog.sources[0]} target="_blank" rel="noreferrer">{t.source} ↗</a></footer>
  </section>;
}
