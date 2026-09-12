import React, { useEffect, useRef, useState } from 'react';
import { getTmdbCacheStatus } from './api/raspberryApi';

export default function TmdbUploadProgress({ upload, onReady, onClose }) {
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const ready = useRef(onReady);
  ready.current = onReady;
  useEffect(() => {
    if (!upload) return;
    let disposed = false, timer;
    setJob(null); setError('');
    async function poll() {
      try {
        const status = await getTmdbCacheStatus();
        if (disposed) return;
        const next = status.jobs?.[`${upload.kind}/${upload.id}`];
        setJob(next); setError('');
        if (next?.state === 'complete' && upload.videoComplete) { ready.current(); return; }
        if (next?.state === 'failed' || next?.state === 'cancelled') return;
      } catch (e) { if (!disposed) setError(e.message); }
      if (!disposed) timer = setTimeout(poll, 1500);
    }
    poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [upload?.kind, upload?.id, upload?.videoComplete]);
  if (!upload) return null;
  const phase = { metadata: 'Guardando fichas de TMDB', images: 'Descargando imágenes', thumbnails: 'Generando miniaturas' }[job?.progress?.phase];
  return <aside className="tmdb-upload-progress" role="status" aria-live="polite">
    <strong>Preparación de {upload.name}</strong>
    <p>Vídeos: {upload.videoComplete ? 'guardados' : 'subida en curso (progreso en el diálogo de subida)'}</p>
    <p>TMDB: {job?.state === 'complete' ? 'Listo en local' : job?.state === 'failed' ? 'Preparación incompleta' : job?.state === 'cancelled' ? 'Cancelado' : phase || 'En cola'}</p>
    {job?.state === 'running' && <><progress value={job.progress?.total ? job.progress.completed : undefined} max={job.progress?.total || 1} /><p>{job.progress?.completed || 0}{job.progress?.total ? ` / ${job.progress.total}` : ''} ficheros · {job.progress?.current}</p></>}
    {(error || job?.error) && <p role="alert">{error || job.error}</p>}
    <button className="dialog-button" type="button" onClick={onClose}>{job?.state === 'complete' ? 'Cerrar' : 'Ocultar (continúa en segundo plano)'}</button>
  </aside>;
}
