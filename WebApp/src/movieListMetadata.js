export function createMovieMetadataLoader(fetchInfo, concurrency = 2) {
  const cache = new Map(), queue = [];
  let active = 0;
  function drain() {
    while (active < concurrency && queue.length) {
      const task = queue.shift();
      if (task.signal?.aborted) continue;
      active++;
      Promise.resolve().then(() => fetchInfo(task.path, task.signal)).then(info => {
        if (!task.signal?.aborted) {
          cache.delete(task.path);
          cache.set(task.path, { info, expires: Date.now() + 60000 });
          if (cache.size > 256) cache.delete(cache.keys().next().value);
          task.resolve(info);
        }
      }, task.reject).finally(() => { task.signal?.removeEventListener('abort', task.abort); active--; drain(); });
    }
  }
  return function load(path, signal) {
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    const cached = cache.get(path);
    if (cached?.expires > Date.now()) return Promise.resolve(cached.info);
    return new Promise((resolve, reject) => {
      const task = { path, signal, resolve, reject };
      task.abort = () => {
        const index = queue.indexOf(task);
        if (index !== -1) queue.splice(index, 1);
        signal?.removeEventListener('abort', task.abort);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal?.addEventListener('abort', task.abort, { once: true });
      queue.push(task); drain();
    });
  };
}
