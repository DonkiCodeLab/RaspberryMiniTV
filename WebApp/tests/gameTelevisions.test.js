import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME_TELEVISIONS, DEFAULT_TELEVISION, gameTelevision, readGameTelevision, saveGameTelevision, televisionVariables } from '../src/gameTelevisions.js';
import { gameConsoleFrame, frameRectangle } from '../src/gameConsoleFrames.js';

test('the shell dropdown offers the four local televisions and a bare 4:3 screen', () => {
  assert.deepEqual(GAME_TELEVISIONS.map(tv => tv.id), ['simpsons', 'gray', 'cream', 'green', 'none']);
  for (const tv of GAME_TELEVISIONS) {
    if (tv.image) {
      const image = readFileSync(new URL(`../public/game-televisions/${tv.image}`, import.meta.url));
      if (tv.image.endsWith('.svg')) {
        const svg = image.toString('utf8');
        assert.doesNotMatch(svg, /<(?:script|foreignObject)\b|\bon[a-z]+\s*=/i);
        assert.deepEqual(svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number), tv.crop);
      } else {
        assert.equal(image.toString('ascii', 1, 4), 'PNG');
        assert.deepEqual([image.readUInt32BE(16), image.readUInt32BE(20)], tv.crop.slice(2));
      }
    }
    const style = frameRectangle(tv, tv.screen);
    assert.ok(parseFloat(style.left) >= 0 && parseFloat(style.top) >= 0);
    assert.ok(parseFloat(style.left) + parseFloat(style.width) <= 100);
    assert.ok(parseFloat(style.top) + parseFloat(style.height) <= 100);
    const variables = televisionVariables(tv);
    const [x, y, w, h] = ['left', 'top', 'width', 'height'].map(key => parseFloat(variables[`--picture-${key}`]));
    assert.ok(x <= 0 && y <= 0 && w >= 100 && h >= 100);
    assert.ok(Math.abs(x * 2 + w - 100) < .001 && Math.abs(y * 2 + h - 100) < .001);
    assert.ok(Math.abs((w * tv.screen[2]) / (h * tv.screen[3]) - 4 / 3) < .002);
  }
  assert.equal(gameTelevision('none').image, null);
  assert.deepEqual(frameRectangle(gameTelevision('none'), gameTelevision('none').screen), { left: '0%', top: '0%', width: '100%', height: '100%' });
  assert.equal(televisionVariables(gameTelevision('none'))['--tv-ratio'], 4 / 3);
});

test('television selection persists and safely recovers from obsolete IDs or unavailable storage', () => {
  let saved;
  const previous = globalThis.window;
  try {
    globalThis.window = { localStorage: { getItem: () => saved, setItem: (_, value) => { saved = value; } } };
    assert.equal(readGameTelevision(), DEFAULT_TELEVISION);
    for (const id of ['cream', 'none', 'gray']) {
      saveGameTelevision(id);
      assert.equal(readGameTelevision(), id);
    }
    saved = 'deleted-model';
    assert.equal(readGameTelevision(), DEFAULT_TELEVISION);
    assert.equal(gameTelevision('__proto__').id, DEFAULT_TELEVISION);
    globalThis.window = { get localStorage() { throw Error('Storage unavailable'); } };
    assert.equal(readGameTelevision(), DEFAULT_TELEVISION);
    assert.doesNotThrow(() => saveGameTelevision('none'));
  } finally {
    if (previous === undefined) delete globalThis.window; else globalThis.window = previous;
  }
});

test('Mega Drive keeps its vector layers, standalone SEGA logo and hit targets inside the crop', () => {
  const svg = readFileSync(new URL('../src/assets/megadrive-controller.svg', import.meta.url), 'utf8');
  assert.doesNotMatch(svg, /<(?:image|script|foreignObject)\b|\bon[a-z]+\s*=/i);
  for (const part of ['a', 'b', 'c', 'start', 'dpad', 'logo']) assert.ok(svg.includes(`data-part="${part}"`));
  const frame = gameConsoleFrame('megadrive');
  assert.deepEqual(svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number), frame.crop);
  for (const { x, y, w, h } of frame.buttons) {
    const rect = frameRectangle(frame, [x, y, w, h]);
    assert.ok(parseFloat(rect.left) >= 0 && parseFloat(rect.top) >= 0);
    assert.ok(parseFloat(rect.left) + parseFloat(rect.width) <= 100);
    assert.ok(parseFloat(rect.top) + parseFloat(rect.height) <= 100);
  }
});
