// The image can be smaller than its viewport, or zoomed and clipped by it.
export function attachPhotoFaceShortcut(surface, image, onAddFace, enabled) {
  const doc = surface.ownerDocument, win = doc.defaultView;
  let pointer = null;
  const track = event => { if (event.pointerType === 'mouse') pointer = { x: event.clientX, y: event.clientY }; };
  const leave = () => { pointer = null; };
  const keydown = event => {
    if (!pointer || !enabled() || event.defaultPrevented || event.repeat || event.isComposing ||
        event.ctrlKey || event.metaKey || event.altKey || event.key.toLowerCase() !== 'f') return;
    if (event.target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]')) return;
    const rect = image.getBoundingClientRect();
    if (pointer.x < rect.left || pointer.x >= rect.right || pointer.y < rect.top || pointer.y >= rect.bottom ||
        !surface.contains(doc.elementFromPoint(pointer.x, pointer.y))) return;
    event.preventDefault(); event.stopPropagation();
    onAddFace();
  };
  surface.addEventListener('pointerenter', track);
  surface.addEventListener('pointermove', track, true);
  surface.addEventListener('pointerleave', leave);
  win.addEventListener('blur', leave);
  doc.addEventListener('visibilitychange', leave);
  doc.addEventListener('keydown', keydown);
  return () => {
    surface.removeEventListener('pointerenter', track);
    surface.removeEventListener('pointermove', track, true);
    surface.removeEventListener('pointerleave', leave);
    win.removeEventListener('blur', leave);
    doc.removeEventListener('visibilitychange', leave);
    doc.removeEventListener('keydown', keydown);
  };
}
