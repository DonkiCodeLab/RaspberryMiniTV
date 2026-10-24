import test from 'node:test';
import assert from 'node:assert/strict';
import { neighboringPerson, handlePeopleReviewKey, nextPersonField } from '../src/photoPeopleKeyboard.js';
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
    card.fields = ['merge', 'rename', 'delete', 'deletePhotos', ...(i === 0 ? ['undo'] : [])].map(name => ({
      dataset: { personField: name }, style: {}, disabled: false,
      type: name.startsWith('delete') ? 'checkbox' : name === 'rename' ? 'text' : 'button',
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
  assert.equal(f.focused(), f.field(1, 'deletePhotos'));
  f.field(2, 'deletePhotos').disabled = true;
  f.fire(f.field(1, 'deletePhotos'), 'ArrowRight');
  assert.equal(f.focused(), f.field(2, 'delete'));
});

test('Tab visits editing controls, skips unavailable ones and exits at grid ends', () => {
  const f = fixture();
  for (const [from, to] of [['merge', 'rename'], ['rename', 'delete'], ['delete', 'deletePhotos'], ['deletePhotos', 'undo']]) {
    f.fire(f.field(0, from), 'Tab'); assert.equal(f.focused(), f.field(0, to));
  }
  f.fire(f.field(0, 'undo'), 'Tab'); assert.equal(f.focused(), f.field(1, 'merge'));
  f.fire(f.field(1, 'merge'), 'Tab', { shiftKey: true }); assert.equal(f.focused(), f.field(0, 'undo'));
  f.field(1, 'deletePhotos').disabled = true;
  assert.equal(nextPersonField(f.field(1, 'delete')), f.field(2, 'merge'));
  assert.equal(f.fire(f.field(6, 'deletePhotos'), 'Tab').defaultPrevented, undefined);
  assert.equal(f.fire(f.field(0, 'merge'), 'Tab', { shiftKey: true }).defaultPrevented, undefined);
});

test('Enter toggles checkboxes once; ordinary button and space activation stays native', () => {
  const f = fixture();
  assert.equal(f.fire(f.field(0, 'delete'), 'Enter').defaultPrevented, true);
  assert.equal(f.fire(f.field(0, 'deletePhotos'), 'Enter').defaultPrevented, true);
  assert.equal(f.clicks(), 2);
  f.fire(f.field(0, 'delete'), 'Enter', { repeat: true }); assert.equal(f.clicks(), 2);
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
