import React, { useId, useRef, useState } from 'react';
import { isNewPhotoPerson, photoAssignmentOptions, UNKNOWN_PERSON_ID } from './photoLibrary.js';
import { downloadPhotoPeople, photoRequest } from './api/raspberryApi.js';
import downloadIcon from './assets/download.png';
import downloadHoverIcon from './assets/download2.png';

export function PersonMergeForm({ people, excludedIds, s, busy, disabled = false, onMerge }) {
  const [target, setTarget] = useState('');
  const choices = photoAssignmentOptions(people, s).filter(person => !excludedIds.includes(person.id));
  const destination = choices.find(person => person.id === target);
  return <form className="photo-person-merge" onSubmit={event => {
    event.preventDefault();
    if (!busy && !disabled && destination) onMerge(destination);
  }}>
    <select aria-label={s.mergeWith} value={destination?.id || ''} disabled={busy || disabled || !choices.length}
      onChange={event => setTarget(event.target.value)}>
      <option value="" disabled>{s.choosePerson}</option>
      {choices.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
    </select>
    <button type="submit" className="dialog-button dialog-button--accent" disabled={busy || disabled || !destination}>{s.merge}</button>
  </form>;
}

export function PersonCardActions({ person, people, editing, selected, s, busy, onSelect, onAction }) {
  const fixed = person.id === UNKNOWN_PERSON_ID;
  return <>
    {!fixed && <PersonMergeForm people={people} excludedIds={[person.id]} s={s} busy={busy}
      onMerge={target => onAction('merge', [person], target)} />}
    <div className="movie-library__actions-reveal photo-person-actions-reveal" inert={!editing} aria-hidden={!editing}>
      <div className="movie-library__actions-clip"><div className="photo-person-actions">
        <button type="button" className="movie-download" disabled={busy || !person.photoIds?.length}
          title={s.downloadPerson} aria-label={`${s.downloadPerson}: ${person.name}`} onClick={() => onAction('download', [person])}>
          <img className="movie-download__default" src={downloadIcon} alt="" aria-hidden="true" />
          <img className="movie-download__hover" src={downloadHoverIcon} alt="" aria-hidden="true" />
        </button>
        <button type="button" className="photo-person-delete" disabled={busy || fixed} title={fixed ? s.fixedPerson : s.deletePerson}
          aria-label={`${s.deletePerson}: ${person.name}`} onClick={() => onAction('delete', [person])}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg>
        </button>
        <label className="photo-person-check" title={s.select}>
          <input type="checkbox" checked={selected} disabled={busy} aria-label={`${s.select}: ${person.name}`} onChange={onSelect} />
        </label>
      </div></div>
    </div>
  </>;
}

export function NewPersonCardActions({ person, people, selected, s, busy, onSelect, onAction, onRename }) {
  const [name, setName] = useState('');
  const valid = !!name.trim() && !isNewPhotoPerson({ id: person.id, name });
  return <div className="photo-new-person-actions">
    <PersonMergeForm people={people} excludedIds={[person.id]} s={s} busy={busy}
      onMerge={target => onAction('merge', [person], target)} />
    <form className="photo-person-name" onSubmit={event => {
      event.preventDefault(); if (!busy && valid) onRename(name.trim());
    }}>
      <label>{s.newPersonName}<input value={name} placeholder={s.faceNamePlaceholder} maxLength={100} required disabled={busy}
        onChange={event => setName(event.target.value)} /></label>
      <button type="submit" className="dialog-button" disabled={busy || !valid}>{s.save}</button>
    </form>
    <label className="photo-new-person-check"><input type="checkbox" checked={selected} disabled={busy}
      aria-label={`${s.selectPersonToDelete}: ${person.name}`} onChange={onSelect} /><span>{s.selectPersonToDelete}</span></label>
  </div>;
}

export function PeopleToolbar({ editing, onToggle, reviewing = false, selected, people, s, busy, onSelectPage, onClear, onAction }) {
  const actionsId = useId();
  const fixedSelected = selected.some(person => person.id === UNKNOWN_PERSON_ID);
  const mergeSources = selected.filter(person => person.id !== UNKNOWN_PERSON_ID);
  return <div className="photo-people-toolbar">
    {!reviewing && <button type="button" className="dialog-button" aria-pressed={editing} aria-expanded={editing} aria-controls={actionsId}
      disabled={busy} onClick={onToggle}>{editing ? s.finishPeopleEdit : s.editPeople}</button>}
    {editing && <div id={actionsId} className="photo-people-bulk">
      <strong role="status">{s.selectedPeople.replace('{count}', selected.length)}</strong>
      <button type="button" className="dialog-button" disabled={busy} onClick={onSelectPage}>{s.selectPage}</button>
      <button type="button" className="dialog-button" disabled={busy || !selected.length} onClick={onClear}>{s.clear}</button>
      <button type="button" className="dialog-button photo-delete-button" disabled={busy || !selected.length || fixedSelected} onClick={() => onAction('delete', selected)}>{s.deletePeople}</button>
      <button type="button" className="dialog-button" disabled={busy || !selected.some(person => person.photoIds?.length)} onClick={() => onAction('download', selected)}>{s.downloadPeople}</button>
      <PersonMergeForm people={people} excludedIds={mergeSources.length === 1 ? [mergeSources[0].id] : []} s={s} busy={busy} disabled={!mergeSources.length}
        onMerge={target => onAction('merge', mergeSources.filter(person => person.id !== target.id), target)} />
      {fixedSelected && <small className="photo-people-fixed-hint">{s.fixedPerson}</small>}
    </div>}
  </div>;
}

export function PeopleActionSummary({ action, people, target, s }) {
  const question = action === 'delete' ? s.deletePeopleQuestion : action === 'download' ? s.downloadPeopleQuestion : s.mergePeopleQuestion;
  return <>
    <p>{question}</p>
    {target && <p className="photo-people-destination"><strong>{s.destination}: {target.name}</strong></p>}
    <ul className="photo-people-confirm-list" aria-label={s.affectedPeople}>
      {people.map(person => <li key={person.id}><strong>{person.name}</strong><span>{person.photoIds?.length || 0} {s.photos}</span></li>)}
    </ul>
    <p className="photo-note">{action === 'delete' ? s.deletePeopleHint : action === 'download' ? s.downloadPeopleHint : s.mergePeopleConfirmHint}</p>
  </>;
}

export function PeopleActionDialog({ Modal, action, people, target, s, onClose, onComplete }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef(false);
  const title = action === 'delete' ? s.deletePeople : action === 'download' ? s.downloadPeople : s.mergePeople;
  async function confirm() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const ids = people.map(person => person.id);
      if (action === 'download') {
        const blob = await downloadPhotoPeople(ids);
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = 'personas.zip'; document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        await photoRequest(`people/${action}`, { ids, ...(target ? { personId: target.id } : {}) });
      }
      await onComplete(action);
    } catch (error) { setError(error.message); }
    finally { pending.current = false; setBusy(false); }
  }
  return <Modal title={title} s={s} busy={busy} onClose={onClose}>
    <PeopleActionSummary action={action} people={people} target={target} s={s} />
    {error && <p className="photo-alert" role="alert">{error}</p>}
    {busy && <p role="status">{action === 'download' ? s.preparingPeopleDownload : s.applyingPeopleAction}</p>}
    <div className="photo-dialog__actions">
      <button type="button" className="dialog-button" disabled={busy} onClick={onClose}>{s.cancel}</button>
      <button type="button" className={`dialog-button ${action === 'delete' ? 'photo-delete-button' : 'dialog-button--accent'}`} disabled={busy} onClick={confirm}>{title}</button>
    </div>
  </Modal>;
}
