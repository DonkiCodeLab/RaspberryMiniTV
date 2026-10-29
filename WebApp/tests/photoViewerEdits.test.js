import test from 'node:test';
import assert from 'node:assert/strict';
import { photoImageEditBatch } from '../src/photoImageEdits.js';
import { demoFaceVersion, editDemoImage } from '../src/api/photoDemoImageEdits.js';
import { deleteDemoPhotos } from '../src/api/photoDemoPeopleBatch.js';

function fixture() {
  return { photos: [{ id: 'photo', name: 'Group.png', relativePath: 'group.png', blob: new Blob(['original']), folderIds: ['holiday'], takenAt: '2020-01-01', latitude: 41, longitude: 2 }],
    people: [{ id: 'ana', photoIds: ['photo'] }], manualFaces: { photo: [{ id: 'face', personId: 'ana', box: { x: .1, y: .2, width: .2, height: .3 } }] } };
}
const request = (library, edits) => photoImageEditBatch(library.photos[0], demoFaceVersion(library, 'photo'), edits, 'image-request-12345');

test('single photo save contains only image edits and keeps a stable payload for retries', () => {
  const library = fixture(), edits = [{ rotate: 1 }], data = request(library, edits);
  assert.deepEqual(data.photos[0], { photoId: 'photo', expectedPath: 'group.png', version: demoFaceVersion(library, 'photo'),
    reviewIds: [], changes: [], edits: [{ rotate: 1 }], delete: false });
  assert.deepEqual(data.people, []);
  edits[0].rotate = -1;
  assert.equal(data.photos[0].edits[0].rotate, 1);
});

test('local edits preserve metadata and references, transform faces, retain originals and retry once', async () => {
  const library = fixture(), data = request(library, [{ rotate: 1 }, { scale: .5 }]);
  let renders = 0;
  const render = async () => { renders++; return { blob: new Blob(['edited']), width: 40, height: 60 }; };
  await editDemoImage(library, data, render);
  await editDemoImage(library, data, render);
  assert.equal(renders, 1);
  assert.deepEqual(library.photos[0].folderIds, ['holiday']);
  assert.equal(library.photos[0].takenAt, '2020-01-01');
  assert.equal(library.photos[0].latitude, 41);
  assert.equal(library.photos[0].longitude, 2);
  assert.equal(library.manualFaces.photo[0].box.x, .5);
  assert.equal(library.manualFaces.photo[0].box.y, .1);
  assert.equal(await library.imageEditSources.photo[0].blob.text(), 'original');
  assert.match(library.photos[0].relativePath, /^edited-photos\//);
  await assert.rejects(editDemoImage(library, { ...data, photos: [{ ...data.photos[0], edits: [{ rotate: -1 }] }] }, render));
  deleteDemoPhotos(library, new Set(['photo']));
  assert.equal(library.photos.length, 0);
  assert.equal(library.imageEditSources.photo, undefined);
});

test('stale photo paths or faces and invalid edits fail before rendering or changing the catalogue', async () => {
  for (const change of [item => { item.expectedPath = 'old.jpg'; }, item => { item.version = 'old'; },
    item => { item.edits = [{ scale: 0 }]; }, item => { item.edits = [{ crop: { x: 0, y: 0, width: 2, height: 1 } }]; }]) {
    const library = fixture(), data = request(library, [{ rotate: 1 }]);
    change(data.photos[0]);
    const before = structuredClone(library);
    await assert.rejects(editDemoImage(library, data, () => assert.fail('invalid edit must not render')));
    assert.deepEqual(library, before);
  }
});

test('cropping away a face removes only its person reference', async () => {
  const library = fixture(), data = request(library, [{ crop: { x: .6, y: 0, width: .4, height: 1 } }]);
  await editDemoImage(library, data, async () => ({ blob: new Blob(['crop']), width: 48, height: 80 }));
  assert.deepEqual(library.manualFaces.photo, []);
  assert.deepEqual(library.people[0].photoIds, []);
  assert.deepEqual(library.photos[0].folderIds, ['holiday']);
});
