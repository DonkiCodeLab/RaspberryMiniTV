const fieldSelector = '[data-person-field]';
const cardSelector = '[data-person-review-card]';
const fieldOrder = ['merge', 'rename', 'delete', 'deletePhotos', 'undo'];

export function neighboringPerson(rects, index, key) {
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const next = index + (key === 'ArrowRight' ? 1 : -1);
    return next >= 0 && next < rects.length ? next : index;
  }
  const current = rects[index];
  if (!current || !['ArrowUp', 'ArrowDown'].includes(key)) return index;
  const candidates = rects.map((rect, i) => ({ ...rect, index: i }))
    .filter(rect => key === 'ArrowDown' ? rect.top > current.top + 1 : rect.top < current.top - 1);
  if (!candidates.length) return index;
  const row = (key === 'ArrowDown' ? Math.min : Math.max)(...candidates.map(rect => rect.top));
  return candidates.filter(rect => Math.abs(rect.top - row) <= 1)
    .sort((a, b) => Math.abs(a.center - current.center) - Math.abs(b.center - current.center))[0].index;
}

const enabledFields = card => [...card.querySelectorAll(fieldSelector)].filter(field => !field.disabled);

export function focusPersonField(field) {
  if (!field || field.disabled) return;
  const toolbar = field.closest('.photo-library')?.querySelector('.photo-people-batch-toolbar');
  field.style.scrollMarginTop = `${(toolbar?.getBoundingClientRect().height || 0) + 28}px`;
  field.focus({ preventScroll: true });
  field.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// Tab stays within the current card, including when its optional undo button
// appears or disappears. Arrows are used to move to another card.
export function nextPersonField(field, backwards = false) {
  const card = field.closest(cardSelector);
  if (!card) return null;
  const fields = enabledFields(card), index = fields.indexOf(field);
  return index < 0 ? null : fields[(index + (backwards ? -1 : 1) + fields.length) % fields.length];
}

const normalizeName = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

export function searchPersonOptions(options, active, previous, key, now = Date.now()) {
  const prefix = now - previous.time < 1000 ? previous.text : '';
  const letter = normalizeName(key);
  const text = key === 'Backspace' ? prefix.slice(0, -1) : prefix === letter ? letter : prefix + letter;
  const start = text.length === 1 && key !== 'Backspace' ? active + 1 : active;
  let index = active;
  if (text) for (let offset = 0; offset < options.length; offset++) {
    const candidate = (start + offset) % options.length;
    if (options[candidate].id && normalizeName(options[candidate].name).startsWith(text)) { index = candidate; break; }
  }
  return { index, search: { text, time: now } };
}

export function handlePeopleReviewKey(event) {
  if (event.defaultPrevented || event.isComposing || event.nativeEvent?.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
  const field = event.target.closest?.(fieldSelector), grid = event.currentTarget;
  if (!field || !grid.contains(field) || field.disabled) return;
  if (event.repeat && ['Enter', ' '].includes(event.key) && field.dataset.personField !== 'rename') {
    event.preventDefault(); event.stopPropagation(); return;
  }
  if (event.key === 'Tab') {
    const next = nextPersonField(field, event.shiftKey);
    if (next) { event.preventDefault(); event.stopPropagation(); focusPersonField(next); }
    return;
  }
  if (event.key === 'Enter' && field.type === 'checkbox') {
    event.preventDefault(); event.stopPropagation();
    if (!event.repeat) field.click();
    return;
  }
  // Shift+arrows keeps text selection/caret editing available inside name inputs.
  if (event.shiftKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  if (field.dataset.personField === 'merge' && ['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  const card = field.closest(cardSelector), cards = [...grid.querySelectorAll(cardSelector)];
  const index = cards.indexOf(card);
  if (index < 0) return;
  // Layout offsets ignore the decorative hover/focus translation of cards.
  const next = neighboringPerson(cards.map(card => ({ top: card.offsetTop, center: card.offsetLeft + card.offsetWidth / 2 })), index, event.key);
  if (next === index) return;
  const fields = enabledFields(cards[next]), name = field.dataset.personField;
  const target = fields.find(control => control.dataset.personField === name) || fields.reduce((best, control) =>
    !best || Math.abs(fieldOrder.indexOf(control.dataset.personField) - fieldOrder.indexOf(name)) <
      Math.abs(fieldOrder.indexOf(best.dataset.personField) - fieldOrder.indexOf(name)) ? control : best, null);
  focusPersonField(target);
}
