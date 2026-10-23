import React from "react";
import { withLanguages } from "./i18n/index.js";
import { formatSystemUpdateDate } from "./systemUpdateHistory.js";
import "./SystemUpdateHistory.css";

const strings = withLanguages({
  es: {
    last: "Última actualización completada", never: "Todavía no hay actualizaciones completadas.",
    title: "Historial de actualizaciones", success: "Completada", failed: "Fallida",
    unchanged: "Git ya estaba al día. Se recompiló la web y se reiniciaron los servicios.",
    versionChanged: "Se cambió de versión de Git, se recompiló la web y se reiniciaron los servicios. No se añadieron nuevos commits.",
    failedUnchanged: "No se incorporaron nuevos commits. La actualización no se completó.",
    failedChanges: "Git cambió, pero la actualización no llegó a completarse.",
    unavailable: "No se pudo recuperar el resumen de los commits.", details: "Ver descripción del commit",
    version: "Versión", changes: "Commits incorporados", empty: "Las próximas actualizaciones aparecerán aquí con el resumen de sus cambios.",
  },
  ca: {
    last: "Última actualització completada", never: "Encara no hi ha actualitzacions completades.",
    title: "Historial d’actualitzacions", success: "Completada", failed: "Fallida",
    unchanged: "Git ja estava al dia. S’ha recompilat la web i s’han reiniciat els serveis.",
    versionChanged: "S’ha canviat de versió de Git, s’ha recompilat la web i s’han reiniciat els serveis. No s’han afegit nous commits.",
    failedUnchanged: "No s’han incorporat nous commits. L’actualització no s’ha completat.",
    failedChanges: "Git ha canviat, però l’actualització no s’ha arribat a completar.",
    unavailable: "No s’ha pogut recuperar el resum dels commits.", details: "Veure descripció del commit",
    version: "Versió", changes: "Commits incorporats", empty: "Les properes actualitzacions apareixeran aquí amb el resum dels canvis.",
  },
  en: {
    last: "Last completed update", never: "No updates have completed yet.",
    title: "Update history", success: "Completed", failed: "Failed",
    unchanged: "Git was already up to date. The web app was rebuilt and services were restarted.",
    versionChanged: "The Git version changed, the web app was rebuilt and services were restarted. No new commits were added.",
    failedUnchanged: "No new commits were added. The update did not complete.",
    failedChanges: "Git changed, but the update did not complete.",
    unavailable: "The commit summary could not be retrieved.", details: "View commit description",
    version: "Version", changes: "Included commits", empty: "Future updates will appear here with a summary of their changes.",
  },
});

export default function SystemUpdateHistory({ language, history = [], lastUpdatedAt }) {
  const t = strings[language] || strings.es;
  const entries = Array.isArray(history) ? history : [];
  const last = lastUpdatedAt || entries.find(entry => entry.state === "succeeded")?.completedAt;
  const date = formatSystemUpdateDate(last);
  return (
    <div className="system-update-history">
      <p className="system-update-history__last">
        {date ? <>{t.last}: <time dateTime={last}>{date}</time></> : t.never}
      </p>
      <h3 id="system-update-history-title">{t.title} <span>({entries.length})</span></h3>
      {entries.length ? (
        <div className="system-update-history__scroll" role="region" aria-labelledby="system-update-history-title" tabIndex={0}>
          <ol className="system-update-history__list">
            {entries.map((entry, index) => {
              const succeeded = entry.state === "succeeded";
              const commits = Array.isArray(entry.commits) ? entry.commits : null;
              const changed = entry.previousCommit && entry.commit && entry.previousCommit !== entry.commit;
              return (
                <li className="system-update-history__entry" key={entry.runId || `${entry.completedAt}-${index}`}>
                  <div className="system-update-history__header">
                    <time dateTime={entry.completedAt}>{formatSystemUpdateDate(entry.completedAt)}</time>
                    <span className={`system-update-history__badge${succeeded ? "" : " system-update-history__badge--failed"}`}>
                      {succeeded ? t.success : t.failed}
                    </span>
                  </div>
                  {entry.commit && <p className="system-update-history__version">{t.version} <code>{entry.commit.slice(0, 8)}</code></p>}
                  {!succeeded && commits?.length > 0 && <p>{t.failedChanges}</p>}
                  {commits?.length ? (
                    <ul className="system-update-history__commits" aria-label={t.changes}>
                      {commits.map(commit => (
                        <li key={commit.hash}>
                          <div><code>{commit.hash.slice(0, 8)}</code> <span>{commit.subject}</span></div>
                          {commit.body && <details><summary>{t.details}</summary><p className="system-update-history__body">{commit.body}</p></details>}
                        </li>
                      ))}
                    </ul>
                  ) : <p>{commits ? (succeeded ? (changed ? t.versionChanged : t.unchanged) : t.failedUnchanged) : t.unavailable}</p>}
                </li>
              );
            })}
          </ol>
        </div>
      ) : <p className="system-update-history__empty">{t.empty}</p>}
    </div>
  );
}
