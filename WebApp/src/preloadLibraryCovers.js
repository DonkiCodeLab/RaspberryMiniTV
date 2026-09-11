// Warm both tabs' small covers without flooding the Raspberry with requests.
export async function preloadLibraryCovers(urls, { signal, createImage = () => new Image(), timeoutMs = 12000 } = {}) {
  const pending = [...new Set(urls.filter(Boolean))];
  let cursor = 0;
  const load = url => new Promise(resolve => {
    const image = createImage();
    let timer;
    const finish = () => {
      clearTimeout(timer);
      image.onload = image.onerror = null;
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const abort = () => { image.src = ""; finish(); };
    image.onload = image.onerror = finish;
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(abort, timeoutMs);
    image.src = url;
  });
  await Promise.all(Array.from({ length: Math.min(6, pending.length) }, async () => {
    while (!signal?.aborted && cursor < pending.length) await load(pending[cursor++]);
  }));
}
