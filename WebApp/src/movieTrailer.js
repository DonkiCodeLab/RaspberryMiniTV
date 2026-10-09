export function selectMovieTrailer(videos) {
  return (Array.isArray(videos) ? videos : [])
    .filter(video => video.site === "YouTube" && video.type === "Trailer" && /^[A-Za-z0-9_-]{11}$/.test(video.key))
    .sort((a, b) => Number(Boolean(b.official)) - Number(Boolean(a.official)))[0] || null;
}
