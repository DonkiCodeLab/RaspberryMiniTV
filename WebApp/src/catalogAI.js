export const AI_SECTIONS = ["movies", "series", "books", "games", "pictures"];

export function catalogItemId(section, item) {
  return String(section === "movies" ? item?.fileRelativePath || item?.relativePath || item?.id || ""
    : section === "series" ? item?.directoryPath || item?.relativePath || "" : item?.relativePath || "");
}

export function catalogAIIds(result) {
  return result && ["filter", "count"].includes(result.intent) ? new Set(result.ids) : null;
}

export function matchesCatalogAI(section, item, ids) {
  return ids === null || ids.has(catalogItemId(section, item));
}

export function filterAICollections(collections, ids) {
  if (ids === null) return collections;
  return collections.map(collection => ({ ...collection,
    books: collection.books.filter(book => matchesCatalogAI("books", book, ids)),
  })).filter(collection => collection.books.length);
}

export function validateAIResult(data, section) {
  if (!data || data.ok !== true || data.section !== section ||
      !["filter", "count", "clarify", "unsupported"].includes(data.intent) ||
      !Array.isArray(data.ids) || data.ids.some(id => typeof id !== "string" || !id) ||
      typeof data.message !== "string" || !Number.isInteger(data.count) || data.count < 0 ||
      !Number.isInteger(data.total) || data.total < 0) throw new Error("Invalid AI response");
  return { ...data, ids: [...new Set(data.ids)] };
}

export function aiSettingsPayload(settings, apiKey = "", clearApiKey = false) {
  const payload = { enabled: Boolean(settings.enabled), model: String(settings.model || "").trim(),
    requestsPerMinute: Number(settings.requestsPerMinute) };
  if (clearApiKey) payload.clearApiKey = true;
  else if (apiKey.trim()) payload.apiKey = apiKey.trim();
  return payload;
}

// Use a separate controller so both a section change and the provider timeout
// cancel the fetch. Race explicitly so even a stalled body cannot hang the UI.
export async function aiRequestWithTimeout(read, signal, timeoutMs = 50000) {
  const controller = new AbortController();
  let timer, cancel;
  const aborted = new Promise((_, reject) => {
    cancel = () => { controller.abort(); reject(new DOMException("Aborted", "AbortError")); };
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
  });
  try {
    if (signal?.aborted) return await aborted;
    return await Promise.race([read(controller.signal), aborted, new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error("AI request timed out");
        error.code = "AI_TIMEOUT";
        reject(error);
        controller.abort();
      }, timeoutMs);
    })]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
