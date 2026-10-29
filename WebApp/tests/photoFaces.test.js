import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { photoStrings } from '../src/photoStrings.js';
import { photosWithoutPeople, photoPeopleOptions, photoAssignmentOptions, UNKNOWN_PERSON_ID } from '../src/photoLibrary.js';

async function load(file) {
  const result = await build({ entryPoints: [new URL(file, import.meta.url).pathname], bundle: true, write: false,
    format: 'cjs', platform: 'node', external: ['react'], define: { 'import.meta.env': '{"VITE_WEB_DEV_MODE":"mock"}' } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  return module.exports;
}
const { FaceRectangles } = await load('../src/PhotoViewerImage.jsx');
const { default: PhotoFaceViewer, FaceNameEditor, PhotoFaceList, FaceRemoveConfirmation, PersonFaceControls } = await load('../src/PhotoFaceViewer.jsx');
const { PersonEditor } = await load('../src/PhotoPeople.jsx');
const s = photoStrings('es');
const faces = [
  { id: 'face-a', personId: 'ana', name: 'Ana', box: { x: .1, y: .2, width: .25, height: .3 } },
  { id: 'face-b', personId: null, name: null, box: { x: .6, y: .3, width: .2, height: .4 } },
  { id: 'legacy', personId: 'old', name: 'Old', box: null },
];

test('person browsing hides other faces and editing actions until editing is enabled', () => {
  const props = { photo: { id: 'photo', name: 'Family', relativePath: 'family.jpg' }, initialFaces: faces, highlightPersonId: 'ana', s };
  const browsing = renderToStaticMarkup(React.createElement(PhotoFaceViewer, { ...props, editing: false, showOtherFaces: false }));
  assert.match(browsing, /role="img" aria-label="Ana"/);
  assert.doesNotMatch(browsing, /aria-label="Sin asignar"|photo-face-sidebar|Añadir cara|Nombre de esta cara:/);
  const all = renderToStaticMarkup(React.createElement(PhotoFaceViewer, { ...props, editing: false, showOtherFaces: true }));
  assert.match(all, /role="img" aria-label="Ana"/);
  assert.match(all, /role="img" aria-label="Sin asignar"/);
  const others = renderToStaticMarkup(React.createElement(PhotoFaceViewer, { ...props, editing: false, showPersonFaces: false, showOtherFaces: true }));
  assert.doesNotMatch(others, /role="img" aria-label="Ana"/);
  assert.match(others, /role="img" aria-label="Sin asignar"/);
  const hidden = renderToStaticMarkup(React.createElement(PhotoFaceViewer, { ...props, editing: false, showPersonFaces: false, showOtherFaces: false }));
  assert.doesNotMatch(hidden, /photo-face-box|photo-face-sidebar/);
  const editing = renderToStaticMarkup(React.createElement(PhotoFaceViewer, { ...props, editing: true, showOtherFaces: true }));
  assert.match(editing, /Nombre de esta cara: Ana/);
  assert.match(editing, /Nombre de esta cara: Sin asignar/);
  assert.match(editing, /photo-face-sidebar/);
  assert.ok(editing.includes(s.addFace));
});

test('face rectangles can be hidden in a general album while keeping face editing available', () => {
  const props = { photo: { id: 'photo', name: 'Family', relativePath: 'family.jpg' }, initialFaces: faces, s };
  const shown = renderToStaticMarkup(React.createElement(PhotoFaceViewer, { ...props, showOtherFaces: true }));
  const hidden = renderToStaticMarkup(React.createElement(PhotoFaceViewer, { ...props, showOtherFaces: false }));
  assert.match(shown, /Nombre de esta cara: Ana/);
  assert.doesNotMatch(hidden, /photo-face-box/);
  assert.ok(hidden.includes(s.addFace));
});

test('face visibility and edit controls expose their independent states and work in every language', () => {
  for (const language of ['es', 'en', 'ca']) {
    let personVisible = true, othersVisible = false, editing = false;
    const strings = photoStrings(language);
    const props = { personName: 'Pepito', showPersonFaces: personVisible, onShowPersonFaces: value => { personVisible = value; },
      showOtherFaces: othersVisible, editing, onShowOtherFaces: value => { othersVisible = value; }, onEditing: value => { editing = value; }, s: strings };
    const html = renderToStaticMarkup(React.createElement(PersonFaceControls, props));
    assert.equal((html.match(/type="checkbox"/g) || []).length, 2);
    assert.equal((html.match(/checked=""/g) || []).length, 1);
    assert.match(html, /aria-pressed="false"/);
    for (const key of ['showPersonFaces', 'showOtherFaces', 'editFaces', 'finishFaceEditing', 'validateFaceChange', 'personPhotoBrowseHint']) assert.ok(strings[key]);
    assert.ok(html.includes(strings.showPersonFaces.replace('{name}', 'Pepito')));
    assert.ok(html.includes(strings.showOtherFaces));
    assert.ok(html.includes(strings.editFaces));
    const controls = PersonFaceControls(props).props.children;
    controls[0].props.children[0].props.onChange({ target: { checked: false } });
    assert.equal(personVisible, false); assert.equal(othersVisible, false);
    controls[1].props.children[0].props.onChange({ target: { checked: true } });
    assert.equal(personVisible, false); assert.equal(othersVisible, true);
    controls[2].props.onClick();
    assert.equal(editing, true);
    const locked = renderToStaticMarkup(React.createElement(PersonFaceControls, { ...props, disabled: true }));
    assert.equal((locked.match(/disabled=""/g) || []).length, 3);
  }
});

test('new face identities reject provisional labels and invalid names before validation', () => {
  for (const initialName of ['Persona 12', '../invalid', ' ', 'bad/name']) {
    const html = renderToStaticMarkup(React.createElement(FaceNameEditor, { face: {}, people: [], initialName, s }));
    assert.ok(html.includes(`disabled="">${s.save}`));
  }
  const html = renderToStaticMarkup(React.createElement(FaceNameEditor, { face: {}, people: [], initialName: 'Marta', s }));
  assert.ok(!html.includes(`disabled="">${s.save}`));
});

test('the face picker labels draft identities and restores their selection in every language', () => {
  const person = { id: 'review-draft:eva', name: 'Eva', draftName: 'Eva' };
  for (const language of ['es', 'en', 'ca']) {
    const strings = photoStrings(language);
    const html = renderToStaticMarkup(React.createElement(FaceNameEditor, {
      face: {}, people: [person], initialName: 'Eva', creating: true, hasBox: true, s: strings,
    }));
    assert.ok(html.includes(`<option value="${person.id}" selected="">${strings.reviewDraftPerson.replace('{name}', person.name)}</option>`));
    assert.ok(!html.includes(`disabled="">${strings.confirmFace}`));
    assert.doesNotMatch(html, /<input[^>]*required/);
  }
});

test('person preview rectangles highlight detections without exposing photo editing controls', () => {
  const html = renderToStaticMarkup(React.createElement(FaceRectangles, { faces: faces.slice(0, 1), highlightPersonId: 'ana', readOnly: true, s }));
  assert.match(html, /<span[^>]*is-highlighted[^>]*role="img" aria-label="Ana"/);
  assert.match(html, /left:10%;top:20%;width:25%;height:30%/);
  assert.doesNotMatch(html, /<button|aria-pressed|Nombre de esta cara/);
});

test('face rectangles use oriented image fractions, highlight the selected person and select a face ID', () => {
  let chosen;
  const props = { faces, selectedFaceId: 'face-b', highlightPersonId: 'ana', onSelect: id => { chosen = id; }, s };
  const html = renderToStaticMarkup(React.createElement(FaceRectangles, props));
  assert.equal((html.match(/<button/g) || []).length, 2);
  assert.match(html, /left:10%;top:20%;width:25%;height:30%/);
  assert.match(html, /is-highlighted/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /Nombre de esta cara: Sin asignar/);
  FaceRectangles(props)[1].props.onClick({ stopPropagation() {} });
  assert.equal(chosen, 'face-b');
});

test('name editor offers known names and new-person creation in every language', () => {
  for (const language of ['es', 'en', 'ca']) {
    const strings = photoStrings(language);
    const html = renderToStaticMarkup(React.createElement(FaceNameEditor, { face: faces[0], people: [{ id: 'ana', name: 'Ana' }], s: strings }));
    assert.match(html, new RegExp(`<option value="unknown">${strings.unknownPerson}</option>`));
    assert.match(html, /value="ana" selected=""/);
    assert.ok(html.includes(strings.newPerson));
    assert.ok(html.includes(strings.newPersonName));
    assert.match(html, /<input/);
    assert.doesNotMatch(html, /<input[^>]*required/);
    const unnamed = renderToStaticMarkup(React.createElement(FaceNameEditor, { face: faces[1], people: [], s: strings }));
    assert.match(unnamed, /<input/);
    assert.match(unnamed, /maxLength="100"/);
  }
});

test('manual face confirmation requires both a finished box and a selected or entered name', () => {
  for (const language of ['es', 'en', 'ca']) {
    const strings = photoStrings(language);
    const render = (face, hasBox) => renderToStaticMarkup(React.createElement(FaceNameEditor, {
      face, hasBox, creating: true, people: [{ id: 'ana', name: 'Ana' }], s: strings,
    }));
    assert.ok(render({ personId: 'ana' }, false).includes(`disabled="">${strings.confirmFace}`));
    assert.ok(!render({ personId: 'ana' }, true).includes(`disabled="">${strings.confirmFace}`));
    assert.ok(render({}, true).includes(`disabled="">${strings.confirmFace}`));
    assert.ok(render({}, false).includes(strings.cancel));
    assert.ok(render({}, false).includes(strings.drawFaceHint));
  }
});

test('identity selectors exclude unnamed detector groups while their albums stay available for review', () => {
  const people = [{ id: 'auto', name: 'Persona 12' }, { id: 'legacy', name: ' person 4 ' },
    { id: 'empty', name: '' }, { id: 'apple-old', name: 'Imported name' }, { id: 'ana', name: 'Ana' }];
  for (const language of ['es', 'en', 'ca']) {
    const strings = photoStrings(language);
    assert.deepEqual(photoAssignmentOptions(people, strings).map(person => person.id), ['unknown', 'ana']);
    assert.ok(photoPeopleOptions(people, strings).some(person => person.id === 'auto'));
    const editor = renderToStaticMarkup(React.createElement(FaceNameEditor, {
      face: { personId: 'auto', name: 'Persona 12' }, people, s: strings,
    }));
    assert.doesNotMatch(editor, /Persona 12|person 4|Imported name/);
    assert.match(editor, /<option value="new" selected=""/);
    assert.match(editor, /<input/);
    assert.ok(editor.includes(`disabled="">${strings.save}`));
    const album = renderToStaticMarkup(React.createElement(PersonEditor, { person: people[0], people, s: strings }));
    const select = album.match(/<select[\s\S]*?<\/select>/)[0];
    assert.doesNotMatch(select, /value="auto"|value="legacy"|value="empty"|value="apple-old"/);
    const unknown = renderToStaticMarkup(React.createElement(FaceNameEditor, { face: { personId: 'unknown' }, people, s: strings }));
    assert.ok(unknown.includes(strings.unknownFaceAssignmentHint));
    assert.match(unknown, /<option value="unknown" selected=""/);
  }
});

test('No people contains only reviewed originals with zero detections, including none of the pending or failed photos', () => {
  const photos = [
    { id: 'empty', faceState: 'done', faceCount: 0 },
    { id: 'pending', faceState: 'pending', faceCount: 0 },
    { id: 'error', faceState: 'error', faceCount: 0 },
    { id: 'unassigned', faceState: 'done', faceCount: 1 },
    { id: 'generated', faceState: 'done', faceCount: 0, sourceId: 'original' },
    { id: 'legacy' },
  ];
  assert.deepEqual(photosWithoutPeople(photos).map(photo => photo.id), ['empty']);
});

test('person albums offer renaming and merging with another known person, excluding themselves', () => {
  for (const language of ['es', 'en', 'ca']) {
    const strings = photoStrings(language);
    const person = { id: 'source', name: 'Persona 1' };
    const html = renderToStaticMarkup(React.createElement(PersonEditor, { person, people: [person,
      { id: 'target', name: 'Ana' }, { id: 'empty', name: 'Luis' }], s: strings }));
    assert.match(html, /<input[^>]+value="Persona 1"/);
    assert.match(html, /<option value="target">Ana<\/option>/);
    assert.match(html, /<option value="empty">Luis<\/option>/);
    assert.doesNotMatch(html, /<option value="source"/);
    assert.ok(html.includes(strings.mergeWith));
    assert.ok(html.includes(`disabled="">${strings.mergePeople}`));
    const alone = renderToStaticMarkup(React.createElement(PersonEditor, { person, people: [person], s: strings }));
    assert.doesNotMatch(alone, /<select[^>]+disabled=""/);
    assert.match(alone, new RegExp(`<select[^>]*><option value="unknown">${strings.unknownPerson}</option>`));
    assert.ok(alone.includes(strings.mergePeopleHint));
  }
});

test('Unknown is unique, localized and first, and its permanent album cannot be renamed or merged away', () => {
  for (const language of ['es', 'ca', 'en']) {
    const strings = photoStrings(language);
    const options = photoPeopleOptions([{ id: 'ana', name: 'Ana' }, { id: UNKNOWN_PERSON_ID, name: 'Desconocido', photoIds: [] }], strings);
    assert.deepEqual(options.map(person => person.id), [UNKNOWN_PERSON_ID, 'ana']);
    assert.equal(options[0].name, strings.unknownPerson);
    const html = renderToStaticMarkup(React.createElement(PersonEditor, { person: options[0], people: options, s: strings }));
    assert.doesNotMatch(html, /<input|<select/);
    assert.ok(html.includes(strings.unknownPersonHint));
    const face = { ...faces[0], personId: UNKNOWN_PERSON_ID, name: 'Desconocido' };
    const editor = renderToStaticMarkup(React.createElement(FaceNameEditor, { face, people: options, s: strings }));
    assert.match(editor, new RegExp(`<option value="unknown" selected="">${strings.unknownPerson}</option>`));
    assert.match(editor, /<option value="ana">Ana<\/option>/);
    const rectangles = renderToStaticMarkup(React.createElement(FaceRectangles, { faces: [face], s: strings }));
    assert.ok(rectangles.includes(`${strings.editFace}: ${strings.unknownPerson}`));
  }
});

test('face correction list selects the exact detection, including legacy faces without rectangles', () => {
  let selected, removing;
  const props = { faces, selectedId: 'face-b', highlightPersonId: 'ana', onSelect: id => { selected = id; }, onRemove: id => { removing = id; }, s };
  const html = renderToStaticMarkup(React.createElement(PhotoFaceList, props));
  assert.equal((html.match(/<button/g) || []).length, 6);
  assert.match(html, /<strong>Ana<\/strong>/);
  assert.match(html, /<strong>Old<\/strong>/);
  assert.match(html, /is-highlighted/);
  assert.match(html, /aria-pressed="true"/);
  const row = PhotoFaceList(props).props.children[2].props.children[2];
  row.props.children[0].props.onClick();
  assert.equal(selected, 'legacy');
  row.props.children[1].props.onClick();
  assert.equal(removing, 'legacy');
  assert.match(html, /aria-label="Quitar cara: Old"/);
  const busy = renderToStaticMarkup(React.createElement(PhotoFaceList, { ...props, busy: true }));
  assert.equal((busy.match(/disabled=""/g) || []).length, 6);
});

test('face removal explains its scope and offers a separate confirmation and cancel action', () => {
  for (const language of ['es', 'en', 'ca']) {
    const strings = photoStrings(language);
    const html = renderToStaticMarkup(React.createElement(FaceRemoveConfirmation, { face: faces[0], s: strings, busy: true }));
    assert.match(html, /role="alertdialog"/);
    assert.ok(html.includes(strings.removeFaceQuestion.replace('{name}', 'Ana')));
    assert.ok(html.includes(strings.removeFaceHint));
    assert.ok(html.includes(strings.cancel));
    assert.equal((html.match(/disabled=""/g) || []).length, 2);
  }
});
