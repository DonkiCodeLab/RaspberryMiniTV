import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../DeviceApp/templates/gameboy_bridge.js', import.meta.url), 'utf8');
function bridge() {
  const events = {}, inputs = [], messages = [];
  const timers = new Map();
  const classes = new Set(['gameboy-framed']);
  const parent = { postMessage: (...args) => messages.push(args) };
  const window = {
    parent, EJS_emulator: { started: true, gameManager: { simulateInput: (...args) => inputs.push(args) } },
    addEventListener: (name, fn) => { events[name] = fn; }, dispatchEvent() {},
  };
  const document = {
    referrer: 'http://minitv.local:5050/', hidden: false,
    body: { classList: { contains: name => classes.has(name), toggle: (name, value) => value ? classes.add(name) : classes.delete(name) } },
    addEventListener: (name, fn) => { events[name] = fn; },
  };
  runInNewContext(source, { window, document, URL, Event: class {}, performance: { now: () => 100 },
    setTimeout: fn => { const id = timers.size + 1; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) });
  const message = (data, extra = {}) => events.message({ origin: 'http://minitv.local:5050', source: parent, data: { channel: 'minitv-gameboy', ...data }, ...extra });
  return { events, inputs, messages, window, document, classes, message, flush: () => { timers.forEach(fn => fn()); timers.clear(); } };
}

test('only accepts controls from the embedding window and exact origin', () => {
  const b = bridge();
  const press = { type: 'input', input: 8, pressed: true };
  b.message(press, { origin: 'https://unrelated.example' });
  b.message(press, { source: {} });
  b.message({ ...press, channel: 'other' });
  b.message({ ...press, input: 99 });
  b.message({ ...press, input: '8' });
  b.message({ ...press, pressed: 'true' });
  assert.deepEqual(b.inputs, []);
  b.message(press);
  b.message({ ...press, pressed: false });
  b.flush();
  assert.deepEqual(b.inputs, [[0, 8, 1], [0, 8, 0]]);
});

test('ignores input before the emulator is ready', () => {
  const b = bridge();
  b.window.EJS_emulator.started = false;
  b.message({ type: 'input', input: 3, pressed: true });
  assert.deepEqual(b.inputs, []);
  b.window.EJS_onGameStart();
  assert.equal(b.messages[0][0].type, 'ready');
});

test('releases all held directions/buttons when focus or visibility is lost', () => {
  for (const action of ['blur', 'visibilitychange', 'release']) {
    const b = bridge();
    b.message({ type: 'input', input: 7, pressed: true });
    b.message({ type: 'input', input: 8, pressed: true });
    if (action === 'release') b.message({ type: 'release' });
    else { b.document.hidden = true; b.events[action](); }
    assert.deepEqual(b.inputs, [[0, 7, 1], [0, 8, 1], [0, 7, 0], [0, 8, 0]]);
  }
});

test('expanding releases held input and changes presentation without replacing the emulator', () => {
  const b = bridge(), emulator = b.window.EJS_emulator;
  b.message({ type: 'input', input: 4, pressed: true });
  b.message({ type: 'presentation', framed: false });
  assert.equal(b.classes.has('gameboy-framed'), false);
  assert.deepEqual(b.inputs, [[0, 4, 1], [0, 4, 0]]);
  b.message({ type: 'presentation', framed: true });
  assert.equal(b.classes.has('gameboy-framed'), true);
  assert.equal(b.window.EJS_emulator, emulator);
});

test('keyboard controls leave native emulator activation listeners intact', () => {
  const b = bridge();
  let stopped = false;
  const event = { code: 'KeyZ', key: 'z', type: 'keydown', preventDefault() {}, stopImmediatePropagation() { stopped = true; } };
  b.events.keydown(event);
  b.events.keyup({ ...event, type: 'keyup' });
  assert.deepEqual(b.inputs, [[0, 8, 1], [0, 8, 0]]);
  assert.equal(stopped, false);
  b.events.keydown({ ...event, key: 'Escape' });
  assert.equal(b.messages.at(-1)[0].type, 'close');
});

test('a short tap lasts an emulated frame, while blur releases it immediately', () => {
  const b = bridge();
  b.message({ type: 'input', input: 3, pressed: true });
  b.message({ type: 'input', input: 3, pressed: false });
  assert.deepEqual(b.inputs, [[0, 3, 1]]);
  b.events.blur();
  b.flush();
  assert.deepEqual(b.inputs, [[0, 3, 1], [0, 3, 0]]);
});

test('a photographed button resumes suspended emulator audio', () => {
  const b = bridge();
  let resumed = false;
  b.window.EJS_emulator.Module = { AL: { currentCtx: { audioCtx: { state: 'suspended', resume: () => { resumed = true; return Promise.resolve(); } } } } };
  b.message({ type: 'input', input: 3, pressed: true });
  assert.equal(resumed, true);
});
