import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getBookContent, getBookMetadataDetails, searchBookMetadata } from "./api/raspberryApi";
import { BOOK_LANGUAGES, bookLanguage, bookLanguageName, localizeBook, updateBookMetadata, selectBookPageCount, isGraphicNovel } from "./bookMetadata.js";
import { BookTypeField } from "./BookLibraryControls.jsx";
import { bookStrings } from "./bookStrings.js";
import { epubPagination } from "./epubMetadata.js";

const fields = ["title", "subtitle", "author", "year", "isbn", "publisher", "publishDate", "language", "pageCount", "pageCountSource", "subjects", "description", "coverUrl", "openLibraryKey", "editionKey"];
const initialForm = book => {
  const original = book.originalMetadata || book;
  return { ...Object.fromEntries(fields.map(key => [key, original[key] || (key === "title" ? original.name : "") || ""])), localizedMetadata: original.localizedMetadata || {}, isGraphicNovel: isGraphicNovel(original) };
};
export const bookSearchQuery = name => String(name || "").replace(/\.(epub|pdf|cbz|cbr)$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

async function embeddedMetadata(file) {
  const { default: ePub } = await import("epubjs");
  const epub = ePub();
  epub.opened.catch(() => {});
  try {
    await epub.open(file.arrayBuffer ? await file.arrayBuffer() : file, "binary");
    // open() parses the package before navigation and resource replacement finish.
    // Wait for those jobs before destroying the temporary book.
    await Promise.all([epub.opened, epub.ready]);
    const data = await epub.loaded.metadata;
    return { title: data.title || "", author: data.creator || "", language: data.language || "", publisher: data.publisher || "", description: data.description?.replace(/<[^>]*>/g, "") || "", ...epubPagination(epub) };
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
  const [useFileCover, setUseFileCover] = useState(true);
  const [coverPreview, setCoverPreview] = useState("");
  const [textLanguage, setTextLanguage] = useState(bookLanguage(language));
  const controllerRef = useRef(null);
  const isUpload = Boolean(book?.uploadFile);
  const t = bookStrings(language);
  const displayForm = localizeBook(form, textLanguage);

  useEffect(() => {
    if (!book) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setTextLanguage(bookLanguage(language));
    setUseFileCover(Boolean(book.uploadFile) || !book.coverUrl);
    setForm(initialForm(book)); setQuery(bookSearchQuery(book.name)); setResults([]);
    setError(""); setCoverFile(null); setSearched(false); setBusy("search");
    (async () => {
      let lookup = book.isbn || bookSearchQuery(book.name);
      if (book.format === "epub" && (book.uploadFile || book.relativePath)) {
        try {
          const source = book.uploadFile || (await getBookContent(book.relativePath, { format: "epub", signal: controller.signal })).buffer;
          if (controller.signal.aborted) return;
          const embedded = await embeddedMetadata(source);
          if (controller.signal.aborted) return;
          if (book.uploadFile && embedded.title) {
            setForm(current => ({ ...current, ...embedded }));
            lookup = `${embedded.title} ${embedded.author}`.trim();
          }
          if (embedded.pageCount && book.pageCountSource !== "manual" && !(book.openLibraryKey && book.pageCount)) setForm(current => ({ ...current, pageCount: embedded.pageCount, pageCountSource: embedded.pageCountSource }));
        } catch { /* Filename lookup and manual input also support imperfect EPUB metadata. */ }
      }
      if (controller.signal.aborted) return;
      setQuery(lookup);
      const response = await searchBookMetadata(lookup, language, { signal: controller.signal });
      if (!controller.signal.aborted) { setResults(response?.items || []); setSearched(true); }
    })().catch(next => { if (!controller.signal.aborted) setError(next.message || bookStrings(language).searchError); })
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
  const update = (key, value) => setForm(current => ({ ...updateBookMetadata(current, key, value, textLanguage), ...(key === "pageCount" ? { pageCountSource: "manual" } : {}) }));
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
      const response = await searchBookMetadata(query, textLanguage, { signal: requestSignal });
      if (!requestSignal.aborted) { setResults(response?.items || []); setSearched(true); }
    } catch (next) { if (!requestSignal.aborted) setError(next.message); }
    finally { if (!requestSignal.aborted) setBusy(""); }
  }
  async function select(result, refresh = false) {
    const requestSignal = signal();
    try {
      setBusy("details"); setError("");
      const response = await getBookMetadataDetails(result, { signal: requestSignal, language: textLanguage });
      if (requestSignal.aborted) return;
      const detail = response.item;
      if (refresh) {
        setForm(current => ({ ...current, ...selectBookPageCount(current, detail), localizedMetadata: Object.fromEntries(BOOK_LANGUAGES.map(code =>
          [code, { ...detail.localizedMetadata?.[code], ...current.localizedMetadata?.[code] }])) }));
      } else {
        setForm(current => ({ ...initialForm({}), ...result, ...detail,
          author: detail.author || result.author, year: detail.year || result.year,
          coverUrl: detail.coverUrl || result.coverUrl,
          isGraphicNovel: current.isGraphicNovel,
          ...selectBookPageCount(current, detail) }));
        setCoverFile(null);
      }
    } catch (next) { if (!requestSignal.aborted) setError(next.message || t.detailsError); }
    finally { if (!requestSignal.aborted) setBusy(""); }
  }
  async function save() {
    try {
      setBusy("save"); setError("");
      await onSave({ ...form, coverUrl: useFileCover ? "" : form.coverUrl,
        coverFile: useFileCover ? null : coverFile, relativePath: book.relativePath });
    } catch (next) { setError(next.message || t.saveError); }
    finally { setBusy(""); }
  }

  return createPortal(<div className="modal-backdrop">
    <div className="dialog-card book-metadata" role="dialog" aria-modal="true" aria-labelledby="book-metadata-title" onClick={event => event.stopPropagation()}>
      <div className="dialog-card__header"><div><p>{t.library}</p><h2 id="book-metadata-title">{isUpload ? t.uploadTitle : t.infoTitle}</h2></div><button className="dialog-card__close" onClick={close} disabled={busy === "save"} type="button" aria-label={t.close}>×</button></div>
      <p className="book-metadata__intro">{isUpload ? `${t.file}: ${book.uploadFile.name}. ` : ""}{t.intro}</p>
      <label className="dialog-field book-metadata__language"><span>{t.locale}</span><select aria-label={t.locale} value={textLanguage} disabled={Boolean(busy)} onChange={event => setTextLanguage(event.target.value)}>{BOOK_LANGUAGES.map(code => <option key={code} value={code}>{bookLanguageName(code, language)}</option>)}</select></label>
      <div className="book-metadata__body">
        <section className="book-metadata__lookup">
          <label className="dialog-field"><span>{t.searchLabel}</span><div className="book-metadata__search"><input value={query} disabled={Boolean(busy)} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); search(); } }} /><button className="dialog-button dialog-button--accent" onClick={search} disabled={Boolean(busy) || !query.trim()} type="button">{busy === "search" ? t.searching : t.search}</button></div></label>
          {busy === "details" ? <p role="status">{t.loading}</p> : null}
          {error ? <p className="book-metadata__error" role="alert">{error}</p> : null}
          {searched && !busy && !results.length ? <p className="book-metadata__hint">{t.noResults}</p> : null}
          <div className="book-metadata__results">{results.map(result => <button key={`${result.openLibraryKey}-${result.editionKey}`} disabled={Boolean(busy)} aria-pressed={Boolean(form.openLibraryKey && result.openLibraryKey === form.openLibraryKey && result.editionKey === form.editionKey)} onClick={() => select(result)} type="button">{result.coverUrl ? <img src={result.coverUrl} alt="" /> : <span>📖</span>}<span><strong>{result.title}</strong><small>{result.author || t.unknownAuthor}{result.year ? ` · ${result.year}` : ""}</small>{result.language ? <small>{bookLanguageName(result.language, language)}</small> : null}</span></button>)}</div>
          <p className="book-metadata__hint">{t.hint}</p>
          {form.openLibraryKey ? <button className="dialog-button dialog-button--ghost" disabled={Boolean(busy)} onClick={() => select(form, true)} type="button">{t.refresh}</button> : null}
        </section>
        <fieldset className="book-metadata__form" disabled={Boolean(busy)}>
          <legend className="sr-only">{t.savedProfile}</legend>
          <div className="book-metadata__preview"><BookCover book={{ ...book, name: displayForm.title, coverUrl: useFileCover ? "" : coverPreview || form.coverUrl }} /></div>
          <BookTypeField language={language} checked={Boolean(form.isGraphicNovel)} onChange={value => update("isGraphicNovel", value)} />
          {["title", "subtitle", "author"].map(key => <label key={key} className="dialog-field"><span>{t[key]}</span><input value={displayForm[key] || ""} onChange={event => update(key, event.target.value)} /></label>)}
          <div className="book-metadata__row">{["year", "isbn", "publisher", "publishDate", "language", "pageCount"].map(key => <label key={key} className="dialog-field"><span>{t[key]}</span><input value={form[key] || ""} onChange={event => update(key, event.target.value)} /></label>)}</div>
          {form.pageCountSource?.startsWith("epub-") ? <p className="book-metadata__hint">{form.pageCountSource === "epub-page-list" ? t.epubPageList : t.epubFixedPages}</p> : null}
          {form.pageCountSource === "openlibrary" ? <p className="book-metadata__hint">{t.catalogPages}</p> : form.openLibraryKey && !form.pageCount ? <p className="book-metadata__hint">{t.missingPages}</p> : null}
          <label className="dialog-field"><span>{t.subjects}</span><input value={displayForm.subjects || ""} onChange={event => update("subjects", event.target.value)} /></label>
          {displayForm.descriptionFallback ? <p className="book-metadata__hint" role="status">{t.fallback}</p> : null}
          <label className="dialog-field"><span>{t.description}</span><textarea value={displayForm.description || ""} onChange={event => update("description", event.target.value)} rows="5" /></label>
          <label className="book-metadata__cover-choice"><input type="checkbox" checked={useFileCover} onChange={event => { setUseFileCover(event.target.checked); if (event.target.checked) setCoverFile(null); }} /><span>{t.fileCover}</span></label>
          <label className="dialog-field"><span>{t.coverUrl}</span><input type="url" disabled={useFileCover} value={form.coverUrl || ""} onChange={event => update("coverUrl", event.target.value)} /></label>
          <label className="dialog-field book-metadata__file"><span>{t.localCover}</span><input type="file" disabled={useFileCover} accept="image/jpeg,image/png,image/webp" onChange={event => setCoverFile(event.target.files?.[0] || null)} />{coverFile ? <small>{coverFile.name}</small> : null}</label>
        </fieldset>
      </div>
      <div className="book-metadata__footer">{!isUpload ? <button className="dialog-button dialog-button--danger book-metadata__delete" disabled={Boolean(busy)} onClick={() => onDelete(book)} type="button">{t.deleteBook}</button> : null}<button className="dialog-button dialog-button--ghost" onClick={close} disabled={busy === "save"} type="button">{t.cancel}</button><button className="dialog-button dialog-button--accent" disabled={Boolean(busy) || !String(displayForm.title || "").trim()} onClick={save} type="button">{busy === "save" ? t.saving : isUpload ? t.confirmUpload : t.confirmSave}</button></div>
    </div>
  </div>, document.body);
}
