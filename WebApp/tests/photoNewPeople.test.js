import test from 'node:test';
import assert from 'node:assert/strict';
import { isNewPhotoPerson, photoAssignmentOptions, photoPage } from '../src/photoLibrary.js';
import { personPreviewFaces, personPreviewGeometry, personPreviewPhotos } from '../src/photoPersonPreview.js';
import { photoStrings } from '../src/photoStrings.js';

test('new people includes only detector labels, excluding fixed, imported and named people', () => {
  for (const name of ['Persona 1', 'Persona 2345', ' person 12 ', 'PERSONA 42']) {
    assert.equal(isNewPhotoPerson({ id: 'p', name }), true);
  }
  for (const person of [null, {}, { id: 'p' }, { id: 'p', name: 'Ana' }, { id: 'p', name: 'Persona favorita' },
    { id: 'p', name: 'Persona 1 Ana' }, { id: 'unknown', name: 'Persona 1' },
    { id: 'apple-1', name: 'Persona 1' }, { id: 'p', appleKey: 'apple', name: 'Persona 1' }]) {
    assert.equal(isNewPhotoPerson(person), false);
  }
});

test('filtering precedes pagination and a renamed group becomes a merge destination', () => {
  const people = [{ id: 'known', name: 'Ana' }, ...Array.from({ length: 101 }, (_, i) => ({ id: `p${i}`, name: `Persona ${i + 1}` }))];
  assert.equal(photoPage(people.filter(isNewPhotoPerson)).total, 101);
  assert.deepEqual(photoPage(people.filter(isNewPhotoPerson), 2).items.map(person => person.id), ['p100']);
  people[1].name = 'Luis';
  const page = photoPage(people.filter(isNewPhotoPerson), 2);
  assert.equal(page.page, 1);
  assert.equal(page.total, 100);
  const options = photoAssignmentOptions(people, photoStrings('es'));
  assert.deepEqual(options.map(person => person.name), ['Desconocido', 'Ana', 'Luis']);
});

test('preview opens the portrait source first, includes only associated existing photos, and deduplicates', () => {
  const photos = new Map(['a', 'b', 'c'].map(id => [id, { id }]));
  const person = { photoIds: ['a', 'missing', 'b', 'a'], coverFace: { photoId: 'b' }, coverPhotoId: 'a' };
  assert.deepEqual(personPreviewPhotos(person, photos).map(photo => photo.id), ['b', 'a']);
  assert.deepEqual(personPreviewPhotos({ ...person, coverFace: { photoId: 'c' } }, photos).map(photo => photo.id), ['a', 'b']);
  assert.deepEqual(personPreviewPhotos({ photoIds: ['missing'] }, photos), []);
});

test('preview highlights only this person and falls back to an existing cover rectangle', () => {
  const box = { x: .2, y: .3, width: .1, height: .2 };
  const person = { id: 'p', name: 'Persona 1', coverFace: { id: 'cover', photoId: 'b', box },
    faceBoxes: { a: [{ id: '1', box }, { id: '2', box }, { id: 'invalid', box: { ...box, x: -1 } }] } };
  assert.deepEqual(personPreviewFaces(person, 'a'), ['1', '2'].map(id => ({ id, box, personId: 'p', name: 'Persona 1' })));
  assert.deepEqual(personPreviewFaces(person, 'b'), [{ ...person.coverFace, personId: 'p', name: 'Persona 1' }]);
  assert.deepEqual(personPreviewFaces(person, 'c'), []);
});

test('floating previews show the complete landscape, portrait and panoramic image within the viewport', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 667, height: 375 }]) {
    for (const image of [{ width: 1600, height: 900 }, { width: 600, height: 1200 }, { width: 4000, height: 500 }]) {
      for (const anchor of [
        { left: 12, top: 12, width: 190, height: 190 },
        { left: viewport.width - 200, top: viewport.height - 50, width: 190, height: 190 },
      ]) {
        const preview = personPreviewGeometry(anchor, image, viewport);
        assert.ok(preview.width > 0 && preview.height > 0);
        assert.ok(Math.abs(preview.width / preview.height - image.width / image.height) < 1e-10);
        assert.ok(preview.left >= 12 && preview.top >= 12);
        assert.ok(preview.left + preview.width <= viewport.width - 12 + 1e-10);
        assert.ok(preview.top + preview.height <= viewport.height - 12 + 1e-10);
      }
    }
  }
});

test('floating previews enlarge around the clicked cover and handle missing image dimensions while loading', () => {
  const anchor = { left: 400, top: 300, width: 200, height: 200 };
  const viewport = { width: 1400, height: 900 };
  const preview = personPreviewGeometry(anchor, {}, viewport);
  assert.ok(preview.width > anchor.width && preview.height > anchor.height);
  assert.equal(preview.left + preview.width / 2, anchor.left + anchor.width / 2);
  assert.equal(preview.top + preview.height / 2, anchor.top + anchor.height / 2);
  assert.equal(preview.width / preview.height, 4 / 3);
});
