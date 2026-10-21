import { PHOTO_PAGE_SIZE } from './photoLibrary.js';

export const MINI_IMAGE_SIZE = 24;
export const MINI_SIZE = MINI_IMAGE_SIZE + 4;
export const MINI_ROWS = 8;

function galleryRange(total, position = 0) {
  const anchor = Math.max(0, Math.min(total - 1, Math.trunc(position) || 0));
  const offset = Math.max(0, Math.min(anchor, total - PHOTO_PAGE_SIZE));
  return { offset, total, anchor };
}

export function galleryWindow(photos, position = 0) {
  const range = galleryRange(photos.length, position);
  return { ...range, items: photos.slice(range.offset, range.offset + PHOTO_PAGE_SIZE) };
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

function miniaturePageCenter(total, position) {
  if (!total) return 0;
  const { offset } = galleryRange(total, position);
  const end = Math.min(total, offset + PHOTO_PAGE_SIZE) - 1;
  return (Math.floor(offset / MINI_ROWS) * MINI_SIZE + Math.floor(end / MINI_ROWS) * MINI_SIZE + MINI_IMAGE_SIZE) / 2;
}

// End spacing lets even the first and last expanded groups sit in the middle.
function miniatureLayout(total, width) {
  const contentWidth = Math.ceil(total / MINI_ROWS) * MINI_SIZE;
  const padding = Math.max(0, width / 2 - miniaturePageCenter(total, 0));
  const trailing = Math.max(0, width / 2 - (contentWidth - miniaturePageCenter(total, total)));
  return { padding, width: Math.max(width, padding + contentWidth + trailing) };
}

export function miniatureScrollLeft(total, position, width) {
  const layout = miniatureLayout(total, width);
  return Math.max(0, Math.min(layout.width - width, layout.padding + miniaturePageCenter(total, position) - width / 2));
}

export function miniaturePosition(total, scrollLeft, width) {
  const layout = miniatureLayout(total, width);
  if (scrollLeft <= 0) return 0;
  if (scrollLeft >= layout.width - width - 1) return galleryRange(total, total).offset;
  const center = scrollLeft + width / 2 - layout.padding;
  const column = Math.round((center - miniaturePageCenter(total, 0)) / MINI_SIZE);
  return galleryRange(total, column * MINI_ROWS).offset;
}

// Only visible columns and a small overscan are mounted, even for 100,000 photos.
export function miniatureWindow(total, scrollLeft, width) {
  const layout = miniatureLayout(total, width);
  const left = scrollLeft - layout.padding;
  const columns = Math.ceil(total / MINI_ROWS);
  const first = Math.max(0, Math.min(columns, Math.floor(left / MINI_SIZE) - 2));
  const last = Math.max(first, Math.min(columns, Math.ceil((left + width) / MINI_SIZE) + 2));
  return { start: Math.min(total, first * MINI_ROWS), end: Math.min(total, last * MINI_ROWS), ...layout };
}
