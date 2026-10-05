import React from "react";

export default function MovieLibraryItems({ view, children, actionsVisible = false }) {
  return (
    <div className={`movie-library__items${view === "list" ? "" : " movie-library__items--reveal-actions"} movie-library__items--${view}${actionsVisible ? " is-actions-visible" : ""}`}>
      {children}
    </div>
  );
}
