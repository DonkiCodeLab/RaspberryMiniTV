import test from 'node:test';
import assert from 'node:assert/strict';
import { createImportId, importBatches, importSummary, normalizePhotoMetadata, preparePhotoImport } from '../src/photoImport.js';

const file = (name, path, content = 'jpeg') => {
  const result = new File([content], name);
  if (path) Object.defineProperty(result, 'webkitRelativePath', { value: path });
  return result;
};
const dump = { uuid: 'photo-1', title: 'Un día en la playa', description: 'Con la familia',
  date: '2024-08-02T17:25:00+02:00', location: [0, -3.7], persons: ['Ana'],
  person_info: [{ uuid: 'person-1', name: 'Ana' }, { uuid: 'person-2', name: 'Ana' }],
  albums: ['Verano', 'Familia'], keywords: ['playa'], favorite: true, face_info: [{ center: [0.5, 0.4] }] };

test('import IDs also work on HTTP LAN origins without randomUUID', () => {
  const id = createImportId(); assert.match(id, /^[a-f0-9]{32}$/); assert.notEqual(id, createImportId());
});

test('full OSXPhotos exports preserve coordinates, timezone and distinct people with the same name', () => {
  const meta = normalizePhotoMetadata(dump);
  assert.equal(meta.latitude, 0); assert.equal(meta.longitude, -3.7);
  assert.equal(meta.takenAt, dump.date); assert.equal(meta.appleFavorite, true);
  assert.deepEqual(meta.people, [{ id: 'person-1', name: 'Ana' }, { id: 'person-2', name: 'Ana' }]);
  assert.deepEqual(meta.albums, ['Verano', 'Familia']);
});
test('ExifTool sidecars preserve south/west refs and offsets without inventing people from keywords', () => {
  const meta = normalizePhotoMetadata([{ 'EXIF:GPSLatitude': 41, 'EXIF:GPSLongitude': 3, 'EXIF:GPSLatitudeRef': 'S',
    'EXIF:GPSLongitudeRef': 'W', 'EXIF:DateTimeOriginal': '2020:01:02 03:04:05', 'EXIF:OffsetTimeOriginal': '-03:00',
    'IPTC:Keywords': ['Ana'], 'XMP:PersonInImage': ['Luis'], 'XMP:Rating': 5 }]);
  assert.equal(meta.latitude, -41); assert.equal(meta.longitude, -3);
  assert.equal(meta.takenAt, '2020-01-02T03:04:05-03:00');
  assert.deepEqual(meta.people, [{ id: '', name: 'Luis' }]);
});
test('missing or invalid GPS never becomes zero; a removed Apple location overrides original EXIF', () => {
  for (const location of [[null, null], ['', ''], [200, 1], [NaN, 0], [false, 0]]) {
    const meta = normalizePhotoMetadata({ location });
    assert.equal(meta.latitude, null); assert.equal(meta.longitude, null);
  }
  assert.equal(normalizePhotoMetadata({ location: [null, null] }).locationKnown, true);
  assert.equal(normalizePhotoMetadata({}).locationKnown, false);
  assert.equal(normalizePhotoMetadata({ date: 'not a date' }).takenAt, null);
});
test('pair by full folder path, retain the complete source dump, skip movies and report orphan sidecars', async () => {
  const selection = await preparePhotoImport([
    file('a.jpg', 'Trip/2024/a.jpg'), file('a.jpg.minitv.json', 'Trip/2024/a.jpg.minitv.json', JSON.stringify(dump)),
    file('a.jpg', 'Trip/2025/a.jpg'), file('a.jpg.json', 'Trip/2025/a.jpg.json', JSON.stringify({ persons: ['Luis'] })),
    file('video.mov', 'Trip/video.mov'), file('orphan.json', 'Trip/orphan.json', '{}'), file('.DS_Store'),
  ]);
  assert.equal(selection.entries.length, 2);
  assert.equal(selection.entries[0].raw.face_info[0].center[0], .5);
  assert.equal(selection.entries[1].metadata.people[0].name, 'Luis');
  assert.deepEqual(selection.warnings.map(w => [w.type, w.count]), [['ignored', 1], ['unmatched', 1]]);
  assert.deepEqual(importSummary(selection.entries), { count: 2, bytes: 8, locations: 1, people: 3, albums: 2, enriched: 2 });
});
test('ambiguous stem sidecars are never applied to both JPEG and HEIC', async () => {
  const result = await preparePhotoImport([file('a.jpg'), file('a.heic'), file('a.json', '', JSON.stringify(dump))]);
  assert.ok(result.entries.every(e => e.metadata === null));
  assert.equal(result.warnings[0].type, 'unmatched');
});
test('reject broken sidecars and library packages before upload', async () => {
  await assert.rejects(preparePhotoImport([file('a.jpg'), file('a.jpg.json', '', 'invalid')]), /invalidSidecar/);
  await assert.rejects(preparePhotoImport([file('a.jpg', 'Photos.photoslibrary/originals/a.jpg')]), /libraryPackage/);
  for (const raw of [[], [1, 2], null, 'hello']) assert.throws(() => normalizePhotoMetadata(raw));
});
test('large libraries are divided by file count and bytes without dropping entries', () => {
  const entries = Array.from({ length: 501 }, (_, id) => ({ id, file: { size: 1024 } }));
  const batches = importBatches(entries);
  assert.equal(batches.length, 26); assert.deepEqual(batches.flat(), entries);
  assert.equal(importBatches(Array.from({ length: 4 }, () => ({ file: { size: 50 * 1024 ** 2 } }))).length, 4);
});
