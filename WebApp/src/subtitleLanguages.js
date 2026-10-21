// Subtitle tags may come from FFmpeg (ISO 639-2), sidecars or OpenSubtitles.
// Keep unknown tags distinct: the UI language fallback would turn them into Spanish.
const aliases = {
  spa: "es", esp: "es", cat: "ca", eng: "en", chi: "zh", zho: "zh", cmn: "zh",
  hin: "hi", ara: "ar", "ar-eg": "arz", fra: "fr", fre: "fr", ben: "bn",
  por: "pt", ind: "id", in: "id", urd: "ur", rus: "ru", deu: "de", ger: "de",
  jpn: "ja", mar: "mr", vie: "vi", tel: "te", swa: "sw", swh: "sw", hau: "ha",
};

export function normalizeSubtitleLanguage(value) {
  const code = String(value || "").trim().toLowerCase().replaceAll("_", "-");
  if (aliases[code]) return aliases[code];
  const base = code.split("-")[0];
  return aliases[base] || base;
}
