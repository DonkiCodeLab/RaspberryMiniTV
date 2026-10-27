import React, { useRef, useState } from 'react';
import PhotoFaceViewer, { PersonFaceControls } from './PhotoFaceViewer.jsx';
import { personPreviewFaces, personPreviewPhotos } from './photoPersonPreview.js';
import PhotoMeta from './PhotoMeta.jsx';

export default function PersonPhotoDialog({ Modal, person, photosById, people, globalFaces, revision, onChanged, s, language, onClose, initialPhotoId, initialEditing = false, initialDetail }) {
  // Keep the browsing session open when correcting its main person's last face.
  const [photoIds] = useState(() => personPreviewPhotos(person, photosById).map(photo => photo.id));
  const photos = photoIds.map(id => photosById.get(id)).filter(Boolean);
  const [photoId, setPhotoId] = useState(() => initialPhotoId || photos[0]?.id);
  const [showOtherFaces, setShowOtherFaces] = useState(initialEditing), [editing, setEditing] = useState(initialEditing);
  const [interaction, setInteraction] = useState({ busy: false, editing: false });
  const closeLayer = useRef(null), locked = interaction.busy || interaction.editing;
  const index = Math.max(0, photos.findIndex(photo => photo.id === photoId));
  const photo = photos[index];
  const faces = photo ? personPreviewFaces(person, photo.id) : [];
  const move = direction => { if (!locked && photos.length > 1) setPhotoId(photos[(index + direction + photos.length) % photos.length].id); };
  return <Modal title={`${s.personPhotoPreview}: ${person.name}`} s={s} busy={interaction.busy} onClose={() => { if (!closeLayer.current?.()) onClose(); }} wide className={`photo-dialog--viewer photo-dialog--person-preview${editing ? ' is-editing-faces' : ''}`}
    onKeyDown={event => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.target.closest?.('input, select, textarea, [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1);
      }
    }}>
    {photo ? <>
      <PersonFaceControls showOtherFaces={showOtherFaces} onShowOtherFaces={setShowOtherFaces} editing={editing} disabled={locked} s={s}
        onEditing={value => { setEditing(value); if (value) setShowOtherFaces(true); }} />
      <div className={`photo-viewer photo-person-preview__viewer${photos.length < 2 ? ' is-single' : ''}`}>
        {photos.length > 1 && <button type="button" className="photo-person-preview__nav" disabled={locked} aria-label={s.previous} title={s.previous} onClick={() => move(-1)}>‹</button>}
        <PhotoFaceViewer key={photo.id} photo={photo} initialFaces={faces} highlightPersonId={person.id} showOtherFaces={showOtherFaces} editing={editing}
          people={people} globalFaces={globalFaces} revision={revision} onChanged={onChanged} onInteractionChange={setInteraction} closeLayer={closeLayer} s={s} />
        {photos.length > 1 && <button type="button" className="photo-person-preview__nav" disabled={locked} aria-label={s.next} title={s.next} onClick={() => move(1)}>›</button>}
      </div>
      <div className="photo-person-preview__caption" role="status"><strong>{index + 1} / {photos.length}</strong><span>{photo.title || photo.name}</span></div>
      <PhotoMeta key={photo.id} photo={photo} s={s} language={language} onChanged={onChanged} disabled={locked} initialDetail={photo.id === initialPhotoId ? initialDetail : undefined} />
      {!editing && <p>{s.personPhotoBrowseHint}</p>}
    </> : <p>{s.empty}</p>}
  </Modal>;
}
