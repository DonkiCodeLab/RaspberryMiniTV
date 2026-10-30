import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: [new URL('../src/PhotoLocationMap.jsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', loader: { '.css': 'empty' },
  external: ['react', 'leaflet', './api/raspberryApi.js', './photoThumbnails.js', './photoMapZoom.js'] });

function fixture(t) {
  const slots = [], effects = [], maps = [], markers = [], tiles = [], controls = [], requests = [], observers = [];
  let cursor = 0, tree, detached = 0;
  const props = { photo: { id: 'vic', name: 'IMG_6376.HEIC', relativePath: 'Pictures/vic.heic', latitude: 41.9287, longitude: 2.2537 },
    s: { zoomIn: 'Ampliar', zoomOut: 'Reducir', resetCountryView: 'Volver al encuadre' }, language: 'es' };
  const changed = (old, deps) => !old || deps.some((value, i) => !Object.is(value, old.deps[i]));
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useRef(value) { const i = cursor++; return slots[i] ||= { current: value }; },
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], next => { slots[i] = next; }]; },
    useMemo(fn, deps) { const i = cursor++; if (changed(slots[i], deps)) slots[i] = { value: fn(), deps }; return slots[i].value; },
    useEffect(fn, deps) { const i = cursor++, old = effects[i];
      if (changed(old, deps)) effects[i] = { fn, deps, previous: old?.cleanup, pending: true };
    },
  };
  const element = () => ({ children: [], attributes: {}, append(child) { this.children.push(child); },
    setAttribute(key, value) { this.attributes[key] = value; } });
  const eventTarget = () => ({ listeners: new Map(), on(type, fn) { this.listeners.set(type, fn); return this; },
    fire(type, event) { this.listeners.get(type)?.(event); } });
  const leaflet = {
    map() {
      const view = { ...eventTarget(), layers: new Set(), frames: [], removed: false,
        invalidateSize() {}, getBoundsZoom: () => 5,
        setView(center, zoom) { this.center = Array.from(center); this.zoom = zoom; this.frames.push([this.center, zoom]); },
        hasLayer(layer) { return this.layers.has(layer); }, removeLayer(layer) { this.layers.delete(layer); },
        remove() { this.removed = true; this.layers.clear(); },
      };
      maps.push(view); return view;
    },
    tileLayer() { const layer = { ...eventTarget(), addTo() { return this; }, off() { this.listeners.clear(); } }; tiles.push(layer); return layer; },
    control: { zoom(options) { const control = { options, removed: false, addTo() { return this; }, remove() { this.removed = true; } }; controls.push(control); return control; } },
    latLngBounds: value => value, point: (x, y) => ({ x, y }), divIcon: options => options,
    marker(point, options) {
      const node = element();
      const marker = { ...eventTarget(), options, point: Array.from(point),
        dragging: { enabled: false, enable() { this.enabled = true; }, disable() { this.enabled = false; } },
        setLatLng(value) { this.point = Array.from(value); }, getLatLng() { return latLng(...this.point); },
        addTo(view) { view.layers.add(this); return this; }, getElement: () => node,
        bindTooltip(label) { this.label = label; }, setTooltipContent(label) { this.label = label; },
      };
      markers.push(marker); return marker;
    },
  };
  const modules = { react, leaflet, 'leaflet/dist/leaflet.css': {},
    './api/raspberryApi.js': { getPictureContentUrl: path => path },
    './photoThumbnails.js': { PHOTO_PLACEHOLDER: 'placeholder', requestThumbnail(url, signal) {
      return new Promise(resolve => requests.push({ url, signal, resolve }));
    } },
    './photoMapZoom.js': { attachPhotoMapZoom: () => () => detached++ },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports, AbortController,
    require(name) { assert.ok(name in modules, name); return modules[name]; },
    document: { createElement: element },
    ResizeObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
  });
  const visit = (node, fn) => {
    if (Array.isArray(node)) { node.forEach(child => visit(child, fn)); return; }
    if (!node || typeof node !== 'object') return;
    fn(node); visit(node.props?.children, fn);
  };
  function render(patch = {}) {
    Object.assign(props, patch); cursor = 0; tree = module.exports.default(props);
    visit(tree, node => { if (node.props?.ref) node.props.ref.current ||= element(); });
    for (const effect of effects) if (effect?.pending) effect.previous?.();
    for (const effect of effects) if (effect?.pending) { effect.cleanup = effect.fn(); effect.pending = false; }
  }
  const unmount = () => { for (const effect of effects) { effect?.cleanup?.(); if (effect) effect.cleanup = null; } };
  t.after(unmount); render();
  return { props, maps, markers, tiles, controls, requests, observers, render, unmount,
    get detached() { return detached; }, get image() { return markers.at(-1).options.icon.html.children[0]; },
    reset() { visit(tree, node => { if (node.type === 'button') node.props.onClick(); }); },
  };
}
const latLng = (lat, lng) => ({ wrap: () => ({ lat, lng }) });

test('review refreshes preserve the map, tiles, thumbnail, zoom and panned center', t => {
  const f = fixture(t), view = f.maps[0], marker = f.markers[0];
  view.setView([42, 3], 12);
  for (let tick = 0; tick < 10; tick++) f.render({ photo: { ...f.props.photo }, s: { ...f.props.s }, placeLabel: `Vic ${tick}` });
  assert.equal(f.maps.length, 1); assert.equal(f.tiles.length, 1); assert.equal(f.markers.length, 1);
  assert.equal(f.controls.length, 1); assert.equal(f.requests.length, 1);
  assert.deepEqual(view.center, [42, 3]); assert.equal(view.zoom, 12); assert.equal(view.frames.length, 2);
  assert.equal(view.hasLayer(marker), true); assert.equal(view.removed, false);
  f.observers[0].fn(); assert.equal(view.frames.length, 2);
  f.reset(); assert.deepEqual(view.center, [41.9287, 2.2537]); assert.equal(view.zoom, 5);
});

test('translations, titles and late previews update without resetting the viewport', async t => {
  const f = fixture(t), view = f.maps[0];
  view.setView([42, 3], 12);
  f.render({ s: { ...f.props.s, zoomIn: 'Zoom in', zoomOut: 'Zoom out' }, language: 'en',
    photo: { ...f.props.photo, title: 'Lunch in Vic' }, previewUrl: 'preview' });
  assert.equal(f.maps.length, 1); assert.equal(view.frames.length, 2);
  assert.equal(f.controls[0].removed, true); assert.equal(f.controls.at(-1).options.zoomInTitle, 'Zoom in');
  assert.equal(f.markers[0].label.textContent, 'Lunch in Vic');
  assert.equal(f.markers[0].getElement().attributes.title, 'Lunch in Vic');
  assert.equal(f.requests[0].signal.aborted, true);
  f.requests[0].resolve('stale-thumbnail'); await new Promise(setImmediate);
  assert.equal(f.image.src, 'preview');
  f.render({ previewUrl: '' }); f.requests.at(-1).resolve('fresh-thumbnail'); await new Promise(setImmediate);
  assert.equal(f.image.src, 'fresh-thumbnail'); assert.equal(view.frames.length, 2);
});

test('editing moves the marker and uses current callbacks without reframing', t => {
  const f = fixture(t), view = f.maps[0], marker = f.markers[0], chosen = [];
  view.setView([42, 3], 12);
  const click = () => view.fire('click', { latlng: latLng(43, 4) });
  f.render({ onPositionChange: point => chosen.push(['old', point.latitude]) }); click(); assert.equal(chosen.length, 0);
  f.render({ editing: true, onPositionChange: point => chosen.push(['current', point.latitude]) }); click();
  f.render({ position: { latitude: 43, longitude: 4 } }); marker.fire('dragend');
  assert.deepEqual(chosen, [['current', 43], ['current', 43]]);
  assert.deepEqual(marker.point, [43, 4]); assert.equal(marker.dragging.enabled, true);
  f.render({ position: null }); assert.equal(view.hasLayer(marker), false);
  f.render({ position: f.props.photo, editing: false }); click();
  assert.equal(view.hasLayer(marker), true); assert.equal(marker.dragging.enabled, false);
  assert.equal(chosen.length, 2); assert.equal(view.frames.length, 2); assert.equal(f.maps.length, 1);
});

test('saved locations and different photos reframe, and closing releases map resources', t => {
  const f = fixture(t), view = f.maps[0];
  f.render({ photo: { ...f.props.photo, latitude: 48.8566, longitude: 2.3522 } });
  assert.deepEqual(view.center, [48.8566, 2.3522]); assert.equal(view.frames.length, 2);
  f.render({ photo: { ...f.props.photo, id: 'paris', relativePath: 'Pictures/paris.heic' } });
  assert.equal(view.frames.length, 3); assert.equal(f.maps.length, 1);
  assert.equal(f.requests[0].signal.aborted, true);
  f.unmount();
  assert.equal(view.removed, true); assert.equal(f.observers[0].disconnected, true); assert.equal(f.detached, 1);
  assert.equal(f.tiles[0].listeners.size, 0); assert.equal(f.controls.at(-1).removed, true);
  assert.equal(f.requests.at(-1).signal.aborted, true);
});
