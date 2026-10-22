const clamp = value => Math.max(0, Math.min(1, value));

export function faceBoxBetween(start, end) {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
}

// The overlay is fitted to the image and shares its zoom transform. Fractions
// remain relative to the oriented image, including after zooming or panning.
export function attachFaceDrawing(element, onPreview, onComplete) {
  let drag = null;
  const point = event => {
    const rect = element.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) };
  };
  const stop = event => { event.stopPropagation(); if (event.cancelable) event.preventDefault(); };
  const down = event => {
    stop(event);
    if (drag || event.button !== 0) return;
    drag = { id: event.pointerId, start: point(event) };
    element.setPointerCapture(event.pointerId);
    onComplete(null); onPreview(null);
  };
  const move = event => {
    stop(event);
    if (drag?.id === event.pointerId) onPreview(faceBoxBetween(drag.start, point(event)));
  };
  const end = event => {
    stop(event);
    if (drag?.id !== event.pointerId) return;
    const box = faceBoxBetween(drag.start, point(event)), rect = element.getBoundingClientRect();
    const valid = event.type === 'pointerup' && box.width * rect.width >= 4 && box.height * rect.height >= 4;
    drag = null;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    onPreview(valid ? box : null); onComplete(valid ? box : null);
  };
  const listeners = { pointerdown: down, pointermove: move, pointerup: end, pointercancel: end,
    lostpointercapture: end, wheel: stop, dblclick: stop };
  for (const [type, handler] of Object.entries(listeners)) element.addEventListener(type, handler, { passive: false });
  return () => {
    for (const [type, handler] of Object.entries(listeners)) element.removeEventListener(type, handler);
    if (drag && element.hasPointerCapture(drag.id)) element.releasePointerCapture(drag.id);
    drag = null;
  };
}
