import test from 'node:test';
import assert from 'node:assert/strict';
import { facePopoverPosition } from '../src/photoFacePopover.js';

test('face editor stays in the viewport at every edge, including zoomed and panned photos', () => {
  for (const viewport of [{ width: 900, height: 600 }, { width: 295, height: 320 }]) {
    for (const scale of [1, 3, 8]) for (const x of [0, -400, 400]) for (const y of [0, -300, 300]) {
      for (const box of [null, { x: 0, y: 0, width: .1, height: .1 }, { x: .8, y: .8, width: .2, height: .2 }]) {
        const position = facePopoverPosition(box, { width: 800, height: 500, scale, x, y }, viewport, { width: 296, height: 340 });
        assert.ok(position.left >= 12 && position.top >= 12);
        assert.ok(position.left + position.width <= viewport.width - 12);
        assert.ok(position.top + Math.min(340, viewport.height - 24) <= viewport.height - 12);
      }
    }
  }
});

test('editor sits beside the face when space allows and follows the image transform', () => {
  const box = { x: .2, y: .2, width: .1, height: .1 }, viewport = { width: 1000, height: 700 }, panel = { width: 296, height: 300 };
  const view = { width: 1000, height: 700, scale: 1, x: 0, y: 0 };
  const first = facePopoverPosition(box, view, viewport, panel);
  assert.deepEqual(first, { left: 312, top: 140, width: 296 });
  const panned = facePopoverPosition(box, { ...view, x: 40, y: 20 }, viewport, panel);
  assert.equal(panned.left, first.left + 40); assert.equal(panned.top, first.top + 20);
  const right = facePopoverPosition({ ...box, x: .8 }, view, viewport, panel);
  assert.equal(right.left, 492);
});
