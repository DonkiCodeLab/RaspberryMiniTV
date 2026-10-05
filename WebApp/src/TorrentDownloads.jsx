import React, { useEffect, useRef, useState } from "react";
import { controlMovieTorrent, getMovieTorrents, searchMovieTorrents, startMovieTorrent } from "./api/raspberryApi";
import { hasTorrentLibraryUpdates, isTorrentHistory, torrentLibraryVersion, torrentQuery, torrentSize, torrentStrings, sortTorrents } from "./torrentUtils.js";
import "./TorrentDownloads.css";

export function MovieTorrentSearch({ movie, language, onDashboard, onStarted }) {
  const s = torrentStrings(language);
  const [query, setQuery] = useState(() => torrentQuery(movie));
  const [searchTerm, setSearchTerm] = useState(() => ({ query: torrentQuery(movie) }));
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [started, setStarted] = useState(false);
  const [demo, setDemo] = useState(false);
  const [overwriteTorrent, setOverwriteTorrent] = useState(null);
  const cancelOverwrite = useRef(null);
  useEffect(() => {
    if (overwriteTorrent) {
      cancelOverwrite.current?.focus();
      cancelOverwrite.current?.scrollIntoView({ block: "nearest" });
    }
  }, [overwriteTorrent]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let disposed = false;
    setLoading(true); setError(""); setResults([]);
    searchMovieTorrents(searchTerm.query, controller.signal).then(payload => {
      if (!disposed) { setResults(sortTorrents(payload.results)); setDemo(Boolean(payload.demo)); }
    }).catch(e => {
      if (!disposed) setError(e.name === "AbortError" ? `${s.searchTitle}: timeout. ${s.retry}.` : e.message);
    }).finally(() => { clearTimeout(timer); if (!disposed) setLoading(false); });
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [searchTerm, s]);

  async function start(torrent, overwriteExisting = false) {
    setBusy(torrent.infoHash); setError("");
    try {
      const response = await startMovieTorrent(torrent, movie, overwriteExisting);
      if (response.job?.state === "failed") throw new Error(response.job.error);
      setStarted(true);
      setOverwriteTorrent(null);
      onStarted?.();
    } catch (e) {
      if (e.code === "MOVIE_ALREADY_DOWNLOADED") setOverwriteTorrent(torrent);
      else setError(e.message);
    }
    finally { setBusy(""); }
  }

  return <section className="movie-torrents" aria-label={s.searchTitle}>
    <h3>{s.searchTitle}</h3>
    <p>{s.hint}</p>
    <form className="movie-torrents__search" onSubmit={event => { event.preventDefault(); if (query.trim()) setSearchTerm({ query: query.trim() }); }}>
      <label className="dialog-field"><span>{s.search}</span><input value={query} maxLength={200} onChange={e => setQuery(e.target.value)} /></label>
      <button className="dialog-button" disabled={!query.trim() || loading || Boolean(busy)} type="submit">{s.search}</button>
    </form>
    {error && <p className="dialog-error" role="alert">{error}</p>}
    {overwriteTorrent && <div className="movie-torrents__overwrite" role="alertdialog" aria-labelledby="torrent-overwrite-title" aria-describedby="torrent-overwrite-copy">
      <h4 id="torrent-overwrite-title">{s.alreadyDownloaded}</h4>
      <p id="torrent-overwrite-copy">{s.overwriteCopy}</p>
      <strong>{movie.name}</strong>
      <p className="torrent-job__name">{overwriteTorrent.name}</p>
      <div className="torrent-job__actions">
        <button className="dialog-button dialog-button--accent" disabled={Boolean(busy)} onClick={() => start(overwriteTorrent, true)} type="button">{busy ? s.starting : s.overwrite}</button>
        <button ref={cancelOverwrite} className="dialog-button dialog-button--ghost" disabled={Boolean(busy)} onClick={() => { setOverwriteTorrent(null); setError(""); }} type="button">{s.cancel}</button>
      </div>
    </div>}
    {started ? <div className="movie-torrents__success" role="status"><p>{s.started}</p><button className="dialog-button dialog-button--accent" onClick={onDashboard} type="button">{s.dashboard}</button></div> : <>
      {loading ? <p role="status"><span className="tmdb-cache-spinner" /> {s.searching}</p> : demo ? <p>{s.demo}</p> : !results.length && !error ? <p>{s.empty}</p> : null}
      {results.length > 0 && <div className="movie-torrents__table"><table>
        <thead><tr><th>{s.name}</th><th>{s.size}</th><th aria-sort="descending">Seeds ↓</th><th><span className="torrent-visually-hidden">{s.download}</span></th></tr></thead>
        <tbody>{results.map(result => <tr key={result.infoHash}>
          <td>{result.name}</td><td>{torrentSize(result.sizeBytes, language)}</td><td>{result.seeds}</td>
          <td><button className="dialog-button dialog-button--accent" disabled={Boolean(busy) || Boolean(overwriteTorrent)} onClick={() => start(result)} type="button">{busy === result.infoHash ? s.starting : s.download}</button></td>
        </tr>)}</tbody>
      </table></div>}
    </>}
  </section>;
}

export function useTorrentDownloads(enabled, onLibraryChanged) {
  const [data, setData] = useState({ jobs: [] });
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState("");
  const changed = useRef(onLibraryChanged);
  changed.current = onLibraryChanged;
  const libraryVersion = useRef("");
  useEffect(() => {
    if (!enabled) return;
    let disposed = false, timer;
    const controller = new AbortController();
    async function poll() {
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const next = await getMovieTorrents(controller.signal);
        if (disposed) return;
        setData(next); setError(""); setLoaded(true);
        const version = torrentLibraryVersion(next.jobs || []);
        if (version !== libraryVersion.current) {
          if (hasTorrentLibraryUpdates(libraryVersion.current, version)) await changed.current?.();
          if (!disposed) libraryVersion.current = version;
        }
      } catch (e) { if (!disposed) setError(e.message); }
      finally { clearTimeout(timeout); }
      if (!disposed) timer = setTimeout(() => setRevision(value => value + 1), 5000);
    }
    poll();
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [enabled, revision]);
  async function action(id, nextAction) {
    setBusy(id); setError("");
    try { await controlMovieTorrent(id, nextAction); setRevision(value => value + 1); }
    catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }
  return { ...data, error, loaded, busy, action, refresh: () => setRevision(value => value + 1) };
}

export default function TorrentDownloads({ downloads, language }) {
  const s = torrentStrings(language);
  const { jobs = [], serviceError, error, busy, action, refresh, loaded, demo } = downloads;
  const groups = [
    { key: "active", title: s.active, jobs: jobs.filter(job => !isTorrentHistory(job)) },
    { key: "history", title: s.history, jobs: jobs.filter(isTorrentHistory) },
  ];
  return <section className="raspberry-dashboard-section torrent-dashboard" aria-labelledby="torrent-downloads-title">
    <div className="torrent-dashboard__header"><h2 className="raspberry-dashboard-section__title" id="torrent-downloads-title">{s.title}</h2><button className="dialog-button" onClick={refresh} type="button">{s.refresh}</button></div>
    <div className="raspberry-torrents-card">
    {(error || serviceError) && <p className="dialog-error" role="alert">{error || serviceError}</p>}
    {!jobs.length && <p>{demo ? s.demo : !loaded && !error ? s.pending : s.noJobs}</p>}
    {jobs.length > 0 && <div className="torrent-dashboard__scroll" role="region" aria-label={s.list} tabIndex={0}>
    {groups.filter(group => group.jobs.length).map(group => <section className="torrent-dashboard__group" key={group.key} aria-labelledby={`torrent-${group.key}-title`}>
      <h3 className="torrent-dashboard__group-title" id={`torrent-${group.key}-title`}>{group.title} <span>{group.jobs.length}</span></h3>
      {group.key === "history" && <p className="torrent-dashboard__hint">{s.historyHint}</p>}
      <div className="torrent-dashboard__jobs">{group.jobs.map(job => <article className="torrent-job" key={job.id}>
      <div className="torrent-job__heading"><h4>{job.movie.name}</h4><span className={`torrent-job__state torrent-job__state--${job.state}`}>{s[job.state] || job.state}</span></div>
      <p className="torrent-job__name">{job.name}</p>
      <progress max={100} value={job.progress || 0} aria-label={`${job.movie.name}: ${s[job.state]}`} />
      <p className="torrent-job__stats">{job.progress || 0}% · {torrentSize(job.downloadedBytes, language)} / {torrentSize(job.sizeBytes, language)}{job.state === "downloading" ? ` · ${torrentSize(job.rateBytes, language)}/s${job.eta >= 0 ? ` · ${Math.ceil(job.eta / 60)} min ${s.remaining}` : ""}` : ""}</p>
      {job.error && <p className="dialog-error">{job.error}</p>}
      <div className="torrent-job__actions">
        {["queued", "downloading"].includes(job.state) && <button className="dialog-button" disabled={busy === job.id} onClick={() => action(job.id, "pause")} type="button">{s.pause}</button>}
        {job.state === "paused" && <button className="dialog-button" disabled={busy === job.id} onClick={() => action(job.id, "resume")} type="button">{s.resume}</button>}
        {job.state === "failed" && <button className="dialog-button" disabled={busy === job.id} onClick={() => action(job.id, "retry")} type="button">{s.retry}</button>}
        {!job.item && ["queued", "downloading", "paused", "failed"].includes(job.state) && <button className="dialog-button dialog-button--ghost" disabled={busy === job.id} onClick={() => action(job.id, "cancel")} type="button">{s.cancel}</button>}
        {isTorrentHistory(job) && <button className="dialog-button dialog-button--ghost" disabled={busy === job.id} onClick={() => action(job.id, "remove")} type="button" aria-label={`${s.remove}: ${job.movie.name}`}>{s.remove}</button>}
      </div>
    </article>)}</div>
    </section>)}
    </div>}
    </div>
  </section>;
}
