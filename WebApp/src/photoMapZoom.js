// Desktop trackpads use Ctrl+wheel in Chromium/Firefox and GestureEvent in Safari.
// Leave ordinary scrolling and Leaflet's touchscreen pinch handling alone.
export function attachPhotoMapZoom(map, { nativeWheel = false } = {}) {
  const element = map.getContainer(), listeners = [];
  let frame = null, pending = null, safari = null, touching = false;
  let cursor = map.getSize().divideBy(2);
  const listen = (type, handler, options) => {
    element.addEventListener(type, handler, options);
    listeners.push([type, handler, options]);
  };
  const prevent = event => {
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
  };
  const currentZoom = () => pending?.zoom ?? map.getZoom();
  const zoomAround = (zoom, point) => {
    if (!Number.isFinite(zoom)) return;
    pending = { zoom: Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), zoom)), point };
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      const next = pending; pending = null;
      if (next.zoom !== map.getZoom()) map.setZoomAround(next.point, next.zoom, { animate: false });
    });
  };
  listen('mousemove', event => { cursor = map.mouseEventToContainerPoint(event); });
  listen('wheel', event => {
    if (nativeWheel && !safari) return;
    if (!event.ctrlKey || touching) return;
    prevent(event);
    if (safari) return;
    const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? map.getSize().y : 1;
    // One map zoom level doubles its scale; match the photo viewer's pinch speed.
    zoomAround(currentZoom() - event.deltaY * factor / (100 * Math.LN2), map.mouseEventToContainerPoint(event));
  }, { passive: false, capture: true });
  listen('gesturestart', event => {
    if (touching) return;
    prevent(event);
    safari = { zoom: currentZoom(), point: cursor };
  }, { passive: false });
  listen('gesturechange', event => {
    if (!safari || touching) return;
    prevent(event);
    if (Number.isFinite(event.scale) && event.scale > 0) zoomAround(safari.zoom + Math.log2(event.scale), safari.point);
  }, { passive: false });
  listen('gestureend', event => {
    if (!safari) return;
    prevent(event); safari = null;
  }, { passive: false });
  // iOS also emits GestureEvent during a touchscreen pinch, already owned by Leaflet.
  const trackTouches = event => {
    touching = event.touches.length > 0;
    if (touching) {
      safari = pending = null;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    }
  };
  for (const type of ['touchstart', 'touchend', 'touchcancel']) listen(type, trackTouches, { passive: true });
  return () => {
    for (const [type, handler, options] of listeners) element.removeEventListener(type, handler, options);
    if (frame !== null) cancelAnimationFrame(frame);
  };
}

// MapLibre handles wheel and touchscreen pinch itself; retain Safari's desktop
// GestureEvent support so pinch zoom never scales the whole application page.
export function attachMapLibrePhotoZoom(map) {
  const size = () => ({ x: map.getContainer().clientWidth, y: map.getContainer().clientHeight,
    divideBy(value) { return { x: this.x / value, y: this.y / value }; } });
  return attachPhotoMapZoom({
    getContainer: () => map.getContainer(), getSize: size,
    getZoom: () => map.getZoom(), getMinZoom: () => map.getMinZoom(), getMaxZoom: () => map.getMaxZoom(),
    mouseEventToContainerPoint: event => {
      const bounds = map.getContainer().getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    },
    setZoomAround: (point, zoom) => map.easeTo({ zoom, around: map.unproject([point.x, point.y]), duration: 0 }),
  }, { nativeWheel: true });
}
