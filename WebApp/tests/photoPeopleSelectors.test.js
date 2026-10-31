import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { photoStrings } from '../src/photoStrings.js';
import { reviewPeopleOptions } from '../src/photoReviewWizard.js';
import { photoAssignmentOptions } from '../src/photoLibrary.js';

const result = await build({ stdin: { contents: `
  export { FaceNameEditor } from './PhotoFaceViewer.jsx';
  export { PersonEditor } from './PhotoPeople.jsx';
  export { PersonMergeForm, PeopleToolbar } from './PhotoPeopleActions.jsx';
  export { NewPersonReview } from './PhotoReviewWizard.jsx';
  export { NewPersonCardActions } from './PhotoPeopleBatch.jsx';
`, resolveDir: new URL('../src/', import.meta.url).pathname }, bundle: true, write: false,
  format: 'cjs', platform: 'node', external: ['react', 'react-dom'], loader: { '.css': 'empty', '.png': 'dataurl' },
  define: { 'import.meta.env': '{"VITE_WEB_DEV_MODE":"mock"}' } });
const module = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { FaceNameEditor, PersonEditor, PersonMergeForm, PeopleToolbar, NewPersonReview, NewPersonCardActions } = module.exports;

// Match the compact knownPeople response: no photoIds are sent to these selectors.
const known = [
  { id: 'salarich', name: 'Monica Salarich', photoCount: 3 },
  { id: 'alba', name: 'Mónica Alba', photoCount: 1 },
  { id: 'molas', name: 'Mónica Molas', photoCount: 150 },
  { id: 'zoe', name: 'Zoe', photoCount: 1000 },
  { id: 'ana', name: 'Ana', photoCount: 0 },
];
const expected = ['unknown', 'ana', 'molas', 'salarich', 'alba', 'zoe'];
const person = { id: 'source', name: 'Persona 12', photoIds: [] };

test('face assignment, individual and bulk merges, and new-person review render the same count-aware options', () => {
  for (const language of ['es', 'ca', 'en']) {
    const s = photoStrings(language);
    const cases = [
      [FaceNameEditor, { face: {}, people: known }],
      [PersonEditor, { person, people: known }],
      [PersonMergeForm, { people: known, excludedIds: [person.id] }],
      [PeopleToolbar, { people: known, selected: [person], editing: true }],
      [NewPersonReview, { person, library: { knownPeople: known, photos: [] }, drafts: {}, position: 1, total: 1 }],
    ];
    for (const [component, props] of cases) {
      const html = renderToStaticMarkup(React.createElement(component, { ...props, s }));
      const ids = [...html.matchAll(/<option\b[^>]*value="([^"]*)"/g)].map(match => match[1]).filter(id => expected.includes(id));
      assert.deepEqual(ids, expected, `${component.name} (${language})`);
    }
    const reviewChoices = reviewPeopleOptions(known, {}, [{ id: person.id, name: 'Monica Abad' }]);
    assert.deepEqual(photoAssignmentOptions(reviewChoices, s).slice(0, -1).map(p => p.id),
      ['unknown', 'ana', 'molas', 'salarich', 'alba', 'review-draft:monica%20abad']);
    assert.equal(photoAssignmentOptions(reviewChoices, s).at(-1).id, 'zoe');
    const card = NewPersonCardActions({ person, people: known, s });
    const picker = React.Children.toArray(React.Children.toArray(card.props.children)[0].props.children).find(child => child.props.choices);
    assert.deepEqual(picker.props.choices.map(p => p.id), expected);
  }
});
