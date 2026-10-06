import React from "react";
import { bookStrings } from "./bookStrings.js";
import { bookTypeArtwork } from "./bookTypeArtwork.js";

export function BookTypeField({ checked, onChange, language, batch = false, collection = false, mixed = false }) {
  const t = bookStrings(language);
  return <div className="book-type-field">
    <label className="book-metadata__cover-choice">
      <input type="checkbox" checked={checked} ref={node => { if (node) node.indeterminate = mixed; }} onChange={event => onChange(event.target.checked)} />
      <span>{t.graphicNovel}</span>
    </label>
    <p className="book-metadata__hint">{collection ? t.collectionTypeHint : batch ? t.batchTypeHint : t.typeHint}</p>
  </div>;
}

export default function BookLibraryControls({ language, view, onViewChange, viewLabels, sort, onSortChange, type, onTypeChange }) {
  const t = bookStrings(language);
  return <div className="movie-library__browse-tools books-library__browse-tools">
    <div className="movie-library__view-switch" role="group" aria-label={t.yourLibrary}>
      {[{ value: "grid", icon: "▦" }, { value: "list", icon: "☰" }].map(option =>
        <button key={option.value} type="button" className={view === option.value ? "active" : ""}
          aria-pressed={view === option.value} aria-label={viewLabels[option.value]} title={viewLabels[option.value]}
          onClick={() => onViewChange(option.value)}>{option.icon}</button>
      )}
    </div>
    <div className="movie-library__view-switch books-library__type-switch" role="group" aria-label={t.bookType}>
      {[
        { value: "novel", label: t.novels },
        { value: "graphic", label: t.graphicNovels },
      ].map(option => <button key={option.value} type="button" className={type === option.value ? "active" : ""}
        aria-pressed={type === option.value} aria-label={option.label} title={option.label} onClick={() => onTypeChange(option.value)}>
        <img src={bookTypeArtwork[option.value]} alt="" />
      </button>)}
    </div>
    <label className="movie-library__sort">
      <span>{t.sort}</span>
      <select aria-label={t.sort} value={sort} onChange={event => onSortChange(event.target.value)}>
        <option value="name">{t.title}</option>
        <option value="author">{t.sortAuthor}</option>
        <option value="year">{t.year}</option>
      </select>
    </label>
  </div>;
}
