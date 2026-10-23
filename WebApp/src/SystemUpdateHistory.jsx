import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { withLanguages } from "./i18n/index.js";
import { formatSystemUpdateDate, systemUpdateCommitUrl } from "./systemUpdateHistory.js";
import { lockBodyScroll } from "./bodyScrollLock.js";
import useBrowserBack from "./useBrowserBack.js";
import "./SystemUpdateHistory.css";

const strings = withLanguages({
  es: {
    last: "Última actualización completada", never: "Todavía no hay actualizaciones completadas.",
    title: "Historial de actualizaciones", success: "Completada", failed: "Fallida",
    unchanged: "Git ya estaba al día. Se recompiló la web y se reiniciaron los servicios.",
    versionChanged: "Se cambió de versión de Git, se recompiló la web y se reiniciaron los servicios. No se añadieron nuevos commits.",
    failedUnchanged: "No se incorporaron nuevos commits. La actualización no se completó.",
    failedChanges: "Git cambió, pero la actualización no llegó a completarse.",
    unavailable: "No se pudo recuperar el resumen de los commits.",
    openTitle: "Abrir commit en GitHub", openCopy: "¿Quieres abrir la descripción de este commit en una nueva pestaña de GitHub?",
    open: "Abrir en una nueva pestaña", cancel: "Cancelar", githubUnavailable: "No se conoce el repositorio de GitHub de esta actualización.",
    version: "Versión", changes: "Commits incorporados", empty: "Las próximas actualizaciones aparecerán aquí con el resumen de sus cambios.",
  },
  ca: {
    last: "Última actualització completada", never: "Encara no hi ha actualitzacions completades.",
    title: "Historial d’actualitzacions", success: "Completada", failed: "Fallida",
    unchanged: "Git ja estava al dia. S’ha recompilat la web i s’han reiniciat els serveis.",
    versionChanged: "S’ha canviat de versió de Git, s’ha recompilat la web i s’han reiniciat els serveis. No s’han afegit nous commits.",
    failedUnchanged: "No s’han incorporat nous commits. L’actualització no s’ha completat.",
    failedChanges: "Git ha canviat, però l’actualització no s’ha arribat a completar.",
    unavailable: "No s’ha pogut recuperar el resum dels commits.",
    openTitle: "Obrir commit a GitHub", openCopy: "Vols obrir la descripció d’aquest commit en una pestanya nova de GitHub?",
    open: "Obrir en una pestanya nova", cancel: "Cancel·lar", githubUnavailable: "No es coneix el repositori de GitHub d’aquesta actualització.",
    version: "Versió", changes: "Commits incorporats", empty: "Les properes actualitzacions apareixeran aquí amb el resum dels canvis.",
  },
  en: {
    last: "Last completed update", never: "No updates have completed yet.",
    title: "Update history", success: "Completed", failed: "Failed",
    unchanged: "Git was already up to date. The web app was rebuilt and services were restarted.",
    versionChanged: "The Git version changed, the web app was rebuilt and services were restarted. No new commits were added.",
    failedUnchanged: "No new commits were added. The update did not complete.",
    failedChanges: "Git changed, but the update did not complete.",
    unavailable: "The commit summary could not be retrieved.",
    openTitle: "Open commit on GitHub", openCopy: "Would you like to open this commit’s description in a new GitHub tab?",
    open: "Open in a new tab", cancel: "Cancel", githubUnavailable: "The GitHub repository for this update is unknown.",
    version: "Version", changes: "Included commits", empty: "Future updates will appear here with a summary of their changes.",
  },
});

function CommitDialog({ commit, t, onClose }) {
  const dialog = useRef(null), titleId = useId(), copyId = useId();
  useBrowserBack(onClose, 50);
  useEffect(() => {
    const element = dialog.current, previous = document.activeElement;
    element.showModal();
    const release = lockBodyScroll();
    return () => {
      element.close();
      release();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<dialog ref={dialog} className="dialog-card dialog-card--compact system-update-commit-dialog"
    aria-labelledby={titleId} aria-describedby={copyId}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="dialog-card__header"><h2 id={titleId}>{t.openTitle}</h2></div>
    <p id={copyId} className="dialog-copy">{t.openCopy}</p>
    <p><code>{commit.hash.slice(0, 8)}</code>: {commit.subject}</p>
    <p className="system-update-commit-dialog__url">{commit.url}</p>
    <div className="dialog-card__actions">
      <button type="button" className="dialog-button dialog-button--ghost" autoFocus onClick={onClose}>{t.cancel}</button>
      <a className="dialog-button dialog-button--accent" href={commit.url} target="_blank" rel="noopener noreferrer" onClick={onClose}>{t.open}</a>
    </div>
  </dialog>, document.body);
}

function HistoryEntry({ entry, repositoryUrl, t, onSelectCommit }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const succeeded = entry.state === "succeeded";
  const commits = Array.isArray(entry.commits) ? entry.commits : null;
  const versionCommit = commits?.find(commit => commit.hash === entry.commit);
  const changed = entry.previousCommit && entry.commit && entry.previousCommit !== entry.commit;
  const repository = Object.hasOwn(entry, "repositoryUrl") ? entry.repositoryUrl : repositoryUrl;
  return <li className="system-update-history__entry">
    <div className="system-update-history__header">
      <time dateTime={entry.completedAt}>{formatSystemUpdateDate(entry.completedAt)}</time>
      <span className={`system-update-history__badge${succeeded ? "" : " system-update-history__badge--failed"}`}>{succeeded ? t.success : t.failed}</span>
    </div>
    <p className="system-update-history__version">
      {entry.commit && <>{t.version}{" "}</>}
      {commits?.length ? <button type="button" className="system-update-history__toggle" aria-expanded={expanded} aria-controls={listId}
        aria-label={`${t.changes}: ${entry.commit?.slice(0, 8) || ""} (${commits.length})`} onClick={() => setExpanded(value => !value)}>
        {entry.commit ? <code>{entry.commit.slice(0, 8)}</code> : t.changes} <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
      </button> : entry.commit ? <code>{entry.commit.slice(0, 8)}</code> : null}
      {versionCommit?.subject && <>: <span>{versionCommit.subject}</span></>}
    </p>
    {!succeeded && commits?.length > 0 && <p>{t.failedChanges}</p>}
    {commits?.length ? <div id={listId} hidden={!expanded}>
      <ul className="system-update-history__commits" role="list" aria-label={t.changes}>
        {commits.map(commit => {
          const url = systemUpdateCommitUrl(repository, commit.hash);
          const label = <><code>{commit.hash.slice(0, 8)}</code>: <span>{commit.subject}</span></>;
          return <li key={commit.hash}>
            {url ? <button type="button" className="system-update-history__commit" aria-haspopup="dialog"
              onClick={() => onSelectCommit({ ...commit, url })}>{label}</button> : <p>{label}</p>}
            {commit.body && <p className="system-update-history__body">{commit.body}</p>}
          </li>;
        })}
      </ul>
      {!systemUpdateCommitUrl(repository, entry.commit || commits[0].hash) && <p className="system-update-history__empty">{t.githubUnavailable}</p>}
    </div> : <p>{commits ? (succeeded ? (changed ? t.versionChanged : t.unchanged) : t.failedUnchanged) : t.unavailable}</p>}
  </li>;
}

export default function SystemUpdateHistory({ language, history = [], lastUpdatedAt, repositoryUrl }) {
  const [selectedCommit, setSelectedCommit] = useState(null);
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
            {entries.map((entry, index) => <HistoryEntry key={entry.runId || `${entry.completedAt}-${index}`}
              entry={entry} repositoryUrl={repositoryUrl} t={t} onSelectCommit={setSelectedCommit} />)}
          </ol>
        </div>
      ) : <p className="system-update-history__empty">{t.empty}</p>}
      {selectedCommit && <CommitDialog commit={selectedCommit} t={t} onClose={() => setSelectedCommit(null)} />}
    </div>
  );
}
