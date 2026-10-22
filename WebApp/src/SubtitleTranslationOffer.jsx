import React, { useState } from "react";
import { subtitleLabel } from "./browserSubtitles.js";
import { canTranslateSubtitle, translationSources } from "./subtitleTranslation.js";
import { subtitleTranslationStrings } from "./subtitleTranslationStrings.js";
import LanguageSelector from "./LanguageSelector.jsx";
import { LANGUAGES, normalizeLanguage } from "./i18n/languages.js";
import { normalizeSubtitleLanguage } from "./subtitleLanguages.js";
import { message } from "./i18n/index.js";

export function SubtitleTranslationAction({ track, language, busy, onTranslate }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(() => {
    const active = normalizeLanguage(language);
    return active !== normalizeSubtitleLanguage(track.language) ? active
      : LANGUAGES.find(item => item.id !== active).id;
  });
  const s = subtitleTranslationStrings(language);
  if (!track.available) return null;
  return <div className="movie-subtitle-download__translate-action">
    <button type="button" className="dialog-button dialog-button--ghost" disabled={busy}
      aria-expanded={open} onClick={() => setOpen(value => !value)}>{s.translate}</button>
    {open && <div className="movie-subtitle-download__translation">
      <div className="dialog-field"><span>{message("Select the language", language)}</span>
        <LanguageSelector value={target} displayLanguage={language} ariaLabel={message("Select the language", language)}
          disabled={busy} onChange={setTarget} />
      </div>
      <button type="button" className="dialog-button dialog-button--accent"
        disabled={busy || normalizeSubtitleLanguage(track.language) === target}
        onClick={() => onTranslate(track.id, target)}>{s.translate}</button>
      <p>{s.translationHint}</p>
    </div>}
  </div>;
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
