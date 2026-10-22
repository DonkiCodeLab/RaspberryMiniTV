import test from 'node:test';
import assert from 'node:assert/strict';
import { attachFaceDrawing } from '../src/photoFaceDrawing.js';

function fixture(rect = { left: 100, top: 50, width: 800, height: 400 }) {
  const listeners = new Map(), captures = new Set(), completed = [], previews = [];
  const element = { getBoundingClientRect: () => rect,
    addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type),
    setPointerCapture: id => captures.add(id), hasPointerCapture: id => captures.has(id), releasePointerCapture: id => captures.delete(id) };
  const destroy = attachFaceDrawing(element, box => previews.push(box), box => completed.push(box));
  const fire = (type, x, y, extra = {}) => {
    const event = { type, clientX: x, clientY: y, pointerId: 1, button: 0, cancelable: true,
      stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; }, ...extra };
    listeners.get(type)?.(event); return event;
  };
  return { fire, completed, previews, captures, destroy, listeners };
}

test('dragging in either direction stores image fractions independently of zoom and pan', () => {
  for (const rect of [{ left: 100, top: 50, width: 800, height: 400 }, { left: -300, top: -150, width: 1600, height: 800 }]) {
    const f = fixture(rect), point = (x, y) => [rect.left + x * rect.width, rect.top + y * rect.height];
    const down = f.fire('pointerdown', ...point(.6, .8));
    assert.equal(down.stopped, true); assert.equal(down.prevented, true);
    assert.equal(f.completed.at(-1), null);
    f.fire('pointermove', ...point(.1, .2));
    assert.equal(f.completed.length, 1); // Preview cannot enable confirmation before release.
    f.fire('pointerup', ...point(.1, .2));
    const box = f.completed.at(-1);
    assert.equal(box.x, .1); assert.equal(box.y, .2);
    assert.ok(Math.abs(box.width - .5) < 1e-10); assert.ok(Math.abs(box.height - .6) < 1e-10);
    f.destroy(); assert.equal(f.captures.size, 0); assert.equal(f.listeners.size, 0);
  }
});

test('drawing clamps to image edges, rejects clicks, and discards cancelled gestures', () => {
  const f = fixture();
  f.fire('pointerdown', 500, 250); f.fire('pointerup', 1500, 950);
  assert.deepEqual(f.completed.at(-1), { x: .5, y: .5, width: .5, height: .5 });
  f.fire('pointerdown', 500, 250); f.fire('pointerup', 501, 251);
  assert.equal(f.completed.at(-1), null);
  f.fire('pointerdown', 500, 250); f.fire('pointermove', 700, 350); f.fire('pointercancel', 700, 350);
  assert.equal(f.completed.at(-1), null); assert.equal(f.previews.at(-1), null);
  assert.equal(f.fire('wheel', 500, 250).stopped, true);
  assert.equal(f.fire('dblclick', 500, 250).stopped, true);
  const count = f.completed.length;
  f.fire('pointerdown', 500, 250, { button: 2 });
  assert.equal(f.completed.length, count);
  f.destroy();
});
