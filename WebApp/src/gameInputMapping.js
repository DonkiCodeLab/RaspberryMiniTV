import { gameConsoleFrame } from "./gameConsoleFrames.js";

export const DIRECTION_INPUTS = [4, 6, 5, 7];
export const directionSymbols = { 4: "↑", 5: "↓", 6: "←", 7: "→" };
const defaultKeys = ["KeyX", "KeyS", "KeyV", "Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyZ", "KeyA", "KeyQ", "KeyE", "Tab", "KeyR", null, null, "KeyH", "KeyF", "KeyG", "KeyT", "KeyL", "KeyJ", "KeyK", "KeyI"];
const defaultButtons = [1, 3, 8, 9, 12, 13, 14, 15, 0, 2, 4, 5, 6, 7, 10, 11];
const storageKey = system => `minitv.gameBindings.v1.${system}`;
export const isAnalogInput = input => input >= 16 && input <= 23;

export function gameControls(system, nativeControls = []) {
  const frame = gameConsoleFrame(system);
  if (!frame) return nativeControls.filter(control => Number.isInteger(control.input) && control.input >= 0 && control.input < 24 && typeof control.name === "string");
  const controls = frame.buttons.map(({ input, name }) => ({ input, name }));
  if (system === "megadrive") controls.push({ input: 10, name: "X" }, { input: 9, name: "Y" }, { input: 11, name: "Z" }, { input: 2, name: "Mode" });
  return controls;
}

export function defaultGameBindings(system, controls) {
  const frame = gameConsoleFrame(system);
  return Object.fromEntries(controls.map(({ input }) => {
    const code = frame ? Object.keys(frame.keys).find(code => frame.keys[code] === input) : defaultKeys[input];
    const bindings = code ? [{ type: "key", code }] : [];
    if (input < 16) bindings.push({ type: "padButton", pad: 0, button: defaultButtons[input] });
    else bindings.push({ type: "padAxis", pad: 0, axis: Math.floor((input - 16) / 2), direction: input % 2 ? -1 : 1 });
    return [input, bindings];
  }));
}

export function validBinding(binding) {
  if (!binding || typeof binding !== "object") return false;
  const index = value => Number.isInteger(value) && value >= 0 && value < 128;
  if (binding.type === "key") return typeof binding.code === "string" && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(binding.code) && binding.code !== "Escape";
  if (binding.type === "mouse") return index(binding.button) && binding.button <= 4;
  if (!index(binding.pad)) return false;
  if (binding.type === "padButton") return index(binding.button);
  return binding.type === "padAxis" && index(binding.axis) && [-1, 1].includes(binding.direction);
}

export function bindingId(binding) {
  if (binding.type === "key") return `key:${binding.code}`;
  if (binding.type === "mouse") return `mouse:${binding.button}`;
  if (binding.type === "padButton") return `pad:${binding.pad}:button:${binding.button}`;
  return `pad:${binding.pad}:axis:${binding.axis}:${binding.direction}`;
}

export function readGameBindings(system, controls, storage) {
  const defaults = defaultGameBindings(system, controls);
  try {
    const saved = JSON.parse((storage || globalThis.localStorage).getItem(storageKey(system)));
    if (saved?.version !== 1 || !saved.bindings || typeof saved.bindings !== "object") return defaults;
    const seen = new Set();
    return Object.fromEntries(Object.entries(defaults).map(([input, fallback]) => {
      const list = saved.bindings[input];
      const bindings = Array.isArray(list) && list.length <= 4 && list.every(validBinding) ? list : fallback;
      return [input, bindings.filter(binding => {
        const id = bindingId(binding);
        if (seen.has(id)) return false;
        seen.add(id); return true;
      })];
    }));
  } catch { return defaults; }
}

export function saveGameBindings(system, bindings, storage) {
  try { (storage || globalThis.localStorage).setItem(storageKey(system), JSON.stringify({ version: 1, bindings })); return true; }
  catch { return false; }
}

// A physical control has one destination. Reassigning it moves it explicitly.
export function assignGameBinding(bindings, input, slot, binding) {
  if (!validBinding(binding)) return bindings;
  return Object.fromEntries(Object.entries(bindings).map(([key, list]) => {
    const next = Number(key) === input ? [...list.slice(0, slot), binding, ...list.slice(slot + 1)] : list;
    return [key, next.filter((item, index) => bindingId(item) !== bindingId(binding) || (Number(key) === input && index === slot))];
  }));
}

export function bindingLabel(binding, t, compact = false) {
  if (binding.type === "key") return ({ ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Space: t("game_mapping_space") })[binding.code] || binding.code.replace(/^(Key|Digit)/, "");
  if (binding.type === "mouse") return compact ? `🖱${binding.button + 1}` : t("game_mapping_mouse", { button: binding.button + 1 });
  const pad = binding.pad + 1;
  if (binding.type === "padButton") return compact ? `G${pad}·B${binding.button + 1}` : t("game_mapping_pad_button", { pad, button: binding.button + 1 });
  const direction = binding.direction > 0 ? "+" : "−";
  return compact ? `G${pad}·E${binding.axis + 1}${direction}` : t("game_mapping_pad_axis", { pad, axis: binding.axis + 1, direction });
}

export function controlLabel(control, t) {
  return directionSymbols[control.input] ? t(`gameboy_button_${({ 4: "up", 5: "down", 6: "left", 7: "right" })[control.input]}`) : control.name;
}

export function readGamepads() {
  try { return Array.from(navigator.getGamepads?.() || []).filter(pad => pad?.connected !== false && pad); }
  catch { return []; }
}
const buttonDown = button => typeof button === "number" ? button > .5 : Boolean(button?.pressed || button?.value > .5);

// Ignore controls already held when capture begins, and require axes to rest first.
export function createGamepadCapture(initialPads) {
  const armed = new Set();
  const sample = (pads, detect) => {
    let found = null;
    for (const pad of pads) {
      pad.buttons.forEach((button, index) => {
        const id = `${pad.index}:b${index}`;
        if (!buttonDown(button)) armed.add(id);
        else if (detect && armed.has(id) && !found) found = { type: "padButton", pad: pad.index, button: index };
      });
      pad.axes.forEach((value, axis) => {
        const id = `${pad.index}:a${axis}`;
        if (Math.abs(value) < .25) armed.add(id);
        else if (detect && Math.abs(value) > .65 && armed.has(id) && !found) found = { type: "padAxis", pad: pad.index, axis, direction: Math.sign(value) };
      });
    }
    return found;
  };
  sample(initialPads, false);
  return pads => sample(pads, true);
}

// Merge sources before emitting so releasing the keyboard cannot release a held pad.
export function createGameInputRouter(bindings, emit) {
  const physical = new Set(), virtual = new Set(), values = new Map();
  let pads = [];
  function update() {
    for (const [key, list] of Object.entries(bindings)) {
      const input = Number(key), previous = values.get(input) || 0;
      let value = virtual.has(input) ? 1 : 0;
      for (const binding of list) {
        let amount = 0;
        if (binding.type === "key" || binding.type === "mouse") amount = physical.has(bindingId(binding)) ? 1 : 0;
        else {
          const pad = pads.find(pad => pad.index === binding.pad);
          if (binding.type === "padButton") amount = buttonDown(pad?.buttons[binding.button]) ? 1 : 0;
          else {
            const axis = (pad?.axes[binding.axis] || 0) * binding.direction;
            amount = isAnalogInput(input) ? (axis > .15 ? Math.min(1, axis) : 0) : (axis > (previous ? .35 : .55) ? 1 : 0);
          }
        }
        value = Math.max(value, amount);
      }
      value = isAnalogInput(input) ? Math.round(value * 32767) : value;
      if (value !== previous) { values.set(input, value); emit(input, value); }
    }
  }
  return {
    physical(binding, pressed) {
      const id = bindingId(binding);
      const used = Object.values(bindings).some(list => list.some(item => bindingId(item) === id));
      if (pressed) physical.add(id); else physical.delete(id);
      update(); return used;
    },
    virtual(input, pressed) { if (pressed) virtual.add(input); else virtual.delete(input); update(); },
    gamepads(next) { pads = next; update(); },
    release() { physical.clear(); virtual.clear(); pads = []; update(); },
  };
}
