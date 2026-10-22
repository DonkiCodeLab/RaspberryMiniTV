import test from 'node:test';
import assert from 'node:assert/strict';
import { sortPhotos } from '../src/photoLibrary.js';
import { galleryWindow, miniaturePosition, miniatureScrollLeft, miniatureWindow, MINI_IMAGE_SIZE, MINI_ROWS, MINI_SIZE, photoPeriods } from '../src/photoTimeline.js';
import { migratePhotoDemo } from '../src/api/photoDemo.js';

const photos = Array.from({ length: 33091 }, (_, id) => ({ id: String(id), name: `${id}`, takenAt: new Date(Date.UTC(2000, 0, id + 1)).toISOString() }));

test('every gallery photo is reachable and no more than 100 are expanded, including the last position', () => {
  const seen = new Set();
  for (let position = 0; position < photos.length; position += 100) {
    const page = galleryWindow(photos, position);
    assert.equal(page.items.length, 100);
    for (const photo of page.items) seen.add(photo.id);
  }
  assert.equal(seen.size, photos.length);
  assert.equal(galleryWindow(photos, 999999).items.at(-1), photos.at(-1));
  assert.equal(galleryWindow(photos, -50).offset, 0);
  assert.equal(galleryWindow([]).items.length, 0);
  assert.equal(galleryWindow(photos.slice(0, 4), 3).items.length, 4);
});

test('miniature strip represents the entire library while mounting only visible columns', () => {
  const end = miniatureScrollLeft(photos.length, photos.length - 1, 700);
  for (const left of [0, 10000, end]) {
    const window = miniatureWindow(photos.length, left, 700);
    assert.ok(window.end - window.start <= (Math.ceil(700 / MINI_SIZE) + 5) * MINI_ROWS);
    assert.ok(window.width >= Math.ceil(photos.length / MINI_ROWS) * MINI_SIZE);
    assert.ok(window.start >= 0 && window.end <= photos.length);
  }
  assert.equal(miniatureWindow(photos.length, end, 700).end, photos.length);
});

test('expanded groups stay centered at both ends, at arbitrary positions, and after resizing', () => {
  for (const total of [1, 7, 99, 100, 101, 4570, photos.length]) {
    const collection = photos.slice(0, total);
    for (const width of [280, 700, 1800]) for (const position of [0, 1, 99, 100, 507, total - 1]) {
      const page = galleryWindow(collection, position);
      const left = miniatureScrollLeft(total, position, width);
      const window = miniatureWindow(total, left, width);
      const first = window.padding + Math.floor(page.offset / MINI_ROWS) * MINI_SIZE;
      const last = window.padding + Math.floor((page.offset + page.items.length - 1) / MINI_ROWS) * MINI_SIZE + MINI_IMAGE_SIZE;
      assert.equal((first + last) / 2 - left, width / 2, `total=${total}, position=${position}, width=${width}`);
      assert.ok(left >= 0 && left <= window.width - width);
    }
  }
});

test('scrolling selects the group in the center and reaches the final photos', () => {
  for (const width of [280, 700, 1800]) {
    for (const position of [0, 8, 800, 8000]) {
      const left = miniatureScrollLeft(photos.length, position, width);
      assert.equal(miniaturePosition(photos.length, left, width), position);
    }
    for (let total = 4570; total < 4590; total++) {
      assert.equal(miniaturePosition(total, 0, width), 0);
      assert.equal(miniaturePosition(total, miniatureWindow(total, 0, width).width - width, width), total - 100);
    }
  }
  assert.equal(miniaturePosition(0, 0, 700), 0);
  assert.equal(miniatureWindow(0, 0, 700).end, 0);
});

test('year and month positions retain all photos and undated images in both date directions', () => {
  const input = [{ id: 'a', takenAt: '2024-12-31T23:30:00-02:00' }, { id: 'b', takenAt: '2025-02-01T12:00:00Z' },
    { id: 'c', takenAt: '2024-12-01T00:00:00Z' }, { id: 'd', takenAt: null }, { id: 'e', takenAt: 'bad' }];
  for (const direction of ['asc', 'desc']) {
    const sorted = sortPhotos(input, 'takenAt', direction), periods = photoPeriods(sorted);
    assert.equal(periods.at(-1).year, null);
    assert.equal(periods.at(-1).count, 2);
    const reached = [];
    for (const year of periods) for (const month of year.months) reached.push(...sorted.slice(month.start, month.start + month.count));
    assert.deepEqual(reached, sorted);
    assert.equal(periods.find(year => year.year === 2025).months.length, 2);
  }
});

test('demo migration removes Uploads hierarchy and retains unique photos and independent references', () => {
  const library = { folders: [{ id: 'uploads', parent: '' }, { id: 'old', parent: 'uploads' }, { id: 'child', parent: 'old' },
    { id: 'personal', parent: '' }, { id: 'ai', parent: '' }, { id: 'creative', parent: 'ai' }],
    photos: [{ id: 'photo', relativePath: 'unchanged.jpg', folderId: 'child', folderIds: ['old', 'personal', 'creative'] }],
    importSessions: { session: 'child' }, importBatches: { batch: { folderId: 'old' } } };
  assert.equal(migratePhotoDemo(library), true);
  assert.equal(migratePhotoDemo(library), false);
  assert.deepEqual(library.photos, [{ id: 'photo', relativePath: 'unchanged.jpg', folderId: 'gallery', folderIds: ['personal', 'creative'] }]);
  assert.equal(library.folders.find(folder => folder.id === 'personal').parent, 'albums');
  assert.ok(!library.folders.some(folder => folder.parent === 'gallery' || folder.id === 'uploads'));
  assert.equal(library.importSessions.session, 'gallery');
  assert.equal(library.importBatches.batch.folderId, 'gallery');
  assert.deepEqual(library.people.map(person => [person.id, person.photoIds]), [['unknown', []]]);
});

test('existing demo libraries gain the permanent Unknown folder exactly once', () => {
  const library = { galleryVersion: 1, people: [{ id: 'ana', name: 'Ana', photoIds: ['photo'] }] };
  assert.equal(migratePhotoDemo(library), true);
  assert.equal(migratePhotoDemo(library), false);
  assert.deepEqual(library.people.map(person => [person.id, person.photoIds]), [['ana', ['photo']], ['unknown', []]]);
});
