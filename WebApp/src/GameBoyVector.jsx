import React from "react";
import gameBoy from "./assets/gameboy-vector.svg?raw";
import gameBoyColor from "./assets/gameboy-color-vector.svg?raw";
import gameBoyAdvance from "./assets/gameboy-advance-vector.svg?raw";

// Static, audited local SVG. Button faces are independent data-part groups.
const markup = { gb: { __html: gameBoy }, gbc: { __html: gameBoyColor }, gba: { __html: gameBoyAdvance } };

export default function GameBoyVector({ systemId, pressedInputs, ready }) {
  return <div className="gameboy-vector" aria-hidden="true"
    data-a={pressedInputs.has(8)} data-b={pressedInputs.has(0)}
    data-start={pressedInputs.has(3)} data-select={pressedInputs.has(2)}
    data-l={pressedInputs.has(10)} data-r={pressedInputs.has(11)}
    data-dpad={[4, 5, 6, 7].some(input => pressedInputs.has(input))} data-ready={ready}
    style={{ "--pad-x": `${3 * (Number(pressedInputs.has(7)) - Number(pressedInputs.has(6)))}px`,
      "--pad-y": `${3 * (Number(pressedInputs.has(5)) - Number(pressedInputs.has(4)))}px` }}
    dangerouslySetInnerHTML={markup[systemId]} />;
}
