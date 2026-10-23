import countries from './data/photo-countries.json' with { type: 'json' };
import { hasLocation } from './photoLibrary.js';

const near = (longitude, reference) => longitude + 360 * Math.round((reference - longitude) / 360);
const clampLatitude = latitude => Math.max(-85, Math.min(85, latitude));
const unwrap = ring => {
  let previous = ring[0][0];
  return ring.map(([longitude, latitude]) => { previous = near(longitude, previous); return [previous, latitude]; });
};
const indexed = countries.map(country => ({ ...country, polygons: country.polygons.map(polygon => {
  const rings = polygon.map(unwrap), outer = rings[0];
  const west = Math.min(...outer.map(p => p[0])), east = Math.max(...outer.map(p => p[0]));
  return { rings, west, east, south: Math.min(...outer.map(p => p[1])), north: Math.max(...outer.map(p => p[1])), center: (west + east) / 2 };
}) }));

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

function distanceToRing(x, y, ring) {
  const cosine = Math.max(.1, Math.cos(y * Math.PI / 180));
  let distance = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const ax = (ring[i - 1][0] - x) * cosine, ay = ring[i - 1][1] - y;
    const dx = (ring[i][0] - ring[i - 1][0]) * cosine, dy = ring[i][1] - ring[i - 1][1];
    const ratio = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    distance = Math.min(distance, Math.hypot(ax + ratio * dx, ay + ratio * dy));
  }
  return distance;
}

export function photoCountryView(photo) {
  if (!hasLocation(photo)) return null;
  const { latitude, longitude } = photo;
  let match, nearest, distance = .25;
  for (const country of indexed) {
    for (const polygon of country.polygons) {
      const x = near(longitude, polygon.center), y = latitude;
      if (y < polygon.south - .25 || y > polygon.north + .25 || x < polygon.west - 2.5 || x > polygon.east + 2.5) continue;
      if (inRing(x, y, polygon.rings[0]) && !polygon.rings.slice(1).some(ring => inRing(near(x, ring[0][0]), y, ring))) {
        match = { country, polygon }; break;
      }
      const d = distanceToRing(x, y, polygon.rings[0]);
      if (d < distance) { distance = d; nearest = { country, polygon }; }
    }
    if (match) break;
  }
  match ||= nearest; // Coasts and small islands can fall just outside simplified outlines.
  if (!match) return { center: [clampLatitude(latitude), longitude], zoom: 5 };
  const { country, polygon: origin } = match;
  const point = near(longitude, origin.center);
  let west = point, east = point, south = latitude, north = latitude;
  for (const polygon of country.polygons) {
    const shift = near(polygon.center, origin.center) - polygon.center;
    const left = polygon.west + shift, right = polygon.east + shift;
    // Overseas territories must not zoom a local photo out to the whole globe.
    const gapX = Math.max(0, origin.west - right, left - origin.east);
    const gapY = Math.max(0, origin.south - polygon.north, polygon.south - origin.north);
    if (Math.hypot(gapX, gapY) > 6) continue;
    west = Math.min(west, left); east = Math.max(east, right);
    south = Math.min(south, polygon.south); north = Math.max(north, polygon.north);
  }
  return { code: country.code, name: country.name, center: [clampLatitude(latitude), point],
    bounds: [[clampLatitude(south), west], [clampLatitude(north), east]], maxZoom: 7 };
}
