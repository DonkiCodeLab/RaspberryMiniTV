import React, { useEffect, useRef, useState } from "react";
import { getSubtitleSettings, saveSubtitleSettings } from "./api/raspberryApi";
import { movieSubtitleStrings } from "./movieSubtitleStrings.js";
import "./OpenSubtitlesSettings.css";

export default function OpenSubtitlesSettings({ language, sectionRef }) {
  const s = movieSubtitleStrings(language);
  const [settings, setSettings] = useState(null);
  const [credentials, setCredentials] = useState({ apiKey: "", username: "", password: "" });
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const mounted = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getSubtitleSettings(controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setSettings(data);
      // Only the username and presence of secrets are returned by the API.
      setCredentials({ apiKey: "", username: data.username || "", password: "" });
    }).catch(() => {
      if (!controller.signal.aborted) setError("settingsLoadFailed");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [loadAttempt]);

  function updateCredential(field, value) {
    setCredentials(current => ({ ...current, [field]: value }));
    setSaved(false);
    setError("");
  }

  async function saveAccount(event) {
    event.preventDefault();
    if (inFlight.current || loading || !settings || settings.demo) return;
    inFlight.current = true;
    setSaving(true); setError(""); setSaved(false);
    try {
      const updates = { username: credentials.username };
      // Empty secret fields retain the values already stored on the Raspberry.
      if (credentials.apiKey) updates.apiKey = credentials.apiKey;
      if (credentials.password) updates.password = credentials.password;
      const data = await saveSubtitleSettings(updates);
      if (mounted.current) {
        setSettings(data);
        setCredentials({ apiKey: "", username: data.username || "", password: "" });
        setSaved(true);
      }
    } catch (error) {
      if (mounted.current) setError(error.code || "settingsSaveFailed");
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  const disabled = loading || saving || !settings || settings.demo;
  return <article id="opensubtitles-settings" ref={sectionRef} tabIndex={-1}
    className="raspberry-tmdb-card opensubtitles-settings" aria-labelledby="opensubtitles-settings-title" aria-busy={loading || saving}>
    <div className="raspberry-tmdb-card__header">
      <h3 id="opensubtitles-settings-title">{s.settingsTitle}</h3>
      <span>{s.setup} <a href="https://opensubtitles.tawk.help/article/getting-started" target="_blank" rel="noreferrer">{s.help}</a></span>
    </div>
    <form className="raspberry-tmdb-card__form opensubtitles-settings__form" onSubmit={saveAccount}>
      <label><span>{s.apiKey}</span><input type="password" value={credentials.apiKey} disabled={disabled} maxLength={1024}
        required={!settings?.hasApiKey} autoComplete="off" placeholder={settings?.hasApiKey ? s.keep : ""}
        onChange={event => updateCredential("apiKey", event.target.value)} /></label>
      <label><span>{s.username}</span><input value={credentials.username} disabled={disabled} maxLength={1024} required autoComplete="username"
        onChange={event => updateCredential("username", event.target.value)} /></label>
      <label><span>{s.password}</span><input type="password" value={credentials.password} disabled={disabled} maxLength={1024}
        required={!settings?.hasPassword} autoComplete="current-password" placeholder={settings?.hasPassword ? s.keep : ""}
        onChange={event => updateCredential("password", event.target.value)} /></label>
      <button disabled={disabled} type="submit">{saving ? s.saving : s.save}</button>
    </form>
    {loading && <span role="status">{s.settingsLoading}</span>}
    {settings?.demo && <span>{s.SUBTITLE_DEMO}</span>}
    {error && <span className="dialog-error" role="alert">{s[error] || s.settingsSaveFailed}</span>}
    {!loading && !settings && <button className="dialog-button" type="button" onClick={() => setLoadAttempt(value => value + 1)}>{s.retry}</button>}
    {saved && <span className="raspberry-tmdb-card__status" role="status">{s.configured}</span>}
  </article>;
}
