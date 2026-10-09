import React, { useEffect, useMemo, useRef, useState } from 'react';
import { bookAwardCatalogs, bookAwardStrings, bookAwardSelectionIndex, matchAwardBooks, matchesAwardBook } from './bookAwardCatalog.js';
import { getBookDisplayCoverUrl, searchBookMetadata, getBookMetadataDetails, isMockMode } from './api/raspberryApi';
import { localizeBook } from './bookMetadata.js';
import './OscarLibrary.css';
import './AwardSelector.css';
import './BookAwardLibrary.css';
import { bookTorrentStrings } from './bookTorrentUtils.js';

// Simplified emblems, drawn to match the film award icons (not official logo artwork).
// References: pulitzer.org/article/part-1-medal-all-seasons and premioplaneta.es/el-premio.html.
export function BookAwardIcon({ award = 'pulitzer' }) {
  return <svg className={`book-award-icon book-award-icon--${award}`} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {award === 'planeta' ? <>
      <circle cx="32" cy="27" r="19" fill="currentColor" fillOpacity=".12" />
      <ellipse cx="32" cy="27" rx="10" ry="19" transform="rotate(-30 32 27)" />
      <path d="M14 22c10 8 24 10 36 9M19 12c4 7 16 12 31 12M14 33c7 8 19 11 29 10" strokeWidth="1.4" />
      <ellipse cx="32" cy="27" rx="30" ry="8" transform="rotate(-28 32 27)" strokeWidth="3" />
      <path d="M28 46v7h8v-7M22 54h20l4 6H18l4-6Z" fill="currentColor" />
    </> : <>
      <circle cx="32" cy="32" r="28" fill="currentColor" fillOpacity=".12" strokeWidth="2.5" />
      <circle cx="32" cy="32" r="23" strokeWidth="1" />
      <path d="M19 48c1-6 7-6 9-10l-3-5c-4-2-5-6-4-10 1-6 6-10 12-10 7 0 11 4 11 10l-2 4 4 5-5 2-1 6-6 1-1 4 9 5H20Z" fill="currentColor" stroke="none" />
      <path d="M29 17c-6 3-7 8-4 12m3-9c-3 3-3 6-1 8m9-4h2m-4 17-6-3" stroke="var(--award-cutout, #172228)" strokeWidth="1.6" />
      <path d="m13 27 1-2m-2 8v-2m2 8-1-2m38-10-1-2m2 8v-2m-2 8 1-2" strokeWidth="2.5" />
    </>}
  </svg>;
}
export function BookAwardSelector({ value, onChange, language }) {
  const t = bookAwardStrings(language);
  return <div className="award-selector book-award-selector" role="group" aria-label={t.selector}>
    {Object.keys(bookAwardCatalogs).map(award => <button key={award} type="button" aria-pressed={value === award} className={value === award ? 'is-active' : ''} onClick={() => onChange(award)}><BookAwardIcon award={award} /><span>{t[award]}</span></button>)}
  </div>;
}

// Successful metadata survives switching awards, without persisting failed requests.
const metadataCache = new Map();
export default function BookAwardLibrary({ award = 'pulitzer', books = [], language = 'es', edition, onEditionChange, onRead, onUpload, onSearchTorrent }) {
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
    <div className="oscar-library__heading"><span className="oscar-library__eyebrow"><BookAwardIcon award={award} />{t[award]}</span><h2>{t.view}</h2><p>{t[`${award}Subtitle`]}</p><span className="oscar-library__count">{winners.filter(winner => winner.book).length} / {winners.length} {t.collection}</span></div>
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
          <span className="oscar-cover__fallback"><BookAwardIcon award={award} /><strong>{book?.name || book?.title || winner.title}</strong><span>{winner.author}</span></span>
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
      <div className="oscar-library__actions">{selected.book ? <button type="button" className="oscar-library__open" onClick={() => onRead(selected.book)}>{t.open}</button> : <>
        <button type="button" className="oscar-library__open" onClick={() => onUpload(selected)}>{t.upload}</button>
        <button type="button" className="oscar-library__open" onClick={() => onSearchTorrent({ ...selected, award, metadata: metadata[cacheKey] })}>{bookTorrentStrings(language).search}</button>
      </>}</div>
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
