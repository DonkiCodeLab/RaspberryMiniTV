import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterPhotos, descendantIds, folderTrail, hasLocation, pendingVariants } from '../src/photoLibrary.js';

test('only genuine numeric coordinates enter the map, including zero', () => {
  for (const photo of [{}, { latitude: null, longitude: null }, { latitude: '1', longitude: 1 }, { latitude: NaN, longitude: 0 }, { latitude: 91, longitude: 0 }]) assert.equal(hasLocation(photo), false);
  assert.equal(hasLocation({ latitude: 0, longitude: 0 }), true);
});
test('world clusters split with zoom, retain all photos and handle duplicate GPS', () => {
  const photos = [{ id: 'a', latitude: 40, longitude: 3 }, { id: 'b', latitude: 40.1, longitude: 3.1 }, { id: 'c', latitude: -30, longitude: -90 }];
  assert.equal(clusterPhotos(photos, 2).length, 2);
  assert.equal(clusterPhotos(photos, 16).length, 3);
  const duplicate = clusterPhotos([photos[0], { ...photos[0], id: 'd' }], 18);
  assert.equal(duplicate.length, 1); assert.equal(duplicate[0].photos.length, 2);
});
test('photos near opposite sides of date line remain neighbors', () => {
  const photos = [{ latitude: 0, longitude: 179.99 }, { latitude: 0, longitude: -179.99 }];
  assert.equal(clusterPhotos(photos, 5).length, 1);
});
test('folder trails and descendants support nested albums without looping', () => {
  const folders = [{ id: 'a', parent: '' }, { id: 'b', parent: 'a' }, { id: 'c', parent: 'b' }];
  assert.deepEqual([...descendantIds(folders, 'a')], ['a', 'b', 'c']);
  assert.deepEqual(folderTrail(folders, 'c').map(f => f.id), ['a', 'b', 'c']);
  assert.equal(folderTrail([{ id: 'a', parent: 'a' }], 'a').length, 1);
});
test('generation counts each missing style once and ignores generated images as inputs', () => {
  assert.equal(pendingVariants([{ id: 'a' }, { id: 'b', sourceId: 'a', style: 'lego' }]), 3);
  assert.equal(pendingVariants([]), 0);
});
