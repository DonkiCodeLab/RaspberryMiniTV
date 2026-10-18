import { lockBodyScroll } from "./bodyScrollLock.js";
import LoadingSpinner from "./LoadingSpinner.jsx";
import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { controlMovieTorrent, getMovieTorrents, previewTorrent, searchMediaTorrents, startMediaTorrent } from "./api/raspberryApi";
import { hasTorrentLibraryUpdates, isTorrentHistory, mergeTorrentResults, torrentJobTitle, torrentLibraryVersion, torrentQuery, torrentListSize, torrentSize, torrentSources, torrentStrings, sortTorrents, upsertTorrentJob, torrentJobGroup } from "./torrentUtils.js";
import refreshWhiteIcon from "./assets/refresh_white.png";
import refreshYellowIcon from "./assets/refresh_yellow.png";
import "./TorrentDownloads.css";
import SectionSwitcher from "./SectionSwitcher.jsx";
import TorrentUploadSettings from "./TorrentUploadSettings.jsx";
import TorrentTraffic from "./TorrentTraffic.jsx";
import { bookTorrentStrings } from './bookTorrentUtils.js';
import { completedTorrentNotifications, torrentNotificationKey, wantsTorrentNotification } from "./torrentNotifications.js";
import FreeDownloadDialog from "./FreeDownloadDialog.jsx";
import { freeDownloadStrings } from "./freeDownloadStrings.js";

export function TorrentNotificationBadge({ count, className = "" }) {
  return count > 0 ? <span className={`series-hero__download-badge ${className}`.trim()} aria-hidden="true">{count > 99 ? "99+" : count}</span> : null;
}

export function TorrentNotificationBell({ notifications = [], language, onViewDownloads }) {
  const strings = torrentStrings(language);
  const [open, setOpen] = useState(false);
  const host = useRef(null);
  const trigger = useRef(null);
  const panelId = useId();
  const count = notifications.length;
  const label = count > 0 ? `${strings.notificationsTitle} (${count})` : strings.notificationsTitle;
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!host.current?.contains(event.target)) setOpen(false); };
    const keyboard = event => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keyboard);
    };
  }, [open]);
  return <div className="torrent-notifications" ref={host} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button className="torrent-notification-bell" type="button" ref={trigger} onClick={() => setOpen(value => !value)}
      aria-expanded={open} aria-controls={open ? panelId : undefined} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 10h18c0-3-3-3-3-10M10 21a2 2 0 0 0 4 0" />
      </svg>
      <TorrentNotificationBadge count={count} className="torrent-notification-bell__badge" />
    </button>
    {open && <section className="torrent-notifications__panel" id={panelId} aria-labelledby={`${panelId}-title`}>
      <h2 id={`${panelId}-title`}>{strings.notificationsTitle}</h2>
      {count > 0 ? <ul className="torrent-notifications__list" tabIndex={0} aria-label={strings.notificationsTitle}>
        {notifications.map(job => <li key={torrentNotificationKey(job)}>{torrentJobTitle(job)}</li>)}
      </ul> : <p className="torrent-notifications__empty">{strings.noNotifications}</p>}
      <button className="torrent-notifications__view" type="button" onClick={() => {
        setOpen(false);
        onViewDownloads();
      }}>{strings.viewDownloads}</button>
    </section>}
  </div>;
}

export function TorrentContentPreview({ torrent, language, mediaType }) {
  const s = torrentStrings(language);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false, timer;
    const deadline = Date.now() + 60000;
    setData(null); setError("");
    async function poll() {
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const next = await previewTorrent(torrent.infoHash, controller.signal);
        if (disposed) return;
        if (next.status === "ready") setData(next);
        else if (Date.now() >= deadline) setError(s.previewTimeout);
        else timer = setTimeout(poll, 1500);
      } catch (e) {
        if (!disposed) setError(e.name === "AbortError" ? s.previewTimeout : e.message);
      } finally { clearTimeout(timeout); }
    }
    poll();
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [torrent.infoHash, attempt, s]);
  const files = data?.files || [];
  const episodes = new Set(files.flatMap(file => (file.episodes || []).map(ep => `${ep.season}-${ep.episode}`)));
  return <section className="torrent-preview" aria-label={`${s.content}: ${torrent.name}`}>
    <h4>{s.content}</h4>
    <p>{s.previewHint}</p>
    {!data && !error && <p role="status"><LoadingSpinner inline /> {s.previewLoading}</p>}
    {error && <><p className="dialog-error" role="alert">{error}</p><button type="button" className="dialog-button" onClick={() => setAttempt(value => value + 1)}>{s.retry}</button></>}
    {data && <>
      <p>{files.length} {s.files} · {torrentSize(data.sizeBytes, language)}{mediaType !== "generic" && <> · {episodes.size} {s.detectedEpisodes}</>}</p>
      {mediaType !== "generic" && <p>{s.episodeDetectionHint}</p>}
      {files.length ? <ul className="torrent-preview__files" tabIndex={0} aria-label={s.files}>
        {files.map((file, index) => <li key={index}>
          <span className="torrent-preview__name">{file.name}</span>
          <span>{torrentSize(file.sizeBytes, language)}</span>
          {mediaType !== "generic" && file.episodes?.length > 0 && <span className="torrent-preview__episodes">{file.episodes.map(ep => `S${String(ep.season).padStart(2, "0")}E${String(ep.episode).padStart(2, "0")}`).join(" · ")}</span>}
        </li>)}
      </ul> : <p>{s.noFiles}</p>}
    </>}
  </section>;
}

export function MediaTorrentSearch({ media, mediaType = "movies", seasonNumber = null, episodeNumber = null, language, onDashboard, onStarted, jobs = [], onRefresh, notificationPreferences = {}, notificationsReady = false, onNotificationChange }) {
  const s = torrentStrings(language);
  const fs = freeDownloadStrings(language);
  const isGeneric = mediaType === "generic";
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
  const [loading, setLoading] = useState(Boolean(searchTerm.query));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const startRequest = useRef(null);
  const [startError, setStartError] = useState(null);
  const [started, setStarted] = useState(false);
  const [startedJob, setStartedJob] = useState(null);
  const [demo, setDemo] = useState(false);
  const [overwriteTorrent, setOverwriteTorrent] = useState(null);
  const [previewHash, setPreviewHash] = useState("");
  const previewId = useId();
  const cancelOverwrite = useRef(null);
  useEffect(() => () => startRequest.current?.abort(), []);
  useEffect(() => {
    if (overwriteTorrent) {
      cancelOverwrite.current?.focus();
      cancelOverwrite.current?.scrollIntoView({ block: "nearest" });
    }
  }, [overwriteTorrent]);
  useEffect(() => {
    if (!searchTerm.query) { setLoading(false); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let disposed = false;
    setLoading(true); setError(""); setStartError(null); setDemo(false); setStarted(false); setStartedJob(null);
    if (!searchTerm.append) { setPreviewHash(""); setResults([]); setSources([]); setNextEztvPage(null); }
    searchMediaTorrents(searchTerm.query, controller.signal, { ...searchTerm, mediaType, imdbId: media?.imdbId }).then(payload => {
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
  }, [searchTerm, s, mediaType, media?.imdbId]);

  async function start(torrent, overwriteExisting = false) {
    if (startRequest.current) return;
    const existing = isGeneric && jobs.find(job => job.id === torrent.infoHash && job.state !== "cancelled");
    if (existing) { onDashboard?.(existing); return; }
    const controller = new AbortController();
    startRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    setBusy(torrent.infoHash); setError(""); setStartError(null); setStarted(false); setStartedJob(null);
    try {
      const response = await startMediaTorrent(torrent, media, { mediaType, overwriteExisting,
        seasonNumber: searchTerm.seasonNumber, episodeNumber: searchTerm.episodeNumber, signal: controller.signal });
      if (!response?.job?.id) throw new Error(s.startUnconfirmed);
      setStartedJob(response.job);
      setStarted(true);
      setOverwriteTorrent(null);
      onStarted?.(response.job);
    } catch (e) {
      if (e.code === "MOVIE_ALREADY_DOWNLOADED") setOverwriteTorrent(torrent);
      else {
        setStartError({ id: torrent.infoHash, message: e.name === "AbortError" ? s.startUnconfirmed : e.message });
        onRefresh?.();
      }
    }
    finally { clearTimeout(timeout); startRequest.current = null; setBusy(""); }
  }

  const sortedResults = sortTorrents(results, sortField, sortDirection);
  const sortAria = sortDirection === "asc" ? "ascending" : "descending";
  const sortArrow = sortDirection === "asc" ? "↑" : "↓";
  const unavailableSources = sources.filter(source => source.status === "error").map(source => source.name);
  return <section className="movie-torrents" aria-label={isGeneric ? fs.search : s.searchTitle}>
    <h3>{isGeneric ? fs.search : s.searchTitle}</h3>
    <p>{isGeneric ? fs.hint : isBook ? bs.hint : isSeries ? s.seriesHint : s.hint}</p>
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
    {started && <div className="movie-torrents__success">
      <p role="status">{startedJob?.state === "failed" ? startedJob.error : isGeneric ? fs.added : s.started} <strong>{startedJob?.name}</strong></p>
      {startedJob?.id && <label className="movie-torrents__notify">
        <input type="checkbox" checked={wantsTorrentNotification(startedJob, notificationPreferences)}
          disabled={!notificationsReady || !onNotificationChange}
          onChange={event => onNotificationChange?.(torrentNotificationKey(startedJob), event.target.checked)} />
        <span>{s.notify}</span>
      </label>}
      <button className="dialog-button dialog-button--accent" onClick={() => onDashboard?.(startedJob)} type="button">{s.dashboard}</button>
    </div>}
    {(!started || isGeneric) && <>
      {loading ? <p role="status"><LoadingSpinner inline /> {s.searching}</p> : demo ? <p>{s.demo}</p> : !results.length && !error ? <p>{isGeneric ? searchTerm.query ? fs.emptySearch : fs.prompt : isBook ? bs.empty : isSeries ? s.seriesEmpty : s.empty}</p> : null}
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
        <tbody>{sortedResults.map(result => {
          const existing = isGeneric && jobs.find(job => job.id === result.infoHash && job.state !== "cancelled");
          const submitting = busy === result.infoHash;
          const failure = startError?.id === result.infoHash ? startError.message : "";
          return <React.Fragment key={result.infoHash}><tr>
          <td>{result.name}</td>
          <td className="movie-torrents__source"><div className="movie-torrents__badges">{torrentSources(result).map(source => <span className="movie-torrents__badge" key={source}>{source}</span>)}</div></td>
          <td>{isBook ? torrentSize(result.sizeBytes, language) : torrentListSize(result.sizeBytes)}</td><td>{result.seeds}</td>
          <td><div className="torrent-preview__actions"><button className="dialog-button dialog-button--ghost" type="button"
            aria-expanded={previewHash === result.infoHash} aria-controls={previewHash === result.infoHash ? previewId : undefined}
            onClick={() => setPreviewHash(current => current === result.infoHash ? "" : result.infoHash)}>{previewHash === result.infoHash ? s.hideContent : s.viewContent}</button>
            <button className="dialog-button dialog-button--accent" disabled={Boolean(busy) || Boolean(overwriteTorrent)} aria-busy={submitting}
              onClick={() => existing ? onDashboard?.(existing) : start(result)} type="button">{submitting ? <><LoadingSpinner inline /> {s.starting}</> : existing ? s.viewDownloads : s.download}</button></div>
            {submitting && <p className="movie-torrents__result-status" role="status">{s.sendingDownload}</p>}
            {existing && <p className="movie-torrents__result-status">{existing.state === "complete" ? fs.ready : s[existing.state]}{existing.state === "downloading" ? ` · ${existing.progress || 0}%` : ""}</p>}
            {failure && <p className="dialog-error movie-torrents__result-status" role="alert">{failure}</p>}
          </td>
        </tr>{previewHash === result.infoHash && <tr><td colSpan={5} id={previewId}><TorrentContentPreview torrent={result} language={language} mediaType={mediaType} /></td></tr>}</React.Fragment>;
        })}</tbody>
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
  const libraryVersion = useRef(null);
  const requestVersion = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false, timer;
    const version = ++requestVersion.current;
    const isCurrent = () => !disposed && version === requestVersion.current;
    const controller = new AbortController();
    async function poll() {
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const next = await getMovieTorrents(controller.signal);
        if (!isCurrent()) return;
        setData(next); setError("");
        const nextLibraryVersion = torrentLibraryVersion(next.jobs || []);
        if (nextLibraryVersion !== libraryVersion.current) {
          if (hasTorrentLibraryUpdates(libraryVersion.current, nextLibraryVersion)) await changed.current?.();
          if (isCurrent()) libraryVersion.current = nextLibraryVersion;
        }
      } catch (e) { if (isCurrent()) setError(e.message); }
      finally {
        clearTimeout(timeout);
        if (isCurrent()) setLoaded(true);
      }
      if (isCurrent()) timer = setTimeout(() => setRevision(value => value + 1), 5000);
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
  function recordJob(job) {
    // The POST response is authoritative. Do not wait for polling to show it or
    // let a GET started before it replace the list with an older snapshot.
    requestVersion.current += 1;
    if (job?.id) setData(current => ({ ...current, jobs: upsertTorrentJob(current.jobs || [], job) }));
    setRevision(value => value + 1);
  }
  return { ...data, error, loaded, busy, action, recordJob, refresh: () => setRevision(value => value + 1) };
}

function TorrentMovieNotice({ notice, strings: s, onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    dialog.showModal();
    const releaseScroll = lockBodyScroll();
    return () => {
      dialog.close();
      releaseScroll();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return createPortal(<dialog ref={dialogRef} className="dialog-card dialog-card--compact torrent-movie-notice"
    role="alertdialog" aria-modal="true" aria-labelledby="torrent-movie-notice-title" aria-describedby="torrent-movie-notice-copy"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="dialog-card__header"><h2 id="torrent-movie-notice-title">{notice.failed ? s.movieLookupFailed : notice.job.mediaType === "series" ? s.seriesMissing : s.movieMissing}</h2></div>
    <p className="dialog-copy" id="torrent-movie-notice-copy">{notice.failed ? s.movieLookupFailedCopy : s.movieMissingCopy.replace("{name}", torrentJobTitle(notice.job))}</p>
    <div className="dialog-card__actions"><button className="dialog-button dialog-button--accent" type="button" autoFocus onClick={onClose}>{s.close}</button></div>
  </dialog>, document.body);
}

function TorrentNotificationsConfirm({ strings: s, disabled, onClose, onConfirm }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    dialog.showModal();
    const releaseScroll = lockBodyScroll();
    return () => {
      dialog.close();
      releaseScroll();
      const target = trigger?.disabled ? trigger.closest('[role="tabpanel"]') : trigger;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<dialog ref={dialogRef} className="dialog-card dialog-card--compact torrent-notifications-confirm"
    role="alertdialog" aria-modal="true" aria-labelledby="torrent-notifications-confirm-title" aria-describedby="torrent-notifications-confirm-copy"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="dialog-card__header"><h2 id="torrent-notifications-confirm-title">{s.stopNotifyingAllTitle}</h2></div>
    <p className="dialog-copy" id="torrent-notifications-confirm-copy">{s.stopNotifyingAllCopy}</p>
    <div className="dialog-card__actions">
      <button className="dialog-button dialog-button--ghost" type="button" autoFocus onClick={onClose}>{s.cancelNotificationChanges}</button>
      <button className="dialog-button dialog-button--accent" type="button" disabled={disabled} onClick={onConfirm}>{s.stopNotifyingAll}</button>
    </div>
  </dialog>, document.body);
}

export default function TorrentDownloads({ downloads, language, notificationPreferences = {}, notificationsReady = false,
  onNotificationChange, onNotificationsDismiss, showNotifications = false, onNotificationsShown, onOpenMovie, onOpenSeries }) {
  const s = torrentStrings(language);
  const fs = freeDownloadStrings(language);
  const [contentJob, setContentJob] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState("active");
  const [focusRequest, setFocusRequest] = useState(null);
  const focusedJobId = focusRequest?.id;
  const focusPending = useRef(false);
  const focusedJobRef = useRef(null);
  const sectionRef = useRef(null);
  const notificationRef = useRef(null);
  const movieRequest = useRef(null);
  const [openingMovie, setOpeningMovie] = useState("");
  const [movieNotice, setMovieNotice] = useState(null);
  const [confirmDismissNotifications, setConfirmDismissNotifications] = useState(false);
  useEffect(() => () => movieRequest.current?.abort(), []);
  async function openMovie(job) {
    if (movieRequest.current) return;
    const controller = new AbortController();
    movieRequest.current = controller;
    setOpeningMovie(job.id);
    try {
      const opened = await (job.mediaType === "series" ? onOpenSeries : onOpenMovie)(job, controller.signal);
      if (!controller.signal.aborted && !opened) setMovieNotice({ job, failed: false });
    } catch {
      if (!controller.signal.aborted) setMovieNotice({ job, failed: true });
    } finally {
      if (!controller.signal.aborted) setOpeningMovie("");
      movieRequest.current = null;
    }
  }
  const { jobs = [], serviceError, error, busy, action, refresh, recordJob, loaded, demo } = downloads;
  function showJob(job) {
    const latest = jobs.find(current => current.id === job?.id) || job;
    setSelectedGroup(latest ? torrentJobGroup(latest) : "active");
    setFocusRequest({ id: job?.id });
    focusPending.current = true;
  }
  useEffect(() => {
    if (!focusPending.current) return;
    const job = jobs.find(current => current.id === focusedJobId);
    if (job && selectedGroup !== torrentJobGroup(job)) { setSelectedGroup(torrentJobGroup(job)); return; }
    const target = focusedJobRef.current;
    if (!target || target.closest("[hidden]")) return;
    focusPending.current = false;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusRequest, selectedGroup, jobs]);
  const completedNotifications = completedTorrentNotifications(jobs, notificationPreferences);
  const historyNotificationKeys = jobs.filter(job => isTorrentHistory(job) && wantsTorrentNotification(job, notificationPreferences))
    .map(torrentNotificationKey);
  const canDismissNotifications = notificationsReady && historyNotificationKeys.length > 0 && Boolean(onNotificationsDismiss);
  useEffect(() => {
    if (!showNotifications) return;
    const targetGroup = completedNotifications[0]?.mediaType === "generic" ? "generic" : "history";
    if (selectedGroup !== targetGroup) { setSelectedGroup(targetGroup); return; }
    const target = notificationRef.current || sectionRef.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ behavior: "instant", block: "center" });
    onNotificationsShown?.();
  }, [showNotifications, selectedGroup, onNotificationsShown, completedNotifications[0]?.id, completedNotifications[0]?.mediaType]);
  const groups = [
    { key: "active", title: s.active, jobs: jobs.filter(job => !isTorrentHistory(job)) },
    { key: "history", title: s.history, jobs: jobs.filter(job => isTorrentHistory(job) && job.mediaType !== "generic") },
    { key: "generic", title: fs.title, jobs: jobs.filter(job => isTorrentHistory(job) && job.mediaType === "generic") },
  ];
  return <section ref={sectionRef} tabIndex={-1} className="raspberry-dashboard-section torrent-dashboard" aria-labelledby="torrent-downloads-title">
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
    <TorrentTraffic language={language} />
    <TorrentUploadSettings language={language} />
    <p className="torrent-dashboard__hint">{s.notificationsHint}</p>
    <SectionSwitcher idPrefix="torrent" label={s.list}
      tabs={groups.map(group => ({ ...group, count: group.jobs.length }))}
      selected={selectedGroup} onSelect={setSelectedGroup} />
    {(error || serviceError) && <p className="dialog-error" role="alert">{error || serviceError}</p>}
    {groups.map(group => <section className="torrent-dashboard__scroll" key={group.key}
      id={`torrent-${group.key}-panel`} role="tabpanel" aria-labelledby={`torrent-${group.key}-tab`}
      hidden={selectedGroup !== group.key} tabIndex={0}>
      {group.key !== "active" && <div className="torrent-dashboard__history-header">
        <p className="torrent-dashboard__hint">{group.key === "generic" ? fs.historyHint : s.historyHint}</p>
        <button className="dialog-button torrent-dashboard__dismiss-notifications" type="button"
          disabled={!canDismissNotifications} onClick={() => setConfirmDismissNotifications(true)}>{s.stopNotifyingAll}</button>
      </div>}
      {!group.jobs.length && <p>{demo ? s.demo : !loaded && !error ? s.pending : s.noJobs}</p>}
      <div className="torrent-dashboard__jobs">{group.jobs.map(job => {
        const notifying = wantsTorrentNotification(job, notificationPreferences);
        const notificationReady = notifying && job.state === "complete";
        const canDownloadAnyway = job.state === "failed" && job.canDownloadAnyway === true;
        const status = canDownloadAnyway ? "warning" : job.state;
        return <article className={`torrent-job${notificationReady ? " torrent-job--notified" : ""}${job.id === focusedJobId ? " torrent-job--selected" : ""}`} key={job.id}
          ref={node => {
            if (job.id === completedNotifications[0]?.id) notificationRef.current = node;
            if (job.id === focusedJobId) focusedJobRef.current = node;
          }} tabIndex={-1}>
      <div className="torrent-job__heading"><h4>{torrentJobTitle(job)}</h4><span className={`torrent-job__state torrent-job__state--${status}`}>{job.mediaType === "generic" && status === "complete" ? fs.ready : job.mediaType === 'books' && ['importing', 'metadata'].includes(job.state) ? bookTorrentStrings(language).importing : s[status] || status}</span></div>
      {notificationReady && <p className="torrent-job__notification-status">{s.notificationReady}</p>}
      {job.mediaType !== "generic" && <p className="torrent-job__name">{job.name}</p>}
      <p className="torrent-job__sources">{job.mediaType === "generic" ? fs.kind : job.mediaType === 'books' ? bookTorrentStrings(language).book : job.mediaType === "series" ? s.series : s.movie}</p>
      <p className="torrent-job__sources">{s.source}: {torrentSources(job).join(" · ")}</p>
      <progress max={100} value={job.progress || 0} aria-label={`${torrentJobTitle(job)}: ${s[status]}`} />
      {job.item?.importedEpisodeIds?.length > 0 && <p className="torrent-job__stats">{s.episodesImported}: {job.item.importedEpisodeIds.length}</p>}
      {job.item?.skippedEpisodeIds?.length > 0 && <p className="torrent-job__stats">{s.episodesSkipped}: {job.item.skippedEpisodeIds.length}</p>}
      <p className="torrent-job__stats">{job.progress || 0}% · {torrentSize(job.downloadedBytes, language)} / {torrentSize(job.sizeBytes, language)}{job.state === "downloading" ? ` · ${torrentSize(job.rateBytes, language)}/s${job.eta >= 0 ? ` · ${Math.ceil(job.eta / 60)} min ${s.remaining}` : ""}` : ""}</p>
      {canDownloadAnyway ? <p className="movie-torrents__warning" role="status">{s.combinedEpisodesWarning}{job.errorFile && <> <span className="torrent-job__name">{job.errorFile}</span></>}</p>
        : job.error && <p className="dialog-error">{job.error}</p>}
      {job.allowCombinedEpisodes && job.state !== "cancelled" && <p className="movie-torrents__warning">{s.combinedEpisodesAccepted}</p>}
      {job.artworkWarning && <p className="torrent-artwork-warning">{s.artworkWarning} {job.artworkWarning}</p>}
      <div className="torrent-job__actions">
        {job.mediaType === "generic" && job.state === "complete" && <button className="dialog-button dialog-button--accent" type="button" onClick={() => setContentJob(job)}>{fs.open}</button>}
        {(!isTorrentHistory(job) || notifying) && <button className="dialog-button torrent-job__notify"
          disabled={!notificationsReady} aria-pressed={isTorrentHistory(job) ? undefined : notifying} aria-label={`${notifying ? s.stopNotifying : s.notify}: ${torrentJobTitle(job)}`}
          title={notifying ? s.stopNotifying : s.notify}
          onClick={event => {
            onNotificationChange?.(torrentNotificationKey(job), !notifying);
            if (isTorrentHistory(job)) event.currentTarget.closest("article")?.focus({ preventScroll: true });
          }} type="button">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
          {notifying ? s.stopNotifying : s.notify}
        </button>}
        {job.state === "complete" && ((job.mediaType || "movies") === "movies" ? onOpenMovie : job.mediaType === "series" && onOpenSeries) &&
          <button className="dialog-button dialog-button--accent" disabled={Boolean(openingMovie)}
            onClick={() => openMovie(job)} type="button" aria-label={`${job.mediaType === "series" ? s.openSeries : s.openMovie}: ${torrentJobTitle(job)}`}>
            {openingMovie === job.id ? s.openingMovie : job.mediaType === "series" ? s.openSeries : s.openMovie}
          </button>}
        {["queued", "downloading"].includes(job.state) && <button className="dialog-button" disabled={busy === job.id} onClick={() => action(job.id, "pause")} type="button">{s.pause}</button>}
        {job.state === "paused" && <button className="dialog-button" disabled={busy === job.id} onClick={() => action(job.id, "resume")} type="button">{s.resume}</button>}
        {job.state === "failed" && <button className={`dialog-button${canDownloadAnyway ? " dialog-button--accent" : ""}`} disabled={busy === job.id} onClick={() => action(job.id, canDownloadAnyway ? "download_anyway" : "retry")} type="button">{canDownloadAnyway ? s.downloadAnyway : s.retry}</button>}
        {!job.item && ["queued", "downloading", "paused", "failed"].includes(job.state) && <button className="dialog-button dialog-button--ghost" disabled={busy === job.id} onClick={() => action(job.id, "cancel")} type="button">{s.cancel}</button>}
        {isTorrentHistory(job) && !(job.mediaType === "generic" && job.state === "complete") && <button className="dialog-button dialog-button--ghost" disabled={busy === job.id} onClick={() => action(job.id, "remove")} type="button" aria-label={`${s.remove}: ${torrentJobTitle(job)}`}>{s.remove}</button>}
      </div>
    </article>; })}</div>
    </section>)}
    <MediaTorrentSearch mediaType="generic" language={language} jobs={jobs} onRefresh={refresh}
      onStarted={job => { recordJob(job); showJob(job); }} onDashboard={showJob}
      notificationPreferences={notificationPreferences} notificationsReady={notificationsReady} onNotificationChange={onNotificationChange} />
    </div>
    {contentJob && <FreeDownloadDialog jobs={jobs} initialJob={contentJob} language={language} onClose={() => setContentJob(null)} onChanged={refresh} />}
    {movieNotice && <TorrentMovieNotice notice={movieNotice} strings={s} onClose={() => setMovieNotice(null)} />}
    {confirmDismissNotifications && <TorrentNotificationsConfirm strings={s} disabled={!canDismissNotifications}
      onClose={() => setConfirmDismissNotifications(false)} onConfirm={() => {
        if (!canDismissNotifications) return;
        onNotificationsDismiss(historyNotificationKeys);
        setConfirmDismissNotifications(false);
      }} />}
  </section>;
}
