import React, { useEffect, useRef, useState } from 'react';
import { photoRequest } from './api/raspberryApi.js';
import PhotoDetailDialog from './PhotoDetailDialog.jsx';
import PhotoLocation from './PhotoLocation.jsx';
import { dateLabel, photoDateValue, validPhotoDate } from './photoMetadata.js';

function PhotoDateDialog({ photo, s, onSaved, onClose }) {
  const [date, setDate] = useState(() => photoDateValue(photo.takenAt));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const saving = useRef(false);
  async function save(event) {
    event.preventDefault();
    if (saving.current || !validPhotoDate(date)) return;
    saving.current = true; setBusy(true); setError('');
    try {
      const result = await photoRequest(`photos/${photo.id}/metadata`, { takenAt: date });
      await onSaved(result.metadata); onClose();
    } catch (error) { setError(error.message); }
    finally { saving.current = false; setBusy(false); }
  }
  return <PhotoDetailDialog title={photo.title || photo.name} subtitle={s.editPhotoDate} s={s} busy={busy} onClose={onClose} className="photo-date-dialog">
    <form onSubmit={save}>
      <label className="photo-detail-field">{s.photoDate}<input autoFocus type="date" required min="0001-01-01" max="9999-12-31" value={date}
        disabled={busy} onChange={event => setDate(event.target.value)} /></label>
      {error && <p role="alert" className="dialog-error">{error}</p>}
      <footer className="photo-detail-actions"><button type="button" className="dialog-button" disabled={busy} onClick={onClose}>{s.cancel}</button>
        <button type="submit" className="dialog-button dialog-button--accent" disabled={busy || !validPhotoDate(date)}>{busy ? s.savingPhotoDetails : s.savePhotoDate}</button></footer>
    </form>
  </PhotoDetailDialog>;
}

export default function PhotoMeta({ photo, s, language, onChanged, disabled = false, initialDetail }) {
  const [editingDate, setEditingDate] = useState(false), [saved, setSaved] = useState(null);
  useEffect(() => { if (initialDetail === 'date') setEditingDate(true); }, []);
  const current = saved?.source === photo ? { ...photo, ...saved.metadata } : photo;
  const changed = async metadata => { setSaved({ source: photo, metadata }); await onChanged?.(); };
  return <div className="photo-meta">
    <span className="photo-date"><span title={s.taken}>◷ {dateLabel(current.takenAt, language, s.noDate)}</span>
      {onChanged && <button type="button" className="photo-detail-link" disabled={disabled} aria-haspopup="dialog" onClick={() => setEditingDate(true)}>{s.editPhotoDate}</button>}</span>
    <PhotoLocation key={photo.id} photo={current} s={s} language={language} onChanged={onChanged ? changed : undefined} disabled={disabled} showLabel={!!onChanged} initialOpen={initialDetail === 'location'} />
    {editingDate && <PhotoDateDialog photo={current} s={s} onSaved={changed} onClose={() => setEditingDate(false)} />}
  </div>;
}
