// The 600px thumbnail keeps the entire oriented image; tiny gallery tiles are cropped.
export const REVIEW_IMAGE_RENDER = 'thumb';

// Warm only two images, sequentially and after the current photo is ready.
// Keep their decoded data while this card is open, without retaining a whole batch.
export function preloadReviewImages(urls, createImage = () => new Image()) {
  const pending = [...new Set(urls.filter(Boolean))].slice(0, 2), images = [];
  let stopped = false;
  const next = () => {
    if (stopped || !pending.length) return;
    const image = createImage();
    images.push(image);
    image.decoding = 'async'; image.fetchPriority = 'low';
    image.onload = image.onerror = () => {
      image.onload = image.onerror = null;
      next();
    };
    image.src = pending.shift();
  };
  next();
  return () => {
    stopped = true;
    for (const image of images) {
      image.onload = image.onerror = null;
      image.removeAttribute('src');
    }
  };
}
