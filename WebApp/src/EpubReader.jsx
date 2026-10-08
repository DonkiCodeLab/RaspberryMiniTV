import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getBookContent } from "./api/raspberryApi";
import BookPageSelector from "./BookPageSelector.jsx";

const flattenToc = (items, depth = 0) => items.flatMap((item) => [
  { href: item.href, label: `${"　".repeat(depth)}${item.label.trim()}` },
  ...flattenToc(item.subitems || [], depth + 1),
]);

export default function EpubReader({ book, onClose, initialProgress, onProgress }) {
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;
  const host = useRef(null);
  const renditionRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toc, setToc] = useState([]);
  const [location, setLocation] = useState(null);
  const [fontSize, setFontSize] = useState(100);
  const [confirmClose, setConfirmClose] = useState(false);
  const [retry, setRetry] = useState(0);
  const [turning, setTurning] = useState(false);

  useEffect(() => {
    let disposed = false;
    let epub;
    let initialized = false;
    let rendition;
    let resizeObserver;
    const controller = new AbortController();
    const fail = (failure) => {
      if (disposed || failure?.name === "AbortError") return;
      setLoading(false);
      setError(failure?.status === 401 ? "La sesión ha caducado. Vuelve a introducir el PIN."
        : failure?.status === 404 ? "El libro ya no existe en la biblioteca."
          : "No se pudo leer el EPUB. Reintenta y comprueba que el archivo sea válido y no esté protegido con DRM.");
    };
    const keydown = (event) => {
      if (/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Escape") setConfirmClose(true);
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        rendition?.[event.key === "ArrowRight" ? "next" : "prev"]().catch(fail);
      }
    };
    setLoading(true); setError(""); setLocation(null); setToc([]); setFontSize(100);
    (async () => {
      const [{ default: ePub }, data] = await Promise.all([
        import("epubjs"), getBookContent(book.relativePath, { signal: controller.signal, format: "epub" }),
      ]);
      if (disposed) return;
      epub = ePub();
      // Explicitly observe the open promise so corrupt archives reach the error UI.
      epub.opened.catch(() => {});
      await epub.open(data.buffer, "binary");
      await Promise.all([epub.opened, epub.ready]);
      initialized = true;
      if (disposed) { epub.destroy(); return; }
      rendition = epub.renderTo(host.current, {
        width: host.current.clientWidth, height: host.current.clientHeight,
        flow: "paginated", spread: "none", allowScriptedContent: false, allowPopups: false,
      });
      renditionRef.current = rendition;
      rendition.themes.default({
        body: { color: "#24231f", background: "#fffdf5", "line-height": "1.65", "font-family": "Georgia, serif" },
        img: { "max-width": "100%" },
      });
      rendition.on("keydown", keydown);
      rendition.on("displayError", fail);
      rendition.on("relocated", (next) => {
        if (disposed) return;
        setLocation({ ...next, chapters: epub.spine.length });
        progressRef.current?.({ kind: "book", cfi: next.start.cfi, page: next.start.displayed.page,
          total: next.start.displayed.total, section: next.start.index + 1, completed: next.atEnd });
      });
      const navigation = await epub.loaded.navigation;
      if (disposed) return;
      setToc(flattenToc(navigation.toc || []));
      const saved = initialProgress?.cfi;
      try { await rendition.display(saved || undefined); }
      catch (failure) { if (saved && !disposed) await rendition.display(); else throw failure; }
      if (disposed) return;
      setLoading(false);
      resizeObserver = new ResizeObserver(() => {
        if (!disposed && host.current?.clientWidth && host.current?.clientHeight) {
          rendition.resize(host.current.clientWidth, host.current.clientHeight);
        }
      });
      resizeObserver.observe(host.current);
    })().catch(fail);
    document.addEventListener("keydown", keydown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      disposed = true; controller.abort(); resizeObserver?.disconnect();
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = previousOverflow;
      renditionRef.current = null;
      // Destroying the book also destroys its rendition and revokes archive URLs.
      if (initialized) epub?.destroy();
    };
  }, [book.relativePath, book.sizeBytes, retry]);

  useEffect(() => { renditionRef.current?.themes.fontSize(`${fontSize}%`); }, [fontSize]);

  async function navigate(target) {
    if (!renditionRef.current || turning) return;
    setTurning(true);
    try {
      if (target === "next" || target === "prev") await renditionRef.current[target]();
      else if (typeof target === "number") {
        const rendition = renditionRef.current;
        const current = await rendition.currentLocation();
        const manager = rendition.manager;
        const view = manager.visible().find(item => item.section.index === current.start.index);
        const total = current.start.displayed.total;
        if (!view || target < 1 || target > total) return;
        // Map the current layout's page to a CFI so EPUB.js handles navigation
        // and position persistence exactly as it does for chapter links.
        const vertical = manager.settings.axis === "vertical";
        const size = vertical ? Math.min(manager.container.clientHeight, window.innerHeight) : manager.layout.pageWidth;
        const index = !vertical && manager.settings.direction === "rtl" ? total - target : target - 1;
        const mapped = manager.mapping.page(view.contents, view.section.cfiBase, index * size, (index + 1) * size);
        if (!mapped?.start) throw new Error("Page unavailable");
        await rendition.display(mapped.start);
      }
      else await renditionRef.current.display(target);
    } catch { setError("No se pudo mostrar este capítulo. Puedes reintentar la lectura."); }
    finally { setTurning(false); }
  }

  return createPortal(<div className="book-reader epub-reader" role="dialog" aria-modal="true" aria-label={`Leer ${book.name}`}>
    <header className="book-reader__header">
      <div className="book-reader__file"><strong><span>Leyendo:</span> {book.name}</strong></div>
      <div className="book-reader__pagination" aria-label="Navegación del libro">
        <button type="button" onClick={() => navigate("prev")} disabled={loading || turning || !location || location.atStart} aria-label="Página anterior">‹</button>
        <div className="epub-reader__page-selector">
          <small aria-live="polite">{location ? `Sección ${location.start.index + 1} de ${location.chapters}` : "Cargando…"}</small>
          <BookPageSelector key={`${book.relativePath}:${location?.start.index}`} section
            page={location?.start.displayed.page} total={location?.start.displayed.total}
            disabled={loading || turning || !!error} onSelect={navigate} />
        </div>
        <button type="button" onClick={() => navigate("next")} disabled={loading || turning || !location || location.atEnd} aria-label="Página siguiente">›</button>
      </div>
      <div className="book-reader__controls">
        <div className="book-reader__zoom" aria-label="Tamaño de letra">
          <button type="button" disabled={fontSize <= 70 || loading} onClick={() => setFontSize(value => value - 10)} aria-label="Reducir letra">A−</button>
          <output>{fontSize}%</output>
          <button type="button" disabled={fontSize >= 200 || loading} onClick={() => setFontSize(value => value + 10)} aria-label="Aumentar letra">A+</button>
        </div>
        <button className="book-reader__close" type="button" onClick={() => setConfirmClose(true)} aria-label="Cerrar lector">×</button>
      </div>
    </header>
    <div className="epub-reader__body">
      <label className="epub-reader__toc">Índice
        <select aria-label="Ir a un capítulo" disabled={!toc.length || loading} value="" onChange={event => navigate(event.target.value)}>
          <option value="">Selecciona un capítulo</option>
          {toc.map((item, index) => <option key={`${item.href}-${index}`} value={item.href}>{item.label}</option>)}
        </select>
      </label>
      <div className="epub-reader__viewport">
        <div ref={host} className="epub-reader__pages" />
        {loading || error ? <div className="epub-reader__status" role={error ? "alert" : "status"}>
          <p>{error || "Abriendo el libro…"}</p>
          {error ? <button className="dialog-button dialog-button--accent" type="button" onClick={() => setRetry(value => value + 1)}>Reintentar</button> : null}
        </div> : null}
      </div>
      <small className="epub-reader__hint">Tu posición se guarda en tu perfil. Las páginas de cada sección se ajustan a la pantalla y al tamaño de letra.</small>
    </div>
    {confirmClose ? <div className="book-reader__confirm-backdrop">
      <div className="book-reader__confirm" role="alertdialog" aria-modal="true" aria-labelledby="epub-close-title">
        <h2 id="epub-close-title">¿Cerrar el libro?</h2><p>Podrás continuar desde la última posición con tu usuario.</p>
        <div><button className="dialog-button dialog-button--ghost" type="button" onClick={() => setConfirmClose(false)}>Seguir leyendo</button>
          <button className="dialog-button dialog-button--accent" type="button" onClick={onClose}>Cerrar libro</button></div>
      </div>
    </div> : null}
  </div>, document.body);
}
