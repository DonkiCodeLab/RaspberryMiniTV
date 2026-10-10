import React, { useEffect, useRef, useState } from "react";
import { deleteAIRecommendations, getAIRecommendations, isMockMode, requestAIRecommendations, saveAIRecommendationTastes } from "./api/raspberryApi";
import { catalogAIError, catalogAIStrings } from "./catalogAIStrings.js";
import { draftToTastes, recommendationKey, tastesToDraft, TASTE_FIELDS, validRecommendations, validTastePreferences, validateRecommendationMemory } from "./recommendations.js";
import { recommendationStrings, recommendationWarning } from "./recommendationStrings.js";
import "./Recommendations.css";

export function RecommendationCards({ recommendations, language, onOpenLibrary, onSearchTorrent }) {
  const s = recommendationStrings(language);
  const [missing, setMissing] = useState("");
  if (!recommendations.length) return null;
  return <section className="ai-recommendation-cards" aria-label={s.recommendations}>
    <h3>{s.recommendations}</h3>
    <div className="ai-recommendation-cards__grid">{recommendations.map(item => <article key={recommendationKey(item)}>
      <span className={`ai-recommendation-cards__availability${item.available ? " is-available" : ""}`}>{item.available ? s.available : s.missing}</span>
      <h4>{item.title}{item.year ? <small>{item.year}</small> : null}</h4>
      {item.overview && <p className="ai-recommendation-cards__overview">{item.overview}</p>}
      <p className="ai-recommendation-cards__reason"><strong>{s.aiReason}</strong>{item.reason}</p>
      {item.available ? <button className="dialog-button" type="button" onClick={() => {
        if (onOpenLibrary?.(item) === false) setMissing(recommendationKey(item));
      }}>{s.open}</button> : <button className="dialog-button" type="button" onClick={() => onSearchTorrent?.(item)}>{s.torrent}</button>}
      {missing === recommendationKey(item) && <p role="status">{s.missingLocal}</p>}
    </article>)}</div>
    <p className="ai-recommendations__hint">{s.noAutomaticDownload}</p>
  </section>;
}

export default function Recommendations({ user, section, language, onOpenLibrary, onSearchTorrent }) {
  const s = recommendationStrings(language);
  const common = catalogAIStrings(language);
  const demo = isMockMode();
  const userId = user?.id;
  const [memory, setMemory] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState("load");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [question, setQuestion] = useState("");
  const [cards, setCards] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [attempt, setAttempt] = useState(0);
  const action = useRef({ generation: 0, controller: null, busy: false });
  const input = useRef(null);
  const conversation = useRef(null);

  useEffect(() => {
    if (conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight;
  }, [memory?.revision]);

  useEffect(() => {
    const controller = new AbortController();
    const generation = ++action.current.generation;
    action.current.controller = controller;
    action.current.busy = true;
    setBusy("load"); setError(""); setMemory(null); setCards([]); setQuestion(""); setWarnings([]); setEditing(false); setPrompt(""); setNotice("");
    if (demo || !userId) { action.current.busy = false; setBusy(demo ? "" : "load"); }
    else getAIRecommendations(userId, section, controller.signal).then(data => {
      if (action.current.generation === generation && !controller.signal.aborted) setMemory(validateRecommendationMemory(data, userId, section));
    }).catch(error => {
      if (!controller.signal.aborted) setError(error.status === 404 ? s.missingProfile : s.memoryError);
    }).finally(() => {
      if (action.current.generation === generation) { action.current.busy = false; setBusy(""); }
    });
    return () => { action.current.generation += 1; action.current.controller?.abort(); };
  }, [userId, section, language, attempt, demo]);

  async function mutate(kind, preferences) {
    if (demo || !memory || action.current.busy || (kind === "chat" && !prompt.trim())) return;
    if (kind === "edit" && !validTastePreferences(preferences)) { setError(s.tasteLimit); return; }
    const generation = ++action.current.generation;
    const controller = new AbortController();
    action.current.controller = controller; action.current.busy = true;
    setBusy(kind); setError(""); setNotice("");
    const context = { userId, section, revision: memory.revision };
    try {
      const data = kind === "chat" ? await requestAIRecommendations({ ...context, prompt: prompt.trim(), language }, controller.signal)
        : kind === "forget" ? await deleteAIRecommendations(context, controller.signal)
        : await saveAIRecommendationTastes({ ...context, preferences }, controller.signal);
      if (action.current.generation !== generation || controller.signal.aborted) return;
      const next = validateRecommendationMemory(data, userId, section);
      setMemory(next); setEditing(false);
      if (kind === "chat") {
        setPrompt(""); setCards(validRecommendations(data.recommendations, section));
        setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
        const latest = next.history.filter(turn => turn.role === "assistant").at(-1)?.text || "";
        setQuestion(typeof data.question === "string" && !latest.includes(data.question) ? data.question : "");
        if (typeof data.message === "string" && !latest.includes(data.message)) setNotice(data.message);
      } else {
        setCards([]); setQuestion(""); setWarnings([]);
        setNotice(kind === "forget" ? s.forgotten : s.saved);
        if (kind === "forget") setPrompt("");
      }
    } catch (error) {
      if (action.current.generation !== generation || controller.signal.aborted) return;
      if (error.code === "AI_PROFILE_CHANGED") {
        // Keep the unsent text, but refresh the server revision before any retry.
        setCards([]); setQuestion(""); setEditing(false);
        setError(s.conflict);
        try {
          const fresh = await getAIRecommendations(userId, section, controller.signal);
          if (action.current.generation === generation && !controller.signal.aborted) setMemory(validateRecommendationMemory(fresh, userId, section));
        } catch {
          if (action.current.generation === generation && !controller.signal.aborted) { setMemory(null); setError(s.memoryError); }
        }
      } else setError(error.status === 404 ? s.missingProfile : catalogAIError(error, language, kind === "chat" ? "error" : "settingsError"));
    } finally {
      if (action.current.generation === generation) { action.current.busy = false; setBusy(""); }
    }
  }

  function cancel() {
    action.current.generation += 1; action.current.controller?.abort(); action.current.busy = false;
    setBusy(""); setNotice(s.cancelled);
  }

  const disabled = Boolean(demo || !memory || busy || !userId);
  const draftValid = validTastePreferences(draftToTastes(draft));
  return <div className="ai-recommendations" aria-busy={Boolean(busy)}>
    <div className="ai-recommendations__profile"><span>{s.profile}</span><strong>{user?.name || "—"}</strong></div>
    <p className="ai-recommendations__hint">{s.privacy}</p>
    {demo && <p role="status">{common.demo}</p>}
    {busy === "load" && <p role="status">{s.loading}</p>}
    {memory && <>
      <details className="ai-recommendations__tastes" open={editing || undefined}>
        <summary>{s.tastes} <span>{TASTE_FIELDS.reduce((total, field) => total + memory.preferences[field].length, 0)}</span></summary>
        {editing ? <form onSubmit={event => { event.preventDefault(); mutate("edit", draftToTastes(draft)); }}>
          <p>{s.newline} {s.tasteLimit}</p><div className="ai-recommendations__taste-fields">{TASTE_FIELDS.map(field => <label key={field}><span>{s[field]}</span>
            <textarea rows={2} maxLength={1211} disabled={disabled} value={draft[field] || ""} onChange={event => setDraft(current => ({ ...current, [field]: event.target.value }))} /></label>)}</div>
          {!draftValid && <p className="dialog-error" role="alert">{s.tasteLimit}</p>}
          <div className="dialog-actions"><button className="dialog-button" type="submit" disabled={disabled || !draftValid}>{s.save}</button><button className="dialog-button" type="button" disabled={Boolean(busy)} onClick={() => setEditing(false)}>{s.cancelEdit}</button></div>
        </form> : <>
          {TASTE_FIELDS.every(field => !memory.preferences[field].length) && <p>{s.noTastes}</p>}
          {TASTE_FIELDS.filter(field => memory.preferences[field].length).map(field => <div className="ai-recommendations__taste-group" key={field}><h4>{s[field]}</h4><ul>{memory.preferences[field].map(value => <li key={value}>
            <span>{value}</span><button type="button" disabled={disabled} aria-label={`${s.removeTaste}: ${value}`} onClick={() => mutate("edit", { ...memory.preferences, [field]: memory.preferences[field].filter(item => item !== value) })}>×</button>
          </li>)}</ul></div>)}
          <button className="dialog-button" type="button" disabled={disabled} onClick={() => { setDraft(tastesToDraft(memory.preferences)); setEditing(true); }}>{s.edit}</button>
        </>}
        <div className="ai-recommendations__forget"><p>{s.forgetNote}</p><button className="dialog-button" type="button" disabled={disabled} onClick={() => mutate("forget")}>{s.forget}</button></div>
      </details>
      <section ref={conversation} className="ai-recommendations__conversation" aria-label={s.history}>
        {!memory.history.length && <p className="ai-recommendations__intro">{s.intro}</p>}
        {memory.history.map((turn, index) => <div className={`ai-recommendations__turn is-${turn.role}`} key={`${index}:${turn.role}`}><strong>{turn.role === "user" ? s.you : s.assistant}</strong><p>{turn.text}</p></div>)}
      </section>
    </>}
    {notice && <p role="status">{notice}</p>}
    {question && <p className="ai-recommendations__question"><strong>{s.question}</strong>{question}</p>}
    {warnings.length > 0 && <ul className="ai-recommendations__hint" role="status">{[...new Set(warnings)].map(code => <li key={code}>{recommendationWarning(code, language)}</li>)}</ul>}
    <RecommendationCards recommendations={cards} language={language} onOpenLibrary={onOpenLibrary} onSearchTorrent={onSearchTorrent} />
    <form className="ai-recommendations__prompt" onSubmit={event => { event.preventDefault(); mutate("chat"); }}>
      <label htmlFor="ai-recommendation-prompt">{s.prompt}</label>
      <textarea ref={input} id="ai-recommendation-prompt" rows={3} maxLength={2000} value={prompt} disabled={disabled} placeholder={s.placeholder} onChange={event => setPrompt(event.target.value)} />
      {!memory?.history.length && <div className="catalog-ai-panel__examples">{s.examples.map(example => <button type="button" key={example} disabled={disabled} onClick={() => { setPrompt(example); input.current?.focus(); }}>{example}</button>)}</div>}
      <div className="dialog-actions"><button className="dialog-button dialog-button--accent" type="submit" disabled={disabled || !prompt.trim()}>{busy === "chat" ? s.waiting : s.send}</button>
        {busy === "chat" && <button className="dialog-button" type="button" onClick={cancel}>{s.cancel}</button>}</div>
    </form>
    {busy === "chat" && <p role="status">{s.waiting}</p>}
    {["edit", "forget"].includes(busy) && <p role="status">{common.saving}</p>}
    {error && <p className="dialog-error" role="alert">{error}</p>}
    {!demo && !memory && !busy && <button className="dialog-button" type="button" onClick={() => setAttempt(value => value + 1)}>{s.retry}</button>}
  </div>;
}
