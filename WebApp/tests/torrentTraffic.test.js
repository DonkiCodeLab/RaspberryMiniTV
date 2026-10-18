import test from 'node:test';
import assert from 'node:assert/strict';
import { trafficSize, trafficPaths, trafficTime } from '../src/torrentTraffic.js';

test('long range labels show dates and distinguish years, with full times in details', () => {
  const date = new Date(2026, 9, 18, 14, 38);
  const previousYear = new Date(2025, 9, 18, 14, 38);
  for (const language of ['es', 'ca', 'en']) {
    assert.equal(trafficTime(date / 1000, language, '30d'), date.toLocaleString(language, { day: '2-digit', month: 'short' }));
    assert.equal(trafficTime(date / 1000, language, '365d'), date.toLocaleString(language, { month: 'short', year: 'numeric' }));
    assert.notEqual(trafficTime(date / 1000, language, '365d'), trafficTime(previousYear / 1000, language, '365d'));
    assert.equal(trafficTime(date / 1000, language, '365d', true), date.toLocaleString(language, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
    assert.equal(trafficTime(date / 1000, language, '3h'), date.toLocaleString(language, { hour: '2-digit', minute: '2-digit' }));
  }
});

test('traffic units distinguish missing readings, zero, speeds and total bytes', () => {
  assert.equal(trafficSize(null), '—');
  assert.equal(trafficSize(0, 'en', true), '0 B/s');
  assert.equal(trafficSize(1500000, 'en', true), '1.5 MB/s');
  assert.equal(trafficSize(2500000000, 'es'), '2,5 GB');
});

test('chart breaks paths across missing readings and keeps measured zeroes', () => {
  const points = [{ t: 0, speed: 3 }, { t: 1, speed: 0 }, { t: 2, speed: null }, { t: 3, speed: 4 }];
  const paths = trafficPaths(points, 'speed', p => p.t, value => 10 - value, 10);
  assert.equal(paths.length, 2);
  assert.equal(paths[0].line, 'M0,7 L1,10');
  assert.equal(paths[1].line, 'M3,6');
  assert.deepEqual(paths[1].single, [3, 6]);
  assert.equal(paths[1].area, 'M3,10 L3,6 L3,10 Z');
  assert.deepEqual(trafficPaths([{ speed: null }], 'speed', p => p.t, v => v, 0), []);
});
