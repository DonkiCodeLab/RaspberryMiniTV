import React, { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { getBookContent } from "./api/raspberryApi";
import { bookStrings } from "./bookStrings.js";
import { syncEpubPreviewPages } from "./bookHeaderPagination.js";
import "./BookHeaderPreview.css";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default function BookHeaderPreview({ book, cover, language }) {
  const t = bookStrings(language);
  const host = useRef(null);
  const navigate = useRef(null);
  const position = useRef({ page: 2, cfi: undefined });
  const [size, setSize] = useState(null);
  const [documentData, setDocumentData] = useState(null);
  const [status, setStatus] = useState({ busy: true, start: true, end: true, error: false });

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      if (width && height) setSize(previous => previous?.width === width && previous?.height === height ? previous : { width, height });
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let pdfTask;
    let epub;
    setDocumentData(null);
    setStatus({ busy: true, start: true, end: true, error: false });
    position.current = { page: 2, cfi: undefined };
    (async () => {
      const data = await getBookContent(book.relativePath, { signal: controller.signal, format: book.format === "epub" ? "epub" : "pdf" });
      if (disposed) return;
      if (book.format === "epub") {
        const { default: ePub } = await import("epubjs");
        if (disposed) return;
        epub = ePub();
        epub.opened.catch(() => {});
        await epub.open(data.buffer, "binary");
        await epub.ready;
        if (disposed) { epub.destroy(); return; }
        setDocumentData({ epub });
      } else {
        pdfTask = getDocument({ data });
        const pdf = await pdfTask.promise;
        if (!disposed) setDocumentData({ pdf });
      }
    })().catch(() => { if (!disposed) setStatus({ busy: false, start: true, end: true, error: true }); });
    return () => {
      disposed = true;
      controller.abort();
      pdfTask?.destroy().catch(() => {});
      if (epub?.isOpen) epub.destroy();
    };
  }, [book.relativePath, book.format, book.sizeBytes]);

  useEffect(() => {
    if (!documentData || !size) return;
    let disposed = false;
    let busy = false;
    const renderTasks = new Set();
    const renditions = [];
    const container = host.current;
    const count = Math.max(1, Math.floor((size.width + 12) / (size.height * 2 / 3 + 12)));
    const width = Math.floor((size.width - (count - 1) * 12) / count);
    const slots = Array.from({ length: count }, () => {
      const slot = document.createElement("div");
      slot.className = "book-header-preview__page";
      slot.style.width = `${width}px`;
      container.append(slot);
      return slot;
    });
    const fail = () => { if (!disposed) setStatus({ busy: false, start: true, end: true, error: true }); };
    const draw = async (direction = 0) => {
      if (busy || disposed) return;
      busy = true;
      setStatus(old => ({ ...old, busy: true, error: false }));
      try {
        if (documentData.pdf) {
          const pdf = documentData.pdf;
          const first = Math.max(1, Math.min(pdf.numPages, position.current.page + direction));
          position.current.page = first;
          await Promise.all(slots.map(async (slot, index) => {
            slot.replaceChildren();
            slot.hidden = first + index > pdf.numPages;
            if (slot.hidden) return;
            const page = await pdf.getPage(first + index);
            if (disposed) return;
            const original = page.getViewport({ scale: 1 });
            const scale = Math.min(width / original.width, size.height / original.height) * Math.min(window.devicePixelRatio || 1, 2);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            const task = page.render({ canvasContext: canvas.getContext("2d"), viewport });
            renderTasks.add(task);
            await task.promise;
            renderTasks.delete(task);
            if (!disposed) slot.replaceChildren(canvas);
            page.cleanup();
          }));
          if (!disposed) setStatus({ busy: false, start: first === 1, end: first + count - 1 >= pdf.numPages, error: false });
        } else {
          if (!renditions.length) slots.forEach(slot => {
            const rendition = documentData.epub.renderTo(slot, { width, height: size.height, flow: "paginated", spread: "none", allowScriptedContent: false, allowPopups: false });
            rendition.themes.default({ body: { color: "#24231f", background: "#fffdf5", "font-family": "Georgia, serif", "font-size": "14px" }, img: { "max-width": "100%" } });
            rendition.on("displayError", fail);
            renditions.push(rendition);
          });
          const first = renditions[0];
          if (direction) await first[direction > 0 ? "next" : "prev"]();
          else {
            await first.display(position.current.cfi);
            // The cover already has its own place in the header.
            if (!disposed && !position.current.cfi && !first.currentLocation().atEnd) await first.next();
          }
          if (disposed) return;
          const pages = await syncEpubPreviewPages(renditions, slots, () => disposed);
          if (!pages) return;
          position.current.cfi = pages.cfi;
          setStatus({ busy: false, start: pages.start, end: pages.end, error: false });
        }
      } catch { fail(); }
      finally { busy = false; }
    };
    navigate.current = draw;
    draw();
    return () => {
      disposed = true;
      navigate.current = null;
      renderTasks.forEach(task => task.cancel());
      renditions.forEach(rendition => rendition.destroy());
      slots.forEach(slot => slot.remove());
    };
  }, [documentData, size]);

  return <div className="book-header-preview">
    <img className="book-header-preview__cover" src={cover} alt={book.name} />
    <div className="book-header-preview__reader" aria-label={t.pageCount} aria-busy={status.busy}>
      <button type="button" disabled={status.busy || status.start} onClick={() => navigate.current?.(-1)} aria-label={t.previousPage}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m15 5-7 7 7 7" /></svg>
      </button>
      <div className="book-header-preview__viewport">
        <div ref={host} className="book-header-preview__pages" inert aria-hidden="true" />
        {status.error ? <span className="book-header-preview__message" role="status">{t.previewError}</span> : status.busy ? (
          <div className="book-header-preview__message book-header-preview__message--loading" role="status">
            <div className="library-loading__spinner" aria-hidden="true"><span /><span /><span /></div>
            <span>{t.previewLoading}</span>
          </div>
        ) : null}
      </div>
      <button type="button" disabled={status.busy || status.end} onClick={() => navigate.current?.(1)} aria-label={t.nextPage}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7" /></svg>
      </button>
    </div>
  </div>;
}
