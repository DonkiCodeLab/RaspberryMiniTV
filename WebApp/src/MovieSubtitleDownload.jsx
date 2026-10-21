import LoadingSpinner from "./LoadingSpinner.jsx";
import React, { useEffect, useRef, useState } from "react";
import { obtainMovieSubtitles, getMediaSubtitles, getSubtitleSettings, startSubtitleTranslation, getSubtitleTranslation } from "./api/raspberryApi";
import { movieSubtitleStrings } from "./movieSubtitleStrings.js";
import "./MovieSubtitleDownload.css";
import SubtitleTranslationOffer from "./SubtitleTranslationOffer.jsx";
import { subtitleTranslationStrings } from "./subtitleTranslationStrings.js";
import { translationSources, waitForSubtitleTranslation } from "./subtitleTranslation.js";
import { LANGUAGES, normalizeLanguage } from "./i18n/languages.js";

export default function MovieSubtitleDownload({ relativePath, language, disabled = false, onBusyChange, onConfigure }) {
  const s = { ...movieSubtitleStrings(language), ...subtitleTranslationStrings(language) };
  const [subtitleLanguage, setSubtitleLanguage] = useState(() => normalizeLanguage(language));
  const [busy, setBusy] = useState(false);
  const [missingLanguages, setMissingLanguages] = useState([]);
  const [translating, setTranslating] = useState(false);
  const [translationStatus, setTranslationStatus] = useState(null);
  const translationAbort = useRef(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [inventoryFailed, setInventoryFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [configured, setConfigured] = useState(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!relativePath) return;
    const controller = new AbortController();
    setConfigured(null);
    getSubtitleSettings(controller.signal).then(data => {
      if (!controller.signal.aborted) setConfigured(data.configured);
    }).catch(() => {
      // Keep the configuration action hidden until its state is known.
    });
    return () => controller.abort();
  }, [relativePath, refresh]);

  useEffect(() => {
    if (!relativePath) return;
    const controller = new AbortController();
    setInventory(null);
    setInventoryFailed(false);
    getMediaSubtitles(relativePath, controller.signal).then(data => {
      if (!controller.signal.aborted) setInventory(data);
    }).catch(() => { if (!controller.signal.aborted) setInventoryFailed(true); });
    return () => controller.abort();
  }, [relativePath, refresh]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; translationAbort.current?.abort(); };
  }, []);

  async function obtain() {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setBusy(true); onBusyChange?.(true); setError(""); setResult(null);
    try {
      const data = await obtainMovieSubtitles({ relativePath, language: subtitleLanguage });
      if (mounted.current) { setResult(data); setMissingLanguages(values => values.filter(value => value !== subtitleLanguage)); setRefresh(value => value + 1); }
    } catch (error) {
      if (mounted.current) {
        setError(error.code || "failed");
        if (error.code === "SUBTITLE_NOT_FOUND") setMissingLanguages(values => [...new Set([...values, subtitleLanguage])]);
        if (error.code === "SUBTITLE_NOT_CONFIGURED") setConfigured(false);
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) { setBusy(false); onBusyChange?.(false); }
    }
  }

  async function translate(sourceId) {
    if (inFlight.current || disabled) return;
    const controller = new AbortController();
    translationAbort.current = controller;
    inFlight.current = true;
    setBusy(true); setTranslating(true); setTranslationStatus(null); setResult(null); setError(""); onBusyChange?.(true);
    try {
      const job = await startSubtitleTranslation({ relativePath, sourceId, language: subtitleLanguage, signal: controller.signal });
      const result = await waitForSubtitleTranslation(job, { signal: controller.signal, getStatus: getSubtitleTranslation,
        onProgress: status => { if (mounted.current) setTranslationStatus(status); } });
      if (mounted.current) {
        setResult({ file: result.file, match: "ai" });
        setMissingLanguages(values => values.filter(value => value !== subtitleLanguage));
        setRefresh(value => value + 1);
      }
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) setError(error.code || "SUBTITLE_TRANSLATION_FAILED");
    } finally {
      inFlight.current = false;
      if (mounted.current) { setBusy(false); setTranslating(false); onBusyChange?.(false); }
    }
  }

  if (!relativePath) return null;
  return <section className="movie-subtitle-download" aria-label={s.availableTitle} aria-busy={busy}>
    <div aria-live="polite">
      <p><strong>{s.availableTitle}</strong></p>
      {!inventory && <p>{inventoryFailed ? s.inventoryFailed : s.checking}</p>}
      {inventoryFailed && <button type="button" className="dialog-button dialog-button--ghost" onClick={() => setRefresh(value => value + 1)}>{s.retry}</button>}
      {inventory && <>
        <ul className="movie-subtitle-download__inventory">
          <li>{s.external}: {(inventory.tracks || []).filter(track => track.kind === "external").map(track => track.id.slice("external:".length)).join(" · ") || inventory.external || s.notFound}</li>
          <li>{s.embedded}: {inventory.embeddedStatus === "unknown" ? s.unknown : inventory.embedded.length || s.notFound}</li>
        </ul>
        {inventory.embedded.length > 0 && <>
          <ul>{inventory.embedded.map(track => <li key={track.index}>{[track.language && track.language !== "und" ? track.language : s.unknownLanguage, track.title, track.codec].filter(Boolean).join(" · ")}</li>)}</ul>
          <p>{s.browserEmbedded}</p>
        </>}
      </>}
    </div>
    <div className="movie-subtitle-download__actions">
      <label className="dialog-field"><span>{s.language}</span>
        <select value={subtitleLanguage} disabled={busy || disabled} onChange={event => { setSubtitleLanguage(event.target.value); setResult(null); setError(""); }}>
          {LANGUAGES.map(item => <option key={item.id} value={item.id} lang={item.id} dir={item.direction}>{item.nativeName}</option>)}
        </select>
      </label>
      <button className="dialog-button dialog-button--accent" disabled={busy || disabled} onClick={obtain} type="button">
        {busy ? (translating ? s.translating : s.searching) : s.title}
      </button>
    </div>
    <SubtitleTranslationOffer tracks={inventory?.tracks || []} missingLanguages={missingLanguages}
      targetLanguage={subtitleLanguage} language={language} busy={busy || disabled} onTranslate={translate} />
    {missingLanguages.includes(subtitleLanguage) && inventory && !translationSources(inventory.tracks || [], subtitleLanguage).length && <p>{s.translationNoSource}</p>}
    {disabled && <p>{s.manual}</p>}
    {busy && <p role="status"><LoadingSpinner inline /> {translating ? (translationStatus?.state === "waiting" ? s.translateWaiting : s.translating) : s.searching}
      {translating && translationStatus?.total > 0 && <> · {s.translatedCues}: {translationStatus.done}/{translationStatus.total}</>}
    </p>}
    {error && <p className="dialog-error" role="alert">{s[error] || s.failed}</p>}
    {result && <div className="movie-subtitle-download__result" role="status">
      <strong>{s.saved}: {result.file}</strong>
      <p>{result.match === "ai" ? s.translationSaved : result.match === "hash" ? s.exact : s.fallback}</p>
      {result.release && <p>{result.release}</p>}
      <p>{s.restart}</p>
    </div>}
    {configured === false && <button className="dialog-button dialog-button--ghost" type="button" disabled={busy} onClick={onConfigure}>{s.configure}</button>}
  </section>;
}
