const cardSelector = '[data-photo-select-id]';
const startSelector = '[data-photo-select-start]';

export function selectionScrollSpeed(point, bounds) {
  if (point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom) return 0;
  const edge = Math.min(64, (bounds.bottom - bounds.top) / 4);
  if (point.y < bounds.top + edge) return -18 * (1 - (point.y - bounds.top) / edge);
  if (point.y > bounds.bottom - edge) return 18 * (1 - (bounds.bottom - point.y) / edge);
  return 0;
}

// Paint a fixed selection state for the whole gesture. A plain click retains
// the button/checkbox's native behavior, and revisiting a tile never toggles it.
export function attachPhotoDragSelection(grid, isSelected, onSelection) {
  const doc = grid.ownerDocument, win = doc.defaultView;
  let gesture = null, frame = null, clickTimer = null, suppressClick = false;
  const point = event => ({ x: event.clientX, y: event.clientY });
  const cardAt = position => {
    const card = doc.elementFromPoint(position.x, position.y)?.closest(cardSelector);
    return card && grid.contains(card) ? card : null;
  };
  const paint = (from, to) => {
    const ids = [], steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 12));
    for (let step = 0; step <= steps; step++) {
      const card = cardAt({ x: from.x + (to.x - from.x) * step / steps, y: from.y + (to.y - from.y) * step / steps });
      const id = card?.dataset.photoSelectId;
      if (id && !gesture.visited.has(id)) { gesture.visited.add(id); ids.push(id); }
    }
    if (ids.length) onSelection(ids, gesture.select);
  };
  const scrollFrame = time => {
    frame = null;
    if (!gesture?.active) return;
    const { scroller, position } = gesture;
    const bounds = scroller === doc.scrollingElement ? { left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight } : scroller.getBoundingClientRect();
    const rect = grid.getBoundingClientRect();
    const speed = position.x >= rect.left && position.x <= rect.right ? selectionScrollSpeed(position, bounds) : 0;
    if (speed && (speed > 0 ? rect.bottom > bounds.bottom : rect.top < bounds.top)) {
      const before = scroller.scrollTop;
      scroller.scrollTop += speed * Math.min(2, (time - (gesture.time || time - 16)) / 16);
      if (scroller.scrollTop !== before) paint(position, position);
    }
    gesture.time = time;
    frame = win.requestAnimationFrame(scrollFrame);
  };
  const clearClick = () => {
    if (clickTimer !== null) win.clearTimeout(clickTimer);
    clickTimer = null; suppressClick = false;
  };
  const releaseClick = () => { if (suppressClick && clickTimer === null) clickTimer = win.setTimeout(clearClick, 0); };
  const finish = () => {
    const previous = gesture;
    gesture = null;
    if (frame !== null) win.cancelAnimationFrame(frame);
    frame = null;
    grid.classList.remove('is-drag-selecting');
    if (previous && grid.hasPointerCapture(previous.id)) grid.releasePointerCapture(previous.id);
  };
  const down = event => {
    if (gesture || event.button !== 0 || !['mouse', 'pen'].includes(event.pointerType) || event.isPrimary === false || event.ctrlKey || event.metaKey || event.altKey) return;
    const control = event.target.closest?.(startSelector), card = control?.closest(cardSelector);
    if (!control || control.disabled || !card || !grid.contains(card)) return;
    clearClick();
    let scroller = grid.parentElement;
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/.test(win.getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
    gesture = { id: event.pointerId, start: point(event), position: point(event), firstId: card.dataset.photoSelectId,
      select: !isSelected(card.dataset.photoSelectId), visited: new Set(), active: false, scroller: scroller || doc.scrollingElement };
  };
  const move = event => {
    if (gesture?.id !== event.pointerId) return;
    if (!(event.buttons & 1)) { finish(); releaseClick(); return; }
    const next = point(event);
    if (!gesture.active && Math.hypot(next.x - gesture.start.x, next.y - gesture.start.y) < 6) return;
    event.preventDefault();
    if (!gesture.active) {
      gesture.active = true; suppressClick = true;
      grid.setPointerCapture(gesture.id);
      grid.classList.add('is-drag-selecting');
      gesture.visited.add(gesture.firstId);
      onSelection([gesture.firstId], gesture.select);
      frame = win.requestAnimationFrame(scrollFrame);
    }
    paint(gesture.position, next);
    gesture.position = next;
  };
  const end = event => {
    if (gesture?.id === event.pointerId) finish();
    // Keep suppressing until release, including after Escape cancels a drag.
    if (!gesture && event.type !== 'lostpointercapture') releaseClick();
  };
  // The browser's trailing click must not undo the last selection or validate.
  const click = event => { if (suppressClick && event.detail !== 0) { event.preventDefault(); event.stopImmediatePropagation(); } };
  const nextDown = () => { if (!gesture) clearClick(); };
  const nativeDrag = event => { if (gesture) event.preventDefault(); };
  const escape = event => { if (gesture && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(); } };
  grid.addEventListener('pointerdown', down);
  grid.addEventListener('dragstart', nativeDrag);
  grid.addEventListener('lostpointercapture', end);
  doc.addEventListener('pointerdown', nextDown, true);
  doc.addEventListener('pointermove', move, { passive: false });
  doc.addEventListener('pointerup', end);
  doc.addEventListener('pointercancel', end);
  doc.addEventListener('click', click, true);
  doc.addEventListener('keydown', escape, true);
  win.addEventListener('blur', finish);
  return () => {
    finish();
    if (clickTimer !== null) win.clearTimeout(clickTimer);
    grid.removeEventListener('pointerdown', down);
    grid.removeEventListener('dragstart', nativeDrag);
    grid.removeEventListener('lostpointercapture', end);
    doc.removeEventListener('pointerdown', nextDown, true);
    doc.removeEventListener('pointermove', move);
    doc.removeEventListener('pointerup', end);
    doc.removeEventListener('pointercancel', end);
    doc.removeEventListener('click', click, true);
    doc.removeEventListener('keydown', escape, true);
    win.removeEventListener('blur', finish);
  };
}
