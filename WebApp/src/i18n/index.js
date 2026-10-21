import { normalizeLanguage, intlLocale } from './languages.js';
import dictionaries from './catalogs.js';

/** Translate complete UI messages, never user names, titles, filenames or input. */
export function message(source, language = 'es', variables = {}) {
  const code = normalizeLanguage(language);
  const template = dictionaries[code]?.[source] ?? source;
  return template.replace(/\{([^{}]+)\}/g, (match, key) => Object.hasOwn(variables, key) ? String(variables[key]) : match);
}

export function translateTree(value, language) {
  if (typeof value === 'string') return message(value, language);
  if (Array.isArray(value)) return value.map(item => translateTree(item, language));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, translateTree(item, language)]));
  return value;
}

/** Keep curated original translations; lazily build other locales from the same keys. */
export function withLanguages(table, formatters) {
  const cache = new Map();
  return new Proxy(table, {
    get(target, key) {
      if (typeof key !== 'string' || Object.hasOwn(target, key)) return target[key];
      const language = normalizeLanguage(key, null);
      if (!language) return undefined;
      if (Object.hasOwn(target, language)) return target[language];
      if (!cache.has(language)) {
        const translated = translateTree(target.en, language);
        cache.set(language, typeof translated === 'object' && formatters ? { ...translated, ...formatters(language) } : translated);
      }
      return cache.get(language);
    },
  });
}
export function number(value, language, options) { return new Intl.NumberFormat(intlLocale(language), options).format(value); }
