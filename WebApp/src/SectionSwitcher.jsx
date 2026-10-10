import React from "react";
import "./SectionSwitcher.css";

export default function SectionSwitcher({ idPrefix, label, tabs, selected, onSelect, className = "" }) {
  return <div className={`section-switcher ${className}`} role="tablist" aria-label={label}>
    {tabs.map((tab, index) => <button
      className="section-switcher__tab"
      key={tab.key}
      id={`${idPrefix}-${tab.key}-tab`}
      type="button"
      role="tab"
      aria-selected={selected === tab.key}
      aria-controls={`${idPrefix}-${tab.key}-panel`}
      tabIndex={selected === tab.key ? 0 : -1}
      onClick={() => onSelect(tab.key)}
      onKeyDown={event => {
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
          : event.key === "ArrowRight" ? (index + 1) % tabs.length
          : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : null;
        if (nextIndex === null) return;
        event.preventDefault();
        onSelect(tabs[nextIndex].key);
        event.currentTarget.parentElement.children[nextIndex].focus();
      }}
    >{tab.title}{tab.count != null && <span className="section-switcher__count">{tab.count}</span>}</button>)}
  </div>;
}
