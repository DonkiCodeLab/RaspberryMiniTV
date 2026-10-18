export function trafficTime(timestamp, language = 'es', period = '3h', full = false) {
  let options = { hour: '2-digit', minute: '2-digit' };
  if (full || period === '7d') {
    options = { day: '2-digit', month: 'short', ...options };
    if (period === '365d') options.year = 'numeric';
  } else if (period === '30d') options = { day: '2-digit', month: 'short' };
  else if (period === '365d') options = { month: 'short', year: 'numeric' };
  return new Date(timestamp * 1000).toLocaleString(language, options);
}

export function trafficSize(value, language = 'es', rate = false) {
  if (value == null || !Number.isFinite(value)) return '—';
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  const index = Math.min(4, Math.max(0, Math.floor(Math.log10(Math.max(1, value)) / 3)));
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: index ? 1 : 0 }).format(value / 1000 ** index)} ${units[index]}${rate ? '/s' : ''}`;
}

export function trafficPaths(points, field, x, y, baseline) {
  const segments = [];
  let segment = [];
  for (const point of points) {
    if (point[field] == null) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push([x(point), y(point[field])]);
  }
  if (segment.length) segments.push(segment);
  return segments.map(coords => ({
    line: coords.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' '),
    area: `M${coords[0][0]},${baseline} ${coords.map(([px, py]) => `L${px},${py}`).join(' ')} L${coords.at(-1)[0]},${baseline} Z`,
    single: coords.length === 1 ? coords[0] : null,
  }));
}
