import { normalizeSubtitleLanguage } from "./subtitleLanguages.js";

export function translationSources(tracks = [], language) {
  const target = normalizeSubtitleLanguage(language);
  return tracks.filter(track => track.available && normalizeSubtitleLanguage(track.language) !== target);
}
export function canTranslateSubtitle(missingLanguages, language, tracks) {
  return missingLanguages.includes(language) && translationSources(tracks, language).length > 0;
}
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
export async function waitForSubtitleTranslation(job, { getStatus, signal, onProgress, wait = delay }) {
  for (;;) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    onProgress?.(job);
    if (job.state === "ready") return job;
    if (job.state === "failed") { const error = new Error("Subtitle translation failed"); error.code = job.code || "SUBTITLE_TRANSLATION_FAILED"; throw error; }
    if (!["queued", "translating", "waiting"].includes(job.state) || !job.id) throw new Error("Invalid translation status");
    await wait(1500, signal);
    job = await getStatus(job.id, signal);
  }
}
