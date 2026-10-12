import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gameConsoleFrame} from '../src/gameConsoleFrames.js';

test('Game Boy artwork stays vector-only, self-contained, and aligned with its frame', () => {
  const svg=readFileSync(new URL('../src/assets/gameboy-vector.svg',import.meta.url),'utf8');
  assert.doesNotMatch(svg, /<(?:image|script|foreignObject)\b|\bon[a-z]+\s*=/i);
  const ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length);
  for (const match of svg.matchAll(/(?:href="#|url\(#)([^"\)]+)/g)) assert.ok(ids.includes(match[1]), `Missing SVG reference ${match[1]}`);
  for (const part of ['a','b','dpad','start','select']) assert.ok(svg.includes(`data-part="${part}"`));
  const viewBox=svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  assert.deepEqual(gameConsoleFrame('gb').crop,viewBox);
  assert.equal(gameConsoleFrame('gb').artwork,'vector');
});
