// Coordinates are in the unscaled viewport, so the editor stays readable while
// its anchor follows the image through zoom, pan and resize.
export function facePopoverPosition(box, view, viewport, panel) {
  const gap = 12, width = Math.max(0, Math.min(panel.width, viewport.width - gap * 2));
  const height = Math.max(0, Math.min(panel.height, viewport.height - gap * 2));
  const clamp = (value, limit) => Math.max(gap, Math.min(value, limit - gap));
  if (!box) return { left: clamp((viewport.width - width) / 2, viewport.width - width), top: gap, width };
  const left = viewport.width / 2 + view.x + (box.x - .5) * view.width * view.scale;
  const top = viewport.height / 2 + view.y + (box.y - .5) * view.height * view.scale;
  const right = left + box.width * view.width * view.scale;
  const bottom = top + box.height * view.height * view.scale;
  let x = right + gap, y = top;
  if (x + width > viewport.width - gap) {
    if (left - width - gap >= gap) x = left - width - gap;
    else { x = left; y = bottom + gap + height <= viewport.height - gap ? bottom + gap : top - height - gap; }
  }
  return { left: clamp(x, viewport.width - width), top: clamp(y, viewport.height - height), width };
}
