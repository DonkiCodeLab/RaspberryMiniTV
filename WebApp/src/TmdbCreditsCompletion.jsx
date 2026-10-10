import React, { useEffect, useRef, useState } from "react";
import { clearLocalMetadataCache, getTmdbCreditsStatus, isMockMode } from "./api/raspberryApi";

const strings = {
  es: {
    title: "Reparto y equipo", copy: "Completa las fichas de tus películas y series con actores, personajes, dirección y guion de TMDB.",
    start: "Completar todas las fichas", retry: "Reintentar pendientes", working: "Completando fichas…", ready: "fichas completadas",
    remaining: "pendientes", failed: "con errores", loading: "Comprobando las fichas…", empty: "Todavía no hay películas ni series con ficha TMDB.",
    error: "No se pudo consultar o iniciar la descarga. Comprueba la conexión y que la Raspberry esté actualizada.",
    missing: "Estas fichas necesitan una coincidencia de TMDB:", demo: "Conecta con la Raspberry para completar las fichas.",
    refresh: "Actualizar estado", done: "Todas las fichas identificadas tienen sus créditos guardados.",
    continues: "La descarga continúa aunque cierres esta página.",
  },
  ca: {
    title: "Repartiment i equip", copy: "Completa les fitxes de les teves pel·lícules i sèries amb actors, personatges, direcció i guió de TMDB.",
    start: "Completa totes les fitxes", retry: "Torna a provar les pendents", working: "Completant fitxes…", ready: "fitxes completades",
    remaining: "pendents", failed: "amb errors", loading: "Comprovant les fitxes…", empty: "Encara no hi ha pel·lícules ni sèries amb fitxa TMDB.",
    error: "No s'ha pogut consultar o iniciar la baixada. Comprova la connexió i que la Raspberry estigui actualitzada.",
    missing: "Aquestes fitxes necessiten una coincidència de TMDB:", demo: "Connecta amb la Raspberry per completar les fitxes.",
    refresh: "Actualitza l’estat", done: "Totes les fitxes identificades tenen els crèdits desats.",
    continues: "La baixada continua encara que tanquis aquesta pàgina.",
  },
  en: {
    title: "Cast and crew", copy: "Complete your movie and TV profiles with actors, characters, directors and writers from TMDB.",
    start: "Complete all profiles", retry: "Retry remaining profiles", working: "Completing profiles…", ready: "profiles completed",
    remaining: "remaining", failed: "failed", loading: "Checking profiles…", empty: "There are no movies or TV shows with a TMDB profile yet.",
    error: "Could not check or start the download. Check the connection and update your Raspberry if needed.",
    missing: "These profiles need a TMDB match:", demo: "Connect to your Raspberry to complete profiles.",
    refresh: "Refresh status", done: "All identified profiles have their credits saved.",
    continues: "The download continues after you close this page.",
  },
};

export default function TmdbCreditsCompletion({ language = "es" }) {
  const s = strings[language] || strings.es;
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(false);
  const [starting, setStarting] = useState(false);
  const [checking, setChecking] = useState(false);
  const mounted = useRef(false);
  const pending = useRef(false);
  const previousReady = useRef(null);
  const timer = useRef(null);
  const demo = isMockMode();

  async function refresh(start = false) {
    if (pending.current || demo) return;
    pending.current = true;
    clearTimeout(timer.current);
    setChecking(true);
    if (start) setStarting(true);
    try {
      const next = await getTmdbCreditsStatus(start);
      if (!mounted.current) return;
      setStatus(next);
      setError(false);
      if (previousReady.current !== null && previousReady.current !== next.ready) clearLocalMetadataCache();
      previousReady.current = next.ready;
      timer.current = setTimeout(() => refresh(), next.pending || next.running ? 3000 : 15000);
    } catch {
      if (mounted.current) {
        setError(true);
        timer.current = setTimeout(() => refresh(), 15000);
      }
    } finally {
      pending.current = false;
      if (mounted.current) { setStarting(false); setChecking(false); }
    }
  }

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => { mounted.current = false; clearTimeout(timer.current); };
  }, []);

  const active = Boolean(status?.pending || status?.running || starting);
  return <section className="tmdb-cache-panel" aria-label={s.title}>
    <h3>{s.title}</h3>
    <p>{s.copy}</p>
    {demo ? <p>{s.demo}</p> : <>
      {!status && !error && <p role="status">{s.loading}</p>}
      {status && <>
        <p role="status">{status.total ? `${status.ready} / ${status.total} ${s.ready} · ${status.remaining} ${s.remaining}${status.failed ? ` · ${status.failed} ${s.failed}` : ""}` : s.empty}</p>
        {status.total > 0 && <progress value={status.ready} max={status.total} aria-label={s.ready} style={{ width: "100%", accentColor: "#ffd429" }} />}
        {active && <p>{s.continues}</p>}
        {status.total > 0 && !status.remaining && <p>{s.done}</p>}
        {!!status.missingIds?.length && <details><summary>{s.missing} ({status.missingIds.length})</summary><ul>{status.missingIds.map(path => <li key={path}>{path}</li>)}</ul></details>}
        {!!status.errors?.length && <details><summary>{status.errors.length} {s.failed}</summary><ul>{status.errors.map(item => <li key={item.media}>{item.name}: {item.error}</li>)}</ul></details>}
      </>}
      {error && <p role="alert" className="dialog-error">{s.error}</p>}
      <div className="dialog-actions">
        <button type="button" className="dialog-button" disabled={active || checking || !status?.remaining} onClick={() => refresh(true)}>{active ? s.working : status?.failed ? s.retry : s.start}</button>
        <button type="button" className="dialog-button" disabled={checking} onClick={() => refresh()}>{s.refresh}</button>
      </div>
    </>}
  </section>;
}
