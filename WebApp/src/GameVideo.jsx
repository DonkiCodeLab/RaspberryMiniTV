import React, { useEffect, useRef, useState } from "react";
import { gameVideos } from "./gameVideos.js";
import { GAME_SYSTEMS } from "./gameSystems.js";
import "./GameMetadata.css";
import YouTubeGameplaySearch from "./YouTubeGameplaySearch.jsx";

export default function GameVideo({ metadata, platform, t, preferredVideo, onSaveVideo }) {
  const videos = gameVideos(metadata, preferredVideo);
  const [chosen, setChosen] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");
  const playerRef = useRef(null);
  const video = chosen || videos[0];
  const saving = saveStatus === "saving";
  const saved = Boolean(video && video.id === preferredVideo?.id);
  function chooseVideo(selection) {
    setChosen(selection);
    setSaveStatus("idle");
  }
  async function saveVideo() {
    if (!video || !onSaveVideo || saving || saved) return;
    setSaveStatus("saving");
    try {
      await onSaveVideo(video);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }
  useEffect(() => {
    if (chosen) playerRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [chosen]);
  const consoleName = GAME_SYSTEMS.find(system => system.id === platform || system.appPlatformId === platform)?.name || "";
  const searchUrl = `https://www.youtube.com/results?${new URLSearchParams({ search_query: `${metadata?.name || ""} ${consoleName} gameplay`.trim() })}`;
  const gameplayQuery = `${metadata?.name || ""} ${consoleName} gameplay`.trim().slice(0, 200);
  return <section className="game-video" aria-label={t("games_video_title")}>
    {video ? <div className={`game-video__layout${videos.length > 1 ? " game-video__layout--playlist" : ""}`}>
      <div className="game-video__main" ref={playerRef}>
        <iframe key={video.id} src={`https://www.youtube-nocookie.com/embed/${video.id}`} title={`${metadata?.name || ""} — ${video.name}`}
          referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; fullscreen; picture-in-picture" allowFullScreen />
        <div className="game-video__caption" aria-live="polite">
          <div><h4>{video.name}</h4>{video.channel && <p>{video.channel}</p>}</div>
          <a href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer">{t("games_video_open")} ↗</a>
        </div>
      </div>
      {videos.length > 1 && <div className="game-video__playlist" role="group" aria-label={t("games_video_choose")}>
        {videos.map(item => <button type="button" key={item.id} aria-pressed={video.id === item.id}
          onClick={() => chooseVideo(item)} disabled={saving} className="game-video__choice">
          <span className="game-video__thumbnail"><img src={`https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`} alt="" loading="lazy" /><span aria-hidden="true">▶</span></span>
          <span>{item.name}</span>
        </button>)}
      </div>}
    </div> : <div className="game-video__empty"><span aria-hidden="true">▷</span><p role="status">{t("games_video_missing")}</p></div>}
    {video && <p className="game-video__hint">{t("games_video_online")}</p>}
    <div className="game-video__actions">
      {video && onSaveVideo && <button type="button" className="dialog-button dialog-button--accent"
        disabled={saving || saved} onClick={saveVideo}>
        {t(saving ? "games_video_saving" : saved ? "games_video_saved" : "games_video_save")}
      </button>}
      {metadata?.name && <button type="button" className="dialog-button dialog-button--ghost"
        aria-expanded={searchOpen} onClick={() => setSearchOpen(open => !open)}>{t("youtube_title")} <span aria-hidden="true">{searchOpen ? "−" : "+"}</span></button>}
      <a href={searchUrl} target="_blank" rel="noreferrer">{t("games_video_search")} ↗</a>
    </div>
    {saveStatus === "saved" && <p className="game-video__save-status" role="status">{t("games_video_saved_hint")}</p>}
    {saveStatus === "error" && <p className="game-video__save-error" role="alert">{t("games_video_save_error")}</p>}
    {searchOpen && <YouTubeGameplaySearch key={gameplayQuery} initialQuery={gameplayQuery} t={t}
      selectedId={video?.id} onSelect={chooseVideo} disabled={saving} />}
  </section>;
}
