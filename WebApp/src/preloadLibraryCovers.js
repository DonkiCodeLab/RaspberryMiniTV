// Warm both tabs' small covers without flooding the Raspberry with requests.
export async function preloadLibraryCovers(urls, { signal, createImage = () => new Image(), timeoutMs = 12000, onProgress = () => {} } = {}) {
  const pending = [...new Set(urls.filter(Boolean))];
  let cursor = 0;
  let completed = 0;
  onProgress({ completed, total: pending.length });
  const load = url => new Promise(resolve => {
    const image = createImage();
    let timer;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      onProgress({ completed: ++completed, total: pending.length });
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
    if (image.complete && image.naturalWidth) finish();
    else if (image.decode) image.decode().then(finish, finish);
  });
  await Promise.all(Array.from({ length: Math.min(6, pending.length) }, async () => {
    while (!signal?.aborted && cursor < pending.length) await load(pending[cursor++]);
  }));
}
