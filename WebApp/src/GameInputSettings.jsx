import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { assignGameBinding, bindingId, bindingLabel, controlLabel, createGamepadCapture, defaultGameBindings, readGamepads } from "./gameInputMapping.js";
import "./GameInputSettings.css";

export default function GameInputSettings({ system, controls, bindings, onChange, onClose, t }) {
  const dialog = useRef(null), bindingButton = useRef(null), capturePanel = useRef(null);
  const [capture, setCapture] = useState(null);
  const [status, setStatus] = useState("");
  const [storageFailed, setStorageFailed] = useState(false);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  const change = next => { setStorageFailed(!onChange(next)); };
  useEffect(() => {
    if (!capture) { bindingButton.current?.focus({ preventScroll: true }); return; }
    capturePanel.current?.focus({ preventScroll: true });
    let animation, complete = false;
    const finish = binding => {
      if (complete) return;
      complete = true;
      const reassigned = controls.filter(control => control.input !== capture.input && bindings[control.input]?.some(item => bindingId(item) === bindingId(binding)));
      setStorageFailed(!onChange(assignGameBinding(bindings, capture.input, capture.slot, binding)));
      setStatus(t("game_mapping_assigned", { binding: bindingLabel(binding, t), control: controlLabel(controls.find(control => control.input === capture.input), t) }) +
        (reassigned.length ? ` ${t("game_mapping_moved", { control: reassigned.map(control => controlLabel(control, t)).join(", ") })}` : ""));
      setCapture(null);
    };
    const key = event => {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.type !== "keydown" || event.repeat) return;
      if (event.code === "Escape") { setCapture(null); return; }
      if (event.code && event.code !== "Unidentified" && !event.isComposing) finish({ type: "key", code: event.code });
    };
    const mouse = event => {
      if (event.target.closest?.("[data-cancel-capture]")) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.button >= 0 && event.button <= 4) finish({ type: "mouse", button: event.button });
    };
    const suppress = event => { if (!event.target.closest?.("[data-cancel-capture]")) { event.preventDefault(); event.stopImmediatePropagation(); } };
    const detect = createGamepadCapture(readGamepads());
    const poll = () => { const binding = detect(readGamepads()); if (binding) finish(binding); if (!complete) animation = requestAnimationFrame(poll); };
    const cancel = () => setCapture(null);
    window.addEventListener("keydown", key, true);
    window.addEventListener("keyup", key, true);
    window.addEventListener("pointerdown", mouse, true);
    window.addEventListener("contextmenu", suppress, true);
    window.addEventListener("blur", cancel);
    poll();
    return () => {
      cancelAnimationFrame(animation);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("keyup", key, true);
      window.removeEventListener("pointerdown", mouse, true);
      window.removeEventListener("contextmenu", suppress, true);
      window.removeEventListener("blur", cancel);
    };
  }, [capture, bindings, controls, onChange, t]);

  return createPortal(<dialog ref={dialog} className="game-input-settings" aria-labelledby="game-input-title" aria-describedby="game-input-description"
    onCancel={event => { event.preventDefault(); event.stopPropagation(); if (capture) setCapture(null); else onClose(); }}>
    <div className="game-input-settings__header"><div><h2 id="game-input-title">{t("game_mapping_title")}</h2><p>{t("game_mapping_player")}</p></div>
      <button type="button" onClick={onClose} disabled={Boolean(capture)} aria-label={t("close")}>×</button></div>
    <p id="game-input-description">{t("game_mapping_description")}</p>
    <div className="game-input-settings__list">
      {controls.map(control => <div className="game-input-settings__row" key={control.input}>
        <strong>{controlLabel(control, t)}</strong><div className="game-input-settings__bindings">
          {(bindings[control.input] || []).map((binding, slot) => <span key={slot}>
            <button type="button" disabled={Boolean(capture)} aria-label={`${controlLabel(control, t)}: ${bindingLabel(binding, t)}`}
              onClick={event => { bindingButton.current = event.currentTarget; setCapture({ input: control.input, slot }); setStatus(""); }}>{bindingLabel(binding, t)}</button>
            <button type="button" className="game-input-settings__remove" disabled={Boolean(capture)} aria-label={t("game_mapping_remove", { binding: bindingLabel(binding, t), control: controlLabel(control, t) })}
              onClick={() => change({ ...bindings, [control.input]: bindings[control.input].filter((_, index) => index !== slot) })}>×</button>
          </span>)}
          {(!bindings[control.input]?.length || bindings[control.input].length < 4) && <button type="button" className="game-input-settings__add" disabled={Boolean(capture)}
            aria-label={`${t("game_mapping_add")}: ${controlLabel(control, t)}`}
            onClick={event => { bindingButton.current = event.currentTarget; setCapture({ input: control.input, slot: bindings[control.input]?.length || 0 }); setStatus(""); }}>
            {bindings[control.input]?.length ? "+" : t("game_mapping_unassigned")}</button>}
        </div>
      </div>)}
    </div>
    <p className="game-input-settings__status" role="status">{storageFailed ? t("game_mapping_storage_failed") : status || t("game_mapping_saved")}</p>
    <footer><button type="button" disabled={Boolean(capture)} onClick={() => { change(defaultGameBindings(system, controls)); setStatus(t("game_mapping_reset_done")); }}>{t("game_mapping_reset")}</button>
      <button type="button" className="game-input-settings__done" disabled={Boolean(capture)} onClick={onClose}>{t("game_mapping_done")}</button></footer>
    {capture && <div ref={capturePanel} tabIndex={-1} className="game-input-settings__capture" role="group" aria-label={t("game_mapping_waiting")}>
      <span aria-hidden="true">◎</span><h3>{controlLabel(controls.find(control => control.input === capture.input), t)}</h3>
      <p role="status">{t("game_mapping_waiting")}</p><small>{t("game_mapping_capture_hint")}</small>
      <button type="button" data-cancel-capture onClick={() => setCapture(null)}>{t("game_mapping_cancel")}</button>
    </div>}
  </dialog>, document.body);
}
