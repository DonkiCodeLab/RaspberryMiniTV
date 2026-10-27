import test from 'node:test';
import assert from 'node:assert/strict';
import { photoMapFeatures, photoMapBounds, photoMapStyle, photoMapCoordinates, photoClusterIds, PHOTO_MAP_SOURCE } from '../src/photoMapData.js';
import { attachPhotoMarkerActions } from '../src/photoMapActions.js';

const photo = (id, longitude, latitude) => ({ id, longitude, latitude });

test('photo markers remain visible when panning into another copy of the 2D world', () => {
  assert.deepEqual(photoMapCoordinates([-179, 20], 179, 'mercator'), [181, 20]);
  assert.deepEqual(photoMapCoordinates([2, 41], 362, 'mercator'), [362, 41]);
  assert.deepEqual(photoMapCoordinates([2, 41], -358, 'mercator'), [-358, 41]);
  assert.deepEqual(photoMapCoordinates([-179, 20], 179, 'globe'), [-179, 20]);
});

test('map points accept numeric GPS including zero and preserve photo IDs', () => {
  const data = photoMapFeatures([photo('zero', 0, 0), photo('city', 2, 41), photo('bad', 181, 0), photo('missing', null, null)]);
  assert.deepEqual(data.features.map(f => [f.properties.id, f.geometry.coordinates]), [['zero', [0, 0]], ['city', [2, 41]]]);
});

test('framing covers all photos using the short span across the date line', () => {
  assert.equal(photoMapBounds([]), null);
  assert.deepEqual(photoMapBounds([photo('one', 0, 0)]), [[0, 0], [0, 0]]);
  assert.deepEqual(photoMapBounds([photo('west', 179, -10), photo('east', -179, 20)]), [[179, -10], [181, 20]]);
  assert.deepEqual(photoMapBounds([photo('a', -3, 40), photo('b', 2, 41), photo('c', 0, 39)]), [[-3, 39], [2, 41]]);
  assert.deepEqual(photoMapBounds([photo('one', 180, 0), photo('two', -180, 0)]), [[180, 0], [180, 0]]);
});

test('style changes retain the photo data, globe selection, tiles and attribution', () => {
  const base = { version: 8, sources: { tiles: { type: 'vector', url: 'https://example.com/tiles', attribution: 'OSM' } }, layers: [{ id: 'water', type: 'fill', source: 'tiles' }] };
  const result = photoMapStyle(base, [photo('one', 2, 41)], 'globe');
  assert.equal(result.sources.tiles, base.sources.tiles);
  assert.equal(result.projection.type, 'globe');
  assert.equal(result.sources[PHOTO_MAP_SOURCE].cluster, true);
  assert.equal(result.sources[PHOTO_MAP_SOURCE].data.features[0].properties.id, 'one');
  assert.equal(result.layers[0], base.layers[0]);
  assert.equal(base.layers.length, 1);
});

test('a group opens every member beyond 10,000 photos, without truncation', async () => {
  const all = Array.from({ length: 33091 }, (_, id) => ({ properties: { id: `photo-${id}` } }));
  const calls = [];
  const ids = await photoClusterIds({ getClusterLeaves: async (cluster, limit, offset) => {
    calls.push([cluster, limit, offset]); return all.slice(offset, offset + limit);
  } }, 123, all.length);
  assert.deepEqual(ids, all.map(f => f.properties.id));
  assert.equal(calls.length, 34);
  assert.deepEqual(calls.at(-1), [123, 91, 33000]);
});

test('leaving the map or changing the filter cancels an obsolete group read', async () => {
  const controller = new AbortController();
  let calls = 0;
  const source = { getClusterLeaves: async () => { calls++; controller.abort(); return [{ properties: { id: 'old' } }]; } };
  await assert.rejects(photoClusterIds(source, 1, 20, controller.signal), { name: 'AbortError' });
  assert.equal(calls, 1);
  await assert.rejects(photoClusterIds({ getClusterLeaves: async () => [] }, 1, 20), /changed/);
});

function actions(t, grouped = true) {
  const listeners = new Map(), calls = [];
  const button = { addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) };
  const detach = attachPhotoMarkerActions(button, { activate: () => calls.push(grouped ? 'zoom' : 'photo'), openGroup: grouped ? () => calls.push('gallery') : undefined });
  t.after(detach);
  return { calls, listeners, detach, fire(type, fields = {}) {
    const event = { detail: 1, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...fields };
    listeners.get(type)?.(event); return event;
  } };
}

test('a single photo opens its details; group clicks zoom and right clicks open photos', t => {
  const single = actions(t, false); single.fire('click'); assert.deepEqual(single.calls, ['photo']);
  const group = actions(t);
  assert.equal(group.fire('click').stopped, true);
  assert.equal(group.fire('contextmenu').prevented, true);
  assert.deepEqual(group.calls, ['zoom', 'gallery']);
  group.fire('click', { detail: 2 }); group.fire('dblclick');
  assert.deepEqual(group.calls, ['zoom', 'gallery']);
  group.fire('keydown', { key: 'Enter', shiftKey: true });
  group.fire('keydown', { key: 'ContextMenu' });
  assert.deepEqual(group.calls.slice(-2), ['gallery', 'gallery']);
});

test('long press opens a group once, consumes the following click and cancels on drag or unmount', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = actions(t);
  const down = () => f.fire('pointerdown', { pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 10 });
  down(); t.mock.timers.tick(550);
  f.fire('contextmenu'); f.fire('pointerup'); f.fire('click');
  assert.deepEqual(f.calls, ['gallery']);
  down(); f.fire('pointermove', { clientX: 30, clientY: 10 }); t.mock.timers.tick(600);
  assert.deepEqual(f.calls, ['gallery']);
  down(); f.fire('pointercancel'); t.mock.timers.tick(600);
  assert.deepEqual(f.calls, ['gallery']);
  down(); f.detach(); t.mock.timers.tick(600);
  assert.deepEqual(f.calls, ['gallery']); assert.equal(f.listeners.size, 0);
});
