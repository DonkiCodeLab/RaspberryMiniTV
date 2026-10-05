import React from 'react';
import { AwardIcon } from './AwardSelector.jsx';
import './MovieAwardBadges.css';

export default function MovieAwardBadges({ awards }) {
  if (!awards.length) return null;
  return <span className="movie-award-badges">
    {awards.map(({ award, label }) => <span className="movie-award-badge" key={award} title={label} role="img" aria-label={label}>
      <AwardIcon award={award} />
    </span>)}
  </span>;
}
