import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { moviePosterGeometry } from '../src/moviePosterGeometry.js';
const compiled = await build({ entryPoints: [new URL('../src/MoviePosterPreview.jsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react', 'react-dom'], loader: { '.css': 'empty' },
  plugins: [{ name: 'preview-fixtures', setup(build) {
    build.onResolve({ filter: /YouTubePreview\.jsx$/ }, () => ({ path: 'youtube', namespace: 'fixture' }));
    build.onResolve({ filter: /api\/raspberryApi$/ }, () => ({ path: 'api', namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'youtube'
      ? 'export function loadYouTubeApi(){return Promise.resolve();} export default function YouTubePreview(){}'
      : 'export function findMovieTrailer(){return Promise.resolve({video:null});}' }));
  } }] });
function harness() {
  const values = [], effects = [], refs = [], timers = new Map();
  let cursor = 0, tree, timerId = 0, clock = 0;
  const props = { movie: { id: 1, name: 'Film', preferredVideo: { id: 'abcdefghijk' } }, enabled: true, view: 'list', onClick() {}, children: 'Poster', label: 'Open' };
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) { const i = cursor++; if (!(i in values)) values[i] = initial; return [values[i], value => { values[i] = typeof value === 'function' ? value(values[i]) : value; }]; },
    useRef() { const i = cursor++; return refs[i] ||= { current: null }; },
    useEffect(effect, deps) { const i = cursor++; const old = effects[i];
      if (!old || deps.some((d, n) => d !== old.deps[n])) effects[i] = { deps, effect, previous: old?.cleanup, pending: true };
    } };
  const window = { innerWidth: 1280, innerHeight: 800,
    setTimeout(callback, delay) { timers.set(++timerId, { callback, at: clock + delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); }, addEventListener() {}, removeEventListener() {} };
  const document = { body: {}, documentElement: {}, addEventListener() {}, removeEventListener() {} };
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports,
    require: name => name === 'react' ? react : { createPortal: element => element }, window, document,
    getComputedStyle: () => ({ fontSize: '16px' }) });
  function render() {
    cursor = 0; tree = module.exports.default(props);
    tree.props.ref.current = { getBoundingClientRect: () => ({ left: 100, top: 100, height: 67.2 }),
      closest: () => ({ clientWidth: 1100 }), contains: () => false };
    for (const item of effects) if (item?.pending) { item.previous?.(); item.cleanup = item.effect(); item.pending = false; }
    return tree;
  }
  render();
  return { render, enter() { tree.props.onPointerEnter({ pointerType: 'mouse' }); render(); },
    leave() { tree.props.onPointerLeave({ relatedTarget: null }); render(); },
    advance(ms) { clock += ms; for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.callback(); } render(); },
    hasVideo() { const visit = node => Array.isArray(node) ? node.some(visit) : node && (node.type?.name === 'YouTubePreview' || visit(node.props?.children)); return Boolean(visit(tree)); },
    hasExpanded() { const visit = node => Array.isArray(node) ? node.some(visit) : node && (node.props?.className === 'movie-poster-preview__expanded' || visit(node.props?.children)); return Boolean(visit(tree)); } };
}
test('list posters enlarge immediately but wait two seconds before mounting the video', () => {
  const h = harness(); h.enter(); assert.equal(h.hasExpanded(), true); assert.equal(h.hasVideo(), false);
  h.advance(1999); assert.equal(h.hasVideo(), false);
  h.advance(1); assert.equal(h.hasVideo(), true);
  h.leave(); assert.equal(h.hasExpanded(), false); assert.equal(h.hasVideo(), false);
});
test('leaving before the delay cancels the preview and prevents late playback', () => {
  const h = harness(); h.enter(); h.advance(1000); h.leave(); h.advance(2000);
  assert.equal(h.hasExpanded(), false); assert.equal(h.hasVideo(), false);
});
test('expanded poster matches the enlarged grid poster and stays inside viewport edges', () => {
  const box = moviePosterGeometry({ left: 100, top: 300, height: 67.2 }, 1100, 1280, 900);
  assert.equal(box.width, ((1100 - 4 * 20) / 5 - 2) * 1.344);
  assert.equal(box.height, box.width * 1.5);
  const edge = moviePosterGeometry({ left: 1200, top: 790, height: 67.2 }, 1100, 1280, 800);
  assert.ok(edge.left + edge.width <= 1268); assert.ok(edge.top + edge.height <= 788);
  const small = moviePosterGeometry({ left: 5, top: 5, height: 59 }, 330, 390, 400);
  assert.ok(small.top >= 12); assert.ok(small.left >= 12); assert.ok(small.height <= 376);
});
