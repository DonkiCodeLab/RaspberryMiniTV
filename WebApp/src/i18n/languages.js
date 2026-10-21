import languages from '../../../DeviceApp/languages.json' with { type: 'json' };
export const LANGUAGES = Object.freeze(languages);
export const LANGUAGE_CODES = new Set(languages.map(language => language.id));
const aliases = { cat: 'ca', spa: 'es', eng: 'en', cmn: 'zh', zho: 'zh', 'zh-hans': 'zh', 'ar-eg': 'arz' };
export function normalizeLanguage(value, fallback = 'es') {
  const code = String(value || '').trim().toLowerCase().replaceAll('_', '-');
  const normalized = aliases[code] || code.split('-')[0];
  return LANGUAGE_CODES.has(normalized) ? normalized : fallback;
}
export function languageInfo(value) { return languages.find(language => language.id === normalizeLanguage(value)); }
export function intlLocale(value) { return languageInfo(value).locale; }
export function tmdbLocale(value) { return languageInfo(value).tmdb; }
export function applyDocumentLanguage(value) {
  if (typeof document === 'undefined') return;
  const language = languageInfo(value);
  document.documentElement.lang = language.id;
  document.documentElement.dir = language.direction;
}
