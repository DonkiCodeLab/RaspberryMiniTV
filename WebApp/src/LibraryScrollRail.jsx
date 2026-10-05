import React, { useEffect, useRef, useState } from "react";
import { scrollIndexAtPosition, buildDecadeTicks } from "./libraryScroll.js";

export default function LibraryScrollRail({ labels, language = "es", sort = "name", direction = "asc", onDirectionChange, actionsVisible = false, onActionsChange, actionLabels }) {
  const host = useRef(null);
  const geometry = useRef({ positions: [], start: 0, end: 0 });
  const selectedEntry = useRef(null);
  const [state, setState] = useState({ index: 0, visible: false });
  const [active, setActive] = useState(false);
  const signature = JSON.stringify(labels);
  useEffect(() => {
    selectedEntry.current = null;
    const section = host.current?.parentElement;
    if (!section) return;
    let frame;
    function measure() {
      const nodes = [...section.querySelectorAll("[data-library-index]")];
      const positions = nodes.map(node => node.getBoundingClientRect().top + window.scrollY);
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const start = Math.max(0, Math.min(maxScroll, (positions[0] || 0) - 90));
      const end = Math.max(start, Math.min(maxScroll, (positions.at(-1) || 0) - 90));
      geometry.current = { positions, start, end };
      update();
    }
    function update() {
      const { positions, start, end } = geometry.current;
      const progress = end > start ? Math.max(0, Math.min(1, (window.scrollY - start) / (end - start))) : 0;
      if (selectedEntry.current && Math.abs(window.scrollY - selectedEntry.current.top) > 1) selectedEntry.current = null;
      const index = selectedEntry.current?.index ?? (progress === 1 ? Math.max(0, positions.length - 1) : scrollIndexAtPosition(positions, window.scrollY + 90));
      const visible = positions.length > 1 && end > start;
      // Scrolling within the same entry does not change anything on the rail.
      setState(current => current.index === index && current.visible === visible ? current : { index, visible });
    }
    function schedule() {
      if (frame != null) return;
      frame = requestAnimationFrame(() => { frame = null; update(); });
    }
    const observer = new ResizeObserver(measure);
    observer.observe(section);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", measure);
    measure();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", measure); };
  }, [signature]);
  const jumpToEntry = index => {
    const position = geometry.current.positions[index];
    if (position == null) return;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const top = Math.max(0, Math.min(maxScroll, position - 90));
    // Several initials may share a grid row or the final viewport. Keep the
    // chosen initial highlighted until the user scrolls away from that row.
    selectedEntry.current = { index, top };
    if (Math.abs(window.scrollY - top) > 1) window.scrollTo({ top, behavior: "instant" });
    setState(current => current.index === index ? current : { ...current, index });
  };
  const code = language === "cat" ? "ca" : language.split("-")[0];
  const text = ({ es: { name: "Recorrer por letra", author: "Recorrer por autor", year: "Recorrer por año", rating: "Recorrer por puntuación" }, ca: { name: "Recórrer per lletra", author: "Recórrer per autor", year: "Recórrer per any", rating: "Recórrer per puntuació" }, en: { name: "Browse by letter", author: "Browse by author", year: "Browse by year", rating: "Browse by rating" } })[code] || { name: "Browse by letter", author: "Browse by author", year: "Browse by year", rating: "Browse by rating" };
  const controls = ({
    es: { asc: "Ascendente", desc: "Descendente", ascShort: "Asc.", descShort: "Desc.", show: "Mostrar opciones de películas", hide: "Ocultar opciones de películas", options: "Opciones" },
    ca: { asc: "Ascendent", desc: "Descendent", ascShort: "Asc.", descShort: "Desc.", show: "Mostrar opcions de pel·lícules", hide: "Amagar opcions de pel·lícules", options: "Opcions" },
    en: { asc: "Ascending", desc: "Descending", ascShort: "Asc.", descShort: "Desc.", show: "Show movie options", hide: "Hide movie options", options: "Options" },
  })[code] || { asc: "Ascending", desc: "Descending", ascShort: "Asc.", descShort: "Desc.", show: "Show movie options", hide: "Hide movie options", options: "Options" };
  const entries = new Map();
  labels.forEach((label, index) => { if (!entries.has(label)) entries.set(label, index); });
  const yearMode = sort === "year";
  const decades = yearMode ? buildDecadeTicks(labels) : [];
  const currentLabel = labels[state.index];
  const currentDecade = decades.find(group => group.years.some(([year]) => year === currentLabel));
  const ticks = yearMode ? decades.map(group => [group.label, group.index]) : [...entries];
  const currentTick = Math.max(0, yearMode ? decades.indexOf(currentDecade) : ticks.findIndex(([label]) => label === currentLabel));
  const yearTicks = currentDecade?.label !== "—" ? currentDecade?.years || [] : [];
  const currentYearTick = Math.max(0, yearTicks.findIndex(([label]) => label === currentLabel));
  const decadeText = ({ es: "Recorrer por década", ca: "Recórrer per dècada", en: "Browse by decade" })[code] || "Browse by decade";
  return <div ref={host} className={`library-scroll-rail${yearMode ? " library-scroll-rail--years" : ""}${active ? " is-active" : ""}`} hidden={!labels.length}>
    {onDirectionChange ? <button className="library-scroll-rail__control" type="button"
      aria-label={`${text[sort]}: ${controls[direction]}`} title={`${text[sort]}: ${controls[direction]}`}
      onClick={() => onDirectionChange(direction === "asc" ? "desc" : "asc")}>
      <span aria-hidden="true">{direction === "asc" ? "↑" : "↓"}</span>
      <small>{direction === "asc" ? controls.ascShort : controls.descShort}</small>
    </button> : null}
    <div className="library-scroll-rail__scales" hidden={!state.visible}>
      {yearMode && yearTicks.length > 0 ? <div className="library-scroll-rail__secondary" data-decade={`${currentDecade.label}–${Number(currentDecade.label) + 9}`}>
        <RailScale ticks={yearTicks} currentTick={currentYearTick} label={`${text.year}: ${currentDecade.label}–${Number(currentDecade.label) + 9}`}
          onSelect={jumpToEntry} onActive={setActive} />
      </div> : null}
      <RailScale ticks={sort === "rating" ? ticks.map(([value, index]) => [value.replace(/^★\s*/, ""), index]) : ticks} currentTick={currentTick} label={yearMode ? decadeText : text[sort]}
        onSelect={jumpToEntry} onActive={setActive} />
    </div>
    {onActionsChange ? <button className="library-scroll-rail__control library-scroll-rail__options" type="button"
      aria-pressed={actionsVisible} aria-label={actionsVisible ? actionLabels?.hideActions || controls.hide : actionLabels?.showActions || controls.show} title={actionsVisible ? actionLabels?.hideActions || controls.hide : actionLabels?.showActions || controls.show}
      onClick={() => onActionsChange(!actionsVisible)}>
      <span aria-hidden="true">{actionsVisible ? "×" : "☷"}</span><small>{actionLabels?.actions || controls.options}</small>
    </button> : null}
    <span className="library-scroll-rail__bubble" aria-hidden="true">{labels[state.index]}</span>
  </div>;
}

// Both levels use the same pointer and keyboard navigation, with independent capture.
function RailScale({ ticks, currentTick, label, onSelect, onActive }) {
  const dragging = useRef(false);
  const select = index => {
    const entry = ticks[Math.max(0, Math.min(ticks.length - 1, index))];
    if (entry) onSelect(entry[1]);
  };
  const move = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (event.clientY - rect.top - 22) / Math.max(1, rect.height - 44)));
    select(Math.round(fraction * (ticks.length - 1)));
  };
  const stop = () => { dragging.current = false; onActive(false); };
  return <div className="library-scroll-rail__track" style={{ "--rail-intervals": Math.max(1, ticks.length - 1) }}>
    <div className="library-scroll-rail__scale" role="slider" tabIndex={0} aria-label={label} aria-orientation="vertical"
      aria-valuemin={0} aria-valuemax={Math.max(0, ticks.length - 1)} aria-valuenow={currentTick} aria-valuetext={ticks[currentTick]?.[0] || ""}
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId); dragging.current = true; onActive(true); move(event); }}
      onPointerMove={event => { if (dragging.current) move(event); }}
      onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
      onKeyDown={event => {
        const steps = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 };
        if (event.key === "Home" || event.key === "End" || event.key in steps) {
          event.preventDefault(); select(event.key === "Home" ? 0 : event.key === "End" ? ticks.length - 1 : currentTick + steps[event.key]);
        }
      }}>
      <div className="library-scroll-rail__ticks" aria-hidden="true">{ticks.map(([value], index) => <span key={value} style={{ top: `${ticks.length > 1 ? index / (ticks.length - 1) * 100 : 0}%` }}>{value}</span>)}</div>
      <div className="library-scroll-rail__travel" aria-hidden="true"><span className="library-scroll-rail__thumb" style={{ top: `${ticks.length > 1 ? currentTick / (ticks.length - 1) * 100 : 0}%` }}>{ticks[currentTick]?.[0]}</span></div>
    </div>
  </div>;
}
