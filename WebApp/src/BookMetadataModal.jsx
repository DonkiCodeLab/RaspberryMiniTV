import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getBookMetadataDetails, searchBookMetadata } from "./api/raspberryApi";

const fields = ["title", "subtitle", "author", "year", "isbn", "publisher", "publishDate", "language", "pageCount", "subjects", "description", "coverUrl", "openLibraryKey", "editionKey"];
const initialForm = book => Object.fromEntries(fields.map(key => [key, book[key] || (key === "title" ? book.name : "") || ""]));
export const bookSearchQuery = name => String(name || "").replace(/\.(epub|pdf|cbz|cbr)$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

async function embeddedMetadata(file) {
  const { default: ePub } = await import("epubjs");
  const epub = ePub();
  epub.opened.catch(() => {});
  try {
    await epub.open(await file.arrayBuffer(), "binary");
    // open() parses the package before navigation and resource replacement finish.
    // Wait for those jobs before destroying the temporary book.
    await Promise.all([epub.opened, epub.ready]);
    const data = await epub.loaded.metadata;
    return { title: data.title || "", author: data.creator || "", language: data.language || "", publisher: data.publisher || "", description: data.description?.replace(/<[^>]*>/g, "") || "" };
  } finally { epub.destroy(); }
}

export default function BookMetadataModal({ book, language, onClose, onSave, onDelete, BookCover }) {
  const [form, setForm] = useState({});
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState("");
  const controllerRef = useRef(null);
  const isUpload = Boolean(book?.uploadFile);

  useEffect(() => {
    if (!book) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setForm(initialForm(book)); setQuery(bookSearchQuery(book.name)); setResults([]);
    setError(""); setCoverFile(null); setSearched(false); setBusy("search");
    (async () => {
      let lookup = book.isbn || bookSearchQuery(book.name);
      if (book.uploadFile && book.format === "epub") {
        try {
          const embedded = await embeddedMetadata(book.uploadFile);
          if (controller.signal.aborted) return;
          if (embedded.title) {
            setForm(current => ({ ...current, ...embedded }));
            lookup = `${embedded.title} ${embedded.author}`.trim();
          }
        } catch { /* Filename lookup and manual input also support imperfect EPUB metadata. */ }
      }
      if (controller.signal.aborted) return;
      setQuery(lookup);
      const response = await searchBookMetadata(lookup, language, { signal: controller.signal });
      if (!controller.signal.aborted) { setResults(response?.items || []); setSearched(true); }
    })().catch(next => { if (!controller.signal.aborted) setError(next.message || "No se pudo consultar Open Library."); })
      .finally(() => { if (!controller.signal.aborted) setBusy(""); });
    return () => { controller.abort(); };
  }, [book, language]);

  useEffect(() => {
    if (!coverFile) { setCoverPreview(""); return; }
    const preview = URL.createObjectURL(coverFile);
    setCoverPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [coverFile]);

  if (!book) return null;
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const close = () => { if (busy !== "save") { controllerRef.current?.abort(); onClose(); } };
  const signal = () => {
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    return controllerRef.current.signal;
  };
  async function search() {
    if (!query.trim() || busy) return;
    const requestSignal = signal();
    try {
      setBusy("search"); setError("");
      const response = await searchBookMetadata(query, language, { signal: requestSignal });
      if (!requestSignal.aborted) { setResults(response?.items || []); setSearched(true); }
    } catch (next) { if (!requestSignal.aborted) setError(next.message); }
    finally { if (!requestSignal.aborted) setBusy(""); }
  }
  async function select(result) {
    const requestSignal = signal();
    try {
      setBusy("details"); setError("");
      const response = await getBookMetadataDetails(result, { signal: requestSignal });
      if (requestSignal.aborted) return;
      const detail = response.item;
      setForm({ ...initialForm({}), ...result, ...detail,
        author: detail.author || result.author, year: detail.year || result.year,
        coverUrl: detail.coverUrl || result.coverUrl });
      setCoverFile(null);
    } catch (next) { if (!requestSignal.aborted) setError(next.message || "No se pudo recuperar la ficha."); }
    finally { if (!requestSignal.aborted) setBusy(""); }
  }
  async function save() {
    try {
      setBusy("save"); setError("");
      await onSave({ ...form, coverFile, relativePath: book.relativePath });
    } catch (next) { setError(next.message || "No se pudo guardar la ficha."); }
    finally { setBusy(""); }
  }

  return createPortal(<div className="modal-backdrop" onClick={close}>
    <div className="dialog-card book-metadata" role="dialog" aria-modal="true" aria-labelledby="book-metadata-title" onClick={event => event.stopPropagation()}>
      <div className="dialog-card__header"><div><p>Biblioteca · Open Library</p><h2 id="book-metadata-title">{isUpload ? "Identifica el libro antes de subirlo" : "Información del libro"}</h2></div><button className="dialog-card__close" onClick={close} disabled={busy === "save"} type="button" aria-label="Cerrar">×</button></div>
      <p className="book-metadata__intro">{isUpload ? `Archivo: ${book.uploadFile.name}. ` : ""}Busca y selecciona una coincidencia, revisa la ficha y confirma que es tu libro. También puedes completar los datos manualmente.</p>
      <div className="book-metadata__body">
        <section className="book-metadata__lookup">
          <label className="dialog-field"><span>Buscar por título, autor o ISBN</span><div className="book-metadata__search"><input value={query} disabled={Boolean(busy)} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); search(); } }} /><button className="dialog-button dialog-button--accent" onClick={search} disabled={Boolean(busy) || !query.trim()} type="button">{busy === "search" ? "Buscando…" : "Buscar"}</button></div></label>
          {busy === "details" ? <p role="status">Recuperando la ficha completa…</p> : null}
          {error ? <p className="book-metadata__error" role="alert">{error}</p> : null}
          {searched && !busy && !results.length ? <p className="book-metadata__hint">No se han encontrado coincidencias. Prueba con otro título o ISBN, o completa la ficha manualmente.</p> : null}
          <div className="book-metadata__results">{results.map(result => <button key={`${result.openLibraryKey}-${result.editionKey}`} disabled={Boolean(busy)} aria-pressed={Boolean(form.openLibraryKey && result.openLibraryKey === form.openLibraryKey && result.editionKey === form.editionKey)} onClick={() => select(result)} type="button">{result.coverUrl ? <img src={result.coverUrl} alt="" /> : <span>📖</span>}<span><strong>{result.title}</strong><small>{result.author || "Autor desconocido"}{result.year ? ` · ${result.year}` : ""}</small>{result.language ? <small>{result.language}</small> : null}</span></button>)}</div>
          <p className="book-metadata__hint">Los campos disponibles dependen del libro y la edición. La ficha y la portada seleccionadas quedarán guardadas en tu biblioteca.</p>
        </section>
        <fieldset className="book-metadata__form" disabled={Boolean(busy)}>
          <legend className="sr-only">Ficha que se guardará</legend>
          <div className="book-metadata__preview"><BookCover book={{ ...book, coverUrl: coverPreview || form.coverUrl }} /></div>
          {[["title", "Título"], ["subtitle", "Subtítulo"], ["author", "Autores"]].map(([key, label]) => <label key={key} className="dialog-field"><span>{label}</span><input value={form[key] || ""} onChange={event => update(key, event.target.value)} /></label>)}
          <div className="book-metadata__row">{[["year", "Año"], ["isbn", "ISBN"], ["publisher", "Editorial"], ["publishDate", "Fecha de publicación"], ["language", "Idioma"], ["pageCount", "Páginas"]].map(([key, label]) => <label key={key} className="dialog-field"><span>{label}</span><input value={form[key] || ""} onChange={event => update(key, event.target.value)} /></label>)}</div>
          <label className="dialog-field"><span>Temas / géneros</span><input value={form.subjects || ""} onChange={event => update("subjects", event.target.value)} /></label>
          <label className="dialog-field"><span>Sinopsis</span><textarea value={form.description || ""} onChange={event => update("description", event.target.value)} rows="5" /></label>
          <label className="dialog-field"><span>URL de portada</span><input type="url" value={form.coverUrl || ""} onChange={event => update("coverUrl", event.target.value)} /></label>
          <button className="dialog-button dialog-button--ghost" type="button" onClick={() => { update("coverUrl", ""); setCoverFile(null); }}>Usar portada del archivo</button>
          <label className="dialog-field book-metadata__file"><span>Portada desde el equipo</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setCoverFile(event.target.files?.[0] || null)} />{coverFile ? <small>{coverFile.name}</small> : null}</label>
        </fieldset>
      </div>
      <div className="book-metadata__footer">{!isUpload ? <button className="dialog-button dialog-button--danger book-metadata__delete" disabled={Boolean(busy)} onClick={() => onDelete(book)} type="button">Borrar libro completo</button> : null}<button className="dialog-button dialog-button--ghost" onClick={close} disabled={busy === "save"} type="button">Cancelar</button><button className="dialog-button dialog-button--accent" disabled={Boolean(busy) || !String(form.title || "").trim()} onClick={save} type="button">{busy === "save" ? "Guardando…" : isUpload ? "Confirmar libro y subir" : "Confirmar y guardar ficha"}</button></div>
    </div>
  </div>, document.body);
}
