import { editBox, visibleBox, imageEditPreview } from '../photoImageEdits.js';

export const demoFaceVersion = (library, id) => JSON.stringify(library.manualFaces?.[id] || []);

// The local demo supports image-only commits from the shared photo viewer.
export async function editDemoImage(library, data, render = renderImage) {
  const item = data.photos?.[0];
  if (typeof data.requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(data.requestId) ||
      data.photos?.length !== 1 || data.people?.length !== 0 || !item || item.delete !== false ||
      item.changes?.length !== 0 || item.reviewIds?.length !== 0 || item.albums || item.metadata ||
      !Array.isArray(item.edits) || !item.edits.length || item.edits.length > 50) throw new Error('Conecta la Raspberry para usar esta función.');
  const payload = JSON.stringify(data), receipt = library.imageEditBatches?.[data.requestId];
  if (receipt) {
    if (receipt !== payload) throw new Error('Esta edición ya se guardó con otros cambios.');
    return { ok: true, applied: 1 };
  }
  const photo = library.photos.find(photo => photo.id === item.photoId);
  if (!photo?.blob || photo.relativePath !== item.expectedPath || demoFaceVersion(library, photo.id) !== item.version)
    throw new Error('La foto ha cambiado. Cierra el editor y vuelve a abrirla.');
  for (const edit of item.edits) {
    const box = edit?.crop;
    const valid = edit && Object.keys(edit).length === 1 && (
      Number.isInteger(edit.rotate) && Math.abs(edit.rotate) === 1 ||
      Number.isFinite(edit.scale) && edit.scale >= .1 && edit.scale <= 2 ||
      box && Object.keys(box).length === 4 && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(box[key])) &&
        box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0 && box.x + box.width <= 1.000001 && box.y + box.height <= 1.000001);
    if (!valid) throw new Error('Edición de imagen inválida.');
  }
  const image = await render(photo.blob, item.edits);
  library.imageEditSources ||= {};
  (library.imageEditSources[photo.id] ||= []).push({ path: photo.relativePath, blob: photo.blob });
  Object.assign(photo, image, { relativePath: `edited-photos/${data.requestId}.jpg`, name: photo.name.replace(/\.[^.]+$/, '') + '.jpg' });
  library.manualFaces ||= {};
  library.manualFaces[photo.id] = (library.manualFaces[photo.id] || []).flatMap(face => {
    const box = visibleBox(editBox(face.box, item.edits));
    return face.box && !box ? [] : [{ ...face, box }];
  });
  for (const person of library.people) {
    if (person.photoIds.includes(photo.id) && !library.manualFaces[photo.id].some(face => face.personId === person.id))
      person.photoIds = person.photoIds.filter(id => id !== photo.id);
  }
  library.imageEditBatches ||= {};
  library.imageEditBatches[data.requestId] = payload;
  return { ok: true, applied: 1 };
}

async function renderImage(blob, edits) {
  const url = URL.createObjectURL(blob);
  try {
    const result = await imageEditPreview(url, edits, { preview: false });
    const edited = await (await fetch(result)).blob();
    const image = new Image(); image.src = result; await image.decode();
    return { blob: edited, width: image.naturalWidth, height: image.naturalHeight, size: edited.size };
  } finally { URL.revokeObjectURL(url); }
}
