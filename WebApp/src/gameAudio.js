const storageKey = "minitv.browserGameVolume";

export function readGameVolume() {
  try {
    const stored = window.localStorage.getItem(storageKey);
    const volume = stored === null ? 50 : Number(stored);
    return Number.isFinite(volume) && volume >= 0 && volume <= 100 ? Math.round(volume) : 50;
  } catch { return 50; }
}

export function saveGameVolume(volume) {
  try { window.localStorage.setItem(storageKey, String(volume)); } catch { /* Storage is optional. */ }
}
