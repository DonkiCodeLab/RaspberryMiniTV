import { normalizeLanguage } from "./i18n/languages.js";
import { withLanguages } from "./i18n/index.js";
import React, { useEffect, useState } from "react";

export default function BackToTop({ language = "es" }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const update = () => setVisible(window.scrollY > 300);
    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => window.removeEventListener("scroll", update);
  }, []);
  if (!visible) return null;
  const code = normalizeLanguage(language);
  const label = withLanguages({ es: "Volver al inicio", ca: "Tornar a l’inici", en: "Back to top" })[code] || "Back to top";
  return <button className="library-back-to-top" type="button" onClick={() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "instant" : "smooth" });
  }}><span aria-hidden="true">↑</span>{label}</button>;
}
