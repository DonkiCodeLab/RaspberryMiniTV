import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "raspberry_api_base_url";

let cachedBaseUrl = null;
let hasLoadedFromStorage = false;

function normalizeBaseUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("Empty URL");

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  const parsed = new URL(withProtocol);

  if (!parsed.hostname) throw new Error("Invalid hostname");
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http/https are supported");
  }

  return `${parsed.protocol}//${parsed.host}`;
}

export async function getRaspberryBaseUrl() {
  if (!hasLoadedFromStorage) {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        cachedBaseUrl = normalizeBaseUrl(stored);
      } else {
        cachedBaseUrl = null;
      }
    } catch (_err) {
      cachedBaseUrl = null;
    } finally {
      hasLoadedFromStorage = true;
    }
  }

  return cachedBaseUrl;
}

export async function setRaspberryBaseUrl(nextUrl) {
  const normalized = normalizeBaseUrl(nextUrl);
  cachedBaseUrl = normalized;
  hasLoadedFromStorage = true;
  await AsyncStorage.setItem(STORAGE_KEY, normalized);
  return normalized;
}

export async function getRaspberryHealth({ timeoutMs = 3500 } = {}) {
  const baseUrl = await getRaspberryBaseUrl();
  if (!baseUrl) {
    return {
      status: "red",
      ok: false,
      running: false,
      playing: null,
      ts: null,
      error: "not_configured",
      baseUrl: null,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/health`, {
      method: "GET",
      signal: controller.signal,
    });

    const bodyText = await res.text();
    let json = null;
    try {
      json = JSON.parse(bodyText);
    } catch (_err) {
      return {
        status: "yellow",
        ok: false,
        running: false,
        playing: null,
        ts: null,
        error: "invalid_json",
        baseUrl,
      };
    }

    const isOk = res.ok && json?.ok === true;
    return {
      status: isOk ? "green" : "yellow",
      ok: json?.ok === true,
      running: Boolean(json?.running),
      playing: json?.playing ?? null,
      ts: json?.ts ?? null,
      error: null,
      baseUrl,
    };
  } catch (_err) {
    return {
      status: "red",
      ok: false,
      running: false,
      playing: null,
      ts: null,
      error: "request_failed",
      baseUrl,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getRaspberryHealthStatus({ timeoutMs = 3500 } = {}) {
  const health = await getRaspberryHealth({ timeoutMs });
  return health.status;
}

export async function stopRaspberryPlayback({ timeoutMs = 5000 } = {}) {
  const baseUrl = await getRaspberryBaseUrl();
  if (!baseUrl) {
    throw new Error("Raspberry URL not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let res = await fetch(`${baseUrl}/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });

    if (!res.ok && (res.status === 404 || res.status === 405)) {
      res = await fetch(`${baseUrl}/stop`, {
        method: "GET",
        signal: controller.signal,
      });
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${txt}`);
    }

    const txt = await res.text().catch(() => "");
    if (!txt) return { ok: true };
    try {
      return JSON.parse(txt);
    } catch (_err) {
      return { ok: true, raw: txt };
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function postToRaspberry(path, { timeoutMs = 5000, body } = {}) {
  const baseUrl = await getRaspberryBaseUrl();
  if (!baseUrl) {
    throw new Error("Raspberry URL not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${txt}`);
    }

    const txt = await res.text().catch(() => "");
    if (!txt) return { ok: true };
    try {
      return JSON.parse(txt);
    } catch (_err) {
      return { ok: true, raw: txt };
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function playRaspberryEpisode({ id, directory, timeoutMs = 5000 } = {}) {
  const episodeId = String(id || "").trim().toUpperCase();
  if (!episodeId) {
    throw new Error("Episode id is required");
  }

  return postToRaspberry("/play", {
    timeoutMs,
    body: directory
      ? {
          id: episodeId,
          directory,
        }
      : { id: episodeId },
  });
}

export async function getRaspberryVideos({ timeoutMs = 10000 } = {}) {
  const baseUrl = await getRaspberryBaseUrl();
  if (!baseUrl) {
    throw new Error("Raspberry URL not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/videos`, {
      method: "GET",
      signal: controller.signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${txt}`);
    }

    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function volumeDownRaspberry({ timeoutMs = 5000 } = {}) {
  return postToRaspberry("/volume/down", { timeoutMs });
}

export async function volumeUpRaspberry({ timeoutMs = 5000 } = {}) {
  return postToRaspberry("/volume/up", { timeoutMs });
}
