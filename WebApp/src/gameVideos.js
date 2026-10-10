export function gameVideos(metadata, preferredVideo) {
  const seen = new Set();
  const videos = Array.isArray(metadata?.videos) ? metadata.videos : [];
  const entries = preferredVideo ? [{ ...preferredVideo, video_id: preferredVideo.id }, ...videos] : videos;
  return entries.filter(video => {
    const id = video?.video_id;
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map(video => ({ id: video.video_id, name: String(video.name || "YouTube"),
    channel: String(video.channel || ""),
    gameplay: /game\s*play|walkthrough|longplay|playthrough/i.test(video.name || "") }))
    .sort((a, b) => Number(b.id === preferredVideo?.id) - Number(a.id === preferredVideo?.id) || Number(b.gameplay) - Number(a.gameplay));
}
