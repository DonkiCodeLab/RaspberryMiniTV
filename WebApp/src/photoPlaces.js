import { hasLocation } from './photoLibrary.js';
import { intlLocale } from './i18n/languages.js';

export function placeKey(position) {
  if (!hasLocation(position)) return '';
  return [position.latitude, position.longitude].map(value => (Math.abs(value) < .00005 ? 0 : value).toFixed(4)).join(',');
}

export function placeLabel(place, language) {
  if (place?.status !== 'found') return '';
  let country = place.country || '';
  if (/^[A-Z]{2}$/.test(place.countryCode)) {
    try { country = new Intl.DisplayNames([intlLocale(language)], { type: 'region', fallback: 'none' }).of(place.countryCode) || country; } catch { /* Keep the provider's country name. */ }
  }
  return [...new Set([place.city, country].filter(Boolean))].join(', ');
}

// Share in-flight lookups between a photo and its map. A closed view ignores the
// result; it does not cancel a request that another open view may be using.
export function createPlaceResolver(request, now = Date.now) {
  const cache = new Map();
  const entry = key => {
    const item = cache.get(key);
    if (item && item.expires > now()) return item;
    cache.delete(key);
  };
  return {
    peek: position => entry(placeKey(position))?.result,
    async resolve(position) {
      const key = placeKey(position);
      if (!key) return { status: 'not_found' };
      const cached = entry(key);
      if (cached) return cached.promise || cached.result;
      const item = { expires: Infinity };
      cache.set(key, item);
      if (cache.size > 256) cache.delete(cache.keys().next().value);
      item.promise = (async () => {
        const [latitude, longitude] = key.split(',').map(Number);
        try { item.result = await request({ latitude, longitude }); }
        catch { item.result = { status: 'unavailable' }; }
        if (!item.result?.status) item.result = { status: 'unavailable' };
        const seconds = item.result.status === 'found' ? 86400 : item.result.status === 'not_found' ? 3600 :
          item.result.status === 'busy' ? Math.max(.1, Number(item.result.retryAfter) || 1.1) : 60;
        item.expires = now() + seconds * 1000;
        item.promise = null;
        return item.result;
      })();
      return item.promise;
    },
  };
}
