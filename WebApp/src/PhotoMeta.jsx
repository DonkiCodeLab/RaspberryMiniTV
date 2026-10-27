import React, { useEffect, useRef, useState } from 'react';
import { photoRequest } from './api/raspberryApi.js';
import PhotoDetailDialog from './PhotoDetailDialog.jsx';
import PhotoLocation from './PhotoLocation.jsx';
import { dateLabel, photoDateValue, validPhotoDate } from './photoMetadata.js';

function PhotoDateDialog({ photo, s, onSaved, onSave, onClose }) {
  const [date, setDate] = useState(() => photoDateValue(photo.takenAt));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const saving = useRef(false);
  async function save(event) {
    event.preventDefault();
    if (saving.current || !validPhotoDate(date)) return;
    saving.current = true; setBusy(true); setError('');
    try {
      const result = onSave ? await onSave({ takenAt: date }) : await photoRequest(`photos/${photo.id}/metadata`, { takenAt: date });
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

// onSave lets batch review stage date/GPS corrections until its atomic commit.
export default function PhotoMeta({ photo, s, language, onChanged, onSave, compact = false, disabled = false, initialDetail, resolvePlace = false }) {
  const [editingDate, setEditingDate] = useState(false), [saved, setSaved] = useState(null);
  useEffect(() => { if (initialDetail === 'date') setEditingDate(true); }, []);
  const current = saved?.source === photo ? { ...photo, ...saved.metadata } : photo;
  const changed = async metadata => { setSaved({ source: photo, metadata }); await onChanged?.(); };
  const editable = !!(onChanged || onSave), date = `◷ ${dateLabel(current.takenAt, language, s.noDate)}`;
  return <div className="photo-meta">
    <span className="photo-date">{compact && editable ? <button type="button" className="photo-detail-link" title={s.editPhotoDate} aria-label={`${s.editPhotoDate}: ${date}`}
      disabled={disabled} aria-haspopup="dialog" onClick={() => setEditingDate(true)}>{date}</button> : <><span title={s.taken}>{date}</span>
      {editable && <button type="button" className="photo-detail-link" disabled={disabled} aria-haspopup="dialog" onClick={() => setEditingDate(true)}>{s.editPhotoDate}</button>}</>}</span>
    <PhotoLocation key={photo.id} photo={current} s={s} language={language} onChanged={editable ? changed : undefined} onSave={onSave} disabled={disabled} showLabel={editable && !compact} initialOpen={initialDetail === 'location'} resolvePlace={resolvePlace} />
    {editingDate && <PhotoDateDialog photo={current} s={s} onSaved={changed} onSave={onSave} onClose={() => setEditingDate(false)} />}
  </div>;
}
