import test from 'node:test';
import assert from 'node:assert/strict';
import { facePortraitLayout } from '../src/photoFacePortrait.js';

function cropPixels(box, width, height) {
  const { frame, image } = facePortraitLayout(box, width, height);
  const cropWidth = width * 100 / parseFloat(image.width);
  const cropHeight = height * 100 / parseFloat(image.height);
  return { width: cropWidth, height: cropHeight,
    x: -parseFloat(image.left) * cropWidth / 100,
    y: -parseFloat(image.top) * cropHeight / 100, frame };
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('portrait framing doubles the face extent and centers it without stretching', () => {
  const box = { x: .4, y: .4, width: .1, height: .15 };
  for (const [width, height] of [[1200, 800], [800, 1200]]) {
    const crop = cropPixels(box, width, height);
    close(crop.width, 2 * Math.max(width * box.width, height * box.height));
    close(crop.height, crop.width);
    close(crop.x + crop.width / 2, width * (box.x + box.width / 2));
    close(crop.y + crop.height / 2, height * (box.y + box.height / 2));
    assert.deepEqual(crop.frame, { width: '100%', height: '100%' });
  }
});

test('edge portraits shift inside the photo, preserving the entire face and avoiding blank borders', () => {
  for (const [width, height] of [[1200, 800], [800, 1200]]) {
    for (const box of [
      { x: 0, y: 0, width: .1, height: .15 },
      { x: .9, y: .85, width: .1, height: .15 },
      { x: .6, y: .5, width: .4, height: .5 },
      { x: 0, y: 0, width: 1, height: 1 },
    ]) {
      const crop = cropPixels(box, width, height);
      assert.ok(crop.x >= -1e-8 && crop.y >= -1e-8);
      assert.ok(crop.x + crop.width <= width + 1e-8 && crop.y + crop.height <= height + 1e-8);
      assert.ok(crop.x <= box.x * width + 1e-8 && crop.y <= box.y * height + 1e-8);
      assert.ok(crop.x + crop.width >= (box.x + box.width) * width - 1e-8);
      assert.ok(crop.y + crop.height >= (box.y + box.height) * height - 1e-8);
      close(parseFloat(crop.frame.width) / parseFloat(crop.frame.height), crop.width / crop.height);
    }
  }
});

test('missing, corrupt or out-of-bounds rectangles cannot display an unrelated photo area', () => {
  for (const box of [null, {}, { x: 0, y: 0, width: 0, height: 1 }, { x: -.1, y: 0, width: .2, height: .2 },
    { x: .8, y: 0, width: .3, height: .2 }, { x: 0, y: NaN, width: .2, height: .2 }]) {
    assert.equal(facePortraitLayout(box, 1200, 800), null);
  }
  assert.equal(facePortraitLayout({ x: 0, y: 0, width: 1, height: 1 }, 0, 800), null);
});
