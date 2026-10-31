export type GpsStatus = 'with' | 'without' | 'unknown';
type Coordinates = { latitude: number; longitude: number };

function number(value: unknown): number {
  return typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
}

export function validCoordinates(value: unknown): value is Coordinates {
  const point = value as Coordinates | null;
  return !!point && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 &&
    Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
}

export function photoCoordinates(location: unknown, exif?: Record<string, unknown> | null): Coordinates | null {
  if (location && typeof location === 'object') {
    const point = location as Record<string, unknown>;
    const coordinates = { latitude: number(point.latitude), longitude: number(point.longitude) };
    if (validCoordinates(coordinates)) return coordinates;
  }
  const gps = exif?.['{GPS}'] as Record<string, unknown> | undefined;
  function degrees(value: unknown, reference: unknown, positive: string, negative: string) {
    let result = number(value);
    if (Array.isArray(value) && value.length === 3) {
      const [d, m, s] = value.map(number);
      result = d >= 0 && m >= 0 && m < 60 && s >= 0 && s < 60 ? d + m / 60 + s / 3600 : NaN;
    }
    if (reference === negative) return -Math.abs(result);
    if (reference === positive) return Math.abs(result);
    return reference == null || reference === '' ? result : NaN;
  }
  const coordinates = {
    latitude: degrees(gps?.Latitude ?? exif?.GPSLatitude, gps?.LatitudeRef ?? exif?.GPSLatitudeRef, 'N', 'S'),
    longitude: degrees(gps?.Longitude ?? exif?.GPSLongitude, gps?.LongitudeRef ?? exif?.GPSLongitudeRef, 'E', 'W'),
  };
  return validCoordinates(coordinates) ? coordinates : null;
}

export function pendingGps(metadata: Record<string, unknown>, inspected?: GpsStatus): GpsStatus {
  if (validCoordinates(metadata)) return 'with';
  // Old pending files/outcomes did not retain a GPS assessment. Absence of a
  // recorded assessment must not be presented as absence of GPS in the photo.
  return inspected === 'without' ? 'without' : 'unknown';
}

export function gpsLabel(status?: GpsStatus): string {
  return status === 'with' ? 'Con GPS' : status === 'without' ? 'Sin GPS detectado' : 'Sin dato GPS';
}
