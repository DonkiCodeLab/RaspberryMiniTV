import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME_TELEVISIONS, DEFAULT_TELEVISION, gameTelevision, readGameTelevision, saveGameTelevision } from '../src/gameTelevisions.js';
import { gameConsoleFrame, frameRectangle } from '../src/gameConsoleFrames.js';

test('all 25 televisions have local artwork, matching glass masks and a contained 4:3 picture', () => {
  assert.equal(GAME_TELEVISIONS.length, 25);
  assert.equal(new Set(GAME_TELEVISIONS.map(tv => tv.id)).size, 25);
  for (const tv of GAME_TELEVISIONS) {
    for (const suffix of ['', '-screen']) {
      const svg = readFileSync(new URL(`../public/game-televisions/${tv.id}${suffix}.svg`, import.meta.url), 'utf8');
      assert.doesNotMatch(svg, /<(?:script|image|foreignObject)\b|\bon[a-z]+\s*=/i);
      assert.deepEqual(svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number), suffix ? tv.screen : tv.crop);
    }
    const style = frameRectangle(tv, tv.screen);
    assert.ok(parseFloat(style.left) >= 0 && parseFloat(style.top) >= 0);
    assert.ok(parseFloat(style.left) + parseFloat(style.width) <= 100);
    assert.ok(parseFloat(style.top) + parseFloat(style.height) <= 100);
    const [x, y, w, h] = tv.picture;
    assert.ok(x >= 0 && y >= 0 && x + w <= 100 && y + h <= 100);
    assert.ok(Math.abs((w * tv.screen[2]) / (h * tv.screen[3]) - 4 / 3) < .002);
  }
});

test('television selection persists and safely recovers from obsolete IDs or unavailable storage', () => {
  let saved;
  const previous = globalThis.window;
  try {
    globalThis.window = { localStorage: { getItem: () => saved, setItem: (_, value) => { saved = value; } } };
    assert.equal(readGameTelevision(), DEFAULT_TELEVISION);
    saveGameTelevision('tv-17');
    assert.equal(readGameTelevision(), 'tv-17');
    saved = 'deleted-model';
    assert.equal(readGameTelevision(), DEFAULT_TELEVISION);
    assert.equal(gameTelevision('__proto__').id, DEFAULT_TELEVISION);
    globalThis.window = { get localStorage() { throw Error('Storage unavailable'); } };
    assert.equal(readGameTelevision(), DEFAULT_TELEVISION);
    assert.doesNotThrow(() => saveGameTelevision('tv-01'));
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
