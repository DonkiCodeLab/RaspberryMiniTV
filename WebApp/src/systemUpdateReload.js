// A completed update from an earlier visit must not trigger a reload loop.
export function createSystemUpdateReload(reload) {
  let running = false;
  return state => {
    if (state === "running") running = true;
    else if (state === "failed") running = false;
    else if (state === "succeeded" && running) {
      running = false;
      reload();
    }
  };
}
