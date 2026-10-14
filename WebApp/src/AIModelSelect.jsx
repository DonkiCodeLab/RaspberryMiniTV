import React, { useEffect, useId, useState } from "react";
import { getAIModels, isMockMode } from "./api/raspberryApi";
import { catalogAIStrings } from "./catalogAIStrings.js";

// Official aliases; the account's live /models list takes precedence.
export const MODEL_PRESETS = ["chat-latest", "gpt-6.1-sol", "gpt-6-luna", "gpt-6-astra", "gpt-4.1", "gpt-4.1-mini"];

export function modelOptions(models, value) {
  const ids = [...new Set(models.map(model => model.id))];
  const preferred = MODEL_PRESETS.filter(id => ids.includes(id));
  return [...new Set([...preferred, ...ids, ...(value ? [value] : [])])];
}

export default function AIModelSelect({ value, onChange, language, disabled, useDefault = false, revision = 0 }) {
  const s = catalogAIStrings(language);
  const id = useId();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [custom, setCustom] = useState(false);
  useEffect(() => {
    if (isMockMode()) return;
    const controller = new AbortController();
    setLoading(true); setFailed(false); setData(null);
    getAIModels(controller.signal).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt, revision]);
  const models = data?.configured ? data.models : MODEL_PRESETS.map(id => ({ id }));
  const options = modelOptions(models, value);
  return <div className="ai-model-select">
    <label htmlFor={id}>{s.model}</label>
    <div className="ai-model-select__row">
      <select id={id} value={custom ? "__custom" : value} disabled={disabled} onChange={event => {
        const next = event.target.value;
        setCustom(next === "__custom");
        if (next !== "__custom") onChange(next);
      }}>
        {useDefault && <option value="">{s.modelDefault}{data?.defaultModel ? ` (${data.defaultModel})` : ""}</option>}
        {!useDefault && !value && <option value="" disabled>{s.model}</option>}
        {options.map(model => <option key={model} value={model}>{model === "chat-latest" ? `${model} · ChatGPT Instant` : model}</option>)}
        <option value="__custom">{s.modelCustom}</option>
      </select>
      <button type="button" className="dialog-button" disabled={disabled || loading} onClick={() => setAttempt(n => n + 1)}>{loading ? s.modelsLoading : s.modelsRefresh}</button>
    </div>
    {custom && <label className="ai-model-select__custom">{s.modelId}<input value={value} required maxLength={100} pattern="[A-Za-z0-9][A-Za-z0-9._:\-]{0,99}" disabled={disabled}
      placeholder="gpt-6.1-sol" autoComplete="off" spellCheck={false} onChange={event => onChange(event.target.value)} /></label>}
    <small role={failed ? "status" : undefined}>{failed ? s.modelsFallback : useDefault ? s.modelQueryHint : s.modelSettingsHint}</small>
  </div>;
}
