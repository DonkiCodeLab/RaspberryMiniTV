import React from 'react';

export function NoFacesReviewFilter({ value, newCount, restCount, onChange, s }) {
  return <div className="photo-review-filter" role="group" aria-label={s.withoutPeople}>
    <button type="button" className="dialog-button" aria-pressed={value === 'new'} onClick={() => onChange('new')}>{s.newAdditions} · {newCount}</button>
    <button type="button" className="dialog-button" aria-pressed={value === 'rest'} onClick={() => onChange('rest')}>{s.otherPhotos} · {restCount}</button>
  </div>;
}

export function PhotoReviewAction({ reviews, s, busy, onConfirm }) {
  if (!reviews.length) return null;
  return <div className="photo-review-action">
    <span className="photo-review-badge">{reviews[0].faceId ? s.pendingValidation : s.newAddition}</span>
    <button type="button" className="dialog-button" disabled={busy} onClick={() => onConfirm(reviews.map(review => review.id))}>
      {reviews[0].faceId ? s.confirmMatches : s.markReviewed}
    </button>
  </div>;
}
