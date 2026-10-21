import React, { useState } from "react";
import { subtitleLabel } from "./browserSubtitles.js";
import { canTranslateSubtitle, translationSources } from "./subtitleTranslation.js";
import { subtitleTranslationStrings } from "./subtitleTranslationStrings.js";
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
