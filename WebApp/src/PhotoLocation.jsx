import React, { Component, lazy, Suspense, useEffect, useRef, useState } from 'react';
import { photoRequest } from './api/raspberryApi.js';
import { hasLocation } from './photoLibrary.js';
import PhotoDetailDialog from './PhotoDetailDialog.jsx';
import PhotoPlace, { PlaceLabel, usePhotoPlace } from './PhotoPlace.jsx';
import { placeLabel } from './photoPlaces.js';
import './PhotoLocation.css';

const PhotoLocationMap = lazy(() => import('./PhotoLocationMap.jsx'));

class MapErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="alert" className="photo-alert">{this.props.s.locationMapError}</p> : this.props.children; }
}

export function PhotoLocationDialog({ photo, s, language, previewUrl, onClose, onChanged, onSave }) {
  const initialPosition = () => hasLocation(photo) ? { latitude: String(photo.latitude), longitude: String(photo.longitude) } : { latitude: '', longitude: '' };
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(initialPosition);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const saving = useRef(false);
  const position = editing ? { latitude: draft.latitude.trim() === '' ? null : Number(draft.latitude), longitude: draft.longitude.trim() === '' ? null : Number(draft.longitude) } : photo;
  const valid = hasLocation(position);
  const place = usePhotoPlace(position);
  const cancel = () => { setEditing(false); setDraft(initialPosition()); setError(''); };
  async function save(event) {
    event.preventDefault();
    if (saving.current || !valid) return;
    saving.current = true; setBusy(true); setError('');
    try {
      const patch = { latitude: position.latitude, longitude: position.longitude };
      const result = onSave ? await onSave(patch) : await photoRequest(`photos/${photo.id}/metadata`, patch);
      await onChanged(result.metadata); setEditing(false);
    } catch (error) { setError(error.message); }
    finally { saving.current = false; setBusy(false); }
  }
  return <PhotoDetailDialog title={photo.title || photo.name} subtitle={s.photoLocation} s={s} busy={busy} onClose={editing ? cancel : onClose}>
    {onChanged && !editing && <button type="button" className="dialog-button photo-location-edit" onClick={() => { setDraft(initialPosition()); setEditing(true); }}>{hasLocation(photo) ? s.editPhotoLocation : s.addPhotoLocation}</button>}
    <MapErrorBoundary s={s}><Suspense fallback={<p className="photo-location-loading" role="status">{s.loadingPhotoMap}</p>}>
      <PhotoLocationMap photo={photo} s={s} language={language} previewUrl={previewUrl} editing={editing && !busy} position={valid ? position : null} placeLabel={placeLabel(place, language)}
        onPositionChange={point => setDraft({ latitude: String(Number(point.latitude.toFixed(6))), longitude: String(Number(point.longitude.toFixed(6))) })} />
    </Suspense></MapErrorBoundary>
    <div className="photo-location-place" aria-live="polite"><PlaceLabel place={place} language={language} />
      {valid && (!place || place.status === 'busy' && place.retryAfter <= 5) && <span>{s.loadingPhotoPlace}</span>}
      {valid && place && (['unavailable', 'not_found'].includes(place.status) || place.status === 'busy' && place.retryAfter > 5) && <span>{s.photoPlaceUnavailable}</span>}</div>
    {editing ? <form onSubmit={save}>
      <p className="photo-location-edit-hint">{s.editPhotoLocationHint}</p>
      <div className="photo-location-fields">{['latitude', 'longitude'].map(key => <label key={key} className="photo-detail-field">{s[key]}
        <input type="number" required step="any" min={key === 'latitude' ? -90 : -180} max={key === 'latitude' ? 90 : 180} value={draft[key]} disabled={busy}
          onChange={event => setDraft(previous => ({ ...previous, [key]: event.target.value }))} /></label>)}</div>
      {error && <p role="alert" className="dialog-error">{error}</p>}
      <footer className="photo-detail-actions"><button type="button" className="dialog-button" disabled={busy} onClick={cancel}>{s.cancel}</button>
        <button type="submit" className="dialog-button dialog-button--accent" disabled={busy || !valid}>{busy ? s.savingPhotoDetails : s.savePhotoLocation}</button></footer>
    </form> : <div className="photo-location-dialog__coordinates">{hasLocation(photo) ? `⌖ ${photo.latitude.toFixed(4)}°, ${photo.longitude.toFixed(4)}°` : s.noGps}</div>}
  </PhotoDetailDialog>;
}

export default function PhotoLocation({ photo, s, language, previewUrl, precision = 4, className = '', onChanged, onSave, disabled = false, showLabel = false, initialOpen = false, resolvePlace = false }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (initialOpen) setOpen(true); }, []);
  if (!hasLocation(photo) && !onChanged) return <span>{`⌖ ${s.noGps}`}</span>;
  return <span className={`photo-location ${className}`}>
    <PhotoPlace position={photo} language={language} enabled={resolvePlace && !open} />
    <span>{hasLocation(photo) ? `⌖ ${photo.latitude.toFixed(precision)}°, ${photo.longitude.toFixed(precision)}°` : `⌖ ${s.noGps}`}</span>
    <button type="button" disabled={disabled} className={showLabel ? 'photo-detail-link' : 'photo-location-button'} aria-label={`${s.showPhotoMap}: ${photo.title || photo.name}`}
      title={s.showPhotoMap} aria-haspopup="dialog" onClick={event => { event.stopPropagation(); setOpen(true); }}>
      {showLabel ? s.showPhotoMap : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15" /></svg>}
    </button>
    {open && <PhotoLocationDialog photo={photo} s={s} language={language} previewUrl={previewUrl} onChanged={onChanged} onSave={onSave} onClose={() => setOpen(false)} />}
  </span>;
}
