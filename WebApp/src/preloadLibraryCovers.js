// Warm both tabs' small covers without flooding the Raspberry with requests.
export const coverPreloadResults = new Map();
export async function preloadLibraryCovers(urls, { signal, createImage = () => new Image(), timeoutMs = 12000, onProgress = () => {}, log = (event, data) => console.info(`[Biblioteca] ${event}`, data) } = {}) {
  coverPreloadResults.clear();
  const pending = [...new Map(urls.map(item => typeof item === 'string' ? { url: item, name: item.split('?')[0] } : item).filter(item => item?.url).map(item => [item.url, item])).values()];
  let cursor = 0, completed = 0, loaded = 0, failed = 0, timedOut = 0;
  const active = new Map();
  const publish = () => onProgress({ completed, total: pending.length, loaded, failed, timedOut, active: [...active.values()] });
  publish();
  const load = ({ url, name }) => new Promise(resolve => {
    const image = createImage();
    const started = Date.now();
    const resource = url.split('?')[0]; // Never print the PIN carried by image URLs.
    let timer, finished = false;
    active.set(url, { name, started });
    log('Portada: inicio', { name, resource });
    publish();
    const finish = outcome => {
      if (finished) return;
      finished = true;
      coverPreloadResults.set(url, outcome);
      clearTimeout(timer);
      image.onload = image.onerror = null;
      signal?.removeEventListener('abort', abort);
      active.delete(url);
      if (outcome !== 'cancelada') {
        completed++;
        if (outcome === 'cargada') loaded++;
        else if (outcome === 'tiempo agotado') timedOut++;
        else failed++;
      }
      log(`Portada: ${outcome}`, { name, resource, ms: Date.now() - started, completed, total: pending.length });
      publish();
      resolve();
    };
    const abort = () => { finish('cancelada'); image.src = ''; };
    image.onload = () => finish('cargada');
    image.onerror = () => finish('error');
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { finish('tiempo agotado'); image.src = ''; }, timeoutMs);
    image.src = url;
    if (image.complete && image.naturalWidth) finish('cargada');
    else if (image.decode) image.decode().then(() => finish('cargada'), () => finish('error'));
  });
  await Promise.all(Array.from({ length: Math.min(6, pending.length) }, async () => {
    while (!signal?.aborted && cursor < pending.length) await load(pending[cursor++]);
  }));
  log(signal?.aborted ? 'Precarga cancelada' : 'Precarga terminada', { loaded, failed, timedOut, total: pending.length });
}
