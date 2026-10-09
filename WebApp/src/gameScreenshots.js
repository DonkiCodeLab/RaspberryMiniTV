export function gameScreenshots(game) {
  const artwork = Array.isArray(game.imageOptions) && game.imageOptions.length
    ? game.imageOptions : Array.isArray(game.screenshots) ? game.screenshots : [];
  return [...new Set(artwork.map(image => typeof image === "string" ? image : image?.url)
    .filter(image => typeof image === "string" && image && image !== game.coverImage))];
}
