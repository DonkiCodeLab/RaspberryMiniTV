import React, { useEffect, useRef, useState } from "react";
import { gameMetadataImageUrl, getGameMetadata, searchGameMetadata } from "./api/raspberryApi";
import "./GameMetadata.css";

export default function GameMetadataPicker({ initialQuery = "", platform, extension, disabled, onSelect, onBusy, t }) {
  const [query, setQuery] = useState(initialQuery.replace(/\([^)]*\)|\[[^\]]*\]/g, " ").replace(/_/g, " ").trim());
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const sequence = useRef(0);
  const callbacks = useRef({ onSelect, onBusy });
  callbacks.current = { onSelect, onBusy };

  function setLoading(value) { setBusy(value); callbacks.current.onBusy(value); }

  async function search() {
    const current = ++sequence.current;
    callbacks.current.onSelect(null);
    setSelected(""); setResults([]); setMessage("");
    if (!query.trim() || !platform) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await searchGameMetadata({ query, platform, extension });
      if (current !== sequence.current) return;
      setResults(data.results || []);
      if (!data.configured) setMessage(t("games_api_not_configured"));
      else if (data.warnings?.length) setMessage(t("games_search_failed"));
      else if (!data.results?.length) setMessage(t("games_no_results"));
    } catch {
      if (current === sequence.current) setMessage(t("games_search_failed"));
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    search();
    return () => { sequence.current += 1; callbacks.current.onBusy(false); };
  }, [platform, extension]);

  async function select(result) {
    const current = ++sequence.current;
    setLoading(true); setMessage("");
    setSelected(""); callbacks.current.onSelect(null);
    try {
      const data = result.source === "mock" ? { item: result }
        : await getGameMetadata({ source: result.source, id: result.id, platform, extension });
      if (current !== sequence.current) return;
      setSelected(`${result.source}:${result.id}`);
      callbacks.current.onSelect(data.item);
    } catch {
      if (current === sequence.current) setMessage(t("games_search_failed"));
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }

  return <section className="game-metadata-picker" aria-label={t("game_browser_title")}>
    <strong>{t("game_browser_title")}</strong>
    <p>{t("games_metadata_intro")}</p>
    <div className="game-metadata-picker__search">
      <input value={query} disabled={disabled} aria-label={t("search")} onChange={event => setQuery(event.target.value)}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (!busy && !disabled) search(); } }} />
      <button type="button" className="dialog-button" onClick={search} disabled={busy || disabled || !platform || !query.trim()}>
        {busy ? t("searching_button") : t("search_button")}
      </button>
    </div>
    {message && <p role="status">{message}</p>}
    <div className="game-metadata-picker__results">
      {results.map(result => <button type="button" key={`${result.source}:${result.id}`} disabled={disabled || busy}
        aria-pressed={selected === `${result.source}:${result.id}`} onClick={() => select(result)}
        className={`game-metadata-picker__result${selected === `${result.source}:${result.id}` ? " active" : ""}`}>
        {result.covers?.[0]?.url && <img src={gameMetadataImageUrl(result.covers[0].url)} alt="" loading="lazy" />}
        <span><strong>{result.name}</strong><small>{[result.releaseDate, result.source].filter(Boolean).join(" · ")}</small></span>
      </button>)}
    </div>
    {selected && <p role="status">{t("games_metadata_selected")}</p>}
  </section>;
}
