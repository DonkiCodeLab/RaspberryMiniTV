import { useCallback, useEffect, useRef } from "react";
import { createGameInputRouter, readGamepads } from "./gameInputMapping.js";

export default function useGameInput({ bindings, enabled, blocked, send, frame, origin }) {
  const router = useRef(null);
  useEffect(() => {
    if (!enabled || blocked) return;
    const inputs = createGameInputRouter(bindings, (input, value) => send({ type: "input", input, pressed: value > 0, value }));
    router.current = inputs;
    let animation;
    let active = document.hasFocus() && !document.hidden;
    const key = event => {
      if (event.target instanceof HTMLElement && (event.target.closest("input, select, textarea, [contenteditable=true]") ||
        (["Enter", "Space"].includes(event.code) && event.target.closest("button")))) return;
      if (event.repeat || (event.type === "keydown" && (event.altKey || event.metaKey || event.ctrlKey) && !/^(Control|Alt|Meta)(Left|Right)$/.test(event.code))) return;
      if (inputs.physical({ type: "key", code: event.code }, event.type === "keydown")) event.preventDefault();
    };
    const mouse = event => {
      if (event.type === "mousedown" && (!(event.target instanceof HTMLElement) || !event.target.closest(".browser-game__stage") || event.target.closest("button, input, select, a"))) return;
      if (inputs.physical({ type: "mouse", button: event.button }, event.type === "mousedown")) event.preventDefault();
    };
    const context = event => {
      if (event.target instanceof HTMLElement && event.target.closest(".browser-game__stage") &&
        Object.values(bindings).some(list => list.some(binding => binding.type === "mouse" && binding.button === 2))) event.preventDefault();
    };
    const release = () => { inputs.release(); send({ type: "release" }); };
    const blur = () => { active = false; release(); };
    const focus = () => { active = true; };
    const visibility = () => { if (document.hidden) blur(); else active = document.hasFocus(); };
    const message = event => {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow || event.data?.channel !== "minitv-gameboy") return;
      const data = event.data;
      if (data.type === "physical-input" && typeof data.pressed === "boolean") {
        if (data.device === "key" && typeof data.code === "string") inputs.physical({ type: "key", code: data.code }, data.pressed);
        if (data.device === "mouse" && Number.isInteger(data.button)) inputs.physical({ type: "mouse", button: data.button }, data.pressed);
      }
      if (data.type === "input-focus") { active = data.focused === true; if (!active) release(); }
    };
    const poll = () => {
      // hasFocus remains true while a child iframe has focus.
      if (!document.hidden && (active || document.hasFocus())) inputs.gamepads(readGamepads());
      animation = requestAnimationFrame(poll);
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    window.addEventListener("mousedown", mouse);
    window.addEventListener("mouseup", mouse);
    window.addEventListener("contextmenu", context);
    window.addEventListener("message", message);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    poll();
    return () => {
      cancelAnimationFrame(animation);
      release(); router.current = null;
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      window.removeEventListener("mousedown", mouse);
      window.removeEventListener("mouseup", mouse);
      window.removeEventListener("contextmenu", context);
      window.removeEventListener("message", message);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [bindings, enabled, blocked, send, frame, origin]);
  return useCallback((input, pressed) => router.current?.virtual(input, pressed), []);
}
