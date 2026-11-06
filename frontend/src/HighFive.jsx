import React, { useEffect, useRef, useState } from "react";
import { playHighFive } from "./sound.js";

const SLAP_MS = 1100;

// Full-screen high-five prompt. onSlap() fires on the tap, onDone() shortly after, once the slap animation played.
export default function HighFive({ taskName, onSlap, onDone }) {
  const [slapped, setSlapped] = useState(false);
  const btn = useRef(null);
  const armed = useRef(false);

  useEffect(() => {
    btn.current?.focus();
    // Ignore the tail of the tap that opened this screen (or a quick double tap)
    const arm = setTimeout(() => { armed.current = true; }, 450);
    return () => clearTimeout(arm);
  }, []);

  const slap = () => {
    if (slapped || !armed.current) return;
    setSlapped(true);
    playHighFive();
    onSlap();
    setTimeout(onDone, SLAP_MS);
  };

  return (
    <div className="highfive" role="dialog" aria-modal="true" aria-label="Dod pieci!">
      <p className="highfive-task">{taskName}</p>
      <h2 className="highfive-title">{slapped ? "Jee! 🎉" : "Dod pieci!"}</h2>
      <button ref={btn} className={`highfive-hand${slapped ? " slapped" : ""}`} onClick={slap} aria-label="Sist piecus">
        <svg viewBox="0 0 200 240" aria-hidden="true">
          <g fill="#8a67f0" stroke="#6d4bd1" strokeWidth="4" strokeLinejoin="round">
            <rect x="34" y="52" width="30" height="86" rx="15" transform="rotate(-8 49 138)" />
            <rect x="70" y="22" width="32" height="104" rx="16" transform="rotate(-2 86 126)" />
            <rect x="108" y="22" width="32" height="104" rx="16" transform="rotate(3 124 126)" />
            <rect x="144" y="52" width="30" height="86" rx="15" transform="rotate(10 159 138)" />
            <rect x="23" y="120" width="30" height="82" rx="15" transform="rotate(-38 38 165)" />
            <path d="M30 120H170V170C170 212 140 236 100 236C60 236 30 212 30 170Z" />
          </g>
          <rect x="33" y="116" width="134" height="14" fill="#8a67f0" />
          <ellipse cx="100" cy="172" rx="40" ry="34" fill="#c9b8ff" />
        </svg>
      </button>
    </div>
  );
}
