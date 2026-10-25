import test from 'node:test';
import assert from 'node:assert/strict';
import { neighboringPerson, handlePeopleReviewKey, nextPersonField, searchPersonOptions } from '../src/photoPeopleKeyboard.js';
const geometry = (count, columns) => Array.from({ length: count }, (_, i) => ({ top: Math.floor(i / columns) * 700, center: (i % columns) * 220 + 100 }));

test('arrows follow visible rows, wrap horizontally and clamp partial rows at different widths', () => {
  const desktop = geometry(14, 6);
  for (const [index, key, expected] of [[1, 'ArrowDown', 7], [7, 'ArrowUp', 1], [5, 'ArrowRight', 6], [6, 'ArrowLeft', 5],
    [11, 'ArrowDown', 13], [13, 'ArrowDown', 13], [0, 'ArrowLeft', 0], [0, 'ArrowUp', 0], [13, 'ArrowRight', 13]])
    assert.equal(neighboringPerson(desktop, index, key), expected);
  const narrow = geometry(7, 2);
  assert.equal(neighboringPerson(narrow, 1, 'ArrowDown'), 3);
  assert.equal(neighboringPerson(narrow, 5, 'ArrowDown'), 6);
  assert.equal(neighboringPerson(narrow, 6, 'ArrowUp'), 4);
});

function fixture() {
  let focused = null, clicks = 0;
  const library = { querySelector: () => ({ getBoundingClientRect: () => ({ height: 88 }) }) };
  const grid = { querySelectorAll: selector => selector === '[data-person-review-card]' ? cards : cards.flatMap(card => card.fields),
    contains: field => cards.some(card => card.fields.includes(field)) };
  const cards = geometry(7, 3).map((rect, i) => {
    const card = { offsetTop: rect.top, offsetLeft: rect.center - 100, offsetWidth: 200, querySelectorAll: () => card.fields };
    card.fields = ['merge', 'rename', 'delete', 'deletePhotos', 'unknown', ...(i === 0 ? ['undo'] : [])].map(name => ({
      dataset: { personField: name }, style: {}, disabled: false,
      type: name.startsWith('delete') || name === 'unknown' ? 'checkbox' : name === 'rename' ? 'text' : 'button',
      closest: selector => selector === '[data-person-field]' ? card.fields.find(field => field.dataset.personField === name) :
        selector === '[data-person-review-grid]' ? grid : selector === '[data-person-review-card]' ? card : library,
      focus(options) { focused = this; assert.equal(options.preventScroll, true); },
      scrollIntoView(options) { this.scrolled = options; }, click() { clicks++; },
    }));
    return card;
  });
  const field = (card, name) => cards[card].fields.find(field => field.dataset.personField === name);
  const fire = (field, key, extra = {}) => {
    const event = { key, target: field, currentTarget: grid,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...extra };
    handlePeopleReviewKey(event); return event;
  };
  return { field, fire, focused: () => focused, clicks: () => clicks };
}

test('moving cards preserves the field, avoids the sticky toolbar and never changes a value', () => {
  const f = fixture(), moved = f.fire(f.field(0, 'rename'), 'ArrowDown');
  assert.equal(moved.defaultPrevented, true); assert.equal(moved.stopped, true);
  assert.equal(f.focused(), f.field(3, 'rename'));
  assert.equal(f.focused().style.scrollMarginTop, '116px');
  assert.deepEqual(f.focused().scrolled, { block: 'nearest', inline: 'nearest' });
  f.fire(f.field(0, 'merge'), 'ArrowRight');
  assert.equal(f.focused(), f.field(1, 'merge')); assert.equal(f.clicks(), 0);
  f.fire(f.field(0, 'undo'), 'ArrowRight');
  assert.equal(f.focused(), f.field(1, 'unknown'));
  f.field(2, 'deletePhotos').disabled = true;
  f.fire(f.field(1, 'deletePhotos'), 'ArrowRight');
  assert.equal(f.focused(), f.field(2, 'delete'));
});

test('Tab and Shift+Tab wrap inside the same card, including its optional undo button', () => {
  const f = fixture();
  for (const [from, to] of [['merge', 'rename'], ['rename', 'delete'], ['delete', 'deletePhotos'], ['deletePhotos', 'unknown'], ['unknown', 'undo']]) {
    f.fire(f.field(0, from), 'Tab'); assert.equal(f.focused(), f.field(0, to));
  }
  f.fire(f.field(0, 'undo'), 'Tab'); assert.equal(f.focused(), f.field(0, 'merge'));
  f.fire(f.field(0, 'merge'), 'Tab', { shiftKey: true }); assert.equal(f.focused(), f.field(0, 'undo'));
  f.fire(f.field(1, 'merge'), 'Tab', { shiftKey: true }); assert.equal(f.focused(), f.field(1, 'unknown'));
  f.field(1, 'deletePhotos').disabled = true;
  assert.equal(nextPersonField(f.field(1, 'delete')), f.field(1, 'unknown'));
  assert.equal(nextPersonField(f.field(1, 'unknown'), true), f.field(1, 'delete'));
  assert.equal(f.fire(f.field(6, 'unknown'), 'Tab').defaultPrevented, true);
  assert.equal(f.focused(), f.field(6, 'merge'));
  f.field(1, 'delete').disabled = true; f.field(1, 'rename').disabled = true; f.field(1, 'unknown').disabled = true;
  assert.equal(nextPersonField(f.field(1, 'merge')), f.field(1, 'merge'));
});

test('vertical arrows stay in the person picker but move rows from every other field', () => {
  const f = fixture();
  for (const key of ['ArrowUp', 'ArrowDown']) {
    assert.equal(f.fire(f.field(0, 'merge'), key).defaultPrevented, undefined);
    assert.equal(f.focused(), null);
  }
  for (const name of ['rename', 'delete', 'deletePhotos', 'unknown']) {
    f.fire(f.field(0, name), 'ArrowDown'); assert.equal(f.focused(), f.field(3, name));
    f.fire(f.field(3, name), 'ArrowUp'); assert.equal(f.focused(), f.field(0, name));
  }
});

test('person name search builds prefixes, ignores accents and supports compound names and correction', () => {
  const options = [{ id: '', name: 'Seleccionar persona' }, { id: 'a', name: 'Álvaro' },
    { id: 'm1', name: 'María Dolores' }, { id: 'm2', name: 'Maria José' }, { id: 'l', name: 'Laura' }];
  let result = { index: 0, search: { text: '', time: 0 } }, now = 5000;
  const type = key => { result = searchPersonOptions(options, result.index, result.search, key, now += 50); return result.index; };
  assert.equal(type('A'), 1);
  now += 1500;
  for (const key of 'maria j') type(key);
  assert.equal(result.index, 3);
  assert.equal(type('z'), 3); // An unmatched prefix must not select another person.
  type('Backspace'); type('Backspace'); type('d');
  assert.equal(result.index, 2);
  now += 1500; assert.equal(type('L'), 4);
  now += 1500; assert.equal(type('s'), 4); // The placeholder isn't a person match.
});

test('repeated initials cycle matching people and restart after a pause', () => {
  const options = [{ id: '', name: 'Seleccionar persona' }, { id: 'a1', name: 'Ana' }, { id: 'a2', name: 'Arnau' }];
  let result = searchPersonOptions(options, 0, { text: '', time: 0 }, 'a', 5000);
  assert.equal(result.index, 1);
  result = searchPersonOptions(options, result.index, result.search, 'a', 5100); assert.equal(result.index, 2);
  result = searchPersonOptions(options, result.index, result.search, 'a', 5200); assert.equal(result.index, 1);
  result = searchPersonOptions(options, result.index, result.search, 'a', 7000); assert.equal(result.index, 2);
});

test('Enter toggles checkboxes once; ordinary button and space activation stays native', () => {
  const f = fixture();
  assert.equal(f.fire(f.field(0, 'delete'), 'Enter').defaultPrevented, true);
  assert.equal(f.fire(f.field(0, 'deletePhotos'), 'Enter').defaultPrevented, true);
  assert.equal(f.fire(f.field(0, 'unknown'), 'Enter').defaultPrevented, true);
  assert.equal(f.clicks(), 3);
  f.fire(f.field(0, 'delete'), 'Enter', { repeat: true }); assert.equal(f.clicks(), 3);
  f.fire(f.field(0, 'unknown'), 'Enter', { repeat: true }); assert.equal(f.clicks(), 3);
  for (const field of ['undo', 'merge']) assert.equal(f.fire(f.field(0, field), 'Enter').defaultPrevented, undefined);
  assert.equal(f.fire(f.field(0, 'delete'), ' ').defaultPrevented, undefined);
});

test('shortcuts are scoped to review fields and preserve composition and modified arrows', () => {
  const f = fixture();
  for (const extra of [{ shiftKey: true }, { altKey: true }, { metaKey: true }, { ctrlKey: true }, { isComposing: true }, { nativeEvent: { isComposing: true } }])
    assert.equal(f.fire(f.field(0, 'rename'), 'ArrowLeft', extra).defaultPrevented, undefined);
  assert.equal(f.fire({ closest: () => null }, 'ArrowDown').defaultPrevented, undefined);
  const outside = { closest: () => outside };
  assert.equal(f.fire(outside, 'ArrowDown').defaultPrevented, undefined); assert.equal(f.focused(), null);
});
