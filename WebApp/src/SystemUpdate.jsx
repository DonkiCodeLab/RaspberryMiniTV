import { useEffect, useState } from "react";
import { getSystemUpdate, startSystemUpdate, isMockMode } from "./api/raspberryApi";

const strings = {
  es: {
    title: "Actualizar Raspberry y web", button: "Actualizar desde Git", busy: "Actualizando…",
    copy: "Descarga los cambios publicados en main, compila la web y reinicia los servicios. Puede tardar varios minutos y se interrumpirá la reproducción.",
    running: "Actualización en curso. Puedes dejar esta página abierta o volver más tarde.",
    succeeded: "Actualización completada. Recarga la web para utilizar la nueva versión.",
    failed: "La actualización ha fallado. Revisa el registro de minitv-update.service en la Raspberry antes de reintentar.",
    unavailable: "El servicio de actualización todavía no está instalado en la Raspberry.",
    offline: "Esperando conexión con la Raspberry. Los servicios pueden estar reiniciándose…",
    reload: "Recargar web", demo: "Disponible al conectar con una Raspberry real.",
    error: "No se ha podido confirmar el inicio. Consultando el estado de la Raspberry…",
  },
  ca: {
    title: "Actualitzar Raspberry i web", button: "Actualitzar des de Git", busy: "Actualitzant…",
    copy: "Descarrega els canvis publicats a main, compila la web i reinicia els serveis. Pot trigar uns minuts i s’interromprà la reproducció.",
    running: "Actualització en curs. Pots deixar aquesta pàgina oberta o tornar més tard.",
    succeeded: "Actualització completada. Recarrega la web per utilitzar la nova versió.",
    failed: "L’actualització ha fallat. Revisa el registre de minitv-update.service a la Raspberry abans de tornar-ho a provar.",
    unavailable: "El servei d’actualització encara no està instal·lat a la Raspberry.",
    offline: "Esperant connexió amb la Raspberry. Els serveis poden estar reiniciant-se…",
    reload: "Recarregar web", demo: "Disponible en connectar amb una Raspberry real.",
    error: "No s’ha pogut confirmar l’inici. Consultant l’estat de la Raspberry…",
  },
  en: {
    title: "Update Raspberry and web", button: "Update from Git", busy: "Updating…",
    copy: "Downloads changes published to main, builds the web app and restarts the services. This may take several minutes and will interrupt playback.",
    running: "Update in progress. You can leave this page open or come back later.",
    succeeded: "Update complete. Reload the web app to use the new version.",
    failed: "The update failed. Check the minitv-update.service log on the Raspberry before retrying.",
    unavailable: "The update service is not installed on the Raspberry yet.",
    offline: "Waiting for the Raspberry to reconnect. The services may be restarting…",
    reload: "Reload web app", demo: "Available when connected to a real Raspberry.",
    error: "Could not confirm the start. Checking the Raspberry’s status…",
  },
};

export default function SystemUpdate({ language }) {
  const t = strings[language] || strings.es;
  const demo = isMockMode();
  const [status, setStatus] = useState(null);
  const [connected, setConnected] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (demo) return undefined;
    let stopped = false;
    let timer;
    let controller;
    async function poll() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const next = await getSystemUpdate(controller.signal);
        if (!stopped) { setStatus(next); setConnected(true); setError(false); }
      } catch {
        if (!stopped) setConnected(false);
      } finally {
        clearTimeout(timeout);
        if (!stopped) timer = setTimeout(poll, 3000);
      }
    }
    poll();
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
  }, [demo, starting]);

  async function start() {
    setStarting(true);
    setError(false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      setStatus(await startSystemUpdate(controller.signal));
    } catch {
      setError(true);
      setConnected(false);
    } finally {
      clearTimeout(timeout);
      setStarting(false);
    }
  }
  const busy = starting || status?.state === "running";
  const message = demo ? t.demo : error ? t.error : !connected ? t.offline : t[status?.state];
  return (
    <section className="raspberry-dashboard-section" aria-labelledby="dashboard-update-title">
      <h2 className="raspberry-dashboard-section__title" id="dashboard-update-title">{t.title}</h2>
      <article className="raspberry-tmdb-card">
        <p>{t.copy}</p>
        <button className="dialog-button" type="button" disabled={demo || busy || !connected || status?.state === "unavailable"} onClick={start}>
          {busy ? t.busy : t.button}
        </button>
        <p role="status" aria-live="polite">{message || ""}</p>
        {connected && status?.state === "succeeded" ? <button className="dialog-button" type="button" onClick={() => window.location.reload()}>{t.reload}</button> : null}
      </article>
    </section>
  );
}
