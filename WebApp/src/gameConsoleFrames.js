// Rectangles use the artwork's coordinates (SVG viewBox or photograph pixels).
// The crop removes transparent margins; screen and controls scale together.
const commonKeys = { ArrowUp: 4, ArrowDown: 5, ArrowLeft: 6, ArrowRight: 7, KeyZ: 8, KeyX: 0, KeyV: 2, Enter: 3 };
const button = (name, input, x, y, w, h, rotation = 0) => ({ name, input, x, y, w, h, rotation });

export const GAME_CONSOLE_FRAMES = {
  megadrive: {
    name: "SEGA Mega Drive", layout: "television", artwork: "vector",
    image: [4000, 4000], crop: [80, 864, 3840, 2272],
    aspect: 4 / 3, screenColor: "#11111b", powerColor: "#9ded9d",
    keys: { ArrowUp: 4, ArrowDown: 5, ArrowLeft: 6, ArrowRight: 7,
      KeyZ: 1, KeyX: 0, KeyC: 8, KeyA: 10, KeyS: 9, KeyD: 11, Enter: 3, KeyV: 2 },
    buttons: [
      button("up", 4, 845, 1597, 217, 220), button("down", 5, 845, 2033, 217, 220),
      button("left", 6, 625, 1817, 220, 216), button("right", 7, 1062, 1817, 220, 216),
      button("A", 1, 2504.36, 1945.92, 348.43, 348.43),
      button("B", 0, 2857.94, 1759.25, 348.43, 348.43),
      button("C", 8, 3228.4, 1608.85, 348.43, 348.44),
      button("Start", 3, 2615, 1327, 340, 154, -25),
    ],
  },
  gb: {
    name: "Nintendo Game Boy", artwork: "vector", image: [588.30859, 959.73712], crop: [0, 0, 588.30859, 959.73712],
    screen: [142.379, 120.518, 301.025, 276.782], power: [81.266, 208.149, 15.152, 15.152],
    aspect: 10 / 9, screenColor: "#778b19", powerColor: "#f95448", keys: commonKeys,
    buttons: [
      button("up", 4, 99, 565, 49, 47), button("down", 5, 99, 658, 49, 47),
      button("left", 6, 54.63, 612, 45, 46), button("right", 7, 148, 612, 47, 46),
      button("A", 8, 465.627, 570.036, 68.69, 68.69), button("B", 0, 371.683, 612.462, 68.69, 68.69),
      button("Select", 2, 176.1, 755.15, 78, 30, -27.13), button("Start", 3, 272.5, 755.5, 78, 30, -27.13),
    ],
  },
  gbc: {
    name: "Nintendo Game Boy Color", artwork: "vector", image: [582, 984], crop: [0, 0, 582, 984],
    screen: [125.947, 91.618, 329.325, 288.956], power: [55.628, 166.681, 15.663, 15.663],
    aspect: 10 / 9, screenColor: "#343e36", powerColor: "#f95448", keys: commonKeys,
    buttons: [
      button("up", 4, 99.944, 574.958, 44.618, 48.877), button("down", 5, 99.944, 668.451, 44.618, 48.866),
      button("left", 6, 51.081, 623.835, 48.863, 44.616), button("right", 7, 144.562, 623.835, 48.867, 44.616),
      button("A", 8, 463.483, 600.298, 67.141, 67.139), button("B", 0, 354.377, 633.865, 67.147, 67.139),
      // Wider touch targets around the narrow rubber Start/Select buttons.
      button("Select", 2, 210.128, 790.633, 72, 44), button("Start", 3, 297.459, 790.633, 72, 44),
    ],
  },
  gba: {
    name: "Nintendo Game Boy Advance", artwork: "vector", image: [955, 545], crop: [0, 0, 955, 545],
    screen: [274.498, 108.18, 407.127, 265.31], power: [771.442, 84.902, 17.562, 17.56],
    aspect: 3 / 2, screenColor: "#17232b", powerColor: "#62dd5a", keys: { ...commonKeys, KeyQ: 10, KeyE: 11 },
    buttons: [
      button("up", 4, 110.96, 162.178, 41.073, 38.843), button("down", 5, 110.96, 242.095, 41.073, 38.843),
      button("left", 6, 72.117, 201.02, 38.843, 41.075), button("right", 7, 152.033, 201.02, 38.843, 41.075),
      button("A", 8, 838.888, 174.618, 59.8, 59.8), button("B", 0, 754.597, 202.712, 59.8, 59.8),
      // Extend the small Start/Select targets without covering adjacent controls.
      button("Select", 2, 173.29, 382.108, 44, 44), button("Start", 3, 173.29, 329.231, 44, 44),
      button("L", 10, 37, 34, 172, 40, -14), button("R", 11, 746, 34, 172, 40, 14),
    ],
  },
};

export const gameConsoleFrame = systemId => Object.hasOwn(GAME_CONSOLE_FRAMES, systemId) ? GAME_CONSOLE_FRAMES[systemId] : null;

export function frameRectangle(frame, [x, y, width, height]) {
  const [left, top, cropWidth, cropHeight] = frame.crop;
  return { left: `${(x - left) / cropWidth * 100}%`, top: `${(y - top) / cropHeight * 100}%`,
    width: `${width / cropWidth * 100}%`, height: `${height / cropHeight * 100}%` };
}

export function frameVariables(frame) {
  return { "--device-ratio": frame.crop[2] / frame.crop[3], "--screen-ratio": frame.aspect,
    "--screen-color": frame.screenColor, "--power-color": frame.powerColor };
}
