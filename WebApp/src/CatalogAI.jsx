import React, { useEffect, useRef, useState } from "react";
import { isMockMode, searchCatalogAI } from "./api/raspberryApi";
import { catalogAIError, catalogAIStrings } from "./catalogAIStrings.js";
import { validateAIResult } from "./catalogAI.js";
import Recommendations from "./Recommendations.jsx";
import { recommendationStrings } from "./recommendationStrings.js";
import "./CatalogAI.css";

export function CatalogAIButton({ language, open, active, onClick, compact = false }) {
  const s = catalogAIStrings(language);
  return <button type="button" className={`${compact ? "movie-filter__toggle" : "dialog-button"} catalog-ai-button${open ? " is-open" : ""}${active ? " has-filters" : ""}`}
    onClick={onClick} aria-label={s.ask} title={s.ask} aria-expanded={open} aria-controls="catalog-ai-panel">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4ZM20 2v4M18 4h4" /></svg>
    {!compact && s.ask}
  </button>;
}

export function CatalogAIResult({ result, visible, language, onClear }) {
  if (!result || !["filter", "count"].includes(result.intent)) return null;
  const s = catalogAIStrings(language);
  return <div className="catalog-ai-result" role="status">
    <div><strong>{s.applied}: {result.prompt}</strong><p>{result.message}</p>
      <small>{result.count} {s.matches} · {visible} {s.visible}</small>
      {result.missingMetadata > 0 && <small>{result.missingMetadata} {s.missing}</small>}
      <small>{s.hint}</small>
    </div>
    <button className="dialog-button" type="button" onClick={onClear}>{s.clear}</button>
  </div>;
}

export default function CatalogAI({ section, language, onResult, onClose, initialPrompt = "", user, onOpenLibrary, onSearchTorrent }) {
  const s = catalogAIStrings(language);
  const rs = recommendationStrings(language);
  const [mode, setMode] = useState("search");
  const canRecommend = ["movies", "series"].includes(section);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const request = useRef({ generation: 0, controller: null });
  const input = useRef(null);
  const demo = isMockMode();
  useEffect(() => {
    return () => { request.current.generation += 1; request.current.controller?.abort(); };
  }, [section]);
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
    setBusy(true); setError(""); setMessage("");
    try {
      const result = validateAIResult(await searchCatalogAI({ section, prompt: prompt.trim(), language }, controller.signal), section);
      if (request.current.generation !== generation || controller.signal.aborted) return;
      if (["filter", "count"].includes(result.intent)) onResult({ ...result, prompt: prompt.trim() });
      else setMessage(result.message);
    } catch (error) {
      if (request.current.generation === generation && !controller.signal.aborted) setError(catalogAIError(error, language));
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
      <label htmlFor="catalog-ai-prompt">{s.prompt}</label>
      <textarea ref={input} id="catalog-ai-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={1000} rows={3} disabled={busy || demo} autoFocus />
      <div className="catalog-ai-panel__examples"><span>{s.examples}</span>{(s.samples[section] || []).map(example => <button type="button" key={example} disabled={busy || demo}
        onClick={() => { setPrompt(example); input.current?.focus(); }}>{example}</button>)}</div>
      <div className="dialog-actions"><button className="dialog-button dialog-button--accent" type="submit" disabled={busy || demo || !prompt.trim()}>{busy ? s.waiting : s.send}</button>
        {busy && <button className="dialog-button" type="button" onClick={cancel}>{s.cancel}</button>}</div>
    </form>
    {busy && <p role="status">{s.waiting}</p>}
    {error && <p className="dialog-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    </>}
  </section>;
}
