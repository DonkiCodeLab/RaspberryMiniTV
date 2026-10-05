import oscars from '../../DeviceApp/data/oscar_best_picture.json';
import palme from '../../DeviceApp/data/palme_dor.json';
import goya from '../../DeviceApp/data/goya_best_picture.json';
import { oscarStrings } from './oscarCatalog.js';

export const awardCatalogs = { oscars, palme, goya };
export const awardNames = { oscars: 'Óscar', palme: 'Palme d’Or', goya: 'Goya' };
const translations = {
  es: { view: 'Películas premiadas', selector: 'Seleccionar premio', source: 'Palmarés oficial', oscars: 'LA COLECCIÓN ÓSCAR', palme: 'LA PALMA DE ORO · CANNES', goya: 'LA COLECCIÓN GOYA', palmeSubtitle: 'Las ganadoras de la Palma de Oro a largometrajes, año a año.', goyaSubtitle: 'Todas las ganadoras del Goya a mejor película, año a año.', timeline: 'Recorrer las películas premiadas', scope: 'Palma de Oro desde 1955. No incluye el antiguo Grand Prix, premios especiales, honoríficos ni cortometrajes.' },
  ca: { view: 'Pel·lícules premiades', selector: 'Seleccionar premi', source: 'Palmarès oficial', oscars: 'LA COL·LECCIÓ ÒSCAR', palme: 'LA PALMA D’OR · CANES', goya: 'LA COL·LECCIÓ GOYA', palmeSubtitle: 'Les guanyadores de la Palma d’Or a llargmetratges, any a any.', goyaSubtitle: 'Totes les guanyadores del Goya a millor pel·lícula, any a any.', timeline: 'Recórrer les pel·lícules premiades', scope: 'Palma d’Or des de 1955. No inclou l’antic Grand Prix, premis especials, honorífics ni curtmetratges.' },
  en: { view: 'Award-winning films', selector: 'Select award', source: 'Official winners', oscars: 'THE OSCARS COLLECTION', palme: 'THE PALME D’OR · CANNES', goya: 'THE GOYA COLLECTION', palmeSubtitle: 'Every feature film Palme d’Or winner. A journey through the years.', goyaSubtitle: 'Every Goya Best Film winner. A journey through the years.', timeline: 'Explore award-winning films', scope: 'Palme d’Or since 1955. Excludes the former Grand Prix, special and honorary prizes, and short films.' },
};
export function awardStrings(language = 'es', award = 'oscars') {
  const locale = language.split('-')[0];
  const base = oscarStrings[locale] || oscarStrings.es;
  const words = translations[locale] || translations.es;
  return { ...base, ...words, title: words.view, eyebrow: words[award],
    subtitle: award === 'oscars' ? base.subtitle : words[`${award}Subtitle`],
    award: award === 'palme' ? 'PALME D’OR' : base.award,
    scope: award === 'palme' ? words.scope : '',
  };
}

// Match award winners by TMDB identity, never by a translated title or remake name.
const awardsByMovie = new Map();
for (const [award, catalog] of Object.entries(awardCatalogs)) {
  for (const winner of catalog.winners) {
    const id = Number(winner.tmdbId);
    const prizes = awardsByMovie.get(id) || [];
    if (!prizes.some(prize => prize.award === award)) {
      prizes.push({ award, year: winner.ceremonyYear });
    }
    awardsByMovie.set(id, prizes);
  }
}
export function movieAwards(tmdbId, language = 'es') {
  return (awardsByMovie.get(Number(tmdbId)) || []).map(prize => ({ ...prize,
    label: `${awardNames[prize.award]} · ${awardStrings(language, prize.award).award} · ${prize.year}`,
  }));
}
