const codecs = { aac: "mp4a.40.2", mp3: "mp3", opus: "opus", vorbis: "vorbis", flac: "flac", ac3: "ac-3", eac3: "ec-3" };

export function supportedBrowserAudio(video = document.createElement("video")) {
  return Object.fromEntries(["mp4", "webm"].map(container => [container,
    Object.entries(codecs).filter(([, codec]) => Boolean(video.canPlayType(`audio/${container}; codecs="${codec}"`)))
      .map(([name]) => name)]));
}

function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function prepareBrowserPlayback(url, { supportedAudio, signal, onStatus, retry = false, pollMs = 1000 } = {}, fetcher = fetch) {
  const source = new URL(url, typeof window === "undefined" ? "http://localhost" : window.location.href);
  // Demo videos and external previews are not backed by the MiniTV preparation API.
  if (source.pathname !== "/media/stream" || !source.searchParams.has("relativePath")) return url;
  const endpoint = new URL("/media/playback", source);
  const headers = { "Content-Type": "application/json", "X-Web-Pin": source.searchParams.get("pin") || "" };
  const body = JSON.stringify({ relativePath: source.searchParams.get("relativePath"), supportedAudio: supportedAudio || supportedBrowserAudio(), retry });
  async function request(method, id) {
    signal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, 20000);
    try {
      const target = new URL(endpoint);
      if (id) target.searchParams.set("id", id);
      const response = await fetcher(target, { method, headers, cache: "no-store", signal: controller.signal,
        ...(method === "POST" ? { body } : {}) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.errorCode || (response.status === 401 ? "UNAUTHORIZED" : response.status === 404 ? "BACKEND_MISSING" : "NETWORK"));
        error.code = error.message;
        throw error;
      }
      if (!payload.id || !["queued", "checking", "converting", "finalizing", "ready", "failed"].includes(payload.state)) throw new Error("BACKEND_MISSING");
      return payload;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
  let status = await request("POST");
  for (;;) {
    signal?.throwIfAborted();
    onStatus?.(status);
    if (status.state === "failed") throw new Error(status.errorCode || "CONVERSION_FAILED");
    if (status.state === "ready") {
      if (!status.converted) return url;
      if (!/^[a-f0-9]{64}$/.test(status.cacheKey || "")) throw new Error("CONVERSION_FAILED");
      source.searchParams.delete("download");
      source.searchParams.set("browserCopy", status.cacheKey);
      return source.href;
    }
    await pause(pollMs, signal);
    try { status = await request("GET", status.id); }
    catch (error) {
      // A restarted API has no in-memory jobs; a fresh POST reuses finished copies.
      if (error.code !== "JOB_NOT_FOUND") throw error;
      status = await request("POST");
    }
  }
}

export function playbackTime(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}
