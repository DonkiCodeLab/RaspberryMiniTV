// Glass bounds and inscribed 4:3 picture rectangles measured from the supplied SVGs.
export const GAME_TELEVISIONS = [
  {"id":"tv-01","number":1,"crop":[0,0,1234.96,1267.46],"screen":[141.9,363.53,951.14,749],"monochrome":true,"picture":[7.3495,9.4063,85.301,81.1875]},
  {"id":"tv-02","number":2,"crop":[0,0,872.48,771.43],"screen":[98.38,266.74,571.12,369.15],"monochrome":true,"picture":[17.5278,12.3001,64.9443,75.3998]},
  {"id":"tv-03","number":3,"crop":[0,0,987.57,929.69],"screen":[73.93,73.32,839.93,604.6],"monochrome":true,"picture":[7.842,6.0854,84.316,87.8292]},
  {"id":"tv-04","number":4,"crop":[0,0,5690.31,6243.38],"screen":[406.07,1876.83,4026.96,3319.39],"monochrome":true,"picture":[7.1525,11.0005,85.695,77.9991]},
  {"id":"tv-05","number":5,"crop":[0,0,1077.97,1129.78],"screen":[66.57,438.21,743.23,570.64],"monochrome":true,"picture":[7.1525,8.1567,85.695,83.6865]},
  {"id":"tv-06","number":6,"crop":[0,0,895.19,898.42],"screen":[75.23,274.93,608.26,487.12],"monochrome":true,"picture":[6.9555,9.6962,86.089,80.6077]},
  {"id":"tv-07","number":7,"crop":[0,0,6290.28,6780.04],"screen":[400.1,2410.23,4208.79,3415.1],"monochrome":true,"picture":[4.9855,8.3713,90.029,83.2574]},
  {"id":"tv-08","number":8,"crop":[0,0,628.24,692.17],"screen":[49.03,225.32,412.58,365.44],"monochrome":true,"picture":[1.4395,8.8935,97.121,82.213]},
  {"id":"tv-09","number":9,"crop":[0,0,1181.8,1529.71],"screen":[133.74,473.62,764.95,592.8],"monochrome":true,"picture":[9.418,10.7271,81.164,78.5458]},
  {"id":"tv-10","number":10,"crop":[0,0,2475.42,2581.64],"screen":[166.71,738.51,1636.87,1359.32],"monochrome":true,"picture":[6.5615,10.7483,86.877,78.5033]},
  {"id":"tv-11","number":11,"crop":[0,0,2168.28,2709.84],"screen":[185.21,804.63,1579.46,1277.16],"monochrome":true,"picture":[6.5615,9.7294,86.877,80.5411]},
  {"id":"tv-12","number":12,"crop":[0,0,3540.01,3455.28],"screen":[218.79,982.79,2340.28,1989],"monochrome":true,"picture":[4.0005,9.4122,91.999,81.1756]},
  {"id":"tv-13","number":13,"crop":[0,0,1282.03,1189.02],"screen":[89.65,372.68,873.96,610.78],"monochrome":true,"picture":[10.1075,7.1969,79.785,85.6062]},
  {"id":"tv-14","number":14,"crop":[0,0,1239.35,1189.35],"screen":[59.77,309.5,864.95,658.68],"monochrome":true,"picture":[8.1375,8.7426,83.725,82.5148]},
  {"id":"tv-15","number":15,"crop":[0,0,6354.14,6687.27],"screen":[488.4,2162.55,4336.45,3186.05],"monochrome":true,"picture":[8.3345,7.4842,83.331,85.0316]},
  {"id":"tv-16","number":16,"crop":[0,0,1749.95,1742.01],"screen":[88.78,600.31,1255.02,967.61],"monochrome":true,"picture":[6.069,7.2656,87.862,85.4689]},
  {"id":"tv-17","number":17,"crop":[0,0,615.2,937.54],"screen":[115.57,270.93,384.59,395.39],"monochrome":false,"picture":[7.5465,19.0271,84.907,61.9458]},
  {"id":"tv-18","number":18,"crop":[0,0,958.39,1153],"screen":[74.81,343.29,616.79,513.78],"monochrome":false,"picture":[5.1825,9.6481,89.635,80.7038]},
  {"id":"tv-19","number":19,"crop":[0,0,3085.26,3062.75],"screen":[238.09,980.09,1943.32,1577.53],"monochrome":false,"picture":[5.5765,8.9684,88.847,82.0631]},
  {"id":"tv-20","number":20,"crop":[0,0,6045.44,7327.07],"screen":[514.86,2016.79,5013.7,3835.83],"monochrome":false,"picture":[8.1375,8.9583,83.725,82.0833]},
  {"id":"tv-21","number":21,"crop":[0,0,1519.08,1394.72],"screen":[196.89,143.41,1125.57,828.51],"monochrome":false,"picture":[8.4658,7.6758,83.0683,84.6484]},
  {"id":"tv-22","number":22,"crop":[0,0,7273.55,4953.33],"screen":[1412.33,609.14,3998.71,3375.89],"monochrome":false,"picture":[5.1825,10.174,89.635,79.652]},
  {"id":"tv-23","number":23,"crop":[0,0,942.81,855.57],"screen":[74.07,248.98,576.05,478.51],"monochrome":false,"picture":[4.887,9.2843,90.226,81.4314]},
  {"id":"tv-24","number":24,"crop":[0,0,1601.03,1667],"screen":[113.77,388.05,1091.56,857.6],"monochrome":false,"picture":[6.66,8.5924,86.68,82.8153]},
  {"id":"tv-25","number":25,"crop":[0,0,3881.97,2906.64],"screen":[767.91,348.94,2185.15,1556.7],"monochrome":false,"picture":[8.3673,6.1454,83.2653,87.7093]},
];

export const DEFAULT_TELEVISION = "tv-22";
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

export function televisionVariables(television, controllerRatio) {
  const [x, y, width, height] = television.picture;
  return {
    "--tv-ratio": television.crop[2] / television.crop[3],
    "--setup-ratio": television.crop[3] / television.crop[2] + .76 / controllerRatio,
    "--setup-mobile-ratio": television.crop[3] / television.crop[2] + 1 / controllerRatio,
    "--tv-mask": `url("/game-televisions/${television.id}-screen.svg")`,
    "--picture-left": `${x}%`, "--picture-top": `${y}%`,
    "--picture-width": `${width}%`, "--picture-height": `${height}%`,
  };
}
