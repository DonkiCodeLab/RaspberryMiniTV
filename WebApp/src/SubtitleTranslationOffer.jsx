import { createPortal } from "react-dom";
import { lockBodyScroll } from "./bodyScrollLock.js";
import LoadingSpinner from "./LoadingSpinner.jsx";
import { movieSubtitleStrings } from "./movieSubtitleStrings.js";
import React, { useEffect, useId, useRef, useState } from "react";
import { subtitleLabel } from "./browserSubtitles.js";
import { canTranslateSubtitle, translationSources } from "./subtitleTranslation.js";
import { subtitleTranslationStrings } from "./subtitleTranslationStrings.js";
import LanguageSelector from "./LanguageSelector.jsx";
import { LANGUAGES, normalizeLanguage } from "./i18n/languages.js";
import { normalizeSubtitleLanguage } from "./subtitleLanguages.js";
import { message } from "./i18n/index.js";

export function SubtitleTranslationAction({ track, language, busy, onTranslate }) {
  if (!track.available) return null;
  return <button type="button" className="dialog-button dialog-button--ghost movie-subtitle-download__small-button"
    disabled={busy} aria-haspopup="dialog" onClick={() => onTranslate(track)}>{subtitleTranslationStrings(language).translate}</button>;
}

export function SubtitleTranslationDialog({ track, language, busy, status, error, result, onTranslate, onClose }) {
  const [target, setTarget] = useState(() => {
    const active = normalizeLanguage(language);
    return active !== normalizeSubtitleLanguage(track.language) ? active : LANGUAGES.find(item => item.id !== active).id;
  });
  const card = useRef(null);
  const close = useRef(null);
  const titleId = useId();
  const s = subtitleTranslationStrings(language);
  useEffect(() => {
    const previous = document.activeElement;
    const release = lockBodyScroll();
    close.current?.focus();
    return () => { release(); previous?.focus(); };
  }, []);
  function keydown(event) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key !== "Tab") return;
    const nodes = [...card.current.querySelectorAll('button:not(:disabled), [tabindex="0"]')].filter(node => node.getClientRects().length);
    const first = nodes[0], last = nodes.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return createPortal(<div className="modal-backdrop subtitle-translation-backdrop" onKeyDown={keydown}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={card} className="dialog-card subtitle-translation-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="dialog-card__header"><h2 id={titleId}>{s.translate}</h2>
        <button ref={close} disabled={busy} type="button" className="dialog-card__close" aria-label={message("Close", language)} onClick={onClose}>×</button>
      </div>
      <p>{subtitleLabel(track, 0, language)}</p>
      <div className="dialog-field"><span>{message("Select the language", language)}</span>
        <LanguageSelector value={target} displayLanguage={language} ariaLabel={message("Select the language", language)} disabled={busy} onChange={setTarget} />
      </div>
      <p>{s.translationHint}</p>
      <button type="button" className="dialog-button dialog-button--accent" disabled={busy || normalizeSubtitleLanguage(track.language) === target}
        onClick={() => onTranslate(track.id, target)}>{s.translate}</button>
      {busy && <p role="status"><LoadingSpinner inline /> {status?.state === "waiting" ? s.translateWaiting : s.translating}
        {status?.total > 0 && <> · {s.translatedCues}: {status.done}/{status.total}</>}
      </p>}
      {error && <p className="dialog-error" role="alert">{s[error] || movieSubtitleStrings(language)[error] || s.SUBTITLE_TRANSLATION_FAILED}</p>}
      {result?.match === "ai" && <div role="status"><strong>{movieSubtitleStrings(language).saved}: {result.file}</strong><p>{s.translationSaved}</p><p>{movieSubtitleStrings(language).restart}</p></div>}
    </div>
  </div>, document.body);
}

export default function SubtitleTranslationOffer({ tracks, missingLanguages, targetLanguage, language, busy, onTranslate }) {
  const [source, setSource] = useState("");
  if (!canTranslateSubtitle(missingLanguages, targetLanguage, tracks)) return null;
  const candidates = translationSources(tracks, targetLanguage);
  const selected = candidates.some(track => track.id === source) ? source : candidates[0].id;
  const s = subtitleTranslationStrings(language);
  return <div className="movie-subtitle-download__translation">
    <label className="dialog-field"><span>{s.translateSource}</span>
      <select value={selected} disabled={busy} onChange={event => setSource(event.target.value)}>
        {candidates.map((track, index) => <option key={track.id} value={track.id}>{subtitleLabel(track, index, language)}</option>)}
      </select>
    </label>
    <button type="button" className="dialog-button dialog-button--accent" disabled={busy} onClick={() => onTranslate(selected)}>{s.translate}</button>
    <p>{s.translationHint}</p>
  </div>;
}
