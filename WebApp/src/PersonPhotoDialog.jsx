import React, { useState } from 'react';
import PhotoViewerImage from './PhotoViewerImage.jsx';
import { personPreviewFaces, personPreviewPhotos } from './photoPersonPreview.js';

export default function PersonPhotoDialog({ Modal, person, photosById, s, onClose }) {
  const photos = personPreviewPhotos(person, photosById);
  const [photoId, setPhotoId] = useState(() => photos[0]?.id);
  const index = Math.max(0, photos.findIndex(photo => photo.id === photoId));
  const photo = photos[index];
  const faces = photo ? personPreviewFaces(person, photo.id) : [];
  const move = direction => { if (photos.length > 1) setPhotoId(photos[(index + direction + photos.length) % photos.length].id); };
  return <Modal title={`${s.personPhotoPreview}: ${person.name}`} s={s} onClose={onClose} wide className="photo-dialog--person-preview"
    onKeyDown={event => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1);
      }
    }}>
    {photo ? <>
      <div className="photo-viewer">
        <button type="button" aria-label={s.previous} disabled={photos.length < 2} onClick={() => move(-1)}>‹</button>
        <PhotoViewerImage key={photo.id} photo={photo} faces={faces} highlightPersonId={person.id} readOnlyFaces s={s} />
        <button type="button" aria-label={s.next} disabled={photos.length < 2} onClick={() => move(1)}>›</button>
      </div>
      <div className="photo-person-preview__caption" role="status"><strong>{index + 1} / {photos.length}</strong><span>{photo.title || photo.name}</span></div>
      <p>{faces.length ? s.personPhotoPreviewHint : s.faceBoxesMissing}</p>
    </> : <p>{s.empty}</p>}
  </Modal>;
}
