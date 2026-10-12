import React from "react";

// Original front-facing vector artwork: the screen opening keeps a 4:3 ratio.
export default function RetroTelevision({ ready }) {
  return <svg className="retro-television" viewBox="0 0 1000 720" aria-hidden="true">
    <defs>
      <linearGradient id="retro-tv-case" x2="0" y2="1">
        <stop stopColor="#c293cc" /><stop offset="1" stopColor="#8960a7" />
      </linearGradient>
      <linearGradient id="retro-tv-bezel" x2="1" y2="1">
        <stop stopColor="#4d4379" /><stop offset="1" stopColor="#252240" />
      </linearGradient>
      <linearGradient id="retro-tv-knob" x2="1" y2="1">
        <stop stopColor="#bdd1dc" /><stop offset="1" stopColor="#6a87a7" />
      </linearGradient>
    </defs>
    <g stroke="#25203b" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round">
      <path d="M392 104 Q404 70 376 56 L328 21 M428 104 Q448 62 480 63 Q501 62 517 26" fill="none" stroke="#62749c" strokeWidth="10" />
      <circle cx="328" cy="20" r="12" fill="#727fa6" /><circle cx="517" cy="25" r="12" fill="#727fa6" />
      <path d="M352 108 Q352 76 411 76 Q463 76 465 108" fill="#596f9a" />
      <path d="M109 656 L100 705 L142 705 L164 656 M811 656 L833 705 L875 705 L866 656" fill="#43435f" />
      <path d="M35 128 Q36 101 65 101 L931 101 Q965 104 966 136 L978 624 Q978 661 942 665 L65 665 Q29 663 27 630 Z" fill="url(#retro-tv-case)" />
      <path d="M54 123 Q465 110 937 122" fill="none" stroke="#e0b4df" strokeWidth="5" />
      <rect x="51" y="121" width="699" height="528" rx="39" fill="url(#retro-tv-bezel)" />
      <rect x="78" y="145" width="644" height="483" rx="24" fill="#11111b" stroke="#171526" strokeWidth="9" />
      <path d="M773 146 L774 624" stroke="#72528e" strokeWidth="4" />
      <circle cx="858" cy="211" r="48" fill="#674c82" />
      <circle cx="852" cy="205" r="42" fill="url(#retro-tv-knob)" />
      <path d="M831 225 L872 184" stroke="#4b627c" strokeWidth="12" />
      <circle cx="858" cy="330" r="43" fill="#674c82" />
      <circle cx="852" cy="324" r="37" fill="url(#retro-tv-knob)" />
      <path d="M833 310 L872 339" stroke="#4b627c" strokeWidth="10" />
      <rect x="805" y="405" width="104" height="183" rx="12" fill="#6f6292" strokeWidth="5" />
      {[823, 840, 857, 874, 891].map(x => <path key={x} d={`M${x} 427 V566`} stroke="#3e3c62" strokeWidth="6" />)}
      <circle className={ready ? "retro-television__led is-on" : "retro-television__led"} cx="853" cy="617" r="7" fill={ready ? "#adf6a5" : "#535369"} strokeWidth="3" />
    </g>
  </svg>;
}
