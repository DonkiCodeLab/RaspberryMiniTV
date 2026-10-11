import React, { useEffect, useRef, useState } from 'react';
import { codexRequest, isMockMode } from './api/raspberryApi';
import { codexStrings, codexLoginUrl } from './codexStrings.js';
import './CodexPanel.css';

const SESSION_KEY = 'minitv-codex-session';
function savedSession() { try { return sessionStorage.getItem(SESSION_KEY) || ''; } catch { return ''; } }
function saveSession(token) { try { token ? sessionStorage.setItem(SESSION_KEY, token) : sessionStorage.removeItem(SESSION_KEY); } catch { /* Memory-only fallback. */ } }

function Approval({ item, s, disabled, onReply }) {
  const [answers, setAnswers] = useState({});
  const questions = item.method === 'item/tool/requestUserInput' ? item.params.questions || [] : null;
  return <article className="codex-approval">
    <h4>{questions ? s.question : s.permission}</h4>
    {questions ? <form onSubmit={event => { event.preventDefault(); onReply({ id: item.id, answers }); }}>
      {questions.map(q => <label key={q.id}><span>{q.question}</span>
        {q.options?.length > 0 && <select aria-label={q.header || q.question} value={answers[q.id] || ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}>
          <option value="">—</option>{q.options.map(o => <option key={o.label} value={o.label}>{o.label}{o.description ? ` — ${o.description}` : ''}</option>)}
        </select>}
        <input required maxLength={4000} value={answers[q.id] || ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))} />
      </label>)}
      <button type="submit" disabled={disabled}>{s.answer}</button>
    </form> : <>
      {item.params.reason && <p>{item.params.reason}</p>}
      {item.params.command && <pre>{item.params.command}</pre>}
      {item.params.grantRoot && <pre>{item.params.grantRoot}</pre>}
      <details><summary>{s.detail}</summary><pre>{JSON.stringify(item.params, null, 2)}</pre></details>
      <div className="codex-actions"><button disabled={disabled} onClick={() => onReply({ id: item.id, decision: 'accept' })}>{s.approve}</button>
        <button disabled={disabled} onClick={() => onReply({ id: item.id, decision: 'decline' })}>{s.reject}</button></div>
    </>}
  </article>;
}

function Message({ item, s }) {
  if (item.type === 'userMessage') return <article className="codex-message codex-message--user"><strong>{s.you}</strong><p>{(item.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n')}</p></article>;
  if (item.type === 'agentMessage' || item.type === 'plan') return <article className="codex-message"><strong>{item.type === 'plan' ? s.plan : 'Codex'}</strong><p>{item.text}</p></article>;
  if (item.type === 'commandExecution') return <details className="codex-tool"><summary>{s.command}: {item.command} · {s[item.status] || item.status}</summary><pre>{item.aggregatedOutput || '…'}</pre></details>;
  if (item.type === 'fileChange') return <details className="codex-tool"><summary>{s.files} · {item.changes?.length || 0}</summary>{(item.changes || []).map((change, i) => <div key={i}><strong>{change.path}</strong><pre>{change.diff}</pre></div>)}</details>;
  return null;
}

export default function CodexPanel({ language }) {
  const s = codexStrings(language);
  const demo = isMockMode();
  const [token, setToken] = useState(savedSession);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState(null);
  const [state, setState] = useState(null);
  const [threads, setThreads] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const acting = useRef(false);
  const log = useRef(null);
  const follow = useRef(true);
  const generation = useRef(0);

  function forget() { saveSession(''); setToken(''); setState(null); setThreads([]); setPassword(''); }

  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    codexRequest('status', '', null, controller.signal).then(setStatus).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [demo, attempt]);

  useEffect(() => {
    if (!token || demo) return;
    const controller = new AbortController();
    let timer, previous = '', historyLoaded = false;
    const currentGeneration = ++generation.current;
    async function poll() {
      try {
        const next = await codexRequest('state', token, null, controller.signal);
        if (controller.signal.aborted) return;
        setState(next);
        const key = `${next.thread?.id}:${next.busy}`;
        if (!acting.current && (!historyLoaded || previous !== key)) {
          const history = await codexRequest('threads', token, {}, controller.signal);
          if (controller.signal.aborted) return;
          setThreads(history.threads); setCursor(history.cursor); historyLoaded = true; previous = key;
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          if (e.status === 403) forget();
          setError(e.message);
        }
      } finally {
        if (!controller.signal.aborted && generation.current === currentGeneration) timer = setTimeout(poll, 1200);
      }
    }
    poll();
    return () => { controller.abort(); clearTimeout(timer); generation.current += 1; };
  }, [token, demo, attempt]);

  useEffect(() => { if (follow.current && log.current) log.current.scrollTop = log.current.scrollHeight; }, [state]);

  async function act(name, data = {}) {
    if (acting.current || demo) return;
    acting.current = true; setBusy(name); setError('');
    try {
      const result = await codexRequest(name, token, data);
      if (name === 'unlock') { saveSession(result.token); setToken(result.token); setPassword(''); }
      else if (name === 'lock') forget();
      else if (name === 'threads') { setThreads(current => [...current, ...result.threads.filter(t => !current.some(c => c.id === t.id))]); setCursor(result.cursor); }
      else {
        if (name === 'send') { setDraft(''); follow.current = true; }
        if (name === 'select') follow.current = true;
        setState(await codexRequest('state', token));
      }
    } catch (e) { if (e.status === 403 && name !== 'unlock') forget(); setError(e.message); }
    finally { acting.current = false; setBusy(''); }
  }

  const running = Boolean(state?.busy);
  const loginUrl = codexLoginUrl(state?.login?.verificationUrl);
  return <section className="codex-panel" aria-labelledby="codex-title">
    <header className="codex-heading"><div><h2 id="codex-title">{s.title}</h2><p>{s.hint}</p></div>
      {token && !demo && <button disabled={!!busy} onClick={() => act('lock')}>{s.lock}</button>}
    </header>
    {error && <div className="codex-error" role="alert">{error} <button disabled={!!busy} onClick={() => { setError(''); setAttempt(a => a + 1); }}>{s.retry}</button></div>}
    {demo ? <p>{s.demo}</p> : !status ? <p role="status">{s.loading}</p> : !status.configured ? <div className="codex-setup">
      <h3>{s.setup}</h3><p>{s.setupHint}</p><pre>sudo bash DeviceApp/install_codex_support.sh</pre><p>{s.installDetail}</p>
      <button onClick={() => setAttempt(a => a + 1)}>{s.refresh}</button>
    </div> : !token ? <form className="codex-unlock" onSubmit={e => { e.preventDefault(); act('unlock', { password }); }}>
      <p>{s.lockedHint}</p><label><span>{s.password}</span><input type="password" autoComplete="current-password" maxLength={256} required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button disabled={!!busy} type="submit">{busy ? s.loading : s.unlock}</button>
    </form> : !state ? <p role="status">{s.loading}</p> : <>
      <div className="codex-account">
        <p>{state.account ? `${s.account}${state.account.email ? ` · ${state.account.email}` : ''}` : s.noAccount}</p>
        <button disabled={!!busy || running || Boolean(state.login && !state.login.completed)} onClick={() => act(state.account ? 'logout' : 'login')}>{state.account ? s.disconnect : s.connect}</button>
      </div>
      {state.login && !state.login.completed && <div className="codex-login" role="status"><p>{s.loginHint}</p><strong>{state.login.userCode}</strong>{loginUrl && <a href={loginUrl} target="_blank" rel="noopener noreferrer">{s.loginOpen}</a>}</div>}
      {state.login?.completed && <p role="status">{state.login.success ? s.loginDone : state.login.error || s.loginFailed}</p>}
      <p className="codex-isolated">{s.isolated}</p>
      <div className="codex-layout">
        <aside className="codex-history" aria-label={s.history}>
          <h3>{s.history}</h3><button disabled={!!busy || running} onClick={() => act('select', { threadId: null })}>{s.fresh}</button>
          {!threads.length && <p>{s.empty}</p>}
          {threads.map(t => <button key={t.id} className={t.id === state.thread?.id ? 'is-selected' : ''} aria-current={t.id === state.thread?.id ? 'true' : undefined} disabled={!!busy || running} onClick={() => act('select', { threadId: t.id })}>{t.title}</button>)}
          {cursor && <button disabled={!!busy} onClick={() => act('threads', { cursor })}>{s.more}</button>}
        </aside>
        <div className="codex-conversation">
          <div className="codex-log" ref={log} role="region" aria-label={s.history} tabIndex={0} onScroll={e => { const el = e.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90; }}>
            {!state.thread && <p className="codex-empty">{s.placeholder}</p>}
            {(state.thread?.turns || []).map(turn => <div key={turn.id} className="codex-turn">{turn.items?.map(item => <Message key={item.id} item={item} s={s} />)}<small>{s[turn.status] || turn.status}</small></div>)}
          </div>
          {state.thread?.turns?.length >= 30 && <small>{s.historyLimit}</small>}
          {state.error && <p className="codex-error" role="alert">{state.error}</p>}
          {state.approvals?.map(item => <Approval key={item.id} item={item} s={s} disabled={!!busy} onReply={data => act('reply', data)} />)}
          {state.diff && <details className="codex-tool"><summary>{s.diff}</summary><pre>{state.diff}</pre></details>}
          <form className="codex-composer" onSubmit={e => { e.preventDefault(); act('send', { prompt: draft }); }}>
            <label htmlFor="codex-prompt">{s.prompt}</label>
            <textarea id="codex-prompt" rows={4} maxLength={16000} value={draft} placeholder={s.placeholder} disabled={!state.account} onChange={e => setDraft(e.target.value)} />
            <div className="codex-actions"><span role="status">{state.approvals?.length ? s.waiting : running ? s.working : s.ready}</span>
              {running ? <button type="button" disabled={!!busy} onClick={() => act('stop')}>{s.stop}</button> : <button type="submit" disabled={!!busy || !draft.trim() || !state.account}>{s.send}</button>}
            </div>
          </form>
        </div>
      </div>
    </>}
  </section>;
}
