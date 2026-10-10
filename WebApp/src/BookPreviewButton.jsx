import React, { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { getBookContent } from "./api/raspberryApi";
import "./BookPreviewButton.css";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function BookPagePreview({ book }) {
  const host = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    let timer;
    let pdfTask;
    let renderTask;
    let epub;
    let epubReady = false;
    const controller = new AbortController();
    const container = host.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const showPage = () => {
      if (disposed) return;
      setReady(true);
      if (!reducedMotion.matches) container.animate([
        { transform: "perspective(900px) rotateY(-28deg)", opacity: .5 },
        { transform: "perspective(900px) rotateY(0deg)", opacity: 1 },
      ], { duration: 550, easing: "ease-out" });
    };
    const schedule = (next) => {
      if (!disposed) timer = setTimeout(() => {
        if (document.hidden) { schedule(next); return; }
        next().catch(fail);
      }, 2500);
    };
    // An unavailable preview leaves the ordinary cover and open action intact.
    const fail = () => { if (!disposed) setReady(false); };
    const start = async () => {
      if (book.format === "epub") {
        const [{ default: ePub }, data] = await Promise.all([
          import("epubjs"), getBookContent(book.relativePath, { signal: controller.signal, format: "epub" }),
        ]);
        if (disposed) return;
        epub = ePub();
        epub.opened.catch(() => {});
        await epub.open(data.buffer, "binary");
        await epub.ready;
        epubReady = true;
        if (disposed) { epub.destroy(); return; }
        const rendition = epub.renderTo(container, {
          width: container.clientWidth, height: container.clientHeight,
          flow: "paginated", spread: "none", allowScriptedContent: false, allowPopups: false,
        });
        rendition.themes.default({
          body: { color: "#24231f", background: "#fffdf5", "font-family": "Georgia, serif", "font-size": "12px" },
          img: { "max-width": "100%" },
        });
        rendition.on("displayError", fail);
        await rendition.display();
        if (disposed) return;
        showPage();
        const next = async () => {
          if (disposed) return;
          if (rendition.currentLocation()?.atEnd) await rendition.display();
          else await rendition.next();
          if (disposed) return;
          showPage();
          schedule(next);
        };
        schedule(next);
      } else {
        const data = await getBookContent(book.relativePath, { signal: controller.signal });
        if (disposed) return;
        pdfTask = getDocument({ data });
        const pdf = await pdfTask.promise;
        let pageNumber = pdf.numPages > 1 ? 2 : 1;
        const next = async () => {
          if (disposed) return;
          const page = await pdf.getPage(pageNumber);
          if (disposed) return;
          const size = page.getViewport({ scale: 1 });
          const scale = Math.min(2, window.devicePixelRatio || 1) *
            Math.min(container.clientWidth / size.width, container.clientHeight / size.height);
          const viewport = page.getViewport({ scale });
          // Render offscreen so the last page stays visible until the next is ready.
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          renderTask = page.render({ canvasContext: canvas.getContext("2d"), viewport });
          await renderTask.promise;
          if (disposed) return;
          container.replaceChildren(canvas);
          showPage();
          page.cleanup();
          pageNumber = pageNumber % pdf.numPages + 1;
          if (pdf.numPages > 1) schedule(next);
        };
        await next();
      }
    };
    // Avoid downloading books when the pointer only passes over a card.
    timer = setTimeout(() => start().catch(fail), 400);
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
      renderTask?.cancel();
      pdfTask?.destroy().catch(() => {});
      if (epubReady) epub.destroy();
      container.getAnimations().forEach(animation => animation.cancel());
    };
  }, [book.relativePath, book.format, book.sizeBytes]);
  return <span className={`book-page-preview${ready ? " is-ready" : ""}`} aria-hidden="true" inert>
    <span ref={host} className="book-page-preview__page" />
  </span>;
}

export default function BookPreviewButton({ book, enabled, children, ...props }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const supported = ["pdf", "epub", "cbr", "cbz"].includes(book.format);
  return <button {...props}
    onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }}
    onPointerLeave={() => setHovered(false)}
    onPointerCancel={() => setHovered(false)}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
    {children}
    {enabled && supported && (hovered || focused) &&
      <BookPagePreview key={`${book.relativePath}:${book.sizeBytes}`} book={book} />}
  </button>;
}
