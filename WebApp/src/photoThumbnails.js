const cancelled = () => new DOMException('Thumbnail cancelled', 'AbortError');

function loadImage(url, signal) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => { image.onload = image.onerror = null; signal?.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); image.src = ''; reject(cancelled()); };
    image.decoding = 'async'; image.fetchPriority = 'low';
    image.onload = () => { cleanup(); resolve(url); };
    image.onerror = () => { cleanup(); reject(new Error('Unable to load photo')); };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    image.src = url;
  });
}

// Reserve browser connections for the viewer and API instead of queuing 100 images.
export function createThumbnailQueue(load = loadImage, limit = 2) {
  const waiting = [];
  let running = 0;
  function drain() {
    while (running < limit && waiting.length) {
      const job = waiting.shift();
      job.signal?.removeEventListener('abort', job.abort);
      if (job.signal?.aborted) { job.reject(cancelled()); continue; }
      running++;
      Promise.resolve().then(() => load(job.url, job.signal)).then(job.resolve, job.reject)
        .finally(() => { running--; drain(); });
    }
  }
  return (url, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(cancelled()); return; }
    const job = { url, signal, resolve, reject, abort: null };
    job.abort = () => {
      const index = waiting.indexOf(job);
      if (index >= 0) { waiting.splice(index, 1); reject(cancelled()); }
    };
    signal?.addEventListener('abort', job.abort, { once: true });
    waiting.push(job); drain();
  });
}

export const requestThumbnail = createThumbnailQueue();
export const PHOTO_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
