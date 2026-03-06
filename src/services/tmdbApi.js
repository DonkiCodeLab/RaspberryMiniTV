const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

const FALLBACK_SERIES = [
  {
    key: "simpsons",
    id: 456,
    name: "The Simpsons",
  },
  {
    key: "futurama",
    id: 615,
    name: "Futurama",
  },
  {
    key: "dragon-ball",
    name: "Bola de Dragon (Dragon Ball)",
    searchQuery: "Dragon Ball",
  },
  {
    key: "dr-slump",
    name: "Arale (Dr. Slump)",
    searchQuery: "Dr. Slump",
  },
];

function readTmdbCredentials() {
  const apiKey = String(process?.env?.EXPO_PUBLIC_TMDB_API_KEY || "").trim();
  const bearerToken = String(
    process?.env?.EXPO_PUBLIC_TMDB_BEARER_TOKEN || ""
  ).trim();

  return { apiKey, bearerToken };
}

function createTmdbRequest(path, { language, query = {} } = {}) {
  const { apiKey, bearerToken } = readTmdbCredentials();

  if (!apiKey && !bearerToken) {
    throw new Error(
      "TMDB credentials missing. Define EXPO_PUBLIC_TMDB_API_KEY or EXPO_PUBLIC_TMDB_BEARER_TOKEN."
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
  const res = await fetch(url, { method: "GET", headers });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`TMDB ${res.status}: ${errText || "Request failed"}`);
  }

  return res.json();
}

export function getAvailableSeries() {
  return FALLBACK_SERIES;
}

async function searchTvSeriesByName(query, language) {
  const data = await fetchTmdbJson("/search/tv", {
    language,
    query: {
      query,
      include_adult: "false",
      page: 1,
    },
  });

  const results = Array.isArray(data?.results) ? data.results : [];
  return results[0] || null;
}

export function buildTmdbImageUrl(path, size = "w500") {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

export async function getTvSeriesById(seriesId, language) {
  const show = await fetchTmdbJson(`/tv/${seriesId}`, { language });
  const fallbackRuntime = Number(show?.episode_run_time?.[0]) || null;

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
        headerImage:
          buildTmdbImageUrl(season?.poster_path, "w780") ||
          buildTmdbImageUrl(show?.backdrop_path, "w780"),
        avgColor: "#111",
      };
    })
    .sort((a, b) => a.seasonNumber - b.seasonNumber);

  return {
    id: Number(show?.id) || Number(seriesId),
    name: show?.name || "Unknown show",
    fallbackRuntime,
    seasons,
  };
}

export async function getTvSeriesFromOption(seriesOption, language) {
  if (!seriesOption) {
    throw new Error("No series selected.");
  }

  let seriesId = Number(seriesOption.id);

  if (!seriesId && seriesOption.searchQuery) {
    const found = await searchTvSeriesByName(seriesOption.searchQuery, language);
    seriesId = Number(found?.id);
  }

  if (!seriesId) {
    throw new Error(`Could not resolve TMDB id for "${seriesOption.name}".`);
  }

  return getTvSeriesById(seriesId, language);
}

export async function getTvSeasonEpisodes({
  seriesId,
  seasonNumber,
  language,
  fallbackRuntime,
}) {
  const season = await fetchTmdbJson(`/tv/${seriesId}/season/${seasonNumber}`, {
    language,
  });

  const episodes = (season?.episodes || []).map((episode) => {
    const epNumber = Number(episode?.episode_number);
    const normalizedSeason = Number(seasonNumber);
    const runtime = Number(episode?.runtime) || fallbackRuntime || null;
    const id = `${normalizedSeason}x${String(epNumber).padStart(2, "0")}`;

    return {
      id,
      episodeNumber: epNumber,
      title: episode?.name || `Episode ${epNumber}`,
      synopsis: episode?.overview || "",
      duration: runtime ? String(runtime) : "",
      airDate: episode?.air_date || "",
      image: buildTmdbImageUrl(episode?.still_path, "w780"),
      voteAverage: Number(episode?.vote_average) || 0,
    };
  });

  return {
    id: Number(season?.season_number) || Number(seasonNumber),
    title: season?.name || `Season ${seasonNumber}`,
    image: buildTmdbImageUrl(season?.poster_path, "w780"),
    avgColor: "#111",
    episodes,
  };
}
