import React, { useEffect, useState } from "react";
import { searchYoutubeGameplay } from "./api/raspberryApi";

export default function YouTubeGameplaySearch({ initialQuery, t, selectedId, onSelect }) {
  const [query, setQuery] = useState(initialQuery);
  const [request, setRequest] = useState({ query: initialQuery, attempt: 0 });
  const [state, setState] = useState({ busy: true, results: [], message: "" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ busy: true, results: [], message: "" });
    searchYoutubeGameplay(request.query, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      const results = (Array.isArray(data.results) ? data.results : []).filter(video => /^[A-Za-z0-9_-]{11}$/.test(video?.id));
      setState({ busy: false, results, message: !data.configured ? "youtube_setup"
        : !results.length ? "youtube_empty" : "" });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ busy: false, results: [], message:
        error.code === "YOUTUBE_QUOTA" ? "youtube_quota" : error.code === "YOUTUBE_CONFIG_ERROR" ? "youtube_config_error" : "youtube_error" });
    });
    return () => controller.abort();
  }, [request]);
  function search() {
    if (query.trim()) setRequest(current => ({ query: query.trim(), attempt: current.attempt + 1 }));
  }
  return <section className="youtube-gameplay-search" aria-label={t("youtube_title")}>
    <h4>{t("youtube_title")}</h4>
    <div className="game-metadata-picker__search">
      <input aria-label={t("youtube_query")} value={query} maxLength={200}
        onChange={event => setQuery(event.target.value)} onKeyDown={event => {
          if (event.key === "Enter") { event.preventDefault(); if (!state.busy) search(); }
        }} />
      <button type="button" className="dialog-button" disabled={state.busy || !query.trim()} onClick={search}>
        {t("search_button")}
      </button>
    </div>
    <p role="status" aria-live="polite">{state.busy ? t("searching_button") : state.message ? t(state.message) : t("youtube_results")}</p>
    <div className="youtube-gameplay-search__results">
      {state.results.map(video => <button type="button" key={video.id} className="game-video__choice"
        aria-pressed={selectedId === video.id} onClick={() => onSelect({ id: video.id, name: video.title, channel: video.channel })}>
        <span className="game-video__thumbnail"><img src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`} alt="" loading="lazy" /><span aria-hidden="true">▶</span></span>
        <span><strong>{video.title}</strong><small>{video.channel}</small></span>
      </button>)}
    </div>
  </section>;
}
