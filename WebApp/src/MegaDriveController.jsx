import React from "react";
import controller from "./assets/megadrive-controller.svg?raw";

// Audited local artwork: button faces, lettering and the D-pad move together.
const markup = { __html: controller };

export default function MegaDriveController({ pressedInputs }) {
  return <div className="mega-drive-vector" aria-hidden="true"
    data-a={pressedInputs.has(1)} data-b={pressedInputs.has(0)} data-c={pressedInputs.has(8)}
    data-start={pressedInputs.has(3)}
    data-dpad={[4, 5, 6, 7].some(input => pressedInputs.has(input))}
    style={{ "--pad-x": `${10 * (Number(pressedInputs.has(7)) - Number(pressedInputs.has(6)))}px`,
      "--pad-y": `${10 * (Number(pressedInputs.has(5)) - Number(pressedInputs.has(4)))}px` }}
    dangerouslySetInnerHTML={markup} />;
}
