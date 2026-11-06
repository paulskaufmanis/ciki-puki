import React, { useEffect, useRef, useState } from "react";
import { playHighFive } from "./sound.js";

const SLAP_MS = 1100;

// Full-screen high-five prompt. onSlap() fires on the tap, onDone() shortly after, once the slap animation played.
export default function HighFive({ onSlap, onDone }) {
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
      <h2 className="highfive-title">{slapped ? "Jee! 🎉" : "Dod pieci!"}</h2>
      <button ref={btn} className={`highfive-hand${slapped ? " slapped" : ""}`} onClick={slap} aria-label="Sist piecus">
        <svg viewBox="0 0 220 220" aria-hidden="true">
          <g fill="none" stroke="#ffe066" strokeWidth="7" strokeLinecap="round">
            <path d="M24 30L38 48" /><path d="M8 70L28 76" /><path d="M196 30L182 48" /><path d="M212 70L192 76" /><path d="M110 8V26" />
          </g>
          {/* Toes first, then the palm over their bases, like a cartoon puppy paw print made of fluffy fur */}
          <g fill="#3b4053" stroke="#14151a" strokeWidth="6" strokeLinejoin="round">
            <ellipse cx="38" cy="96" rx="25" ry="32" transform="rotate(-24 38 96)" />
            <ellipse cx="82" cy="54" rx="27" ry="34" transform="rotate(-8 82 54)" />
            <ellipse cx="138" cy="54" rx="27" ry="34" transform="rotate(8 138 54)" />
            <ellipse cx="182" cy="96" rx="25" ry="32" transform="rotate(24 182 96)" />
            <path d="M110 92C158 92 188 128 180 164C174 196 146 210 110 210C74 210 46 196 40 164C32 128 62 92 110 92Z" />
          </g>
          <g fill="#fff" opacity=".16">
            <ellipse cx="72" cy="40" rx="9" ry="14" transform="rotate(-8 72 40)" /><ellipse cx="128" cy="40" rx="9" ry="14" transform="rotate(8 128 40)" />
            <ellipse cx="28" cy="84" rx="7" ry="12" transform="rotate(-24 28 84)" /><ellipse cx="192" cy="84" rx="7" ry="12" transform="rotate(24 192 84)" />
            <ellipse cx="80" cy="122" rx="20" ry="9" transform="rotate(-24 80 122)" />
          </g>
          <g fill="#ff8fb1">
            <ellipse cx="38" cy="104" rx="11" ry="14" transform="rotate(-24 38 104)" />
            <ellipse cx="82" cy="62" rx="12" ry="15" transform="rotate(-8 82 62)" />
            <ellipse cx="138" cy="62" rx="12" ry="15" transform="rotate(8 138 62)" />
            <ellipse cx="182" cy="104" rx="11" ry="14" transform="rotate(24 182 104)" />
            <path d="M110 134C88 130 70 152 82 172C90 186 100 182 110 182C120 182 130 186 138 172C150 152 132 130 110 134Z" />
          </g>
          <ellipse cx="96" cy="150" rx="9" ry="5" fill="#fff" opacity=".45" transform="rotate(-28 96 150)" />
        </svg>
      </button>
    </div>
  );
}
