export const BOOK_LANGUAGES = ["es", "ca", "en"];
export const LOCALIZED_BOOK_FIELDS = ["title", "subtitle", "description", "subjects"];

export function isGraphicNovel(book = {}) {
  const original = book.originalMetadata || book;
  if (typeof original.isGraphicNovel === "boolean") return original.isGraphicNovel;
  const format = original.format || String(original.file || original.relativePath || "").split(".").pop();
  return ["cbz", "cbr"].includes(String(format).toLowerCase());
}

export function selectBookPageCount(current, detail) {
  if (current.pageCountSource === "manual") return { pageCount: current.pageCount, pageCountSource: "manual" };
  if (detail.pageCount) return { pageCount: detail.pageCount, pageCountSource: "openlibrary" };
  if (current.pageCountSource?.startsWith("epub-")) return { pageCount: current.pageCount, pageCountSource: current.pageCountSource };
  return { pageCount: "", pageCountSource: "" };
}

export function bookLanguage(language) {
  const code = String(language || "es").toLowerCase().replaceAll("_", "-").split("-")[0];
  return ({ cat: "ca", spa: "es", eng: "en" })[code] || (BOOK_LANGUAGES.includes(code) ? code : "es");
}

export function localizeBook(book, language) {
  const original = book.originalMetadata || book;
  const variant = original.localizedMetadata?.[bookLanguage(language)] || {};
  const localized = Object.fromEntries(LOCALIZED_BOOK_FIELDS.filter(key => Object.hasOwn(variant, key)).map(key => [key, variant[key]]));
  return { ...original, ...localized, name: localized.title || original.title || original.name,
    originalMetadata: original,
    descriptionFallback: Boolean(original.openLibraryKey && original.description && !Object.hasOwn(variant, "description")) };
}

export function updateBookMetadata(profile, key, value, language) {
  if (!LOCALIZED_BOOK_FIELDS.includes(key)) return { ...profile, [key]: value };
  const locale = bookLanguage(language);
  return { ...profile, ...(!profile.openLibraryKey ? { [key]: value } : {}),
    localizedMetadata: { ...profile.localizedMetadata, [locale]: { ...profile.localizedMetadata?.[locale], [key]: value } } };
}

export function bookLanguageName(code, language) {
  const locale = bookLanguage(language);
  const names = { es: { es: "Castellano", ca: "Catalán", en: "Inglés" }, ca: { es: "Castellà", ca: "Català", en: "Anglès" }, en: { es: "Spanish", ca: "Catalan", en: "English" } };
  return String(code || "").split(",").map(part => {
    const normalized = ({ spa: "es", cat: "ca", eng: "en" })[part.trim()] || part.trim();
    return names[locale][normalized] || part.trim();
  }).join(", ");
}
