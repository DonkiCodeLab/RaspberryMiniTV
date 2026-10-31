import { portraitTransform, evolutionFrameAt } from './photoEvolution.js';

const aborted = () => new DOMException('Cancelled', 'AbortError');
export function loadEvolutionImage(url, signal) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => { image.onload = image.onerror = null; signal?.removeEventListener('abort', cancel); };
    const cancel = () => { cleanup(); image.src = ''; reject(aborted()); };
    image.crossOrigin = 'anonymous'; image.decoding = 'async';
    image.onload = () => { cleanup(); resolve(image); };
    image.onerror = () => { cleanup(); reject(new Error('image')); };
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener('abort', cancel, { once: true });
    image.src = url;
  });
}

export function makeEvolutionPortrait(image, box, eyes) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = '#13202a'; context.fillRect(0, 0, 512, 512);
  const { matrix, alignment } = portraitTransform(image.naturalWidth, image.naturalHeight, box, eyes);
  context.setTransform(...matrix);
  context.drawImage(image, 0, 0);
  return { canvas, alignment };
}

export function drawEvolution(canvas, frames, position, { reducedMotion = false, caption = false, name = '' } = {}) {
  if (!canvas || !frames.length) return;
  const context = canvas.getContext('2d'), size = canvas.width;
  const { from, to, blend } = evolutionFrameAt(position, frames.length, reducedMotion);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.globalAlpha = 1;
  context.drawImage(frames[from].canvas, 0, 0, size, size);
  if (blend) { context.globalAlpha = blend; context.drawImage(frames[to].canvas, 0, 0, size, size); context.globalAlpha = 1; }
  if (caption) {
    const frame = frames[blend >= .5 ? to : from];
    context.fillStyle = '#0d1922'; context.fillRect(0, size, size, canvas.height - size);
    context.textAlign = 'center'; context.fillStyle = '#eed7a7'; context.font = '22px sans-serif';
    context.fillText(name, size / 2, size + 32, size - 40);
    context.fillStyle = '#fff'; context.font = '18px sans-serif';
    context.fillText(`${frame.ageLabel} · ${frame.dateLabel}`, size / 2, size + 63, size - 40);
  }
}

export function evolutionVideoType() {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return '';
  return ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type)) || '';
}

// Record locally in real time. No image, frame or video leaves this browser.
export function exportEvolutionVideo(frames, seconds, name, signal, onProgress, reducedMotion = false) {
  return new Promise((resolve, reject) => {
    const mimeType = evolutionVideoType();
    if (!mimeType) { reject(new Error('unsupported')); return; }
    if (signal.aborted) { reject(aborted()); return; }
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 596;
    drawEvolution(canvas, frames, 0, { caption: true, name, reducedMotion });
    let stream, recorder, raf, settled = false;
    const chunks = [];
    const cleanup = () => { cancelAnimationFrame(raf); signal.removeEventListener('abort', cancel); document.removeEventListener('visibilitychange', hidden); stream?.getTracks().forEach(track => track.stop()); };
    const fail = error => {
      if (settled) return; settled = true;
      if (recorder?.state === 'recording') recorder.stop();
      cleanup(); reject(error);
    };
    const cancel = () => fail(aborted());
    // Background tabs throttle animation; never silently produce a broken video.
    const hidden = () => { if (document.hidden) fail(new Error('hidden')); };
    try {
      stream = canvas.captureStream(30);
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => fail(new Error('recording'));
      recorder.onstop = () => {
        if (settled) return; settled = true; cleanup();
        resolve({ blob: new Blob(chunks, { type: mimeType }), extension: mimeType.startsWith('video/mp4') ? 'mp4' : 'webm' });
      };
      signal.addEventListener('abort', cancel, { once: true });
      document.addEventListener('visibilitychange', hidden);
      recorder.start();
      const start = performance.now(), duration = frames.length * seconds * 1000;
      const step = now => {
        if (settled) return;
        const elapsed = now - start;
        drawEvolution(canvas, frames, Math.min(frames.length - 1, elapsed / (seconds * 1000)), { caption: true, name, reducedMotion });
        onProgress(Math.min(100, Math.round(elapsed / duration * 100)));
        if (elapsed >= duration) recorder.stop();
        else raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    } catch (error) { fail(error); }
  });
}
