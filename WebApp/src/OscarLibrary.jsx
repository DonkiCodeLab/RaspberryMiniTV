import React, { useEffect, useMemo, useRef, useState } from 'react';
import seed from '../../DeviceApp/data/oscar_best_picture.json';
import { getOscarCatalog, prepareOscarCatalog, oscarImageUrl, isMockMode } from './api/raspberryApi';
import { matchOscarMovies, oscarSelectionIndex, oscarStrings } from './oscarCatalog';
import './OscarLibrary.css';

export function OscarIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M8 3h8v5a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 12v6m-4 3h8m-9 0v-3h10v3" /></svg>;
}

export default function OscarLibrary({ movies, language, edition, onEditionChange, onOpenMovie }) {
  const words = oscarStrings[language.split('-')[0]] || oscarStrings.es;
  const mock = isMockMode();
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const range = useRef(null);

  useEffect(() => {
    if (mock) { setLoading(false); return; }
    let disposed = false;
    let timer;
    setLoading(true);
    setError('');
    async function read() {
      try {
        const data = await getOscarCatalog(language);
        if (disposed) return;
        setCatalog(data);
        setLoading(false);
        if (data.status.pending || data.status.running) timer = setTimeout(read, 2500);
      } catch (err) {
        if (!disposed) { setError(err.message || words.connection); setLoading(false); }
      }
    }
    // Read first so a missing credential never hides already saved artwork.
    (async () => {
      await read();
      if (disposed) return;
      clearTimeout(timer);
      try { await prepareOscarCatalog(); }
      catch (err) { if (!disposed) setError(err.message || words.connection); }
      if (!disposed) await read();
    })();
    return () => { disposed = true; clearTimeout(timer); };
  }, [language, attempt, mock, words.connection]);

  const winners = useMemo(() => matchOscarMovies(catalog?.winners || seed.winners, movies), [catalog, movies]);
  const index = oscarSelectionIndex(winners, edition);
  const selected = winners[index];
  const selectedName = selected.name || selected.title;
  const status = catalog?.status;
  const active = Boolean(status?.pending || status?.running);
  const progress = status?.jobs?.[status.current]?.progress;
  const currentWinner = winners.find(winner => `movie/${winner.tmdbId}` === status?.current);
  const preparingCovers = progress?.phase === 'collection';
  const progressLabel = preparingCovers
    ? `${words.preparingCovers} · ${progress.completed} / ${progress.total}`
    : `${words.preparing} · ${status?.complete || 0} / ${winners.length}`;
  const choose = (nextIndex) => onEditionChange(winners[Math.max(0, Math.min(winners.length - 1, nextIndex))].edition);
  const posterFor = winner => mock ? winner.movie?.posterImage : oscarImageUrl(winner.posterPath);
  const backdrop = mock ? '' : oscarImageUrl(selected.backdropPath, 1280);
  const decadeIndices = winners.flatMap((winner, i) =>
    i === 0 || i === winners.length - 1 || (winner.ceremonyYear % 10 === 0 && winner.ceremonyYear !== winners[i - 1]?.ceremonyYear) ? [i] : []);

  return <section className="oscar-library" aria-label={words.eyebrow}>
    {backdrop && <div className="oscar-library__backdrop" key={backdrop} style={{ backgroundImage: `url("${backdrop}")` }} aria-hidden="true" />}
    <div className="oscar-library__heading">
      <span className="oscar-library__eyebrow"><OscarIcon /> {words.eyebrow}</span>
      <h2>{words.title}</h2>
      <p>{words.subtitle}</p>
      <span className="oscar-library__count">{winners.filter(winner => winner.movie).length} / {winners.length} {words.collection}</span>
    </div>
    <div className="oscar-library__stage"
      onPointerDown={event => { if (event.button === 0) { drag.current = { x: event.clientX, index }; suppressClick.current = false; } }}
      onPointerMove={event => {
        if (!drag.current) return;
        const distance = event.clientX - drag.current.x;
        if (Math.abs(distance) > 15) { suppressClick.current = true; choose(drag.current.index - Math.round(distance / 75)); }
      }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      onPointerLeave={() => { drag.current = null; }}>
      <span className="oscar-library__ghost-year" aria-hidden="true">{selected.ceremonyYear}</span>
      {winners.map((winner, i) => {
        const offset = i - index;
        const distance = Math.abs(offset);
        const focused = offset === 0;
        const near = distance <= 5;
        const poster = near ? posterFor(winner) : '';
        return <button type="button" key={winner.edition}
          className={`oscar-cover${focused ? ' is-selected' : ''}${winner.movie ? ' is-available' : ''}`}
          style={{ '--offset': Math.max(-6, Math.min(6, offset)), '--scale': focused ? 1 : Math.max(.38, .72 - distance * .095), zIndex: 10 - Math.min(6, distance), opacity: distance > 4 ? 0 : focused ? 1 : Math.max(.3, .85 - distance * .12), visibility: near ? 'visible' : 'hidden' }}
          tabIndex={focused ? 0 : -1} aria-hidden={!near}
          aria-label={`${winner.ceremonyYear}, ${words.edition} ${winner.edition}: ${winner.name || winner.title}. ${winner.movie ? words.available : words.unavailable}`}
          onClick={() => {
            if (suppressClick.current) { suppressClick.current = false; return; }
            if (focused && winner.movie) onOpenMovie(winner.movie.id);
            else { choose(i); range.current?.focus({ preventScroll: true }); }
          }}>
          <span className="oscar-cover__fallback"><OscarIcon /><strong>{winner.name || winner.title}</strong><span>{winner.releaseYear}</span></span>
          {poster && <img key={poster} src={poster} alt="" draggable="false" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} />}
          <span className="oscar-cover__year">{winner.ceremonyYear}</span>
          {winner.movie && <span className="oscar-cover__available" aria-hidden="true">✓</span>}
        </button>;
      })}
    </div>
    <div className="oscar-library__selection" aria-live="polite" aria-atomic="true">
      <span className="oscar-library__award">{words.award} · {selected.ceremonyYear} <span> / {words.edition} {selected.edition}</span></span>
      <h3>{selectedName}</h3>
      <div className="oscar-library__facts"><span>{selected.releaseYear}</span>{selected.runtime > 0 && <span>{selected.runtime} min</span>}{selected.voteAverage > 0 && <span>★ {selected.voteAverage.toFixed(1)}</span>}</div>
      <button type="button" className="oscar-library__open" disabled={!selected.movie} onClick={() => selected.movie && onOpenMovie(selected.movie.id)}>
        <span aria-hidden="true">{selected.movie ? '▶' : '○'}</span> {selected.movie ? words.open : words.unavailable}
      </button>
    </div>
    <div className="oscar-library__navigation">
      <button type="button" onClick={() => choose(index - 1)} disabled={index === 0} aria-label={words.previous}>←</button>
      <div className="oscar-library__timeline">
        <label htmlFor="oscar-year"><span>{words.ceremony}</span><output>{selected.ceremonyYear}</output></label>
        <input ref={range} id="oscar-year" type="range" min="0" max={winners.length - 1} step="1" value={index}
          aria-label={words.timeline} aria-valuetext={`${selected.ceremonyYear}, ${words.edition} ${selected.edition}, ${selectedName}`}
          style={{ '--progress': `${index / (winners.length - 1) * 100}%` }} onChange={event => choose(Number(event.target.value))} />
        <div className="oscar-library__ticks" aria-hidden="true">{decadeIndices.map(i => <span key={i} style={{ left: `${i / (winners.length - 1) * 100}%` }}>{winners[i].ceremonyYear}</span>)}</div>
      </div>
      <button type="button" onClick={() => choose(index + 1)} disabled={index === winners.length - 1} aria-label={words.next}>→</button>
    </div>
    {(loading || active || status?.failed > 0 || error || mock) && <div className="oscar-library__status" role="status">
      {mock ? words.preview : error || (loading ? words.loading : active ? progressLabel : words.failed)}
      {active && <progress max={preparingCovers ? progress.total : winners.length} value={preparingCovers ? progress.completed : status.complete} aria-label={preparingCovers ? words.preparingCovers : words.preparing} />}
      {active && !preparingCovers && currentWinner && <span>{currentWinner.name || currentWinner.title}{progress?.total > 0 ? ` · ${progress.completed} / ${progress.total} ${words.images}` : ''}</span>}
      {!active && !mock && (error || status?.failed > 0) && <button type="button" onClick={() => setAttempt(value => value + 1)}>{words.retry}</button>}
    </div>}
    <footer className="oscar-library__footer"><div><strong>{words.permanent}</strong><span>{words.saved}</span></div><a href="https://www.oscars.org/oscars/ceremonies" target="_blank" rel="noreferrer">{words.source} ↗</a></footer>
  </section>;
}
