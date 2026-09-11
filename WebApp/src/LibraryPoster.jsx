import React, { useEffect, useRef } from 'react';
import { coverPreloadResults } from './preloadLibraryCovers';

export default function LibraryPoster({ src, name }) {
  const ref = useRef(null);
  useEffect(() => {
    const image = ref.current;
    const started = performance.now();
    const initial = { name, resource: src.split('?')[0], width: new URL(src, location.href).searchParams.get('width'), precarga: coverPreloadResults.get(src) || 'sin registro', visible: image.getBoundingClientRect().top < innerHeight };
    const log = (event, extra = {}) => console.info(`[Películas] ${event} ${JSON.stringify({ ...initial, ms: Math.round(performance.now() - started), ...extra })}`);
    let finished = false;
    const report = (event) => {
      if (finished) return;
      finished = true;
      const resource = performance.getEntriesByName(image.src).at(-1);
      log(event, { pixels: image.naturalWidth, requestMs: resource ? Math.round(resource.duration) : null, requestBeforeCard: resource ? resource.startTime < started : null, transferredBytes: resource?.transferSize ?? null });
    };
    const loaded = () => report('carátula cargada');
    const failed = () => report('error de carátula');
    image.addEventListener('load', loaded);
    image.addEventListener('error', failed);
    log('tarjeta creada', { alreadyLoaded: image.complete && image.naturalWidth > 0 });
    if (image.complete && image.naturalWidth) loaded();
    const timer = setTimeout(() => {
      if (!finished) log('sigue pendiente', { visible: image.getBoundingClientRect().top < innerHeight });
    }, 3000);
    return () => { clearTimeout(timer); image.removeEventListener('load', loaded); image.removeEventListener('error', failed); };
  }, [src, name]);
  return <img ref={ref} src={src} alt={`Portada de ${name}`} loading="lazy" decoding="async" fetchPriority="low" />;
}
