import { intlLocale } from './i18n/languages.js';
import { hasLocation } from './photoLibrary.js';

export function photoDateValue(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export function validPhotoDate(value) {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function dateLabel(value, language, fallback) {
  if (!value) return fallback;
  if (typeof value === 'number') {
    const date = new Date(value * 1000);
    return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString(intlLocale(language), { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const day = photoDateValue(value);
  return validPhotoDate(day) ? new Date(`${day}T12:00:00Z`).toLocaleDateString(intlLocale(language),
    { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : fallback;
}

// A date correction keeps the original capture time and offset when available.
export function photoMetadataPatch(photo, data) {
  if (!data || Array.isArray(data) || typeof data !== 'object' || !Object.keys(data).length ||
      Object.keys(data).some(key => !['takenAt', 'latitude', 'longitude'].includes(key))) throw new Error('Indica una fecha o ubicación válida.');
  const patch = {};
  if ('takenAt' in data) {
    if (!validPhotoDate(data.takenAt)) throw new Error('Selecciona una fecha válida.');
    patch.takenAt = data.takenAt + (typeof photo.takenAt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(photo.takenAt) ? photo.takenAt.slice(10) : '');
  }
  if ('latitude' in data || 'longitude' in data) {
    if (!hasLocation(data)) throw new Error('Selecciona una ubicación válida.');
    patch.latitude = data.latitude; patch.longitude = data.longitude;
  }
  return patch;
}
