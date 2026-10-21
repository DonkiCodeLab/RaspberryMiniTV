export function releaseSource(name = "") {
  const text = String(name).toUpperCase();
  const sources = [
    [/(?:^|[^A-Z0-9])(?:HD)?(?:CAM|TS|TELESYNC|HDCAM)(?:[^A-Z0-9]|$)/, "CAM / TS"],
    [/(?:^|[^A-Z0-9])(?:DVD)?SCR(?:EENER)?(?:[^A-Z0-9]|$)/, "Screener"],
    [/REMUX/, "Remux"], [/BLU[ ._-]?RAY|BDRIP|BRRIP/, "Blu-ray"],
    [/WEB[ ._-]?DL/, "WEB-DL"], [/WEB[ ._-]?RIP/, "WEBRip"],
    [/HDTV/, "HDTV"], [/DVD[ ._-]?RIP|DVDR/, "DVD"],
  ];
  return sources.find(([pattern]) => pattern.test(text))?.[1] || null;
}

export function movieFileQuality(info = {}, name = "") {
  const source = releaseSource(name);
  const width = Number(info.width) || 0, height = Number(info.height) || 0;
  // Width also identifies theatrical crops, e.g. a 1920 × 800 Full HD release.
  const resolution = width >= 3800 || height >= 2100 ? "4K UHD"
    : width >= 2500 || height >= 1400 ? "1440p"
    : width >= 1800 || height >= 1000 ? "1080p Full HD"
    : width >= 1200 || height >= 700 ? "720p HD" : width && height ? "SD" : null;
  let level = resolution === "4K UHD" ? 5 : ["1440p", "1080p Full HD"].includes(resolution) ? 4
    : resolution === "720p HD" ? 3 : resolution === "SD" ? 2 : 0;
  if (source === "CAM / TS") level = 1;
  else if (source === "Screener") level = level ? Math.min(level, 2) : 2;
  return { source, resolution, level };
}

export function formatFileSize(bytes, locale = "es") {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return null;
  const unit = bytes >= 1024 ** 3 ? 3 : bytes >= 1024 ** 2 ? 2 : bytes >= 1024 ? 1 : 0;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(bytes / 1024 ** unit)} ${["B", "KiB", "MiB", "GiB"][unit]}`;
}
