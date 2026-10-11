import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buildTmdbImageUrl, getPersonDetails } from "./tmdbApi.js";
import "./PersonDetailsModal.css";

const labels = {
  es: { close: "Cerrar", biography: "Biografía", loading: "Cargando ficha…", error: "No se pudo cargar la ficha. Comprueba la conexión e inténtalo de nuevo.", retry: "Reintentar", empty: "Todavía no hay una biografía disponible en TMDB.", born: "Nacimiento", died: "Fallecimiento", imdb: "Ver en IMDb", tmdb: "Ver en TMDB", profile: "Reparto y equipo" },
  ca: { close: "Tanca", biography: "Biografia", loading: "Carregant fitxa…", error: "No s’ha pogut carregar la fitxa. Comprova la connexió i torna-ho a provar.", retry: "Torna-ho a provar", empty: "Encara no hi ha una biografia disponible a TMDB.", born: "Naixement", died: "Defunció", imdb: "Veure a IMDb", tmdb: "Veure a TMDB", profile: "Repartiment i equip" },
  en: { close: "Close", biography: "Biography", loading: "Loading profile…", error: "The profile could not be loaded. Check your connection and try again.", retry: "Retry", empty: "There is no biography available on TMDB yet.", born: "Born", died: "Died", imdb: "View on IMDb", tmdb: "View on TMDB", profile: "Cast and crew" },
};

export default function PersonDetailsModal({ person, language, onClose }) {
  const lang = String(language || "es").toLowerCase().split(/[-_]/)[0];
  const locale = lang === "en" ? "en-US" : ["ca", "cat"].includes(lang) ? "ca-ES" : "es-ES";
  const t = labels[locale.split("-")[0]];
  const dialog = useRef(null);
  const headingId = useId();
  const [result, setResult] = useState(null);
  const [retry, setRetry] = useState(0);
  const [failedImage, setFailedImage] = useState(null);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    getPersonDetails(person.id, locale).then(data => {
      if (!cancelled) setResult({ data });
    }).catch(() => { if (!cancelled) setResult({ error: true }); });
    return () => { cancelled = true; };
  }, [person.id, locale, retry]);
  const data = result?.data;
  const photo = buildTmdbImageUrl(data?.profilePath || person.profilePath, "w342", true);
  const date = value => {
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(parsed);
  };
  return createPortal(<dialog ref={dialog} className="person-modal" aria-labelledby={headingId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <article className="person-modal__content">
      <button type="button" className="person-modal__close" aria-label={t.close} autoFocus onClick={onClose}>×</button>
      <header className="person-modal__header">
        <div className="person-modal__portrait" aria-hidden="true">
          {photo && failedImage !== photo ? <img src={photo} alt="" onError={() => setFailedImage(photo)} />
            : <span>{person.name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join("")}</span>}
        </div>
        <div className="person-modal__identity">
          <p className="person-modal__eyebrow">{t.profile}</p>
          <h2 id={headingId}>{data?.name || person.name}</h2>
          {person.characters?.length > 0 && <p className="person-modal__roles">{person.characters.join(" · ")}</p>}
          {data && <dl>
            {(data.birthday || data.birthplace) && <><dt>{t.born}</dt><dd>{[data.birthday && date(data.birthday), data.birthplace].filter(Boolean).join(" · ")}</dd></>}
            {data.deathday && <><dt>{t.died}</dt><dd>{date(data.deathday)}</dd></>}
          </dl>}
        </div>
      </header>
      {!result && <p role="status" className="person-modal__status">{t.loading}</p>}
      {result?.error && <div role="alert" className="person-modal__status"><p>{t.error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>{t.retry}</button></div>}
      {data && <><section className="person-modal__biography"><h3>{t.biography}</h3><p>{data.biography || t.empty}</p></section>
        <footer className="person-modal__links">
          {data.imdbUrl && <a className="person-modal__imdb" href={data.imdbUrl} target="_blank" rel="noopener noreferrer">{t.imdb} ↗</a>}
          <a href={data.tmdbUrl} target="_blank" rel="noopener noreferrer">{t.tmdb} ↗</a>
        </footer></>}
    </article>
  </dialog>, document.body);
}
