import { requestWithTimeout } from './requestWithTimeout.js';

function waitForStatus(signal) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, 1000);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export async function requestTmdbStatus(read, { signal, start = false } = {}) {
  let first = true;
  while (true) {
    const result = await requestWithTimeout(activeSignal => read({
      signal: activeSignal, start: first && start, refresh: first,
    }), 120000, { signal, timeoutMessage: 'No se pudo obtener el estado de TMDB porque la Raspberry no responde. Actualiza el estado para reintentar.' });
    signal?.throwIfAborted();
    if (!result.calculating) return result;
    first = false;
    await waitForStatus(signal);
  }
}
