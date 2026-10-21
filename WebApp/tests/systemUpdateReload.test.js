import test from 'node:test';
import assert from 'node:assert/strict';
import { createSystemUpdateReload } from '../src/systemUpdateReload.js';

test('opening the dashboard with an old completed update never reloads the page', () => {
  const observe = createSystemUpdateReload(() => assert.fail('Unexpected reload'));
  observe('succeeded');
  observe('succeeded');
});

test('a running update reloads once after success, including across reconnection', () => {
  let reloads = 0;
  const observe = createSystemUpdateReload(() => reloads++);
  observe('running');
  observe(undefined);
  assert.equal(reloads, 0);
  observe('running');
  observe('succeeded');
  observe('succeeded');
  assert.equal(reloads, 1);
});

test('a failed update leaves errors visible and a successful retry reloads', () => {
  let reloads = 0;
  const observe = createSystemUpdateReload(() => reloads++);
  observe('running');
  observe('failed');
  observe('succeeded');
  assert.equal(reloads, 0);
  observe('running');
  observe('succeeded');
  assert.equal(reloads, 1);
});
