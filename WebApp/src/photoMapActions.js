// Keep the secondary action available on mouse, keyboard and touch screens.
export function attachPhotoMarkerActions(button, { activate, openGroup }) {
  const listeners = [];
  let timer, touch, held = false;
  const listen = (type, handler) => { button.addEventListener(type, handler); listeners.push([type, handler]); };
  const cancel = () => { clearTimeout(timer); touch = null; };
  const consume = event => { event.preventDefault(); event.stopPropagation(); };
  listen('click', event => {
    consume(event);
    if (held) { held = false; return; }
    if (event.detail > 1) return;
    if (event.shiftKey && openGroup) openGroup(); else activate();
  });
  listen('dblclick', consume);
  if (openGroup) {
    listen('contextmenu', event => { consume(event); cancel(); if (!held) openGroup(); });
    listen('keydown', event => {
      if (event.key === 'ContextMenu' || event.shiftKey && ['Enter', 'F10'].includes(event.key)) {
        consume(event); openGroup();
      }
    });
    listen('pointerdown', event => {
      held = false; cancel();
      if (event.button === 2) event.stopPropagation();
      if (event.pointerType !== 'touch' || !event.isPrimary) return;
      touch = { x: event.clientX, y: event.clientY };
      timer = setTimeout(() => { held = true; touch = null; openGroup(); }, 550);
    });
    listen('pointermove', event => {
      if (touch && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 8) cancel();
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) listen(type, cancel);
  }
  return () => { cancel(); for (const [type, handler] of listeners) button.removeEventListener(type, handler); };
}
