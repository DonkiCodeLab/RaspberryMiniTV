import React, { useEffect, useRef, useState } from 'react';
import { photoRequest } from './api/raspberryApi.js';
import PhotoViewerImage from './PhotoViewerImage.jsx';
import { photoPeopleOptions, photoPersonName } from './photoLibrary.js';

export function FaceNameEditor({ face, people, s, busy, onSave, onClose }) {
  const [target, setTarget] = useState(face.personId || 'new');
  const [name, setName] = useState('');
  const choices = photoPeopleOptions(people, s);
  const valid = target === 'new' ? !!name.trim() : choices.some(person => person.id === target);
  return <form className="photo-face-editor" onSubmit={event => {
    event.preventDefault();
    if (!busy && valid) onSave(target === 'new' ? { name: name.trim() } : { personId: target });
  }}>
    <strong>{s.editFace}: {photoPersonName(face, s) || s.unnamedFace}</strong>
    <p>{s.faceAssignmentHint}</p>
    <label>{s.choosePerson}<select autoFocus value={target} onChange={event => setTarget(event.target.value)} disabled={busy}>
      {choices.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
      <option value="new">{s.newPerson}</option>
    </select></label>
    {target === 'new' && <label>{s.personName}<input value={name} onChange={event => setName(event.target.value)} required maxLength={100} autoComplete="off" disabled={busy} /></label>}
    <div><button type="submit" className="dialog-button dialog-button--accent" disabled={busy || !valid}>{s.save}</button>
      <button type="button" className="dialog-button" onClick={onClose} disabled={busy}>{s.cancel}</button></div>
  </form>;
}

export function PhotoFaceList({ faces, selectedId, highlightPersonId, onSelect, busy, s }) {
  if (!faces.length) return null;
  return <section className="photo-face-list" aria-label={s.facesInPhoto}>
    <strong>{s.facesInPhoto}</strong><p>{s.faceClickHint}</p>
    <div>{faces.map((face, index) => <button key={face.id} type="button" disabled={busy}
      className={`photo-face-list__item${face.personId === highlightPersonId ? ' is-highlighted' : ''}`}
      aria-pressed={face.id === selectedId} onClick={() => onSelect(face.id)}>
      <span>{index + 1} · {photoPersonName(face, s) || s.unnamedFace}</span><small>{s.correctPerson}</small>
    </button>)}</div>
  </section>;
}

export default function PhotoFaceViewer({ photo, people, globalFaces, revision, highlightPersonId, onChanged, s }) {
  const [details, setDetails] = useState(null), [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
  const [notice, setNotice] = useState('');
  const mounted = useRef(true), action = useRef(false), changed = useRef(onChanged), previousScan = useRef('idle');
  changed.current = onChanged;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    const load = async () => {
      try {
        const result = await photoRequest(`photos/${photo.id}/faces`, undefined, controller.signal);
        if (controller.signal.aborted) return;
        setDetails(result);
        if (previousScan.current === 'running' && result.scan.state !== 'running') changed.current?.();
        previousScan.current = result.scan.state;
        if (result.scan.state === 'running') timer = setTimeout(load, 1500);
      } catch (error) {
        if (!controller.signal.aborted) setError(error.message);
      }
    };
    load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [photo.id, revision, reload]);
  const selected = details?.faces.find(face => face.id === selectedId);
  const running = details?.scan.state === 'running';
  const anyRunning = globalFaces.running || globalFaces.singleRunning || running;
  async function perform(path, payload, assigned = false) {
    if (action.current) return;
    action.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await photoRequest(path, payload);
      if (!mounted.current) { changed.current?.(); return; }
      if (assigned) { setSelectedId(null); setNotice(s.faceSaved); }
      setReload(value => value + 1);
      changed.current?.();
    } catch (error) {
      if (mounted.current) setError(error.message);
    } finally {
      action.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const selectFace = id => { if (!action.current) { setSelectedId(id); setNotice(''); } };
  return <div className="photo-face-viewer">
    <PhotoViewerImage photo={photo} s={s} faces={details?.faces || []} selectedFaceId={selectedId}
      highlightPersonId={highlightPersonId} onSelectFace={selectFace} />
    <PhotoFaceList faces={details?.faces || []} selectedId={selectedId} highlightPersonId={highlightPersonId}
      onSelect={selectFace} busy={busy} s={s} />
    {selected && <FaceNameEditor key={`${selected.id}:${selected.personId || ''}`} face={selected} people={people} s={s} busy={busy}
      onSave={payload => perform(`photos/${photo.id}/faces/${selected.id}/assign`, payload, true)} onClose={() => setSelectedId(null)} />}
    {notice && <p role="status">{notice}</p>}
    {!photo.sourceId && <div className="photo-face-actions">
      <button type="button" className="dialog-button dialog-button--accent" disabled={busy || !details?.canDetect || anyRunning}
        onClick={() => perform(`photos/${photo.id}/detect`, {})}>{running ? s.detectingPhoto : s.detectPeople}</button>
      {anyRunning && <button type="button" className="dialog-button" disabled={busy}
        onClick={() => perform('people/pause', {})}>{s.pauseFaces}</button>}
      {details && !details.canDetect && <p>{s.peopleSetup}</p>}
      {details?.state === 'done' && details.faces.length === 0 && !running && <p role="status">{s.noFacesDetected}</p>}
      {details?.faces.some(face => !face.box) && <p>{s.faceBoxesMissing}</p>}
      {details?.scan.state === 'paused' && <p role="status">{s.facesPaused}</p>}
      {details?.scan.error && <p role="alert">{details.scan.error}</p>}
    </div>}
    {error && <p className="photo-alert" role="alert">{error} <button type="button" onClick={() => { setError(''); setReload(value => value + 1); }}>{s.retry}</button></p>}
  </div>;
}
