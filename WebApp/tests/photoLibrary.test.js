import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterPhotos, descendantIds, folderTrail, hasLocation, indexPhotos, photoPage, visibleMapClusters, pendingVariants } from '../src/photoLibrary.js';

test('33,091 photos page in groups of 100 without losing or duplicating entries', () => {
  const photos = Array.from({ length: 33091 }, (_, id) => ({ id }));
  const first = photoPage(photos);
  assert.equal(first.items.length, 100);
  assert.equal(first.pages, 331);
  const all = Array.from({ length: first.pages }, (_, i) => photoPage(photos, i + 1).items).flat();
  assert.deepEqual(all, photos);
  assert.equal(photoPage(photos, 999).items.length, 91);
  assert.equal(photoPage(photos, 0).page, 1);
  assert.equal(photoPage([], 20).page, 1);
  assert.equal(photoPage(photos.slice(0, 7), 331).page, 1);
});

test('photo indexes deduplicate album memberships and resolve people without nested scans', () => {
  const photos = Array.from({ length: 20000 }, (_, id) => ({ id, folderId: 'uploads', folderIds: ['uploads', 'trip'] }));
  const people = photos.map(p => ({ id: `p${p.id}`, name: `Person ${p.id}`, photoIds: [p.id, p.id, 'missing'] }));
  const index = indexPhotos(photos, people);
  assert.equal(index.byFolder.get('uploads').length, 20000);
  assert.equal(index.byFolder.get('trip').length, 20000);
  assert.deepEqual(index.byPerson.get('p19999'), [photos[19999]]);
  assert.deepEqual(index.namesByPhoto.get(19999), ['Person 19999']);
});

test('map renders at most 100 clusters, represents every visible photo and handles the date line', () => {
  const photos = Array.from({ length: 13000 }, (_, id) => ({ id, latitude: 30 + (id % 100) / 10, longitude: -5 + Math.floor(id / 100) / 10 }));
  const clusters = visibleMapClusters(photos, 18, { south: 30, north: 40, west: -5, east: 8 });
  assert.ok(clusters.length <= 100);
  assert.equal(new Set(clusters.flatMap(c => c.photos.map(p => p.id))).size, 13000);
  assert.deepEqual(visibleMapClusters(photos, 18, { south: -50, north: -40, west: -5, east: 8 }), []);
  const across = [{ id: 'a', latitude: 0, longitude: 179 }, { id: 'b', latitude: 0, longitude: -179 }, { id: 'c', latitude: 0, longitude: 0 }];
  assert.equal(visibleMapClusters(across, 5, { south: -1, north: 1, west: 170, east: 190 }).flatMap(c => c.photos).length, 2);
});

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
