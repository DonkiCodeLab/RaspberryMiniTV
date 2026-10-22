import LoadingSpinner from "./LoadingSpinner.jsx";
import React, { useEffect, useRef, useState } from "react";
import { deleteMovieSubtitle, obtainMovieSubtitles, getMediaSubtitles, getSubtitleSettings, startSubtitleTranslation, getSubtitleTranslation } from "./api/raspberryApi";
import { movieSubtitleStrings } from "./movieSubtitleStrings.js";
import "./MovieSubtitleDownload.css";
import { SubtitleTranslationAction, SubtitleTranslationDialog } from "./SubtitleTranslationOffer.jsx";
import { subtitleTranslationStrings } from "./subtitleTranslationStrings.js";
import { translationSources, waitForSubtitleTranslation } from "./subtitleTranslation.js";
import { LANGUAGES, languageName, normalizeLanguage } from "./i18n/languages.js";
import LanguageSelector, { LanguageFlag } from "./LanguageSelector.jsx";
import { message } from "./i18n/index.js";
import { normalizeSubtitleLanguage } from "./subtitleLanguages.js";

export function ExternalSubtitleItem({ track, language, busy, onTranslate, onDelete }) {
  const code = normalizeSubtitleLanguage(track.language);
  const info = LANGUAGES.find(item => item.id === code);
  const name = info ? languageName(info.id, language) : movieSubtitleStrings(language).unknownLanguage;
  const filename = track.id.slice("external:".length);
  return <li className="movie-subtitle-download__external">
    {info ? <LanguageFlag flag={info.flag} /> : <span className="language-flag" aria-hidden="true">🌐</span>}
    <span><bdi>{name}</bdi></span>
    {onDelete && <button type="button" className="dialog-button dialog-button--ghost movie-subtitle-download__small-button" disabled={busy}
      aria-label={`${message("Delete", language)}: ${filename}`} onClick={() => onDelete(track.id)}>{message("Delete", language)}</button>}
    {onTranslate && <SubtitleTranslationAction track={track} language={language} busy={busy} onTranslate={onTranslate} />}
    <small className="movie-subtitle-download__filename"><bdi>{filename}</bdi></small>
  </li>;
}

export default function MovieSubtitleDownload({ relativePath, language, disabled = false, onBusyChange, onConfigure }) {
  const s = { ...movieSubtitleStrings(language), ...subtitleTranslationStrings(language) };
  const [subtitleLanguage, setSubtitleLanguage] = useState(() => normalizeLanguage(language));
  const [busy, setBusy] = useState(false);
  const [missingLanguages, setMissingLanguages] = useState([]);
  const [translationTrack, setTranslationTrack] = useState(null);
  const [deleting, setDeleting] = useState(false);
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

  async function remove(sourceId) {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setBusy(true); setDeleting(true); setError(""); setResult(null); onBusyChange?.(true);
    try {
      await deleteMovieSubtitle({ relativePath, sourceId });
      if (mounted.current) setRefresh(value => value + 1);
    } catch (error) {
      if (mounted.current) setError(error.code || "SUBTITLE_DELETE_FAILED");
    } finally {
      inFlight.current = false;
      if (mounted.current) { setBusy(false); setDeleting(false); onBusyChange?.(false); }
    }
  }

  function openTranslation(track) {
    setError(""); setResult(null); setTranslationStatus(null); setTranslationTrack(track);
  }

  async function translate(sourceId, targetLanguage = subtitleLanguage) {
    if (inFlight.current || disabled) return;
    const controller = new AbortController();
    translationAbort.current = controller;
    inFlight.current = true;
    setBusy(true); setTranslating(true); setTranslationStatus(null); setResult(null); setError(""); onBusyChange?.(true);
    try {
      const job = await startSubtitleTranslation({ relativePath, sourceId, language: targetLanguage, signal: controller.signal });
      const result = await waitForSubtitleTranslation(job, { signal: controller.signal, getStatus: getSubtitleTranslation,
        onProgress: status => { if (mounted.current) setTranslationStatus(status); } });
      if (mounted.current) {
        setResult({ file: result.file, match: "ai" });
        setMissingLanguages(values => values.filter(value => value !== targetLanguage));
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
  const externalTracks = (inventory?.tracks || []).filter(track => track.kind === "external");
  if (!externalTracks.length && inventory?.external) externalTracks.push({ id: `external:${inventory.external}`, language: "" });
  return <section className="movie-subtitle-download" aria-label={s.availableTitle} aria-busy={busy}>
    <div aria-live="polite">
      <p><strong>{s.availableTitle}</strong></p>
      {!inventory && <p>{inventoryFailed ? s.inventoryFailed : s.checking}</p>}
      {inventoryFailed && <button type="button" className="dialog-button dialog-button--ghost" onClick={() => setRefresh(value => value + 1)}>{s.retry}</button>}
      {inventory && <>
        <ul className="movie-subtitle-download__inventory">
          {externalTracks.length ? externalTracks.map(track => <ExternalSubtitleItem key={track.id} track={track} language={language}
            busy={busy || disabled} onTranslate={openTranslation} onDelete={remove} />)
            : <li>{s.external}: {s.notFound}</li>}
          <li>{s.embedded}: {inventory.embeddedStatus === "unknown" ? s.unknown : inventory.embedded.length || s.notFound}</li>
        </ul>
        {inventory.embedded.length > 0 && <>
          <ul className="movie-subtitle-download__inventory">{inventory.embedded.map(track => <li className="movie-subtitle-download__external" key={track.index}>
            <span>{[track.language && track.language !== "und" ? track.language : s.unknownLanguage, track.title, track.codec].filter(Boolean).join(" · ")}</span>
            <SubtitleTranslationAction track={(inventory.tracks || []).find(item => item.id === `embedded:${track.index}`) || { available: false }}
              language={language} busy={busy || disabled} onTranslate={openTranslation} />
          </li>)}</ul>
          <p>{s.browserEmbedded}</p>
        </>}
      </>}
    </div>
    <div className="movie-subtitle-download__actions">
      <div className="dialog-field"><span>{s.language}</span>
        <LanguageSelector value={subtitleLanguage} displayLanguage={language} ariaLabel={s.language}
          disabled={busy || disabled} onChange={value => { setSubtitleLanguage(value); setResult(null); setError(""); }} />
      </div>
      <button className="dialog-button dialog-button--accent" disabled={busy || disabled} onClick={obtain} type="button">
        {busy && !translating && !deleting ? s.searching : s.title}
      </button>
    </div>
    {translationTrack && <SubtitleTranslationDialog track={translationTrack} language={language} busy={busy || disabled}
      status={translationStatus} error={error} result={result} onTranslate={translate} onClose={() => { if (!translating) { setTranslationTrack(null); setError(""); setResult(null); } }} />}
    {missingLanguages.includes(subtitleLanguage) && inventory && !translationSources(inventory.tracks || [], subtitleLanguage).length && <p>{s.translationNoSource}</p>}
    {disabled && <p>{s.manual}</p>}
    {busy && !translating && !translationTrack && <p role="status"><LoadingSpinner inline /> {deleting ? s.deleting : s.searching}
    </p>}
    {error && !translationTrack && <p className="dialog-error" role="alert">{s[error] || s.failed}</p>}
    {result && !translationTrack && <div className="movie-subtitle-download__result" role="status">
      <strong>{s.saved}: {result.file}</strong>
      <p>{result.match === "ai" ? s.translationSaved : result.match === "hash" ? s.exact : s.fallback}</p>
      {result.release && <p>{result.release}</p>}
      <p>{s.restart}</p>
    </div>}
    {configured === false && <button className="dialog-button dialog-button--ghost" type="button" disabled={busy} onClick={onConfigure}>{s.configure}</button>}
  </section>;
}
