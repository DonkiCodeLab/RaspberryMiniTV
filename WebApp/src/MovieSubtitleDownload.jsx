import React, { useEffect, useRef, useState } from "react";
import { getSubtitleSettings, saveSubtitleSettings, obtainMovieSubtitles } from "./api/raspberryApi";
import { movieSubtitleStrings } from "./movieSubtitleStrings.js";
import "./MovieSubtitleDownload.css";

export default function MovieSubtitleDownload({ relativePath, language, disabled = false, onBusyChange }) {
  const s = movieSubtitleStrings(language);
  const [subtitleLanguage, setSubtitleLanguage] = useState("es");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(null);
  const [configure, setConfigure] = useState(false);
  const [credentials, setCredentials] = useState({ apiKey: "", username: "", password: "" });
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [accountSaved, setAccountSaved] = useState(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    getSubtitleSettings(controller.signal).then(data => {
      if (!mounted.current) return;
      setSettings(data);
      setCredentials(current => ({ ...current, username: data.username || "" }));
    }).catch(() => { /* The action reports connection errors; manual upload stays available. */ });
    return () => { mounted.current = false; controller.abort(); };
  }, []);

  async function obtain() {
    if (inFlight.current || disabled) return;
    if (settings?.demo) { setError("SUBTITLE_DEMO"); return; }
    inFlight.current = true;
    setBusy(true); onBusyChange?.(true); setError(""); setResult(null); setAccountSaved(false);
    try {
      const data = await obtainMovieSubtitles({ relativePath, language: subtitleLanguage });
      if (mounted.current) setResult(data);
    } catch (error) {
      if (mounted.current) {
        setError(error.code || "failed");
        if (["SUBTITLE_NOT_CONFIGURED", "SUBTITLE_AUTH_FAILED", "SUBTITLE_ACCESS_DENIED"].includes(error.code)) setConfigure(true);
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) { setBusy(false); onBusyChange?.(false); }
    }
  }

  async function saveAccount(event) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true); setError(""); setAccountSaved(false);
    try {
      const updates = { username: credentials.username };
      // Secrets are never read back into the browser; blank fields retain them.
      if (credentials.apiKey) updates.apiKey = credentials.apiKey;
      if (credentials.password) updates.password = credentials.password;
      const data = await saveSubtitleSettings(updates);
      if (mounted.current) {
        setSettings(data); setCredentials({ apiKey: "", username: data.username || "", password: "" });
        setConfigure(false); setAccountSaved(true);
      }
    } catch (error) {
      if (mounted.current) setError(error.code || "failed");
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  if (!relativePath) return null;
  return <section className="movie-subtitle-download" aria-label={s.title} aria-busy={busy || saving}>
    <p>{s.hint}</p>
    <div className="movie-subtitle-download__actions">
      <label className="dialog-field"><span>{s.language}</span>
        <select value={subtitleLanguage} disabled={busy || saving || disabled} onChange={event => { setSubtitleLanguage(event.target.value); setResult(null); setError(""); }}>
          <option value="es">Español</option><option value="ca">Català</option><option value="en">English</option>
        </select>
      </label>
      <button className="dialog-button dialog-button--accent" disabled={busy || saving || disabled} onClick={obtain} type="button">
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
    {accountSaved && <p role="status">{s.configured}</p>}
    <button className="dialog-button dialog-button--ghost" type="button" disabled={busy || saving} aria-expanded={configure}
      onClick={() => { setConfigure(value => !value); setAccountSaved(false); }}>{s.configure}</button>
    {configure && (settings?.demo ? <p>{s.SUBTITLE_DEMO}</p> : <form className="movie-subtitle-download__settings" onSubmit={saveAccount}>
      <p>{s.setup} <a href="https://opensubtitles.tawk.help/article/getting-started" target="_blank" rel="noreferrer">{s.help}</a></p>
      <label className="dialog-field"><span>{s.apiKey}</span><input type="password" value={credentials.apiKey} disabled={saving} maxLength={1024}
        required={!settings?.hasApiKey} autoComplete="off" placeholder={settings?.hasApiKey ? s.keep : ""}
        onChange={event => setCredentials(current => ({ ...current, apiKey: event.target.value }))} /></label>
      <label className="dialog-field"><span>{s.username}</span><input value={credentials.username} disabled={saving} maxLength={1024} required autoComplete="username"
        onChange={event => setCredentials(current => ({ ...current, username: event.target.value }))} /></label>
      <label className="dialog-field"><span>{s.password}</span><input type="password" value={credentials.password} disabled={saving} maxLength={1024}
        required={!settings?.hasPassword} autoComplete="current-password" placeholder={settings?.hasPassword ? s.keep : ""}
        onChange={event => setCredentials(current => ({ ...current, password: event.target.value }))} /></label>
      <button className="dialog-button" disabled={saving} type="submit">{saving ? s.saving : s.save}</button>
    </form>)}
  </section>;
}
