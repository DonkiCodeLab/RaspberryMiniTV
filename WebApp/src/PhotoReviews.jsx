import React from 'react';

export function PhotoReviewAction({ reviews, s, busy, onConfirm }) {
  if (!reviews.length) return null;
  return <div className="photo-review-action">
    <span className="photo-review-badge">{reviews[0].faceId ? s.pendingValidation : s.newAddition}</span>
    <button type="button" className="dialog-button" disabled={busy} onClick={() => onConfirm(reviews.map(review => review.id))}>
      {reviews[0].faceId ? s.confirmMatches : s.markReviewed}
    </button>
  </div>;
}
