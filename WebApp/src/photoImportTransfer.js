const digests = new WeakMap();

// One worker, one file at a time; cache only immutable File objects for retries.
export function createPhotoHasher(signal, workerFactory = () => new Worker(new URL('./photoHash.worker.js', import.meta.url), { type: 'module' })) {
  let worker, rejectPending, stopped = false;
  function close() {
    if (stopped) return;
    stopped = true;
    worker?.terminate();
    rejectPending?.(new DOMException('Import cancelled', 'AbortError'));
    signal?.removeEventListener('abort', close);
  }
  signal?.addEventListener('abort', close, { once: true });
  return {
    close,
    async hash(file, onProgress) {
      if (stopped || signal?.aborted) throw new DOMException('Import cancelled', 'AbortError');
      if (digests.has(file)) return digests.get(file);
      worker ||= workerFactory();
      const digest = await new Promise((resolve, reject) => {
        rejectPending = reject;
        worker.onmessage = ({ data }) => {
          if (data.error) reject(new Error(data.error));
          else if (data.digest) resolve(data.digest);
          else onProgress?.(data.done, data.total);
        };
        worker.onerror = () => reject(new Error('No se pudo comprobar la foto en este navegador.'));
        worker.postMessage(file);
      }).finally(() => { rejectPending = null; });
      digests.set(file, digest);
      return digest;
    },
  };
}

export async function transferPhotoBatch(batch, options, { hash, check, upload }) {
  const onProgress = options.onProgress || (() => {});
  const digests = [];
  for (const { file } of batch) {
    onProgress({ status: 'hashing', fileName: file.name, percent: 0 });
    digests.push(await hash(file, (done, total) => onProgress({ status: 'hashing', fileName: file.name, percent: total ? Math.round(done / total * 100) : 100 })));
  }
  // A file removed since the check is requested again, using the same batch receipt.
  for (let attempt = 0; attempt < 2; attempt++) {
    onProgress({ status: 'checking', fileName: '', percent: 0 });
    const { missing } = await check(digests, options.signal);
    if (!Array.isArray(missing) || new Set(missing).size !== missing.length || missing.some(i => !Number.isInteger(i) || i < 0 || i >= batch.length)) {
      throw new Error('La MiniTV devolvió una comprobación de fotos inválida. Reintenta.');
    }
    const files = missing.map(index => batch[index].file);
    onProgress({ status: files.length ? 'uploading' : 'saving', fileName: '', percent: 0 });
    try {
      return await upload({ ...options, files,
        importData: { ...options.importData, digests, fileIndices: missing,
          records: batch.map(({ metadata, raw }) => ({ metadata, raw })) } });
    } catch (error) {
      if (error.status !== 409 || attempt) throw error;
    }
  }
}
