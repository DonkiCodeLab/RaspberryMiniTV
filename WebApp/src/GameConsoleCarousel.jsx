import React, { useEffect, useRef, useState } from 'react';
import { GAME_SYSTEMS, systemForGame } from './gameSystems';
import { gameSystemArtwork } from './api/raspberryApi';
const COPY = {
  es: ['Consolas', 'juegos', 'Añadir juego', 'Cambiar fondo', 'Restaurar fondo', 'Todavía no hay juegos para esta consola.', 'El rendimiento depende del juego', 'Anterior', 'Siguiente', 'Imagen guardada', 'Guardando…'],
  ca: ['Consoles', 'jocs', 'Afegir joc', 'Canviar fons', 'Restaurar fons', 'Encara no hi ha jocs per a aquesta consola.', 'El rendiment depèn del joc', 'Anterior', 'Següent', 'Imatge desada', 'Desant…'],
  en: ['Consoles', 'games', 'Add game', 'Change background', 'Reset background', 'No games for this console yet.', 'Performance varies by game', 'Previous', 'Next', 'Image saved', 'Saving…'],
};
export default function GameConsoleCarousel({ systemId, onSystemChange, games, visibleGames, onFilter, filterLabel, selectedPath, onGameChange, onUpload, onDevice, language }) {
  const c = COPY[language] || COPY.es;
  const system = GAME_SYSTEMS.find(s => s.id === systemId) || GAME_SYSTEMS[0];
  const [custom, setCustom] = useState({});
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const rail = useRef(null);
  useEffect(() => {
    let cancelled = false;
    setStatus('');
    gameSystemArtwork(system.id).then(result => {
      if (!cancelled) setCustom(current => ({ ...current, [system.id]: result.image }));
    }).catch(error => { if (!cancelled) setStatus(error.message); });
    const item = rail.current?.querySelector(`[data-system="${system.id}"]`);
    if (item) rail.current.scrollTo({ left: item.offsetLeft - rail.current.offsetLeft - (rail.current.clientWidth - item.clientWidth) / 2, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    return () => { cancelled = true; };
  }, [system.id]);
  const ownGames = games.filter(game => systemForGame(game)?.id === system.id);
  const displayedGames = visibleGames || ownGames;
  async function saveArt(file, reset = false) {
    if (!file && !reset) return;
    if (file?.size > 8 * 1024 * 1024) { setStatus('Máximo 8 MB'); return; }
    const id = system.id;
    setBusy(true); setStatus('');
    try {
      const result = await gameSystemArtwork(id, file, reset);
      setCustom(current => ({ ...current, [id]: result.image })); setStatus(c[9]);
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  }
  function step(delta) {
    const index = GAME_SYSTEMS.findIndex(s => s.id === system.id);
    onSystemChange(GAME_SYSTEMS[(index + delta + GAME_SYSTEMS.length) % GAME_SYSTEMS.length].id);
  }
  return <section className="console-browser" aria-label={c[0]}>
    <div className="console-scene" style={{ backgroundImage: `url("${custom[system.id] || system.assets.background}")` }}>
      <div className="console-scene__shade" />
      <div className="console-scene__info">
        <p className="console-eyebrow">{system.metadata?.systemManufacturer} · {system.metadata?.systemReleaseYear}</p>
        <img className="console-hardware" src={system.assets.console} alt={system.name} />
        <h1>{system.name}</h1>
        <p className="console-total">{ownGames.length} {ownGames.length === 1 ? ({es: "juego", ca: "joc", en: "game"}[language] || "juego") : c[1]}</p>
        {system.pi4Tier === 'per-game' && <small>{c[6]}</small>}
        <button type="button" className="dialog-button dialog-button--accent" onClick={onUpload}>＋ {c[2]}</button>
      </div>
      {!custom[system.id] && system.assets.overlay && <img className="console-overlay" src={system.assets.overlay} alt="" />}
      <div className="console-art-actions">
        <button type="button" onClick={onDevice}>Mini-tele</button>
        <label className={busy ? 'is-busy' : ''}>{busy ? c[10] : c[3]}<input disabled={busy} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { saveArt(e.target.files?.[0]); e.target.value = ''; }} /></label>
        {custom[system.id] && <button type="button" disabled={busy} onClick={() => saveArt(null, true)}>{c[4]}</button>}
      </div>
    </div>
    <div className="console-navigation">
      <button type="button" aria-label={c[7]} onClick={() => step(-1)}>‹</button>
      <div className="console-rail" ref={rail} aria-label={c[0]}>
        {GAME_SYSTEMS.map(s => <button type="button" key={s.id} data-system={s.id} className={s.id === system.id ? 'active' : ''} aria-pressed={s.id === system.id} onClick={() => onSystemChange(s.id)}>
          <img src={s.assets.logo} alt="" loading="lazy" /><span>{s.name}</span>
        </button>)}
      </div>
      <button type="button" aria-label={c[8]} onClick={() => step(1)}>›</button>
    </div>
    {status && <p className="console-status" role="status">{status}</p>}
    <button className="console-filter" type="button" onClick={onFilter}>{filterLabel}</button>
    <div className="console-games" aria-label={system.name}>
      {displayedGames.length ? displayedGames.map(game => <button type="button" key={game.relativePath} className={game.relativePath === selectedPath ? 'active' : ''} aria-pressed={game.relativePath === selectedPath} onClick={() => onGameChange(game.relativePath)}>
        {game.coverImage ? <img src={game.coverImage} alt="" loading="lazy" /> : <span className="console-game-placeholder">▣</span>}<span>{game.name || game.file}</span>
      </button>) : <p>{ownGames.length ? ({es: "No hay juegos que coincidan con los filtros.", ca: "No hi ha jocs que coincideixin amb els filtres.", en: "No games match the filters."}[language] || "No games match the filters.") : c[5]}</p>}
    </div>
    <a className="console-credits" href="https://github.com/Siddy212/iconic-es-de#acknowledgments" target="_blank" rel="noreferrer">Iconic · Siddy212 &amp; artists · CC BY-NC-SA · Credits</a>
  </section>;
}
