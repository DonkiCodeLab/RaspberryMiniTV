import React, { useEffect, useState } from "react";
import { getTorrentUploadSettings, setTorrentUploadSettings } from "./api/raspberryApi";

const labels = {
  es: { title: "Subida a otros usuarios", toggle: "Limitar subida", limit: "Máximo total (kB/s)", save: "Guardar", saving: "Guardando…", saved: "Ajuste guardado", loading: "Cargando ajuste…", retry: "Reintentar", demo: "Conecta con la Raspberry para gestionar la subida.", hint: "Activado: limita la subida de todos los torrents. Desactivado: elimina este límite. Un mínimo de 1 kB/s reduce la subida, pero no la bloquea. Un límite muy bajo puede ralentizar las descargas. Los torrents se detienen al terminar.", alternate: "Hay límites alternativos o un horario configurados en Transmission. Desactívalos allí para gestionar este límite." },
  ca: { title: "Pujada a altres usuaris", toggle: "Limitar pujada", limit: "Màxim total (kB/s)", save: "Desar", saving: "Desant…", saved: "Ajust desat", loading: "Carregant ajust…", retry: "Torna-ho a provar", demo: "Connecta amb la Raspberry per gestionar la pujada.", hint: "Activat: limita la pujada de tots els torrents. Desactivat: elimina aquest límit. Un mínim d’1 kB/s redueix la pujada, però no la bloqueja. Un límit molt baix pot alentir les descàrregues. Els torrents s’aturen en acabar.", alternate: "Hi ha límits alternatius o un horari configurats a Transmission. Desactiva’ls allà per gestionar aquest límit." },
  en: { title: "Upload to other users", toggle: "Limit upload", limit: "Total maximum (kB/s)", save: "Save", saving: "Saving…", saved: "Setting saved", loading: "Loading setting…", retry: "Retry", demo: "Connect to the Raspberry to manage uploads.", hint: "On: limits uploads across all torrents. Off: removes this limit. A minimum of 1 kB/s reduces uploads but does not block them. A very low limit may slow downloads. Torrents stop when downloads finish.", alternate: "Alternative limits or a schedule are configured in Transmission. Disable them there to manage this limit." },
};

export default function TorrentUploadSettings({ language }) {
  const s = labels[String(language).slice(0, 2)] || labels.es;
  const [settings, setSettings] = useState(null);
  const [limited, setLimited] = useState(false);
  const [limit, setLimit] = useState("100");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let disposed = false;
    setError("");
    getTorrentUploadSettings(controller.signal).then(value => {
      if (disposed) return;
      setSettings(value); setLimited(Boolean(value.limited)); setLimit(String(value.limitKBps ?? 100));
    }).catch(e => { if (!disposed) setError(e.message); }).finally(() => clearTimeout(timeout));
    return () => { disposed = true; controller.abort(); clearTimeout(timeout); };
  }, [revision]);
  async function save(event) {
    event.preventDefault();
    setBusy(true); setError(""); setSaved(false);
    try {
      const value = await setTorrentUploadSettings({ limited, limitKBps: limited ? Number(limit) : Math.max(1, settings.limitKBps) });
      setSettings(value); setLimited(value.limited); setLimit(String(value.limitKBps)); setSaved(true);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const disabled = !settings || settings.demo || settings.alternateLimits || busy;
  return <form className="torrent-upload" onSubmit={save} aria-labelledby="torrent-upload-title">
    <h3 id="torrent-upload-title">{s.title}</h3>
    <p className="torrent-dashboard__hint" id="torrent-upload-hint">{s.hint}</p>
    {!settings && !error && <p role="status">{s.loading}</p>}
    {settings?.demo && <p>{s.demo}</p>}
    {settings?.alternateLimits && <p role="status">{s.alternate}</p>}
    <div className="torrent-upload__controls">
      <label className="torrent-upload__switch"><input type="checkbox" role="switch" checked={limited} disabled={disabled} aria-describedby="torrent-upload-hint" onChange={e => { setLimited(e.target.checked); setSaved(false); }} /><span>{s.toggle}</span></label>
      <label className="dialog-field"><span>{s.limit}</span><input type="number" min="1" max="1000000" step="1" required value={limit} disabled={disabled || !limited} onChange={e => { setLimit(e.target.value); setSaved(false); }} /></label>
      <button type="submit" className="dialog-button" disabled={disabled || (limited && (!Number.isInteger(Number(limit)) || Number(limit) < 1 || Number(limit) > 1000000))}>{busy ? s.saving : s.save}</button>
    </div>
    {saved && <p role="status">{s.saved}</p>}
    {error && <p className="dialog-error" role="alert">{error}</p>}
    {!settings && error && <button className="dialog-button" type="button" onClick={() => setRevision(v => v + 1)}>{s.retry}</button>}
  </form>;
}
