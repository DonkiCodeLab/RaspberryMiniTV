import React, { useState } from 'react';
import { personPreviewPhotos } from './photoPersonPreview.js';

export default function PersonPhotoDialog({ Viewer, person, photosById, people, folders, globalFaces, revision, onChanged, s, language, onClose, initialPhotoId, initialEditing = false, initialDetail }) {
  // Keep the browsing session open when correcting its main person's last face.
  const [photos] = useState(() => personPreviewPhotos(person, photosById));
  const initial = Math.max(0, photos.findIndex(photo => photo.id === initialPhotoId));
  return <Viewer photos={photos} initial={initial} livePhotos={photosById} people={people} folders={folders}
    faces={globalFaces} revision={revision} onChanged={onChanged} s={s} language={language} onClose={onClose}
    highlightPersonId={person.id} highlightPersonName={person.name} previewPerson={person}
    initialEditing={initialEditing} initialDetail={initialDetail} />;
}
