import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LANGUAGES, normalizeLanguage, intlLocale, tmdbLocale } from '../src/i18n/languages.js';
import { message, withLanguages } from '../src/i18n/index.js';
import catalogs from '../src/i18n/catalogs.js';

const sources = JSON.parse(fs.readFileSync(new URL('../../tools/i18n/source-messages.json', import.meta.url)));
const device = JSON.parse(fs.readFileSync(new URL('../../DeviceApp/translations.json', import.meta.url)));
const placeholders = value => [...value.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]).sort();

test('all 21 languages retain their identity and formatting locale', () => {
  assert.equal(LANGUAGES.length, 21);
  assert.equal(new Set(LANGUAGES.map(item => item.id)).size, 21);
  for (const language of LANGUAGES) {
    assert.equal(normalizeLanguage(language.id), language.id);
    assert.doesNotThrow(() => new Intl.NumberFormat(intlLocale(language.id)).format(1234));
    assert.match(tmdbLocale(language.id), /^[a-z]{2}-[A-Z]{2}$/);
  }
  assert.equal(normalizeLanguage('ar-EG'), 'arz');
  assert.equal(normalizeLanguage('pcm'), 'pcm');
  assert.equal(normalizeLanguage('zh_Hans'), 'zh');
  assert.equal(normalizeLanguage('unknown', null), null);
  assert.deepEqual(LANGUAGES.filter(item => item.direction === 'rtl').map(item => item.id), ['ar', 'ur', 'arz']);
});

test('every catalog covers the complete interface and preserves interpolation variables', () => {
  for (const { id } of LANGUAGES.filter(item => item.id !== 'en')) {
    for (const source of sources) {
      const translated = catalogs[id][source];
      assert.equal(typeof translated, 'string', `${id}: missing ${source}`);
      assert.ok(translated.trim(), `${id}: empty ${source}`);
      assert.deepEqual(placeholders(translated), placeholders(source), `${id}: variables in ${source}`);
    }
  }
});

test('the Raspberry has every menu message in every selectable language', () => {
  for (const { id } of LANGUAGES) {
    assert.deepEqual(Object.keys(device[id]).sort(), Object.keys(device.en).sort(), id);
    for (const [key, source] of Object.entries(device.en)) {
      assert.ok(device[id][key].trim(), `${id}: ${key}`);
      assert.deepEqual(placeholders(device[id][key]), placeholders(source), `${id}: ${key}`);
      if (!['en', 'es', 'ca'].includes(id)) assert.equal(device[id][key], catalogs[id][source]);
    }
  }
});

test('translation preserves user text, nested labels and original curated locales', () => {
  const tree = withLanguages({ en: { title: 'Language', nested: ['Save'] }, es: { title: 'Idioma' }, ca: { title: 'Idioma' } });
  assert.equal(tree.es.title, 'Idioma');
  assert.equal(tree.ar.title, message('Language', 'ar'));
  assert.deepEqual(tree.ja.nested, [message('Save', 'ja')]);
  assert.equal(tree.unknown, undefined);
  assert.equal(message('Loading details for {name}…', 'fr', { name: 'The Simpsons {notAToken}' }),
    catalogs.fr['Loading details for {name}…'].replace('{name}', 'The Simpsons {notAToken}'));
});
