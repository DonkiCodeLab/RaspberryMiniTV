import React, { useEffect, useMemo, useRef, useState } from "react";
import cartellMask from "./assets/cartell_base_black_mask.png";
import cartellLogo from "./assets/cartell_logo.png";
import tvGreen from "./assets/tele_green_2_fixed.png";
import {
  addSeries,
  authWebPin,
  getStoredWebPin,
  getVideos,
  isMockMode,
  removeSeries,
  setStoredWebPin,
} from "./api/raspberryApi";
import { loadSeriesProfiles, removeSeriesProfile, updateSeriesProfile } from "./seriesProfiles";
import { getTvSeasonEpisodes, getTvSeriesById, resolveSeriesFromNames, searchTvSeries } from "./tmdbApi";

const TMDB_LANGUAGE = "es-ES";
const POSTER_ASPECT_RATIO = 714 / 228;
const HERO_VISIBLE_WIDTH_RATIO = 0.83;
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
    zoom: clamp(Number(crop?.zoom) || 1, 1, 3),
  };
}

function getHeroCropBounds(crop, imageSize, containerAspect = POSTER_ASPECT_RATIO) {
  const normalized = normalizeHeroCrop(crop);
  const fallbackVisibleFraction = 1 / normalized.zoom;
  const effectiveContainerAspect = containerAspect * HERO_VISIBLE_WIDTH_RATIO;

  if (!imageSize?.width || !imageSize?.height) {
    const minFocusX = Math.min((fallbackVisibleFraction * HERO_VISIBLE_WIDTH_RATIO) / 2, 0.5);
    const maxFocusX = 1 - minFocusX;
    const minFocusY = fallbackVisibleFraction / 2;
    const maxFocusY = 1 - minFocusY;
    return {
      minFocusX,
      maxFocusX,
      minFocusY,
      maxFocusY,
    };
  }

  const imageAspect = imageSize.width / imageSize.height;
  let visibleFractionX = fallbackVisibleFraction;
  let visibleFractionY = fallbackVisibleFraction;

  if (imageAspect > effectiveContainerAspect) {
    visibleFractionX = Math.min((effectiveContainerAspect / imageAspect) / normalized.zoom, 1);
  } else {
    visibleFractionY = Math.min((imageAspect / effectiveContainerAspect) / normalized.zoom, 1);
  }

  return {
    minFocusX: visibleFractionX / 2,
    maxFocusX: 1 - visibleFractionX / 2,
    minFocusY: visibleFractionY / 2,
    maxFocusY: 1 - visibleFractionY / 2,
  };
}

function clampHeroCrop(crop, imageSize, containerAspect = POSTER_ASPECT_RATIO) {
  const normalized = normalizeHeroCrop(crop);
  const bounds = getHeroCropBounds(normalized, imageSize, containerAspect);

  return {
    ...normalized,
    focusX: clamp(normalized.focusX, bounds.minFocusX, bounds.maxFocusX),
    focusY: clamp(normalized.focusY, bounds.minFocusY, bounds.maxFocusY),
  };
}

function getHeaderImageStyle(crop) {
  const normalized = normalizeHeroCrop(crop);

  return {
    objectPosition: `${normalized.focusX * 100}% ${normalized.focusY * 100}%`,
    transform: `scale(${normalized.zoom})`,
    transformOrigin: "center center",
  };
}

function HeaderArt({ image, crop, alt }) {
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

function EpisodeRow({ episode }) {
  return (
    <button className="episode-card" type="button">
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

function SettingsModal({ visible, series, imageOptions, onClose, onSave, onDelete }) {
  const [name, setName] = useState(series?.name || "");
  const [heroImage, setHeroImage] = useState(series?.heroImage || "");
  const [heroImageCrop, setHeroImageCrop] = useState(series?.heroImageCrop || DEFAULT_HERO_CROP);
  const [heroImageSize, setHeroImageSize] = useState(null);

  useEffect(() => {
    setName(series?.name || "");
    setHeroImage(series?.heroImage || imageOptions?.[0] || "");
    setHeroImageCrop(normalizeHeroCrop(series?.heroImageCrop || DEFAULT_HERO_CROP));
    setHeroImageSize(null);
  }, [series, imageOptions, visible]);

  useEffect(() => {
    if (!heroImage) {
      setHeroImageSize(null);
      return () => {};
    }

    let cancelled = false;
    const image = new window.Image();

    image.onload = () => {
      if (cancelled) return;

      const nextSize = {
        width: image.naturalWidth || 0,
        height: image.naturalHeight || 0,
      };

      setHeroImageSize(nextSize);
      setHeroImageCrop((currentCrop) => clampHeroCrop(currentCrop, nextSize));
    };

    image.onerror = () => {
      if (!cancelled) {
        setHeroImageSize(null);
      }
    };

    image.src = heroImage;

    return () => {
      cancelled = true;
    };
  }, [heroImage]);

  if (!visible || !series) return null;

  const normalizedImageOptions = Array.from(
    new Set([heroImage, ...(Array.isArray(imageOptions) ? imageOptions : [])].filter(Boolean))
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="dialog-card dialog-card--settings" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-card__header">
          <div>
            <p>Ajustes de la serie</p>
            <h2>{series.name}</h2>
          </div>
          <button className="dialog-card__close" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="dialog-card__body">
          <label className="dialog-field">
            <span>Nombre visible</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nombre de la serie"
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
                        clampHeroCrop(imageUrl === heroImage ? heroImageCrop : DEFAULT_HERO_CROP, heroImageSize)
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
              <label className="dialog-vertical-control">
                <span>Posicion</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={normalizeHeroCrop(heroImageCrop).focusY}
                  onChange={(event) =>
                    setHeroImageCrop((currentCrop) =>
                      clampHeroCrop(
                        {
                          ...normalizeHeroCrop(currentCrop),
                          focusY: clamp(Number(event.target.value) || 0.5, 0, 1),
                        },
                        heroImageSize
                      )
                    )
                  }
                  disabled={!heroImage}
                />
              </label>

              <div className="dialog-poster-preview">
                <HeaderArt image={heroImage || cartellLogo} crop={heroImageCrop} alt="" />
              </div>
            </div>
          </div>
        </div>

        <div className="dialog-card__footer">
          <button
            className="dialog-button dialog-button--danger"
            onClick={() => {
              if (window.confirm(`¿Seguro que quieres eliminar la serie "${series.name}"?`)) {
                onDelete();
              }
            }}
            type="button"
          >
            Eliminar serie
          </button>

          <div className="dialog-card__actions">
            <button className="dialog-button dialog-button--ghost" onClick={onClose} type="button">
              Cancelar
            </button>
            <button
              className="dialog-button"
              onClick={() =>
                onSave({
                  name,
                  heroImage,
                  heroImageCrop: heroImage ? clampHeroCrop(heroImageCrop, heroImageSize) : null,
                })
              }
              type="button"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddSeriesModal({ visible, onClose, onAdd }) {
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
      setError("Escribe una serie para buscar.");
      return;
    }

    setSearching(true);
    setError("");
    setSelectedId(null);

    try {
      const nextResults = await searchTvSeries(trimmedQuery, TMDB_LANGUAGE);
      setResults(nextResults);
      if (!nextResults.length) {
        setError("No se han encontrado series para esa busqueda.");
      }
    } catch (nextError) {
      setError(nextError.message || "No se pudo buscar en TMDB.");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleAdd() {
    const selectedSeries = results.find((item) => item.id === selectedId);
    if (!selectedSeries) return;

    setSubmitting(true);
    setError("");

    try {
      await onAdd(selectedSeries);
    } catch (nextError) {
      setError(nextError.message || "No se pudo anadir la serie.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="dialog-card dialog-card--add-series" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-card__header">
          <div>
            <p>Anadir serie</p>
            <h2>Buscar en TMDB</h2>
          </div>
          <button className="dialog-card__close" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <form className="add-series-search" onSubmit={handleSearch}>
          <label className="dialog-field">
            <span>Busqueda</span>
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ejemplo: Futurama"
            />
          </label>

          <button className="dialog-button add-series-search__button" disabled={searching} type="submit">
            {searching ? "Buscando..." : "Buscar"}
          </button>
        </form>

        <div className="add-series-results">
          {results.length ? (
            <div className="add-series-results__list" role="listbox" aria-label="Resultados de series">
              {results.map((result) => {
                const isSelected = result.id === selectedId;
                const meta = [result.firstAirDate ? result.firstAirDate.slice(0, 4) : "", result.originalName]
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
                        {result.overview || "Sin descripcion disponible en TMDB."}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="add-series-results__empty">
              <p>Busca una serie para ver los resultados aqui.</p>
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
            {submitting ? "Anadiendo..." : "Anadir"}
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
  const [webPinInput, setWebPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [unlocked, setUnlocked] = useState(mockMode || Boolean(getStoredWebPin()));
  const [videos, setVideos] = useState(null);
  const [tmdbLoading, setTmdbLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDirectoryPath, setSelectedDirectoryPath] = useState("");
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  const [currentView, setCurrentView] = useState("series");
  const [seasonEpisodes, setSeasonEpisodes] = useState(null);
  const [seasonEpisodesLoading, setSeasonEpisodesLoading] = useState(false);
  const [seasonHeroImage, setSeasonHeroImage] = useState("");
  const [seriesProfiles, setSeriesProfiles] = useState(() => loadSeriesProfiles());
  const [tmdbSeriesMap, setTmdbSeriesMap] = useState({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addSeriesOpen, setAddSeriesOpen] = useState(false);
  const [miniTvOpen, setMiniTvOpen] = useState(false);
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

  const selectedSeries =
    seriesOptions.find((series) => series.directoryPath === selectedDirectoryPath) ||
    seriesOptions[0] ||
    null;

  const seasons = selectedSeries?.seasons || [];
  const headerImage = selectedSeries?.heroImage || cartellLogo;
  const headerImageCrop = selectedSeries?.heroImageCrop || DEFAULT_HERO_CROP;
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) || null;

  useEffect(() => {
    if (!selectedSeries && seriesOptions[0]) {
      setSelectedDirectoryPath(seriesOptions[0].directoryPath);
    }
  }, [selectedSeries, seriesOptions]);

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

        const minHeight = window.innerWidth <= 760 ? 190 : 242;
        const maxHeight =
          window.innerWidth <= 760
            ? window.innerHeight * 0.52
            : Math.min(window.innerHeight * 0.72, 720);
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

  function handleSaveSeriesSettings(updates) {
    if (!selectedSeries) return;

    try {
      const nextProfiles = updateSeriesProfile(selectedSeries.directoryPath, updates);
      setSeriesProfiles(nextProfiles);
      setSettingsOpen(false);
    } catch (nextError) {
      window.alert(nextError.message || "No se pudieron guardar los cambios.");
    }
  }

  async function handleDeleteSeries() {
    if (!selectedSeries) return;

    try {
      await removeSeries(selectedSeries.directoryPath);
      const nextProfiles = removeSeriesProfile(selectedSeries.directoryPath);
      setSeriesProfiles(nextProfiles);
      const nextVideos = await getVideos();
      setVideos(nextVideos);
      setSelectedDirectoryPath(nextVideos?.directories?.[0]?.relativePath || "");
      setSettingsOpen(false);
    } catch (nextError) {
      window.alert(nextError.message || "No se pudo eliminar la serie.");
    }
  }

  function handleOpenSeason(seasonId) {
    setSelectedSeasonId(seasonId);
    setSeasonEpisodes(null);
    setCurrentView("season");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function handleBackToSeries() {
    setCurrentView("series");
    setSeasonEpisodes(null);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  async function handleAddSeries(selectedSeriesResult) {
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

  return (
    <main
      className="app-shell"
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 0%, rgba(214, 235, 247, 0.32), transparent 34%), linear-gradient(180deg, rgba(118, 160, 188, 0.96), rgba(109, 153, 184, 0.96))",
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
                  <h2>Cargando temporadas...</h2>
                  <p>Estoy preparando la portada y la cartelera TMDB de la serie seleccionada.</p>
                </div>
              </section>
            ) : error ? (
              <section className="empty-state">
                <div className="empty-state__card">
                  <h2>Error de conexion</h2>
                  <p>{error}</p>
                </div>
              </section>
            ) : !selectedSeries || !seasons.length ? (
              <section className="empty-state">
                <div className="empty-state__card">
                  <h2>Sin temporadas disponibles</h2>
                  <p>
                    No he podido cargar la informacion de temporadas desde TMDB para la serie
                    seleccionada.
                  </p>
                </div>
              </section>
            ) : currentView === "season" && selectedSeason ? (
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

                <div
                  ref={seasonHeroShellRef}
                  className="season-page__hero-shell"
                >
                  <header
                    className="season-page__hero"
                    style={{
                      backgroundImage: `linear-gradient(rgba(7, 12, 18, 0.12), rgba(7, 12, 18, 0.12)), url(${seasonHeroImage || selectedSeason.image || headerImage})`,
                    }}
                  >
                    <div className="season-page__hero-overlay">
                      <h1>{selectedSeason.title}</h1>
                      <p>{selectedSeries.name}</p>
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
                      <EpisodeRow key={episode.id} episode={episode} />
                    ))}
                  </section>
                )}
              </section>
            ) : (
              <>
                <header className="series-hero">
                  <div className="series-hero__banner">
                    <HeaderArt
                      image={headerImage}
                      crop={headerImageCrop}
                      alt={selectedSeries?.name || "Cartell principal"}
                    />

                    <button
                      className="series-hero__tv-button"
                      onClick={() => setMiniTvOpen(true)}
                      type="button"
                    >
                      <img className="series-hero__tv" src={tvGreen} alt="Configurar mini-tele" />
                    </button>
                  </div>
                </header>

                <section className="series-selector">
                  <div className="series-selector__header">
                    <div>
                      <h1>Seleccionar serie</h1>
                    </div>
                  </div>

                  <div className="series-selector__controls">
                    <label className="series-select">
                      <select
                        value={selectedSeries?.directoryPath || ""}
                        onChange={(event) => setSelectedDirectoryPath(event.target.value)}
                      >
                        {seriesOptions.map((series) => (
                          <option key={series.directoryPath} value={series.directoryPath}>
                            {series.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      className="series-icon-button series-icon-button--settings"
                      onClick={() => setSettingsOpen(true)}
                      type="button"
                      aria-label="Personalizar serie"
                      title="Personalizar serie"
                    >
                      <svg
                        className="series-icon-button__icon series-icon-button__icon--settings"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <line x1="4" y1="6" x2="20" y2="6" />
                        <circle cx="9" cy="6" r="2.6" />
                        <line x1="4" y1="12" x2="20" y2="12" />
                        <circle cx="15" cy="12" r="2.6" />
                        <line x1="4" y1="18" x2="20" y2="18" />
                        <circle cx="8" cy="18" r="2.6" />
                      </svg>
                    </button>

                    <button
                      className="series-icon-button series-icon-button--plus"
                      onClick={() => setAddSeriesOpen(true)}
                      type="button"
                      aria-label="Añadir serie"
                      title="Añadir serie"
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
                  </div>

                </section>

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
              </>
            )}

            <SettingsModal
              visible={settingsOpen}
              series={selectedSeries}
              imageOptions={selectedSeries?.imageOptions || []}
              onClose={() => setSettingsOpen(false)}
              onSave={handleSaveSeriesSettings}
              onDelete={handleDeleteSeries}
            />

            <AddSeriesModal
              visible={addSeriesOpen}
              onClose={() => setAddSeriesOpen(false)}
              onAdd={handleAddSeries}
            />
            <MiniTvModal visible={miniTvOpen} onClose={() => setMiniTvOpen(false)} />
          </>
        )}
      </div>
    </main>
  );
}
