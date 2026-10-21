import { intlLocale } from "./i18n/languages.js";
import { withLanguages } from "./i18n/index.js";
import { normalizeSubtitleLanguage } from "./subtitleLanguages.js";
export const subtitleStrings = withLanguages({
  es: { primary: "Subtítulo principal · abajo", auxiliary: "Subtítulo auxiliar · arriba", off: "Desactivado", external: "Externo", embedded: "Integrado", track: "Pista", unavailable: "No compatible con el navegador", loading: "Cargando subtítulos…", failed: "No se pudieron cargar los subtítulos.", retry: "Reintentar", auxiliaryHint: "En amarillo, para practicar idiomas", unknown: "No se pudieron comprobar las pistas integradas." },
  ca: { primary: "Subtítol principal · a baix", auxiliary: "Subtítol auxiliar · a dalt", off: "Desactivat", external: "Extern", embedded: "Integrat", track: "Pista", unavailable: "No compatible amb el navegador", loading: "Carregant subtítols…", failed: "No s’han pogut carregar els subtítols.", retry: "Torna-ho a provar", auxiliaryHint: "En groc, per practicar idiomes", unknown: "No s’han pogut comprovar les pistes integrades." },
  en: { primary: "Main subtitle · bottom", auxiliary: "Auxiliary subtitle · top", off: "Off", external: "External", embedded: "Embedded", track: "Track", unavailable: "Not supported in the browser", loading: "Loading subtitles…", failed: "Could not load subtitles.", retry: "Retry", auxiliaryHint: "In yellow, for language practice", unknown: "Could not check embedded subtitle tracks." },
});
export function subtitleUrl(source, id, base) {
  const url = new URL(source, base);
  url.searchParams.set("subtitles", id);
  // Subtitles always come from the original video, including converted playback.
  url.searchParams.delete("browserCopy");
  url.searchParams.delete("download");
  return url;
}
export function preferredSubtitle(tracks, language) {
  const target = normalizeSubtitleLanguage(language);
  const available = tracks.filter(track => track.available);
  return available.find(track => normalizeSubtitleLanguage(track.language) === target)?.id || available[0]?.id || "";
}
export function subtitleLabel(track, index, language = "es") {
  const s = subtitleStrings[language] || subtitleStrings.es;
  const aliases = { spa: "es", esp: "es", cat: "ca", eng: "en", fre: "fr", fra: "fr", ger: "de", deu: "de", rum: "ro", ron: "ro" };
  const code = aliases[track.language?.toLowerCase()] || track.language?.toLowerCase();
  let name = code;
  try { if (code) name = new Intl.DisplayNames([intlLocale(language)], { type: "language" }).of(code); } catch { /* Keep the original language tag. */ }
  const details = [...new Set([name, track.title].filter(Boolean))].join(" · ") || `${s.track} ${index + 1}`;
  return `${details} · ${track.kind === "external" ? s.external : s.embedded}${track.available ? "" : ` · ${s.unavailable}`}`;
}
export function styleSubtitleCues(track, auxiliary) {
  for (const cue of Array.from(track.cues || [])) {
    cue.snapToLines = !auxiliary;
    cue.line = auxiliary ? 5 : -2;
    cue.position = 50;
    cue.align = "center";
    cue.size = 90;
    cue.vertical = "";
    cue.text = `<c.${auxiliary ? "auxiliary" : "primary"}>${cue.text}</c>`;
  }
  track.mode = "showing";
}
