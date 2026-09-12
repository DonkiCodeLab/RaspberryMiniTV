// Warm both tabs' small covers without flooding the Raspberry with requests.
export const coverPreloadResults = new Map();
const preparedCovers = new Map();

// A slow cover may continue in the background, but must not hold the whole page.
export async function waitForCoverPreview(preload, budgetMs = 2000) {
  let timer;
  try {
    await Promise.race([preload, new Promise(resolve => { timer = setTimeout(resolve, budgetMs); })]);
  } finally {
    clearTimeout(timer);
  }
}

export function acquireLibraryCover(url, createImage = () => new Image()) {
  let prepared = preparedCovers.get(url);
  if (prepared?.complete && prepared.naturalWidth === 0) {
    preparedCovers.delete(url);
    prepared = null;
  }
  if (prepared && !prepared.parentElement) return prepared;
  const image = createImage();
  image.loading = 'eager';
  image.src = url;
  if (!prepared) preparedCovers.set(url, image);
  return image;
}
export async function preloadLibraryCovers(urls, { signal, createImage = () => new Image(), timeoutMs = 12000, onProgress = () => {}, preserve = false, log = (event, data) => console.info(`[Biblioteca] ${event}`, data) } = {}) {
  const parentSignal = signal;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (parentSignal?.aborted) cancel();
  else parentSignal?.addEventListener('abort', cancel, { once: true });
  signal = controller.signal;
  const deadline = setTimeout(cancel, 10000);
  if (!preserve) coverPreloadResults.clear();
  const pending = [...new Map(urls.map(item => typeof item === 'string' ? { url: item, name: item.split('?')[0] } : item).filter(item => item?.url).map(item => [item.url, item])).values()];
  const wanted = new Set(pending.map(item => item.url));
  if (!preserve) for (const url of preparedCovers.keys()) if (!wanted.has(url)) preparedCovers.delete(url);
  let cursor = 0, completed = 0, loaded = 0, failed = 0, timedOut = 0;
  const active = new Map();
  const publish = () => onProgress({ completed, total: pending.length, loaded, failed, timedOut, active: [...active.values()] });
  publish();
  const load = ({ url, name }) => new Promise(resolve => {
    const image = preparedCovers.get(url) || createImage();
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
      if (outcome === 'cargada') preparedCovers.set(url, image);
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
    image.onload = () => { if (!image.decode) finish('cargada'); };
    image.onerror = () => finish('error');
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { finish('tiempo agotado'); image.src = ''; }, timeoutMs);
    image.loading = 'eager';
    if (image.src !== url) image.src = url;
    if (image.decode) image.decode().then(() => finish('cargada'), () => finish('error'));
    else if (image.complete && image.naturalWidth) finish('cargada');
  });
  await Promise.all(Array.from({ length: Math.min(6, pending.length) }, async () => {
    while (!signal?.aborted && cursor < pending.length) await load(pending[cursor++]);
  }));
  clearTimeout(deadline);
  parentSignal?.removeEventListener('abort', cancel);
  log(signal?.aborted ? 'Precarga cancelada' : 'Precarga terminada', { loaded, failed, timedOut, total: pending.length });
  return { loaded, failed, timedOut, total: pending.length };
}
