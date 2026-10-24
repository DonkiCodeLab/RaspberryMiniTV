import test from 'node:test';
import assert from 'node:assert/strict';
import { attachPhotoDragSelection, selectionScrollSpeed } from '../src/photoDragSelection.js';

function fixture(initial = []) {
  const emitter = () => ({ listeners: new Map(),
    addEventListener(type, handler) { this.listeners.set(type, handler); },
    removeEventListener(type) { this.listeners.delete(type); } });
  const selected = new Set(initial), changes = [], frames = new Map(), timers = new Map(), captures = new Set(), classes = new Set();
  let serial = 0;
  const win = { ...emitter(), innerWidth: 400, innerHeight: 240,
    requestAnimationFrame: fn => { frames.set(++serial, fn); return serial; }, cancelAnimationFrame: id => frames.delete(id),
    setTimeout: fn => { timers.set(++serial, fn); return serial; }, clearTimeout: id => timers.delete(id) };
  const scroller = { scrollTop: 0 };
  const cards = Array.from({ length: 24 }, (_, i) => {
    const card = { dataset: { photoSelectId: String(i) }, closest: () => card };
    card.control = { closest: selector => selector === '[data-photo-select-start]' ? card.control : card };
    return card;
  });
  const doc = { ...emitter(), defaultView: win, scrollingElement: scroller,
    elementFromPoint(x, y) {
      if (x < 10 || x >= 360 || y < 0 || y >= 240) return null;
      const col = Math.floor((x - 10) / 120), row = Math.floor((y + scroller.scrollTop) / 120);
      if ((x - 10) % 120 >= 100 || (y + scroller.scrollTop) % 120 >= 100) return null;
      return cards[row * 3 + col] || null;
    } };
  const grid = { ...emitter(), ownerDocument: doc, parentElement: null, contains: card => cards.includes(card),
    classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
    getBoundingClientRect: () => ({ left: 10, right: 360, top: -scroller.scrollTop, bottom: 960 - scroller.scrollTop }),
    setPointerCapture: id => captures.add(id), hasPointerCapture: id => captures.has(id), releasePointerCapture: id => captures.delete(id) };
  const destroy = attachPhotoDragSelection(grid, id => selected.has(id), (ids, select) => {
    changes.push({ ids, select });
    for (const id of ids) { if (select) selected.add(id); else selected.delete(id); }
  });
  const fire = (type, x = 50, y = 50, extra = {}) => {
    const event = { type, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1,
      target: doc.elementFromPoint(x, y)?.control, detail: 1,
      preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra };
    if (type === 'pointerdown') { doc.listeners.get(type)?.(event); grid.listeners.get(type)?.(event); }
    else (grid.listeners.get(type) || doc.listeners.get(type) || win.listeners.get(type))?.(event);
    return event;
  };
  const tick = time => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(time)); };
  return { fire, selected, changes, frames, captures, classes, scroller, tick, cards, destroy, doc, win, grid };
}

test('fast dragging paints every crossed tile once and preserves other-page selections', () => {
  const f = fixture(['off-page', '1']);
  f.fire('pointerdown');
  assert.equal(f.changes.length, 0);
  f.fire('pointermove', 300, 50);
  assert.deepEqual([...f.selected].sort(), ['0', '1', '2', 'off-page']);
  f.fire('pointermove', 50, 50);
  f.fire('pointermove', 50, 170);
  assert.deepEqual([...f.selected].sort(), ['0', '1', '2', '3', 'off-page']);
  assert.equal(f.changes.flatMap(change => change.ids).filter(id => id === '0').length, 1);
  f.fire('pointerup', 50, 170);
  assert.equal(f.captures.size, 0); assert.equal(f.frames.size, 0); assert.equal(f.classes.size, 0);
  assert.equal(f.fire('click').prevented, true);
  assert.equal(f.fire('click', 50, 50, { detail: 0 }).prevented, undefined);
  f.destroy();
});

test('starting on a selected checkbox clears the painted tiles instead of inverting mixed selections', () => {
  const f = fixture(['0', '2', '4']);
  f.fire('pointerdown'); f.fire('pointermove', 300, 50); f.fire('pointermove', 50, 50);
  assert.deepEqual([...f.selected], ['4']);
  assert.ok(f.changes.every(change => change.select === false));
  f.fire('pointerup');
  f.fire('pointerdown', 170, 170); f.fire('pointerup', 170, 170);
  assert.equal(f.fire('click', 170, 170).prevented, undefined);
  f.destroy();
});

test('ordinary clicks, touch scrolling, secondary buttons and unrelated controls stay native', () => {
  const f = fixture();
  f.fire('pointerdown'); f.fire('pointermove', 52, 52); f.fire('pointerup', 52, 52);
  assert.equal(f.changes.length, 0); assert.equal(f.fire('click').prevented, undefined);
  for (const extra of [{ pointerType: 'touch' }, { button: 2 }, { isPrimary: false }, { ctrlKey: true },
    { target: { closest: () => null } }, { target: { closest: () => ({ disabled: true, closest: () => f.cards[0] }) } }]) {
    f.fire('pointerdown', 50, 50, extra); f.fire('pointermove', 300, 50); f.fire('pointerup');
  }
  assert.equal(f.changes.length, 0); f.destroy();
});

test('Escape, pointer cancellation, lost release and blur stop painting and cleanup removes all listeners', () => {
  for (const type of ['keydown', 'pointercancel', 'blur', 'lostpointercapture', 'pointermove']) {
    const f = fixture(); f.fire('pointerdown'); f.fire('pointermove', 170, 50);
    f.fire(type, 170, 50, { key: 'Escape', buttons: 0 });
    assert.equal(f.frames.size, 0); assert.equal(f.captures.size, 0);
    f.fire('pointermove', 300, 50); assert.equal(f.selected.has('2'), false);
    f.fire('pointerup'); assert.equal(f.fire('click').prevented, true);
    f.destroy();
    for (const target of [f.doc, f.win, f.grid]) assert.equal(target.listeners.size, 0);
  }
});

test('holding near the viewport edge scrolls and selects newly revealed rows without moving the mouse', () => {
  const f = fixture();
  f.fire('pointerdown', 50, 170); f.fire('pointermove', 50, 235);
  for (let frame = 1; frame <= 12; frame++) f.tick(frame * 16);
  assert.ok(f.scroller.scrollTop > 100);
  assert.ok(f.selected.has('6')); assert.ok(f.selected.has('9'));
  f.fire('pointerup', 50, 235);
  const stopped = f.scroller.scrollTop; f.tick(250);
  assert.equal(f.scroller.scrollTop, stopped); f.destroy();
});

test('autoscroll is proportional at either edge and stops in the center or outside the viewport', () => {
  const bounds = { left: 10, right: 400, top: 20, bottom: 500 };
  assert.equal(selectionScrollSpeed({ x: 50, y: 20 }, bounds), -18);
  assert.equal(selectionScrollSpeed({ x: 50, y: 500 }, bounds), 18);
  assert.equal(selectionScrollSpeed({ x: 50, y: 468 }, bounds), 9);
  for (const point of [{ x: 50, y: 250 }, { x: 0, y: 490 }, { x: 500, y: 490 }, { x: 50, y: 510 }]) assert.equal(selectionScrollSpeed(point, bounds), 0);
});
