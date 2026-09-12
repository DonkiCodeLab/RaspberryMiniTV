import { getCachedLibrarySummaries, getCachedTmdbJson, isMockMode, localTmdbImageUrl, updateRaspberryTmdbSettings } from "./api/raspberryApi";
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
    id: 12609,
    name: "Dragon Ball",
    searchQuery: "Dragon Ball",
    aliases: ["Dragon Ball", "Bola de Dragon", "Bola de Dragón"],
  },
  {
    key: "dragon-ball-z",
    id: 12971,
    name: "Dragon Ball Z",
    aliases: ["Dragon Ball Z", "Bola de Dragon Z", "Bola de Dragón Z"],
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

function buildRottenTomatoesSearchUrl(title, releaseDate) {
  const year = String(releaseDate || "").match(/^\d{4}/)?.[0] || "";
  const query = [String(title || "").trim(), year].filter(Boolean).join(" ");
  return query
    ? `https://www.rottentomatoes.com/search/?search=${encodeURIComponent(query)}`
    : "";
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

async function fetchTmdbJsonWithEnglishOverview(path, { language, query, importPreview = false } = {}) {
  const data = await fetchTmdbJson(path, { language, query, importPreview });

  if (!hasText(data?.overview) && language && language !== TMDB_ENGLISH_FALLBACK_LANGUAGE) {
    try {
      const fallbackData = await fetchTmdbJson(path, {
        language: TMDB_ENGLISH_FALLBACK_LANGUAGE,
        query, importPreview,
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

let runtimeTmdbCredentials = null;

export function setTmdbCredentials({ apiKey = "", bearerToken = "" } = {}) {
  runtimeTmdbCredentials = {
    apiKey: String(apiKey || "").trim(),
    bearerToken: String(bearerToken || "").trim(),
  };
}

export async function initializeTmdbCredentials(serverCredentials = {}) {
  const hasServerCredentials = Boolean(serverCredentials.apiKey || serverCredentials.bearerToken);
  const credentials = hasServerCredentials ? serverCredentials : readTmdbCredentials();
  if (!isMockMode() && !hasServerCredentials && (credentials.apiKey || credentials.bearerToken)) {
    // Upgrade older installs before their catalog starts requesting the server cache.
    await updateRaspberryTmdbSettings(credentials);
  }
  setTmdbCredentials(credentials);
  return credentials;
}

export function readTmdbCredentials() {
  if (runtimeTmdbCredentials) return { ...runtimeTmdbCredentials };

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

async function fetchTmdbJson(path, { language, query, importPreview = false } = {}) {
  if (!isMockMode()) return getCachedTmdbJson(path, { language, query, importPreview });
  const { url, headers } = createTmdbRequest(path, { language, query });
  const response = await fetch(url, { method: "GET", headers });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`TMDB ${response.status}: ${errorText || "Request failed"}`);
  }

  return response.json();
}

export function buildTmdbImageUrl(path, size = "w500", importPreview = false) {
  if (!path) return null;
  const url = localTmdbImageUrl(`${TMDB_IMAGE_BASE_URL}/${size}${path}`);
  return importPreview ? url.replace("/tmdb/images/", "/tmdb/import/images/") : url;
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
    posterImage: buildTmdbImageUrl(item?.poster_path, "w342")?.replace("/tmdb/images/", "/tmdb/import/images/"),
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
    posterImage: buildTmdbImageUrl(item?.poster_path, "w342")?.replace("/tmdb/images/", "/tmdb/import/images/"),
    backdropImage: buildTmdbImageUrl(item?.backdrop_path, "w780"),
  }));
}

async function searchTvSeriesByName(query, language) {
  const results = await searchTvSeries(query, language);
  const normalizedQuery = normalizeText(query);
  const exactMatches = results.filter((result) =>
    [result.name, result.originalName].some((name) => normalizeText(name) === normalizedQuery)
  );
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) {
    throw new Error(`Hay varias series TMDB con el título "${query}". Selecciona la ficha correcta en TMDB.`);
  }
  return results[0] || null;
}

async function getTvSeriesImages(seriesId, language, importPreview = false) {
  const data = await fetchTmdbJson(`/tv/${seriesId}/images`, {
    language, importPreview,
    query: {
      include_image_language: "null,en,es",
    },
  });

  const posters = (Array.isArray(data?.posters) ? data.posters : []).map((item) =>
    buildTmdbImageUrl(item?.file_path, "w780", importPreview)
  );
  const backdrops = (Array.isArray(data?.backdrops) ? data.backdrops : []).map((item) =>
    buildTmdbImageUrl(item?.file_path, "w1280", importPreview)
  );

  return uniqueImageList([...posters, ...backdrops]);
}

async function getMovieImages(movieId, language, importPreview = false) {
  const data = await fetchTmdbJson(`/movie/${movieId}/images`, {
    language, importPreview,
    query: {
      include_image_language: "null,en,es",
    },
  });

  const posters = (Array.isArray(data?.posters) ? data.posters : []).map((item) =>
    buildTmdbImageUrl(item?.file_path, "w780", importPreview)
  );
  const backdrops = (Array.isArray(data?.backdrops) ? data.backdrops : []).map((item) =>
    buildTmdbImageUrl(item?.file_path, "w1280", importPreview)
  );

  return uniqueImageList([...posters, ...backdrops]);
}

export async function getLibrarySummaries(movies, directories, language) {
  let summaries;
  if (!isMockMode()) {
    summaries = await getCachedLibrarySummaries(language);
  } else {
    // Development mode has no Raspberry cache; request only the main card metadata.
    const read = async (kind, id) => {
      const data = await fetchTmdbJson(`/${kind}/${id}`, { language });
      return [String(id), { id, name: data.title || data.name, posterPath: data.poster_path,
        releaseDate: data.release_date, firstAirDate: data.first_air_date,
        voteAverage: data.vote_average, genres: (data.genres || []).map(g => g.name) }];
    };
    const movieIds = [...new Set(movies.map(m => Number(m.tmdbId ?? m.id)).filter(Boolean))];
    const seriesIds = [...new Set(directories.map(d => Number(d.tmdbId)).filter(Boolean))];
    const [movieEntries, seriesEntries] = await Promise.all([
      Promise.all(movieIds.map(id => read("movie", id))),
      Promise.all(seriesIds.map(id => read("tv", id))),
    ]);
    summaries = { movies: Object.fromEntries(movieEntries), series: Object.fromEntries(seriesEntries) };
  }
  const cards = collection => Object.fromEntries(Object.entries(collection || {}).map(([id, card]) =>
    [id, { ...card, posterImage: buildTmdbImageUrl(card.posterPath, "w500") }]));
  return { movies: cards(summaries.movies), series: cards(summaries.series) };
}

export async function getTvSeriesById(seriesId, language, importPreview = false) {
  const [show, availableImages] = await Promise.all([
    fetchTmdbJsonWithEnglishOverview(`/tv/${seriesId}`, { language, importPreview }),
    getTvSeriesImages(seriesId, language, importPreview).catch(() => []),
  ]);
  const heroImage =
    buildTmdbImageUrl(show?.backdrop_path, "w1280", importPreview) ||
    buildTmdbImageUrl(show?.poster_path, "w780", importPreview) ||
    null;
  const imageOptions = uniqueImageList([
    heroImage,
    buildTmdbImageUrl(show?.poster_path, "w780", importPreview),
    buildTmdbImageUrl(show?.backdrop_path, "w1280", importPreview),
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
        image: buildTmdbImageUrl(season?.poster_path, "w500", importPreview),
      };
    })
    .sort((a, b) => a.seasonNumber - b.seasonNumber);

  return {
    id: Number(show?.id) || Number(seriesId),
    name: show?.name || "Unknown show",
    firstAirDate: show?.first_air_date || "",
    voteAverage: Number(show?.vote_average) || 0,
    heroImage,
    imageOptions,
    seasonCount: seasons.length,
    totalEpisodeCount: seasons.reduce((total, season) => total + (season.episodeCount || 0), 0),
    seasons,
  };
}

export async function getMovieById(movieId, language, importPreview = false) {
  const [movie, availableImages] = await Promise.all([
    fetchTmdbJsonWithEnglishOverview(`/movie/${movieId}`, {
      language, importPreview,
      query: { append_to_response: "external_ids" },
    }),
    getMovieImages(movieId, language, importPreview).catch(() => []),
  ]);

  const heroImage =
    buildTmdbImageUrl(movie?.backdrop_path, "w1280", importPreview) ||
    buildTmdbImageUrl(movie?.poster_path, "w780", importPreview) ||
    null;
  const imageOptions = uniqueImageList([
    heroImage,
    buildTmdbImageUrl(movie?.poster_path, "w780", importPreview),
    buildTmdbImageUrl(movie?.backdrop_path, "w1280", importPreview),
    ...availableImages,
  ]);
  const imdbId = String(movie?.external_ids?.imdb_id || movie?.imdb_id || "").trim();
  const rottenTomatoesUrl = movie?.rottenTomatoesUrl || buildRottenTomatoesSearchUrl(
    movie?.title || movie?.original_title,
    movie?.release_date
  );

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
    genres: (Array.isArray(movie?.genres) ? movie.genres : [])
      .map((genre) => String(genre?.name || "").trim())
      .filter(Boolean),
    imdbUrl: imdbId ? `https://www.imdb.com/title/${imdbId}/` : "",
    rottenTomatoesUrl,
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

export async function getTvSeasonEpisodes({ seriesId, seasonNumber, language, importPreview = false }) {
  const season = await fetchTmdbJson(`/tv/${seriesId}/season/${seasonNumber}`, {
    language, importPreview, query: importPreview ? {} : { level: "cards" },
  });
  const episodes = (season?.episodes || []).map((episode) => {
    const episodeNumber = Number(episode?.episode_number) || 0;


    return {
      id: Number(episode?.id) || `${seasonNumber}-${episodeNumber}`,
      episodeNumber,
      title: episode?.name || `Episodio ${episodeNumber}`,
      ...(importPreview ? { synopsis: episode.overview || "" } : {}),
      airDate: episode?.air_date || "",
      image: buildTmdbImageUrl(episode?.still_path, "w780", importPreview),
      runtime: Number(episode?.runtime) || 0,
      voteAverage: Number(episode?.vote_average) || 0,
    };
  });

  return {
    id: Number(season?.season_number) || Number(seasonNumber),
    title: season?.name || `Temporada ${seasonNumber}`,
    episodeCount: episodes.length,
    image: buildTmdbImageUrl(season?.poster_path, "w500", importPreview),
    heroImage:
      buildTmdbImageUrl(season?.poster_path, "w780", importPreview) ||
      buildTmdbImageUrl(season?.poster_path, "w500", importPreview),
    episodes,
  };
}

export async function getTvEpisodeDetails({ seriesId, seasonNumber, episodeNumber, language }) {
  const episode = await fetchTmdbJsonWithEnglishOverview(`/tv/${seriesId}/season/${seasonNumber}/episode/${episodeNumber}`, { language });
  return { title: episode.name, synopsis: episode.overview || '', runtime: episode.runtime || 0, voteAverage: episode.vote_average || 0, airDate: episode.air_date || '', image: buildTmdbImageUrl(episode.still_path, 'w780') };
}
