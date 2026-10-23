import React, { useEffect, useId, useState } from 'react';
import { currentAge, daysInMonth, validBirthday } from './personBirthday.js';

export default function PersonBirthday({ value = '', s, busy, onSave }) {
  const [draft, setDraft] = useState(value || '');
  const [today, setToday] = useState(() => new Date());
  const hintId = useId();
  useEffect(() => { setDraft(value || ''); }, [value]);
  useEffect(() => {
    const timer = setInterval(() => setToday(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const [year = '', month = '', day = ''] = draft.split('-');
  const candidate = draft ? `${year.padStart(4, '0')}-${month}-${day}` : '';
  const age = currentAge(candidate, today);
  const savedAge = currentAge(value, today);
  const savedParts = value?.split('-');
  const savedLabel = savedAge === null ? s.addBirthDate : `${Number(savedParts[2])} ${s.birthMonths[Number(savedParts[1]) - 1]} ${Number(savedParts[0])}`;
  const valid = candidate === '' || validBirthday(candidate, today);
  const change = (part, value) => {
    const parts = { year, month, day, [part]: value };
    // Keep the selected day valid when switching month or leap year.
    if (parts.year && parts.month && parts.day) parts.day = String(Math.min(Number(parts.day), daysInMonth(Number(parts.year), Number(parts.month)))).padStart(2, '0');
    setDraft(`${parts.year}-${parts.month}-${parts.day}`);
  };
  return <form className="photo-person-birthday" onSubmit={event => {
    event.preventDefault();
    if (!busy && valid) onSave(candidate);
  }}>
    <details>
      <summary>{s.birthDate}: {savedLabel}{savedAge !== null ? ` · ${s.personAge.replace('{age}', savedAge)}` : ''}</summary>
      <p id={hintId}>{s.birthDateHint}</p>
      <div className="photo-person-birthday__picker" aria-describedby={hintId}>
        <label>{s.year}<input type="number" inputMode="numeric" min="1" max={today.getFullYear()} placeholder="1950" value={year} disabled={busy}
          onChange={event => change('year', event.target.value)} /></label>
        <label>{s.month}<select value={month} disabled={busy} onChange={event => change('month', event.target.value)}>
          <option value="">—</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>{s.birthMonths[i]}</option>)}
        </select></label>
        <label>{s.birthDay}<select value={day} disabled={busy} onChange={event => change('day', event.target.value)}>
          <option value="">—</option>{Array.from({ length: daysInMonth(Number(year), Number(month)) }, (_, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>{i + 1}</option>)}
        </select></label>
      </div>
      {age !== null && <p role="status">{s.personAge.replace('{age}', age)}</p>}
      {!valid && <p role="status">{s.invalidBirthDate}</p>}
      <div className="photo-person-birthday__actions">
        <button type="submit" className="dialog-button" disabled={busy || !valid || candidate === (value || '')}>{s.save}</button>
        <button type="button" className="dialog-button" disabled={busy || !draft} onClick={() => setDraft('')}>{s.clearBirthDate}</button>
      </div>
    </details>
  </form>;
}
