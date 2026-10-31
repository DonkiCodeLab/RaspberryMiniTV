import { ageAtPhoto } from './photoPersonTimeline.js';
import { photoDateValue, validPhotoDate } from './photoMetadata.js';
import { validBirthday, localDateKey } from './personBirthday.js';
import { personPreviewFaces } from './photoPersonPreview.js';

export const EVOLUTION_LIMIT = 60;

export function evolutionCandidates(photos, person) {
  if (!validBirthday(person.birthDate)) return [];
  const today = localDateKey();
  return photos.flatMap(photo => {
    const day = photoDateValue(photo.takenAt), age = ageAtPhoto(person.birthDate, photo.takenAt);
    if (photo.sourceId || !validPhotoDate(day) || day > today || age === null || age < 0) return [];
    // Multiple detections of this person in a collage: prefer its largest face.
    const face = personPreviewFaces(person, photo.id).sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)[0];
    return face ? [{ photo, face, day, age }] : [];
  }).sort((a, b) => a.day.localeCompare(b.day) || String(a.photo.id).localeCompare(String(b.photo.id)));
}

export function evolutionGroups(candidates, from, to, frequency = 'stages') {
  const groups = new Map();
  for (const item of candidates) {
    if (item.age < from || item.age > to) continue;
    // Infancy changes quickly; keep a photo per calendar month before age two.
    const key = frequency === 'all' ? item.photo.id : item.age < 2 ? item.day.slice(0, 7) : String(item.age);
    if (!groups.has(key)) groups.set(key, { key, options: [] });
    groups.get(key).options.push(item);
  }
  const all = [...groups.values()];
  // Evenly sample long sequences, preserving both ends; keep memory bounded.
  return { total: all.length, groups: all.length <= EVOLUTION_LIMIT ? all :
    Array.from({ length: EVOLUTION_LIMIT }, (_, i) => all[Math.round(i * (all.length - 1) / (EVOLUTION_LIMIT - 1))]) };
}

export function evolutionSelection(groups, choices = {}) {
  return groups.map(group => group.options.find(item => item.photo.id === choices[group.key]) ||
    group.options.reduce((best, item) => item.face.box.width * item.face.box.height > best.face.box.width * best.face.box.height ? item : best))
    .sort((a, b) => a.day.localeCompare(b.day) || String(a.photo.id).localeCompare(String(b.photo.id)));
}

// Similarity transform: preserve proportions while fixing eye height and spacing.
export function portraitTransform(width, height, box, eyes, size = 512) {
  let scale, angle = 0, x, y, targetY = .47;
  if (Array.isArray(eyes) && eyes.length === 2 && eyes.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) {
    const [left, right] = [...eyes].sort((a, b) => a.x - b.x);
    const dx = (right.x - left.x) * width, dy = (right.y - left.y) * height;
    const distance = Math.hypot(dx, dy);
    if (distance > 1 && dx > 0 && Math.abs(dy) <= dx) {
      scale = .25 * size / distance; angle = -Math.atan2(dy, dx);
      x = (left.x + right.x) * width / 2; y = (left.y + right.y) * height / 2; targetY = .38;
    }
  }
  if (!scale) {
    scale = size / (2 * Math.max(box.width * width, box.height * height));
    x = (box.x + box.width / 2) * width; y = (box.y + box.height / 2) * height;
  }
  const a = scale * Math.cos(angle), b = scale * Math.sin(angle), c = -b, d = a;
  return { matrix: [a, b, c, d, .5 * size - a * x - c * y, targetY * size - b * x - d * y], alignment: targetY === .38 ? 'eyes' : 'box' };
}

export function evolutionFrameAt(position, count, reducedMotion = false) {
  const value = Math.max(0, Math.min(count - 1, position)), from = Math.floor(value);
  const fraction = value - from;
  // Hold each real photo, then dissolve. Labels always describe a source photo.
  const blend = reducedMotion ? (fraction >= .85 ? 1 : 0) : Math.max(0, (fraction - .55) / .45);
  return { from, to: Math.min(count - 1, from + 1), blend: blend * blend * (3 - 2 * blend) };
}
