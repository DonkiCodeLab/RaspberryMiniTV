import React from "react";

export default function LoadingSpinner({ inline = false }) {
  return <span className={`library-loading__spinner${inline ? " library-loading__spinner--inline" : ""}`} aria-hidden="true">
    <span /><span /><span />
  </span>;
}
