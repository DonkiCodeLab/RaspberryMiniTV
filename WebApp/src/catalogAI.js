export const AI_SECTIONS = ["movies", "series", "books", "games", "pictures"];

const SEARCH_PREFERENCES_KEY = "minitv-catalog-ai-preferences-v1";
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
export function readSearchPreferences() {
  try {
    const data = JSON.parse(window.localStorage.getItem(SEARCH_PREFERENCES_KEY));
    return { provider: data?.provider === "openai" ? "openai" : "codex",
      models: Object.fromEntries(["codex", "openai"].map(provider =>
        [provider, typeof data?.models?.[provider] === "string" && MODEL_ID.test(data.models[provider]) ? data.models[provider] : ""])) };
  } catch { return { provider: "codex", models: { codex: "", openai: "" } }; }
}

export function saveSearchPreferences(preferences) {
  // Only provider/model choices, never credentials, prompts or catalogue data.
  try { window.localStorage.setItem(SEARCH_PREFERENCES_KEY, JSON.stringify(preferences)); } catch { /* Private browsing. */ }
}

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

// The Raspberry dashboard commonly runs over plain HTTP, where the modern
// clipboard API is unavailable. Keep copying diagnostics usable on the LAN.
export async function copyAIDebug(report) {
  const text = JSON.stringify(report, null, 2);
  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (_) { /* Fall back to the browser's copy command. */ }
  const previousFocus = document.activeElement;
  const input = document.createElement("textarea");
  input.value = text;
  input.readOnly = true;
  input.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.appendChild(input);
  try {
    input.select();
    if (!document.execCommand("copy")) throw new Error("Clipboard unavailable");
  } finally {
    input.remove();
    previousFocus?.focus();
  }
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
