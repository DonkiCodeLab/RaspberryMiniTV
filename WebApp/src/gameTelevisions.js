// Aperture bounds measured from the supplied transparent artwork.
// The 4:3 picture covers the aperture; the foreground bezel hides its curved edges.
export const GAME_TELEVISIONS = [
  { id: "simpsons", name: "Los Simpson", image: "simpsons.svg", crop: [0, 0, 854, 1143], screen: [48, 513, 637, 511] },
  { id: "gray", name: "Gray TV", image: "gray.png", crop: [0, 0, 3840, 2160], screen: [370, 220, 2266, 1714] },
  { id: "cream", name: "Cream TV", image: "cream.png", crop: [0, 0, 3840, 2160], screen: [389, 222, 2286, 1719] },
  { id: "green", name: "Green TV", image: "green.png", crop: [0, 0, 3840, 2160], screen: [907, 91, 2648, 1992] },
  { id: "none", name: "None", image: null, crop: [0, 0, 4, 3], screen: [0, 0, 4, 3] },
];

export const DEFAULT_TELEVISION = "simpsons";
export const TELEVISION_STORAGE_KEY = "minitv.game.television";
export const gameTelevision = id => GAME_TELEVISIONS.find(tv => tv.id === id) || GAME_TELEVISIONS.find(tv => tv.id === DEFAULT_TELEVISION);

export function readGameTelevision() {
  try { return gameTelevision(window.localStorage.getItem(TELEVISION_STORAGE_KEY)).id; }
  catch { return DEFAULT_TELEVISION; }
}

export function saveGameTelevision(id) {
  try { window.localStorage.setItem(TELEVISION_STORAGE_KEY, gameTelevision(id).id); }
  catch { /* Private browsing and full storage must not interrupt the game. */ }
}

export function televisionVariables(television) {
  const [, , screenWidth, screenHeight] = television.screen;
  const width = Math.max(100, screenHeight * 4 / 3 / screenWidth * 100);
  const height = Math.max(100, screenWidth * 3 / 4 / screenHeight * 100);
  const x = (100 - width) / 2;
  const y = (100 - height) / 2;
  return {
    "--tv-ratio": television.crop[2] / television.crop[3],
    "--picture-left": `${x}%`, "--picture-top": `${y}%`,
    "--picture-width": `${width}%`, "--picture-height": `${height}%`,
  };
}
