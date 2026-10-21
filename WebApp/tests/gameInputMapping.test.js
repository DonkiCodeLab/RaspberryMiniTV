import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignGameBinding, bindingLabel, createGameInputRouter, createGamepadCapture, defaultGameBindings, gameControls, readGameBindings, saveGameBindings } from '../src/gameInputMapping.js';
import { GAME_MAPPING_STRINGS } from '../src/gameMappingStrings.js';

const key = code => ({ type: 'key', code });
const button = (button, pad = 0) => ({ type: 'padButton', pad, button });
const axis = (axis, direction, pad = 0) => ({ type: 'padAxis', pad, axis, direction });
const pad = (axes = [0, 0], buttons = [false], index = 0) => ({ index, connected: true, axes, buttons: buttons.map(pressed => ({ pressed, value: Number(pressed) })) });

test('defaults match console artwork, include six-button Sega and use native controls for other systems', () => {
  for (const system of ['gb', 'gbc', 'gba', 'megadrive']) {
    const controls = gameControls(system), mapping = defaultGameBindings(system, controls);
    assert.equal(controls.length, system === 'megadrive' ? 12 : system === 'gba' ? 10 : 8);
    assert.deepEqual(mapping[system === 'megadrive' ? 1 : 8][0], key('KeyZ'));
  }
  assert.deepEqual(gameControls('nes', [{input:8,name:'A'}, {input:24,name:'Save'}, {input:'3',name:'Invalid'}]), [{input:8,name:'A'}]);
});

test('moving a binding removes its previous destination and leaves other devices available', () => {
  const mapping = { 8: [key('KeyZ'), button(0)], 0: [key('KeyX'), button(1)] };
  const updated = assignGameBinding(mapping, 8, 0, key('KeyX'));
  assert.deepEqual(updated, { 8: [key('KeyX'), button(0)], 0: [button(1)] });
  assert.deepEqual(mapping[0], [key('KeyX'), button(1)]);
  assert.deepEqual(assignGameBinding(updated, 8, 1, key('KeyX'))[8], [key('KeyX')]);
  assert.equal(assignGameBinding(mapping, 8, 0, key('Escape')), mapping);
});

test('mappings persist per system, preserve unassigned buttons, and survive damaged/denied storage', () => {
  const values = new Map(), storage = { getItem: id => values.get(id) || null, setItem: (id, value) => values.set(id, value) };
  const controls = gameControls('gb'), defaults = defaultGameBindings('gb', controls);
  const custom = { ...defaults, 8: [{type:'mouse',button:2}], 0: [] };
  assert.equal(saveGameBindings('gb', custom, storage), true);
  assert.deepEqual(readGameBindings('gb', controls, storage), custom);
  assert.deepEqual(readGameBindings('gbc', controls, storage), defaults);
  const id = [...values.keys()][0];
  values.set(id, '{bad');
  assert.deepEqual(readGameBindings('gb', controls, storage), defaults);
  values.set(id, JSON.stringify({ version: 1, bindings: { 8: [{type:'padAxis', pad:0, axis:0, direction:0}], 0: [] } }));
  assert.deepEqual(readGameBindings('gb', controls, storage)[8], defaults[8]);
  const denied = { getItem() {throw Error('Denied');}, setItem() {throw Error('Denied');} };
  assert.deepEqual(readGameBindings('gb', controls, denied), defaults);
  assert.equal(saveGameBindings('gb', custom, denied), false);
});

test('runtime merges keyboard, mouse, touch and pad presses and releases disconnected pads', () => {
  const events = [], mouse = { type:'mouse', button:2 };
  const router = createGameInputRouter({8:[key('KeyC'), mouse, button(0)]}, (...event) => events.push(event));
  assert.equal(router.physical(key('KeyZ'), true), false);
  router.physical(key('KeyC'), true);
  router.gamepads([pad([0,0],[true])]);
  router.physical(key('KeyC'), false);
  assert.deepEqual(events, [[8,1]]);
  router.physical(mouse,true);
  router.gamepads([]);
  router.virtual(8,true);
  router.physical(mouse,false);
  assert.deepEqual(events, [[8,1]]);
  router.virtual(8,false);
  assert.deepEqual(events, [[8,1],[8,0]]);
  router.gamepads([pad([0,0],[true])]);
  router.gamepads([]);
  assert.deepEqual(events.slice(-2), [[8,1],[8,0]]);
});

test('axis directions use a deadzone and hysteresis for digital buttons, with analog magnitude preserved', () => {
  const events = [];
  const router = createGameInputRouter({6:[axis(0,-1)],7:[axis(0,1)],16:[axis(1,1)]}, (...event) => events.push(event));
  router.gamepads([pad([.2,0])]); assert.deepEqual(events, []);
  router.gamepads([pad([.8,0])]); assert.deepEqual(events, [[7,1]]);
  router.gamepads([pad([.45,0])]); assert.deepEqual(events, [[7,1]]);
  router.gamepads([pad([-.9,.8])]);
  assert.deepEqual(events.slice(-3), [[6,1],[7,0],[16,26214]]);
  router.release(); assert.deepEqual(events.slice(-2), [[6,0],[16,0]]);
});

test('capture ignores held buttons, drift, and resting trigger axes until returned to neutral', () => {
  const detect = createGamepadCapture([pad([-.95,.1],[true])]);
  assert.equal(detect([pad([-1,.2],[true])]), null);
  assert.equal(detect([pad([0,.1],[false])]), null);
  assert.deepEqual(detect([pad([-.8,.1],[false])]), axis(0,-1));
  const detectButton = createGamepadCapture([pad([0,0],[false],2)]);
  assert.deepEqual(detectButton([pad([0,0],[true],2)]), button(0,2));
  const hotplug = createGamepadCapture([]);
  assert.equal(hotplug([pad([1,0],[true])]), null);
  assert.equal(hotplug([pad([0,0],[false])]), null);
  assert.deepEqual(hotplug([pad([.9,0],[false])]), axis(0,1));
});

test('help labels reflect each device, gamepad slot and axis direction in every language', () => {
  for (const language of ['es','ca','en']) {
    const t = (key, vars = {}) => Object.entries(vars).reduce((s,[key,value]) => s.replaceAll(`{${key}}`,value), GAME_MAPPING_STRINGS[language][key]);
    assert.equal(bindingLabel(key('KeyC'),t), 'C');
    assert.match(bindingLabel({type:'mouse',button:2},t), /3/);
    assert.match(bindingLabel(axis(1,-1,2),t), /3.*2.*−/);
    assert.equal(bindingLabel(axis(1,-1,2),t,true), 'G3·E2−');
  }
});
