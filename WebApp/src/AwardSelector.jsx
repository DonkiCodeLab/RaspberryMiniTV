import React from 'react';
import { awardNames, awardStrings } from './awardCatalog.js';
import './AwardSelector.css';

export function AwardIcon({ award = 'oscars' }) {
  return <svg viewBox="0 0 48 64" aria-hidden="true" focusable="false" className={`award-icon award-icon--${award}`}>
    {award === 'oscars' ? <>
      <circle cx="24" cy="9" r="5" fill="currentColor" />
      <path d="M19 15h10l5 6-3 17-4-1 1 15h-8l1-15-4 1-3-17 5-6Zm0 37h10v5H19Zm-6 5h22v5H13Z" fill="currentColor" />
      <path d="m18 20 6 11 6-11M24 26v24" fill="none" stroke="var(--award-cutout, #172228)" strokeWidth="1.7" />
    </> : award === 'palme' ? <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="24" cy="31" rx="21" ry="26" strokeWidth="1" opacity=".55" />
      <path d="M11 50Q20 36 36 13M16 43Q7 37 12 29q7 6 8 9M21 36q-7-9-2-17 5 8 6 11M27 28q-4-11 2-18 3 8 2 12M17 43q10 2 16-6-9-1-12 0M23 34q12 0 16-9-9 1-12 4M29 25q11-1 13-10-7 2-9 5" />
    </g> : <>
      <path d="M15 56v-7l-7-4 3-14 6-5-1-6 3-9 9-5 10 5 3 8-3 8-4 4 1 9 6 8-2 8H15Z" fill="currentColor" />
      <path d="m19 15 12-3 5 8-5 2-1 6-6 3-5-4m10-8 3 1m-9 9 7 1m-12 6 6 6 9-5m-18 9 12 6 9-5" fill="none" stroke="var(--award-cutout, #172228)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11 56h29v6H11Z" fill="currentColor" />
    </>}
  </svg>;
}

export default function AwardSelector({ value, onChange, language }) {
  const words = awardStrings(language, value);
  return <div className="award-selector" role="group" aria-label={words.selector}>
    {Object.entries(awardNames).map(([award, name]) => <button key={award} type="button" aria-pressed={value === award}
      className={value === award ? 'is-active' : ''} onClick={() => onChange(award)}>
      <AwardIcon award={award} /><span>{name}</span>
    </button>)}
  </div>;
}
