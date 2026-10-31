import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getPictureContentUrl, photoRequest } from './api/raspberryApi.js';
import { validBirthday } from './personBirthday.js';
import { dateLabel } from './photoMetadata.js';
import { photoAgeLabel } from './photoPersonTimeline.js';
import { evolutionCandidates, evolutionGroups, evolutionSelection, evolutionFrameAt, EVOLUTION_LIMIT } from './photoEvolution.js';
import { loadEvolutionImage, makeEvolutionPortrait, drawEvolution, evolutionVideoType, exportEvolutionVideo } from './photoEvolutionRender.js';
import { photoEvolutionStrings } from './photoEvolutionStrings.js';
import './PersonPhotoEvolution.css';

const defaultImageUrl = photo => getPictureContentUrl(photo.relativePath, 'preview');
export default function PersonPhotoEvolution({ Modal, person, photos, localAlignment, language, s, onClose, onOpen, imageUrl = defaultImageUrl }) {
  const t = photoEvolutionStrings(language);
  const candidates = useMemo(() => evolutionCandidates(photos, person), [photos, person]);
  const maximum = candidates.at(-1)?.age ?? 0;
  const [from, setFrom] = useState(candidates[0]?.age ?? 0), [to, setTo] = useState(maximum);
  const [frequency, setFrequency] = useState('stages'), [choices, setChoices] = useState({});
  const { groups, total } = useMemo(() => evolutionGroups(candidates, from, to, frequency), [candidates, from, to, frequency]);
  const selected = useMemo(() => evolutionSelection(groups, choices), [groups, choices]);
  const signature = JSON.stringify(selected.map(item => [item.photo.id, item.photo.relativePath, item.day, item.face.id, item.face.box]));
  const [frames, setFrames] = useState([]), [progress, setProgress] = useState(null), [failed, setFailed] = useState(0);
  const [position, setPosition] = useState(0), [playing, setPlaying] = useState(false), [seconds, setSeconds] = useState(2);
  const [exporting, setExporting] = useState(null), [download, setDownload] = useState(null), [error, setError] = useState('');
  const canvas = useRef(null), work = useRef(null), recording = useRef(null), currentPosition = useRef(0);
  const [reducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const videoType = evolutionVideoType();
  const busy = progress !== null || exporting !== null;
  const seek = value => { currentPosition.current = value; setPosition(value); };
  useEffect(() => {
    work.current?.abort(); recording.current?.abort();
    setFrames([]); setProgress(null); setFailed(0); setPlaying(false); seek(0); setDownload(null); setError('');
  }, [signature, person.birthDate]);
  useEffect(() => () => { work.current?.abort(); recording.current?.abort(); }, []);
  useEffect(() => () => { if (download) URL.revokeObjectURL(download.url); }, [download]);
  useEffect(() => { drawEvolution(canvas.current, frames, position, { reducedMotion }); }, [frames, position, reducedMotion]);
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const start = performance.now(), initial = currentPosition.current;
    let raf;
    const tick = now => {
      const next = Math.min(frames.length - 1, initial + (now - start) / (seconds * 1000));
      seek(next);
      if (next >= frames.length - 1) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, frames, seconds]);
  useEffect(() => {
    const hide = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);

  async function prepare() {
    work.current?.abort();
    const controller = new AbortController(); work.current = controller;
    setPlaying(false); seek(0); setFrames([]); setDownload(null); setFailed(0); setError('');
    setProgress({ done: 0, total: selected.length });
    const ready = []; let failures = 0;
    for (const entry of selected) {
      if (controller.signal.aborted) return;
      try {
        const image = await loadEvolutionImage(imageUrl(entry.photo), controller.signal);
        let eyes = null;
        if (localAlignment) {
          try { eyes = (await photoRequest(`photos/${encodeURIComponent(entry.photo.id)}/faces/${encodeURIComponent(entry.face.id)}/evolution`, undefined, controller.signal)).eyes; }
          catch { /* Center the known face when the optional local predictor is unavailable. */ }
        }
        if (controller.signal.aborted) return;
        ready.push({ ...makeEvolutionPortrait(image, entry.face.box, eyes), entry,
          ageLabel: photoAgeLabel(person.birthDate, entry.photo.takenAt, s), dateLabel: dateLabel(entry.photo.takenAt, language, '') });
        setFrames([...ready]);
      } catch { if (controller.signal.aborted) return; failures++; }
      setProgress({ done: ready.length + failures, total: selected.length });
    }
    setFailed(failures); setProgress(null);
  }

  async function exportVideo() {
    setPlaying(false); setError(''); setDownload(null); setExporting(0);
    const controller = new AbortController(); recording.current = controller;
    try {
      const result = await exportEvolutionVideo(frames, seconds, person.name, controller.signal, setExporting, reducedMotion);
      if (!controller.signal.aborted) setDownload({ url: URL.createObjectURL(result.blob), extension: result.extension });
    } catch (error) { if (error.name !== 'AbortError') setError(t.exportError); }
    finally { if (recording.current === controller) setExporting(null); }
  }

  const frameState = frames.length ? evolutionFrameAt(position, frames.length, reducedMotion) : null;
  const activeIndex = frameState ? (frameState.blend >= .5 ? frameState.to : frameState.from) : 0;
  const active = frames[activeIndex], gap = activeIndex > 0 ? active.entry.age - frames[activeIndex - 1].entry.age - 1 : 0;
  const centered = frames.filter(frame => frame.alignment === 'box').length;
  const format = (message, values) => message.replace(/\{(\w+)\}/g, (_, key) => values[key]);
  const ageText = age => (age === 1 ? s.photoAgeYearOne : s.photoAgeYears).replace('{age}', age);
  return <Modal title={`${t.title} · ${person.name}`} s={s} onClose={onClose} wide className="photo-evolution-dialog">
    <p className="photo-evolution-intro">{t.intro}</p>
    {!validBirthday(person.birthDate) ? <p role="status" className="photo-evolution-empty">{t.birthday}</p> : <>
      <fieldset className="photo-evolution-settings" disabled={busy}>
        <label>{t.from}<input type="number" min="0" max={maximum} value={from} onChange={event => { const value = Math.max(0, Math.min(maximum, Math.trunc(Number(event.target.value)))); setFrom(value); if (value > to) setTo(value); }} /></label>
        <label>{t.to}<input type="number" min={from} max={maximum} value={to} onChange={event => setTo(Math.max(from, Math.min(maximum, Math.trunc(Number(event.target.value)))))} /></label>
        <label>{t.selection}<select value={frequency} onChange={event => setFrequency(event.target.value)}><option value="stages">{t.stages}</option><option value="all">{t.all}</option></select></label>
      </fieldset>
      <div className="photo-evolution-layout"><div className="photo-evolution-player">
        <div className="photo-evolution-stage">
          <canvas ref={canvas} width="512" height="512" role="img" aria-label={format(t.portrait, { name: person.name })} hidden={!frames.length} />
          {!frames.length && <div className="photo-evolution-placeholder"><span aria-hidden="true">◷</span><p>{selected.length ? t.placeholder : t.empty}</p></div>}
          <span className="photo-evolution-badge">{t.photos}</span>
        </div>
        {active && <div className="photo-evolution-caption"><strong>{active.ageLabel}</strong><span>{active.dateLabel} · {activeIndex + 1} / {frames.length}</span></div>}
        {frames.length > 0 && <>
          <input className="photo-evolution-timeline" type="range" min="0" max={Math.max(0, frames.length - 1)} step="0.01" value={position}
            aria-label={t.browse} aria-valuetext={active ? `${active.ageLabel}, ${active.dateLabel}` : ''} disabled={busy || frames.length < 2} onChange={event => { setPlaying(false); seek(Number(event.target.value)); }} />
          <div className="photo-evolution-controls">
            <button className="dialog-button" type="button" aria-label={t.previous} disabled={busy || position === 0} onClick={() => { setPlaying(false); seek(Math.max(0, Math.ceil(position) - 1)); }}>‹</button>
            <button className="dialog-button dialog-button--accent" type="button" disabled={busy || frames.length < 2} onClick={() => { if (position >= frames.length - 1) seek(0); setPlaying(value => !value); }}>{playing ? t.pause : frames.length > 1 && position >= frames.length - 1 ? t.replay : t.play}</button>
            <button className="dialog-button" type="button" aria-label={t.next} disabled={busy || position >= frames.length - 1} onClick={() => { setPlaying(false); seek(Math.min(frames.length - 1, Math.floor(position) + 1)); }}>›</button>
          </div>
          <p className="photo-evolution-gap" role="status">{gap > 0 ? format(t.gap, { count: gap }) : frames.length === 1 ? t.single : '\u00a0'}</p>
        </>}
      </div><aside className="photo-evolution-options">
        <span className="photo-evolution-eyebrow">{ageText(from)} — {ageText(to)}</span>
        <h3>{format(t.count, { count: selected.length })}</h3>
        <p>{frequency === 'stages' ? t.stageHint : t.allHint}</p>
        {total > EVOLUTION_LIMIT && <p>{format(t.limit, { count: EVOLUTION_LIMIT })}</p>}
        {!!(photos.length - candidates.length) && <p>{format(t.omitted, { count: photos.length - candidates.length })}</p>}
        {!!groups.length && <details className="photo-evolution-choices"><summary>{t.choose}</summary><div>{groups.map(group => {
          const chosen = selected.find(entry => group.options.includes(entry));
          return <label key={group.key}>{photoAgeLabel(person.birthDate, chosen.photo.takenAt, s)}<select disabled={busy} aria-label={`${t.selection}: ${photoAgeLabel(person.birthDate, chosen.photo.takenAt, s)}`} value={chosen.photo.id}
            onChange={event => setChoices(value => ({ ...value, [group.key]: event.target.value }))}>{group.options.map(entry => <option key={entry.photo.id} value={entry.photo.id}>{dateLabel(entry.photo.takenAt, language, '')} · {entry.photo.name}</option>)}</select></label>;
        })}</div></details>}
        <button type="button" className="dialog-button dialog-button--accent" disabled={busy || !selected.length} onClick={prepare}>{frames.length ? t.retry : t.prepare}</button>
        {progress && <div role="status"><p>{format(t.preparing, progress)}</p><progress max={progress.total} value={progress.done} /><button type="button" className="dialog-button" onClick={() => { work.current?.abort(); setProgress(null); }}>{t.cancel}</button></div>}
        {!!failed && <p role="status">{format(t.failed, { count: failed })}</p>}
        {!progress && centered > 0 && <p>{format(t.centered, { count: centered })}</p>}
        {frames.length > 1 && <>
          <label className="photo-evolution-speed">{t.speed}<select value={seconds} disabled={busy} onChange={event => { setPlaying(false); setSeconds(Number(event.target.value)); setDownload(null); }}>{[1, 2, 3, 5].map(value => <option key={value} value={value}>{format(t.seconds, { count: value })}</option>)}</select></label>
          {videoType ? <>
            <button type="button" className="dialog-button" disabled={busy} onClick={exportVideo}>{t.export}</button><p>{t.exportHint}</p>
            {exporting !== null && <div role="status"><p>{format(t.exporting, { progress: exporting })}</p><progress max="100" value={exporting} /><button type="button" className="dialog-button" onClick={() => recording.current?.abort()}>{t.cancel}</button></div>}
            {download && <><a className="dialog-button dialog-button--accent" href={download.url} download={`evolucion-${person.name.replace(/[^\p{L}\p{N}-]/gu, '-').slice(0, 60)}.${download.extension}`}>{t.download}</a>
              <details className="photo-evolution-choices"><summary>{t.videoPreview}</summary><video controls playsInline preload="metadata" src={download.url} aria-label={t.videoPreview} /></details></>}
          </> : <p>{t.unsupported}</p>}
        </>}
        {error && <p role="alert">{error}</p>}
        {active && <button type="button" className="dialog-button" disabled={busy} onClick={() => onOpen(active.entry.photo)}>{t.source} ↗</button>}
      </aside></div>
      <p className="photo-evolution-footnote">{t.realDates}</p>
    </>}
  </Modal>;
}
