export function playbackArtwork(media, fallback = "") {
  return media?.posterImage || media?.imageOptions?.[1] || media?.heroImage || media?.imageOptions?.[0] || fallback;
}

export function refreshCurrentPlayback(current, next) {
  if (!next) return null;
  const same = current && current.kind === next.kind &&
    String(current.playbackId).toUpperCase() === String(next.playbackId).toUpperCase() &&
    current.directory === next.directory && (!current.filePath || !next.filePath || current.filePath === next.filePath);
  const result = same ? { ...next, paused: current.paused,
    ...(current.kind === "episode" && current.episodeTitle && current.episodeTitle !== current.playbackId
      ? { episodeTitle: current.episodeTitle } : {}),
  } : next;
  return JSON.stringify(result) === JSON.stringify(current) ? current : result;
}
