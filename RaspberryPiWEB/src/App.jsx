import React, { useEffect, useMemo, useState } from "react";
import cloudBackground from "../../assets/simpsons/backgrounds/simpsons_clouds.jpg";
import cartellMask from "../../assets/cartell_base_black_mask.png";
import cartellLogo from "../../assets/cartell_logo.png";
import tvGreen from "../../assets/tele_green_1.png";
import {
  authWebPin,
  getApiBaseUrl,
  getHealth,
  getStoredWebPin,
  getVideos,
  playEpisode,
  setStoredWebPin,
  stopPlayback,
  volumeDown,
  volumeUp,
} from "./api/raspberryApi";
import { buildDirectoryCatalog } from "./simpsonsCatalog";

function statusTone(health) {
  if (!health?.ok) return "offline";
  return health?.running ? "playing" : "online";
}

function statusLabel(health) {
  if (!health?.ok) return "Sin conexion";
  if (health?.running) return "Reproduciendo";
  return "Lista";
}

function SeasonCard({ season, isActive, onSelect }) {
  return (
    <button
      className={`season-card${isActive ? " active" : ""}`}
      onClick={() => onSelect(season.id)}
      type="button"
    >
      <div className="season-card__image-wrap">
        {season.image ? (
          <img src={season.image} alt={season.title} className="season-card__image" />
        ) : (
          <div className="season-card__fallback">{season.title}</div>
        )}
      </div>
      <div className="season-card__body">
        <h3>{season.title}</h3>
        <p>{season.episodeCount} capitulos</p>
      </div>
    </button>
  );
}

function EpisodeRow({ episode, onOpen }) {
  return (
    <article className="episode-row">
      {episode.image ? (
        <img src={episode.image} alt={episode.title} className="episode-row__image" />
      ) : (
        <div className="episode-row__image episode-row__image--fallback">No img</div>
      )}

      <div className="episode-row__body">
        <h3>
          {episode.episodeNumber}. {episode.title}
        </h3>
        <p>{episode.airDate || "Fecha desconocida"}</p>
      </div>

      <button className="episode-row__details" onClick={() => onOpen(episode)} type="button">
        ›
      </button>
    </article>
  );
}

function EpisodeModal({ episode, seasonTitle, seriesName, onClose, onPlay, actionMessage }) {
  if (!episode) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="episode-modal" onClick={(event) => event.stopPropagation()}>
        <button className="episode-modal__close" onClick={onClose} type="button">
          ×
        </button>

        <div className="episode-modal__hero">
          <p>{seasonTitle}</p>
          <h2>{seriesName}</h2>
          {episode.image ? <img src={episode.image} alt={episode.title} /> : null}
        </div>

        <div className="episode-modal__content">
          <h3>
            Capitulo {episode.episodeNumber}: {episode.title}
          </h3>
          <dl className="episode-modal__meta">
            <div>
              <dt>Duracion</dt>
              <dd>{episode.duration ? `${episode.duration} min` : "desconocida"}</dd>
            </div>
            <div>
              <dt>Emision</dt>
              <dd>{episode.airDate || "desconocida"}</dd>
            </div>
            <div>
              <dt>ID Raspberry</dt>
              <dd>{episode.id}</dd>
            </div>
          </dl>
          <p className="episode-modal__synopsis">
            {episode.synopsis || "Sinopsis no disponible."}
          </p>
        </div>

        <div className="episode-modal__footer">
          <button className="play-button" onClick={() => onPlay(episode)} type="button">
            <img src={tvGreen} alt="" />
            <span>Reproducir en Simpsons TV</span>
          </button>
          {actionMessage ? <p className="episode-modal__message">{actionMessage}</p> : null}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [webPinInput, setWebPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [unlocked, setUnlocked] = useState(Boolean(getStoredWebPin()));
  const [health, setHealth] = useState(null);
  const [videos, setVideos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [selectedDirectoryPath, setSelectedDirectoryPath] = useState("");
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  const [selectedEpisode, setSelectedEpisode] = useState(null);

  useEffect(() => {
    if (!unlocked) {
      setLoading(false);
      return () => {};
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const [nextHealth, nextVideos] = await Promise.all([getHealth(), getVideos()]);
        if (cancelled) return;

        setHealth(nextHealth);
        setVideos(nextVideos);

        const firstDirectory = nextVideos?.directories?.[0]?.relativePath || "";
        setSelectedDirectoryPath((current) => current || firstDirectory);
      } catch (nextError) {
        if (cancelled) return;
        if (nextError?.status === 401) {
          setStoredWebPin("");
          setUnlocked(false);
          setPinError("PIN incorrecto o sesion caducada.");
          return;
        }
        setError(nextError.message || "No se pudo conectar con la Raspberry.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [unlocked]);

  const directories = videos?.directories || [];
  const selectedDirectory =
    directories.find((directory) => directory.relativePath === selectedDirectoryPath) ||
    directories[0] ||
    null;

  const seasons = useMemo(
    () => buildDirectoryCatalog(selectedDirectory),
    [selectedDirectory]
  );

  useEffect(() => {
    if (!seasons.length) {
      setSelectedSeasonId(null);
      return;
    }

    setSelectedSeasonId((current) => {
      if (current && seasons.some((season) => season.id === current)) {
        return current;
      }
      return seasons[0].id;
    });
  }, [seasons]);

  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) || null;
  const heroImage = selectedSeason?.image || cartellLogo;
  const tone = statusTone(health);

  async function refreshData() {
    if (!unlocked) return;
    setLoading(true);
    setError("");

    try {
      const [nextHealth, nextVideos] = await Promise.all([getHealth(), getVideos()]);
      setHealth(nextHealth);
      setVideos(nextVideos);
    } catch (nextError) {
      if (nextError?.status === 401) {
        setStoredWebPin("");
        setUnlocked(false);
        setPinError("PIN incorrecto o sesion caducada.");
        return;
      }
      setError(nextError.message || "No se pudo actualizar.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUnlock(event) {
    event.preventDefault();
    if (!/^\d{4}$/.test(webPinInput)) {
      setPinError("Introduce un PIN numerico de 4 digitos.");
      return;
    }

    setPinSubmitting(true);
    setPinError("");
    try {
      await authWebPin(webPinInput);
      setStoredWebPin(webPinInput);
      setUnlocked(true);
      setWebPinInput("");
    } catch (nextError) {
      setPinError(nextError.message || "No se pudo validar el PIN.");
    } finally {
      setPinSubmitting(false);
    }
  }

  async function handleVolume(changeFn, label) {
    try {
      await changeFn();
      setActionMessage(label);
      await refreshData();
    } catch (nextError) {
      setActionMessage(nextError.message || "No se pudo enviar la accion.");
    }
  }

  async function handleStop() {
    try {
      await stopPlayback();
      setActionMessage("Reproduccion detenida");
      await refreshData();
    } catch (nextError) {
      setActionMessage(nextError.message || "No se pudo detener.");
    }
  }

  async function handlePlayEpisode(episode) {
    if (!selectedDirectory) return;

    try {
      const result = await playEpisode({
        id: episode.id,
        directory: selectedDirectory.relativePath,
      });
      setActionMessage(`Reproduciendo ${result.playing}`);
      await refreshData();
    } catch (nextError) {
      setActionMessage(nextError.message || "No se pudo reproducir el episodio.");
    }
  }

  return (
    <main
      className="app-shell"
      style={{
        backgroundImage: `linear-gradient(rgba(2, 8, 20, 0.45), rgba(2, 8, 20, 0.82)), url(${cloudBackground})`,
      }}
    >
      <div className="page-overlay">
        {!unlocked ? (
          <section className="empty-state">
            <div className="empty-state__card unlock-card">
              <h2>Acceso protegido</h2>
              <p>Introduce el PIN numerico de 4 digitos configurado en la Raspberry.</p>
              <form className="unlock-form" onSubmit={handleUnlock}>
                <input
                  className="unlock-form__input"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="[0-9]*"
                  type="password"
                  value={webPinInput}
                  onChange={(event) => setWebPinInput(event.target.value.replace(/\D/g, "").slice(0, 4))}
                />
                <button disabled={pinSubmitting} type="submit">
                  {pinSubmitting ? "Validando..." : "Entrar"}
                </button>
              </form>
              {pinError ? <p className="unlock-form__error">{pinError}</p> : null}
            </div>
          </section>
        ) : (
          <>
        <header className="hero-stack">
          <div className="hero-stack__frame">
            <div
              className="hero-stack__mask"
              style={{
                WebkitMaskImage: `url(${cartellMask})`,
                maskImage: `url(${cartellMask})`,
              }}
            >
              <img src={heroImage} alt={selectedSeason?.title || "The Simpsons"} />
            </div>

            <div className="hero-stack__copy">
              <p className="hero-stack__eyebrow">TvSimpsonsApp local web</p>
              <h1>{selectedDirectory?.name || "The Simpsons"}</h1>
              <p>
                La web ya navega por temporadas y episodios reales de la Raspberry,
                manteniendo el fondo, el cartel y la jerarquia visual de la app.
              </p>
            </div>
          </div>

          <aside className={`status-badge status-badge--${tone}`}>
            <div className="status-badge__head">
              <img src={tvGreen} alt="" />
              <div>
                <span className="status-badge__label">Raspberry</span>
                <strong>{statusLabel(health)}</strong>
              </div>
            </div>

            <div className="status-badge__meta">
              <span>{getApiBaseUrl()}</span>
              <span>{health?.playing || "Nada sonando"}</span>
            </div>

            <div className="status-badge__actions">
              <button onClick={refreshData} type="button">
                Refrescar
              </button>
              <button onClick={() => handleVolume(volumeUp, "Volumen subido")} type="button">
                Vol +
              </button>
              <button onClick={() => handleVolume(volumeDown, "Volumen bajado")} type="button">
                Vol -
              </button>
              <button onClick={handleStop} type="button">
                Stop
              </button>
            </div>
          </aside>
        </header>

        <section className="toolbar">
          <div className="toolbar__group">
            <span className="toolbar__label">Biblioteca Raspberry</span>
            <div className="directory-chips">
              {directories.map((directory) => (
                <button
                  key={directory.relativePath}
                  className={`directory-chip${
                    directory.relativePath === selectedDirectory?.relativePath ? " active" : ""
                  }`}
                  onClick={() => {
                    setSelectedDirectoryPath(directory.relativePath);
                    setSelectedEpisode(null);
                  }}
                  type="button"
                >
                  {directory.name}
                </button>
              ))}
            </div>
          </div>

          <div className="toolbar__summary">
            <span>{directories.length} carpetas</span>
            <span>{selectedDirectory?.episodeCount || 0} episodios</span>
          </div>
        </section>

        {loading ? (
          <section className="empty-state">
            <div className="empty-state__card">
              <h2>Cargando temporadas...</h2>
              <p>Estoy leyendo la Raspberry y reconstruyendo el catalogo web.</p>
            </div>
          </section>
        ) : error ? (
          <section className="empty-state">
            <div className="empty-state__card">
              <h2>Error de conexion</h2>
              <p>{error}</p>
              <button onClick={refreshData} type="button">
                Reintentar
              </button>
            </div>
          </section>
        ) : !selectedDirectory || !seasons.length ? (
          <section className="empty-state">
            <div className="empty-state__card">
              <h2>Sin contenido cargado</h2>
              <p>
                La Raspberry responde, pero no he encontrado temporadas validas con IDs
                del tipo <code>S01E01</code>.
              </p>
            </div>
          </section>
        ) : (
          <>
            <section className="seasons-section">
              <div className="section-title">
                <p>Temporadas</p>
                <h2>Cartelera principal</h2>
              </div>

              <div className="season-grid">
                {seasons.map((season) => (
                  <SeasonCard
                    key={season.id}
                    season={season}
                    isActive={season.id === selectedSeason?.id}
                    onSelect={setSelectedSeasonId}
                  />
                ))}
              </div>
            </section>

            {selectedSeason ? (
              <section className="episodes-section">
                <div className="episodes-hero">
                  {selectedSeason.image ? (
                    <img
                      src={selectedSeason.image}
                      alt={selectedSeason.title}
                      className="episodes-hero__image"
                    />
                  ) : null}

                  <div className="episodes-hero__overlay">
                    <p>{selectedDirectory.name}</p>
                    <h2>{selectedSeason.title}</h2>
                    <span>{selectedSeason.episodeCount} capitulos</span>
                  </div>
                </div>

                <div className="episodes-list">
                  {selectedSeason.episodes.map((episode) => (
                    <EpisodeRow
                      key={episode.id}
                      episode={episode}
                      onOpen={setSelectedEpisode}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}

        {actionMessage ? <p className="action-banner">{actionMessage}</p> : null}

        <EpisodeModal
          episode={selectedEpisode}
          seasonTitle={selectedSeason?.title}
          seriesName={selectedDirectory?.name || "The Simpsons"}
          onClose={() => setSelectedEpisode(null)}
          onPlay={handlePlayEpisode}
          actionMessage={actionMessage}
        />
          </>
        )}
      </div>
    </main>
  );
}
