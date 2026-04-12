const configuredBaseUrl = (import.meta.env.VITE_RASPBERRY_API_BASE_URL || "").trim();
const WEB_PIN_STORAGE_KEY = "simpsonstv-web-pin";

function getBaseUrl() {
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  return window.location.origin.replace(/\/+$/, "");
}

async function request(path, options = {}) {
  const storedPin = getStoredWebPin();
  const response = await fetch(`${getBaseUrl()}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(storedPin ? { "X-Web-Pin": storedPin } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await response.text();
  const payload = text ? tryParseJson(text) : null;

  if (!response.ok) {
    const error = new Error(payload?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return { raw: value };
  }
}

export function getApiBaseUrl() {
  return getBaseUrl();
}

export function getStoredWebPin() {
  return window.sessionStorage.getItem(WEB_PIN_STORAGE_KEY) || "";
}

export function setStoredWebPin(pin) {
  if (!pin) {
    window.sessionStorage.removeItem(WEB_PIN_STORAGE_KEY);
    return;
  }
  window.sessionStorage.setItem(WEB_PIN_STORAGE_KEY, pin);
}

export function authWebPin(pin) {
  return request("/web/auth", {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
}

export function getHealth() {
  return request("/health");
}

export function getVideos() {
  return request("/videos");
}

export function playEpisode({ id, directory }) {
  return request("/play", {
    method: "POST",
    body: JSON.stringify({
      id,
      directory,
    }),
  });
}

export function volumeUp() {
  return request("/volume/up", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function volumeDown() {
  return request("/volume/down", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function stopPlayback() {
  return request("/stop", {
    method: "POST",
    body: JSON.stringify({}),
  });
}
