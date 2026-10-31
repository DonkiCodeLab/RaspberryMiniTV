import test from 'node:test';
import assert from 'node:assert/strict';
import { evolutionCandidates, evolutionGroups, evolutionSelection, portraitTransform, evolutionFrameAt, EVOLUTION_LIMIT } from '../src/photoEvolution.js';

const box = { x: .3, y: .2, width: .3, height: .4 };
function fixture(dates) {
  const photos = dates.map((takenAt, i) => ({ id: String(i), name: `${i}.jpg`, takenAt }));
  const person = { id: 'ana', name: 'Ana', birthDate: '2000-05-10', faceBoxes: Object.fromEntries(photos.map(photo => [photo.id, [{ id: `face-${photo.id}`, box }]])) };
  return { photos, person };
}
test('only dated original photos with this person’s known face enter the chronological range', () => {
  const { photos, person } = fixture(['2005-06-01', null, '1999-11-01', '2001-06-01', '2002-02-31', '9999-01-01', '2008-05-10', '2009-06-01']);
  photos[6].sourceId = 'original'; delete person.faceBoxes['7'];
  assert.deepEqual(evolutionCandidates(photos, person).map(item => [item.photo.id, item.age]), [['3', 1], ['0', 5]]);
  assert.deepEqual(evolutionCandidates(photos, { ...person, birthDate: '' }), []);
});
test('stages retain infant months and later ages; explicit selections override largest-face ranking', () => {
  const { photos, person } = fixture(['2000-05-10', '2000-06-10', '2000-06-25', '2003-06-01', '2003-10-01', '2005-01-01']);
  person.faceBoxes['2'][0].box = { x: 0, y: 0, width: .8, height: .8 };
  const candidates = evolutionCandidates(photos, person), { groups } = evolutionGroups(candidates, 0, 3);
  assert.equal(groups.length, 3);
  assert.deepEqual(evolutionSelection(groups).map(item => item.photo.id), ['0', '2', '3']);
  assert.deepEqual(evolutionSelection(groups, { '2000-06': '1', 3: '4' }).map(item => item.photo.id), ['0', '1', '4']);
  assert.equal(evolutionGroups(candidates, 0, 3, 'all').groups.length, 5);
  assert.equal(evolutionGroups(candidates, 8, 10).groups.length, 0);
});
test('long sequences are evenly capped and preserve chronological endpoints', () => {
  const { photos, person } = fixture(Array.from({ length: 200 }, (_, i) => `2001-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String(i % 28 + 1).padStart(2, '0')}`));
  const { groups, total } = evolutionGroups(evolutionCandidates(photos, person), 0, 1, 'all');
  assert.equal(total, 200); assert.equal(groups.length, EVOLUTION_LIMIT);
  assert.equal(groups[0].key, '0'); assert.equal(groups.at(-1).key, '199');
  assert.equal(new Set(groups.map(group => group.key)).size, EVOLUTION_LIMIT);
});
const transform = (matrix, x, y) => ({ x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5] });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test('eye alignment fixes height and spacing without stretching either image axis', () => {
  const { matrix, alignment } = portraitTransform(1200, 800, box, [{ x: .4, y: .3 }, { x: .6, y: .4 }]);
  const left = transform(matrix, 480, 240), right = transform(matrix, 720, 320);
  assert.equal(alignment, 'eyes'); close(left.y, .38 * 512); close(right.y, left.y);
  close(left.x, .375 * 512); close(right.x, .625 * 512);
  close(Math.hypot(matrix[0], matrix[1]), Math.hypot(matrix[2], matrix[3]));
});
test('missing or unusable eyes fall back to a consistently centered box, including photo edges', () => {
  const edge = { x: 0, y: 0, width: .1, height: .2 };
  for (const eyes of [null, [], [{ x: .5, y: .5 }, { x: .5, y: .5 }]]) {
    const { matrix, alignment } = portraitTransform(800, 1200, edge, eyes);
    const center = transform(matrix, 40, 120);
    assert.equal(alignment, 'box'); close(center.x, 256); close(center.y, .47 * 512);
    close(matrix[0], matrix[3]);
  }
});
test('playback holds real photos, bounds seeking, and respects reduced motion', () => {
  assert.deepEqual(evolutionFrameAt(-4, 3), { from: 0, to: 1, blend: 0 });
  assert.equal(evolutionFrameAt(.5, 3).blend, 0);
  assert.ok(evolutionFrameAt(.8, 3).blend > 0);
  assert.equal(evolutionFrameAt(.8, 3, true).blend, 0);
  assert.equal(evolutionFrameAt(.9, 3, true).blend, 1);
  assert.deepEqual(evolutionFrameAt(99, 3), { from: 2, to: 2, blend: 0 });
});
