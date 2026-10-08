export const DEFAULT_USER = { id: "default", name: "default", avatar: "avatar-01" };
export const EMPTY_STATE = { marks: {}, progress: {} };

export function mergeProfileState(state = EMPTY_STATE, patch) {
  const marks = { ...state.marks };
  for (const [key, value] of Object.entries(patch.marks || {})) {
    const previous = marks[key] || {};
    marks[key] = { ...previous, ...value };
    if (value.episodes && !Object.hasOwn(value, "watched")) {
      marks[key].episodes = { ...previous.episodes, ...value.episodes };
    }
  }
  return { marks, progress: { ...state.progress, ...patch.progress } };
}

// Send only edited fields, so another browser's favorites/progress survive.
export function marksPatch(previous, next) {
  const patch = {};
  for (const [key, value] of Object.entries(next)) {
    for (const [field, data] of Object.entries(value)) {
      if (JSON.stringify(previous[key]?.[field]) !== JSON.stringify(data)) {
        patch[key] ||= {};
        patch[key][field] = field === "episodes" && !Object.hasOwn(patch[key], "watched")
          ? Object.fromEntries(Object.entries(data).filter(([episode, watched]) => previous[key]?.episodes?.[episode] !== watched)) : data;
        if (field === "episodes" && !Object.keys(data).length && typeof value.watched === "boolean") patch[key].watched = value.watched;
      }
    }
  }
  return patch;
}

export function completionMarks(descriptor, progress) {
  if (!progress.completed || !descriptor?.markKey) return {};
  return { [descriptor.markKey]: descriptor.episodeNumber != null
    ? { episodes: { [descriptor.episodeNumber]: true } } : { watched: true } };
}

export function progressLabel(progress, language = "es") {
  if (progress.kind === "video") {
    const seconds = Math.floor(progress.seconds || 0);
    return `${Math.floor(seconds / 3600) ? `${Math.floor(seconds / 3600)}:` : ""}${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }
  const page = language === "en" ? "Page" : language === "ca" ? "Pàgina" : "Página";
  const section = language === "en" ? "section" : language === "ca" ? "secció" : "sección";
  return `${page} ${progress.page || 1}${progress.section ? ` · ${section} ${progress.section}` : ""}`;
}
