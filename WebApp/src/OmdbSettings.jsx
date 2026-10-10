import React, { useEffect, useRef, useState } from "react";
import { getOmdbSettings, saveOmdbSettings, testOmdbSettings, isMockMode } from "./api/raspberryApi";
import { omdbError, omdbSettingsPayload, omdbStrings } from "./omdbRatings.js";
import "./OmdbRatings.css";
import OmdbLibraryUpdate from "./OmdbLibraryUpdate.jsx";

export default function OmdbSettings({ language }) {
  const s = omdbStrings(language);
  const [settings, setSettings] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState("load");
  const [error, setError] = useState(null);
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [settingsRevision, setSettingsRevision] = useState(0);
  const currentRequest = useRef({ generation: 0, controller: null, busy: false });
  const demo = isMockMode();
  useEffect(() => {
    const controller = new AbortController();
    const generation = ++currentRequest.current.generation;
    currentRequest.current.controller = controller;
    setBusy(demo ? "" : "load"); setError(null);
    if (!demo) getOmdbSettings(controller.signal).then(result => {
      if (!controller.signal.aborted && generation === currentRequest.current.generation) setSettings(result.settings);
    }).catch(nextError => { if (!controller.signal.aborted) setError(nextError); })
      .finally(() => { if (!controller.signal.aborted) setBusy(""); });
    return () => { currentRequest.current.generation += 1; currentRequest.current.controller?.abort(); };
  }, [attempt, demo]);

  async function act(action) {
    if (busy || currentRequest.current.busy || !settings || demo) return;
    const controller = new AbortController();
    const generation = ++currentRequest.current.generation;
    currentRequest.current.controller = controller;
    currentRequest.current.busy = true;
    setBusy(action); setError(null); setMessage("");
    try {
      const result = action === "test" ? await testOmdbSettings(controller.signal)
        : await saveOmdbSettings(omdbSettingsPayload(apiKey, action === "remove"), controller.signal);
      if (generation !== currentRequest.current.generation || controller.signal.aborted) return;
      if (action !== "test") { setSettings(result.settings); setApiKey(""); setSettingsRevision(value => value + 1); }
      setMessage(action === "test" ? "connected" : action === "remove" ? "removed" : "saved");
    } catch (nextError) { if (!controller.signal.aborted) setError(nextError); }
    finally { currentRequest.current.busy = false; if (generation === currentRequest.current.generation) setBusy(""); }
  }
  const disabled = Boolean(busy || !settings);
  return <article className="raspberry-tmdb-card omdb-settings" aria-labelledby="omdb-settings-title" aria-busy={Boolean(busy)}>
    <div className="raspberry-tmdb-card__header"><h3 id="omdb-settings-title">{s.settingsTitle}</h3><p>{s.settingsHint}</p></div>
    <a className="omdb-settings__key-link" href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noopener noreferrer">{s.keyLink} ↗</a>
    {demo ? <p>{s.demo}</p> : <>
      {busy === "load" && <p role="status">{s.loading}</p>}
      <form className="raspberry-tmdb-card__form" onSubmit={event => { event.preventDefault(); act("save"); }}>
        <label><span>{s.key}</span><input type="password" autoComplete="new-password" spellCheck={false} maxLength={256}
          disabled={disabled} value={apiKey} placeholder={settings?.configured ? s.keySaved : s.keyEmpty}
          onChange={event => { setApiKey(event.target.value); setMessage(""); }} /></label>
        <div className="omdb-settings__actions">
          <button type="submit" disabled={disabled || !apiKey.trim()}>{busy === "save" ? s.saving : s.save}</button>
          <button type="button" disabled={disabled || !settings?.configured || Boolean(apiKey)} onClick={() => act("test")}>{busy === "test" ? s.testing : s.test}</button>
          <button type="button" disabled={disabled || !settings?.configured} onClick={() => act("remove")}>{s.remove}</button>
        </div>
      </form>
      {apiKey && <p className="omdb-settings__hint">{s.saveBeforeTest}</p>}
      {error && <p className="dialog-error" role="alert">{omdbError(error, language)}</p>}
      {!settings && !busy && <button type="button" className="dialog-button" onClick={() => setAttempt(value => value + 1)}>{s.retry}</button>}
      {message && <p role="status">{s[message]}</p>}
      {settings && <OmdbLibraryUpdate key={settingsRevision} language={language} disabled={Boolean(busy || apiKey)} />}
    </>}
  </article>;
}
