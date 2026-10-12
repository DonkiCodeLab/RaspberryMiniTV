import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameConsoleFrame, frameRectangle } from '../src/gameConsoleFrames.js';

test('each Game Boy uses its own screen and controls, with shoulders only on Advance', () => {
  for (const system of ['gb', 'gbc', 'gba']) {
    const frame = gameConsoleFrame(system);
    const inputs = frame.buttons.map(button => button.input).sort((a, b) => a - b);
    assert.deepEqual(inputs, system === 'gba' ? [0, 2, 3, 4, 5, 6, 7, 8, 10, 11] : [0, 2, 3, 4, 5, 6, 7, 8]);
    for (const rect of [frame.screen, ...frame.buttons.map(({x,y,w,h}) => [x,y,w,h])]) {
      const style = frameRectangle(frame, rect);
      const [left, top, width, height] = ['left', 'top', 'width', 'height'].map(key => parseFloat(style[key]));
      assert.ok(left >= 0 && top >= 0 && left + width <= 100 && top + height <= 100);
    }
    assert.equal(frame.aspect, system === 'gba' ? 3 / 2 : 10 / 9);
  }
  assert.equal(gameConsoleFrame('nes'), null);
  assert.equal(gameConsoleFrame('toString'), null);
});

test('Mega Drive pairs a 4:3 television with the supplied three-button vector controller', () => {
  const frame = gameConsoleFrame('megadrive');
  assert.equal(frame.layout, 'television');
  assert.equal(frame.aspect, 4 / 3);
  assert.equal(frame.artwork, 'vector');
  const buttons = Object.fromEntries(frame.buttons.map(({name,input}) => [name,input]));
  assert.deepEqual(buttons, {up:4,down:5,left:6,right:7,A:1,B:0,C:8,Start:3});
  assert.deepEqual(['KeyZ','KeyX','KeyC','KeyA','KeyS','KeyD'].map(key => frame.keys[key]), [1,0,8,10,9,11]);
  for (const button of frame.buttons) {
    assert.ok(button.x >= 0 && button.y >= 0 && button.x + button.w <= frame.image[0] && button.y + button.h <= frame.image[1]);
  }
});
