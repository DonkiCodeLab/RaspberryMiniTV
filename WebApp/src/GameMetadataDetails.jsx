import React, { useState } from "react";
import { retryGameMetadata } from "./api/raspberryApi";
import GameMetadataPicker from "./GameMetadataPicker.jsx";
import "./GameMetadata.css";

export default function GameMetadataDetails({ game, t, language = "es", onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [selection, setSelection] = useState(null);
  const [searching, setSearching] = useState(false);
  const metadata = game.gameMetadata || {};
  const releaseDate = /^\d{4}-\d{2}-\d{2}$/.test(metadata.releaseDate || "")
    && Number.isFinite(Date.parse(metadata.releaseDate))
    ? new Intl.DateTimeFormat(language, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(metadata.releaseDate))
    : metadata.releaseDate;
  const rating = metadata.rating !== "" && metadata.rating != null && Number.isFinite(Number(metadata.rating))
    ? new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(Number(metadata.rating)) : "";
  const list = value => Array.isArray(value) ? value.filter(Boolean).join(", ") : value;
  const facts = [
    ["games_release_date", releaseDate],
    ["games_developers", list(metadata.developers)],
    ["games_publishers", list(metadata.publishers)],
    ["games_players", metadata.players],
    ["games_modes", list(metadata.gameModes)],
    ["games_rating", rating && `${rating}${Number(metadata.ratingScale) > 0 ? ` / ${metadata.ratingScale}` : ""}`],
  ].filter(([, value]) => value);
  const source = {
    igdb: { name: "IGDB", url: "https://www.igdb.com/" },
    screenscraper: { name: "ScreenScraper", url: "https://www.screenscraper.fr/" },
  }[game.metadataSource];
  const status = game.metadataStatus;
  async function retry() {
    if (!game.metadataId && !choosing) { setChoosing(true); return; }
    setBusy(true); setError("");
    try { await retryGameMetadata(game.relativePath, selection); await onRefresh(); setChoosing(false); }
    catch { setError(t("games_search_failed")); }
    finally { setBusy(false); }
  }
  return <div className="game-metadata-details">
    {facts.length > 0 && <><h3>{t("games_info_title")}</h3><dl className="game-metadata-details__facts">
      {facts.map(([key, value]) => <div key={key}><dt>{t(key)}</dt><dd>{value}</dd></div>)}
    </dl></>}
    <details className="game-metadata-details__file">
      <summary>{t("games_file_details")}</summary>
      <dl>
        <div><dt>{t("file_label")}</dt><dd>{game.file || game.relativePath}</dd></div>
        {game.metadataSource && <div><dt>{t("game_browser_source")}</dt><dd>
          {source ? <a target="_blank" rel="noreferrer" href={source.url}>{source.name}</a> : game.metadataSource}
        </dd></div>}
      </dl>
    </details>
    {status !== "complete" && <div className="game-metadata-details__update">
      {status && <p role="status">{t(status === "not_configured" ? "games_api_not_configured"
        : status === "partial" ? "games_metadata_partial" : status === "needs_selection" ? "games_metadata_ambiguous"
        : status === "not_found" ? "games_no_results" : "games_metadata_pending")}</p>}
      {choosing && <GameMetadataPicker initialQuery={game.name || game.file} platform={game.platform}
        extension={(game.file || "").split(".").pop()} disabled={busy} onSelect={setSelection} onBusy={setSearching} t={t} />}
      <button className="dialog-button dialog-button--ghost" type="button" disabled={busy || searching || (choosing && !selection)} onClick={retry}>
        {busy ? t("games_metadata_saving") : t("games_metadata_retry")}
      </button>
      {choosing && <button className="dialog-button dialog-button--ghost" type="button" disabled={busy}
        onClick={() => { setChoosing(false); setSelection(null); setError(""); }}>{t("cancel")}</button>}
      {error && <p role="alert">{error}</p>}
    </div>}
  </div>;
}
