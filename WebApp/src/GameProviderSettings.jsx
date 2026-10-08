import React, { useEffect, useState } from "react";
import { getGameSettings, saveGameSettings } from "./api/raspberryApi";
import "./OpenSubtitlesSettings.css";
import ServiceCredentialTest from "./ServiceCredentialTest.jsx";

const strings = {
  es: { title: "Fichas de videojuegos", intro: "Configura al menos una fuente para buscar fichas reales. Las credenciales se guardan en el servidor.", keep: "Configurado: dejar vacío para conservar", save: "Guardar configuración", saving: "Guardando…", saved: "Configuración guardada.", error: "No se pudo cargar o guardar la configuración.", retry: "Reintentar", demo: "Modo maqueta: conecta con un servidor local o la Raspberry para guardar credenciales y buscar fichas reales.", ready: "Credenciales configuradas (sin verificar)", missing: "Faltan credenciales", help: "Obtener credenciales", optional: "opcional", user: "Usuario", password: "Contraseña", soft: "Nombre de aplicación", clear: "Borrar credenciales de esta fuente", hint: "Deja los campos vacíos para conservar sus valores. Borrar una fuente también desactiva sus credenciales del entorno." },
  ca: { title: "Fitxes de videojocs", intro: "Configura almenys una font per cercar fitxes reals. Les credencials es desen al servidor.", keep: "Configurat: deixa-ho buit per conservar", save: "Desa la configuració", saving: "Desant…", saved: "Configuració desada.", error: "No s'ha pogut carregar o desar la configuració.", retry: "Torna-ho a provar", demo: "Mode maqueta: connecta amb un servidor local o la Raspberry per desar credencials i cercar fitxes reals.", ready: "Credencials configurades (sense verificar)", missing: "Falten credencials", help: "Obtenir credencials", optional: "opcional", user: "Usuari", password: "Contrasenya", soft: "Nom de l'aplicació", clear: "Esborra les credencials d'aquesta font", hint: "Deixa els camps buits per conservar els valors. Esborrar una font també desactiva les credencials de l'entorn." },
  en: { title: "Video game metadata", intro: "Configure at least one provider to search for real game profiles. Credentials are stored on the server.", keep: "Configured: leave blank to retain", save: "Save settings", saving: "Saving…", saved: "Settings saved.", error: "Could not load or save settings.", retry: "Retry", demo: "Demo mode: connect to a local server or Raspberry to save credentials and search for real profiles.", ready: "Credentials configured (not verified)", missing: "Credentials missing", help: "Get credentials", optional: "optional", user: "Username", password: "Password", soft: "Application name", clear: "Clear this provider's credentials", hint: "Leave fields blank to retain their values. Clearing a provider also disables its environment credentials." },
};
const providers = [
  { id: "youtube", name: "YouTube Data API v3", url: "https://developers.google.com/youtube/v3/getting-started", fields: [["YOUTUBE_API_KEY", "API key"]] },
  { id: "igdb", name: "IGDB", url: "https://api-docs.igdb.com/#account-creation", fields: [["IGDB_CLIENT_ID", "Client ID"], ["IGDB_CLIENT_SECRET", "Client Secret"]] },
  { id: "screenscraper", name: "ScreenScraper", url: "https://www.screenscraper.fr/webapi2.php", fields: [["SCREENSCRAPER_DEV_ID", "Developer ID"], ["SCREENSCRAPER_DEV_PASSWORD", "Developer password"], ["SCREENSCRAPER_SOFTNAME", "soft", true], ["SCREENSCRAPER_USER", "user", true], ["SCREENSCRAPER_PASSWORD", "password", true]] },
];

export default function GameProviderSettings({ language, youtube = false }) {
  const s = strings[language] || strings.es;
  const visibleProviders = providers.filter(provider => (provider.id === "youtube") === youtube);
  const youtubeIntro = { es: "Búsqueda de vídeos para videojuegos, películas y series.", ca: "Cerca de vídeos per a videojocs, pel·lícules i sèries.", en: "Video search for games, movies and TV series." };
  const [settings, setSettings] = useState(null);
  const [values, setValues] = useState({});
  const [clear, setClear] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    getGameSettings(controller.signal).then(data => { if (!controller.signal.aborted) { setSettings(data); setValues(data.values || {}); } })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [attempt]);
  async function save(event) {
    event.preventDefault();
    if (busy || !settings || settings.demo) return;
    setBusy(true); setError(false); setSaved(false);
    const updates = {};
    for (const provider of visibleProviders) for (const [key] of provider.fields) {
      if (clear[provider.id]) updates[key] = "";
      else if (values[key]?.trim()) updates[key] = values[key].trim();
    }
    try {
      const data = await saveGameSettings(updates); setSettings(data); setValues(data.values || {}); setClear({}); setSaved(true);
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  const disabled = busy || !settings || settings.demo;
  return <article className="raspberry-tmdb-card opensubtitles-settings game-provider-settings" id={youtube ? "youtube-settings" : "game-provider-settings"}>
    <div className="raspberry-tmdb-card__header"><h3>{youtube ? "YouTube Data API v3" : s.title}</h3><span>{youtube ? (youtubeIntro[language] || youtubeIntro.es) : s.intro}</span></div>
    <form onSubmit={save}>
      {visibleProviders.map(provider => <section key={provider.id}>
        <h4>{provider.name}</h4>
        <p>{settings && (settings[provider.id] ? s.ready : s.missing)} · <a href={provider.url} target="_blank" rel="noreferrer">{s.help}</a></p>
        <div className="raspberry-tmdb-card__form opensubtitles-settings__form">
          {provider.fields.map(([key, label, optional]) => <label key={key}>
            <span>{s[label] || label}{optional ? ` (${s.optional})` : ""}</span>
            <input type="text" autoComplete="off" maxLength={1024} disabled={disabled || clear[provider.id]}
              value={values[key] || ""} placeholder={settings?.present?.[key] ? s.keep : ""}
              onChange={event => { setValues(current => ({ ...current, [key]: event.target.value })); setSaved(false); }} />
          </label>)}
        </div>
        <ServiceCredentialTest provider={provider.id} language={language} disabled={disabled || clear[provider.id]}
          credentials={Object.fromEntries(provider.fields.map(([key]) => [key, values[key] || ""]))}
          configured={provider.fields.filter(([, , optional]) => !optional).every(([key]) => values[key]?.trim()) && !clear[provider.id]} />
        <label><input type="checkbox" disabled={disabled} checked={!!clear[provider.id]}
          onChange={event => { setClear(current => ({ ...current, [provider.id]: event.target.checked })); setSaved(false); }} /> {s.clear}</label>
      </section>)}
      <p>{s.hint}</p>
      <button className="raspberry-tmdb-card__save" type="submit" disabled={disabled}>{busy ? s.saving : s.save}</button>
    </form>
    {settings?.demo && <p role="status">{s.demo}</p>}
    {saved && <p role="status">{s.saved}</p>}
    {error && <p className="dialog-error" role="alert">{s.error}</p>}
    {error && !settings && <button className="dialog-button" onClick={() => setAttempt(value => value + 1)}>{s.retry}</button>}
  </article>;
}
