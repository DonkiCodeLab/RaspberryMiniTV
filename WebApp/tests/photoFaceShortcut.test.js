import test from 'node:test';
import assert from 'node:assert/strict';
import { attachPhotoFaceShortcut } from '../src/photoFaceShortcut.js';

function eventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type) { listeners.delete(type); },
    fire(type, properties = {}) {
      const event = { key: 'f', pointerType: 'mouse', clientX: 250, clientY: 150,
        target: { closest: () => null },
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...properties };
      listeners.get(type)?.(event);
      return event;
    },
  };
}

function fixture() {
  const win = eventTarget(), doc = eventTarget(), surface = eventTarget(), face = {};
  let enabled = true, hit = surface, calls = 0;
  let rect = { left: 100, top: 50, right: 500, bottom: 350 };
  doc.defaultView = win;
  doc.elementFromPoint = () => hit;
  surface.ownerDocument = doc;
  surface.contains = element => element === surface || element === face;
  const destroy = attachPhotoFaceShortcut(surface, { getBoundingClientRect: () => rect }, () => calls++, () => enabled);
  return { win, doc, surface, face, destroy, calls: () => calls,
    enable(value) { enabled = value; }, hit(value) { hit = value; }, rect(value) { rect = value; } };
}

test('F starts face drawing with the mouse over the image without requiring a click or focus', () => {
  const f = fixture();
  f.doc.fire('keydown');
  assert.equal(f.calls(), 0);
  f.surface.fire('pointerenter');
  const key = f.doc.fire('keydown');
  assert.equal(f.calls(), 1);
  assert.equal(key.defaultPrevented, true);
  assert.equal(key.stopped, true);
  f.hit(f.face);
  f.doc.fire('keydown', { key: 'F', shiftKey: true });
  assert.equal(f.calls(), 2);
  f.destroy();
});

test('letterboxing, leaving the viewport, and panels over the image do not activate F', () => {
  const f = fixture();
  f.surface.fire('pointerenter', { clientX: 25 });
  assert.equal(f.doc.fire('keydown').defaultPrevented, undefined);
  assert.equal(f.calls(), 0);
  f.surface.fire('pointermove');
  f.hit({}); // A name editor or another dialog covers the pointer.
  f.doc.fire('keydown');
  assert.equal(f.calls(), 0);
  f.hit(f.surface);
  f.surface.fire('pointerleave');
  f.doc.fire('keydown');
  assert.equal(f.calls(), 0);
  f.destroy();
});

test('hit testing follows the current image bounds after zooming and panning', () => {
  const f = fixture();
  f.surface.fire('pointerenter', { clientX: 50 });
  f.doc.fire('keydown');
  assert.equal(f.calls(), 0);
  f.rect({ left: -100, top: -50, right: 700, bottom: 550 });
  f.doc.fire('keydown');
  assert.equal(f.calls(), 1);
  f.rect({ left: 300, top: 50, right: 700, bottom: 350 });
  f.doc.fire('keydown');
  assert.equal(f.calls(), 1);
  f.destroy();
});

test('typing, browser shortcuts, key repeats, and composition remain untouched', () => {
  const f = fixture();
  f.surface.fire('pointerenter');
  for (const properties of [{ target: { closest: () => ({}) } }, { ctrlKey: true }, { metaKey: true },
    { altKey: true }, { repeat: true }, { isComposing: true }, { defaultPrevented: true }, { key: 'x' }]) {
    assert.equal(f.doc.fire('keydown', properties).stopped, undefined);
  }
  assert.equal(f.calls(), 0);
  f.destroy();
});

test('disabled states preserve the current draft and can re-enable without moving the mouse', () => {
  const f = fixture();
  f.surface.fire('pointerenter');
  f.enable(false); // Loading, saving, drawing, or editing an existing face.
  assert.equal(f.doc.fire('keydown').defaultPrevented, undefined);
  assert.equal(f.calls(), 0);
  f.enable(true);
  f.doc.fire('keydown');
  assert.equal(f.calls(), 1);
  f.destroy();
});

test('touch, loss of window focus, hidden tabs, and unmounting clear the shortcut', () => {
  const f = fixture();
  f.surface.fire('pointerenter', { pointerType: 'touch' });
  f.doc.fire('keydown');
  assert.equal(f.calls(), 0);
  f.surface.fire('pointerenter');
  f.win.fire('blur');
  f.doc.fire('keydown');
  f.surface.fire('pointerenter');
  f.doc.fire('visibilitychange');
  f.doc.fire('keydown');
  assert.equal(f.calls(), 0);
  f.surface.fire('pointerenter');
  f.destroy();
  f.doc.fire('keydown');
  assert.equal(f.calls(), 0);
  for (const target of [f.surface, f.doc, f.win]) assert.equal(target.listeners.size, 0);
});
