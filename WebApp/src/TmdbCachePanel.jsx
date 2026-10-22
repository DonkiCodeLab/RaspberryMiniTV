import { intlLocale } from "./i18n/languages.js";
import { withLanguages } from "./i18n/index.js";
import LoadingSpinner from "./LoadingSpinner.jsx";
import React, { useState } from "react";
import useTmdbStatus from "./useTmdbStatus.js";
import { getTmdbCacheStatus, cancelTmdbCacheDownload, discardTmdbCacheImage, isMockMode } from "./api/raspberryApi";
import TmdbFailureList, { tmdbFailureKey } from "./TmdbFailureList.jsx";

const labels = withLanguages({
  es: {
    loading: "Comprobando el contenido TMDB local…", refresh: "Actualizar estado", error: "No se pudo consultar el estado del contenido TMDB local.",
    ignored: "imágenes descartadas", ignoredOne: "imagen descartada", discarded: "Imagen descartada. No volverá a descargarse ni a utilizarse.",
    calculating: "Calculando el espacio de TMDB en segundo plano…",
    storage: "Espacio de la caché", disk: "del disco", storageUnavailable: "No se pudo consultar el espacio de la caché.",
    downloading: "Descarga en curso…", cancel: "Cancelar descarga", cancelling: "Cancelando…", cancelled: "cancelados", resume: "Reanudar descarga", stopped: "Descarga cancelada. Se conserva todo lo descargado. Una petición en curso puede tardar unos segundos en detenerse.",
    title: "Contenido TMDB en local", copy: "Guarda fichas, carteles, fondos, logos e imágenes de temporadas y episodios en la Raspberry. Las nuevas incorporaciones se descargan automáticamente. Puedes cerrar esta página durante la descarga.",
    start: "Descargar catálogo / reintentar pendientes", busy: "Preparando…", complete: "completados", pending: "pendientes", failed: "con errores", missing: "Sin ID de TMDB: asigna su ficha para poder descargarlos.", errors: "Detalles de errores", mock: "Conecta con la Raspberry para descargar el catálogo.",
  },
  ca: {
    loading: "Comprovant el contingut TMDB local…", refresh: "Actualitzar l’estat", error: "No s’ha pogut consultar l’estat del contingut TMDB local.",
    ignored: "imatges descartades", ignoredOne: "imatge descartada", discarded: "Imatge descartada. No es tornarà a descarregar ni a utilitzar.",
    calculating: "Calculant l’espai de TMDB en segon pla…",
    storage: "Espai de la memòria cau", disk: "del disc", storageUnavailable: "No s’ha pogut consultar l’espai de la memòria cau.",
    downloading: "Descàrrega en curs…", cancel: "Cancel·lar descàrrega", cancelling: "Cancel·lant…", cancelled: "cancel·lats", resume: "Reprendre descàrrega", stopped: "Descàrrega cancel·lada. Es conserva tot el que s’ha descarregat. Una petició en curs pot trigar uns segons a aturar-se.",
    title: "Contingut TMDB en local", copy: "Desa fitxes, cartells, fons, logos i imatges de temporades i episodis a la Raspberry. Les noves incorporacions es descarreguen automàticament. Pots tancar aquesta pàgina durant la descàrrega.",
    start: "Descarregar catàleg / reintentar pendents", busy: "Preparant…", complete: "completats", pending: "pendents", failed: "amb errors", missing: "Sense ID de TMDB: assigna la seva fitxa per descarregar-los.", errors: "Detalls dels errors", mock: "Connecta amb la Raspberry per descarregar el catàleg.",
  },
  en: {
    loading: "Checking local TMDB content…", refresh: "Refresh status", error: "Could not check the status of local TMDB content.",
    ignored: "discarded images", ignoredOne: "discarded image", discarded: "Image discarded. It will no longer be downloaded or used.",
    calculating: "Calculating TMDB storage in the background…",
    storage: "Cache storage", disk: "of disk", storageUnavailable: "Cache storage usage is unavailable.",
    downloading: "Download in progress…", cancel: "Cancel download", cancelling: "Cancelling…", cancelled: "cancelled", resume: "Resume download", stopped: "Download cancelled. Downloaded files are retained. An in-flight request may take a few seconds to stop.",
    title: "Local TMDB content", copy: "Save metadata, posters, backdrops, logos, season and episode artwork on the Raspberry. New additions download automatically. You can close this page while downloads continue.",
    start: "Download catalog / retry pending", busy: "Preparing…", complete: "complete", pending: "pending", failed: "failed", missing: "Missing TMDB ID: assign a title to download its content.", errors: "Error details", mock: "Connect to the Raspberry to download the catalog.",
  },
});

export default function TmdbCachePanel({ language, onArtworkChange }) {
  const t = labels[language] || labels.es;
  const [notice, setNotice] = useState("");
  const demo = isMockMode();
  const { status, error, busy, run } = useTmdbStatus(signal => getTmdbCacheStatus(false, signal), { enabled: !demo });
  const number = (value) => Number(value).toLocaleString(intlLocale(language), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const amount = (value) => value > 0 && value < 0.01 ? `< ${number(0.01)}` : number(value);
  const active = Boolean(status?.pending || status?.running);
  const showStatus = status && (!busy || busy === "poll") && !error;
  async function runAction(cancel = false) {
    setNotice("");
    await run(cancel ? "cancel" : "start", signal => cancel ? cancelTmdbCacheDownload() : getTmdbCacheStatus(true, signal));
  }
  async function discard(item) {
    setNotice("");
    await run(tmdbFailureKey(item), async () => {
      const next = await discardTmdbCacheImage(item.media, item.path);
      await onArtworkChange?.();
      setNotice(t.discarded);
      return next;
    });
  }
  return <section className="tmdb-cache-panel" aria-busy={Boolean(busy)}>
    <h3>{t.title}</h3>
    <p>{t.copy}</p>
    {!demo && busy && <p className="tmdb-cache-calculating" role="status"><LoadingSpinner inline />{busy === "refresh" || busy === "poll" ? t.loading : busy === "cancel" ? t.cancelling : t.busy}</p>}
    {!demo && !busy && !error && status?.storage?.calculating && <p className="tmdb-cache-calculating" role="status"><LoadingSpinner inline />{t.calculating}</p>}
    {showStatus && !status.storage?.calculating && (status?.storage?.available ? <div className="tmdb-cache-storage">
      <strong>{t.storage}: {amount(status.storage.gb)} GB · {amount(status.storage.percent)} % {t.disk}</strong>
    </div> : status?.storage && !status.storage.calculating && <p>{t.storageUnavailable}</p>)}
    <button className="dialog-button" type="button" disabled={Boolean(busy) || Boolean(error) || active || !status || demo} onClick={() => runAction()}>{busy === "start" ? t.busy : active ? t.downloading : status?.cancelled ? t.resume : t.start}</button>
    {active && <button className="dialog-button" type="button" disabled={Boolean(busy)} onClick={() => runAction(true)}>{busy === "cancel" ? t.cancelling : t.cancel}</button>}
    {showStatus && !active && status?.cancelled > 0 && <p role="status">{t.stopped}</p>}
    {demo && <p>{t.mock}</p>}
    {error && <><p role="alert" className="dialog-error">{error.message || t.error}</p><button className="dialog-button" type="button" onClick={() => { setNotice(""); run(); }}>{t.refresh}</button></>}
    {notice && <p role="status">{notice}</p>}
    {showStatus && <div aria-live="polite">
      <p>{status.complete}/{status.total} {t.complete} · {status.pending + status.running} {t.pending} · {status.failed} {t.failed}{status.cancelled > 0 && <> · {status.cancelled} {t.cancelled}</>}</p>
      {status.total > 0 && <progress value={status.complete} max={status.total} aria-label={t.title} />}
      {status.ignoredImages > 0 && <p>{status.ignoredImages} {status.ignoredImages === 1 ? t.ignoredOne : t.ignored}</p>}
      {status.current && <p>{status.current}</p>}
      <TmdbFailureList errors={status.errors} language={language} busy={busy} onDiscard={discard} />
      {status.missingIds?.length > 0 && <details><summary>{status.missingIds.length} — {t.missing}</summary><ul>{status.missingIds.map(path => <li key={path}>{path}</li>)}</ul></details>}
    </div>}
  </section>;
}
