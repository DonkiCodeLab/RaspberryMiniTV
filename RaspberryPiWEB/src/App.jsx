import React, { useEffect, useMemo, useRef, useState } from "react";
import cartellMask from "./assets/cartell_base_black_mask.png";
import cartellLogo from "./assets/cartell_logo.png";
import cloudsBackground from "./assets/cloud.gif";
import deleteIcon from "./assets/delete.png";
import saveIcon from "./assets/save.png";
import settingsIcon from "./assets/settings_icon.png";
import tvGreen from "./assets/tele_green_2_fixed.png";
import {
  addSeries,
  authWebPin,
  getStoredWebPin,
  getVideos,
  isMockMode,
  playEpisode,
  removeSeries,
  setStoredWebPin,
} from "./api/raspberryApi";
import {
  loadMediaLibrary,
  removeMediaLibraryItem,
  upsertMediaLibraryItem,
} from "./mediaLibrary";
import { loadSeriesProfiles, removeSeriesProfile, updateSeriesProfile } from "./seriesProfiles";
import {
  getMovieById,
  getTvSeasonEpisodes,
  getTvSeriesById,
  resolveSeriesFromNames,
  searchMovies,
  searchTvSeries,
} from "./tmdbApi";

const TMDB_LANGUAGE = "es-ES";
const HERO_SLIDER_MAX = 0.96;
const MEDIA_TYPES = [
  { id: "series", label: "Series" },
  { id: "movies", label: "Peliculas" },
  { id: "games", label: "Juegos" },
];
const DEFAULT_HERO_CROP = {
  focusX: 0.5,
  focusY: 0.5,
  zoom: 1,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeHeroCrop(crop) {
  return {
    focusX: clamp(Number(crop?.focusX) || 0.5, 0, 1),
    focusY: clamp(Number(crop?.focusY) || 0.5, 0, 1),
    zoom: 1,
  };
}

function clampHeroCrop(crop) {
  return normalizeHeroCrop(crop);
}

function getHeroVerticalPosition(crop) {
  return normalizeHeroCrop(crop).focusY;
}

function getHeroSliderValue(crop) {
  return clamp(1 - getHeroVerticalPosition(crop), 0, HERO_SLIDER_MAX);
}

function setHeroVerticalPosition(position, crop) {
  const normalized = normalizeHeroCrop(crop);
  const nextPosition = clamp(Number(position) || 0, 0, 1);

  return clampHeroCrop({
    ...normalized,
    focusY: nextPosition,
  });
}

function setHeroVerticalFromSlider(value, crop) {
  return setHeroVerticalPosition(
    1 - clamp(Number(value) || 0, 0, HERO_SLIDER_MAX),
    crop
  );
}

function getHeaderImageStyle(crop) {
  const normalized = normalizeHeroCrop(crop);

  return {
    objectPosition: `${normalized.focusX * 100}% ${normalized.focusY * 100}%`,
    transform: `scale(${normalized.zoom})`,
    transformOrigin: "center center",
  };
}

function HeaderArt({ image, crop, alt, children }) {
  const usesFullMaskArtwork = image === cartellLogo;

  return (
    <div
      className="series-hero__art"
      style={{
        WebkitMaskImage: `url(${cartellMask})`,
        maskImage: `url(${cartellMask})`,
      }}
      role="img"
      aria-label={alt}
    >
      {usesFullMaskArtwork ? (
        <img
          className="series-hero__full-mask-image"
          src={image}
          alt=""
          aria-hidden="true"
          draggable="false"
          onDragStart={(event) => event.preventDefault()}
        />
      ) : (
        <div className="series-hero__visible-window">
          <img
            src={image}
            alt=""
            aria-hidden="true"
            draggable="false"
            onDragStart={(event) => event.preventDefault()}
            style={getHeaderImageStyle(crop)}
          />
        </div>
      )}

      <div className="series-hero__controls-layer">
        <div className="series-hero__controls-backdrop" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
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

function toRaspberryEpisodeId(seasonNumber, episodeNumber) {
  const safeSeason = Number(seasonNumber);
  const safeEpisode = Number(episodeNumber);

  if (!safeSeason || !safeEpisode) return "";

  return `S${String(safeSeason).padStart(2, "0")}E${String(safeEpisode).padStart(2, "0")}`;
}

function EpisodeRow({ episode, onSelect }) {
  return (
    <button className="episode-card" onClick={() => onSelect(episode)} type="button">
      <div className="episode-card__thumb">
        {episode.image ? <img src={episode.image} alt={episode.title} /> : null}
      </div>

      <div className="episode-card__body">
        <h3>
          {episode.episodeNumber}. {episode.title}
        </h3>
        {episode.airDate ? <p>{episode.airDate}</p> : null}
      </div>

      <div className="episode-card__arrow">›</div>
    </button>
  );
}

function EpisodeDetailsModal({
  visible,
  episode,
  season,
  seriesName,
  playing,
  onClose,
  onPlay,
}) {
  useEffect(() => {
    if (!visible) return () => {};

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible, onClose]);

  if (!visible || !episode || !season) return null;

  return (
    <div className="modal-backdrop modal-backdrop--episode" onClick={onClose}>
      <div
        className="episode-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="episode-dialog-title"
      >
        <header className="episode-dialog__header">
          <div className="episode-dialog__header-copy">
            {seriesName ? <p>{seriesName}</p> : null}
            <h2>{season.title}</h2>
            <h3 id="episode-dialog-title">
              Capitulo {episode.episodeNumber}: <span>{episode.title}</span>
            </h3>
          </div>

          <button
            className="episode-dialog__close"
            onClick={onClose}
            type="button"
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <div className="episode-dialog__body">
          <div className="episode-dialog__overview">
            {episode.image ? (
              <div className="episode-dialog__media">
                <img src={episode.image} alt={episode.title} />
              </div>
            ) : (
              <div className="episode-dialog__media episode-dialog__media--empty">
                <span>{episode.title}</span>
              </div>
            )}

            <div className="episode-dialog__facts">
              <div className="episode-dialog__fact">
                <strong>Duracion:</strong>
                <span>{episode.runtime ? `${episode.runtime} minutos` : "No disponible"}</span>
              </div>
              <div className="episode-dialog__fact">
                <strong>Emision:</strong>
                <span>{episode.airDate || "No disponible"}</span>
              </div>
              <div className="episode-dialog__fact">
                <strong>Valoracion:</strong>
                <span>
                  {typeof episode.voteAverage === "number" && episode.voteAverage > 0
                    ? episode.voteAverage.toFixed(1)
                    : "No disponible"}
                </span>
              </div>
            </div>
          </div>

          <button
            className="episode-dialog__play"
            onClick={onPlay}
            type="button"
            disabled={playing}
          >
            <img src={tvGreen} alt="" aria-hidden="true" />
            <span>{playing ? "Reproduciendo..." : "Reproducir en Simpsons TV"}</span>
          </button>

          <div className="episode-dialog__synopsis">
            <strong>Sinopsis:</strong>
            <p>{episode.synopsis || "Sinopsis no disponible."}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ visible, mediaType, item, imageOptions, onClose, onSave, onDelete }) {
  const [name, setName] = useState(item?.name || "");
  const [heroImage, setHeroImage] = useState(item?.heroImage || "");
  const [heroImageCrop, setHeroImageCrop] = useState(item?.heroImageCrop || DEFAULT_HERO_CROP);

  useEffect(() => {
    setName(item?.name || "");
    setHeroImage(item?.heroImage || imageOptions?.[0] || "");
    setHeroImageCrop(normalizeHeroCrop(item?.heroImageCrop || DEFAULT_HERO_CROP));
  }, [item, imageOptions, visible]);

  if (!visible) return null;

  if (mediaType === "games") {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="dialog-card dialog-card--compact" onClick={(event) => event.stopPropagation()}>
          <div className="dialog-card__header">
            <div>
              <p>Juegos</p>
              <h2>En construccion</h2>
            </div>
            <button className="dialog-card__close" onClick={onClose} type="button">
              ×
            </button>
          </div>
          <p className="dialog-copy">
            Esta seccion de customizacion todavia no tiene acciones disponibles.
          </p>
        </div>
      </div>
    );
  }

  if (!item) return null;

  const normalizedImageOptions = Array.from(
    new Set((Array.isArray(imageOptions) ? imageOptions : []).filter(Boolean))
  );
  const mediaLabel = mediaType === "movies" ? "pelicula" : "serie";

  return (
    <div className="modal-backdrop" onClick={onClose}>
        <div className="dialog-card dialog-card--settings" onClick={(event) => event.stopPropagation()}>
          <div className="dialog-card__header">
            <div>
              <p>Ajustes de la {mediaLabel}</p>
              <h2>{item.name}</h2>
            </div>
            <div className="dialog-card__header-actions">
              <button
                className="dialog-card__icon-button dialog-card__icon-button--danger"
                onClick={() => {
                  if (window.confirm(`¿Seguro que quieres eliminar la ${mediaLabel} "${item.name}"?`)) {
                    onDelete();
                  }
                }}
                type="button"
                aria-label={`Eliminar ${mediaLabel}`}
                title={`Eliminar ${mediaLabel}`}
              >
                <img className="dialog-card__icon-image" src={deleteIcon} alt="" aria-hidden="true" />
              </button>
              <button
                className="dialog-card__icon-button"
                onClick={() =>
                  onSave({
                    name,
                    heroImage,
                    heroImageCrop: heroImage ? clampHeroCrop(heroImageCrop) : null,
                  })
                }
                type="button"
                aria-label="Guardar"
                title="Guardar"
              >
                <img className="dialog-card__icon-image" src={saveIcon} alt="" aria-hidden="true" />
              </button>
              <button
                className="dialog-card__icon-button dialog-card__close"
                onClick={onClose}
                type="button"
                aria-label="Cancelar"
                title="Cancelar"
              >
                ×
              </button>
            </div>
          </div>

        <div className="dialog-card__body">
          <label className="dialog-field">
            <span>Nombre visible</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={`Nombre de la ${mediaLabel}`}
            />
          </label>

          <div className="dialog-field">
            <span>Imagen de cabecera</span>
            <div className="dialog-image-grid-shell">
              <div className="dialog-image-grid">
                {normalizedImageOptions.map((imageUrl) => (
                  <button
                    key={imageUrl}
                    className={`dialog-image-option${heroImage === imageUrl ? " active" : ""}`}
                    onClick={() => {
                      setHeroImage(imageUrl);
                      setHeroImageCrop(
                        clampHeroCrop(imageUrl === heroImage ? heroImageCrop : DEFAULT_HERO_CROP)
                      );
                    }}
                    type="button"
                  >
                    <img src={imageUrl} alt="" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="dialog-field">
            <span>Vista previa del cartel</span>
            <div className="dialog-preview-editor">
              <div className="dialog-poster-preview-shell">
                <div className="dialog-vertical-control" aria-label="Posición vertical del cartel">
                  <input
                    type="range"
                    min="0"
                    max={HERO_SLIDER_MAX}
                    step="0.01"
                    value={getHeroSliderValue(heroImageCrop)}
                    onChange={(event) =>
              setHeroImageCrop((currentCrop) => setHeroVerticalFromSlider(event.target.value, currentCrop))
                    }
                    disabled={!heroImage}
                  />
                </div>

                <div className="dialog-poster-preview">
                  <HeaderArt image={heroImage || cartellLogo} crop={heroImageCrop} alt="" />
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function AddMediaModal({ visible, mediaType, onClose, onAdd }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults([]);
      setSelectedId(null);
      setSearching(false);
      setSubmitting(false);
      setError("");
    }
  }, [visible]);

  async function handleSearch(event) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setResults([]);
      setSelectedId(null);
      setError(`Escribe una ${mediaType === "movies" ? "película" : "serie"} para buscar.`);
      return;
    }

    setSearching(true);
    setError("");
    setSelectedId(null);

    try {
      const nextResults =
        mediaType === "movies"
          ? await searchMovies(trimmedQuery, TMDB_LANGUAGE)
          : await searchTvSeries(trimmedQuery, TMDB_LANGUAGE);
      setResults(nextResults);
      if (!nextResults.length) {
        setError(
          mediaType === "movies"
            ? "No se han encontrado películas para esa búsqueda."
            : "No se han encontrado series para esa búsqueda."
        );
      }
    } catch (nextError) {
      setError(nextError.message || "No se pudo buscar en TMDB.");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleAdd() {
    const selectedItem = results.find((entry) => entry.id === selectedId);
    if (!selectedItem) return;

    setSubmitting(true);
    setError("");

    try {
      await onAdd(selectedItem);
    } catch (nextError) {
      setError(
        nextError.message ||
          `No se pudo añadir la ${mediaType === "movies" ? "película" : "serie"}.`
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleClearSearch() {
    setQuery("");
    setResults([]);
    setSelectedId(null);
    setError("");
  }

  if (!visible) return null;

  if (mediaType === "games") {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="dialog-card dialog-card--compact" onClick={(event) => event.stopPropagation()}>
          <div className="dialog-card__header">
            <div>
              <p>Juegos</p>
              <h2>En construccion</h2>
            </div>
            <button className="dialog-card__close" onClick={onClose} type="button">
              ×
            </button>
          </div>
          <p className="dialog-copy">
            Este dialogo queda reservado para futuras acciones de juegos.
          </p>
        </div>
      </div>
    );
  }

  const mediaLabel = mediaType === "movies" ? "película" : "serie";
  const searchPlaceholder = mediaType === "movies" ? "Ejemplo: Toy Story" : "Ejemplo: Futurama";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="dialog-card dialog-card--add-series" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-card__header">
          <div>
            <p>{`Añadir ${mediaLabel}`}</p>
            <h2>Buscar en TMDB</h2>
          </div>
          <button className="dialog-card__close" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <form className="add-series-search" onSubmit={handleSearch}>
          <label className="dialog-field">
            <span>Búsqueda</span>
            <div className="search-input-shell">
              <span className="search-input-shell__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="presentation">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="M16 16L21 21" />
                </svg>
              </span>
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
              />
              {query ? (
                <button
                  className="search-input-shell__clear"
                  onClick={handleClearSearch}
                  type="button"
                  aria-label="Borrar búsqueda"
                  title="Borrar búsqueda"
                >
                  ×
                </button>
              ) : null}
            </div>
          </label>

          <button className="dialog-button add-series-search__button" disabled={searching} type="submit">
            {searching ? "Buscando..." : "Buscar"}
          </button>
        </form>

        <div className="add-series-results">
          {results.length ? (
            <div
              className="add-series-results__list"
              role="listbox"
              aria-label={`Resultados de ${mediaType === "movies" ? "películas" : "series"}`}
            >
              {results.map((result) => {
                const isSelected = result.id === selectedId;
                const meta = [
                  mediaType === "movies"
                    ? result.releaseDate
                      ? result.releaseDate.slice(0, 4)
                      : ""
                    : result.firstAirDate
                      ? result.firstAirDate.slice(0, 4)
                      : "",
                  result.originalName,
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <button
                    key={result.id}
                    className={`add-series-result${isSelected ? " active" : ""}`}
                    onClick={() => setSelectedId(result.id)}
                    type="button"
                  >
                    <div className="add-series-result__poster">
                      {result.posterImage ? <img src={result.posterImage} alt={result.name} /> : <span>Sin imagen</span>}
                    </div>

                    <div className="add-series-result__body">
                      <h3>{result.name}</h3>
                      {meta ? <p className="add-series-result__meta">{meta}</p> : null}
                      <p className="add-series-result__overview">
                        {result.overview || "Sin descripción disponible en TMDB."}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="add-series-results__empty">
              <p>{`Busca una ${mediaLabel} para ver los resultados aquí.`}</p>
            </div>
          )}
        </div>

        {error ? <p className="dialog-error">{error}</p> : null}

        <div className="dialog-card__actions">
          <button className="dialog-button dialog-button--ghost" onClick={onClose} type="button">
            Cancelar
          </button>
          <button
            className="dialog-button"
            disabled={!selectedId || submitting}
            onClick={handleAdd}
            type="button"
          >
            {submitting ? "Añadiendo..." : "Añadir"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniTvModal({ visible, onClose }) {
  if (!visible) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="dialog-card dialog-card--compact" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-card__header">
          <div>
            <p>Mini-tele</p>
            <h2>Configuracio</h2>
          </div>
          <button className="dialog-card__close" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <p className="dialog-copy">
          Aquest dialeg queda preparat per configurar la mini-tele de la capcalera. En la
          seguent iteracio hi connectem les opcions reals.
        </p>
        <div className="dialog-card__actions">
          <button className="dialog-button" onClick={onClose} type="button">
            Tancar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const mockMode = isMockMode();
  const [activeMediaType, setActiveMediaType] = useState("series");
  const [webPinInput, setWebPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [unlocked, setUnlocked] = useState(mockMode || Boolean(getStoredWebPin()));
  const [videos, setVideos] = useState(null);
  const [tmdbLoading, setTmdbLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDirectoryPath, setSelectedDirectoryPath] = useState("");
  const [selectedMovieId, setSelectedMovieId] = useState(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  const [currentView, setCurrentView] = useState("series");
  const [seasonEpisodes, setSeasonEpisodes] = useState(null);
  const [seasonEpisodesLoading, setSeasonEpisodesLoading] = useState(false);
  const [seasonHeroImage, setSeasonHeroImage] = useState("");
  const [seriesProfiles, setSeriesProfiles] = useState(() => loadSeriesProfiles("series"));
  const [movieProfiles, setMovieProfiles] = useState(() => loadSeriesProfiles("movies"));
  const [movieLibrary, setMovieLibrary] = useState(() => loadMediaLibrary("movies"));
  const [tmdbSeriesMap, setTmdbSeriesMap] = useState({});
  const [tmdbMovieMap, setTmdbMovieMap] = useState({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addSeriesOpen, setAddSeriesOpen] = useState(false);
  const [miniTvOpen, setMiniTvOpen] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [episodeDialogOpen, setEpisodeDialogOpen] = useState(false);
  const [episodePlaying, setEpisodePlaying] = useState(false);
  const seasonHeroShellRef = useRef(null);

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
        const nextVideos = await getVideos();
        if (cancelled) return;

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

  useEffect(() => {
    if (!directories.length) {
      setTmdbSeriesMap({});
      return;
    }

    let cancelled = false;

    async function loadTmdbSeries() {
      setTmdbLoading(true);
      setError("");

      try {
        const entries = await Promise.all(
          directories.map(async (directory) => {
            const profile = seriesProfiles[directory.relativePath] || {};
            const tmdbSeries = directory.tmdbId
              ? await getTvSeriesById(directory.tmdbId, TMDB_LANGUAGE)
              : await resolveSeriesFromNames({
                  directoryName: directory.name,
                  displayName: profile.name || directory.name,
                  language: TMDB_LANGUAGE,
                });

            return [
              directory.relativePath,
              {
                ...tmdbSeries,
                directoryPath: directory.relativePath,
              },
            ];
          })
        );

        if (!cancelled) {
          setTmdbSeriesMap(Object.fromEntries(entries));
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError.message || "No se pudo cargar TMDB.");
        }
      } finally {
        if (!cancelled) {
          setTmdbLoading(false);
        }
      }
    }

    loadTmdbSeries();
    return () => {
      cancelled = true;
    };
  }, [directories, seriesProfiles]);

  useEffect(() => {
    if (!movieLibrary.length) {
      setTmdbMovieMap({});
      return;
    }

    let cancelled = false;

    async function loadTmdbMovies() {
      setTmdbLoading(true);
      setError("");

      try {
        const entries = await Promise.all(
          movieLibrary.map(async (movie) => {
            const profile = movieProfiles[String(movie.id)] || {};
            const tmdbMovie = await getMovieById(movie.id, TMDB_LANGUAGE);

            return [
              String(movie.id),
              {
                ...tmdbMovie,
                key: String(movie.id),
                name: profile.name || tmdbMovie?.name || movie.name,
                heroImage: profile.heroImage || tmdbMovie?.heroImage || cartellLogo,
                heroImageCrop: normalizeHeroCrop(profile.heroImageCrop || DEFAULT_HERO_CROP),
              },
            ];
          })
        );

        if (!cancelled) {
          setTmdbMovieMap(Object.fromEntries(entries));
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError.message || "No se pudo cargar TMDB.");
        }
      } finally {
        if (!cancelled) {
          setTmdbLoading(false);
        }
      }
    }

    loadTmdbMovies();
    return () => {
      cancelled = true;
    };
  }, [movieLibrary, movieProfiles]);

  const seriesOptions = useMemo(() => {
    return directories.map((directory) => {
      const profile = seriesProfiles[directory.relativePath] || {};
      const tmdbSeries = tmdbSeriesMap[directory.relativePath] || null;

      return {
        key: directory.relativePath,
        id: tmdbSeries?.id || null,
        directoryPath: directory.relativePath,
        name: profile.name || tmdbSeries?.name || directory.name,
        heroImage: profile.heroImage || tmdbSeries?.heroImage || cartellLogo,
        heroImageCrop: normalizeHeroCrop(profile.heroImageCrop || DEFAULT_HERO_CROP),
        imageOptions: tmdbSeries?.imageOptions || [],
        seasons: tmdbSeries?.seasons || [],
        seasonCount: tmdbSeries?.seasonCount || 0,
        episodeCount: tmdbSeries?.totalEpisodeCount || 0,
      };
    });
  }, [directories, seriesProfiles, tmdbSeriesMap]);

  const movieOptions = useMemo(() => {
    return movieLibrary.map((movie) => {
      const tmdbMovie = tmdbMovieMap[String(movie.id)] || null;
      const profile = movieProfiles[String(movie.id)] || {};

      return {
        key: String(movie.id),
        id: Number(movie.id),
        name: profile.name || tmdbMovie?.name || movie.name,
        heroImage: profile.heroImage || tmdbMovie?.heroImage || cartellLogo,
        heroImageCrop: normalizeHeroCrop(profile.heroImageCrop || DEFAULT_HERO_CROP),
        imageOptions: tmdbMovie?.imageOptions || [],
        overview: tmdbMovie?.overview || "",
        releaseDate: tmdbMovie?.releaseDate || "",
        runtime: tmdbMovie?.runtime || 0,
        voteAverage: tmdbMovie?.voteAverage || 0,
      };
    });
  }, [movieLibrary, movieProfiles, tmdbMovieMap]);

  const selectedSeries =
    seriesOptions.find((series) => series.directoryPath === selectedDirectoryPath) ||
    seriesOptions[0] ||
    null;
  const selectedMovie =
    movieOptions.find((movie) => Number(movie.id) === Number(selectedMovieId)) ||
    movieOptions[0] ||
    null;
  const selectedItem =
    activeMediaType === "games"
      ? null
      : activeMediaType === "movies"
        ? selectedMovie
        : selectedSeries;
  const hasSettingsButton = activeMediaType !== "games" && Boolean(selectedItem);

  const seasons = selectedSeries?.seasons || [];
  const headerImage =
    activeMediaType === "games" ? cartellLogo : selectedItem?.heroImage || cartellLogo;
  const headerImageCrop =
    activeMediaType === "games"
      ? DEFAULT_HERO_CROP
      : selectedItem?.heroImageCrop || DEFAULT_HERO_CROP;
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) || null;

  useEffect(() => {
    if (!selectedSeries && seriesOptions[0]) {
      setSelectedDirectoryPath(seriesOptions[0].directoryPath);
    }
  }, [selectedSeries, seriesOptions]);

  useEffect(() => {
    if (!selectedMovie && movieOptions[0]) {
      setSelectedMovieId(movieOptions[0].id);
    }
  }, [selectedMovie, movieOptions]);

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

  useEffect(() => {
    if (currentView !== "season" || !selectedSeries?.id || !selectedSeason) {
      return;
    }

    let cancelled = false;

    async function loadSeasonEpisodes() {
      setSeasonEpisodesLoading(true);
      setError("");

      try {
        const nextSeason = await getTvSeasonEpisodes({
          seriesId: selectedSeries.id,
          seasonNumber: selectedSeason.seasonNumber || selectedSeason.id,
          language: TMDB_LANGUAGE,
        });

        if (!cancelled) {
          setSeasonEpisodes(nextSeason);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError.message || "No se pudo cargar la temporada.");
        }
      } finally {
        if (!cancelled) {
          setSeasonEpisodesLoading(false);
        }
      }
    }

    loadSeasonEpisodes();
    return () => {
      cancelled = true;
    };
  }, [currentView, selectedSeries, selectedSeason]);

  useEffect(() => {
    if (currentView !== "season" || !selectedSeason) {
      setSeasonHeroImage("");
      return;
    }

    const fallbackImage = selectedSeason.image || headerImage || "";
    setSeasonHeroImage(fallbackImage);
  }, [currentView, selectedSeason, headerImage]);

  useEffect(() => {
    const nextHero = seasonEpisodes?.heroImage;
    if (!nextHero) return;

    const preloadImage = new Image();
    preloadImage.onload = () => {
      setSeasonHeroImage(nextHero);
    };
    preloadImage.onerror = () => {
      setSeasonHeroImage((current) => current || nextHero);
    };
    preloadImage.src = nextHero;
  }, [seasonEpisodes]);

  useEffect(() => {
    if (currentView !== "season") {
      return () => {};
    }

    let frameId = 0;

    function syncCollapsedHeader() {
      if (frameId) return;

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;

        const shellElement = seasonHeroShellRef.current;
        if (!shellElement) return;

        const minHeight = window.innerWidth <= 760 ? 168 : 208;
        const maxHeight =
          window.innerWidth <= 760
            ? window.innerHeight * 0.44
            : Math.min(window.innerHeight * 0.58, 560);
        const maxShift = Math.max(maxHeight - minHeight, 0);
        const nextShift = Math.min(window.scrollY, maxShift);
        const nextOffset = 0;

        shellElement.style.setProperty("--season-hero-max-height", `${maxHeight}px`);
        shellElement.style.setProperty("--season-hero-shift", `${nextShift}px`);
        shellElement.style.setProperty("--season-hero-offset", `${nextOffset}px`);
      });
    }

    syncCollapsedHeader();
    window.addEventListener("scroll", syncCollapsedHeader, { passive: true });
    window.addEventListener("resize", syncCollapsedHeader);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("scroll", syncCollapsedHeader);
      window.removeEventListener("resize", syncCollapsedHeader);
    };
  }, [currentView, selectedSeason, seasonEpisodes]);

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

  function handleMediaTypeChange(nextType) {
    setActiveMediaType(nextType);
    setCurrentView("series");
    setSeasonEpisodes(null);
    setSelectedEpisode(null);
    setEpisodeDialogOpen(false);
    setSettingsOpen(false);
    setAddSeriesOpen(false);
  }

  function handleSaveSeriesSettings(updates) {
    const activeItem = activeMediaType === "movies" ? selectedMovie : selectedSeries;
    if (!activeItem) return;

    try {
      if (activeMediaType === "movies") {
        const nextProfiles = updateSeriesProfile(String(activeItem.id), updates, "movies");
        setMovieProfiles(nextProfiles);
      } else {
        const nextProfiles = updateSeriesProfile(activeItem.directoryPath, updates, "series");
        setSeriesProfiles(nextProfiles);
      }
      setSettingsOpen(false);
    } catch (nextError) {
      window.alert(nextError.message || "No se pudieron guardar los cambios.");
    }
  }

  async function handleDeleteSeries() {
    const activeItem = activeMediaType === "movies" ? selectedMovie : selectedSeries;
    if (!activeItem) return;

    try {
      if (activeMediaType === "movies") {
        setMovieLibrary(removeMediaLibraryItem("movies", activeItem.id));
        setMovieProfiles(removeSeriesProfile(String(activeItem.id), "movies"));
        setSelectedMovieId((current) =>
          Number(current) === Number(activeItem.id) ? null : current
        );
      } else {
        await removeSeries(activeItem.directoryPath);
        const nextProfiles = removeSeriesProfile(activeItem.directoryPath, "series");
        setSeriesProfiles(nextProfiles);
        const nextVideos = await getVideos();
        setVideos(nextVideos);
        setSelectedDirectoryPath(nextVideos?.directories?.[0]?.relativePath || "");
      }
      setSettingsOpen(false);
    } catch (nextError) {
      window.alert(
        nextError.message ||
          `No se pudo eliminar la ${activeMediaType === "movies" ? "pelicula" : "serie"}.`
      );
    }
  }

  function handleOpenSeason(seasonId) {
    setSelectedSeasonId(seasonId);
    setSeasonEpisodes(null);
    setSelectedEpisode(null);
    setEpisodeDialogOpen(false);
    setCurrentView("season");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function handleBackToSeries() {
    setCurrentView("series");
    setSeasonEpisodes(null);
    setSelectedEpisode(null);
    setEpisodeDialogOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function handleOpenEpisodeDetails(episode) {
    setSelectedEpisode(episode);
    setEpisodeDialogOpen(true);
  }

  function handleCloseEpisodeDetails() {
    setEpisodeDialogOpen(false);
    setSelectedEpisode(null);
    setEpisodePlaying(false);
  }

  async function handlePlayEpisode() {
    if (!selectedEpisode || !selectedSeason || !selectedSeries?.directoryPath) return;

    const raspberryEpisodeId = toRaspberryEpisodeId(
      selectedSeason.seasonNumber || selectedSeason.id,
      selectedEpisode.episodeNumber
    );

    if (!raspberryEpisodeId) {
      window.alert("No se pudo convertir el episodio al formato SxxExx.");
      return;
    }

    try {
      setEpisodePlaying(true);
      await playEpisode({
        id: raspberryEpisodeId,
        directory: selectedSeries.directoryPath,
      });
      setEpisodeDialogOpen(false);
      setSelectedEpisode(null);
    } catch (nextError) {
      window.alert(nextError.message || "No se pudo reproducir el episodio.");
    } finally {
      setEpisodePlaying(false);
    }
  }

  async function handleAddSeries(selectedSeriesResult) {
    if (activeMediaType === "movies") {
      const nextLibrary = upsertMediaLibraryItem("movies", {
        id: selectedSeriesResult.id,
        name: selectedSeriesResult.name,
      });
      setMovieLibrary(nextLibrary);
      setSelectedMovieId(selectedSeriesResult.id);
      setAddSeriesOpen(false);
      return;
    }

    const addResponse = await addSeries({
      name: selectedSeriesResult.name,
      tmdbId: selectedSeriesResult.id,
    });
    const nextVideos = await getVideos();

    setVideos(nextVideos);
    setSelectedDirectoryPath((current) => {
      const addedPath = addResponse?.item?.relativePath;
      if (addedPath && nextVideos?.directories?.some((item) => item.relativePath === addedPath)) {
        return addedPath;
      }

      const addedByTmdbId = nextVideos?.directories?.find(
        (item) => Number(item.tmdbId) === Number(selectedSeriesResult.id)
      );
      return addedByTmdbId?.relativePath || current;
    });
    setAddSeriesOpen(false);
  }

  const isSeriesMode = activeMediaType === "series";
  const isMoviesMode = activeMediaType === "movies";
  const isGamesMode = activeMediaType === "games";
  const selectorOptions = isGamesMode ? [] : isMoviesMode ? movieOptions : seriesOptions;
  const selectorValue = isGamesMode
    ? ""
    : isMoviesMode
    ? String(selectedMovie?.id || "")
    : selectedSeries?.directoryPath || "";
  const selectorLabel = isGamesMode
    ? "Juegos en construccion"
    : isMoviesMode
      ? "Seleccionar pelicula"
      : "Seleccionar serie";
  const emptyTitle = isMoviesMode ? "Sin peliculas disponibles" : "Sin temporadas disponibles";
  const emptyDescription = isMoviesMode
    ? "Anade una pelicula desde TMDB con el boton + para empezar esta lista."
    : "No he podido cargar la informacion de temporadas desde TMDB para la serie seleccionada.";

  return (
    <main
      className="app-shell"
      style={{
        backgroundImage: `url(${cloudsBackground})`,
      }}
    >
      <div className={`page-overlay${currentView === "season" ? " page-overlay--season" : ""}`}>
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
                  onChange={(event) =>
                    setWebPinInput(event.target.value.replace(/\D/g, "").slice(0, 4))
                  }
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
            {loading || tmdbLoading ? (
              <section className="empty-state">
                <div className="empty-state__card">
                  <h2>{isMoviesMode ? "Cargando peliculas..." : "Cargando temporadas..."}</h2>
                  <p>
                    {isMoviesMode
                      ? "Estoy preparando la portada y los datos TMDB de la pelicula seleccionada."
                      : "Estoy preparando la portada y la cartelera TMDB de la serie seleccionada."}
                  </p>
                </div>
              </section>
            ) : error ? (
              <section className="empty-state">
                <div className="empty-state__card">
                  <h2>Error de conexion</h2>
                  <p>{error}</p>
                </div>
              </section>
            ) : isSeriesMode && currentView === "season" && selectedSeason ? (
              <section className="season-page">
                <button
                  className="season-page__back season-page__back--fixed"
                  onClick={handleBackToSeries}
                  type="button"
                >
                  ← Volver
                </button>

                <button
                  className="series-hero__tv-button series-hero__tv-button--season-fixed"
                  onClick={() => setMiniTvOpen(true)}
                  type="button"
                >
                  <img className="series-hero__tv" src={tvGreen} alt="Configurar mini-tele" />
                </button>

                <div ref={seasonHeroShellRef} className="season-page__hero-shell">
                  <header
                    className="season-page__hero"
                    style={{
                      backgroundImage: `linear-gradient(rgba(7, 12, 18, 0.12), rgba(7, 12, 18, 0.12)), url(${seasonHeroImage || selectedSeason.image || headerImage})`,
                    }}
                  >
                    <div className="season-page__hero-overlay">
                      <h1>{selectedSeries.name}</h1>
                      <p>{selectedSeason.title}</p>
                      <span>{selectedSeason.episodeCount} capitulos</span>
                    </div>
                  </header>
                </div>

                {seasonEpisodesLoading ? (
                  <section className="empty-state">
                    <div className="empty-state__card">
                      <h2>Cargando capitulos...</h2>
                      <p>Estoy leyendo la temporada seleccionada desde TMDB.</p>
                    </div>
                  </section>
                ) : (
                  <section className="season-page__episodes">
                    {(seasonEpisodes?.episodes || []).map((episode) => (
                      <EpisodeRow
                        key={episode.id}
                        episode={episode}
                        onSelect={handleOpenEpisodeDetails}
                      />
                    ))}
                  </section>
                )}
              </section>
            ) : (
              <>
                <section
                  className={`series-selector${hasSettingsButton ? "" : " series-selector--without-settings"}`}
                >
                  <div className="series-selector__header">
                    <div className="media-switch" role="tablist" aria-label="Tipo de catalogo">
                      {MEDIA_TYPES.map((mediaType) => {
                        const isActive = mediaType.id === activeMediaType;
                        return (
                          <button
                            key={mediaType.id}
                            className={`media-switch__option${isActive ? " active" : ""}`}
                            onClick={() => handleMediaTypeChange(mediaType.id)}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                          >
                            {mediaType.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>

                <header className="series-hero">
                  <div className="series-hero__banner">
                    <HeaderArt
                      image={headerImage}
                      crop={headerImageCrop}
                      alt={selectedItem?.name || "Cartell principal"}
                    >
                      <div className="series-hero__controls-row">
                        <button
                          className="series-icon-button series-icon-button--controls-plus"
                          onClick={() => setAddSeriesOpen(true)}
                          type="button"
                          aria-label={isGamesMode ? "Añadir juego" : `Añadir ${isMoviesMode ? "pelicula" : "serie"}`}
                          title={isGamesMode ? "Añadir juego" : `Añadir ${isMoviesMode ? "pelicula" : "serie"}`}
                        >
                          <svg
                            className="series-icon-button__icon series-icon-button__icon--plus"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </button>

                        <label className="series-select series-select--hero">
                          <select
                            aria-label={selectorLabel}
                            value={selectorValue}
                            disabled={isGamesMode}
                            onChange={(event) =>
                              isMoviesMode
                                ? setSelectedMovieId(Number(event.target.value) || null)
                                : setSelectedDirectoryPath(event.target.value)
                            }
                          >
                            {selectorOptions.length ? (
                              selectorOptions.map((item) => (
                                <option
                                  key={isMoviesMode ? item.id : item.directoryPath}
                                  value={isMoviesMode ? item.id : item.directoryPath}
                                >
                                  {item.name}
                                </option>
                              ))
                            ) : (
                              <option value="">{isGamesMode ? "Proximamente" : "Sin elementos"}</option>
                            )}
                          </select>
                        </label>
                      </div>
                    </HeaderArt>

                    {hasSettingsButton ? (
                      <button
                        className="series-icon-button series-icon-button--hero series-icon-button--hero-settings"
                        onClick={() => setSettingsOpen(true)}
                        type="button"
                        aria-label={`Personalizar ${isMoviesMode ? "pelicula" : "serie"}`}
                        title={`Personalizar ${isMoviesMode ? "pelicula" : "serie"}`}
                      >
                        <img
                          className="series-icon-button__image series-icon-button__image--settings"
                          src={settingsIcon}
                          alt=""
                          aria-hidden="true"
                          draggable="false"
                        />
                      </button>
                    ) : null}

                    <button
                      className="series-hero__tv-button"
                      onClick={() => setMiniTvOpen(true)}
                      type="button"
                    >
                      <img className="series-hero__tv" src={tvGreen} alt="Configurar mini-tele" />
                    </button>
                  </div>
                </header>

                {isGamesMode ? (
                  <section className="empty-state">
                    <div className="empty-state__card">
                      <h2>Juegos en construccion</h2>
                      <p>Este apartado todavia no tiene contenido disponible.</p>
                    </div>
                  </section>
                ) : !selectedItem || (isSeriesMode && !seasons.length) ? (
                  <section className="empty-state">
                    <div className="empty-state__card">
                      <h2>{emptyTitle}</h2>
                      <p>{emptyDescription}</p>
                    </div>
                  </section>
                ) : isSeriesMode ? (
                  <section className="seasons-section">
                    <div className="season-grid">
                      {seasons.map((season) => (
                        <SeasonCard
                          key={season.id}
                          season={season}
                          isActive={season.id === selectedSeasonId}
                          onSelect={handleOpenSeason}
                        />
                      ))}
                    </div>
                  </section>
                ) : (
                  <section className="empty-state">
                    <div className="empty-state__card">
                      <h2>{selectedMovie.name}</h2>
                      <p>
                        {selectedMovie.releaseDate
                          ? `Estreno: ${selectedMovie.releaseDate}`
                          : "Fecha de estreno no disponible."}
                      </p>
                      <p>
                        {selectedMovie.runtime
                          ? `Duracion: ${selectedMovie.runtime} minutos`
                          : "Duracion no disponible."}
                      </p>
                      <p>
                        {typeof selectedMovie.voteAverage === "number" && selectedMovie.voteAverage > 0
                          ? `Valoracion TMDB: ${selectedMovie.voteAverage.toFixed(1)}`
                          : "Valoracion TMDB no disponible."}
                      </p>
                      <p>{selectedMovie.overview || "Sin sinopsis disponible en TMDB."}</p>
                    </div>
                  </section>
                )}
              </>
            )}

            <SettingsModal
              visible={settingsOpen}
              mediaType={activeMediaType}
              item={selectedItem}
              imageOptions={selectedItem?.imageOptions || []}
              onClose={() => setSettingsOpen(false)}
              onSave={handleSaveSeriesSettings}
              onDelete={handleDeleteSeries}
            />

            <AddMediaModal
              visible={addSeriesOpen}
              mediaType={activeMediaType}
              onClose={() => setAddSeriesOpen(false)}
              onAdd={handleAddSeries}
            />
            <MiniTvModal visible={miniTvOpen} onClose={() => setMiniTvOpen(false)} />
            <EpisodeDetailsModal
              visible={episodeDialogOpen}
              episode={selectedEpisode}
              season={selectedSeason}
              seriesName={selectedSeries?.name || ""}
              playing={episodePlaying}
              onClose={handleCloseEpisodeDetails}
              onPlay={handlePlayEpisode}
            />
          </>
        )}
      </div>
    </main>
  );
}
