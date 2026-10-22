import React, { useEffect, useId, useRef, useState } from 'react';
import { photoPeopleOptions, UNKNOWN_PERSON_ID } from './photoLibrary.js';

export function PeopleAnalysis({ faces, peopleCount, s, busy, onAction }) {
  const titleId = useId();
  const active = (faces.running && faces.state !== 'paused') || faces.singleRunning;
  const resumable = ['paused', 'error'].includes(faces.state) && faces.remaining > 0;
  const percent = Math.min(100, Math.max(0, faces.percent || 0));
  const label = faces.pausing ? s.facesPausing : active ? s.scanningFaces : faces.state === 'paused' ? s.facesPaused :
    faces.state === 'complete' ? (faces.pending ? s.facesBatchComplete : s.facesComplete) : s.facesTitle;
  return <section className="photo-people-analysis" aria-labelledby={titleId}>
    <div className="photo-people-analysis__heading">
      <div><h2 id={titleId}>{faces.singleRunning ? s.detectingPhoto : label}</h2><p>{s.facesBackground}</p><p>{s.facesBatchHint}</p></div>
      <button type="button" className="dialog-button dialog-button--accent" disabled={busy || faces.pausing || (!active && (!faces.available || (!resumable && !faces.pending)))}
        onClick={() => onAction(active ? 'people/pause' : 'people/scan', {})}>
        {faces.pausing ? s.facesPausing : active ? s.pauseFaces : resumable ? s.resumeFaces : faces.state === 'complete' && faces.pending ? s.scanNextBatch : s.scan}
      </button>
    </div>
    {!faces.singleRunning && <div className="photo-people-analysis__progress">
      <progress aria-label={s.facesProgress} max={100} value={percent} />
      <strong>{percent}%</strong>
    </div>}
    <div className="photo-people-analysis__counts" role="status">
      {!faces.singleRunning && <span>{faces.done || 0} / {faces.total || 0} {s.facesReviewed}</span>}<span>{peopleCount} {peopleCount === 1 ? s.onePerson : s.people.toLocaleLowerCase()}</span>
      {faces.failed > 0 && <span>{faces.failed} {s.facesFailed}</span>}
    </div>
    <p className="photo-people-analysis__hint">{s.peopleLocal} {s.facesPending}: {faces.pending || 0}.</p>
    <p className="photo-people-analysis__hint">{s.facesLowPower}</p>
    {!faces.available && <div className="photo-people-analysis__setup"><p>{s.peopleSetup}</p>
      <code>sudo bash DeviceApp/install_photo_support.sh --faces</code><p>{s.peopleSetupHint}</p></div>}
    {faces.error && <p role="alert">{faces.error}</p>}
  </section>;
}

export function PersonEditor({ person, people = [], cover, s, busy, choosingCover, onSave, onMerge, onChooseCover, renderImage }) {
  const [name, setName] = useState(person.name);
  const [target, setTarget] = useState('');
  const unknown = person.id === UNKNOWN_PERSON_ID;
  const choices = photoPeopleOptions(people, s).filter(other => other.id !== person.id);
  const targetPerson = choices.find(other => other.id === target);
  const mergeHintId = useId();
  const savedName = useRef(person.name);
  useEffect(() => {
    const previous = savedName.current;
    setName(value => value === previous ? person.name : value);
    savedName.current = person.name;
  }, [person.name]);
  return <section className="photo-person-editor" aria-label={s.editPerson}>
    {cover && <div className="photo-person-editor__cover">{renderImage(cover)}</div>}
    {unknown ? <p>{s.unknownPersonHint}</p> : <form onSubmit={event => { event.preventDefault(); if (!busy && name.trim()) onSave(name.trim()); }}>
      <label>{s.personName}<input required maxLength={100} value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label>
      <button type="submit" className="dialog-button" disabled={busy || !name.trim() || name.trim() === person.name}>{s.save}</button>
    </form>}
    <button type="button" className="dialog-button" disabled={busy} aria-pressed={choosingCover} onClick={onChooseCover}>{choosingCover ? s.cancelCover : s.chooseCover}</button>
    {choosingCover && <p role="status">{s.chooseCoverHint}</p>}
    {!unknown && <form className="photo-person-editor__merge" onSubmit={event => {
      event.preventDefault(); if (!busy && targetPerson) onMerge(targetPerson.id);
    }}>
      <label>{s.mergeWith}<select value={targetPerson?.id || ''} required disabled={busy || !choices.length}
        aria-describedby={mergeHintId} onChange={event => setTarget(event.target.value)}>
        <option value={UNKNOWN_PERSON_ID}>{s.unknownPerson}</option>
        <option value="" disabled hidden>{s.choosePerson}</option>
        {choices.filter(other => other.id !== UNKNOWN_PERSON_ID).map(other => <option key={other.id} value={other.id}>{other.name}</option>)}
      </select></label>
      <button type="submit" className="dialog-button dialog-button--accent" disabled={busy || !targetPerson}>{s.mergePeople}</button>
      <p id={mergeHintId}>{targetPerson ? s.mergePeoplePreview.replace('{source}', person.name).replace('{target}', targetPerson.name) : choices.length ? s.mergePeopleHint : s.noOtherPeople}</p>
    </form>}
  </section>;
}
