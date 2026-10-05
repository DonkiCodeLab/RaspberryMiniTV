import React from "react";
import { bookStrings } from "./bookStrings.js";
import novelYellow from "./assets/libro_amarillo.png";
import novelWhite from "./assets/libro_blanco.png";
import graphicYellow from "./assets/speec_buble_amarillo.png";
import graphicWhite from "./assets/speec_buble_blanco.png";

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

export default function BookLibraryControls({ language, sort, onSortChange, type, onTypeChange }) {
  const t = bookStrings(language);
  return <div className="movie-library__browse-tools books-library__browse-tools">
    <label className="movie-library__sort">
      <span>{t.sort}</span>
      <select aria-label={t.sort} value={sort} onChange={event => onSortChange(event.target.value)}>
        <option value="name">{t.title}</option>
        <option value="author">{t.sortAuthor}</option>
        <option value="year">{t.year}</option>
      </select>
    </label>
    <div className="movie-library__view-switch books-library__type-switch" role="group" aria-label={t.bookType}>
      {[
        { value: "novel", label: t.novels, active: novelYellow, inactive: novelWhite },
        { value: "graphic", label: t.graphicNovels, active: graphicYellow, inactive: graphicWhite },
      ].map(option => <button key={option.value} type="button" className={type === option.value ? "active" : ""}
        aria-pressed={type === option.value} aria-label={option.label} title={option.label} onClick={() => onTypeChange(option.value)}>
        <img src={type === option.value ? option.active : option.inactive} alt="" />
      </button>)}
    </div>
  </div>;
}
