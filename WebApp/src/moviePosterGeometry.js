export function moviePosterGeometry(anchor, libraryWidth, viewportWidth, viewportHeight, rem = 16) {
  const gap = (viewportWidth <= 720 ? .75 : 1.25) * rem;
  const columns = viewportWidth <= 720 ? 2 : Math.max(1, Math.floor((libraryWidth + gap) / (190 + gap)));
  const gridPosterWidth = (libraryWidth - (columns - 1) * gap) / columns - 2;
  const width = Math.max(1, Math.min(gridPosterWidth * 1.344, viewportWidth - 24, (viewportHeight - 24) / 1.5));
  const height = width * 1.5;
  return { width, height,
    left: Math.max(12, Math.min(anchor.left, viewportWidth - width - 12)),
    top: Math.max(12, Math.min(anchor.top - (height - anchor.height) / 2, viewportHeight - height - 12)) };
}
