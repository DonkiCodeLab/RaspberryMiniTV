import { hashPhoto } from './photoHash.js';

self.onmessage = async ({ data: file }) => {
  try {
    const digest = await hashPhoto(file, (done, total) => self.postMessage({ done, total }));
    self.postMessage({ digest });
  } catch (error) {
    self.postMessage({ error: `${file.name}: ${error.message}` });
  }
};
