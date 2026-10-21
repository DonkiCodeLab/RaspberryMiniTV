import { normalizeLanguage } from "./i18n/languages.js";
import { withLanguages } from "./i18n/index.js";
import React, { useEffect, useId, useRef, useState } from 'react';
import { getTorrentTraffic } from './api/raspberryApi';
import { trafficPaths, trafficSize, trafficTime } from './torrentTraffic.js';
import './TorrentTraffic.css';

const strings = withLanguages({
  es: { title: 'El pulso de tus torrents', scope: 'TRÁFICO DE TORRENTS', down: 'Bajada', up: 'Subida', total: 'Transferido en el periodo', live: 'Actualiza cada 30 s', stale: 'Sin medición reciente', hours: 'Últimas 3 horas', day: 'Últimas 24 horas', week: 'Últimos 7 días', month: 'Último mes', year: 'Último año', expand: 'Ampliar detalle', collapse: 'Reducir detalle', loading: 'Cargando historial…', empty: 'Estamos preparando el historial. La primera medición llegará en aproximadamente un minuto.', demo: 'Conecta con la Raspberry para ver el consumo real.', note: 'Velocidad media por intervalo. Solo tráfico de torrents, no toda la red de casa. Los huecos indican periodos sin mediciones.', coverage: 'del periodo registrado', inspect: 'Explorar un momento', noData: 'Sin mediciones', data: 'Ver datos del periodo', time: 'Fecha y hora', observed: 'Tiempo medido', sample: 'Última medición', retry: 'Reintentar' },
  ca: { title: 'El pols dels teus torrents', scope: 'TRÀFIC DE TORRENTS', down: 'Baixada', up: 'Pujada', total: 'Transferit en el període', live: 'S’actualitza cada 30 s', stale: 'Sense mesurament recent', hours: 'Últimes 3 hores', day: 'Últimes 24 hores', week: 'Últims 7 dies', month: 'Últim mes', year: 'Últim any', expand: 'Ampliar detall', collapse: 'Reduir detall', loading: 'Carregant historial…', empty: 'Estem preparant l’historial. El primer mesurament arribarà en aproximadament un minut.', demo: 'Connecta amb la Raspberry per veure el consum real.', note: 'Velocitat mitjana per interval. Només tràfic de torrents, no tota la xarxa de casa. Els buits indiquen períodes sense mesuraments.', coverage: 'del període registrat', inspect: 'Explorar un moment', noData: 'Sense mesuraments', data: 'Veure dades del període', time: 'Data i hora', observed: 'Temps mesurat', sample: 'Últim mesurament', retry: 'Torna-ho a provar' },
  en: { title: 'The pulse of your torrents', scope: 'TORRENT TRAFFIC', down: 'Download', up: 'Upload', total: 'Transferred in this period', live: 'Updates every 30 s', stale: 'No recent measurement', hours: 'Last 3 hours', day: 'Last 24 hours', week: 'Last 7 days', month: 'Last month', year: 'Last year', expand: 'Expand details', collapse: 'Collapse details', loading: 'Loading history…', empty: 'Building your history. The first measurement will arrive in about a minute.', demo: 'Connect to the Raspberry to see real traffic.', note: 'Average speed per interval. Torrent traffic only, not your whole home network. Gaps indicate periods without measurements.', coverage: 'of the period recorded', inspect: 'Explore a moment', noData: 'No measurements', data: 'View period data', time: 'Date and time', observed: 'Measured time', sample: 'Last measurement', retry: 'Retry' },
});

export default function TorrentTraffic({ language = 'es' }) {
  const locale = normalizeLanguage(language);
  const s = strings[locale];
  const uid = useId().replace(/:/g, '');
  const [period, setPeriod] = useState('3h');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState(null);
  const [revision, setRevision] = useState(0);
  const [width, setWidth] = useState(700);
  const plot = useRef(null);
  useEffect(() => {
    const observer = new ResizeObserver(entries => setWidth(Math.max(280, entries[0].contentRect.width)));
    observer.observe(plot.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let disposed = false, timer, controller;
    setData(null); setError(''); setSelected(null);
    async function poll() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const next = await getTorrentTraffic(period, controller.signal);
        if (!disposed) { setData(next); setError(''); }
      } catch (e) { if (!disposed) setError(e.message); }
      finally { clearTimeout(timeout); }
      if (!disposed) timer = setTimeout(poll, 30000);
    }
    poll();
    return () => { disposed = true; clearTimeout(timer); controller?.abort(); };
  }, [period, revision]);
  const points = data?.points || [];
  const hasHistory = points.some(p => p.downloadRate != null);
  const current = data && !data.stale && !error ? data.current : null;
  const height = expanded ? 360 : 230;
  const left = 62, right = width - 16, top = 22, bottom = height - 35;
  const max = Math.max(1000, ...points.flatMap(p => [p.downloadRate || 0, p.uploadRate || 0])) * 1.12;
  const x = p => left + (Math.min(data.end, Math.max(data.start, p.timestamp + data.bucketSeconds / 2)) - data.start) / (data.end - data.start) * (right - left);
  const y = value => bottom - value / max * (bottom - top);
  const active = points[selected ?? points.findLastIndex(p => p.downloadRate != null)];
  const formatTime = (timestamp, full = false) => trafficTime(timestamp, locale, period, full);
  const fmt = (value, rate = false) => trafficSize(value, locale, rate);
  function inspect(event) {
    if (!points.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const position = (event.clientX - rect.left) / rect.width * width;
    const timestamp = data.start + Math.max(0, Math.min(1, (position - left) / (right - left))) * (data.end - data.start);
    setSelected(Math.max(0, Math.min(points.length - 1, Math.floor((timestamp - points[0].timestamp) / data.bucketSeconds))));
  }
  return <section className={`torrent-traffic${expanded ? ' is-expanded' : ''}`} aria-labelledby={`${uid}-title`}>
    <header className="torrent-traffic__header">
      <div><span className="torrent-traffic__eyebrow">{s.scope}</span><h3 id={`${uid}-title`}>{s.title}</h3></div>
      <span className={`torrent-traffic__live${current ? '' : ' is-stale'}`}><i />{current ? s.live : s.stale}</span>
    </header>
    <div className="torrent-traffic__metrics">
      {[['downloadRate', 'downloadedBytes', s.down, 'down', '↓'], ['uploadRate', 'uploadedBytes', s.up, 'up', '↑']].map(([rate, total, label, color, arrow]) => <div className={`torrent-traffic__metric is-${color}`} key={rate}>
        <span className="torrent-traffic__label"><b>{arrow}</b>{label}</span>
        <strong>{fmt(current?.[rate], true)}</strong>
        <span>{s.total} <b>{fmt(data?.demo ? null : data?.totals?.[total])}</b></span>
      </div>)}
    </div>
    <div className="torrent-traffic__toolbar">
      <div className="torrent-traffic__periods" role="group" aria-label={s.time}>{[['3h', s.hours], ['24h', s.day], ['7d', s.week], ['30d', s.month], ['365d', s.year]].map(([value, label]) => <button type="button" key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>)}</div>
      <button className="torrent-traffic__expand" type="button" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? '↙' : '↗'} {expanded ? s.collapse : s.expand}</button>
    </div>
    <div className="torrent-traffic__plot" ref={plot}>
      {hasHistory ? <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${s.down} / ${s.up}. ${s.note}`} onPointerMove={inspect} onPointerDown={inspect} onPointerLeave={() => setSelected(null)}>
        <defs>{['down', 'up'].map((color) => <linearGradient id={`${uid}-${color}`} key={color} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color === 'down' ? '#57d6f7' : '#ffba76'} stopOpacity=".28" /><stop offset="100%" stopColor={color === 'down' ? '#57d6f7' : '#ffba76'} stopOpacity=".015" /></linearGradient>)}</defs>
        {[0, 1, 2, 3].map(i => <g key={i}><line className="torrent-traffic__grid" x1={left} x2={right} y1={y(max * i / 3)} y2={y(max * i / 3)} /><text x={left - 9} y={y(max * i / 3) + 4} textAnchor="end">{fmt(max * i / 3, true)}</text></g>)}
        {[['downloadRate', 'down'], ['uploadRate', 'up']].map(([field, color]) => <g key={field} className={`torrent-traffic__series is-${color}`}>{trafficPaths(points, field, x, y, bottom).map((path, i) => <g key={i}><path d={path.area} fill={`url(#${uid}-${color})`} /><path d={path.line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />{path.single && <circle cx={path.single[0]} cy={path.single[1]} r="3" fill="currentColor" />}</g>)}</g>)}
        {[0, .5, 1].map(f => <text key={f} x={left + f * (right - left)} y={height - 8} textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}>{formatTime(data.start + f * (data.end - data.start))}</text>)}
        {active && <g><line x1={x(active)} x2={x(active)} y1={top} y2={bottom} stroke="#ffffff60" strokeDasharray="4 5" />{['downloadRate', 'uploadRate'].map((field, i) => active[field] != null && <circle key={field} cx={x(active)} cy={y(active[field])} r="4" fill={i ? '#ffba76' : '#57d6f7'} stroke="#10202a" strokeWidth="2" />)}</g>}
      </svg> : <div className="torrent-traffic__empty" role="status"><span>↕</span>{data?.demo ? s.demo : !data && !error ? s.loading : error || s.empty}</div>}
    </div>
    {hasHistory && <>
      <div className="torrent-traffic__readout"><time>{active ? formatTime(active.timestamp, true) : '—'}</time><span className="is-down">↓ {s.down} <b>{fmt(active?.downloadRate, true)}</b></span><span className="is-up">↑ {s.up} <b>{fmt(active?.uploadRate, true)}</b></span></div>
      <input className="torrent-traffic__scrubber" type="range" min="0" max={points.length - 1} value={selected ?? Math.max(0, points.findLastIndex(p => p.downloadRate != null))} onChange={e => setSelected(Number(e.target.value))} aria-label={s.inspect} aria-valuetext={active ? `${formatTime(active.timestamp, true)}, ${s.down} ${fmt(active.downloadRate, true)}, ${s.up} ${fmt(active.uploadRate, true)}` : s.noData} />
    </>}
    <footer className="torrent-traffic__footer"><p>{s.note}</p>{hasHistory && <span>{new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(100 * data.totals.observedSeconds / (data.end - data.start))}% {s.coverage}</span>}{data?.current && <span>{s.sample}: {formatTime(data.current.timestamp, true)}</span>}</footer>
    {error && <div role="alert"><p className="dialog-error">{error}</p><button type="button" className="dialog-button" onClick={() => setRevision(v => v + 1)}>{s.retry}</button></div>}
    {expanded && hasHistory && <details className="torrent-traffic__details"><summary>{s.data}</summary><div tabIndex={0} role="region" aria-label={s.data}><table><thead><tr><th>{s.time}</th><th>{s.down}</th><th>{s.up}</th><th>{s.observed}</th></tr></thead><tbody>{points.map(p => <tr key={p.timestamp}><td>{formatTime(p.timestamp, true)}</td><td>{fmt(p.downloadRate, true)}</td><td>{fmt(p.uploadRate, true)}</td><td>{Math.round(p.observedSeconds)} s</td></tr>)}</tbody></table></div></details>}
  </section>;
}
