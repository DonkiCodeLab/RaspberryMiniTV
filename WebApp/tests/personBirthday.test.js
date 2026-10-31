import test from 'node:test';
import assert from 'node:assert/strict';
import { currentAge, validBirthday, daysInMonth } from '../src/personBirthday.js';

const today = new Date(2026, 9, 23, 12);
test('age counts completed years before, on and after the birthday', () => {
  assert.equal(currentAge('1950-10-24', today), 75);
  assert.equal(currentAge('1950-10-23', today), 76);
  assert.equal(currentAge('1950-10-22', today), 76);
  assert.equal(currentAge('2026-10-23', today), 0);
  assert.equal(currentAge('1850-01-01', today), 176);
  assert.equal(currentAge('0001-01-01', today), 2025);
});
test('date validation rejects impossible, incomplete and future dates', () => {
  for (const value of ['', null, '1950-2-03', '1900-02-29', '2025-02-29', '2026-04-31', '2026-10-24', '0000-01-01', '2020-00-01']) {
    assert.equal(validBirthday(value, today), false, String(value));
    assert.equal(currentAge(value, today), null);
  }
  assert.equal(validBirthday('2000-02-29', today), true);
  assert.equal(daysInMonth(1900, 2), 28);
  assert.equal(daysInMonth(2000, 2), 29);
});
test('leap day age changes on March 1 in a common year', () => {
  assert.equal(currentAge('2000-02-29', new Date(2025, 1, 28)), 24);
  assert.equal(currentAge('2000-02-29', new Date(2025, 2, 1)), 25);
});

import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { photoStrings } from '../src/photoStrings.js';

const bundle = await build({ entryPoints: [new URL('../src/PhotoPeople.jsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'] });
const loaded = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), loaded, loaded.exports);
const { PersonEditor, PersonPhotoSortControl } = loaded.exports;

test('person photo navigation offers year and age only when a valid birthday is available', () => {
  for (const language of ['es', 'en', 'ca']) {
    const s = photoStrings(language);
    for (const birthDate of ['1990-05-10', '', undefined, '2020-02-30']) {
      const html = renderToStaticMarkup(React.createElement(PersonPhotoSortControl, { person: { birthDate }, value: 'year', s }));
      assert.ok(html.includes(s.personPhotoYear));
      assert.equal(html.includes(s.personPhotoAge), birthDate === '1990-05-10');
      assert.ok(!html.includes(s.uploadDate));
    }
  }
});

test('person profile offers a birth date picker with direct ancient year entry in each language', () => {
  for (const language of ['es', 'en', 'ca']) {
    const s = photoStrings(language);
    const html = renderToStaticMarkup(React.createElement(PersonEditor, {
      person: { id: 'ana', name: 'Ana', birthDate: '1850-10-23' }, s,
    }));
    assert.ok(html.includes(s.birthDate));
    assert.match(html, /type="number"[^>]*min="1"/);
    assert.match(html, /value="1850"/);
    assert.ok(html.includes(s.birthMonths[9]));
    assert.match(html, /<summary>.*1850.*<\/summary>/);
    assert.match(html, /photo-person-birthday__picker/);
  }
  const html = renderToStaticMarkup(React.createElement(PersonEditor, {
    person: { id: 'unknown', name: 'Desconocido' }, s: photoStrings('es'),
  }));
  assert.ok(!html.includes('photo-person-birthday__picker'));
});
