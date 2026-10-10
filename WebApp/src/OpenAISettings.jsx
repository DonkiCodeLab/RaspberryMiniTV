import React, { useEffect, useRef, useState } from "react";
import { getAISettings, saveAISettings, testAISettings, isMockMode } from "./api/raspberryApi";
import { aiSettingsPayload } from "./catalogAI.js";
import { catalogAIError, catalogAIStrings } from "./catalogAIStrings.js";
import "./CatalogAI.css";

export default function OpenAISettings({ language }) {
  const s = catalogAIStrings(language);
  const [settings, setSettings] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState("load");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const request = useRef({ generation: 0, controller: null, busy: false });
  const demo = isMockMode();
  useEffect(() => {
    const controller = new AbortController();
    const generation = ++request.current.generation;
    request.current.controller = controller;
    setBusy("load"); setError("");
    if (demo) setBusy("");
    else getAISettings(controller.signal).then(data => {
      if (request.current.generation === generation && !controller.signal.aborted) {
        setSettings(data.settings);
        setApiKey(data.settings.apiKey || "");
      }
    }).catch(error => { if (!controller.signal.aborted) setError(catalogAIError(error, language, "settingsError")); })
      .finally(() => { if (!controller.signal.aborted) setBusy(""); });
    return () => { request.current.generation += 1; request.current.controller?.abort(); };
  }, [attempt, demo]);

  function update(field, value) { setSettings(current => ({ ...current, [field]: value })); setDirty(true); setMessage(""); }
  async function act(action) {
    if (request.current.busy || busy || demo || !settings) return;
    request.current.busy = true;
    const controller = new AbortController();
    const generation = ++request.current.generation;
    request.current.controller = controller;
    setBusy(action); setError(""); setMessage("");
    try {
      const result = action === "test" ? await testAISettings(controller.signal)
        : await saveAISettings(action === "remove" ? { clearApiKey: true } : aiSettingsPayload(settings, apiKey), controller.signal);
      if (request.current.generation !== generation || controller.signal.aborted) return;
      if (action !== "test") { setSettings(result.settings); setApiKey(result.settings.apiKey || ""); setDirty(false); }
      setMessage(action === "test" ? "connected" : action === "remove" ? "removed" : "saved");
    } catch (error) { if (!controller.signal.aborted) setError(catalogAIError(error, language, "settingsError")); }
    finally { request.current.busy = false; if (request.current.generation === generation) setBusy(""); }
  }
  const disabled = Boolean(busy || demo || !settings);
  return <article className="raspberry-tmdb-card raspberry-tmdb-card--credentials openai-settings" aria-labelledby="openai-settings-title" aria-busy={Boolean(busy)}>
    <div className="raspberry-tmdb-card__header"><h3 id="openai-settings-title">{s.settingsTitle}</h3><p>{s.settingsHint}</p></div>
    {demo ? <p>{s.demo}</p> : <>
      {busy === "load" && <p role="status">{s.loading}</p>}
      <form className="raspberry-tmdb-card__form" onSubmit={event => { event.preventDefault(); act("save"); }}>
        <label className="openai-settings__enabled"><input type="checkbox" checked={Boolean(settings?.enabled)} disabled={disabled} onChange={event => update("enabled", event.target.checked)} />{s.enabled}</label>
        <label><span>{s.key}</span><input type="text" autoComplete="off" spellCheck={false} autoCapitalize="none" maxLength={512} disabled={disabled} value={apiKey}
          placeholder={settings?.configured ? s.keySaved : s.keyEmpty} onChange={event => { setApiKey(event.target.value); setDirty(true); setMessage(""); }} /></label>
        <label><span>{s.model}</span><input value={settings?.model || "gpt-4.1-mini"} required maxLength={100} disabled={disabled} onChange={event => update("model", event.target.value)} /></label>
        <label><span>{s.rate}</span><input type="number" min={1} max={30} step={1} required value={settings?.requestsPerMinute ?? 10} disabled={disabled} onChange={event => update("requestsPerMinute", event.target.value)} /></label>
        <div className="dialog-actions"><button type="submit" className="dialog-button" disabled={disabled}>{busy === "save" ? s.saving : s.save}</button>
          <button type="button" className="dialog-button dialog-button--secondary" disabled={disabled || !settings?.configured || dirty} onClick={() => act("test")}>{busy === "test" ? s.testing : s.test}</button>
          <button type="button" className="dialog-button" disabled={disabled || !settings?.configured} onClick={() => act("remove")}>{s.remove}</button></div>
      </form>
      {dirty && <p>{s.saveBeforeTest}</p>}
      {error && <p className="dialog-error" role="alert">{error}</p>}
      {!settings && !busy && <button type="button" className="dialog-button" onClick={() => setAttempt(value => value + 1)}>{s.retry}</button>}
      {message && <p role="status">{s[message]}</p>}
    </>}
  </article>;
}
