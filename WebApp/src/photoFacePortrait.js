// Fit the exact detected rectangle inside a square, preserving the oriented
// thumbnail's aspect ratio and clipping every other face in the source photo.
export function facePortraitLayout(box, width, height) {
  if (!box || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ||
      !['x', 'y', 'width', 'height'].every(key => Number.isFinite(box[key])) ||
      box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0 ||
      box.x + box.width > 1.000001 || box.y + box.height > 1.000001) return null;
  const ratio = width * box.width / (height * box.height);
  return {
    frame: { width: `${100 * Math.min(1, ratio)}%`, height: `${100 * Math.min(1, 1 / ratio)}%` },
    image: { width: `${100 / box.width}%`, height: `${100 / box.height}%`,
      left: `${-100 * box.x / box.width}%`, top: `${-100 * box.y / box.height}%` },
  };
}
