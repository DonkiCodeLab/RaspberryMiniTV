import React, { useEffect, useRef, useState } from 'react';
import { getPictureContentUrl, photoRequest } from './api/raspberryApi.js';
import downloadIcon from './assets/download.png';
import downloadHoverIcon from './assets/download2.png';

function Graphics() {
  return <><img className="movie-download__default" src={downloadIcon} alt="" aria-hidden="true" />
    <img className="movie-download__hover" src={downloadHoverIcon} alt="" aria-hidden="true" /></>;
}

export default function PhotoDownloads({ photo, s }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function metadata() {
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); setError('');
    try {
      const data = await photoRequest(`metadata/${photo.id}`, undefined, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `${photo.name}.json`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { if (!controller.signal.aborted) setError(error.message); }
    finally { pending.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  return <div className="photo-viewer-downloads">
    <div className="photo-download"><a className="movie-download" href={getPictureContentUrl(photo.relativePath, undefined, { download: true })}
      download={photo.name} title={s.downloadOriginal} aria-label={s.downloadOriginal}><Graphics /></a><span>{s.original}</span></div>
    {photo.metadataSource && <div className="photo-download"><button className="movie-download" type="button" onClick={metadata}
      disabled={busy} aria-busy={busy} title={s.downloadMetadata} aria-label={s.downloadMetadata}><Graphics /></button><span>JSON</span></div>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
