import test from 'node:test';
import assert from 'node:assert/strict';
import { facePortraitLayout } from '../src/photoFacePortrait.js';

test('the crop contains only the chosen face and keeps its proportions in landscape and portrait photos', () => {
  for (const [width, height] of [[1200, 800], [800, 1200]]) {
    for (const box of [{ x: .05, y: .2, width: .2, height: .3 }, { x: .6, y: .5, width: .4, height: .5 }]) {
      const layout = facePortraitLayout(box, width, height);
      const cropWidth = parseFloat(layout.frame.width), cropHeight = parseFloat(layout.frame.height);
      const imageWidth = cropWidth * parseFloat(layout.image.width) / 100;
      const imageHeight = cropHeight * parseFloat(layout.image.height) / 100;
      const left = cropWidth * parseFloat(layout.image.left) / 100;
      const top = cropHeight * parseFloat(layout.image.top) / 100;
      const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
      close(imageWidth / width, imageHeight / height); // No stretching.
      close(left + box.x * imageWidth, 0);
      close(top + box.y * imageHeight, 0);
      close(left + (box.x + box.width) * imageWidth, cropWidth);
      close(top + (box.y + box.height) * imageHeight, cropHeight);
      assert.equal(Math.max(cropWidth, cropHeight), 100);
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
