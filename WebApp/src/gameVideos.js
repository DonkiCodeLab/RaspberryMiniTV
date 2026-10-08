export function gameVideos(metadata) {
  const seen = new Set();
  return (Array.isArray(metadata?.videos) ? metadata.videos : []).filter(video => {
    const id = video?.video_id;
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map(video => ({ id: video.video_id, name: String(video.name || "YouTube"),
    gameplay: /game\s*play|walkthrough|longplay|playthrough/i.test(video.name || "") }))
    .sort((a, b) => Number(b.gameplay) - Number(a.gameplay));
}
