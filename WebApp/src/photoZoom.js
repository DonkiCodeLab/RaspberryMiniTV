export const MAX_PHOTO_ZOOM = 8;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const origin = () => ({ scale: 1, x: 0, y: 0 });

export function fittedPhoto(view, image) {
  const ratio = Math.min(view.width / image.width, view.height / image.height);
  return { width: image.width * ratio, height: image.height * ratio };
}

export function constrainPhoto(transform, view, image) {
  const scale = clamp(transform.scale, 1, MAX_PHOTO_ZOOM);
  // Retain the fitted image's margins so portrait/landscape photos can also
  // stay anchored to the cursor along an axis that does not fill the viewport.
  const x = Math.max(0, (image.width * scale - Math.min(view.width, image.width)) / 2);
  const y = Math.max(0, (image.height * scale - Math.min(view.height, image.height)) / 2);
  return { scale, x: x ? clamp(transform.x, -x, x) : 0, y: y ? clamp(transform.y, -y, y) : 0 };
}

// Coordinates are relative to the viewport center. Keep the same image point
// under the fingers/cursor while both the pinch distance and its center move.
export function transformPhoto(start, scale, from, to, view, image) {
  const next = clamp(scale, 1, MAX_PHOTO_ZOOM), ratio = next / start.scale;
  return constrainPhoto({ scale: next, x: to.x - (from.x - start.x) * ratio,
    y: to.y - (from.y - start.y) * ratio }, view, image);
}

export function attachPhotoZoom(element, onChange) {
  let transform = origin(), view = { width: 1, height: 1 }, natural = { width: 1, height: 1 }, image = natural;
  let frame = null, drag = null, safari = null, tap = null, lastTap = null, lastTouchZoom = -Infinity;
  let cursor = { x: 0, y: 0 }, destroyed = false;
  const pointers = new Map(), listeners = [];
  const emit = () => {
    if (frame !== null || destroyed) return;
    frame = requestAnimationFrame(() => { frame = null; onChange({ ...transform, ...image, dragging: pointers.size > 0 }); });
  };
  const apply = value => { transform = constrainPhoto(value, view, image); emit(); };
  const point = event => {
    const rect = element.getBoundingClientRect();
    return { x: event.clientX - rect.left - element.clientLeft - view.width / 2,
      y: event.clientY - rect.top - element.clientTop - view.height / 2 };
  };
  const geometry = () => {
    const [a, b] = [...pointers.values()];
    return b ? { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) } : { center: a, distance: 0 };
  };
  const rebase = () => { drag = pointers.size ? { ...geometry(), transform: { ...transform } } : null; emit(); };
  const zoom = (scale, anchor = { x: 0, y: 0 }) => apply(transformPhoto(transform, scale, anchor, anchor, view, image));
  const reset = () => { apply(origin()); rebase(); };
  const toggle = anchor => transform.scale > 1.01 ? reset() : zoom(3, anchor);
  const interactive = event => event.target !== element && event.target.closest?.('button, a, input, select');
  const prevent = event => { if (event.cancelable) event.preventDefault(); };
  const listen = (type, handler, options) => {
    element.addEventListener(type, handler, options); listeners.push([type, handler, options]);
  };
  const resize = () => {
    const previous = image;
    view = { width: Math.max(1, element.clientWidth), height: Math.max(1, element.clientHeight) };
    image = fittedPhoto(view, natural);
    apply({ ...transform, x: transform.x * image.width / previous.width, y: transform.y * image.height / previous.height });
    // A rotation/resize cancels the current gesture, avoiding stale finger anchors.
    const captured = [...pointers.keys()];
    pointers.clear(); drag = tap = lastTap = safari = null;
    for (const id of captured) if (element.hasPointerCapture?.(id)) element.releasePointerCapture(id);
  };
  listen('pointerdown', event => {
    if (interactive(event) || (event.pointerType === 'mouse' && event.button !== 0)) return;
    prevent(event); element.focus({ preventScroll: true });
    pointers.set(event.pointerId, point(event));
    try { element.setPointerCapture(event.pointerId); } catch { /* Pointer may have been cancelled. */ }
    tap = pointers.size === 1 && event.pointerType === 'touch' ? { point: point(event), time: performance.now(), id: event.pointerId } : null;
    if (pointers.size > 1) lastTap = null;
    safari = null; rebase();
  });
  listen('pointermove', event => {
    cursor = point(event);
    if (!pointers.has(event.pointerId)) return;
    prevent(event); pointers.set(event.pointerId, cursor);
    if (tap && Math.hypot(cursor.x - tap.point.x, cursor.y - tap.point.y) > 8) tap = null;
    const current = geometry();
    const scale = pointers.size > 1 && drag.distance > 0 ? drag.transform.scale * current.distance / drag.distance : drag.transform.scale;
    apply(transformPhoto(drag.transform, scale, drag.center, current.center, view, image));
  });
  const endPointer = event => {
    if (!pointers.has(event.pointerId)) return;
    const now = performance.now();
    if (event.type === 'pointerup' && tap?.id === event.pointerId && now - tap.time < 300) {
      if (lastTap && now - lastTap.time < 320 && Math.hypot(tap.point.x - lastTap.point.x, tap.point.y - lastTap.point.y) < 30) {
        toggle(tap.point); lastTap = null; lastTouchZoom = now;
      } else lastTap = { ...tap, time: now };
    } else lastTap = null;
    tap = null; pointers.delete(event.pointerId); rebase();
    if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId);
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(type, endPointer);
  listen('dblclick', event => { if (!interactive(event)) { prevent(event); if (performance.now() - lastTouchZoom > 500) toggle(point(event)); } });
  listen('wheel', event => {
    if (interactive(event) && !event.target.closest?.('.photo-face-box')) return;
    prevent(event);
    const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? view.height : 1;
    const sensitivity = event.ctrlKey || event.metaKey ? .01 : .002;
    if (!safari && !pointers.size && Number.isFinite(event.deltaY))
      zoom(transform.scale * Math.exp(-event.deltaY * factor * sensitivity), point(event));
  }, { passive: false });
  // Safari trackpads emit GestureEvent; iPad touch uses the pointer path above.
  listen('gesturestart', event => { prevent(event); if (!pointers.size) safari = { transform: { ...transform }, center: cursor }; }, { passive: false });
  listen('gesturechange', event => {
    prevent(event);
    if (safari && !pointers.size && Number.isFinite(event.scale)) apply(transformPhoto(safari.transform,
      safari.transform.scale * event.scale, safari.center, safari.center, view, image));
  }, { passive: false });
  listen('gestureend', event => { prevent(event); safari = null; }, { passive: false });
  listen('keydown', event => {
    if (event.target !== element || event.ctrlKey || event.metaKey || event.altKey) return;
    if (['+', '='].includes(event.key)) zoom(transform.scale * 1.5);
    else if (event.key === '-') zoom(transform.scale / 1.5);
    else if (['0', 'Home'].includes(event.key)) reset();
    else if (transform.scale > 1 && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      apply({ ...transform, x: transform.x + (event.key === 'ArrowLeft' ? 60 : event.key === 'ArrowRight' ? -60 : 0),
        y: transform.y + (event.key === 'ArrowUp' ? 60 : event.key === 'ArrowDown' ? -60 : 0) });
    } else return;
    prevent(event); event.stopPropagation();
  });
  const observer = new ResizeObserver(resize); observer.observe(element); resize();
  return {
    zoomBy: ratio => zoom(transform.scale * ratio), reset,
    setImageSize(width, height) {
      if (width > 0 && height > 0) {
        const changed = Math.abs(width / height - natural.width / natural.height) > .0001;
        natural = { width, height };
        // Swapping the thumbnail for its large preview must not interrupt a pinch.
        if (changed) resize();
      }
    },
    destroy() {
      destroyed = true; observer.disconnect();
      for (const [type, handler, options] of listeners) element.removeEventListener(type, handler, options);
      for (const id of pointers.keys()) if (element.hasPointerCapture?.(id)) element.releasePointerCapture(id);
      pointers.clear(); if (frame !== null) cancelAnimationFrame(frame);
    },
  };
}
