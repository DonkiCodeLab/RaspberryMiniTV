import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { photoStrings } from '../src/photoStrings.js';
import { updatePersonDraft, peopleBatchEntries, peopleBatchCounts } from '../src/photoPeopleBatch.js';
import { reviewDemoPeople } from '../src/api/photoDemoPeopleBatch.js';

const result = await build({ entryPoints: [new URL('../src/PhotoPeopleBatch.jsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
  loader: { '.png': 'dataurl', '.css': 'empty' }, define: { 'import.meta.env': '{}' } });
const module = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { NewPersonCardActions, NewPeopleToolbar, PeopleBatchSummary } = module.exports;
const people = Array.from({ length: 5 }, (_, index) => ({ id: `p${index}`, name: `Persona ${index+1}`, photoIds: index >= 3 ? ['shared'] : [`photo${index}`] }));
const target = { id: 'ana', name: 'Ana', photoIds: [] };
const s = photoStrings('es');
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const entriesFor = drafts => peopleBatchEntries(drafts, people, [target], s);
const allChanges = [{ action: 'rename', name: '  Luis  ' }, { action: 'merge', personId: 'ana' }, { action: 'delete' }, { action: 'deletePhotos' }, { action: 'deletePhotos' }];
const allDrafts = () => allChanges.reduce((drafts, change, index) => updatePersonDraft(drafts, people[index], change), {});
function controls(element) {
  if (!React.isValidElement(element)) return [];
  return [element, ...React.Children.toArray(element.props.children).flatMap(controls)];
}

test('cards stage mutually exclusive actions with no individual submit buttons', () => {
  let drafts = {};
  const onChange = change => { drafts = updatePersonDraft(drafts, people[0], change); };
  const card = () => NewPersonCardActions({ person: people[0], people: [target, ...people], draft: drafts.p0, entry: entriesFor(drafts)[0], s, onChange });
  const input = (type, current = card()) => controls(current).filter(element => element.type === type);
  input('input')[0].props.onChange({ target: { value: 'Luis' } });
  assert.equal(drafts.p0.action, 'rename');
  const picker = () => controls(card()).find(element => element.props.choices);
  assert.deepEqual(picker().props.choices.map(person => person.id), ['unknown', 'ana']);
  picker().props.onChange('ana');
  assert.equal(drafts.p0.action, 'merge');
  assert.equal(input('input')[0].props.value, '');
  const checkboxes = () => input('input').filter(element => element.props.type === 'checkbox');
  checkboxes()[0].props.onChange({ target: { checked: true } });
  assert.deepEqual(checkboxes().map(element => element.props.checked), [true, false]);
  checkboxes()[1].props.onChange({ target: { checked: true } });
  assert.deepEqual(checkboxes().map(element => element.props.checked), [false, true]);
  assert.deepEqual(drafts.p0.photoIds, ['photo0']);
  assert.equal(picker().props.value, '');
  assert.equal(input('button').length, 1); // Undo is the only card button.
  input('button')[0].props.onClick({ currentTarget: { closest: () => ({ querySelector: () => null }) } });
  assert.deepEqual(drafts, {});
  for (const language of ['es', 'en', 'ca']) {
    const translated = photoStrings(language);
    const html = render(NewPersonCardActions, { person: people[0], people: [...people, target], s: translated, onChange });
    assert.ok(html.includes(translated.deletePersonKeepPhotos));
    assert.ok(html.includes(translated.deletePersonOriginals));
    assert.match(html, /role="combobox"/);
    assert.match(html, /aria-expanded="false"/);
    assert.doesNotMatch(html, /<option value="p\d"|type="submit"|<form/);
  }
});

test('one batch includes cards from different pages and deduplicates shared originals', () => {
  const drafts = allDrafts(), entries = entriesFor(drafts);
  assert.ok(entries.every(entry => !entry.error));
  assert.equal(entries[0].payload.name, 'Luis');
  assert.deepEqual(peopleBatchCounts(entries), { rename: 1, merge: 1, delete: 1, deletePhotos: 2, photos: 1 });
  let applied;
  const toolbar = NewPeopleToolbar({ entries, s, onApply: () => { applied = entries.map(entry => entry.payload); } });
  const apply = controls(toolbar).find(element => element.type === 'button');
  assert.equal(apply.props.disabled, false);
  apply.props.onClick();
  assert.equal(applied.length, 5);
  for (const language of ['es', 'en', 'ca']) {
    const translated = photoStrings(language), html = render(PeopleBatchSummary, { entries, s: translated, photosById: new Map([['shared', { name: 'shared.jpg' }]]) });
    assert.ok(html.includes(translated.batchDeletePhotosHint.replace('{count}', 1)));
    assert.ok(html.includes(translated.batchKeepPhotosHint));
    assert.ok(html.includes('shared.jpg'));
    for (const person of people) assert.ok(html.includes(person.name));
  }
  assert.equal(Object.keys(updatePersonDraft(drafts, people[0], null)).length, 4);
});

test('stale cards, deleted targets and changed photo sets block the whole batch', () => {
  const drafts = allDrafts();
  const changed = people.map(person => person.id === 'p3' ? { ...person, photoIds: ['shared', 'new-photo'] } : person).slice(1);
  const entries = peopleBatchEntries(drafts, changed, [], s);
  assert.equal(entries[0].error, s.batchPersonChanged);
  assert.equal(entries[1].error, s.batchTargetChanged);
  assert.equal(entries[3].error, s.batchPhotosChanged);
  const html = render(NewPeopleToolbar, { entries, s });
  assert.ok(html.includes(`disabled="">${s.applyPeopleChanges.replace('{count}', 5)}`));
  for (const name of ['Persona 99', ' person 2 ', '../x', '  ']) assert.ok(entriesFor(updatePersonDraft({}, people[0], { action: 'rename', name }))[0].error);
});

const demoLibrary = () => ({ people: structuredClone([...people, target, { id: 'unknown', name: 'Desconocido', photoIds: [] }]),
  photos: ['photo0', 'photo1', 'photo2', 'shared'].map(id => ({ id, relativePath: id, folderIds: ['album'] })),
  manualFaces: { photo1: [{ personId: 'p1', name: 'Persona 2' }], photo2: [{ personId: 'p2', name: 'Persona 3' }], shared: [{ personId: 'p3' }, { personId: 'p4' }] },
  metadata: { shared: {} }, importFiles: { digest: 'shared' }, importBatches: { batch: { saved: ['shared'] } } });

test('demo batch applies mixed actions, deletes shared references and accepts safe retries', () => {
  const library = demoLibrary(), changes = entriesFor(allDrafts()).map(entry => entry.payload), data = { changes, requestId: 'test-review-0001' };
  const result = reviewDemoPeople(library, data);
  assert.deepEqual(result, { ok: true, applied: 5, deletedPhotos: 1, cleanupPending: 0 });
  assert.equal(library.people.find(person => person.id === 'p0').name, 'Luis');
  assert.ok(!library.people.some(person => ['p1', 'p2'].includes(person.id)));
  assert.deepEqual(library.people.find(person => person.id === 'ana').photoIds, ['photo1']);
  assert.deepEqual(library.people.find(person => person.id === 'unknown').photoIds, ['photo2']);
  assert.equal(library.manualFaces.photo1[0].personId, 'ana');
  assert.equal(library.manualFaces.photo2[0].personId, 'unknown');
  assert.equal(library.photos.length, 3);
  assert.deepEqual(library.metadata, {}); assert.deepEqual(library.importFiles, {}); assert.deepEqual(library.importBatches, {});
  const before = structuredClone(library);
  assert.deepEqual(reviewDemoPeople(library, data), result);
  assert.deepEqual(library, before);
  assert.throws(() => reviewDemoPeople(library, { ...data, changes: changes.slice(0, 1) }));
});

test('invalid final demo action leaves earlier actions and originals unchanged', () => {
  const library = demoLibrary(), before = structuredClone(library), changes = entriesFor(allDrafts()).map(entry => entry.payload);
  changes.at(-1).photoIds = ['photo0'];
  assert.throws(() => reviewDemoPeople(library, { changes, requestId: 'test-review-0002' }));
  assert.deepEqual(library, before);
});
