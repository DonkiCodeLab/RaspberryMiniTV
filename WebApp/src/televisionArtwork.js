// Wait for the rendered image to be decoded, and ignore completions from a
// previous selection (including a selection made again while loading).
export function observeTelevisionImage(image, onSettled) {
  let active = true;
  const cleanup = () => {
    active = false;
    image.removeEventListener("load", loaded);
    image.removeEventListener("error", failed);
  };
  const finish = status => {
    if (!active) return;
    cleanup();
    onSettled(status);
  };
  const loaded = () => {
    if (!image.decode) finish(image.naturalWidth > 0 ? "ready" : "error");
  };
  const failed = () => finish("error");
  image.addEventListener("load", loaded);
  image.addEventListener("error", failed);
  if (image.decode) image.decode().then(() => finish("ready"), failed);
  else if (image.complete) loaded();
  return cleanup;
}
