import test from 'node:test';
import assert from 'node:assert/strict';
import { attachPhotoMapZoom } from '../src/photoMapZoom.js';

function fixture(t) {
  const frames = new Map(), listeners = new Map(), updates = [];
  let id = 0, zoom = 5;
  t.mock.method(globalThis, 'requestAnimationFrame', fn => { frames.set(++id, fn); return id; });
  t.mock.method(globalThis, 'cancelAnimationFrame', key => frames.delete(key));
  const element = {
    addEventListener(type, handler, options) { listeners.set(type, { handler, options }); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const map = {
    getContainer: () => element, getZoom: () => zoom, getMinZoom: () => 2, getMaxZoom: () => 18,
    getSize: () => ({ y: 600, divideBy: value => ({ x: 800 / value, y: 600 / value }) }),
    mouseEventToContainerPoint: event => ({ x: event.clientX - 100, y: event.clientY - 50 }),
    setZoomAround(point, value, options) { zoom = value; updates.push({ point, zoom, options }); },
  };
  const destroy = attachPhotoMapZoom(map);
  t.after(destroy);
  return {
    map, frames, listeners, updates, destroy,
    fire(type, fields = {}) {
      const event = { cancelable: true, clientX: 600, clientY: 250, deltaMode: 0,
        preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...fields };
      listeners.get(type)?.handler(event);
      return event;
    },
    flush() { for (const [key, fn] of frames) { frames.delete(key); fn(); } },
  };
}

// Node does not provide the browser animation frame APIs.
globalThis.requestAnimationFrame ??= () => {};
globalThis.cancelAnimationFrame ??= () => {};

test('trackpad pinch accumulates smoothly around the cursor without zooming the page', t => {
  const f = fixture(t);
  for (let i = 0; i < 4; i++) {
    const event = f.fire('wheel', { ctrlKey: true, deltaY: -25 * Math.LN2 });
    assert.equal(event.prevented, true); assert.equal(event.stopped, true);
  }
  assert.equal(f.frames.size, 1);
  f.flush();
  assert.deepEqual(f.updates, [{ point: { x: 500, y: 200 }, zoom: 6, options: { animate: false } }]);
  f.fire('wheel', { ctrlKey: true, deltaY: 25 * Math.LN2 }); f.flush();
  assert.equal(f.map.getZoom(), 5.75);
  assert.equal(f.listeners.get('wheel').options.passive, false);
});

test('ordinary two-finger scrolling remains available and map limits allow immediate reversal', t => {
  const f = fixture(t);
  assert.equal(f.fire('wheel', { deltaY: -100 }).prevented, undefined);
  assert.equal(f.frames.size, 0);
  f.fire('wheel', { ctrlKey: true, deltaY: -10000 }); f.flush();
  assert.equal(f.map.getZoom(), 18);
  f.fire('wheel', { ctrlKey: true, deltaY: 100 * Math.LN2 }); f.flush();
  assert.equal(f.map.getZoom(), 17);
  f.fire('wheel', { ctrlKey: true, deltaY: 10000 }); f.flush();
  assert.equal(f.map.getZoom(), 2);
  f.fire('wheel', { ctrlKey: true, deltaY: -100 * Math.LN2 }); f.flush();
  assert.equal(f.map.getZoom(), 3);
});

test('wheel units are normalized and invalid deltas cannot corrupt the map', t => {
  const f = fixture(t);
  f.fire('wheel', { ctrlKey: true, deltaMode: 1, deltaY: -100 * Math.LN2 / 16 }); f.flush();
  assert.equal(f.map.getZoom(), 6);
  f.fire('wheel', { ctrlKey: true, deltaMode: 2, deltaY: 100 * Math.LN2 / 600 }); f.flush();
  assert.equal(f.map.getZoom(), 5);
  f.fire('wheel', { ctrlKey: true, deltaY: NaN }); f.flush();
  assert.equal(f.map.getZoom(), 5);
});

test('Safari uses cumulative scale at the cursor and ignores duplicate wheel events', t => {
  const f = fixture(t);
  f.fire('mousemove', { clientX: 300, clientY: 200 });
  assert.equal(f.fire('gesturestart').prevented, true);
  f.fire('gesturechange', { scale: 2 }); f.flush();
  assert.deepEqual(f.updates[0].point, { x: 200, y: 150 });
  assert.equal(f.map.getZoom(), 6);
  assert.equal(f.fire('wheel', { ctrlKey: true, deltaY: -100 }).prevented, true);
  f.fire('gesturechange', { scale: 4 }); f.flush();
  assert.equal(f.map.getZoom(), 7);
  for (const scale of [0, -1, NaN, Infinity]) f.fire('gesturechange', { scale });
  f.flush(); assert.equal(f.map.getZoom(), 7);
  assert.equal(f.fire('gestureend').prevented, true);
  f.fire('gesturestart'); f.fire('gesturechange', { scale: 0.5 }); f.fire('gestureend'); f.flush();
  assert.equal(f.map.getZoom(), 6);
  f.fire('wheel', { ctrlKey: true, deltaY: 100 * Math.LN2 }); f.flush();
  assert.equal(f.map.getZoom(), 5);
});

test('touchscreen gestures stay with Leaflet, including cancellation', t => {
  const f = fixture(t);
  f.fire('wheel', { ctrlKey: true, deltaY: -100 });
  f.fire('touchstart', { touches: [{}, {}] });
  assert.equal(f.frames.size, 0);
  assert.equal(f.fire('gesturestart').prevented, undefined);
  assert.equal(f.fire('gesturechange', { scale: 2 }).prevented, undefined);
  f.fire('touchend', { touches: [{}] });
  f.fire('gesturechange', { scale: 3 }); f.flush();
  assert.equal(f.map.getZoom(), 5);
  f.fire('touchcancel', { touches: [] });
  f.fire('gesturestart'); f.fire('gesturechange', { scale: 2 }); f.flush();
  assert.equal(f.map.getZoom(), 6);
});

test('leaving the map removes listeners and cancels pending zoom', t => {
  const f = fixture(t);
  f.fire('wheel', { ctrlKey: true, deltaY: -100 });
  f.destroy(); f.flush();
  assert.equal(f.listeners.size, 0);
  assert.equal(f.frames.size, 0);
  assert.equal(f.updates.length, 0);
});

test('MapLibre retains native wheel zoom and uses Safari gestures around the cursor', async t => {
  const { attachMapLibrePhotoZoom } = await import('../src/photoMapZoom.js');
  const frames = new Map(), listeners = new Map(), updates = [];
  let id = 0, zoom = 5;
  t.mock.method(globalThis, 'requestAnimationFrame', fn => { frames.set(++id, fn); return id; });
  t.mock.method(globalThis, 'cancelAnimationFrame', key => frames.delete(key));
  const element = { clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => ({ left: 100, top: 50 }),
    addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type) { listeners.delete(type); } };
  const detach = attachMapLibrePhotoZoom({ getContainer: () => element, getZoom: () => zoom, getMinZoom: () => 0, getMaxZoom: () => 18,
    unproject: point => point, easeTo: options => { zoom = options.zoom; updates.push(options); } });
  t.after(detach);
  const fire = (type, data = {}) => {
    const e = { cancelable: true, preventDefault() { this.prevented = true; }, stopPropagation() {}, ...data };
    listeners.get(type)(e); return e;
  };
  assert.equal(fire('wheel', { ctrlKey: true, deltaY: -100 }).prevented, undefined);
  fire('mousemove', { clientX: 300, clientY: 200 });
  fire('gesturestart'); fire('gesturechange', { scale: 2 });
  for (const fn of frames.values()) fn(); frames.clear();
  assert.deepEqual(updates, [{ zoom: 6, around: [200, 150], duration: 0 }]);
  assert.equal(fire('wheel', { ctrlKey: true, deltaY: -100 }).prevented, true);
  fire('gestureend'); detach(); assert.equal(listeners.size, 0);
});
