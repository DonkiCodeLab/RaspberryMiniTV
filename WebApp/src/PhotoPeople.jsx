import React, { useEffect, useId, useRef, useState } from 'react';

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

export function PersonEditor({ person, cover, s, busy, choosingCover, onSave, onChooseCover, renderImage }) {
  const [name, setName] = useState(person.name);
  const savedName = useRef(person.name);
  useEffect(() => {
    const previous = savedName.current;
    setName(value => value === previous ? person.name : value);
    savedName.current = person.name;
  }, [person.name]);
  return <section className="photo-person-editor" aria-label={s.editPerson}>
    {cover && <div className="photo-person-editor__cover">{renderImage(cover)}</div>}
    <form onSubmit={event => { event.preventDefault(); if (!busy && name.trim()) onSave(name.trim()); }}>
      <label>{s.personName}<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
      <button type="submit" className="dialog-button" disabled={busy || !name.trim() || name.trim() === person.name}>{s.save}</button>
    </form>
    <button type="button" className="dialog-button" aria-pressed={choosingCover} onClick={onChooseCover}>{choosingCover ? s.cancelCover : s.chooseCover}</button>
    {choosingCover && <p role="status">{s.chooseCoverHint}</p>}
  </section>;
}
