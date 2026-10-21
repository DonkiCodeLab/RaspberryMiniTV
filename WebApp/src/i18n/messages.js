import { message } from './index.js';
import { normalizeLanguage } from './languages.js';
import legacy from './legacy.json' with { type: 'json' };
const bySource = new Map();
for (const [es, en, ca] of legacy) {
  const entry = { es, en, ca };
  bySource.set(es, entry);
  if (!bySource.has(en)) bySource.set(en, entry);
}
export function legacyMessage(source, language, variables = {}) {
  const item = bySource.get(source);
  const code = normalizeLanguage(language);
  const result = code === 'es' && item ? item.es : code === 'ca' && item ? item.ca : message(item?.en || source, code);
  return result.replace(/\{([^{}]+)\}/g, (match, key) => Object.hasOwn(variables, key) ? String(variables[key]) : match);
}
export function runtimeMessage(source, variables) {
  let language = typeof document !== 'undefined' ? document.documentElement.lang : '';
  if (!language) {
    try { language = window.localStorage.getItem('minitv-raspberry-language-v1'); } catch { /* Browser storage may be unavailable. */ }
  }
  return legacyMessage(source, language, variables);
}
