import React, { useRef, useState } from 'react';
import { photoAssignmentOptions } from './photoLibrary.js';
import { photoRequest } from './api/raspberryApi.js';
import { peopleBatchCounts, peopleBatchDescription } from './photoPeopleBatch.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import PersonReviewPicker from './PersonReviewPicker.jsx';
import { focusPersonField } from './photoPeopleKeyboard.js';

export function NewPersonCardActions({ person, people, draft, entry, s, busy, onChange }) {
  const choices = photoAssignmentOptions(people, s).filter(other => other.id !== person.id);
  return <div className="photo-new-person-actions">
    <div className="photo-person-draft-field"><span>{s.mergeWith}</span><PersonReviewPicker choices={choices}
      label={`${s.mergeWith}: ${person.name}`} s={s} value={draft?.action === 'merge' ? draft.personId : ''} disabled={busy}
      onChange={personId => onChange(personId ? { action: 'merge', personId } : null)} /></div>
    <label className="photo-person-draft-field">{s.newPersonName}<input data-person-field="rename" value={draft?.action === 'rename' ? draft.name : ''}
      placeholder={s.faceNamePlaceholder} maxLength={100} disabled={busy} aria-label={`${s.newPersonName}: ${person.name}`}
      onChange={event => onChange(event.target.value ? { action: 'rename', name: event.target.value } : null)} /></label>
    <div className="photo-person-delete-options">
      {[['delete', s.deletePersonKeepPhotos], ['deletePhotos', s.deletePersonOriginals]].map(([action, label]) =>
        <label className="photo-new-person-check" key={action}><input type="checkbox" data-person-field={action} checked={draft?.action === action}
          disabled={busy || action === 'deletePhotos' && !person.photoIds?.length} aria-label={`${label}: ${person.name}`}
          onChange={event => onChange(event.target.checked ? { action } : null)} /><span>{label}</span></label>)}
    </div>
    {entry && <><p className={`photo-person-draft-note${entry.error ? ' is-error' : ''}`} role="status">
      {entry.error || `${s.batchPending}: ${peopleBatchDescription(entry, s)}`}</p>
      <button type="button" data-person-field="undo" className="photo-person-draft-reset" disabled={busy} onClick={event => {
        focusPersonField(event.currentTarget.closest('.photo-new-person-actions').querySelector('[data-person-field="merge"]'));
        onChange(null);
      }}>{s.undoPersonChange}</button></>}
  </div>;
}

export function NewPeopleToolbar({ entries, s, busy, onApply, onClear, onRemove }) {
  const counts = peopleBatchCounts(entries), invalid = entries.filter(entry => entry.error);
  return <div className="photo-people-toolbar photo-people-batch-toolbar">
    <div className="photo-people-batch-counts" role="status"><strong>{s.batchPendingCount.replace('{count}', entries.length)}</strong>
      <span>{s.batchCounts.replace('{rename}', counts.rename).replace('{merge}', counts.merge).replace('{delete}', counts.delete).replace('{photos}', counts.photos)}</span></div>
    <button type="button" className="dialog-button dialog-button--accent" disabled={busy || !entries.length || !!invalid.length}
      onClick={onApply}>{s.applyPeopleChanges.replace('{count}', entries.length)}</button>
    <button type="button" className="dialog-button" disabled={busy || !entries.length} onClick={onClear}>{s.discardPeopleChanges}</button>
    {!!invalid.length && <div className="photo-people-batch-errors" role="alert">{invalid.map(entry => <p key={entry.person.id}>
      <strong>{entry.person.name}</strong>: {entry.error} <button type="button" disabled={busy} onClick={() => onRemove(entry.person.id)}>{s.undoPersonChange}</button>
    </p>)}</div>}
  </div>;
}

export function PeopleBatchSummary({ entries, photosById, s }) {
  const counts = peopleBatchCounts(entries);
  return <>
    <p>{s.batchReviewHint}</p>
    <ul className="photo-people-confirm-list photo-people-batch-list" aria-label={s.affectedPeople}>
      {entries.map(entry => <li key={entry.person.id}><strong>{entry.person.name}</strong><span>{peopleBatchDescription(entry, s)}</span>
        {entry.payload.action === 'deletePhotos' && <details><summary>{s.batchPhotoList}</summary><ul>
          {entry.payload.photoIds.map(id => <li key={id}>{photosById.get(id)?.name || id}</li>)}
        </ul></details>}
      </li>)}
    </ul>
    {counts.delete > 0 && <p className="photo-note">{s.batchKeepPhotosHint}</p>}
    {counts.photos > 0 && <p className="photo-alert">{s.batchDeletePhotosHint.replace('{count}', counts.photos)}</p>}
  </>;
}

export function PeopleBatchDialog({ Modal, entries, requestId, photosById, s, onClose, onComplete }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef(false);
  async function confirm() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const result = await photoRequest('people/review', { requestId, changes: entries.map(entry => entry.payload) });
      await onComplete(result);
    } catch (error) { setError(error.message); }
    finally { pending.current = false; setBusy(false); }
  }
  return <Modal title={s.reviewPeopleChanges} s={s} busy={busy} onClose={onClose}>
    <PeopleBatchSummary entries={entries} photosById={photosById} s={s} />
    {error && <p className="photo-alert" role="alert">{error}</p>}
    {busy && <div className="photo-library-loading" role="status"><LoadingSpinner inline /><span>{s.applyingPeopleAction}</span></div>}
    <div className="photo-dialog__actions"><button type="button" className="dialog-button" disabled={busy} onClick={onClose}>{s.cancel}</button>
      <button type="button" className="dialog-button dialog-button--accent" disabled={busy} onClick={confirm}>{s.confirmPeopleChanges}</button></div>
  </Modal>;
}
