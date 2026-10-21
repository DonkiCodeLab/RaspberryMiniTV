// Only the embedding MiniTV window can control this instance.
(() => {
    let parentOrigin;
    try { parentOrigin = new URL(document.referrer).origin; } catch { return; }
    if (window.parent === window || parentOrigin === "null") return;
    // The embedding page provides the control editor for player one.
    window.EJS_Buttons = { ...(window.EJS_Buttons || {}), gamepad: false };
    const allowedInputs = new Set([0, 2, 3, 4, 5, 6, 7, 8]);
    if (game.system === "gba") { allowedInputs.add(10); allowedInputs.add(11); }
    if (game.system === "megadrive") [1, 9, 10, 11].forEach(button => allowedInputs.add(button));
    const held = new Set();
    const pressedAt = new Map();
    const releases = new Map();
    let managed = false, blocked = false, resumeAfterSettings = false;
    let mouseButtons = [];
    const keys = { ArrowUp: 4, ArrowDown: 5, ArrowLeft: 6, ArrowRight: 7, KeyZ: 8, KeyX: 0, KeyV: 2, Enter: 3 };
    if (game.system === "gba") Object.assign(keys, { KeyQ: 10, KeyE: 11 });
    if (game.system === "megadrive") Object.assign(keys, { KeyZ: 1, KeyX: 0, KeyC: 8, KeyA: 10, KeyS: 9, KeyD: 11 });
    const notify = (type, detail = {}) => window.parent.postMessage({ channel: "minitv-gameboy", type, ...detail }, parentOrigin);
    let pendingVolume = null;
    let wrappedVolume = null;
    const validVolume = value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
    const setVolume = value => {
        pendingVolume = value;
        const emulator = window.EJS_emulator;
        if (!emulator?.started || typeof emulator.setVolume !== "function") return;
        emulator.volume = value;
        emulator.setVolume(value);
        const audio = emulator.Module?.AL?.currentCtx?.audioCtx;
        if (value > 0 && audio?.state === "suspended") audio.resume().catch(() => {});
    };
    const input = (button, pressed, value) => {
        const emulator = window.EJS_emulator;
        if (!emulator?.started || !allowedInputs.has(button)) return;
        // A press on the photographed buttons happens outside the iframe.
        // Wake its audio driver too; a suspended driver can stall the core.
        const audio = emulator.Module?.AL?.currentCtx?.audioCtx;
        if (pressed && audio?.state === "suspended") audio.resume().catch(() => {});
        const changed = held.has(button) !== pressed;
        if (pressed) held.add(button); else held.delete(button);
        emulator.gameManager.simulateInput(0, button, pressed ? (value ?? (button >= 16 && button <= 23 ? 32767 : 1)) : 0);
        // Report the same state delivered to the core, including keyboard input
        // inside the iframe and releases after short taps or lost focus.
        if (changed) notify("input-state", { inputs: [...held] });
    };
    const release = () => {
        releases.forEach(clearTimeout);
        releases.clear();
        pressedAt.clear();
        for (const button of held) input(button, false);
    };
    const configure = () => {
        const emulator = window.EJS_emulator;
        if (!managed || !emulator?.started) return;
        // MiniTV polls the pads in the parent so capture and gameplay share one map.
        // Keep connection tracking and the native touch controls intact.
        for (const name of ["axischanged", "buttondown", "buttonup"]) emulator.gamepad?.on(name, () => {});
        if (blocked && !emulator.paused) { resumeAfterSettings = true; emulator.pause?.(true); }
        if (!blocked && resumeAfterSettings) { resumeAfterSettings = false; emulator.play?.(true); }
    };
    window.EJS_onGameStart = () => {
        const emulator = window.EJS_emulator;
        // Keep our slider in sync with the emulator's own expanded-view controls.
        if (typeof emulator?.setVolume === "function" && emulator.setVolume !== wrappedVolume) {
            const original = emulator.setVolume;
            wrappedVolume = function(value) {
                original.call(this, value);
                if (validVolume(value)) notify("volume-state", { volume: value });
            };
            emulator.setVolume = wrappedVolume;
        }
        configure();
        const controls = Array.from(document.querySelectorAll?.('.ejs_control_bar[data-index="0"]') || [])
            .map(element => ({ input: Number(element.getAttribute("data-id")), name: element.getAttribute("data-label") }))
            .filter(control => control.input >= 0 && control.input < 24);
        notify("ready", { inputMapping: true, controls });
        if (pendingVolume !== null) setVolume(pendingVolume);
    };
    window.addEventListener("message", event => {
        if (event.source !== window.parent || event.origin !== parentOrigin || event.data?.channel !== "minitv-gameboy") return;
        const data = event.data;
        if (data.type === "controls-config" && typeof data.blocked === "boolean" && Array.isArray(data.mouseButtons) &&
            data.mouseButtons.every(button => Number.isInteger(button) && button >= 0 && button <= 4)) {
            release(); managed = true; blocked = data.blocked; mouseButtons = data.mouseButtons;
            for (let button = 0; button < 24; button++) allowedInputs.add(button);
            configure();
        } else if (data.type === "volume" && validVolume(data.volume)) {
            setVolume(data.volume);
        } else if (data.type === "presentation" && typeof data.framed === "boolean") {
            release();
            document.body.classList.toggle("gameboy-framed", data.framed);
            window.dispatchEvent(new Event("resize"));
        } else if (data.type === "input" && typeof data.pressed === "boolean") {
            if (blocked || !allowedInputs.has(data.input)) return;
            const analog = data.input >= 16 && data.input <= 23;
            if (data.value !== undefined && (!Number.isInteger(data.value) || data.value < 0 || data.value > (analog ? 32767 : 1))) return;
            clearTimeout(releases.get(data.input));
            if (data.pressed) {
                pressedAt.set(data.input, performance.now());
                input(data.input, true, data.value);
            } else {
                // Very quick taps must survive at least one emulated frame.
                const delay = Math.max(0, 50 - (performance.now() - (pressedAt.get(data.input) ?? 0)));
                if (delay) releases.set(data.input, setTimeout(() => input(data.input, false), delay));
                else input(data.input, false);
            }
        } else if (data.type === "release") release();
    });
    const key = event => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.type === "keydown" && !blocked) notify("close");
            return;
        }
        if (managed) {
            if (event.target?.closest?.('input, select, textarea, button, a, [contenteditable="true"]')) return;
            if (event.type === "keydown" && (event.altKey || event.metaKey || event.ctrlKey) && !/^(Control|Alt|Meta)(Left|Right)$/.test(event.code)) return;
            event.preventDefault();
            // Stop every legacy binding, including keys that are now unassigned.
            event.stopImmediatePropagation();
            if (!blocked && !event.repeat) notify("physical-input", { device: "key", code: event.code, pressed: event.type === "keydown" });
            return;
        }
        if (!document.body.classList.contains("gameboy-framed") || keys[event.code] === undefined || event.altKey || event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        // Mega Drive uses Z/X/C and A/S/D, which differ from RetroArch defaults.
        // Avoid also firing the native mapping for a second, unrelated button.
        if (game.system === "megadrive") event.stopImmediatePropagation();
        if (!event.repeat) input(keys[event.code], event.type === "keydown");
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("keyup", key, true);
    const mouse = event => {
        if (!managed || !mouseButtons.includes(event.button)) return;
        if (event.type !== "mouseup" && event.target?.closest?.('button, input, select, a, .ejs_menu_bar, .ejs_popup, .ejs_virtualGamepad_parent')) return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (!blocked && ["mousedown", "mouseup"].includes(event.type)) notify("physical-input", { device: "mouse", button: event.button, pressed: event.type === "mousedown" });
    };
    for (const name of ["mousedown", "mouseup", "contextmenu", "auxclick"]) window.addEventListener(name, mouse, true);
    window.addEventListener("blur", () => { release(); if (managed) notify("input-focus", { focused: false }); });
    window.addEventListener("focus", () => { if (managed) notify("input-focus", { focused: true }); });
    document.addEventListener("visibilitychange", () => { if (document.hidden) release(); });
})();
