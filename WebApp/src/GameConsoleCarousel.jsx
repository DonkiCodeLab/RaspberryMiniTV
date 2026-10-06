import React, { useEffect, useRef } from 'react';
import { GAME_SYSTEMS } from './gameSystems';

const COPY = {
  es: ['Plataformas', 'Plataforma anterior', 'Plataforma siguiente'],
  ca: ['Plataformes', 'Plataforma anterior', 'Plataforma següent'],
  en: ['Platforms', 'Previous platform', 'Next platform'],
};

export default function GameConsoleCarousel({ systemId, onSystemChange, language }) {
  const c = COPY[language] || COPY.es;
  const rail = useRef(null);
  useEffect(() => {
    const item = rail.current?.querySelector(`[data-system="${systemId}"]`);
    if (item) rail.current.scrollTo({
      left: item.offsetLeft - rail.current.offsetLeft - (rail.current.clientWidth - item.clientWidth) / 2,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }, [systemId]);

  function step(delta) {
    const index = GAME_SYSTEMS.findIndex(system => system.id === systemId);
    onSystemChange(GAME_SYSTEMS[(index + delta + GAME_SYSTEMS.length) % GAME_SYSTEMS.length].id);
  }

  return <nav className="console-navigation" aria-label={c[0]}>
    <button type="button" aria-label={c[1]} onClick={() => step(-1)}>‹</button>
    <div className="console-rail" ref={rail}>
      {GAME_SYSTEMS.map(system => <button type="button" key={system.id} data-system={system.id}
        className={system.id === systemId ? 'active' : ''} aria-pressed={system.id === systemId}
        onClick={() => onSystemChange(system.id)} title={system.name}>
        <img src={system.assets.logo} alt="" loading="lazy" /><span>{system.name}</span>
      </button>)}
    </div>
    <button type="button" aria-label={c[2]} onClick={() => step(1)}>›</button>
  </nav>;
}
