import { hasLocation } from './photoLibrary.js';

export const PHOTO_MAP_SOURCE = 'minitv-photos';
export const PHOTO_MAP_LAYER = 'minitv-photo-positions';
// The same public light style used by Immich. Override for a self-hosted provider.
export const IMMICH_MAP_STYLE = 'https://tiles.immich.cloud/v1/style/light.json';

export function photoMapFeatures(photos) {
  return { type: 'FeatureCollection', features: photos.filter(hasLocation).map(photo => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [photo.longitude, photo.latitude] },
    properties: { id: photo.id },
  })) };
}

export function photoMapCoordinates([longitude, latitude], centerLongitude, projection) {
  return [projection === 'mercator' ? longitude + 360 * Math.round((centerLongitude - longitude) / 360) : longitude, latitude];
}

export function photoMapStyle(style, photos, projection = 'mercator') {
  return { ...style, projection: { type: projection }, sources: { ...style.sources,
    [PHOTO_MAP_SOURCE]: { type: 'geojson', data: photoMapFeatures(photos), cluster: true, clusterRadius: 35, clusterMaxZoom: 18, maxzoom: 19 },
  }, layers: [...style.layers, {
    id: PHOTO_MAP_LAYER, type: 'circle', source: PHOTO_MAP_SOURCE,
    paint: { 'circle-radius': 1, 'circle-opacity': 0 },
  }] };
}

// Frame the shortest longitude span, including trips across the date line.
export function photoMapBounds(photos) {
  const located = photos.filter(hasLocation);
  if (!located.length) return null;
  const longitudes = located.map(photo => photo.longitude).sort((a, b) => a - b);
  let gap = -1, start = 0;
  for (let i = 0; i < longitudes.length; i++) {
    const next = (i + 1) % longitudes.length;
    const distance = longitudes[next] + (next === 0 ? 360 : 0) - longitudes[i];
    if (distance > gap) { gap = distance; start = next; }
  }
  let south = 90, north = -90;
  for (const photo of located) { south = Math.min(south, photo.latitude); north = Math.max(north, photo.latitude); }
  const west = longitudes[start];
  return [[west, south], [west + 360 - gap, north]];
}

// Read every member, not just visible pins or an arbitrary first 10,000 photos.
export async function photoClusterIds(source, clusterId, count, signal) {
  const ids = new Set();
  for (let offset = 0; offset < count;) {
    signal?.throwIfAborted();
    const leaves = await source.getClusterLeaves(clusterId, Math.min(1000, count - offset), offset);
    signal?.throwIfAborted();
    if (!leaves.length) throw new Error('The photo cluster changed while opening it.');
    for (const leaf of leaves) ids.add(leaf.properties.id);
    offset += leaves.length;
  }
  return [...ids];
}
