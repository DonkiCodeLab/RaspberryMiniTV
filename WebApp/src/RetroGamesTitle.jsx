import React, { useId } from "react";
import "./RetroGamesTitle.css";

export default function RetroGamesTitle({ label }) {
  const id = useId();
  const words = label.toLocaleUpperCase().split(/\s+/);

  return (
    <h1 className="series-hero__section-title series-hero__section-title--games" aria-label={label}>
      <svg className="retro-games-title" viewBox="0 0 460 224" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={`${id}-blue`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#a5f4ff" />
            <stop offset=".46" stopColor="#42b9df" />
            <stop offset=".49" stopColor="#d9fbff" />
            <stop offset=".52" stopColor="#367cae" />
            <stop offset="1" stopColor="#193977" />
          </linearGradient>
          <linearGradient id={`${id}-pink`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4ab8df" />
            <stop offset=".53" stopColor="#286ea6" />
            <stop offset=".55" stopColor="#b9f4ff" />
            <stop offset=".58" stopColor="#f72e82" />
            <stop offset=".63" stopColor="#f72e82" />
            <stop offset=".66" stopColor="#b9f4ff" />
            <stop offset=".69" stopColor="#ed2978" />
            <stop offset="1" stopColor="#ff5599" />
          </linearGradient>
          <g id={`${id}-lettering`} className="retro-games-title__lettering">
            {words.map((word, index) => (
              <text key={`${index}-${word}`} x="44" y={95 + index * 95} textLength="370" lengthAdjust="spacingAndGlyphs">{word}</text>
            ))}
          </g>
        </defs>
        <path d="M43 15 439 5 393 198 11 212Z" fill="#ef2d7c" stroke="#090a11" strokeWidth="9" strokeLinejoin="round" />
        <g transform="translate(28 0) skewX(-11)" strokeLinejoin="round">
          <use href={`#${id}-lettering`} transform="translate(9 10)" fill="#05060b" stroke="#05060b" strokeWidth="19" />
          <use href={`#${id}-lettering`} fill="#05060b" stroke="#05060b" strokeWidth="15" />
          <use href={`#${id}-lettering`} fill="#f4fbff" stroke="#f4fbff" strokeWidth="5" />
          <g className="retro-games-title__lettering">
            {words.map((word, index) => (
              <text key={`${index}-${word}`} x="44" y={95 + index * 95} textLength="370" lengthAdjust="spacingAndGlyphs" fill={`url(#${id}-${index ? "pink" : "blue"})`}>{word}</text>
            ))}
          </g>
        </g>
      </svg>
    </h1>
  );
}
