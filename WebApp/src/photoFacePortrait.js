export function personCoverPhotoId(person) {
  return person.coverPhotoId || person.coverFace?.photoId;
}

// Leave room around the head instead of enlarging the detector's tight face box.
// Work in oriented image pixels so the framing never stretches the photograph.
export function facePortraitLayout(box, width, height) {
  if (!box || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ||
      !['x', 'y', 'width', 'height'].every(key => Number.isFinite(box[key])) ||
      box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0 ||
      box.x + box.width > 1.000001 || box.y + box.height > 1.000001) return null;
  const faceWidth = width * box.width, faceHeight = height * box.height;
  const side = 2 * Math.max(faceWidth, faceHeight);
  const cropWidth = Math.max(faceWidth, Math.min(side, width, height));
  const cropHeight = Math.max(faceHeight, Math.min(side, width, height));
  const x = Math.max(0, Math.min(width - cropWidth, width * box.x + faceWidth / 2 - cropWidth / 2));
  const y = Math.max(0, Math.min(height - cropHeight, height * box.y + faceHeight / 2 - cropHeight / 2));
  const ratio = cropWidth / cropHeight;
  return {
    frame: { width: `${100 * Math.min(1, ratio)}%`, height: `${100 * Math.min(1, 1 / ratio)}%` },
    image: { width: `${100 * width / cropWidth}%`, height: `${100 * height / cropHeight}%`,
      left: `${-100 * x / cropWidth}%`, top: `${-100 * y / cropHeight}%` },
  };
}
