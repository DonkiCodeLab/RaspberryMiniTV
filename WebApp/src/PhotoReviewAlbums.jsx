import React, { useEffect, useState } from 'react';
import { reviewAlbumKey, validReviewAlbumName } from './photoReviewWizard.js';

// Album references share the photo draft, including undo, resume and step validation.
export default function PhotoReviewAlbums({ photo, options, albums, onChange, onEditing, closeLayer, disabled, s }) {
  const [creating, setCreating] = useState(false), [name, setName] = useState('');
  const memberships = new Set([photo.folderId, ...(photo.folderIds || [])].filter(Boolean));
  const staged = new Set(albums.map(reviewAlbumKey));
  const present = option => memberships.has(option.assignment.folderId) || staged.has(option.id) ||
    option.parent === 'albums' && albums.some(album => album.name?.trim().toLowerCase() === option.name.trim().toLowerCase());
  const label = option => option.pending ? s.reviewDraftAlbum.replace('{name}', option.label) : option.label;
  const close = () => { setCreating(false); setName(''); };
  useEffect(() => { onEditing(creating); }, [creating, onEditing]);
  useEffect(() => {
    closeLayer.current = () => { if (!creating) return false; close(); return true; };
    return () => { closeLayer.current = null; };
  }, [creating, closeLayer]);
  function add(assignment) {
    if (!staged.has(reviewAlbumKey(assignment)) && !memberships.has(assignment.folderId)) onChange([...albums, assignment]);
    close();
  }
  function create(event) {
    event.preventDefault();
    if (disabled || !validReviewAlbumName(name)) return;
    const existing = options.find(option => option.parent === 'albums' && option.name.trim().toLowerCase() === name.trim().toLowerCase());
    add(existing?.assignment || { name: name.trim() });
  }
  return <div className="photo-review-albums" role="group" aria-label={s.personalAlbums}>
    {creating ? <form className="photo-review-albums__create" onSubmit={create}>
      <input aria-label={s.reviewAlbumName} placeholder={s.reviewAlbumName} maxLength={100} value={name} autoFocus disabled={disabled}
        onChange={event => setName(event.target.value)} />
      <button type="submit" className="dialog-button dialog-button--accent" disabled={disabled || !validReviewAlbumName(name)}>{s.reviewAddAlbum}</button>
      <button type="button" className="dialog-button" onClick={close}>{s.cancel}</button>
    </form> : <select aria-label={s.reviewChooseAlbum} value="" disabled={disabled} onChange={event => {
      if (event.target.value === 'new') setCreating(true);
      else { const option = options.find(option => option.id === event.target.value); if (option) add(option.assignment); }
    }}>
      <option value="" disabled>{s.reviewChooseAlbum}</option><option value="new">＋ {s.reviewNewAlbum}</option>
      {options.map(option => <option key={option.id} value={option.id} disabled={present(option)}>{label(option)}</option>)}
    </select>}
    <div className="photo-review-albums__links">
      {options.filter(option => memberships.has(option.assignment.folderId)).map(option => <span key={option.id} title={option.label}>✓ {option.label}</span>)}
      {albums.map(album => {
        const key = reviewAlbumKey(album), option = options.find(option => option.id === key), title = option?.label || album.name || s.personalAlbums;
        return <button type="button" key={key} disabled={disabled} title={s.reviewUndoAlbum.replace('{name}', title)}
          aria-label={s.reviewUndoAlbum.replace('{name}', title)} onClick={() => onChange(albums.filter(item => reviewAlbumKey(item) !== key))}>＋ {title} ×</button>;
      })}
    </div>
  </div>;
}
