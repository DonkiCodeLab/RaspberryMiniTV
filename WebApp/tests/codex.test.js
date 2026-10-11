import assert from 'node:assert/strict';
import test from 'node:test';
import { codexStrings, codexLoginUrl } from '../src/codexStrings.js';

test('login links only navigate to OpenAI HTTPS origins', () => {
  assert.equal(codexLoginUrl('https://auth.openai.com/codex/device'), 'https://auth.openai.com/codex/device');
  for (const url of ['javascript:alert(1)', 'https://auth.openai.com.evil.test/login', 'http://auth.openai.com/', 'https://user:secret@auth.openai.com/', null, '/local']) {
    assert.equal(codexLoginUrl(url), null);
  }
});

test('Codex controls have all labels in each supported language', () => {
  const keys = Object.keys(codexStrings('es')).sort();
  for (const language of ['es', 'ca', 'en']) {
    const strings = codexStrings(language);
    assert.deepEqual(Object.keys(strings).sort(), keys);
    assert.ok(Object.values(strings).every(value => typeof value === 'string' && value.length > 0));
  }
  assert.equal(codexStrings('unknown'), codexStrings('es'));
});
