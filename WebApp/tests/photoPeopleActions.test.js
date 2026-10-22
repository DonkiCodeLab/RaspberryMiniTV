import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { photoStrings } from '../src/photoStrings.js';

const result = await build({ entryPoints: [new URL('../src/PhotoPeopleActions.jsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
  loader: { '.png': 'dataurl' }, define: { 'import.meta.env': '{}' } });
const module = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { PersonMergeForm, PersonCardActions, PeopleToolbar, PeopleActionSummary } = module.exports;
const people = [{ id: 'a', name: 'Ana', photoIds: ['one', 'shared'] }, { id: 'b', name: 'Luis', photoIds: ['shared'] }, { id: 'c', name: 'Destino', photoIds: [] }];
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test('merge selector starts without a destination and excludes every source', () => {
  for (const language of ['es', 'en', 'ca']) {
    const s = photoStrings(language);
    const html = render(PersonMergeForm, { people, excludedIds: ['a', 'b'], s });
    assert.match(html, /<option value="" disabled="" selected=""/);
    assert.match(html, /<option value="c">Destino/);
    assert.doesNotMatch(html, /<option value="[ab]"/);
    assert.match(html, new RegExp(`type="submit"[^>]*disabled="">${s.merge}`));
  }
});

test('card editing controls are inert when collapsed, selected when open, and protect Unknown', () => {
  const s = photoStrings('es'), props = { people, person: people[0], s, selected: true, onSelect() {} };
  const hidden = render(PersonCardActions, { ...props, editing: false });
  assert.match(hidden, /inert="" aria-hidden="true"/);
  const open = render(PersonCardActions, { ...props, editing: true });
  assert.doesNotMatch(open, /inert=""/);
  assert.match(open, /type="checkbox"[^>]*checked=""/);
  assert.match(open, /aria-label="Descargar fotos: Ana"/);
  const unknown = render(PersonCardActions, { ...props, person: { id: 'unknown', name: s.unknownPerson, photoIds: ['one'] }, editing: true });
  assert.doesNotMatch(unknown, /<select/);
  assert.match(unknown, /class="photo-person-delete" disabled=""/);
});

test('bulk controls use the complete selected list and disable destructive actions for Unknown', () => {
  const s = photoStrings('es'), props = { s, people, editing: true, onToggle() {} };
  assert.doesNotMatch(render(PeopleToolbar, { ...props, editing: false, selected: [] }), /<select/);
  const selected = render(PeopleToolbar, { ...props, selected: people.slice(0, 2) });
  assert.match(selected, /2 personas seleccionadas/);
  // A bulk selection may include the destination: keep it and merge the others.
  assert.match(selected, /<option value="a">Ana/);
  assert.match(selected, /<option value="b">Luis/);
  const fixed = render(PeopleToolbar, { ...props, selected: [{ id: 'unknown', photoIds: ['one'] }] });
  assert.match(fixed, /disabled="">Eliminar personas/);
  assert.match(fixed, /<select[^>]*disabled=""/);
  assert.doesNotMatch(fixed, /disabled="">Descargar seleccionadas/);
  assert.ok(fixed.includes(s.fixedPerson));
});

test('bulk merge remains available when Unknown is selected alongside people', () => {
  for (const language of ['es', 'en', 'ca']) {
    const s = photoStrings(language);
    const unknown = { id: 'unknown', name: s.unknownPerson, photoIds: ['one'] };
    for (const sources of [people.slice(0, 1), people.slice(0, 2)]) {
      const html = render(PeopleToolbar, { s, people: [unknown, ...people], editing: true,
        selected: [unknown, ...sources], onToggle() {} });
      assert.match(html, /<select/);
      assert.doesNotMatch(html, /<select[^>]*disabled=""/);
      assert.ok(html.includes(`<option value="unknown">${s.unknownPerson}</option>`));
      assert.ok(html.includes(`disabled="">${s.deletePeople}`));
      if (sources.length === 1) assert.doesNotMatch(html, /<option value="a">/);
    }
    for (const selected of [[], [unknown]]) {
      const html = render(PeopleToolbar, { s, people, editing: true, selected, onToggle() {} });
      assert.match(html, /<select[^>]*disabled=""/);
    }
    const busy = render(PeopleToolbar, { s, people, editing: true, selected: [unknown, ...people], busy: true, onToggle() {} });
    assert.match(busy, /<select[^>]*disabled=""/);
  }
});

test('bulk merge confirmation receives only movable sources, excluding Unknown and the destination', () => {
  const inspected = { exports: {} };
  const require = createRequire(import.meta.url);
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    name => name === 'react' ? { ...React, useId: () => 'toolbar-test' } : require(name), inspected, inspected.exports);
  const unknown = { id: 'unknown', name: 'Desconocido', photoIds: ['one'] };
  for (const target of [unknown, people[0]]) {
    let action;
    const toolbar = inspected.exports.PeopleToolbar({ s: photoStrings('es'), people: [unknown, ...people],
      selected: [unknown, ...people], editing: true, onAction: (...args) => { action = args; } });
    const bulk = React.Children.toArray(toolbar.props.children)[1];
    const merge = React.Children.toArray(bulk.props.children).find(child => child.type === inspected.exports.PersonMergeForm);
    merge.props.onMerge(target);
    assert.deepEqual(action, ['merge', people.filter(person => person.id !== target.id), target]);
  }
});

test('all confirmations list exact sources, show merge destination and explain original photo handling', () => {
  for (const language of ['es', 'en', 'ca']) {
    const s = photoStrings(language);
    for (const action of ['merge', 'delete', 'download']) {
      const html = render(PeopleActionSummary, { action, people: people.slice(0, 2), target: action === 'merge' ? people[2] : null, s });
      assert.match(html, /<strong>Ana<\/strong>/);
      assert.match(html, /<strong>Luis<\/strong>/);
      assert.match(html, /2 .*<\/span>/);
      assert.ok(html.includes(action === 'delete' ? s.deletePeopleHint : action === 'download' ? s.downloadPeopleHint : s.mergePeopleConfirmHint));
      if (action === 'merge') assert.ok(html.includes(`${s.destination}: Destino`));
    }
  }
});
