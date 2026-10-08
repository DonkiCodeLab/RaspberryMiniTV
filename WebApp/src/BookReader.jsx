import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { getBookContent, getBookContentUrl } from "./api/raspberryApi";
import BookPageSelector from "./BookPageSelector.jsx";
import donkicodeLogo from "../../DeviceApp/menu/miniLogo_donkicodeLab.png";
GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default function BookReader({ book, onClose, initialProgress, onProgress }) {
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;
  const canvasRef = useRef(null);
  const pageContainerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [readerError, setReaderError] = useState("");
  const [closeConfirmationOpen, setCloseConfirmationOpen] = useState(false);
  const source = book ? getBookContentUrl(book.relativePath) : "";
  const changeZoom = (delta) => setZoom((value) => Math.min(3, Math.max(.6, Number((value + delta).toFixed(1)))));

  useEffect(() => {
    if (!book || !["pdf", "cbr", "cbz"].includes(book.format)) { setPdf(null); return undefined; }
    let cancelled = false;
    const controller = new AbortController();
    let task = null;
    setPageNumber(Math.max(1, initialProgress?.page || 1)); setZoom(1); setReaderError("");
    setPdf(null);
    getBookContent(book.relativePath, { signal: controller.signal })
      .then((data) => {
        if (cancelled) return null;
        task = getDocument({ data });
        return task.promise;
      })
      .then((document) => { if (!cancelled && document) { setPageNumber(Math.min(document.numPages, Math.max(1, initialProgress?.page || 1))); setPdf(document); } })
      .catch((error) => {
        if (cancelled || error?.name === "AbortError") return;
        const detail = error?.status === 401
          ? "La sesión ha caducado. Vuelve a introducir el PIN."
          : error?.status === 404
            ? "El archivo ya no existe en la biblioteca."
            : error?.message || "No se pudo cargar este PDF.";
        setReaderError(detail);
      });
    return () => { cancelled = true; controller.abort(); task?.destroy(); };
  }, [book?.relativePath, book?.format]);

  useEffect(() => {
    pageContainerRef.current?.scrollTo({ top: 0, left: 0 });
    setReaderError("");
  }, [pageNumber]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return undefined;
    let cancelled = false;
    pdf.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) return;
      const viewport = page.getViewport({ scale: 1.45 * zoom });
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      canvas.width = viewport.width; canvas.height = viewport.height;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = page.render({ canvasContext: context, viewport });
      return renderTaskRef.current.promise.then(() => {
        if (!cancelled) progressRef.current?.({ kind: "book", page: pageNumber, total: pdf.numPages, completed: pageNumber === pdf.numPages });
      });
    }).catch((error) => { if (!cancelled && error?.name !== "RenderingCancelledException") setReaderError("No se pudo mostrar esta página."); });
    return () => { cancelled = true; renderTaskRef.current?.cancel(); };
  }, [pdf, pageNumber, zoom]);

  if (!book) return null;
  return createPortal(
    <div className="book-reader" role="dialog" aria-modal="true" aria-label={book.name}>
      <header className="book-reader__header">
        <div className="book-reader__file">
          <img src={donkicodeLogo} alt="" />
          <strong><span>Fichero:</span> {book.name}</strong>
        </div>
        <div className="book-reader__pagination" aria-label="Navegación de páginas">
          <button onClick={() => setPageNumber((page) => Math.max(1, page - 1))} disabled={!pdf || pageNumber <= 1} type="button" aria-label="Página anterior">‹</button>
          <BookPageSelector key={book.relativePath} page={pageNumber} total={pdf?.numPages} onSelect={setPageNumber} />
          <button onClick={() => setPageNumber((page) => Math.min(pdf?.numPages || page, page + 1))} disabled={!pdf || pageNumber >= pdf.numPages} type="button" aria-label="Página siguiente">›</button>
        </div>
        <div className="book-reader__controls">
          <div className="book-reader__zoom" aria-label="Control de zoom">
            <button onClick={() => changeZoom(-.1)} disabled={zoom <= .6} type="button" aria-label="Reducir zoom un 10 %">−</button>
            <input type="range" min="0.6" max="3" step="0.1" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="Zoom" />
            <output>{Math.round(zoom * 100)}%</output>
            <button onClick={() => changeZoom(.1)} disabled={zoom >= 3} type="button" aria-label="Aumentar zoom un 10 %">+</button>
          </div>
          <button className="book-reader__close" onClick={() => setCloseConfirmationOpen(true)} type="button" aria-label="Cerrar lector">×</button>
        </div>
      </header>
      {["pdf", "cbr", "cbz"].includes(book.format) ? (
        <div ref={pageContainerRef} className="book-reader__page">{readerError ? <p className="book-reader__error">{readerError}</p> : !pdf ? <p role="status">Preparando las páginas…</p> : null}<canvas ref={canvasRef} aria-label={`Página ${pageNumber}`} /></div>
      ) : (
        <div className="book-reader__fallback">
          <span>📚</span><h2>{book.name}</h2>
          <p>Este formato se abrirá con el lector compatible del navegador o del dispositivo.</p>
          <a className="dialog-button dialog-button--accent" href={source} target="_blank" rel="noreferrer">Abrir {book.format.toUpperCase()}</a>
        </div>
      )}
      {closeConfirmationOpen ? (
        <div className="book-reader__confirm-backdrop" onClick={() => setCloseConfirmationOpen(false)}>
          <div className="book-reader__confirm" role="alertdialog" aria-modal="true" aria-labelledby="book-reader-close-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="book-reader-close-title">¿Realmente quieres abandonar la visualización?</h2>
            <p>Tu posición en <strong>{book.name}</strong> se guarda en tu perfil.</p>
            <div>
              <button className="dialog-button dialog-button--ghost" onClick={() => setCloseConfirmationOpen(false)} type="button">Seguir leyendo</button>
              <button className="dialog-button dialog-button--danger" onClick={onClose} type="button">Abandonar</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body
  );
}
