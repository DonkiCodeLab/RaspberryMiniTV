import React, { useEffect, useRef, useState } from "react";
import { isMockMode, searchCatalogAI } from "./api/raspberryApi";
import { catalogAIError, catalogAIStrings } from "./catalogAIStrings.js";
import { copyAIDebug, validateAIResult, readSearchPreferences, saveSearchPreferences } from "./catalogAI.js";
import AIModelSelect from "./AIModelSelect.jsx";
import LoadingSpinner from "./LoadingSpinner.jsx";
import Recommendations from "./Recommendations.jsx";
import { recommendationStrings } from "./recommendationStrings.js";
import "./CatalogAI.css";

export function CatalogAIButton({ language, open, active, onClick, compact = false }) {
  const s = catalogAIStrings(language);
  return <button type="button" className={`${compact ? "movie-filter__toggle" : "dialog-button"} catalog-ai-button${open ? " is-open" : ""}${active ? " has-filters" : ""}`}
    onClick={onClick} aria-label={open ? s.close : s.ask} title={open ? s.close : s.ask} aria-expanded={open} aria-controls="catalog-ai-panel">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d={open ? "M5 15l7-7 7 7" : "m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4ZM20 2v4M18 4h4"} /></svg>
    {!compact && (open ? s.close : s.ask)}
  </button>;
}

export function CatalogAIResult({ result, visible, language, onClear }) {
  if (!result || !["filter", "count"].includes(result.intent)) return null;
  const s = catalogAIStrings(language);
  return <div className="catalog-ai-result" role="status">
    <div><strong>{s.applied}: {result.prompt}</strong><p>{result.message}</p>
      <small>{result.count} {s.matches} · {visible} {s.visible}</small>
      {result.missingMetadata > 0 && <small>{result.missingMetadata} {s.missing}</small>}
      {result.catalogStale && <small>{s.catalogStale}</small>}
      <small>{s.resultHint}</small>
    </div>
    <button className="dialog-button" type="button" onClick={onClear}>{s.clear}</button>
  </div>;
}

export function CatalogAIDebug({ report, language }) {
  const s = catalogAIStrings(language);
  const [copyStatus, setCopyStatus] = useState("");
  useEffect(() => { setCopyStatus(""); }, [report]);
  if (!report) return null;
  const { provider, outputText, parsedOutput, ...context } = report;
  async function copy() {
    try { await copyAIDebug(report); setCopyStatus("debugCopied"); }
    catch (_) { setCopyStatus("debugCopyError"); }
  }
  return <section id="catalog-ai-debug" className="catalog-ai-debug" aria-label={s.debugTitle}>
    <div className="catalog-ai-debug__heading"><h3>{s.debugTitle}</h3>
      <button type="button" className="dialog-button" onClick={copy}>{s.debugCopy}</button></div>
    <p>{provider?.name === "codex" ? s.codexDebugHint : s.debugHint}</p>
    {copyStatus && <p role="status">{s[copyStatus]}</p>}
    <h4>{s.debugOutput}</h4>
    <pre tabIndex={0}>{outputText || (provider?.called === false ? s.debugNotCalled : s.debugNoOutput)}</pre>
    <h4>{s.debugContext}</h4>
    <pre tabIndex={0}>{JSON.stringify({ ...context, provider: provider && {
      name: provider.name, toolReads: provider.toolReads, httpStatus: provider.httpStatus, requestId: provider.requestId, status: provider.status,
      incomplete_details: provider.incomplete_details, usage: provider.usage, elapsedMs: provider.elapsedMs,
    } }, null, 2)}</pre>
    <details><summary>{provider?.name === "codex" ? s.codexDebugRaw : s.debugRaw}</summary>
      {provider?.truncated && <p>{s.debugTruncated}</p>}
      <pre tabIndex={0}>{provider?.rawResponse ?? s.debugNoResponse}</pre>
    </details>
  </section>;
}

export default function CatalogAI({ section, language, onResult, onClose, initialPrompt = "", user, onOpenLibrary, onSearchTorrent }) {
  const s = catalogAIStrings(language);
  const rs = recommendationStrings(language);
  const [mode, setMode] = useState("search");
  const canRecommend = ["movies", "series"].includes(section);
  const [preferences, setPreferences] = useState(readSearchPreferences);
  const provider = "openai";
  const model = preferences.models[provider];
  function choose(provider, model = preferences.models[provider]) {
    const next = { provider, models: { ...preferences.models, [provider]: model } };
    setPreferences(next);
    saveSearchPreferences(next);
    setError(""); setMessage(""); setDebug(null); setDebugOpen(false);
  }
  const [prompt, setPrompt] = useState(initialPrompt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [debug, setDebug] = useState(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const request = useRef({ generation: 0, controller: null });
  const input = useRef(null);
  const demo = isMockMode();
  useEffect(() => {
    setDebug(null); setDebugOpen(false); setError(""); setMessage(""); setBusy(false);
    return () => { request.current.generation += 1; request.current.controller?.abort(); };
  }, [section, user?.id]);
  function cancel() {
    request.current.generation += 1;
    request.current.controller?.abort();
    setBusy(false);
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || demo || !prompt.trim()) return;
    const generation = ++request.current.generation;
    const controller = new AbortController();
    request.current.controller?.abort();
    request.current.controller = controller;
    setBusy(true); setError(""); setMessage(""); setDebug(null);
    try {
      const data = await searchCatalogAI({ section, prompt: prompt.trim(), language, provider,
        ...(model ? { model } : {}) }, controller.signal);
      if (request.current.generation !== generation || controller.signal.aborted) return;
      setDebug(data?.debug || { request: { section, prompt: prompt.trim(), model: model || undefined }, source: "client", response: data });
      const result = validateAIResult(data, section);
      if (["filter", "count"].includes(result.intent)) onResult({ ...result, prompt: prompt.trim() });
      else setMessage(result.message + (result.catalogStale ? ` ${s.catalogStale}` : ""));
    } catch (error) {
      if (request.current.generation === generation && !controller.signal.aborted) {
        setError(catalogAIError(error, language));
        setDebug(current => error.debug || current || { request: { section, prompt: prompt.trim(), model: model || undefined }, source: "client",
          result: { ok: false, code: error.code, httpStatus: error.status, error: error.message } });
      }
    } finally {
      if (request.current.generation === generation) setBusy(false);
    }
  }
  return <section id="catalog-ai-panel" className="catalog-ai-panel" aria-label={s.title}>
    <div className="catalog-ai-panel__heading"><h2>{mode === "recommend" ? rs.recommendMode : s.title}</h2><button type="button" onClick={onClose} aria-label={s.close}>×</button></div>
    {canRecommend && <div className="catalog-ai-modes" role="group" aria-label={rs.mode}>
      {["search", "recommend"].map(value => <button type="button" key={value} aria-pressed={mode === value} onClick={() => { cancel(); setMode(value); }}>{rs[value === "search" ? "searchMode" : "recommendMode"]}</button>)}
    </div>}
    {canRecommend && mode === "recommend" ? <Recommendations key={`${user?.id}:${section}:${language}`} user={user} section={section} language={language}
      onOpenLibrary={onOpenLibrary} onSearchTorrent={onSearchTorrent} /> : <>
    <p>{section === "pictures" ? s.picturesHint : s.hint}</p>
    {demo && <p role="status">{s.demo}</p>}
    <form onSubmit={submit}>
      <AIModelSelect key={provider} provider={provider} value={model} onChange={value => choose(provider, value)} language={language} disabled={busy || demo} useDefault />
      <label htmlFor="catalog-ai-prompt">{s.prompt}</label>
      <textarea ref={input} id="catalog-ai-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={2000} rows={3} disabled={busy || demo} autoFocus />
      <div className="catalog-ai-panel__examples"><span>{s.examples}</span>{(s.samples[section] || []).map(example => <button type="button" key={example} disabled={busy || demo}
        onClick={() => { setPrompt(example); input.current?.focus(); }}>{example}</button>)}</div>
      <div className="dialog-actions"><button className="dialog-button dialog-button--accent" type="submit" disabled={busy || demo || !prompt.trim()}>{busy ? s.waiting : s.send}</button>
        <button type="button" className="dialog-button" disabled={busy || !debug} aria-expanded={debugOpen} aria-controls="catalog-ai-debug"
          onClick={() => setDebugOpen(open => !open)}>{s.debug}</button>
        {busy && <button className="dialog-button" type="button" onClick={cancel}>{s.cancel}</button>}</div>
    </form>
    {busy && <p role="status"><LoadingSpinner inline /> {s.waiting}</p>}
    {error && <p className="dialog-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {debugOpen && <CatalogAIDebug report={debug} language={language} />}
    </>}
  </section>;
}
