import { useState } from "react";
import { retryGameMetadata } from "./api/raspberryApi";
import GameMetadataPicker from "./GameMetadataPicker.jsx";
import "./GameMetadata.css";

export default function GameMetadataDetails({ game, t, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [selection, setSelection] = useState(null);
  const [searching, setSearching] = useState(false);
  const metadata = game.gameMetadata || {};
  const facts = [
    ["games_release_date", metadata.releaseDate],
    ["games_developers", metadata.developers?.join(", ")],
    ["games_publishers", metadata.publishers?.join(", ")],
    ["games_genres", metadata.genres?.join(", ")],
    ["games_players", metadata.players],
    ["games_modes", metadata.gameModes?.join(", ")],
    ["games_rating", metadata.rating != null && metadata.rating !== "" ? `${metadata.rating} / ${metadata.ratingScale}` : ""],
  ].filter(([, value]) => value);
  const status = game.metadataStatus;
  async function retry() {
    if (!game.metadataId && !choosing) { setChoosing(true); return; }
    setBusy(true); setError("");
    try { await retryGameMetadata(game.relativePath, selection); await onRefresh(); setChoosing(false); }
    catch { setError(t("games_search_failed")); }
    finally { setBusy(false); }
  }
  return <div className="game-metadata-details">
    {facts.length > 0 && <dl className="game-metadata-details__facts">
      {facts.map(([key, value]) => <div key={key}><dt>{t(key)}</dt><dd>{value}</dd></div>)}
    </dl>}
    {metadata.storyline && <p>{metadata.storyline}</p>}
    {game.metadataSource && <p>{t("game_browser_source")}: <a target="_blank" rel="noreferrer"
      href={game.metadataSource === "igdb" ? "https://www.igdb.com/" : "https://www.screenscraper.fr/"}>
      {game.metadataSource === "igdb" ? "IGDB" : "ScreenScraper"}</a></p>}
    {status && status !== "complete" && <p role="status">{t(status === "not_configured" ? "games_api_not_configured"
      : status === "partial" ? "games_metadata_partial" : status === "needs_selection" ? "games_metadata_ambiguous"
      : status === "not_found" ? "games_no_results" : "games_metadata_pending")}</p>}
    {choosing && <GameMetadataPicker initialQuery={game.name || game.file} platform={game.platform}
      extension={(game.file || "").split(".").pop()} disabled={busy} onSelect={setSelection} onBusy={setSearching} t={t} />}
    {status !== "complete" && <button className="dialog-button" type="button" disabled={busy || searching || (choosing && !selection)} onClick={retry}>
      {busy ? t("games_metadata_saving") : t("games_metadata_retry")}
    </button>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
