import React, { useEffect, useId, useRef, useState } from 'react';
import { photoRequest } from './api/raspberryApi.js';
import PhotoViewerImage from './PhotoViewerImage.jsx';
import { photoAssignmentOptions, photoPersonName, UNKNOWN_PERSON_ID } from './photoLibrary.js';

export function FaceNameEditor({ face, people, s, busy, onSave, onClose, creating = false, hasBox = false }) {
  const choices = photoAssignmentOptions(people, s);
  const [target, setTarget] = useState(() => choices.some(person => person.id === face.personId) ? face.personId : 'new');
  const [name, setName] = useState('');
  const heading = useId(), editor = useRef(null);
  useEffect(() => { (editor.current?.querySelector('input') || editor.current?.querySelector('select'))?.focus({ preventScroll: true }); }, []);
  const valid = (!creating || hasBox) && (target === 'new' ? !!name.trim() : choices.some(person => person.id === target));
  return <form ref={editor} className="photo-face-editor" aria-labelledby={heading} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }
  }} onSubmit={event => {
    event.preventDefault();
    if (!busy && valid) onSave(target === 'new' ? { name: name.trim() } : { personId: target });
  }}>
    <div className="photo-face-editor__heading"><span className="photo-face-editor__icon" aria-hidden="true">⌖</span><strong id={heading}>{creating ? s.nameThisFace : s.editFace}</strong></div>
    <p>{target === UNKNOWN_PERSON_ID ? s.unknownFaceAssignmentHint : creating ? hasBox ? s.faceReadyHint : s.drawFaceHint : s.faceAssignmentHint}</p>
    <label>{s.choosePerson}<select value={target} onChange={event => setTarget(event.target.value)} disabled={busy}>
      {choices.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
      <option value="new">{s.newPerson}</option>
    </select></label>
    {target === 'new' && <label>{s.personName}<input value={name} placeholder={s.faceNamePlaceholder} onChange={event => setName(event.target.value)} required maxLength={100} autoComplete="off" disabled={busy} /></label>}
    <div className="photo-face-editor__buttons"><button type="submit" className="dialog-button dialog-button--accent" disabled={busy || !valid}>{creating ? s.confirmFace : s.save}</button>
      <button type="button" className="dialog-button dialog-button--ghost" onClick={onClose} disabled={busy}>{s.cancel}</button></div>
  </form>;
}

export function PhotoFaceList({ faces, selectedId, highlightPersonId, onSelect, onRemove, busy, s }) {
  return <section className="photo-face-list" aria-label={s.facesInPhoto}>
    <div className="photo-face-list__title"><strong>{s.facesInPhoto}</strong><span>{faces.length}</span></div>
    <p>{faces.length ? s.faceClickHint : s.faceListEmpty}</p>
    <div className="photo-face-list__items">{faces.map((face, index) => <div key={face.id}
      className={`photo-face-list__row${face.personId === highlightPersonId ? ' is-highlighted' : ''}${face.id === selectedId ? ' is-selected' : ''}`}>
      <button type="button" disabled={busy} className="photo-face-list__item"
        aria-pressed={face.id === selectedId} onClick={() => onSelect(face.id)}>
        <span className="photo-face-list__number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <span><strong>{photoPersonName(face, s) || s.unnamedFace}</strong><small>{s.correctPerson}</small></span>
      </button>
      <button type="button" className="photo-face-list__remove" disabled={busy} onClick={() => onRemove(face.id)}
        title={s.removeFace} aria-label={`${s.removeFace}: ${photoPersonName(face, s) || s.unnamedFace}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg>
      </button>
    </div>)}</div>
  </section>;
}

export function FaceRemoveConfirmation({ face, s, busy, error, onConfirm, onClose }) {
  const title = useId(), description = useId(), cancel = useRef(null);
  useEffect(() => { cancel.current?.focus({ preventScroll: true }); }, []);
  return <div className="photo-face-remove" role="alertdialog" aria-labelledby={title} aria-describedby={description} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }
  }}>
    <strong id={title}>{s.removeFaceQuestion.replace('{name}', photoPersonName(face, s) || s.unnamedFace)}</strong>
    <p id={description}>{s.removeFaceHint}</p>
    {error && <p className="photo-alert" role="alert">{error}</p>}
    <div><button type="button" className="dialog-button dialog-button--danger" disabled={busy} onClick={onConfirm}>{s.removeFace}</button>
      <button ref={cancel} type="button" className="dialog-button dialog-button--ghost" disabled={busy} onClick={onClose}>{s.cancel}</button></div>
  </div>;
}

export default function PhotoFaceViewer({ photo, people, globalFaces, revision, highlightPersonId, onChanged, s }) {
  const [details, setDetails] = useState(null), [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
  const [notice, setNotice] = useState('');
  const [addingFace, setAddingFace] = useState(false), [faceBox, setFaceBox] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const addButton = useRef(null), returnFocus = useRef(null);
  const mounted = useRef(true), action = useRef(false), changed = useRef(onChanged), previousScan = useRef('idle');
  changed.current = onChanged;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
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
  const removing = details?.faces.find(face => face.id === removingId);
  const running = details?.scan.state === 'running';
  const anyRunning = globalFaces.running || globalFaces.singleRunning || running;
  const restoreFocus = () => requestAnimationFrame(() => (returnFocus.current?.isConnected ? returnFocus.current : addButton.current)?.focus({ preventScroll: true }));
  const closeEditor = () => { setSelectedId(null); setAddingFace(false); setFaceBox(null); restoreFocus(); };
  const closeRemoval = () => { setRemovingId(null); setError(''); restoreFocus(); };
  async function perform(path, payload, success = '') {
    if (action.current) return;
    action.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await photoRequest(path, payload);
      if (!mounted.current) { changed.current?.(); return; }
      if (success) {
        if (removingId) setDetails(value => ({ ...value, faces: value.faces.filter(face => face.id !== removingId) }));
        setRemovingId(null); closeEditor(); setNotice(success);
      }
      setReload(value => value + 1);
      changed.current?.();
    } catch (error) {
      if (mounted.current) setError(error.message);
    } finally {
      action.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const selectFace = id => { if (!action.current) { returnFocus.current = document.activeElement; setSelectedId(id); setRemovingId(null); setNotice(''); } };
  const editor = addingFace && faceBox ? <FaceNameEditor face={{}} people={people} s={s} busy={busy} creating hasBox
    onSave={payload => perform(`photos/${photo.id}/faces`, { ...payload, box: faceBox }, s.faceSaved)} onClose={closeEditor} /> :
    selected ? <FaceNameEditor key={`${selected.id}:${selected.personId || ''}`} face={selected} people={people} s={s} busy={busy}
      onSave={payload => perform(`photos/${photo.id}/faces/${selected.id}/assign`, payload, s.faceSaved)} onClose={closeEditor} /> : null;
  return <div className="photo-face-viewer">
    <PhotoViewerImage photo={photo} s={s} faces={details?.faces || []} selectedFaceId={selectedId || removingId}
      highlightPersonId={highlightPersonId} onSelectFace={addingFace ? undefined : selectFace}
      addingFace={addingFace} onFaceBoxChange={setFaceBox} busy={busy} editor={editor} editorBox={faceBox || selected?.box} />
    <aside className="photo-face-sidebar" aria-label={s.people}>
      <div className="photo-face-sidebar__top"><span>{s.faceWorkspace}</span>
        <button ref={addButton} type="button" className={`dialog-button ${addingFace ? 'dialog-button--ghost' : 'dialog-button--accent'}`} disabled={busy} aria-pressed={addingFace}
          onClick={() => { returnFocus.current = addButton.current; setSelectedId(null); setRemovingId(null); setFaceBox(null); setAddingFace(value => !value); setNotice(''); }}><span aria-hidden="true">{addingFace ? '×' : '＋'}</span> {addingFace ? s.cancel : s.addFace}</button>
      </div>
      <PhotoFaceList faces={details?.faces || []} selectedId={selectedId || removingId} highlightPersonId={highlightPersonId}
        onSelect={selectFace} onRemove={id => { returnFocus.current = document.activeElement; setSelectedId(null); setRemovingId(id); setNotice(''); }} busy={busy || addingFace} s={s} />
      {removing && <FaceRemoveConfirmation face={removing} s={s} busy={busy} error={error}
        onConfirm={() => perform(`photos/${photo.id}/faces/${removing.id}/remove`, {}, s.faceRemoved)} onClose={closeRemoval} />}
      {notice && <p className="photo-face-notice" role="status">✓ {notice}</p>}
      {error && !removing && <p className="photo-alert" role="alert">{error} <button type="button" onClick={() => { setError(''); setReload(value => value + 1); }}>{s.retry}</button></p>}
      {!photo.sourceId && <details className="photo-face-analysis"><summary>{running ? s.detectingPhoto : s.faceAnalysisOptions}</summary><div className="photo-face-actions">
        <button type="button" className="dialog-button dialog-button--accent" disabled={busy || addingFace || !details?.canDetect || anyRunning}
          onClick={() => perform(`photos/${photo.id}/detect`, {})}>{running ? s.detectingPhoto : s.detectPeople}</button>
        {anyRunning && <button type="button" className="dialog-button" disabled={busy}
          onClick={() => perform('people/pause', {})}>{s.pauseFaces}</button>}
        {details && !details.canDetect && <p>{s.peopleSetup}</p>}
        {details?.state === 'done' && details.faces.length === 0 && !running && <p role="status">{s.noFacesDetected}</p>}
        {details?.faces.some(face => !face.box) && <p>{s.faceBoxesMissing}</p>}
        {details?.scan.state === 'paused' && <p role="status">{s.facesPaused}</p>}
        {details?.scan.error && <p role="alert">{details.scan.error}</p>}
      </div></details>}
    </aside>
  </div>;
}
