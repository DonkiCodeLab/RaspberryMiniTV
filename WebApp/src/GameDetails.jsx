import React, { useId, useState } from "react";
import GameMetadataDetails from "./GameMetadataDetails.jsx";
import GameVideo from "./GameVideo.jsx";
import { gameVideos } from "./gameVideos.js";
import { gameScreenshots } from "./gameScreenshots.js";
import { systemForGame } from "./gameSystems.js";
import emptyStateIcon from "./assets/empty.png";
import deleteIcon from "./assets/delete.png";
import tvGreen from "./assets/tele_green_2_fixed.png";
import "./GameDetails.css";

export default function GameDetails({ game, t, language, marks, onBack, onEdit, onDelete,
  onPlay, onPlayInBrowser, playing, browserSupported, onRefresh, onSaveVideo, downloadAction, headerControls = false }) {
  const metadata = game.gameMetadata || {};
  const name = game.name || game.file;
  const system = systemForGame(game);
  const platform = game.platformName || system?.name || game.platform;
  const images = gameScreenshots(game);
  const videos = gameVideos(metadata, game.preferredVideo);
  const [media, setMedia] = useState(images.length ? "images" : "videos");
  const [imageIndex, setImageIndex] = useState(0);
  const selectedImage = Math.min(imageIndex, Math.max(0, images.length - 1));
  const activeMedia = media === "images" && images.length ? "images" : "videos";
  const mediaId = useId();
  const description = game.description || metadata.description;
  const genres = Array.isArray(metadata.genres) ? metadata.genres.filter(Boolean) : [];
  const year = String(metadata.releaseDate || "").match(/\b\d{4}\b/)?.[0];

  function changeImage(direction) {
    setImageIndex((selectedImage + direction + images.length) % images.length);
  }

  return <section className="game-details seasons-section" aria-label={t("game_file_label")}>
    <div className="seasons-section__label">{t("game_file_label")}</div>
    <div className="game-details__toolbar">
      {!headerControls && <button type="button" className="back-button" onClick={onBack}>← {t("media_games")}</button>}
      <div className="game-details__tools">
        {!headerControls && <button className="dialog-button dialog-button--ghost" type="button" onClick={onEdit}>{t("games_edit_title")}</button>}
        {downloadAction}
        <button className="media-delete-button" type="button" onClick={onDelete}
          aria-label={t("delete_media", { media: t("media_games_singular") })}
          title={t("delete_media", { media: t("media_games_singular") })}>
          <img src={deleteIcon} alt="" />
        </button>
      </div>
    </div>

    <div className="game-details__hero">
      <div className="game-details__cover">
        <img src={game.coverImage || emptyStateIcon} alt={game.coverImage ? name : ""} />
      </div>
      <div className="game-details__intro">
        <div className="game-details__eyebrow">
          {system?.assets.console && <img src={system.assets.console} alt="" />}
          <span>{platform}</span>
          {year && <span className="game-details__year">{year}</span>}
        </div>
        <div className="game-details__title"><h2>{name}</h2>{marks}</div>
        {genres.length > 0 && <ul className="game-details__genres" aria-label={t("games_genres")}>
          {genres.map((genre, index) => <li key={`${genre}-${index}`}>{genre}</li>)}
        </ul>}
        <div className="game-details__play-actions">
          <button className="dialog-button dialog-button--accent game-details__play" type="button"
            onClick={onPlay} disabled={playing}>
            <img src={tvGreen} alt="" />
            <span>{playing ? t("playing_game") : t("play_game_on_raspberry")}</span>
          </button>
          <button className="dialog-button game-details__play" type="button" onClick={onPlayInBrowser}
            disabled={!browserSupported} title={!browserSupported ? t("browser_game_unsupported") : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="15" rx="2" /><path d="M8 22h8M12 18v4M10 7l5 3.5-5 3.5Z" /></svg>
            <span>{t("play_game_in_browser")}</span>
          </button>
        </div>
        {!browserSupported && <p className="game-details__hint">{t("browser_game_unsupported")}</p>}
        <section className="game-details__synopsis" aria-label={t("synopsis")}>
          <h3>{t("synopsis")}</h3>
          <p>{description || t("synopsis_unavailable")}</p>
          {metadata.storyline && metadata.storyline.trim() !== description?.trim() &&
            <details className="game-details__story"><summary>{t("games_storyline")}</summary><p>{metadata.storyline}</p></details>}
        </section>
      </div>
    </div>

    <GameMetadataDetails game={game} t={t} language={language} onRefresh={onRefresh} />

    <section className="game-details__media" aria-label={t("games_media_title")}>
      <div className="game-details__media-header">
        <h3>{t("games_media_title")}</h3>
        <div className="game-details__media-switch" role="group" aria-label={t("games_media_title")}>
          {images.length > 0 && <button type="button" aria-pressed={activeMedia === "images"}
            aria-controls={mediaId} onClick={() => setMedia("images")}>
            {t("games_gallery_title")} <span>{images.length}</span>
          </button>}
          <button type="button" aria-pressed={activeMedia === "videos"} aria-controls={mediaId} onClick={() => setMedia("videos")}>
            <span aria-hidden="true">▷</span> {t("games_videos_label")}{videos.length > 0 && <span>{videos.length}</span>}
          </button>
        </div>
      </div>
      <div id={mediaId}>
        {activeMedia === "images" ? <div className="game-details__gallery">
          <div className="game-details__screenshot">
            <img src={images[selectedImage]} alt={`${name} — ${t("games_image_number", { number: selectedImage + 1 })}`} />
            {images.length > 1 && <div className="game-details__gallery-controls">
              <button type="button" onClick={() => changeImage(-1)} aria-label={t("prev_image")}>‹</button>
              <span aria-live="polite">{selectedImage + 1} / {images.length}</span>
              <button type="button" onClick={() => changeImage(1)} aria-label={t("next_image")}>›</button>
            </div>}
          </div>
          {images.length > 1 && <div className="game-details__thumbnails" role="group" aria-label={t("games_gallery_title")}>
            {images.map((image, index) => <button key={image} type="button" onClick={() => setImageIndex(index)}
              aria-label={t("games_image_number", { number: index + 1 })} aria-pressed={selectedImage === index}>
              <img src={image} alt="" loading="lazy" />
            </button>)}
          </div>}
        </div> : <GameVideo key={`${game.relativePath}:${game.metadataId}`} metadata={{ ...metadata, name: metadata.name || name }}
          platform={game.platform} t={t} preferredVideo={game.preferredVideo} onSaveVideo={onSaveVideo} />}
      </div>
    </section>
  </section>;
}
