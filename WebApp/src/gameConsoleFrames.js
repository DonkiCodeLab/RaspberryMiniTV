// All rectangles use pixels in the original header photographs. The crop only
// removes transparent margins; the screen and buttons scale with the photograph.
const commonKeys = { ArrowUp: 4, ArrowDown: 5, ArrowLeft: 6, ArrowRight: 7, KeyZ: 8, KeyX: 0, KeyV: 2, Enter: 3 };
const button = (name, input, x, y, w, h, rotation = 0) => ({ name, input, x, y, w, h, rotation });

export const GAME_CONSOLE_FRAMES = {
  megadrive: {
    name: "SEGA Mega Drive", layout: "television", image: [1080, 564], crop: [0, 0, 1080, 564],
    aspect: 4 / 3, screenColor: "#11111b", powerColor: "#9ded9d",
    keys: { ArrowUp: 4, ArrowDown: 5, ArrowLeft: 6, ArrowRight: 7,
      KeyZ: 1, KeyX: 0, KeyC: 8, KeyA: 10, KeyS: 9, KeyD: 11, Enter: 3, KeyV: 2 },
    buttons: [
      button("up", 4, 255, 156, 47, 69), button("down", 5, 255, 269, 47, 62),
      button("left", 6, 190, 222, 67, 47), button("right", 7, 302, 222, 66, 47),
      button("A", 1, 675, 292, 82, 82), button("B", 0, 770, 240, 82, 82),
      button("C", 8, 869, 208, 86, 86), button("X", 10, 650, 194, 66, 66),
      button("Y", 9, 728, 154, 66, 66), button("Z", 11, 816, 134, 66, 66),
      button("Start", 3, 484, 205, 85, 33),
      button("Mode", 2, 490, 17, 100, 32),
    ],
  },
  gb: {
    name: "Nintendo Game Boy", image: [1080, 957], crop: [250, 0, 600, 957],
    screen: [399, 134, 304, 274], power: [338.5, 222, 14.4, 14.4],
    aspect: 10 / 9, screenColor: "#778b19", powerColor: "#f95448", keys: commonKeys,
    buttons: [
      button("up", 4, 357, 576, 53, 49), button("down", 5, 357, 665, 53, 51),
      button("left", 6, 310, 621, 50, 51), button("right", 7, 405, 621, 50, 51),
      button("A", 8, 721, 582, 72, 72), button("B", 0, 628, 624, 72, 72),
      button("Select", 2, 435, 766, 77, 34, -27), button("Start", 3, 532, 766, 77, 34, -27),
    ],
  },
  gbc: {
    name: "Nintendo Game Boy Color", image: [2048, 1810], crop: [474, 0, 1100, 1810],
    screen: [733, 197, 543, 510], power: [595, 342, 27, 27],
    aspect: 10 / 9, screenColor: "#343e36", powerColor: "#f95448", keys: commonKeys,
    buttons: [
      button("up", 4, 669, 1053, 92, 88), button("down", 5, 669, 1214, 92, 89),
      button("left", 6, 590, 1131, 84, 94), button("right", 7, 756, 1131, 84, 94),
      button("A", 8, 1303, 1083, 132, 132), button("B", 0, 1117, 1139, 137, 137),
      button("Select", 2, 874, 1442, 110, 61), button("Start", 3, 1023, 1442, 110, 61),
    ],
  },
  gba: {
    name: "Nintendo Game Boy Advance", image: [1080, 709], crop: [24, 60, 1032, 600],
    screen: [330, 193, 410, 270], power: [839, 170, 14, 16],
    aspect: 3 / 2, screenColor: "#17232b", powerColor: "#62dd5a", keys: { ...commonKeys, KeyQ: 10, KeyE: 11 },
    buttons: [
      button("up", 4, 153, 248, 45, 48), button("down", 5, 153, 326, 45, 46),
      button("left", 6, 114, 288, 46, 42), button("right", 7, 194, 288, 47, 42),
      button("A", 8, 900, 260, 70, 71), button("B", 0, 812, 291, 70, 70),
      button("Select", 2, 222, 479, 42, 43), button("Start", 3, 222, 424, 42, 43),
      button("L", 10, 91, 108, 176, 47, -13), button("R", 11, 811, 113, 176, 47, 13),
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
