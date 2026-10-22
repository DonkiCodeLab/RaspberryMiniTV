import React, { useEffect, useRef, useState } from 'react';
import { getAIUsage, saveAIBilling, syncAIBilling, isMockMode } from './api/raspberryApi';
import { intlLocale } from './i18n/languages.js';
import { aiUsageStrings } from './aiUsageStrings.js';
import { formatUsageMoney, usageRange, usageValue } from './aiUsage.js';
import './OpenAIUsage.css';

const operations = ['search', 'recommendation', 'subtitle', 'image', 'connection_test'];

export function UsageChart({ series, metric, source, language }) {
  const s = aiUsageStrings(language), locale = intlLocale(language);
  const [selected, setSelected] = useState(null);
  const chart = useRef(null);
  const [viewportWidth, setViewportWidth] = useState(660);
  useEffect(() => {
    const resize = () => setViewportWidth(Math.max(660, Math.floor(chart.current?.clientWidth || 660)));
    resize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(resize);
    observer.observe(chart.current);
    return () => observer.disconnect();
  }, []);
  const values = series.map(point => usageValue(point, metric, source));
  const known = values.filter(value => value != null);
  const max = Math.max(...known, 0.000001), min = Math.min(...known, 0);
  const top = 20, height = 155, bottom = top + height;
  const y = value => top + height * (max - value) / (max - min);
  const width = Math.max(viewportWidth, series.length * 18 + 70), step = (width - 70) / Math.max(series.length, 1);
  const format = value => metric === 'cost' || source === 'reported' ? formatUsageMoney(value, locale) : value == null ? '—' : value.toLocaleString(locale);
  const focus = selected != null && series[selected] ? selected : values.findIndex(value => value != null && value !== 0);
  const label = index => `${series[index].date}: ${format(values[index])}${series[index].unknown && source === 'local' ? ` · ${s.unknown}: ${series[index].unknown}` : ''}${source === 'reported' ? ` · ${s.coverage}: ${series[index].reportedDays}/${series[index].days}` : ''}`;
  return <div className="ai-usage__chart">
    <div className="ai-usage__chart-caption" aria-live="polite">{focus >= 0 ? label(focus) : source === 'reported' ? s.noReported : s.empty}</div>
    <div ref={chart} className="ai-usage__scroll" tabIndex={0} aria-label={s.chart}>
      <svg width={width} height="222" role="img" aria-label={`${s.chart} · ${source === 'reported' ? s.reported : s[metric]}`}>
        {[0, .5, 1].map(fraction => {
          const value = min + (max - min) * fraction;
          return <g key={fraction}><line x1="58" x2={width} y1={y(value)} y2={y(value)} className="ai-usage__grid" />
            <text x="53" y={y(value) - 4} textAnchor="end">{new Intl.NumberFormat(locale, { notation: 'compact', maximumSignificantDigits: 3 }).format(value)}</text></g>;
        })}
        {series.map((point, index) => {
          const value = values[index], x = 65 + index * step;
          return <g key={point.date}>
            <rect x={x} y={value == null ? y(0) - 3 : Math.min(y(value), y(0))} width={Math.max(3, step - 5)}
              height={value == null ? 3 : Math.max(2, Math.abs(y(value) - y(0)))} rx="2"
              className={value == null ? 'ai-usage__bar ai-usage__bar--unknown' : `ai-usage__bar${source === 'reported' ? ' ai-usage__bar--reported' : ''}`}
              tabIndex={0} role="img" aria-label={label(index)} onFocus={() => setSelected(index)} onMouseEnter={() => setSelected(index)}>
              <title>{label(index)}</title>
            </rect>
            {(index % Math.max(1, Math.ceil(series.length / 12)) === 0 || index === series.length - 1) &&
              <text x={x} y={bottom + 23} transform={`rotate(-20 ${x} ${bottom + 23})`}>{point.date}</text>}
          </g>;
        })}
      </svg>
    </div>
  </div>;
}

export function UsageResults({ data, filters, setFilters, language, source, metric }) {
  const s = aiUsageStrings(language), locale = intlLocale(language);
  const money = value => formatUsageMoney(value, locale);
  const time = value => value ? new Date(value * 1000).toLocaleString(locale, { timeZone: 'UTC' }) : '—';
  const number = value => value == null ? '—' : value.toLocaleString(locale);
  return <>
    <div className="ai-usage__totals">
      <div><span>{s.estimated}</span><strong>{data.summary.calls && data.summary.unknown === data.summary.calls ? '—' : money(data.summary.estimatedUsd)}</strong></div>
      <div><span>{s.reported}</span><strong>{money(data.reported.usd)}</strong><small>{s.coverage}: {data.reported.days}/{data.reported.totalDays}</small></div>
      <div><span>{s.calls}</span><strong>{number(data.summary.calls)}</strong></div>
      <div><span>{s.tokens}</span><strong>{data.summary.calls && data.summary.missingTokens === data.summary.calls ? '—' : number(data.summary.tokens)}</strong></div>
    </div>
    {data.summary.unknown > 0 && <p className="ai-usage__notice">{s.unknown}: <strong>{data.summary.unknown}</strong></p>}
    {data.summary.missingTokens > 0 && <p className="ai-usage__notice">{s.missingTokens}: {data.summary.missingTokens}</p>}
    <p className="ai-usage__hint">{s.estimateHint}</p>
    <UsageChart series={data.series} source={source} metric={metric} language={language} />
    {(source === 'reported' || data.reported.usd != null) && <p className="ai-usage__hint">{s.reportedHint}</p>}
    {data.breakdown.length > 0 && <div className="ai-usage__breakdown" aria-label={s.breakdown}>
      {data.breakdown.map(item => <div key={item.operation}><span>{s[item.operation] || item.operation}</span>
        <strong>{item.unknown === item.calls ? '—' : money(item.estimatedUsd)}</strong><small>{item.calls} {s.calls.toLowerCase()}{item.unknown ? ` · ${item.unknown} ${s.unknown.toLowerCase()}` : ''}</small></div>)}
    </div>}
    <h4>{s.history}</h4>
    {filters.group && <p>{s.groupTotal} <button type="button" className="dialog-button" onClick={() => setFilters(current => ({ ...current, group: '', page: 0 }))}>{s.clearGroup}</button></p>}
    {!data.calls.length ? <p>{s.empty}</p> : <div className="ai-usage__scroll">
      <table><thead><tr>{[s.date, s.operation, s.model, s.input, s.output, s.estimated, s.status, s.detail].map(title => <th key={title} scope="col">{title}</th>)}</tr></thead>
        <tbody>{data.calls.map(call => <tr key={call.id}>
          <td>{time(call.started)}</td><td>{s[call.operation] || call.operation}</td><td className="ai-usage__model">{call.model}</td>
          <td>{number(call.usage.input_tokens)}</td><td>{number(call.usage.output_tokens)}</td>
          <td title={s[call.cost_status] || ''}>{money(call.estimatedUsd)}</td>
          <td><span className={`ai-usage__status ai-usage__status--${call.status}`}>{call.status === 'unknown' ? s.unknownStatus : s[call.status]}</span></td>
          <td><details><summary>{s.detail}</summary><dl>
            <dt>{s.requestId}</dt><dd>{call.request_id || '—'}</dd>
            <dt>{s.duration}</dt><dd>{call.duration_ms == null ? '—' : `${(call.duration_ms / 1000).toFixed(1)} s`}</dd>
            <dt>{s.cached}</dt><dd>{number(call.usage.input_tokens_details?.cached_tokens)}</dd>
            <dt>HTTP</dt><dd>{call.http_status || '—'}</dd>
            {call.tariff ? <><dt>{s.tariff}</dt><dd>{Object.entries(call.tariff.usdPerMillion).map(([key, value]) => `${key}: ${value}`).join(' · ')} ({call.tariff.asOf})</dd></> : <dd>{s[call.cost_status]}</dd>}
          </dl>{call.group_id && <button type="button" className="dialog-button" onClick={() => setFilters(current => ({ ...current, group: call.group_id, operation: '', model: '', page: 0 }))}>{s.group}</button>}</details></td>
        </tr>)}</tbody>
      </table>
    </div>}
    <div className="ai-usage__pager"><button type="button" className="dialog-button" disabled={!filters.page} onClick={() => setFilters(current => ({ ...current, page: current.page - 1 }))}>{s.previous}</button>
      <span>{s.page} {filters.page + 1}</span><button type="button" className="dialog-button" disabled={!data.hasMore} onClick={() => setFilters(current => ({ ...current, page: current.page + 1 }))}>{s.next}</button></div>
    <p className="ai-usage__hint">{s.since}: {time(data.since)} · {s.pricingDate}: {data.pricingDate}</p>
  </>;
}

export default function OpenAIUsage({ language, active = true }) {
  const s = aiUsageStrings(language), demo = isMockMode();
  const [filters, setFilters] = useState(() => ({ ...usageRange('month'), period: 'day', operation: '', model: '', group: '', page: 0 }));
  const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0), [source, setSource] = useState('local'), [metric, setMetric] = useState('cost');
  const [adminKey, setAdminKey] = useState(''), [projectId, setProjectId] = useState(''), [apiKeyId, setApiKeyId] = useState('');
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(''), [message, setMessage] = useState('');
  const action = useRef(null), dirtyRef = useRef(false);
  useEffect(() => {
    if (demo || !active) return;
    const controller = new AbortController();
    let pending = false;
    setLoading(true); setError(''); setData(null);
    async function refresh() {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        const value = await getAIUsage(filters, controller.signal);
        if (controller.signal.aborted) return;
        setData(value); setError('');
        if (!dirtyRef.current) { setProjectId(value.billing.projectId); setApiKeyId(value.billing.apiKeyId); }
      } catch (error) {
        if (!controller.signal.aborted) setError(error.code || 'error');
      } finally {
        pending = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    const refreshVisible = () => { if (document.visibilityState !== 'hidden') refresh(); };
    refresh();
    const timer = setInterval(refreshVisible, 15000);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [filters, revision, demo, active]);
  useEffect(() => () => { action.current?.abort(); }, []);
  function change(field, value) { setFilters(current => ({ ...current, [field]: value, page: 0 })); }
  function edit(setter, value) { setter(value); setDirty(true); dirtyRef.current = true; setMessage(''); }
  async function billingAction(kind) {
    if (action.current || demo) return;
    const controller = new AbortController(); action.current = controller;
    setBusy(kind); setError(''); setMessage('');
    try {
      if (kind === 'sync') await syncAIBilling({ start: filters.start, end: filters.end }, controller.signal);
      else await saveAIBilling(kind === 'remove' ? { clearAdminKey: true } : { adminKey, projectId, apiKeyId }, controller.signal);
      if (controller.signal.aborted) return;
      setAdminKey('');
      if (kind !== 'sync') { setDirty(false); dirtyRef.current = false; }
      setMessage(kind === 'sync' ? 'synced' : 'saved'); setRevision(value => value + 1);
    } catch (error) { if (!controller.signal.aborted) setError(error.code || 'error'); }
    finally { if (!controller.signal.aborted) { setBusy(''); action.current = null; } }
  }
  return <article className="raspberry-tmdb-card ai-usage" aria-labelledby="ai-usage-title" aria-busy={loading || Boolean(busy)}>
    <div className="raspberry-tmdb-card__header"><h3 id="ai-usage-title">{s.title}</h3><p>{s.hint}</p></div>
    {demo ? <p>{s.demo}</p> : <>
      <div className="ai-usage__presets">{[['day', 'today'], ['week', 'thisWeek'], ['month', 'thisMonth'], ['year', 'thisYear']].map(([key, label]) =>
        <button key={key} type="button" className="dialog-button" onClick={() => setFilters(current => ({ ...current, ...usageRange(key), period: key === 'year' ? 'month' : 'day', page: 0 }))}>{s[label]}</button>)}
        <button type="button" className="dialog-button" disabled={loading} onClick={() => setRevision(value => value + 1)}>{s.refresh}</button></div>
      <div className="ai-usage__filters">
        <label>{s.start}<input type="date" value={filters.start} max={filters.end} onChange={event => change('start', event.target.value)} /></label>
        <label>{s.end}<input type="date" value={filters.end} min={filters.start} onChange={event => change('end', event.target.value)} /></label>
        <label>{s.period}<select value={filters.period} onChange={event => change('period', event.target.value)}>{['day', 'week', 'month', 'year'].map(value => <option key={value} value={value}>{s[value]}</option>)}</select></label>
        <label>{s.operation}<select value={filters.operation} onChange={event => change('operation', event.target.value)}><option value="">{s.all}</option>{operations.map(value => <option key={value} value={value}>{s[value]}</option>)}</select></label>
        <label>{s.model}<select value={filters.model} onChange={event => change('model', event.target.value)}><option value="">{s.all}</option>{[...new Set([...(data?.models || []), filters.model].filter(Boolean))].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>{s.source}<select value={source} onChange={event => setSource(event.target.value)}><option value="local">{s.estimated}</option><option value="reported">{s.reported}</option></select></label>
        <label>{s.metric}<select value={source === 'reported' ? 'cost' : metric} disabled={source === 'reported'} onChange={event => setMetric(event.target.value)}>{['cost', 'tokens', 'calls'].map(value => <option key={value} value={value}>{s[value]}</option>)}</select></label>
      </div>
      {loading && <p role="status">{s.loading}</p>}
      {error && <p role="alert" className="dialog-error">{s[error] || s.error}</p>}
      {data && <UsageResults data={data} filters={filters} setFilters={setFilters} language={language} source={source} metric={metric} />}
      <details className="ai-usage__billing"><summary>{s.billingTitle}</summary><p>{s.billingHint}</p>
        <form onSubmit={event => { event.preventDefault(); billingAction('save'); }}>
          <div className="ai-usage__filters">
            <label>{s.adminKey}<input type="password" autoComplete="new-password" spellCheck={false} maxLength={512} value={adminKey}
              placeholder={data?.billing.configured ? s.keySaved : ''} disabled={Boolean(busy)} onChange={event => edit(setAdminKey, event.target.value)} /></label>
            <label>{s.projectId}<input required maxLength={200} value={projectId} disabled={Boolean(busy)} onChange={event => edit(setProjectId, event.target.value)} /></label>
            <label>{s.apiKeyId}<input maxLength={200} value={apiKeyId} disabled={Boolean(busy)} onChange={event => edit(setApiKeyId, event.target.value)} /></label>
          </div><p className="ai-usage__hint">{s.noSecret}</p>
          <div className="dialog-actions"><button type="submit" className="dialog-button" disabled={Boolean(busy) || loading}>{s.save}</button>
            <button type="button" className="dialog-button" disabled={Boolean(busy) || dirty || !data?.billing.configured || !data?.billing.projectId} onClick={() => billingAction('sync')}>{s.sync}</button>
            <button type="button" className="dialog-button" disabled={Boolean(busy) || !data?.billing.configured} onClick={() => billingAction('remove')}>{s.remove}</button></div>
        </form>
        {data?.billing.lastSync && <p>{s.lastSync}: {new Date(data.billing.lastSync * 1000).toLocaleString(intlLocale(language), { timeZone: 'UTC' })} UTC</p>}
        {busy && <p role="status">{s.busy}</p>}{message && <p role="status">{s[message]}</p>}
      </details>
    </>}
  </article>;
}
