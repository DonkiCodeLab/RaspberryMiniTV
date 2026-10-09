export function gameYear(game) {
  return String(game.gameMetadata?.releaseDate || game.releaseDate || game.releaseYear || game.year || "")
    .match(/\b(?:19|20)\d{2}\b/)?.[0] || "";
}

export function gameRating(game) {
  const metadata = game.gameMetadata || {};
  if (metadata.rating == null || String(metadata.rating).trim() === "") return "";
  const rating = Number(metadata.rating);
  const scale = Number(metadata.ratingScale);
  if (!Number.isFinite(rating) || !Number.isFinite(scale) || scale <= 0 || rating < 0) return "";
  return `${Math.min(5, rating / scale * 5).toFixed(1)} / 5`;
}
