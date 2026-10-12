import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../DeviceApp/templates/gameboy_bridge.js', import.meta.url), 'utf8');
function bridge(system = 'gb') {
  const events = {}, inputs = [], messages = [], volumes = [];
  const timers = new Map();
  const classes = new Set(['gameboy-framed']);
  const parent = { postMessage: (...args) => messages.push(args) };
  const window = {
    parent, EJS_emulator: { started: true, volume: .5, setVolume(value) { volumes.push(value); this.muted = value === 0; },
      gameManager: { simulateInput: (...args) => inputs.push(args) } },
    addEventListener: (name, fn) => { events[name] = fn; }, dispatchEvent() {},
  };
  const document = {
    referrer: 'http://minitv.local:5050/', hidden: false,
    body: { classList: { contains: name => classes.has(name), toggle: (name, value) => value ? classes.add(name) : classes.delete(name) } },
    addEventListener: (name, fn) => { events[name] = fn; },
  };
  runInNewContext(source, { window, document, game: { system }, URL, Event: class {}, performance: { now: () => 100 },
    setTimeout: fn => { const id = timers.size + 1; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) });
  const message = (data, extra = {}) => events.message({ origin: 'http://minitv.local:5050', source: parent, data: { channel: 'minitv-gameboy', ...data }, ...extra });
  return { events, inputs, messages, volumes, window, document, classes, message, flush: () => { timers.forEach(fn => fn()); timers.clear(); } };
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

test('GBA shoulder buttons work with the photograph and keyboard, but not on GB/GBC', () => {
  for (const system of ['gb', 'gbc', 'gba']) {
    const b = bridge(system);
    b.message({ type: 'input', input: 10, pressed: true });
    b.events.keydown({ code: 'KeyE', key: 'e', type: 'keydown', preventDefault() {} });
    b.message({ type: 'release' });
    assert.deepEqual(b.inputs, system === 'gba' ? [[0, 10, 1], [0, 11, 1], [0, 10, 0], [0, 11, 0]] : []);
  }
});

test('visual states follow simultaneous pointer and iframe keyboard inputs and clear on release', () => {
  const b = bridge('gba');
  const states = () => b.messages.filter(([data]) => data.type === 'input-state').map(([data, origin]) => {
    assert.equal(origin, 'http://minitv.local:5050');
    return Array.from(data.inputs);
  });
  b.message({ type: 'input', input: 7, pressed: true });
  b.events.keydown({ code: 'KeyZ', type: 'keydown', preventDefault() {} });
  b.message({ type: 'input', input: 10, pressed: true });
  assert.deepEqual(states(), [[7], [7, 8], [7, 8, 10]]);
  b.events.keyup({ code: 'KeyZ', type: 'keyup', preventDefault() {} });
  assert.deepEqual(states().at(-1), [7, 10]);
  b.events.blur();
  assert.deepEqual(states().at(-1), []);
});

test('visual feedback lasts exactly as long as a short tap sent to the emulator', () => {
  const b = bridge();
  b.message({ type: 'input', input: 8, pressed: true });
  b.message({ type: 'input', input: 8, pressed: false });
  assert.deepEqual(Array.from(b.messages.at(-1)[0].inputs), [8]);
  b.flush();
  assert.deepEqual(Array.from(b.messages.at(-1)[0].inputs), []);
  assert.deepEqual(b.inputs, [[0, 8, 1], [0, 8, 0]]);
});

test('Mega Drive keyboard sends the six Sega buttons without triggering native duplicate bindings', () => {
  const b = bridge('megadrive');
  for (const [code, input] of [['KeyZ',1],['KeyX',0],['KeyC',8],['KeyA',10],['KeyS',9],['KeyD',11],['KeyV',2]]) {
    let stopped = false;
    b.events.keydown({code, type:'keydown', preventDefault() {}, stopImmediatePropagation() {stopped=true;} });
    assert.equal(stopped, true);
    assert.deepEqual(b.inputs.at(-1), [0,input,1]);
    assert.ok(b.messages.at(-1)[0].inputs.includes(input));
  }
  b.message({type:'presentation',framed:false});
  assert.deepEqual(Array.from(b.messages.at(-1)[0].inputs), []);
  const count = b.inputs.length;
  b.events.keydown({code:'KeyZ', type:'keydown', preventDefault() {throw Error('Expanded mode uses native controls');} });
  assert.equal(b.inputs.length, count);
});

test('volume accepts only finite levels from the exact embedding window', () => {
  const b = bridge('nes');
  b.window.EJS_onGameStart();
  for (const volume of [-.1, 1.1, NaN, Infinity, '0.5', null]) b.message({type:'volume',volume});
  b.message({type:'volume',volume:.3}, {origin:'https://unrelated.example'});
  b.message({type:'volume',volume:.3}, {source:{}});
  assert.deepEqual(b.volumes, []);
  for (const volume of [.25, 0, 1]) b.message({type:'volume',volume});
  assert.deepEqual(b.volumes, [.25, 0, 1]);
  assert.equal(b.window.EJS_emulator.volume, 1);
  assert.equal(b.messages.at(-1)[0].type, 'volume-state');
  assert.equal(b.messages.at(-1)[0].volume, 1);
});

test('volume chosen during loading is applied on start, and native mute stays synchronized', () => {
  const b = bridge();
  b.window.EJS_emulator.started = false;
  b.message({type:'volume',volume:.2});
  b.message({type:'volume',volume:.65});
  assert.deepEqual(b.volumes, []);
  b.window.EJS_emulator.started = true;
  b.window.EJS_onGameStart();
  assert.deepEqual(b.volumes, [.65]);
  b.window.EJS_emulator.setVolume(0);
  assert.equal(b.messages.at(-1)[0].volume, 0);
  b.window.EJS_emulator.setVolume(.4);
  assert.equal(b.messages.at(-1)[0].volume, .4);
  b.window.EJS_onGameStart();
  const count = b.messages.length;
  b.window.EJS_emulator.setVolume(.3);
  assert.equal(b.messages.length, count + 1); // Restarts don't install duplicate hooks.
});
