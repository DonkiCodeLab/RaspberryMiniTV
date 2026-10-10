const text = value => typeof value === "string" ? value.trim() : "";
const list = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values.map(text).filter(Boolean))];
const writingJobs = new Set(["writer", "screenplay", "story", "teleplay", "characters", "novel", "author", "adaptation", "original story", "original film writer", "original series creator"]);

function identity(person) {
  const id = Number(person?.id);
  const name = text(person?.name) || text(person?.original_name);
  if (!name) return null;
  return { id: Number.isSafeInteger(id) && id > 0 ? id : null, name,
    key: Number.isSafeInteger(id) && id > 0 ? `person:${id}` : `name:${name.toLocaleLowerCase()}` };
}

function mergePeople(entries, details) {
  const people = new Map();
  for (const item of list(entries)) {
    const person = identity(item);
    if (!person) continue;
    const next = details(item);
    const previous = people.get(person.key);
    const merged = { ...person, ...next };
    if (previous) {
      for (const field of ["characters", "jobs", "departments"]) {
        if (previous[field] || next[field]) merged[field] = unique([...(previous[field] || []), ...(next[field] || [])]);
      }
      if ("order" in next) merged.order = Math.min(previous.order, next.order);
      if ("episodeCount" in next) merged.episodeCount = Math.max(previous.episodeCount, next.episodeCount);
    }
    people.set(person.key, merged);
  }
  return [...people.values()];
}

// Movie credits use character/job; TV aggregate credits use roles[]/jobs[].
// Preserve every person and role, using TMDB IDs to avoid merging namesakes.
export function normalizeMediaCredits(payload) {
  const cast = mergePeople(payload?.cast, item => ({
    characters: unique([item.character, ...list(item.roles).map(role => role?.character)]),
    order: Number.isFinite(Number(item.order)) && item.order != null ? Number(item.order) : Infinity,
    episodeCount: Math.max(0, Number(item.total_episode_count) || 0,
      ...list(item.roles).map(role => Number(role?.episode_count) || 0)),
  })).sort((left, right) => left.order - right.order);
  const crew = mergePeople(payload?.crew, item => ({
    jobs: unique([item.job, ...list(item.jobs).map(job => job?.job)]),
    departments: unique([item.department]),
  }));
  return {
    cast,
    directors: crew.filter(person => person.jobs.some(job => job.toLowerCase() === "director")),
    writers: crew.filter(person => person.departments.some(department => department.toLowerCase() === "writing") ||
      person.jobs.some(job => writingJobs.has(job.toLowerCase()))),
  };
}

export function normalizeCreators(creators) {
  return mergePeople(creators, () => ({}));
}

export function mediaCreditsFailure(error) {
  return error?.code === "TMDB_LOCAL_MISSING" || [400, 404].includes(error?.status) ? "pending" : "error";
}
