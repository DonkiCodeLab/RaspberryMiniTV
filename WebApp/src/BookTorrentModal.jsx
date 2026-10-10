import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getBookMetadataDetails, searchBookMetadata, isMockMode } from './api/raspberryApi';
import { matchesAwardBook } from './bookAwardCatalog.js';
import { awardTorrentBook, bookTorrentStrings } from './bookTorrentUtils.js';
import { MediaTorrentSearch } from './TorrentDownloads.jsx';
import { bookLanguageName } from './bookMetadata.js';
import './BookTorrentModal.css';

export default function BookTorrentModal({ winner, language, onClose, onStarted, onDashboard }) {
  const t = bookTorrentStrings(language);
  const [initialBook] = useState(() => awardTorrentBook(winner));
  const [query, setQuery] = useState(() => initialBook?.spanishTitle || `${winner.title} ${winner.author}`);
  const [results, setResults] = useState([]);
  const [detail, setDetail] = useState(initialBook);
  const [spanishTitle, setSpanishTitle] = useState(initialBook?.spanishTitle || '');
  const [media, setMedia] = useState(initialBook);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(null);
  const dialog = useRef(null);
  const close = useRef(null);
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;

  function begin() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError(''); setMedia(null); setDetail(null);
    return controller;
  }
  async function select(result, controller = begin()) {
    try {
      // A verified Spanish title is enough to start; do not wait for another metadata request.
      const ready = awardTorrentBook(winner, result);
      if (ready) {
        setDetail(ready); setSpanishTitle(ready.spanishTitle); setQuery(ready.spanishTitle); setResults([]); setMedia(ready);
        return;
      }
      const response = await getBookMetadataDetails(result, { signal: controller.signal, language: 'es' });
      if (controller.signal.aborted) return;
      const book = { ...(result.originalMetadata || result), ...response.item };
      const readyBook = awardTorrentBook(winner, book);
      const title = readyBook?.spanishTitle || '';
      setDetail(book); setSpanishTitle(title); setResults([]);
      if (readyBook) { setQuery(title); setMedia(readyBook); }
    } catch (e) { if (!controller.signal.aborted) setError(e.message); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  async function search(automatic = false) {
    const controller = begin();
    if (isMockMode()) { setLoading(false); return; }
    try {
      if (automatic && winner.metadata?.openLibraryKey) return await select(winner.metadata, controller);
      const response = await searchBookMetadata(query, 'es', { signal: controller.signal });
      if (controller.signal.aborted) return;
      const items = response.items || [];
      setResults(items);
      const exact = automatic ? items.find(book => matchesAwardBook(winner, book)) : null;
      if (exact) await select(exact, controller);
    } catch (e) { if (!controller.signal.aborted) setError(e.message); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    close.current?.focus();
    function keydown(event) {
      if (event.key === 'Escape') { event.preventDefault(); closeHandler.current(); }
      if (event.key !== 'Tab') return;
      const nodes = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')].filter(node => node.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', keydown);
    if (!initialBook) search(true);
    return () => { request.current?.abort(); document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, []);

  return createPortal(<div className="modal-backdrop modal-backdrop--tmdb-browser">
    <div ref={dialog} className="dialog-card dialog-card--tmdb-browser book-torrent-modal" role="dialog" aria-modal="true" aria-labelledby="book-torrent-title">
      <div className="dialog-card__header"><h2 id="book-torrent-title">{t.title}</h2><button ref={close} className="dialog-card__close" type="button" onClick={onClose} aria-label={t.close}>×</button></div>
      <p>{t.original}: <strong>{winner.title}</strong> · {winner.author}</p>
      {isMockMode() ? <p role="status">{t.demo}</p> : <>
        {!detail && <form className="book-torrent-modal__search" onSubmit={event => { event.preventDefault(); search(); }}>
          <label className="dialog-field"><span>{t.query}</span><input value={query} maxLength={200} onChange={event => setQuery(event.target.value)} /></label>
          <button className="dialog-button" type="submit" disabled={loading || !query.trim()}>{t.lookup}</button>
        </form>}
        {loading && <p role="status">{t.loading}</p>}
        {error && <p className="dialog-error" role="alert">{error}</p>}
        {!loading && !detail && <p>{t.missing}</p>}
        {results.length > 0 && <div className="book-torrent-modal__results">{results.map(result => <button type="button" className="dialog-button dialog-button--ghost" key={`${result.openLibraryKey}:${result.editionKey}`} disabled={loading} onClick={() => select(result)}><strong>{result.title}</strong><span>{result.author} · {result.language || '—'}</span><span>{t.choose}</span></button>)}</div>}
        {detail && <>
          <div className="book-torrent-modal__details">
            {detail.coverUrl && <img src={detail.coverUrl} alt="" onError={event => { event.currentTarget.hidden = true; }} />}
            <div><h3>{spanishTitle || detail.title}</h3><p>{detail.author}</p><p>{[detail.publisher, detail.year, bookLanguageName(detail.language, language)].filter(Boolean).join(' · ')}</p><p className="book-torrent-modal__synopsis">{detail.localizedMetadata?.es?.description || detail.description || t.noSynopsis}</p>
              {(detail.editionKey || detail.openLibraryKey) && <a href={`https://openlibrary.org${detail.editionKey || detail.openLibraryKey}`} target="_blank" rel="noreferrer">{t.source} ↗</a>}
            </div>
          </div>
          <form className="book-torrent-modal__search" onSubmit={event => { event.preventDefault(); if (spanishTitle.trim()) setMedia({ ...detail, name: spanishTitle.trim(), spanishTitle: spanishTitle.trim() }); }}>
            <label className="dialog-field"><span>{t.spanishTitle}</span><input value={spanishTitle} maxLength={180} onChange={event => { setSpanishTitle(event.target.value); setMedia(null); }} /></label>
            <button className="dialog-button" type="submit" disabled={!spanishTitle.trim()}>{t.confirm}</button>
            <button className="dialog-button dialog-button--ghost" type="button" onClick={() => { setDetail(null); setMedia(null); }}>{t.change}</button>
          </form>
          {media && <MediaTorrentSearch key={`${media.openLibraryKey}:${media.spanishTitle}`} media={media} mediaType="books" language={language} onStarted={onStarted} onDashboard={onDashboard} />}
        </>}
      </>}
    </div>
  </div>, document.body);
}
