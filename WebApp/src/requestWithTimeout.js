export async function requestWithTimeout(read, timeoutMs = 10000, { signal, timeoutMessage } = {}) {
  const controller = new AbortController();
  let timer;
  let abort;
  try {
    signal?.throwIfAborted();
    return await Promise.race([
      new Promise((_, reject) => {
        abort = () => { controller.abort(); reject(signal.reason); };
        signal?.addEventListener('abort', abort, { once: true });
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(timeoutMessage || 'La Raspberry tarda demasiado en responder. Puedes reintentar la carga de la ficha.'));
          controller.abort();
        }, timeoutMs);
      }),
      read(controller.signal),
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
