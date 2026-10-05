import React, { useEffect, useState } from "react";

export default function BookPageSelector({ page, total, disabled = false, onSelect, section = false }) {
  const [draft, setDraft] = useState(String(page || 1));
  const unavailable = disabled || !total;

  useEffect(() => { setDraft(String(page || 1)); }, [page, total]);

  function submit(event) {
    event.preventDefault();
    const next = Number(draft);
    if (unavailable || !Number.isInteger(next) || next < 1 || next > total) return;
    setDraft(String(next));
    onSelect(next);
  }

  return <form className="book-reader__page-selector" onSubmit={submit} aria-label={section ? "Ir a una página de la sección" : "Ir a una página"}>
    <label>
      Página
      <input
        type="number" inputMode="numeric" min="1" max={total || 1} step="1" required
        value={draft} disabled={unavailable}
        aria-label={section ? "Página de la sección" : "Número de página"}
        title={total ? `Escribe una página entre 1 y ${total}` : "Cargando páginas"}
        style={{ "--page-digits": Math.max(2, String(total || 1).length) }}
        onChange={event => setDraft(event.target.value)}
        onFocus={event => event.target.select()}
        onKeyDown={event => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setDraft(String(page || 1));
            event.currentTarget.blur();
          }
        }}
      />
    </label>
    <output>de {total || "—"}</output>
    <button type="submit" disabled={unavailable} aria-label={section ? "Ir a la página de la sección" : "Ir a la página"}>Ir</button>
  </form>;
}
