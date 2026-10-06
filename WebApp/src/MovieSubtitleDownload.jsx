import React, { useEffect, useRef, useState } from "react";
import { obtainMovieSubtitles } from "./api/raspberryApi";
import { movieSubtitleStrings } from "./movieSubtitleStrings.js";
import "./MovieSubtitleDownload.css";

export default function MovieSubtitleDownload({ relativePath, language, disabled = false, onBusyChange, onConfigure }) {
  const s = movieSubtitleStrings(language);
  const [subtitleLanguage, setSubtitleLanguage] = useState("es");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function obtain() {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setBusy(true); onBusyChange?.(true); setError(""); setResult(null);
    try {
      const data = await obtainMovieSubtitles({ relativePath, language: subtitleLanguage });
      if (mounted.current) setResult(data);
    } catch (error) {
      if (mounted.current) {
        setError(error.code || "failed");
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) { setBusy(false); onBusyChange?.(false); }
    }
  }

  if (!relativePath) return null;
  return <section className="movie-subtitle-download" aria-label={s.title} aria-busy={busy}>
    <p>{s.hint}</p>
    <div className="movie-subtitle-download__actions">
      <label className="dialog-field"><span>{s.language}</span>
        <select value={subtitleLanguage} disabled={busy || disabled} onChange={event => { setSubtitleLanguage(event.target.value); setResult(null); setError(""); }}>
          <option value="es">Español</option><option value="ca">Català</option><option value="en">English</option>
        </select>
      </label>
      <button className="dialog-button dialog-button--accent" disabled={busy || disabled} onClick={obtain} type="button">
        {busy ? s.searching : s.title}
      </button>
    </div>
    {disabled && <p>{s.manual}</p>}
    {busy && <p role="status"><span className="tmdb-cache-spinner" aria-hidden="true" /> {s.searching}</p>}
    {error && <p className="dialog-error" role="alert">{s[error] || s.failed}</p>}
    {result && <div className="movie-subtitle-download__result" role="status">
      <strong>{s.saved}: {result.file}</strong>
      <p>{result.match === "hash" ? s.exact : s.fallback}</p>
      {result.release && <p>{result.release}</p>}
      <p>{s.restart}</p>
    </div>}
    <button className="dialog-button dialog-button--ghost" type="button" disabled={busy} onClick={onConfigure}>{s.configure}</button>
  </section>;
}
