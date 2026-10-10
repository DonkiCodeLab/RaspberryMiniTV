import React, { useEffect, useRef, useState } from "react";
import { controlMovieTorrent, getMovieTorrents, searchMediaTorrents, startMediaTorrent } from "./api/raspberryApi";
import { hasTorrentLibraryUpdates, isTorrentHistory, mergeTorrentResults, torrentJobTitle, torrentLibraryVersion, torrentQuery, torrentListSize, torrentSize, torrentSources, torrentStrings, sortTorrents } from "./torrentUtils.js";
import refreshWhiteIcon from "./assets/refresh_white.png";
import refreshYellowIcon from "./assets/refresh_yellow.png";
import "./TorrentDownloads.css";
import SectionSwitcher from "./SectionSwitcher.jsx";
import { bookTorrentStrings } from './bookTorrentUtils.js';

export function MediaTorrentSearch({ media, mediaType = "movies", seasonNumber = null, episodeNumber = null, language, onDashboard, onStarted }) {
  const s = torrentStrings(language);
  const isSeries = mediaType === "series";
  const isBook = mediaType === "books";
  const bs = bookTorrentStrings(language);
  const [query, setQuery] = useState(() => torrentQuery(media, mediaType));
  const [season, setSeason] = useState(seasonNumber ?? "");
  const [episode, setEpisode] = useState(episodeNumber ?? "");
  const [searchTerm, setSearchTerm] = useState(() => ({ query: torrentQuery(media, mediaType), seasonNumber, episodeNumber, eztvPage: 1 }));
  const [nextEztvPage, setNextEztvPage] = useState(null);
  const [results, setResults] = useState([]);
  const [sortField, setSortField] = useState("seeds");
  const [sortDirection, setSortDirection] = useState("desc");
  const [sources, setSources] = useState([]);
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
    setLoading(true); setError(""); setDemo(false); setStarted(false);
    if (!searchTerm.append) { setResults([]); setSources([]); setNextEztvPage(null); }
    searchMediaTorrents(searchTerm.query, controller.signal, { ...searchTerm, mediaType, imdbId: media.imdbId }).then(payload => {
      if (!disposed) {
        setResults(current => searchTerm.append ? mergeTorrentResults(current, payload.results || []) : sortTorrents(payload.results));
        setSources(current => searchTerm.append ? [...new Map([...current, ...(payload.sources || [])].map(source => [source.id, source])).values()] : payload.sources || []);
        setNextEztvPage(payload.nextEztvPage ?? null);
        setDemo(Boolean(payload.demo));
      }
    }).catch(e => {
      if (!disposed) setError(e.name === "AbortError" ? `${s.searchTitle}: timeout. ${s.retry}.` : e.message);
    }).finally(() => { clearTimeout(timer); if (!disposed) setLoading(false); });
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [searchTerm, s, mediaType, media.imdbId]);

  async function start(torrent, overwriteExisting = false) {
    setBusy(torrent.infoHash); setError("");
    try {
      const response = await startMediaTorrent(torrent, media, { mediaType, overwriteExisting,
        seasonNumber: searchTerm.seasonNumber, episodeNumber: searchTerm.episodeNumber });
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

  const sortedResults = sortTorrents(results, sortField, sortDirection);
  const sortAria = sortDirection === "asc" ? "ascending" : "descending";
  const sortArrow = sortDirection === "asc" ? "↑" : "↓";
  const unavailableSources = sources.filter(source => source.status === "error").map(source => source.name);
  return <section className="movie-torrents" aria-label={s.searchTitle}>
    <h3>{s.searchTitle}</h3>
    <p>{isBook ? bs.hint : isSeries ? s.seriesHint : s.hint}</p>
    <form className={`movie-torrents__search${isSeries ? " movie-torrents__search--series" : ""}`} onSubmit={event => { event.preventDefault(); if (query.trim()) setSearchTerm({ query: query.trim(),
      seasonNumber: isSeries && season !== "" ? Number(season) : null, episodeNumber: isSeries && episode !== "" ? Number(episode) : null, eztvPage: 1 }); }}>
      <label className="dialog-field"><span>{s.search}</span><input value={query} maxLength={200} onChange={e => setQuery(e.target.value)} /></label>
      {isSeries && <>
        <label className="dialog-field movie-torrents__filter"><span>{s.season}</span><input type="number" min="0" max="99" step="1" placeholder={s.all} value={season} onChange={e => { setSeason(e.target.value); if (e.target.value === "") setEpisode(""); }} /></label>
        <label className="dialog-field movie-torrents__filter"><span>{s.episode}</span><input type="number" min="1" max="999" step="1" placeholder={s.all} disabled={season === ""} value={episode} onChange={e => setEpisode(e.target.value)} /></label>
      </>}
      <button className="dialog-button" disabled={!query.trim() || loading || Boolean(busy)} type="submit">{s.search}</button>
    </form>
    {isSeries && <p className="movie-torrents__providers">{s.eztvHint}</p>}
    {sources.length > 0 && <p className="movie-torrents__providers">{s.sourcesSearched}: {sources.filter(source => source.status !== "skipped").map(source => source.name).join(" · ")}</p>}
    {sources.some(source => source.reason === "missing_imdb") && <p className="movie-torrents__warning" role="status">{s.eztvMissing}</p>}
    {unavailableSources.length > 0 && <p className="movie-torrents__warning" role="status">{s.sourcesUnavailable} {unavailableSources.join(", ")}.</p>}
    {error && <p className="dialog-error" role="alert">{error}</p>}
    {overwriteTorrent && <div className="movie-torrents__overwrite" role="alertdialog" aria-labelledby="torrent-overwrite-title" aria-describedby="torrent-overwrite-copy">
      <h4 id="torrent-overwrite-title">{s.alreadyDownloaded}</h4>
      <p id="torrent-overwrite-copy">{s.overwriteCopy}</p>
      <strong>{media.name}</strong>
      <p className="torrent-job__name">{overwriteTorrent.name}</p>
      <div className="torrent-job__actions">
        <button className="dialog-button dialog-button--accent" disabled={Boolean(busy)} onClick={() => start(overwriteTorrent, true)} type="button">{busy ? s.starting : s.overwrite}</button>
        <button ref={cancelOverwrite} className="dialog-button dialog-button--ghost" disabled={Boolean(busy)} onClick={() => { setOverwriteTorrent(null); setError(""); }} type="button">{s.cancel}</button>
      </div>
    </div>}
    {started ? <div className="movie-torrents__success" role="status"><p>{s.started}</p><button className="dialog-button dialog-button--accent" onClick={onDashboard} type="button">{s.dashboard}</button></div> : <>
      {loading ? <p role="status"><span className="tmdb-cache-spinner" /> {s.searching}</p> : demo ? <p>{s.demo}</p> : !results.length && !error ? <p>{isBook ? bs.empty : isSeries ? s.seriesEmpty : s.empty}</p> : null}
      {results.length > 0 && <>
        <div className="movie-torrents__sort">
          <label className="dialog-field"><span>{s.sortBy}</span>
            <select value={sortField} onChange={event => setSortField(event.target.value)}>
              <option value="sizeBytes">{s.size}</option><option value="seeds">Seeds</option>
            </select>
          </label>
          <label className="dialog-field"><span>{s.sortDirection}</span>
            <select value={sortDirection} onChange={event => setSortDirection(event.target.value)}>
              <option value="asc">{s.ascending}</option><option value="desc">{s.descending}</option>
            </select>
          </label>
        </div>
        <div className="movie-torrents__table"><table>
        <thead><tr><th>{s.name}</th><th>{s.source}</th><th aria-sort={sortField === "sizeBytes" ? sortAria : undefined}>{s.size}{sortField === "sizeBytes" ? ` ${sortArrow}` : ""}</th><th aria-sort={sortField === "seeds" ? sortAria : undefined}>Seeds{sortField === "seeds" ? ` ${sortArrow}` : ""}</th><th><span className="torrent-visually-hidden">{s.download}</span></th></tr></thead>
        <tbody>{sortedResults.map(result => <tr key={result.infoHash}>
          <td>{result.name}</td>
          <td className="movie-torrents__source"><div className="movie-torrents__badges">{torrentSources(result).map(source => <span className="movie-torrents__badge" key={source}>{source}</span>)}</div></td>
          <td>{isBook ? torrentSize(result.sizeBytes, language) : torrentListSize(result.sizeBytes)}</td><td>{result.seeds}</td>
          <td><button className="dialog-button dialog-button--accent" disabled={Boolean(busy) || Boolean(overwriteTorrent)} onClick={() => start(result)} type="button">{busy === result.infoHash ? s.starting : s.download}</button></td>
        </tr>)}</tbody>
      </table></div></>}
      {nextEztvPage !== null && <button className="dialog-button movie-torrents__more" disabled={loading || Boolean(busy)} type="button" onClick={() => setSearchTerm(current => ({ ...current, eztvPage: nextEztvPage, append: true }))}>{s.moreEztv}</button>}
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
  const [selectedGroup, setSelectedGroup] = useState("active");
  const { jobs = [], serviceError, error, busy, action, refresh, loaded, demo } = downloads;
  const groups = [
    { key: "active", title: s.active, jobs: jobs.filter(job => !isTorrentHistory(job)) },
    { key: "history", title: s.history, jobs: jobs.filter(isTorrentHistory) },
  ];
  return <section className="raspberry-dashboard-section torrent-dashboard" aria-labelledby="torrent-downloads-title">
    <div className="torrent-dashboard__header">
      <h2 className="raspberry-dashboard-section__title" id="torrent-downloads-title">{s.title}</h2>
      <button className="raspberry-refresh-button torrent-dashboard__refresh" onClick={refresh} type="button" aria-label={s.refresh} title={s.refresh}>
        <span className="raspberry-refresh-button__icon" aria-hidden="true">
          <img className="raspberry-refresh-button__image is-default" src={refreshWhiteIcon} alt="" />
          <img className="raspberry-refresh-button__image is-hover" src={refreshYellowIcon} alt="" />
        </span>
      </button>
    </div>
    <div className="raspberry-torrents-card">
    <SectionSwitcher idPrefix="torrent" label={s.list}
      tabs={groups.map(group => ({ ...group, count: group.jobs.length }))}
      selected={selectedGroup} onSelect={setSelectedGroup} />
    {(error || serviceError) && <p className="dialog-error" role="alert">{error || serviceError}</p>}
    {groups.map(group => <section className="torrent-dashboard__scroll" key={group.key}
      id={`torrent-${group.key}-panel`} role="tabpanel" aria-labelledby={`torrent-${group.key}-tab`}
      hidden={selectedGroup !== group.key} tabIndex={0}>
      {group.key === "history" && <p className="torrent-dashboard__hint">{s.historyHint}</p>}
      {!group.jobs.length && <p>{demo ? s.demo : !loaded && !error ? s.pending : s.noJobs}</p>}
      <div className="torrent-dashboard__jobs">{group.jobs.map(job => <article className="torrent-job" key={job.id}>
      <div className="torrent-job__heading"><h4>{torrentJobTitle(job)}</h4><span className={`torrent-job__state torrent-job__state--${job.state}`}>{job.mediaType === 'books' && ['importing', 'metadata'].includes(job.state) ? bookTorrentStrings(language).importing : s[job.state] || job.state}</span></div>
      <p className="torrent-job__name">{job.name}</p>
      <p className="torrent-job__sources">{job.mediaType === 'books' ? bookTorrentStrings(language).book : job.mediaType === "series" ? s.series : s.movie}</p>
      <p className="torrent-job__sources">{s.source}: {torrentSources(job).join(" · ")}</p>
      <progress max={100} value={job.progress || 0} aria-label={`${torrentJobTitle(job)}: ${s[job.state]}`} />
      {job.item?.importedEpisodeIds?.length > 0 && <p className="torrent-job__stats">{s.episodesImported}: {job.item.importedEpisodeIds.length}</p>}
      {job.item?.skippedEpisodeIds?.length > 0 && <p className="torrent-job__stats">{s.episodesSkipped}: {job.item.skippedEpisodeIds.length}</p>}
      <p className="torrent-job__stats">{job.progress || 0}% · {torrentSize(job.downloadedBytes, language)} / {torrentSize(job.sizeBytes, language)}{job.state === "downloading" ? ` · ${torrentSize(job.rateBytes, language)}/s${job.eta >= 0 ? ` · ${Math.ceil(job.eta / 60)} min ${s.remaining}` : ""}` : ""}</p>
      {job.error && <p className="dialog-error">{job.error}</p>}
      <div className="torrent-job__actions">
        {["queued", "downloading"].includes(job.state) && <button className="dialog-button" disabled={busy === job.id} onClick={() => action(job.id, "pause")} type="button">{s.pause}</button>}
        {job.state === "paused" && <button className="dialog-button" disabled={busy === job.id} onClick={() => action(job.id, "resume")} type="button">{s.resume}</button>}
        {job.state === "failed" && <button className="dialog-button" disabled={busy === job.id} onClick={() => action(job.id, "retry")} type="button">{s.retry}</button>}
        {!job.item && ["queued", "downloading", "paused", "failed"].includes(job.state) && <button className="dialog-button dialog-button--ghost" disabled={busy === job.id} onClick={() => action(job.id, "cancel")} type="button">{s.cancel}</button>}
        {isTorrentHistory(job) && <button className="dialog-button dialog-button--ghost" disabled={busy === job.id} onClick={() => action(job.id, "remove")} type="button" aria-label={`${s.remove}: ${torrentJobTitle(job)}`}>{s.remove}</button>}
      </div>
    </article>)}</div>
    </section>)}
    </div>
  </section>;
}
