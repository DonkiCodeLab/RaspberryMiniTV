export async function requestWithTimeout(read, timeoutMs = 10000) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      read(controller.signal),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('La Raspberry tarda demasiado en responder. Puedes reintentar la carga de la ficha.'));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
