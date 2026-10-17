// Fetch streams contain decoded bytes, even when the response was gzip encoded.
export async function readResponseWithProgress(response, onProgress) {
  if (!onProgress || !response.body?.getReader) return response.text();
  const decodedLength = response.headers.get("X-Decoded-Content-Length");
  const length = Number(decodedLength || (!response.headers.get("Content-Encoding")
    ? response.headers.get("Content-Length") : 0));
  const total = Number.isFinite(length) && length > 0 ? length : 0;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let completed = 0;
  let text = "";
  onProgress({ completed, total });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      completed += value.byteLength;
      text += decoder.decode(value, { stream: true });
      onProgress({ completed: total ? Math.min(completed, total) : completed, total });
    }
    text += decoder.decode();
    onProgress({ completed, total: completed });
    return text;
  } finally {
    reader.releaseLock();
  }
}
