// Only the embedding MiniTV window can control this instance.
(() => {
    let parentOrigin;
    try { parentOrigin = new URL(document.referrer).origin; } catch { return; }
    if (window.parent === window || parentOrigin === "null") return;
    const allowedInputs = new Set([0, 2, 3, 4, 5, 6, 7, 8]);
    if (game.system === "gba") { allowedInputs.add(10); allowedInputs.add(11); }
    if (game.system === "megadrive") [1, 9, 10, 11].forEach(button => allowedInputs.add(button));
    const held = new Set();
    const pressedAt = new Map();
    const releases = new Map();
    const keys = { ArrowUp: 4, ArrowDown: 5, ArrowLeft: 6, ArrowRight: 7, KeyZ: 8, KeyX: 0, KeyV: 2, Enter: 3 };
    if (game.system === "gba") Object.assign(keys, { KeyQ: 10, KeyE: 11 });
    if (game.system === "megadrive") Object.assign(keys, { KeyZ: 1, KeyX: 0, KeyC: 8, KeyA: 10, KeyS: 9, KeyD: 11 });
    const notify = (type, detail = {}) => window.parent.postMessage({ channel: "minitv-gameboy", type, ...detail }, parentOrigin);
    const input = (button, pressed) => {
        const emulator = window.EJS_emulator;
        if (!emulator?.started || !allowedInputs.has(button)) return;
        // A press on the photographed buttons happens outside the iframe.
        // Wake its audio driver too; a suspended driver can stall the core.
        const audio = emulator.Module?.AL?.currentCtx?.audioCtx;
        if (pressed && audio?.state === "suspended") audio.resume().catch(() => {});
        const changed = held.has(button) !== pressed;
        if (pressed) held.add(button); else held.delete(button);
        emulator.gameManager.simulateInput(0, button, pressed ? 1 : 0);
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
    window.EJS_onGameStart = () => notify("ready");
    window.addEventListener("message", event => {
        if (event.source !== window.parent || event.origin !== parentOrigin || event.data?.channel !== "minitv-gameboy") return;
        const data = event.data;
        if (data.type === "presentation" && typeof data.framed === "boolean") {
            release();
            document.body.classList.toggle("gameboy-framed", data.framed);
            window.dispatchEvent(new Event("resize"));
        } else if (data.type === "input" && typeof data.pressed === "boolean") {
            if (!allowedInputs.has(data.input)) return;
            clearTimeout(releases.get(data.input));
            if (data.pressed) {
                pressedAt.set(data.input, performance.now());
                input(data.input, true);
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
            if (event.type === "keydown") notify("close");
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
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", () => { if (document.hidden) release(); });
})();
