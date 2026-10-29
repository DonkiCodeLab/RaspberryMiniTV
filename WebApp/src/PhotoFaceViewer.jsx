import React, { useEffect, useId, useRef, useState } from 'react';
import { photoRequest } from './api/raspberryApi.js';
import PhotoViewerImage from './PhotoViewerImage.jsx';
import { photoAssignmentOptions, photoAssignmentLabel, photoAssignmentValue, photoPersonName, UNKNOWN_PERSON_ID } from './photoLibrary.js';
import { visiblePersonFaces } from './photoPersonPreview.js';
import { validNewPersonName } from './photoPeopleBatch.js';

export function PersonFaceControls({ personName, showPersonFaces, onShowPersonFaces, showOtherFaces, onShowOtherFaces, editing, onEditing, disabled, s }) {
  return <div className="photo-person-face-controls">
    <label><input type="checkbox" checked={showPersonFaces} disabled={disabled} onChange={event => onShowPersonFaces(event.target.checked)} />{s.showPersonFaces.replace('{name}', () => personName)}</label>
    <label><input type="checkbox" checked={showOtherFaces} disabled={disabled} onChange={event => onShowOtherFaces(event.target.checked)} />{s.showOtherFaces}</label>
    <button type="button" className="dialog-button" aria-pressed={editing} disabled={disabled} onClick={() => onEditing(!editing)}>{editing ? s.finishFaceEditing : s.editFaces}</button>
  </div>;
}

export function PhotoFaceControls({ showFaces, onShowFaces, editing, onEditing, disabled, s }) {
  return <div className="photo-person-face-controls">
    <label><input type="checkbox" checked={showFaces} disabled={disabled} onChange={event => onShowFaces(event.target.checked)} />{s.reviewShowFaceBoxes}</label>
    <button type="button" className="dialog-button" aria-pressed={editing} disabled={disabled} onClick={() => onEditing(!editing)}>{editing ? s.finishFaceEditing : s.editFaces}</button>
  </div>;
}

export function FaceNameEditor({ face, people, s, busy, onSave, onClose, creating = false, hasBox = false, initialName = '' }) {
  const choices = photoAssignmentOptions(people, s);
  const [target, setTarget] = useState(() => choices.some(person => person.id === face.personId) ? face.personId :
    choices.find(person => person.draftName && person.draftName.toLowerCase() === initialName.trim().toLowerCase())?.id || 'new');
  const [name, setName] = useState(initialName);
  const heading = useId(), editor = useRef(null), personList = useRef(null), newName = useRef(null), cancel = useRef(null);
  const search = useRef({ text: '', time: 0 });
  useEffect(() => { personList.current?.focus({ preventScroll: true }); }, []);
  const valid = (!creating || hasBox) && (target === 'new' ? validNewPersonName(name) : choices.some(person => person.id === target));
  return <form ref={editor} className="photo-face-editor" aria-labelledby={heading} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }
    if (event.key === 'Tab') {
      event.preventDefault(); event.stopPropagation();
      const controls = [personList.current, newName.current, cancel.current].filter(control => control && !control.disabled);
      const index = controls.indexOf(event.target);
      controls[(index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length]?.focus({ preventScroll: true });
    }
    if (event.key === 'Enter' && event.target === personList.current && !event.nativeEvent.isComposing) {
      event.preventDefault(); event.stopPropagation();
      if (!busy && valid) editor.current?.requestSubmit();
      else if (target === 'new') newName.current?.focus({ preventScroll: true });
    }
  }} onSubmit={event => {
    event.preventDefault();
    if (!busy && valid) onSave(target === 'new' ? { name: name.trim() } : photoAssignmentValue(choices, target));
  }}>
    <div className="photo-face-editor__heading"><span className="photo-face-editor__icon" aria-hidden="true">⌖</span><strong id={heading}>{creating ? s.nameThisFace : s.editFace}</strong></div>
    <p>{target === UNKNOWN_PERSON_ID ? s.unknownFaceAssignmentHint : creating ? hasBox ? s.faceReadyHint : s.drawFaceHint : s.faceAssignmentHint}</p>
    <label>{s.choosePerson}<select ref={personList} value={target} onChange={event => setTarget(event.target.value)} disabled={busy}
      onBlur={() => { search.current = { text: '', time: 0 }; }} onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
        const ids = ['new', ...choices.map(person => person.id)];
        const index = ids.indexOf(target);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          search.current = { text: '', time: 0 };
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 :
            Math.max(0, Math.min(ids.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
          setTarget(ids[next]);
        } else if (event.key.length === 1) {
          event.preventDefault(); event.stopPropagation();
          const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
          const now = Date.now(), letter = normalize(event.key);
          const text = (now - search.current.time < 1000 ? search.current.text : '') + letter;
          search.current = { text, time: now };
          const cycling = [...text].every(character => character === letter);
          const query = cycling ? letter : text;
          const start = cycling ? choices.findIndex(person => person.id === target) + 1 : 0;
          const ordered = [...choices.slice(start), ...choices.slice(0, start)];
          const match = ordered.find(person => normalize(person.name).startsWith(query));
          if (match) setTarget(match.id);
        }
      }}>
      <option value="new">{s.newPerson}</option>
      {choices.map(person => <option key={person.id} value={person.id}>{photoAssignmentLabel(person, s)}</option>)}
    </select></label>
    <label>{s.newPersonName}<input ref={newName} value={name} placeholder={s.faceNamePlaceholder} onFocus={() => setTarget('new')} onChange={event => { setTarget('new'); setName(event.target.value); }} required={target === 'new'} maxLength={100} autoComplete="off" disabled={busy} /></label>
    <div className="photo-face-editor__buttons"><button type="submit" tabIndex={-1} className="dialog-button dialog-button--accent" disabled={busy || !valid}>{creating ? s.confirmFace : s.save}</button>
      <button ref={cancel} type="button" className="dialog-button dialog-button--ghost" onClick={onClose} disabled={busy}>{s.cancel}</button></div>
  </form>;
}

export function PhotoFaceList({ faces, selectedId, highlightPersonId, onSelect, onRemove, onConfirm, busy, s }) {
  return <section className="photo-face-list" aria-label={s.facesInPhoto}>
    <div className="photo-face-list__title"><strong>{s.facesInPhoto}</strong><span>{faces.length}</span></div>
    <p>{faces.length ? s.faceClickHint : s.faceListEmpty}</p>
    <div className="photo-face-list__items">{faces.map((face, index) => <div key={face.id}
      className={`photo-face-list__row${face.personId === highlightPersonId ? ' is-highlighted' : ''}${face.id === selectedId ? ' is-selected' : ''}`}>
      <button type="button" disabled={busy} className="photo-face-list__item"
        aria-pressed={face.id === selectedId} onClick={() => onSelect(face.id)}>
        <span className="photo-face-list__number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <span><strong>{photoPersonName(face, s) || s.unnamedFace}</strong><small>{face.reviewId ? s.pendingValidation : s.correctPerson}</small></span>
      </button>
      <button type="button" className="photo-face-list__remove" disabled={busy} onClick={() => onRemove(face.id)}
        title={s.removeFace} aria-label={`${s.removeFace}: ${photoPersonName(face, s) || s.unnamedFace}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg>
      </button>
      {face.reviewId && <button type="button" className="photo-face-list__confirm" disabled={busy} onClick={() => onConfirm(face.reviewId)}
        aria-label={`${s.confirmMatch}: ${photoPersonName(face, s)}`} title={s.confirmMatch}>✓</button>}
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

export default function PhotoFaceViewer({ photo, quality = 'preview', people = [], globalFaces = {}, revision, highlightPersonId, onChanged, s,
  editing = true, showPersonFaces = true, showOtherFaces = true, initialFaces = [], onInteractionChange, closeLayer }) {
  const [details, setDetails] = useState(null), [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
  const [notice, setNotice] = useState('');
  const [addingFace, setAddingFace] = useState(false), [faceBox, setFaceBox] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const addButton = useRef(null), returnFocus = useRef(null);
  const shortcutHint = useId();
  const mounted = useRef(true), action = useRef(false), changed = useRef(onChanged), previousScan = useRef('idle');
  changed.current = onChanged;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onInteractionChange?.({ busy, editing: !!selectedId || addingFace || !!removingId }); }, [busy, selectedId, addingFace, removingId, onInteractionChange]);
  useEffect(() => {
    if (!closeLayer) return;
    closeLayer.current = () => {
      if (action.current) return true;
      if (selectedId || addingFace) { closeEditor(); return true; }
      if (removingId) { closeRemoval(); return true; }
      return false;
    };
    return () => { closeLayer.current = null; };
  }, [closeLayer, selectedId, addingFace, removingId]);
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
  const allFaces = details?.faces || initialFaces;
  const visibleFaces = !highlightPersonId && !showOtherFaces ? allFaces.filter(face => face.id === (selectedId || removingId)) :
    visiblePersonFaces(allFaces, highlightPersonId, showOtherFaces, selectedId || removingId, showPersonFaces);
  const running = details?.scan.state === 'running';
  const anyRunning = globalFaces.running || globalFaces.singleRunning || running;
  const restoreFocus = () => requestAnimationFrame(() => (returnFocus.current?.isConnected ? returnFocus.current : addButton.current)?.focus({ preventScroll: true }));
  const closeEditor = () => { setSelectedId(null); setAddingFace(false); setFaceBox(null); restoreFocus(); };
  const closeRemoval = () => { setRemovingId(null); setError(''); restoreFocus(); };
  const startAddingFace = () => {
    if (!editing || action.current || addingFace) return;
    returnFocus.current = addButton.current;
    setSelectedId(null); setRemovingId(null); setFaceBox(null); setAddingFace(true); setNotice('');
  };
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
  const selectFace = id => { if (editing && !action.current) { returnFocus.current = document.activeElement; setSelectedId(id); setRemovingId(null); setNotice(''); } };
  const editor = addingFace && faceBox ? <FaceNameEditor face={{}} people={people} s={s} busy={busy} creating hasBox
    onSave={payload => perform(`photos/${photo.id}/faces`, { ...payload, box: faceBox }, s.faceSaved)} onClose={closeEditor} /> :
    selected ? <FaceNameEditor key={`${selected.id}:${selected.personId || ''}`} face={selected} people={people} s={{ ...s, save: s.validateFaceChange }} busy={busy}
      onSave={payload => perform(`photos/${photo.id}/faces/${selected.id}/assign`, payload, s.faceSaved)} onClose={closeEditor} /> : null;
  return <div className={`photo-face-viewer${editing ? '' : ' photo-face-viewer--browsing'}`}>
    <PhotoViewerImage photo={photo} quality={quality} s={s} faces={visibleFaces} selectedFaceId={selectedId || removingId}
      highlightPersonId={highlightPersonId} onSelectFace={!editing || addingFace ? undefined : selectFace} readOnlyFaces={!editing}
      addingFace={addingFace} onAddFace={!editing || removingId ? undefined : startAddingFace} onFaceBoxChange={setFaceBox} busy={busy} editor={editor} editorBox={faceBox || selected?.box} />
    {editing ? <aside className="photo-face-sidebar" aria-label={s.people}>
      <div className="photo-face-sidebar__top"><span>{s.faceWorkspace}</span>
        <button ref={addButton} type="button" className={`dialog-button ${addingFace ? 'dialog-button--ghost' : 'dialog-button--accent'}`} disabled={busy} aria-pressed={addingFace}
          aria-keyshortcuts={addingFace ? undefined : 'F'} aria-describedby={shortcutHint}
          onClick={addingFace ? closeEditor : startAddingFace}><span aria-hidden="true">{addingFace ? '×' : '＋'}</span> {addingFace ? s.cancel : s.addFace}</button>
      </div>
      <p id={shortcutHint} className="photo-face-shortcut">{s.addFaceShortcutHint}</p>
      <PhotoFaceList faces={details?.faces || []} selectedId={selectedId || removingId} highlightPersonId={highlightPersonId}
        onConfirm={id => perform('reviews/confirm', { ids: [id] }, s.reviewSaved)}
        onSelect={selectFace} onRemove={id => { returnFocus.current = document.activeElement; setSelectedId(null); setRemovingId(id); setNotice(''); }} busy={busy || addingFace} s={s} />
      {details?.noFacesReviewId && <div className="photo-review-action"><span className="photo-review-badge">{s.newAddition}</span>
        <button type="button" className="dialog-button" disabled={busy || addingFace} onClick={() => perform('reviews/confirm', { ids: [details.noFacesReviewId] }, s.reviewSaved)}>{s.markReviewed}</button>
      </div>}
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
    </aside> : error && <p className="photo-alert" role="alert">{error} <button type="button" onClick={() => { setError(''); setReload(value => value + 1); }}>{s.retry}</button></p>}
  </div>;
}
