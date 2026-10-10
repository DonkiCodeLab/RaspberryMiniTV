import { compareLibraryRatings, formatLibraryRating } from "./libraryRatings.js";

export function libraryScrollLabel(item, sort = "name", language = "es", ratingSource = "tmdb") {
  if (sort === "year") return String(item.year || item.releaseDate || "").match(/\b\d{4}\b/)?.[0] || "—";
  if (sort === "rating") {
    if (ratingSource !== "tmdb") return formatLibraryRating(item, ratingSource, language);
    const rating = Number(item.voteAverage);
    return rating > 0 ? `★ ${new Intl.NumberFormat(language, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(rating / 2)}` : "—";
  }
  const name = String(sort === "author" ? item.author || "" : item.label || item.name || "").trim().replace(/^[^\p{L}\p{N}]+/u, "");
  if (/^\p{N}/u.test(name)) return "0–9";
  // Preserve Ñ as its own letter while grouping accented vowels with their base letter.
  return (Array.from(name)[0] || "#").toLocaleUpperCase(language).normalize("NFD").replace(/(?!\u0303)\p{M}/gu, "").normalize("NFC");
}

export function scrollIndexAtPosition(positions, position) {
  let index = 0;
  for (let i = 1; i < positions.length; i += 1) {
    if (positions[i] > position + 1) break;
    // A grid row represents its first card.
    if (positions[i] > positions[index] + 1) index = i;
  }
  return index;
}

// Missing numeric metadata stays last in either direction; ties use the name.
export function compareLibraryItems(left, right, sort = "name", direction = "asc", language = "es", ratingSource = "tmdb") {
  if (sort === "rating") return compareLibraryRatings(left, right, ratingSource, direction, language);
  const names = String(left.label || left.name || "").localeCompare(String(right.label || right.name || ""), language, { sensitivity: "base", numeric: true });
  const sign = direction === "desc" ? -1 : 1;
  if (sort === "name") return sign * names;
  if (sort === "author") {
    const a = String(left.author || "").trim(), b = String(right.author || "").trim();
    if (!a || !b) return Number(!a) - Number(!b) || names;
    return sign * a.localeCompare(b, language, { sensitivity: "base", numeric: true }) || names;
  }
  const value = item => sort === "year"
    ? Number(String(item.year || item.releaseDate || "").match(/\b\d{4}\b/)?.[0]) || 0
    : Number(item.voteAverage) || 0;
  const a = value(left), b = value(right);
  if (a <= 0 || b <= 0) return (a <= 0) - (b <= 0) || names;
  return sign * (a - b) || names;
}

// Preserve the library's order and the original card indexes at both levels.
export function buildDecadeTicks(labels) {
  const groups = new Map();
  labels.forEach((year, index) => {
    const decade = /^\d{4}$/.test(year) ? String(Math.floor(Number(year) / 10) * 10) : "—";
    if (!groups.has(decade)) groups.set(decade, { label: decade, index, years: [] });
    const group = groups.get(decade);
    if (!group.years.some(([label]) => label === year)) group.years.push([year, index]);
  });
  return [...groups.values()];
}
