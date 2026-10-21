import { applyDocumentLanguage, normalizeLanguage } from "./i18n/languages.js";
import { useUiText, LanguageContext } from "./i18n/react.js";
import React, { useEffect, useState } from "react";
import BookReader from "./BookReader.jsx";
import EpubReader from "./EpubReader.jsx";
import { setStoredWebPin, getRaspberryLanguage } from "./api/raspberryApi";
import { mediaMarkKey } from "./mediaMarks.js";
import useUserProfiles from "./useUserProfiles.js";

// MiniTV opens the bundled web reader so page numbers and EPUB CFIs are portable.
export default function StandaloneBookReader({ params }) {
  const [language, setLanguage] = useState(() => { try { return normalizeLanguage(window.localStorage.getItem("minitv-raspberry-language-v1")); } catch { return "es"; } });
  useEffect(() => { let active = true; getRaspberryLanguage().then(result => { if (active) setLanguage(normalizeLanguage(result.language)); }).catch(() => {}); return () => { active = false; }; }, []);
  useEffect(() => { applyDocumentLanguage(language); }, [language]);
  return <LanguageContext.Provider value={language}><StandaloneReaderContent params={params} /></LanguageContext.Provider>;
}

function StandaloneReaderContent({ params }) {
  const ui = useUiText();
  const [authenticated, setAuthenticated] = useState(false);
  const [context, setContext] = useState(null);
  const [closed, setClosed] = useState(false);
  const profiles = useUserProfiles(authenticated, params.get("profile") || "default");
  useEffect(() => {
    const pin = new URLSearchParams(window.location.hash.slice(1)).get("readerPin");
    if (pin) {
      setStoredWebPin(pin);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    setAuthenticated(true);
  }, []);
  useEffect(() => {
    if (!profiles.ready || context || profiles.activeId !== (params.get("profile") || "default")) return;
    const relativePath = params.get("readerBook");
    const key = mediaMarkKey("book", relativePath);
    setContext({ userId: profiles.activeId, descriptor: { key, markKey: key },
      initialProgress: params.get("resume") === "1" ? profiles.state.progress[key] : null,
      book: { relativePath, name: relativePath.split("/").pop(), format: relativePath.split(".").pop().toLowerCase() } });
  }, [profiles.ready, context]);
  const close = async () => {
    try { await profiles.flush(); setClosed(true); window.close(); } catch { /* Keep the reader open until saved. */ }
  };
  if (closed) return <div className="profile-status">{ui("Tu posición está guardada. Puedes cerrar esta ventana.")}</div>;
  if (profiles.ready && profiles.activeId !== (params.get("profile") || "default")) return <div className="profile-status" role="alert">{ui("El usuario ya no existe. Cierra el lector y elige otro perfil.")}</div>;
  const Reader = context?.book.format === "epub" ? EpubReader : BookReader;
  return <>
    {context && <Reader book={context.book} initialProgress={context.initialProgress}
      onProgress={value => profiles.saveProgress(context.userId, context.descriptor, value)} onClose={close} />}
    {profiles.error && <div className="profile-status" role="alert">{profiles.error} <button type="button" onClick={profiles.reload}>{ui("Reintentar")}</button></div>}
    {!context && !profiles.error && <div className="profile-status" role="status">{ui("Abriendo el libro…")}</div>}
  </>;
}
