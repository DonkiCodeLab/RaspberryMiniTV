const configuredBaseUrl = (import.meta.env.VITE_RASPBERRY_API_BASE_URL || "").trim();

function getBaseUrl() {
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  return window.location.origin.replace(/\/+$/, "");
}

async function request(path, options = {}) {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await response.text();
  const payload = text ? tryParseJson(text) : null;

  if (!response.ok) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
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

