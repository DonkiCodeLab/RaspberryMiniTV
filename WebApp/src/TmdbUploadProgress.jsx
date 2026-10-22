import { useUiText } from "./i18n/react.js";
import React, { useEffect, useRef, useState } from 'react';
import { getTmdbCacheStatus } from './api/raspberryApi';

export default function TmdbUploadProgress({ upload, onReady, onClose }) {
  const ui = useUiText();
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const ready = useRef(onReady);
  ready.current = onReady;
  useEffect(() => {
    if (!upload) return;
    let disposed = false, timer;
    const controller = new AbortController();
    setJob(null); setError('');
    async function poll() {
      try {
        const status = await getTmdbCacheStatus(false, controller.signal);
        if (disposed) return;
        const next = status.jobs?.[`${upload.kind}/${upload.id}`];
        setJob(next); setError('');
        if (next?.state === 'complete' && upload.videoComplete) { ready.current(); return; }
        if (next?.state === 'failed' || next?.state === 'cancelled') return;
      } catch (e) { if (!disposed) setError(e.message); }
      if (!disposed) timer = setTimeout(poll, 1500);
    }
    poll();
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [upload?.kind, upload?.id, upload?.videoComplete]);
  if (!upload) return null;
  const phase = { metadata: ui('Guardando fichas de TMDB'), images: ui('Descargando imágenes'), thumbnails: ui('Generando miniaturas') }[job?.progress?.phase];
  return <aside className="tmdb-upload-progress" role="status" aria-live="polite">
    <strong>{ui("Preparación de {name}", { name: upload.name })}</strong>
    <p>{ui("Vídeos: ")}{upload.videoComplete ? ui('guardados') : ui('subida en curso (progreso en el diálogo de subida)')}</p>
    <p>TMDB: {job?.state === 'complete' ? ui('Listo en local') : job?.state === 'failed' ? ui('Preparación incompleta') : job?.state === 'cancelled' ? ui('Cancelado') : phase || ui('En cola')}</p>
    {job?.state === 'running' && <><progress value={job.progress?.total ? job.progress.completed : undefined} max={job.progress?.total || 1} /><p>{job.progress?.completed || 0}{job.progress?.total ? ` / ${job.progress.total}` : ''}{ui(" ficheros · ")}{job.progress?.current}</p></>}
    {(error || job?.error) && <p role="alert">{error || job.error}</p>}
    <button className="dialog-button" type="button" onClick={onClose}>{job?.state === 'complete' ? ui('Cerrar') : ui('Ocultar (continúa en segundo plano)')}</button>
  </aside>;
}
