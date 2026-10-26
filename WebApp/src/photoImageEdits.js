// Boxes remain in original-image coordinates until the whole step is committed.
export function editBox(box, edits = [], inverse = false) {
  if (!box) return null;
  let b = { ...box };
  for (const edit of inverse ? [...edits].reverse() : edits) {
    if (edit.rotate) {
      const turns = ((inverse ? -edit.rotate : edit.rotate) % 4 + 4) % 4;
      for (let i = 0; i < turns; i++) b = { x: 1 - b.y - b.height, y: b.x, width: b.height, height: b.width };
    } else if (edit.crop) {
      const c = edit.crop;
      b = inverse ? { x: c.x + b.x * c.width, y: c.y + b.y * c.height, width: b.width * c.width, height: b.height * c.height } :
        { x: (b.x - c.x) / c.width, y: (b.y - c.y) / c.height, width: b.width / c.width, height: b.height / c.height };
    }
  }
  return b;
}

export function visibleBox(box) {
  if (!box) return null;
  const x = Math.max(0, box.x), y = Math.max(0, box.y);
  const width = Math.min(1, box.x + box.width) - x, height = Math.min(1, box.y + box.height) - y;
  return width > .00001 && height > .00001 ? { x, y, width, height } : null;
}

export async function imageEditPreview(url, edits) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;
  await image.decode();
  let source = image;
  for (const edit of edits) {
    const canvas = document.createElement('canvas');
    const w = source.width, h = source.height;
    if (edit.rotate) {
      canvas.width = h; canvas.height = w;
      const ctx = canvas.getContext('2d');
      ctx.translate(h / 2, w / 2); ctx.rotate(edit.rotate * Math.PI / 2);
      ctx.drawImage(source, -w / 2, -h / 2);
    } else if (edit.crop) {
      const c = edit.crop;
      canvas.width = Math.max(1, Math.round(w * c.width)); canvas.height = Math.max(1, Math.round(h * c.height));
      canvas.getContext('2d').drawImage(source, w * c.x, h * c.y, w * c.width, h * c.height, 0, 0, canvas.width, canvas.height);
    } else {
      // Upscaling changes saved resolution, not the fitted preview. Keep memory bounded.
      canvas.width = Math.max(1, Math.round(w * Math.min(1, edit.scale))); canvas.height = Math.max(1, Math.round(h * Math.min(1, edit.scale)));
      canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    }
    source = canvas;
  }
  return source.toDataURL('image/jpeg', .92);
}
