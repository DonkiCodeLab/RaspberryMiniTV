const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";
const TMDB_ENGLISH_FALLBACK_LANGUAGE = "en-US";

const FALLBACK_SERIES = [
  {
    key: "demo-series",
    id: 456,
    name: "Demo Series",
    aliases: ["Demo Series"],
  },
  {
    key: "futurama",
    id: 615,
    name: "Futurama",
    aliases: ["Futurama"],
  },
  {
    key: "dragon-ball",
    name: "Dragon Ball",
    searchQuery: "Dragon Ball",
    aliases: ["Dragon Ball", "Bola de Dragon", "Bola de Dragón"],
  },
  {
    key: "dr-slump",
    name: "Dr. Slump",
    searchQuery: "Dr. Slump",
    aliases: ["Dr. Slump", "Arale"],
  },
];

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uniqueImageList(imageUrls) {
  const seen = new Set();

  return (Array.isArray(imageUrls) ? imageUrls : []).filter((imageUrl) => {
    const normalized = String(imageUrl || "").trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function hasText(value) {
  return String(value || "").trim().length > 0;
}

function isGenericEpisodeTitle(title, episodeNumber) {
  const normalizedTitle = normalizeText(title);
  const normalizedEpisode = String(Number(episodeNumber) || "").trim();

  if (!normalizedTitle || !normalizedEpisode) return true;

  return new Set([
    `episodio ${normalizedEpisode}`,
    `episodi ${normalizedEpisode}`,
    `episode ${normalizedEpisode}`,
    `capitulo ${normalizedEpisode}`,
    `capitol ${normalizedEpisode}`,
  ]).has(normalizedTitle);
}

async function fetchTmdbJsonWithEnglishOverview(path, { language, query } = {}) {
  const data = await fetchTmdbJson(path, { language, query });

  if (!hasText(data?.overview) && language && language !== TMDB_ENGLISH_FALLBACK_LANGUAGE) {
    try {
      const fallbackData = await fetchTmdbJson(path, {
        language: TMDB_ENGLISH_FALLBACK_LANGUAGE,
        query,
      });

      if (hasText(fallbackData?.overview)) {
        return {
          ...data,
          overview: fallbackData.overview,
        };
      }
    } catch {
      return data;
    }
  }

  return data;
}

async function fetchSearchResultsWithOverviewFallback(path, query, language) {
  const primaryData = await fetchTmdbJson(path, {
    language,
    query,
  });

  const primaryResults = Array.isArray(primaryData?.results) ? primaryData.results : [];

  if (!language || language === TMDB_ENGLISH_FALLBACK_LANGUAGE) {
    return primaryResults;
  }

  const needsFallback = primaryResults.some((item) => !hasText(item?.overview));
  if (!needsFallback) return primaryResults;

  try {
    const fallbackData = await fetchTmdbJson(path, {
      language: TMDB_ENGLISH_FALLBACK_LANGUAGE,
      query,
    });
    const fallbackResults = Array.isArray(fallbackData?.results) ? fallbackData.results : [];
    const fallbackById = new Map(
      fallbackResults.map((item) => [Number(item?.id), item]).filter(([id]) => Number.isFinite(id))
    );

    return primaryResults.map((item) => {
      if (hasText(item?.overview)) return item;
      const fallbackItem = fallbackById.get(Number(item?.id));
      if (!hasText(fallbackItem?.overview)) return item;
      return {
        ...item,
        overview: fallbackItem.overview,
      };
    });
  } catch {
    return primaryResults;
  }
}

function readTmdbCredentials() {
  const apiKey = String(
    import.meta.env.VITE_TMDB_API_KEY || import.meta.env.EXPO_PUBLIC_TMDB_API_KEY || ""
  ).trim();
  const bearerToken = String(
    import.meta.env.VITE_TMDB_BEARER_TOKEN ||
      import.meta.env.EXPO_PUBLIC_TMDB_BEARER_TOKEN ||
      ""
  ).trim();

  return { apiKey, bearerToken };
}

function createTmdbRequest(path, { language, query = {} } = {}) {
  const { apiKey, bearerToken } = readTmdbCredentials();

  if (!apiKey && !bearerToken) {
    throw new Error(
      "TMDB credentials missing. Define VITE_TMDB_API_KEY or VITE_TMDB_BEARER_TOKEN."
    );
  }

  const url = new URL(`${TMDB_BASE_URL}${path}`);
  if (language) {
    url.searchParams.set("language", language);
  }

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });

  const headers = {
    Accept: "application/json",
  };

  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  } else {
    url.searchParams.set("api_key", apiKey);
  }

  return { url: url.toString(), headers };
}

async function fetchTmdbJson(path, { language, query } = {}) {
  const { url, headers } = createTmdbRequest(path, { language, query });
  const response = await fetch(url, { method: "GET", headers });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`TMDB ${response.status}: ${errorText || "Request failed"}`);
  }

  return response.json();
}

export function buildTmdbImageUrl(path, size = "w500") {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

function getKnownSeriesMatch(...values) {
  const candidates = values.map((value) => normalizeText(value)).filter(Boolean);

  return (
    FALLBACK_SERIES.find((series) => {
      const seriesValues = [
        series.key,
        series.name,
        series.searchQuery,
        ...(Array.isArray(series.aliases) ? series.aliases : []),
      ]
        .map((value) => normalizeText(value))
        .filter(Boolean);

      return candidates.some((candidate) => seriesValues.includes(candidate));
    }) || null
  );
}

export async function searchTvSeries(query, language) {
  const trimmedQuery = String(query || "").trim();
  if (!trimmedQuery) return [];

  const results = await fetchSearchResultsWithOverviewFallback(
    "/search/tv",
    {
      query: trimmedQuery,
      include_adult: "false",
      page: 1,
    },
    language
  );

  return results.map((item) => ({
    id: Number(item?.id),
    name: item?.name || item?.original_name || "Unknown show",
    originalName: item?.original_name || "",
    overview: item?.overview || "",
    firstAirDate: item?.first_air_date || "",
    posterImage: buildTmdbImageUrl(item?.poster_path, "w342"),
    backdropImage: buildTmdbImageUrl(item?.backdrop_path, "w780"),
  }));
}

export async function searchMovies(query, language) {
  const trimmedQuery = String(query || "").trim();
  if (!trimmedQuery) return [];

  const results = await fetchSearchResultsWithOverviewFallback(
    "/search/movie",
    {
      query: trimmedQuery,
      include_adult: "false",
      page: 1,
    },
    language
  );

  return results.map((item) => ({
    id: Number(item?.id),
    name: item?.title || item?.original_title || "Unknown movie",
    originalName: item?.original_title || "",
    overview: item?.overview || "",
    releaseDate: item?.release_date || "",
    posterImage: buildTmdbImageUrl(item?.poster_path, "w342"),
    backdropImage: buildTmdbImageUrl(item?.backdrop_path, "w780"),
  }));
}

async function searchTvSeriesByName(query, language) {
  const results = await searchTvSeries(query, language);
  return results[0] || null;
}

async function getTvSeriesImages(seriesId, language) {
  const data = await fetchTmdbJson(`/tv/${seriesId}/images`, {
    language,
    query: {
      include_image_language: "null,en,es",
    },
  });

  const posters = (Array.isArray(data?.posters) ? data.posters : []).map((item) =>
    buildTmdbImageUrl(item?.file_path, "w780")
  );
  const backdrops = (Array.isArray(data?.backdrops) ? data.backdrops : []).map((item) =>
    buildTmdbImageUrl(item?.file_path, "w1280")
  );

  return uniqueImageList([...posters, ...backdrops]);
}

async function getMovieImages(movieId, language) {
  const data = await fetchTmdbJson(`/movie/${movieId}/images`, {
    language,
    query: {
      include_image_language: "null,en,es",
    },
  });

  const posters = (Array.isArray(data?.posters) ? data.posters : []).map((item) =>
    buildTmdbImageUrl(item?.file_path, "w780")
  );
  const backdrops = (Array.isArray(data?.backdrops) ? data.backdrops : []).map((item) =>
    buildTmdbImageUrl(item?.file_path, "w1280")
  );

  return uniqueImageList([...posters, ...backdrops]);
}

export async function getTvSeriesById(seriesId, language) {
  const [show, availableImages] = await Promise.all([
    fetchTmdbJsonWithEnglishOverview(`/tv/${seriesId}`, { language }),
    getTvSeriesImages(seriesId, language).catch(() => []),
  ]);
  const heroImage =
    buildTmdbImageUrl(show?.backdrop_path, "w1280") ||
    buildTmdbImageUrl(show?.poster_path, "w780") ||
    null;
  const imageOptions = uniqueImageList([
    heroImage,
    buildTmdbImageUrl(show?.poster_path, "w780"),
    buildTmdbImageUrl(show?.backdrop_path, "w1280"),
    ...availableImages,
  ]);

  const seasons = (show?.seasons || [])
    .filter((season) => Number(season?.season_number) > 0)
    .map((season) => {
      const seasonNumber = Number(season?.season_number);
      return {
        id: seasonNumber,
        seasonNumber,
        title: season?.name || `Season ${seasonNumber}`,
        episodeCount: Number(season?.episode_count) || 0,
        image: buildTmdbImageUrl(season?.poster_path, "w500"),
      };
    })
    .sort((a, b) => a.seasonNumber - b.seasonNumber);

  return {
    id: Number(show?.id) || Number(seriesId),
    name: show?.name || "Unknown show",
    heroImage,
    imageOptions,
    seasonCount: seasons.length,
    totalEpisodeCount: seasons.reduce((total, season) => total + (season.episodeCount || 0), 0),
    seasons,
  };
}

export async function getMovieById(movieId, language) {
  const [movie, availableImages] = await Promise.all([
    fetchTmdbJsonWithEnglishOverview(`/movie/${movieId}`, { language }),
    getMovieImages(movieId, language).catch(() => []),
  ]);

  const heroImage =
    buildTmdbImageUrl(movie?.backdrop_path, "w1280") ||
    buildTmdbImageUrl(movie?.poster_path, "w780") ||
    null;
  const imageOptions = uniqueImageList([
    heroImage,
    buildTmdbImageUrl(movie?.poster_path, "w780"),
    buildTmdbImageUrl(movie?.backdrop_path, "w1280"),
    ...availableImages,
  ]);

  return {
    id: Number(movie?.id) || Number(movieId),
    name: movie?.title || "Unknown movie",
    originalName: movie?.original_title || "",
    heroImage,
    imageOptions,
    overview: movie?.overview || "",
    releaseDate: movie?.release_date || "",
    runtime: Number(movie?.runtime) || 0,
    voteAverage: Number(movie?.vote_average) || 0,
  };
}

export async function resolveSeriesFromNames({ directoryName, displayName, language }) {
  const known = getKnownSeriesMatch(directoryName, displayName);
  let seriesId = Number(known?.id) || null;

  if (!seriesId) {
    const found = await searchTvSeriesByName(
      known?.searchQuery || displayName || directoryName,
      language
    );
    seriesId = Number(found?.id) || null;
  }

  if (!seriesId) {
    throw new Error(`No se pudo resolver la serie TMDB para "${displayName || directoryName}".`);
  }

  return getTvSeriesById(seriesId, language);
}

export async function getTvSeasonEpisodes({ seriesId, seasonNumber, language }) {
  const season = await fetchTmdbJson(`/tv/${seriesId}/season/${seasonNumber}`, {
    language,
  });
  let englishEpisodesByNumber = new Map();

  if (language && language !== TMDB_ENGLISH_FALLBACK_LANGUAGE) {
    const primaryEpisodes = Array.isArray(season?.episodes) ? season.episodes : [];
    const needsFallback = primaryEpisodes.some(
      (episode) =>
        !hasText(episode?.overview) ||
        isGenericEpisodeTitle(episode?.name, Number(episode?.episode_number) || 0)
    );

    if (needsFallback) {
      try {
        const englishSeason = await fetchTmdbJson(`/tv/${seriesId}/season/${seasonNumber}`, {
          language: TMDB_ENGLISH_FALLBACK_LANGUAGE,
        });
        englishEpisodesByNumber = new Map(
          (Array.isArray(englishSeason?.episodes) ? englishSeason.episodes : []).map((episode) => [
            Number(episode?.episode_number) || 0,
            episode,
          ])
        );
      } catch {
        englishEpisodesByNumber = new Map();
      }
    }
  }

  const episodes = (season?.episodes || []).map((episode) => {
    const episodeNumber = Number(episode?.episode_number) || 0;
    const fallbackEpisode = englishEpisodesByNumber.get(episodeNumber);

    return {
      id: Number(episode?.id) || `${seasonNumber}-${episodeNumber}`,
      episodeNumber,
      title:
        isGenericEpisodeTitle(episode?.name, episodeNumber) && hasText(fallbackEpisode?.name)
          ? fallbackEpisode.name
          : episode?.name || `Episodio ${episodeNumber}`,
      synopsis: episode?.overview || fallbackEpisode?.overview || "",
      airDate: episode?.air_date || "",
      image: buildTmdbImageUrl(episode?.still_path, "w780"),
      runtime: Number(episode?.runtime) || 0,
      voteAverage: Number(episode?.vote_average) || 0,
    };
  });

  return {
    id: Number(season?.season_number) || Number(seasonNumber),
    title: season?.name || `Temporada ${seasonNumber}`,
    episodeCount: episodes.length,
    image: buildTmdbImageUrl(season?.poster_path, "w500"),
    heroImage:
      buildTmdbImageUrl(season?.poster_path, "w780") ||
      buildTmdbImageUrl(season?.poster_path, "w500"),
    episodes,
  };
}
