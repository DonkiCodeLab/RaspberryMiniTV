import React, { useEffect, useState } from "react";
import { getTmdbCacheStatus, isMockMode } from "./api/raspberryApi";

const labels = {
  es: {
    title: "Contenido TMDB en local", copy: "Guarda fichas, carteles, fondos, logos e imágenes de temporadas y episodios en la Raspberry. Las nuevas incorporaciones se descargan automáticamente. Puedes cerrar esta página durante la descarga.",
    start: "Descargar catálogo / reintentar pendientes", busy: "Preparando…", complete: "completados", pending: "pendientes", failed: "con errores", missing: "Sin ID de TMDB: asigna su ficha para poder descargarlos.", errors: "Detalles de errores", mock: "Conecta con la Raspberry para descargar el catálogo.",
  },
  ca: {
    title: "Contingut TMDB en local", copy: "Desa fitxes, cartells, fons, logos i imatges de temporades i episodis a la Raspberry. Les noves incorporacions es descarreguen automàticament. Pots tancar aquesta pàgina durant la descàrrega.",
    start: "Descarregar catàleg / reintentar pendents", busy: "Preparant…", complete: "completats", pending: "pendents", failed: "amb errors", missing: "Sense ID de TMDB: assigna la seva fitxa per descarregar-los.", errors: "Detalls dels errors", mock: "Connecta amb la Raspberry per descarregar el catàleg.",
  },
  en: {
    title: "Local TMDB content", copy: "Save metadata, posters, backdrops, logos, season and episode artwork on the Raspberry. New additions download automatically. You can close this page while downloads continue.",
    start: "Download catalog / retry pending", busy: "Preparing…", complete: "complete", pending: "pending", failed: "failed", missing: "Missing TMDB ID: assign a title to download its content.", errors: "Error details", mock: "Connect to the Raspberry to download the catalog.",
  },
};

export default function TmdbCachePanel({ language }) {
  const t = labels[language] || labels.es;
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (isMockMode()) return;
    let disposed = false;
    let timer;
    async function poll() {
      try {
        const next = await getTmdbCacheStatus();
        if (!disposed) { setStatus(next); setError(""); }
      } catch (e) { if (!disposed) setError(e.message); }
      if (!disposed) timer = setTimeout(poll, 5000);
    }
    poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, []);
  async function start() {
    setBusy(true);
    try { setStatus(await getTmdbCacheStatus(true)); setError(""); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section className="tmdb-cache-panel">
    <h3>{t.title}</h3>
    <p>{t.copy}</p>
    <button className="dialog-button" type="button" disabled={busy || isMockMode()} onClick={start}>{busy ? t.busy : t.start}</button>
    {isMockMode() && <p>{t.mock}</p>}
    {error && <p role="alert">{error}</p>}
    {status && <div aria-live="polite">
      <p>{status.complete}/{status.total} {t.complete} · {status.pending + status.running} {t.pending} · {status.failed} {t.failed}</p>
      {status.total > 0 && <progress value={status.complete} max={status.total} aria-label={t.title} />}
      {status.current && <p>{status.current}</p>}
      {status.errors?.length > 0 && <details><summary>{t.errors}</summary><ul>{status.errors.map(item => <li key={item.media}>{item.media}: {item.error}</li>)}</ul></details>}
      {status.missingIds?.length > 0 && <details><summary>{status.missingIds.length} — {t.missing}</summary><ul>{status.missingIds.map(path => <li key={path}>{path}</li>)}</ul></details>}
    </div>}
  </section>;
}
