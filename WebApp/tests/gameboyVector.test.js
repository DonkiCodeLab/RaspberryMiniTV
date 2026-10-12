import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gameConsoleFrame} from '../src/gameConsoleFrames.js';

for (const [system,filename] of [['gb','gameboy-vector.svg'],['gbc','gameboy-color-vector.svg'],['gba','gameboy-advance-vector.svg']]) {
test(`${system} artwork stays vector-only, self-contained, and aligned with its frame`, () => {
  const svg=readFileSync(new URL(`../src/assets/${filename}`,import.meta.url),'utf8');
  assert.doesNotMatch(svg, /<(?:image|script|foreignObject)\b|\bon[a-z]+\s*=/i);
  const ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length);
  for (const match of svg.matchAll(/(?:href="#|url\(#)([^"\)]+)/g)) assert.ok(ids.includes(match[1]), `Missing SVG reference ${match[1]}`);
  for (const part of ['a','b','dpad','start','select']) assert.ok(svg.includes(`data-part="${part}"`));
  for (const part of ['l','r']) assert.equal(svg.includes(`data-part="${part}"`), system === 'gba');
  const viewBox=svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  assert.deepEqual(gameConsoleFrame(system).crop,viewBox);
  assert.equal(gameConsoleFrame(system).artwork,'vector');
});
}
