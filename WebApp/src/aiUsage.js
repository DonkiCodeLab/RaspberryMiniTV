export function usageRange(preset, now = new Date()) {
  const end = now.toISOString().slice(0, 10);
  const start = new Date(`${end}T00:00:00Z`);
  if (preset === 'week') start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  if (preset === 'month') start.setUTCDate(1);
  if (preset === 'year') { start.setUTCMonth(0, 1); }
  return { start: start.toISOString().slice(0, 10), end };
}

export function usageValue(point, metric, source) {
  if (source === 'reported') return point.reportedUsd;
  if (metric === 'cost') return point.calls > 0 && point.unknown === point.calls ? null : point.estimatedUsd;
  if (metric === 'tokens' && point.calls > 0 && point.missingTokens === point.calls) return null;
  return point[metric];
}

export function formatUsageMoney(value, locale = 'es-ES') {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 2,
    maximumFractionDigits: 6 }).format(value);
}
