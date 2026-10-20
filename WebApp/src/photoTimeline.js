import { PHOTO_PAGE_SIZE } from './photoLibrary.js';

export const MINI_SIZE = 14;
export const MINI_ROWS = 4;

export function galleryWindow(photos, position = 0) {
  const anchor = Math.max(0, Math.min(photos.length - 1, Math.trunc(position) || 0));
  const offset = Math.max(0, Math.min(anchor, photos.length - PHOTO_PAGE_SIZE));
  return { items: photos.slice(offset, offset + PHOTO_PAGE_SIZE), offset, total: photos.length, anchor };
}

export function photoPeriods(photos) {
  const years = [];
  for (const [index, photo] of photos.entries()) {
    const value = photo.takenAt;
    const date = value == null || value === '' ? null : new Date(typeof value === 'number' ? value * 1000 : value);
    const year = date && Number.isFinite(date.getTime()) ? date.getUTCFullYear() : null;
    const month = year === null ? null : date.getUTCMonth();
    let group = years.at(-1);
    if (!group || group.year !== year) { group = { year, start: index, count: 0, months: [] }; years.push(group); }
    group.count++;
    let period = group.months.at(-1);
    if (!period || period.month !== month) { period = { month, start: index, count: 0 }; group.months.push(period); }
    period.count++;
  }
  return years;
}

// Only visible columns and a small overscan are mounted, even for 100,000 photos.
export function miniatureWindow(total, scrollLeft, width) {
  const first = Math.max(0, Math.floor(scrollLeft / MINI_SIZE) - 2);
  const last = Math.min(Math.ceil(total / MINI_ROWS), Math.ceil((scrollLeft + width) / MINI_SIZE) + 2);
  return { start: first * MINI_ROWS, end: Math.min(total, last * MINI_ROWS), width: Math.ceil(total / MINI_ROWS) * MINI_SIZE };
}
