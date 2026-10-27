import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { preloadReviewImages } from '../src/photoReviewImages.js';
import { upcomingReviewPhotos } from '../src/photoReviewWizard.js';
import { photoStrings } from '../src/photoStrings.js';

test('preloading requests only two distinct images, sequentially at low priority, and stops on close', () => {
  const images = [];
  const create = () => { const image = { removeAttribute: name => { delete image[name]; } }; images.push(image); return image; };
  const stop = preloadReviewImages(['', 'one', 'one', 'two', 'three'], create);
  assert.equal(images.length, 1);
  assert.equal(images[0].src, 'one'); assert.equal(images[0].fetchPriority, 'low');
  images[0].onload();
  assert.equal(images.length, 2); assert.equal(images[1].src, 'two');
  images[1].onload(); assert.equal(images.length, 2);
  stop(); assert.ok(images.every(image => !image.src && !image.onload && !image.onerror));
  const cancel = preloadReviewImages(['four', 'five'], create), pending = images.at(-1).onload;
  cancel(); pending(); assert.equal(images.length, 3);
});

test('a failed speculative load does not block the next image or open an error in the current card', () => {
  const images = [];
  const stop = preloadReviewImages(['bad', 'good'], () => {
    const image = { removeAttribute() {} }; images.push(image); return image;
  });
  images[0].onerror(); assert.equal(images[1].src, 'good'); stop();
});

test('lookahead skips repeated faces, reviewed and deleted photos while respecting the review queue', () => {
  const photos = ['one', 'two', 'three', 'four', 'five'].map(id => ({ id, relativePath: `${id}.jpg` }));
  const queue = ['one', 'one', 'missing', 'two', 'three', 'four', 'four', 'five'].map((photoId, i) => ({ id: `r${i}`, photoId }));
  const drafts = { two: { reviewIds: ['r3'], changes: [] }, three: { delete: true } };
  assert.deepEqual(upcomingReviewPhotos(queue, 0, photos, drafts).map(photo => photo.id), ['four', 'five']);
  assert.deepEqual(upcomingReviewPhotos(queue, queue.length - 1, photos, drafts), []);
  const groups = [{ id: 'current', photoIds: ['one', 'two'] }, { id: 'next', photoIds: ['one', 'three', 'four', 'five'] }];
  assert.deepEqual(upcomingReviewPhotos(groups, 0, photos, drafts).map(photo => photo.id), ['four', 'five']);
});

async function load(file) {
  const result = await build({ entryPoints: [new URL(file, import.meta.url).pathname], bundle: true, write: false,
    format: 'cjs', platform: 'node', external: ['react', 'react-dom'], loader: { '.css': 'empty', '.png': 'dataurl' },
    define: { 'import.meta.env': '{}' } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  return module.exports;
}
const { ReviewCard } = await load('../src/PhotoReviewWizard.jsx');
const { default: PhotoViewerImage } = await load('../src/PhotoViewerImage.jsx');
const photo = { id: 'one', name: 'One', relativePath: 'one.jpg' }, s = photoStrings('es');

test('all review modes request just the thumbnail and the face editor accepts it as its full image', t => {
  const previous = globalThis.window;
  globalThis.window = { location: { hostname: 'raspberry', origin: 'http://raspberry' }, sessionStorage: { getItem: () => null } };
  t.after(() => { globalThis.window = previous; });
  for (const mode of ['faces', 'no-faces', 'new-person']) {
    const html = renderToStaticMarkup(React.createElement(ReviewCard, {
      photo, s, people: [], position: 1, total: 2,
      review: { id: 'r1', ...(mode === 'no-faces' ? {} : { faceId: 'f1' }) },
      groupPerson: mode === 'new-person' ? { id: 'new' } : undefined,
    }));
    assert.match(html, /render=thumb/); assert.doesNotMatch(html, /render=preview/);
    assert.equal((html.match(/<img /g) || []).length, 1);
  }
  const compact = renderToStaticMarkup(React.createElement(PhotoViewerImage, { photo, s, quality: 'thumb' }));
  assert.match(compact, /photo-viewer__full[^>]+render=thumb/);
  assert.doesNotMatch(compact, /photo-viewer__placeholder|render=preview/);
  const normal = renderToStaticMarkup(React.createElement(PhotoViewerImage, { photo, s }));
  assert.match(normal, /photo-viewer__full[^>]+render=preview/);
  const original = renderToStaticMarkup(React.createElement(PhotoViewerImage, { photo, s, quality: 'original' }));
  assert.match(original, /photo-viewer__full[^>]+src="[^"]+relativePath=one.jpg"/);
});
